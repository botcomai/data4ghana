// ============================================================
// EDGE FUNCTION: place-data-order
// Proxies a data bundle purchase to the official provider API.
//
// Official endpoint:
//   POST https://cleanheartsolutions.com/api/purchase
//   Header: X-API-Key: <key>
//   Body:   { networkKey, recipient, capacity }
//
// Official networkKey values:
//   YELLO (MTN), TELECEL, AT_PREMIUM (Ishare), AT_BIGTIME (Bigtime)
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NETWORK_KEY_MAP: Record<string, string> = {
  MTN:        "YELLO",
  YELLO:      "YELLO",
  TELECEL:    "TELECEL",
  VODAFONE:   "TELECEL",
  AIRTELTIGO: "AT_PREMIUM",
  TIGO:       "AT_PREMIUM",
  ISHARE:     "AT_PREMIUM",
  AT_PREMIUM: "AT_PREMIUM",
  BIGTIME:    "AT_BIGTIME",
  AT_BIGTIME: "AT_BIGTIME",
};

function resolveNetworkKey(network: string): string | null {
  return NETWORK_KEY_MAP[String(network).trim().toUpperCase().replace(/\s+/g, "")] ?? null;
}

function resolveCapacity(dataSize: string | number): number | null {
  const raw = String(dataSize).trim().toUpperCase().replace("GB", "").trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function resolveRecipient(phone: string): string | null {
  const digits = String(phone).replace(/\D/g, "");
  return /^0\d{9}$/.test(digits) ? digits : null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    // ── Auth: verify caller is a logged-in Supabase user ──
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // ── Parse body ──
    const body = await req.json();

    // Accept both official field names and legacy field names
    const rawNetwork  = body.networkKey ?? body.network ?? "";
    const rawPhone    = body.recipient  ?? body.phone   ?? "";
    const rawCapacity = body.capacity   ?? body.data_size ?? "";

    const networkKey = resolveNetworkKey(rawNetwork);
    const recipient  = resolveRecipient(rawPhone);
    const capacity   = resolveCapacity(rawCapacity);

    if (!networkKey) {
      return new Response(JSON.stringify({ success: false, error: `Unknown network: "${rawNetwork}". Valid values: YELLO, TELECEL, AT_PREMIUM, AT_BIGTIME` }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
    if (!recipient) {
      return new Response(JSON.stringify({ success: false, error: "Recipient must be a 10-digit number starting with 0." }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
    if (!capacity) {
      return new Response(JSON.stringify({ success: false, error: "Capacity must be a positive number (e.g. 1, 2, 5)." }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // ── Fetch API key from app_settings ──
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settingsRows } = await adminClient
      .from("app_settings")
      .select("key, value")
      .in("key", ["datarjust_api_key", "datarjust_api_enabled", "api_auto_order"]);

    const settings: Record<string, string> = {};
    (settingsRows ?? []).forEach((r: { key: string; value: string }) => { settings[r.key] = r.value; });

    if (settings["datarjust_api_enabled"] !== "true") {
      return new Response(JSON.stringify({ success: false, error: "API gateway is currently disabled." }), {
        status: 403, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // Prefer the Supabase secret; fall back to the value stored in app_settings
    const apiKey = Deno.env.get("CLEANHEART_API_KEY") || settings["datarjust_api_key"] || "";
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: "API key is not configured." }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // ── Call official provider endpoint ──
    const providerRes = await fetch("https://cleanheartsolutions.com/api/purchase", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ networkKey, recipient, capacity }),
    });

    const providerData = await providerRes.json().catch(() => ({}));

    if (!providerRes.ok || providerData?.status !== "success") {
      return new Response(JSON.stringify({
        success: false,
        error: providerData?.message ?? providerData?.error ?? "Provider rejected the order.",
        api_response: providerData,
      }), {
        status: providerRes.status,
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      data: providerData.data ?? providerData,
    }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" }
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});

// ============================================================
// EDGE FUNCTION: check-order-status
// Checks order status via official provider API.
//
// Official endpoint:
//   GET https://cleanheartsolutions.com/api/orders?reference=XXX
//   Header: X-API-Key: <key>
//
// Response:
//   { status:"success", data:{ orderId, reference, type, status, recipient, capacity } }
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    // ── Auth ──
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
    const body = await req.json().catch(() => ({}));
    const reference = String(body.reference ?? "").trim();

    if (!reference) {
      return new Response(JSON.stringify({ success: false, error: "Reference is required." }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // ── Fetch API key ──
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settingsRows } = await adminClient
      .from("app_settings")
      .select("key, value")
      .in("key", ["datarjust_api_key", "datarjust_api_enabled"]);

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
    const url = `https://cleanheartsolutions.com/api/orders?reference=${encodeURIComponent(reference)}`;
    const providerRes = await fetch(url, {
      method: "GET",
      headers: { "X-API-Key": apiKey },
    });

    const providerData = await providerRes.json().catch(() => ({}));

    if (!providerRes.ok || providerData?.status !== "success") {
      return new Response(JSON.stringify({
        success: false,
        error: providerData?.message ?? providerData?.error ?? "Could not retrieve order status.",
        api_response: providerData,
      }), {
        status: providerRes.status,
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // Optionally sync the local order status
    const orderData = providerData.data ?? {};
    if (orderData.status && reference) {
      await adminClient
        .from("orders")
        .update({ status: orderData.status })
        .eq("api_reference", reference);
    }

    return new Response(JSON.stringify({
      success: true,
      data: orderData,
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

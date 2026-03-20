// ============================================================
// EDGE FUNCTION: test-api-connection
// Admin-only: tests the provider API key by calling GET /balance
// and returns the wallet balance on success.
//
// Official endpoint:
//   GET https://cleanheartsolutions.com/api/balance
//   Header: X-API-Key: <key>
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
    // ── Auth: admin only ──
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

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile } = await adminClient
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ success: false, error: "Admin access required." }), {
        status: 403, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // ── Accept api_key from body (the UI passes the unsaved draft key for testing) ──
    const body = await req.json().catch(() => ({}));
    let apiKey = String(body.api_key ?? "").trim();

    // Fall back to env secret, then stored DB value, if no draft key supplied
    if (!apiKey) {
      apiKey = Deno.env.get("CLEANHEART_API_KEY") || "";
    }
    if (!apiKey) {
      const { data: rows } = await adminClient
        .from("app_settings")
        .select("value")
        .eq("key", "datarjust_api_key")
        .single();
      apiKey = rows?.value ?? "";
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: "No API key provided or configured." }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // ── Hit the official balance endpoint ──
    const providerRes = await fetch("https://cleanheartsolutions.com/api/balance", {
      method: "GET",
      headers: { "X-API-Key": apiKey },
    });

    const providerData = await providerRes.json().catch(() => ({}));

    if (!providerRes.ok || providerData?.status !== "success") {
      return new Response(JSON.stringify({
        success: false,
        error: providerData?.message ?? providerData?.error ?? "API key rejected by provider.",
        api_response: providerData,
      }), {
        status: providerRes.status,
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    const balanceData = providerData.data ?? {};
    return new Response(JSON.stringify({
      success: true,
      message: `Connection successful. Wallet balance: GHS ${Number(balanceData.rawBalance ?? 0).toFixed(2)}`,
      data: balanceData,
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

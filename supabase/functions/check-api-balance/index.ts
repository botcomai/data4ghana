// ============================================================
// EDGE FUNCTION: check-api-balance
// Fetches the provider wallet balance.
//
// Official endpoint:
//   GET https://cleanheartsolutions.com/api/balance
//   Header: X-API-Key: <key>
//
// Response:
//   { status:"success", data:{ balance, rawBalance, currency } }
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

    // ── Verify admin role ──
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

    // ── Fetch API key ──
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
    const providerRes = await fetch("https://cleanheartsolutions.com/api/balance", {
      method: "GET",
      headers: { "X-API-Key": apiKey },
    });

    const providerData = await providerRes.json().catch(() => ({}));

    if (!providerRes.ok || providerData?.status !== "success") {
      return new Response(JSON.stringify({
        success: false,
        error: providerData?.message ?? providerData?.error ?? "Failed to fetch balance.",
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

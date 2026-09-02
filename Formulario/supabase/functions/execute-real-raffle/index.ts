import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase server configuration is incomplete");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const productionOrigins = new Set([
  "https://crm.visualed-ec.com",
  "https://visualed-ec.com",
  "https://www.visualed-ec.com"
]);

function isAllowedOrigin(origin: string): boolean {
  if (productionOrigins.has(origin) || origin === "null") return true;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function responseHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "https://crm.visualed-ec.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version, x-retry-count, traceparent, tracestate, baggage",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Content-Type": "application/json",
    "Vary": "Origin"
  };
}

function json(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(request) });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: responseHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return json(request, { error: "Unauthorized" }, 401);

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json(request, { error: "Unauthorized" }, 401);

  const { data: member, error: memberError } = await admin
    .from("crm_members")
    .select("role, active")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (memberError || !member?.active || !["admin", "agent"].includes(member.role)) {
    return json(request, { error: "Forbidden" }, 403);
  }

  let payload: { coupon_percent?: unknown; request_id?: unknown } = {};
  try {
    payload = await request.json();
  } catch {
    return json(request, { error: "Invalid request" }, 400);
  }

  const coupon = payload.coupon_percent === null || payload.coupon_percent === undefined
    ? null
    : Number(payload.coupon_percent);
  if (coupon !== null && ![10, 15, 20].includes(coupon)) {
    return json(request, { error: "Invalid request" }, 400);
  }

  const requestId = typeof payload.request_id === "string" && /^[0-9a-f-]{36}$/i.test(payload.request_id)
    ? payload.request_id
    : crypto.randomUUID();

  const { data, error } = await admin.rpc("execute_real_raffle", {
    p_executed_by: userData.user.id,
    p_coupon_percent: coupon,
    p_request_id: requestId
  });

  if (error || !data?.winner) {
    console.error("execute-real-raffle failed", error?.code || "unknown", error?.message || "winner missing");
    return json(request, { error: "No pudimos preparar el sorteo." }, 400);
  }

  return json(request, data);
});

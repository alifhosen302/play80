const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, message: string) =>
  Response.json({ message }, { status, headers: { ...cors, "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply(405, "POST required");
  const authorization = req.headers.get("Authorization");
  if (!authorization) return reply(401, "Sign in first");
  const body = await req.json().catch(() => null);
  if (!body || typeof body.pin_token !== "string") return reply(400, "Owner action PIN required");
  const base = Deno.env.get("SUPABASE_URL")!;
  const publicHeaders = { apikey: Deno.env.get("SUPABASE_ANON_KEY")!, "Content-Type": "application/json" };
  const allowed = await fetch(base + "/rest/v1/rpc/play80_authorize_dsr_creation", {
    method: "POST", headers: { ...publicHeaders, Authorization: authorization },
    body: JSON.stringify({ p_pin_token: body.pin_token }),
  });
  if (!allowed.ok || (await allowed.json()) !== true) return reply(403, "Owner login and valid action PIN required");
  const { email, username, phone_number, full_name, address, pin } = body;
  if (![email, username, phone_number, full_name, address, pin].every(v => typeof v === "string") ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[0-9]{6}$/.test(pin) ||
      !/^[a-z0-9_]{3,24}$/.test(username) || !/^\+?[0-9]{10,15}$/.test(phone_number) ||
      full_name.trim().length < 3 || full_name.length > 100 || address.trim().length < 8 || address.length > 250)
    return reply(400, "ইমেইল, User ID, মোবাইল, পূর্ণ নাম, ঠিকানা ও ছয় সংখ্যার PIN যাচাই করো।");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const created = await fetch(base + "/auth/v1/admin/users", {
    method: "POST", headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pin, email_confirm: false, app_metadata: { role: "dsr" },
      user_metadata: { username, phone_number, full_name, display_name: full_name, address } }),
  });
  if (!created.ok) return reply(400, "অ্যাকাউন্ট তৈরি হয়নি। ইমেইল বা User ID আগে ব্যবহৃত হয়েছে কি না দেখো।");
  const sent = await fetch(base + "/auth/v1/resend", { method: "POST", headers: publicHeaders,
    body: JSON.stringify({ type: "signup", email }) }).catch(() => null);
  return reply(201, sent?.ok ? "DSR তৈরি হয়েছে। ইমেইল যাচাই করে লগইন করো।" :
    "DSR তৈরি হয়েছে। লগইন স্ক্রিন থেকে যাচাই ইমেইল আবার পাঠাও।");
});

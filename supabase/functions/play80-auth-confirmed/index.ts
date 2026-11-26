// Destination for Supabase email-auth redirects. Authentication stays in the PLAY80 app.
const instructions = `PLAY80 · ইমেইল যাচাই

PLAY80 অ্যাপে ফিরে SIGN IN-এ তোমার ইমেইল ও PIN দিয়ে লগইন করো।
অ্যাকাউন্ট আগে থেকেই তৈরি থাকলে আবার SIGN UP দিতে হবে না।
অ্যাপ ইমেইল যাচাই করতে বললে, SIGN IN স্ক্রিন থেকে যাচাই ইমেইল আবার পাঠিয়ে সর্বশেষ লিংকটি খোলো।
PIN রিসেট করতে চাইলে ইমেইলের রিসেট লিংকটি কপি করে PLAY80-এর PIN রিসেট ফর্মে বসাও।
`;

Deno.serve((req: Request) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  return new Response(req.method === "HEAD" ? null : instructions, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

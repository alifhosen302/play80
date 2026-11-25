// PLAY80 public HTTPS landing page for Supabase Auth email confirmations.
// The verification itself happens at /auth/v1/verify before Supabase redirects here.
// Do not fetch or store URL fragments containing temporary auth tokens.
Deno.serve((req: Request) => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", {status:405,headers:{"Allow":"GET, HEAD"}});
  const html = `<!doctype html><html lang="bn"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PLAY80 — Email Verification</title>
<meta name="referrer" content="no-referrer">
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{min-height:100dvh;margin:0;padding:24px;background:radial-gradient(circle at top,#48216e,#101126 62%,#090b18);color:#fff;font-family:system-ui,-apple-system,sans-serif;display:grid;place-items:center}
main{max-width:470px;width:100%;border:1px solid #a17ecb;border-radius:24px;padding:30px 24px;background:#19172ecf;box-shadow:0 12px 40px #08051599;text-align:center}
.mark{font-size:58px;margin-bottom:12px}.brand{font-size:31px;font-weight:900;color:#f8d183}.brand span{color:#c69bff}h1{font-size:23px;margin:20px 0 8px}.msg{line-height:1.8;color:#e4def5}.hint{border:1px solid #7f67a8;background:#2a2247;border-radius:12px;padding:14px;margin-top:22px;font-size:14px;line-height:1.8}small{display:block;margin-top:18px;color:#aaa7bf}
</style>
<script>if(location.hash){history.replaceState(null,'',location.pathname);}</script>
</head><body><main><div class="mark">✅</div><div class="brand">PLAY<span>80</span></div>
<h1>ইমেইল যাচাই সম্পন্ন</h1><p class="msg">তোমার ইমেইল কনফার্ম করার পর তুমি এখানে এসেছ। এখন PLAY80 অ্যাপে ফিরে যাও এবং ইমেইল ও ৬ সংখ্যার PIN দিয়ে লগইন করো।</p>
<div class="hint"><b>Next step:</b> PLAY80 → Player Login / Owner Login → Email + PIN<br>পুনরায় Create Account চাপতে হবে না।</div>
<small>PLAY80 একটি বিনামূল্যের গেমিং প্ল্যাটফর্ম। ভার্চুয়াল কয়েনের নগদ মূল্য নেই।</small></main></body></html>`;
  return new Response(req.method==="HEAD"?null:html,{status:200,headers:{
    "Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store, max-age=0",
    "Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff",
    "X-Frame-Options":"DENY","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
  }});
});
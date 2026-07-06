const URL = "https://rogesnduejmqpxolhbif.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvZ2VzbmR1ZWptcXB4b2xoYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDIxNzUsImV4cCI6MjA4OTYxODE3NX0.CIjUhlSqqkx6YdSFON4JSDy-ggqrWXpOdvTKLT_1Hkw";
const a = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "test-advisor@cosmecheck.test", password: "Test123456!" }),
});
const { access_token } = await a.json();
async function call(msg) {
  const r = await fetch(`${URL}/functions/v1/advisor-agent`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ charge: true, messages: [{ role: "user", content: msg }] }),
  });
  return { status: r.status, body: await r.json() };
}
const reco = await call("un bon shampoing pour cheveux gras");
console.log("RECO:", reco.status, "creditsCharged=", reco.body.creditsCharged, "produits=", (reco.body.products || []).length);
const info = await call("c'est quoi la niacinamide ?");
console.log("INFO:", info.status, "creditsCharged=", info.body.creditsCharged, "produits=", (info.body.products || []).length);

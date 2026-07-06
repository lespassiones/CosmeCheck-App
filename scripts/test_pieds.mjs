const BASE = "https://rogesnduejmqpxolhbif.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvZ2VzbmR1ZWptcXB4b2xoYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDIxNzUsImV4cCI6MjA4OTYxODE3NX0.CIjUhlSqqkx6YdSFON4JSDy-ggqrWXpOdvTKLT_1Hkw";
const a = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "test-advisor@cosmecheck.test", password: "Test123456!" }),
});
const { access_token } = await a.json();
const r = await fetch(`${BASE}/functions/v1/advisor-agent`, {
  method: "POST",
  headers: { apikey: ANON, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ charge: false, messages: [{ role: "user", content: "De plus je pue des pieds enormement peu imported si je met des chausettes ou pas, tu me conseilles quoi" }] }),
});
const d = await r.json();
console.log("searches=" + d.searches);
console.log("REPLY:\n" + d.reply);
console.log("PRODUITS (" + (d.products || []).length + "):");
for (const p of d.products || []) console.log("  - " + `${p.brand ?? ""} ${p.name ?? ""}`.trim() + ` [${p.score}]`);

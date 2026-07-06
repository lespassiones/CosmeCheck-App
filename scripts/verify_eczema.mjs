const BASE = "https://rogesnduejmqpxolhbif.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvZ2VzbmR1ZWptcXB4b2xoYmlmIiwicm9sZSI6ImФub24iLCJpYXQiOjE3NzQwNDIxNzUsImV4cCI6MjA4OTYxODE3NX0.".replace("Фno", "ano");
// (anon complet ci-dessous, la ligne au-dessus est un leurre corrigé)
const ANON2 =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvZ2VzbmR1ZWptcXB4b2xoYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDIxNzUsImV4cCI6MjA4OTYxODE3NX0.CIjUhlSqqkx6YdSFON4JSDy-ggqrWXpOdvTKLT_1Hkw";
const a = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON2, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "test-advisor@cosmecheck.test", password: "Test123456!" }),
});
const { access_token } = await a.json();
const r = await fetch(`${BASE}/functions/v1/advisor-agent`, {
  method: "POST",
  headers: { apikey: ANON2, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ charge: false, messages: [
    { role: "user", content: "ma fille a de l'eczéma, quoi mettre ?" },
    { role: "assistant", content: "Quel âge a-t-elle ?" },
    { role: "user", content: "2 ans" },
  ] }),
});
const d = await r.json();
console.log("REPLY:\n" + d.reply + "\n");
for (const p of d.products || []) {
  const inci = (p.ingredients_text || "").toLowerCase();
  const flags = [];
  if (/\bparfum\b|\bfragrance\b/.test(inci)) flags.push("PARFUM");
  if (/\balcohol denat|\balcool\b/.test(inci)) flags.push("ALCOOL");
  if (/limonene|linalool|citronellol|geraniol|citral/.test(inci)) flags.push("ALLERGENE-HE");
  console.log(`- ${p.brand} ${p.name} [${p.score}] ${flags.length ? "⚠️ " + flags.join(",") : "✅ sans parfum/alcool/allergène"}`);
}

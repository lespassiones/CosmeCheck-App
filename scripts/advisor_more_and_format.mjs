const URL = "https://rogesnduejmqpxolhbif.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvZ2VzbmR1ZWptcXB4b2xoYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDIxNzUsImV4cCI6MjA4OTYxODE3NX0.CIjUhlSqqkx6YdSFON4JSDy-ggqrWXpOdvTKLT_1Hkw";
const a = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "test-advisor@cosmecheck.test", password: "Test123456!" }),
});
const { access_token } = await a.json();
async function ask(msgs, seen = []) {
  const r = await fetch(`${URL}/functions/v1/advisor-agent`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ charge: false, messages: msgs, seen_eans: seen }),
  });
  return r.json();
}
const MSG = "j'ai des boutons noir sur le visage, tu me conseilles quoi ?";
const r1 = await ask([{ role: "user", content: MSG }]);
const eans1 = (r1.products || []).map((p) => p.ean);
console.log("=== APPEL 1 ===");
console.log("REPLY:\n" + r1.reply);
console.log(`\nMots: ${(r1.reply || "").split(/\s+/).length} | puces: ${((r1.reply||"").match(/^\s*[-•]/gm)||[]).length} | gras: ${((r1.reply||"").match(/\*\*/g)||[]).length/2}`);
console.log("PRODUITS (" + eans1.length + "): " + (r1.products||[]).map((p)=>`${p.brand} ${p.name}`.slice(0,40)).join(" | "));

const r2 = await ask([
  { role: "user", content: MSG },
  { role: "assistant", content: r1.reply },
  { role: "user", content: "montre m'en d'autres" },
], eans1);
const eans2 = (r2.products || []).map((p) => p.ean);
const overlap = eans2.filter((e) => eans1.includes(e));
console.log("\n=== APPEL 2 (montre m'en d'autres, seen=appel1) ===");
console.log("searches=" + r2.searches + " | REPLY:\n" + r2.reply);
console.log("PRODUITS (" + eans2.length + "): " + (r2.products||[]).map((p)=>`${p.brand} ${p.name}`.slice(0,40)).join(" | "));
console.log("CHEVAUCHEMENT avec appel 1: " + overlap.length + (overlap.length === 0 ? " ✅ tous nouveaux" : " ⚠️ répétitions: " + overlap.join(",")));

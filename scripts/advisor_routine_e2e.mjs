// Usage : node --env-file=.env scripts/advisor_routine_e2e.mjs  (ONLY_EF=1 : seulement crédits + routine vide)
// Test éphémère de advisor-agent DÉPLOYÉ : compte jetable + routine, vraies
// requêtes (bloquant + streaming comme l'app), puis suppression complète.
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FN = `${URL}/functions/v1/advisor-agent`;
const SVC = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const CC = { ...SVC, "Content-Profile": "cosme_check", "Accept-Profile": "cosme_check", Prefer: "return=representation" };

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "✓" : "✗"} ${name}${detail ? "  " + detail : ""}`); };
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const ASKS_LIST = /envoie|liste (exacte|de tes produits|complete)|indique[- ]?(moi)? .*(matin|soir)|quels produits (utilises|as)[- ]tu/i;

async function j(r) { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } }
async function rest(method, path, body) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { method, headers: CC, body: body ? JSON.stringify(body) : undefined });
  const data = await j(r);
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(data)}`);
  return data;
}

const stamp = Date.now();
const email = `advisor-test-${stamp}@cosme-check.com`;
const password = `T!${crypto.randomUUID()}`;
let userId = null;

async function ask(token, content, { admin = true, charge = false, stream = false, adminKey = KEY } = {}) {
  const headers = { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  if (admin) headers["x-admin-key"] = adminKey;
  const body = { messages: [{ role: "user", content }], seen_eans: [] };
  if (!charge) body.charge = false;
  if (stream) body.stream = true;
  const t0 = Date.now();
  const r = await fetch(FN, { method: "POST", headers, body: JSON.stringify(body) });
  if (!stream) {
    const d = await j(r);
    if (r.status !== 200) console.log(`   [HTTP ${r.status}] ${JSON.stringify(d).slice(0, 300)}`);
    return { status: r.status, ms: Date.now() - t0, ...(typeof d === "object" ? d : { raw: d }) };
  }
  const text = await r.text();
  const events = text.split("\n\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6)));
  const res = events.find((e) => e.type === "result") ?? {};
  return { status: r.status, ms: Date.now() - t0, statuses: events.filter((e) => e.type === "status").map((e) => e.step), ...res };
}

const ROUTINE = [
  { a: { product_label: "Special Cleansing Gel", brand: "Dermalogica", product_type: "Nettoyant visage", score: 11.8 }, kind: "routine", tod: "evening" },
  { a: { product_label: "Crème Hydratante Riche", brand: "Nivea", product_type: "Crème visage", score: 6.5 }, kind: "routine", tod: "morning", tags: ["parfum-synthese", "allergene"] },
  { a: { product_label: "Sérum Niacinamide 10% + Zinc", brand: "The Ordinary", product_type: "Sérum visage", score: 17.2 }, kind: "routine", tod: "morning" },
  { a: { product_label: "Déodorant Roll-on Anti-transpirant", brand: "Triple Dry", product_type: "Déodorant", score: 0.8 }, kind: "staple", tod: "morning" },
  { a: { product_label: "Dentifrice Menthe Fraîche", brand: "Signal", product_type: "Dentifrice", score: 14 }, kind: "staple", tod: "morning" },
];
const mentions = (reply) => ROUTINE.filter((it) => norm(reply).includes(norm(it.a.brand)) || norm(reply).includes(norm(it.a.product_label).split(" ").slice(0, 2).join(" ")));

try {
  // ── Compte jetable ──
  const created = await j(await fetch(`${URL}/auth/v1/admin/users`, { method: "POST", headers: SVC, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { first_name: "test" } }) }));
  userId = created.id;
  if (!userId) throw new Error("création compte : " + JSON.stringify(created));
  console.log(`Compte jetable ${email} (${userId})`);
  // Profil (le trigger l'a créé) : prénom + peau grasse.
  await rest("PATCH", `user_profiles?id=eq.${userId}`, { first_name: "camille", preferences: { skin: { skinTypeFace: "grasse", skinTypeBody: "normale" }, onboardingShown: true } });
  // Routine : analyses + routine_items.
  let pos = 0;
  for (const it of ROUTINE) {
    const [an] = await rest("POST", "analyses", { user_id: userId, input_text: "aqua, glycerin", name: it.a.product_label, ...it.a, result_json: { items: [{ tags: it.tags ?? [] }] } });
    await rest("POST", "routine_items", { user_id: userId, analysis_id: an.id, frequency: "daily", time_of_day: it.tod, kind: it.kind, position: pos++ });
  }
  const tok = await j(await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }));
  const token = tok.access_token;
  if (!token) throw new Error("connexion : " + JSON.stringify(tok));
  console.log(`Routine de ${ROUTINE.length} produits créée, connecté.\n`);

  let r;
  if (!process.env.ONLY_EF) {
  // ── A. Avis sur la routine (bloquant) ──
  r = await ask(token, "Que penses-tu de ma routine ?");
  check("A. avis routine : HTTP 200", r.status === 200, `(${(r.ms / 1000).toFixed(1)} s)`);
  check("A. ne redemande pas la liste", !ASKS_LIST.test(r.reply ?? ""));
  check("A. cite ≥ 2 produits de sa routine", mentions(r.reply ?? "").length >= 2, mentions(r.reply ?? "").map((m) => m.a.brand).join(", "));
  check("A. signale la crème Nivea (6,5/20) ou le déo Triple Dry (0,8/20)", /nivea|cr[eè]me hydratante|triple dry|6[,.]5|0[,.]8/i.test(r.reply ?? ""));
  check("A. vraie clé service : charge:false respecté (0 crédit)", r.creditsCharged === 0, `creditsCharged=${r.creditsCharged}`);
  check("A. pas de lignes vides en fin de réponse", (r.reply ?? "") === (r.reply ?? "").trim());
  check("A. prénom avec majuscule", !/\bcamille\b/.test(r.reply ?? ""));
  console.log("   " + (r.reply ?? JSON.stringify(r)).replace(/\n/g, "\n   ") + "\n");

  // ── B. Priorité, en STREAMING comme l'app ──
  r = await ask(token, "Quel produit je devrais remplacer en priorité ?", { stream: true });
  check("B. streaming : événements de statut + résultat", r.status === 200 && r.statuses?.length > 0 && typeof r.reply === "string", `statuts: ${r.statuses?.join(" › ")} (${(r.ms / 1000).toFixed(1)} s)`);
  check("B. nomme un produit à remplacer", /nivea|cr[eè]me hydratante|triple dry|d[ée]odorant/i.test(r.reply ?? ""));
  check("B. ne redemande pas la liste", !ASKS_LIST.test(r.reply ?? ""));
  console.log("   " + (r.reply ?? "").replace(/\n/g, "\n   ") + "\n");

  // ── C. Manque le matin ──
  r = await ask(token, "Il me manque quelque chose le matin ?");
  check("C. repère l'absence de protection solaire", /solaire|spf|uv/i.test(r.reply ?? ""));
  console.log("   " + (r.reply ?? "").replace(/\n/g, "\n   ") + "\n");

  // ── D. Recherche produit (non-régression) ──
  r = await ask(token, "Propose-moi un meilleur déodorant que le mien");
  check("D. propose des produits", (r.products?.length ?? 0) > 0, `${r.products?.length ?? 0} produits, ${r.searches} recherche(s)`);
  check("D. aucun produit Triple Dry reproposé", !(r.products ?? []).some((p) => /triple dry/i.test(`${p.brand} ${p.name}`)));

  }
  // ── E. Sécurité : x-admin-key forgé → charge:false ignoré, crédit débité ──
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const forged = `${b64({ alg: "none", typ: "JWT" })}.${b64({ role: "service_role", ref: "rogesnduejmqpxolhbif" })}.x`;
  r = await ask(token, "Merci !", { adminKey: forged });
  check("E. x-admin-key forgé : crédit quand même débité", r.creditsCharged >= 1, `creditsCharged=${r.creditsCharged}`);
  r = await ask(token, "Merci beaucoup", {});
  check("E. vraie clé service : charge:false respecté", r.creditsCharged === 0, `creditsCharged=${r.creditsCharged}`);

  // ── F. Routine vide ──
  await rest("DELETE", `routine_items?user_id=eq.${userId}`);
  r = await ask(token, "Que penses-tu de ma routine ?");
  check("F. routine vide : le dit, sans redemander la liste", /vide|aucune? (produit|routine)|onglet routine|ajoute/i.test(r.reply ?? "") && !ASKS_LIST.test(r.reply ?? ""));
  console.log("   " + (r.reply ?? "").replace(/\n/g, "\n   ") + "\n");
} catch (e) {
  check("exécution sans erreur", false, String(e.message ?? e));
} finally {
  // ── Nettoyage complet ──
  if (userId) {
    for (const t of ["routine_items", "analyses", "user_credits", "user_profiles"]) {
      await fetch(`${URL}/rest/v1/${t}?${t === "user_profiles" ? "id" : "user_id"}=eq.${userId}`, { method: "DELETE", headers: CC }).catch(() => {});
    }
    const del = await fetch(`${URL}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: SVC });
    const left = [];
    for (const t of ["routine_items", "analyses", "user_credits", "user_profiles"]) {
      const rows = await rest("GET", `${t}?select=*&${t === "user_profiles" ? "id" : "user_id"}=eq.${userId}`).catch(() => []);
      if (rows.length) left.push(`${t}:${rows.length}`);
    }
    const au = await fetch(`${URL}/auth/v1/admin/users/${userId}`, { headers: SVC });
    console.log(`\nNettoyage : compte auth supprimé (HTTP ${del.status}, relecture ${au.status}), restes en base : ${left.length ? left.join(", ") : "aucun"}`);
  }
  const ko = results.filter((x) => !x).length;
  console.log(ko ? `\n${ko} échec(s) sur ${results.length}` : `\nTout est OK (${results.length} vérifications)`);
}

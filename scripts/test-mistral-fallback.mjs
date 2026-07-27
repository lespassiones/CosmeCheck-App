/**
 * Teste que le FALLBACK Mistral produit une sortie EXPLOITABLE pour les 2
 * fonctions (mode JSON + vraie tâche). Usage : node --env-file=.env scripts/test-mistral-fallback.mjs
 */
const K = process.env.MISTRAL_API_KEY;

async function mistralJson(system, user) {
  const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${K}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "mistral-small-latest", temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  const j = await r.json();
  return { status: r.status, content: j.choices?.[0]?.message?.content ?? null };
}

(async () => {
  // --- Fallback promesse-identify (dégradé, sans web search) ---
  const sysId = 'Tu identifies des produits cosmétiques à partir d\'un nom/marque et d\'une liste INCI. Réponds UNIQUEMENT en JSON strict : {"notFound": false, "candidates": [{"name":"...","brand":"...","productType":"...","sourceUrl":"https://...","confidence":0.9}]} ou {"notFound": true, "reason":"..."}.';
  const usrId = "Nom : Sensibio H2O\nMarque : Bioderma\nINCI : Aqua, PEG-6 Caprylic/Capric Glycerides, Cucumis Sativus Extract, Mannitol, Xylitol, Rhamnose, Fructooligosaccharides, Propylene Glycol, Disodium EDTA, Cetrimonium Bromide. Identifie le produit.";
  const id = await mistralJson(sysId, usrId);
  let idOk = false, idInfo = "";
  try { const p = JSON.parse(id.content); idOk = typeof p.notFound === "boolean"; idInfo = `notFound=${p.notFound}, candidats=${(p.candidates || []).length}`; } catch (e) { idInfo = "JSON invalide: " + e.message; }
  console.log(`[promesse-identify fallback] HTTP ${id.status} → JSON ${idOk ? "OK ✅" : "KO ❌"}  (${idInfo})`);

  // --- Fallback personal-insights (3 blocs) ---
  const sysPi = 'Tu génères 3 encarts perso pour un produit cosmétique. Réponds UNIQUEMENT en JSON : {"goals":{"title":"...","description":"...","tone":"vert"},"skin":{"title":"...","description":"...","tone":"neutre"},"watch":{"title":"...","description":"...","tone":"ambre"}}.';
  const usrPi = "Profil : peau sensible, objectif hydratation. INCI : Aqua, Glycerin, Niacinamide, Sodium Hyaluronate, Phenoxyethanol, Parfum. Génère les 3 blocs.";
  const pi = await mistralJson(sysPi, usrPi);
  let piOk = false, piInfo = "";
  try { const p = JSON.parse(pi.content); piOk = !!(p.goals && p.skin && p.watch); piInfo = piOk ? "goals+skin+watch présents" : "blocs manquants"; } catch (e) { piInfo = "JSON invalide: " + e.message; }
  console.log(`[personal-insights fallback] HTTP ${pi.status} → JSON ${piOk ? "OK ✅" : "KO ❌"}  (${piInfo})`);

  console.log(`\n=> Fallback Mistral EXPLOITABLE pour les 2 fonctions : ${idOk && piOk ? "OUI ✅" : "à revoir ❌"}`);
})();

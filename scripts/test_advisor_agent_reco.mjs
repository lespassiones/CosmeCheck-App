/**
 * Beauty Advisor AGENT — test E2E ciblé recommandations (edge `advisor-agent`).
 *
 * Reproduit le bug du 12 juil 2026 : « mauvaise haleine » → 0 produit alors que
 * le catalogue contient 2301 bains de bouche (synonyme bouche→levres dans la
 * RPC cosme_check_recommend_products, corrigé en v21).
 *
 * Crée un utilisateur test au profil proche du compte réel (visage grasse,
 * corps très sèche, restrictions sulfate/silicone/…), appelle l'edge déployée
 * avec charge:false (0 crédit), vérifie que des produits pertinents reviennent.
 *
 * Usage: node scripts/test_advisor_agent_reco.mjs
 */

import 'dotenv/config';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) throw new Error('.env incomplet');

const G = '\x1b[32m', R = '\x1b[31m', C = '\x1b[36m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';
const ok = (m) => console.log(`  ${G}✓${X} ${m}`);
const ko = (m) => console.log(`  ${R}✗${X} ${m}`);
const info = (m) => console.log(`  ${C}·${X} ${m}`);

let failures = 0;
function expect(cond, label, note = '') {
  if (cond) ok(label + (note ? ` ${D}(${note})${X}` : ''));
  else { ko(label + (note ? ` — ${note}` : '')); failures++; }
}

async function signUp(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  return r.json();
}
async function signIn(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  return r.json();
}
async function deleteUser(userId) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
}
async function setProfile(userId) {
  // Profil proche du compte réel qui a déclenché le bug (Brian).
  const r = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Accept-Profile': 'cosme_check',
      'Content-Profile': 'cosme_check',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      first_name: 'TestReco',
      preferences: {
        skin: { skinTypeFace: 'grasse', skinTypeBody: 'tres_seche', concerns: [], goals: [] },
        onboardingShown: true,
        restrictions: {
          families: ['sulfate', 'silicone', 'ethoxyle', 'paraben', 'propoxyle'],
          ingredients: [
            { name: 'ALUMINUM CHLOROHYDRATE', slug: 'aluminum-chlorohydrate' },
            { name: 'DIMETHICONOL', slug: 'dimethiconol' },
          ],
        },
      },
    }),
  });
  return r.status;
}

/** Appelle l'edge advisor-agent (charge:false → 0 crédit débité). */
async function askAgent(messages, token, seenEans = []) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/advisor-agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ messages, seen_eans: seenEans, charge: false }),
  });
  if (!r.ok) throw new Error(`advisor-agent ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

const lastSeg = (cat) => (cat ?? '').split('/').pop();

(async () => {
  console.log(`\n${B}=== Advisor AGENT — E2E recommandations (post-fix v21) ===${X}`);
  const email = `agent_reco_${Date.now()}@cosmecheck.test`;
  const pass = `Ts!${Date.now().toString(36)}_reco`;
  let userId = null;

  try {
    const su = await signUp(email, pass);
    userId = su.user?.id ?? su.id;
    const si = await signIn(email, pass);
    const token = si.access_token;
    if (!userId || !token) throw new Error('setup auth failed');
    await setProfile(userId);
    info(`user test: ${userId}`);

    // ── Scénario 1 : mauvaise haleine (le bug d'origine) ──────────────────
    console.log(`\n${B}[1] « j'ai tout le temps la mauvaise haleine tu me conseilles quoi ? »${X}`);
    const r1 = await askAgent(
      [{ role: 'user', content: "j'ai tout le temps la mauvaise haleine tu me conseilles quoi ?" }],
      token,
    );
    info(`reply: ${r1.reply.slice(0, 140).replace(/\n/g, ' ')}`);
    info(`products: ${r1.products.length} | searches: ${r1.searches}`);
    const cats1 = [...new Set(r1.products.map((p) => lastSeg(p.category)))];
    expect(r1.products.length >= 5, `≥5 produits recommandés`, `${r1.products.length} produits`);
    expect(
      r1.products.length > 0 && r1.products.every((p) => /bouche|haleine|dentifrice|dentaire/.test(lastSeg(p.category))),
      'Tous les produits sont bucco-dentaires',
      cats1.join(', ') || 'aucun',
    );
    expect(r1.products.every((p) => p.score >= 13), 'Tous score ≥ 13 (zone verte)');

    // ── Scénario 2 : follow-up « Recommandes moi les produits » ───────────
    console.log(`\n${B}[2] Follow-up « Recommandes moi les produits »${X}`);
    const r2 = await askAgent(
      [
        { role: 'user', content: "j'ai tout le temps la mauvaise haleine tu me conseilles quoi ?" },
        { role: 'assistant', content: r1.reply },
        { role: 'user', content: 'Recommandes moi les produits' },
      ],
      token,
      r1.products.map((p) => p.ean),
    );
    info(`reply: ${r2.reply.slice(0, 140).replace(/\n/g, ' ')}`);
    info(`products: ${r2.products.length}`);
    expect(r2.products.length >= 1, 'Produits sur le follow-up', `${r2.products.length}`);
    const dup = r2.products.filter((p) => r1.products.some((q) => q.ean === p.ean));
    expect(dup.length === 0, 'Aucun doublon avec le tour précédent (seen_eans)', `${dup.length} doublons`);

    // ── Scénario 3 : le prompt du bouton « Montre-moi des recommandations » ─
    console.log(`\n${B}[3] Prompt du bouton (après une réponse info sans reco)${X}`);
    const r3 = await askAgent(
      [
        { role: 'user', content: 'est-ce que les silicones sont mauvais pour les cheveux ?' },
        { role: 'assistant', content: 'Les silicones ne sont pas dangereux, mais ils peuvent alourdir les cheveux et créer un effet « cache-misère ». **Alternatives** : privilégier des soins sans silicone.' },
        { role: 'user', content: 'Montre-moi des produits recommandés adaptés à ma demande.' },
      ],
      token,
    );
    info(`reply: ${r3.reply.slice(0, 140).replace(/\n/g, ' ')}`);
    info(`products: ${r3.products.length} | cats: ${[...new Set(r3.products.map((p) => lastSeg(p.category)))].join(', ')}`);
    expect(r3.products.length >= 1, 'Le bouton reco déclenche bien des produits', `${r3.products.length}`);

    console.log(`\n${B}${failures === 0 ? G + 'TOUS LES TESTS PASSENT' : R + failures + ' échec(s)'}${X}\n`);
    process.exitCode = failures === 0 ? 0 : 1;
  } catch (err) {
    ko(`Fatal: ${err.message}`);
    process.exitCode = 1;
  } finally {
    if (userId) { await deleteUser(userId); info('user test supprimé'); }
  }
})();

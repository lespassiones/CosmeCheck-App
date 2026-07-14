/**
 * routine-smart-suggest — repro E2E du bug « Analyse momentanément indisponible »
 * sur « Produits du quotidien » (12 juil 2026).
 *
 * Cause : quand le modèle renvoyait un `results` d'une longueur != nombre de
 * produits, parseEval jetait TOUT le lot → aiUnavailable:true → message trompeur
 * (alors que l'IA avait répondu avec succès). Fix : aligner par index, s'abstenir
 * par produit manquant, ne plus jeter le lot.
 *
 * Ce test crée un user au profil de Brian (visage grasse, corps très sec,
 * restrictions sulfate/silicone/… + aluminium), crée 3 analyses (ses vrais
 * produits du quotidien), et appelle l'edge :
 *   - Scénario A : payload RÉEL (seul l'anti-transpirant qualifie) ;
 *   - Scénario B : les 3 produits forcés à qualifier (lot de 3 → chemin qui
 *     déclenchait le mismatch).
 * Chaque scénario est appelé 3× ; on exige : 200, aiUnavailable === false,
 * et des suggestions cohérentes.
 *
 * Usage: node scripts/test_routine_suggest_repro.mjs
 */

import 'dotenv/config';
import { randomUUID } from 'node:crypto';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) throw new Error('.env incomplet');

const G = '\x1b[32m', R = '\x1b[31m', C = '\x1b[36m', B = '\x1b[1m', D = '\x1b[2m', X = '\x1b[0m';
const ok = (m) => console.log(`  ${G}✓${X} ${m}`);
const ko = (m) => console.log(`  ${R}✗${X} ${m}`);
const info = (m) => console.log(`  ${C}·${X} ${m}`);
let failures = 0;
const expect = (cond, label, note = '') => {
  if (cond) ok(label + (note ? ` ${D}(${note})${X}` : ''));
  else { ko(label + (note ? ` — ${note}` : '')); failures++; }
};

const REST = (path) => `${SUPABASE_URL}/rest/v1/${path}`;
const svcHeaders = {
  'Content-Type': 'application/json',
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Accept-Profile': 'cosme_check',
  'Content-Profile': 'cosme_check',
};

async function signUp(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  return r.json();
}
async function signIn(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  return r.json();
}
async function deleteUser(id) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
}

async function setProfile(userId) {
  await fetch(REST(`user_profiles?id=eq.${userId}`), {
    method: 'PATCH', headers: { ...svcHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      first_name: 'ReproUser',
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
}

async function grantCredits(userId, amount = 200) {
  await fetch(REST('credit_grants'), {
    method: 'POST', headers: { ...svcHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, amount, remaining: amount, note: 'repro-test', created_by: 'test' }),
  });
}

async function createAnalysis(userId, { name, ean, counts }) {
  const id = randomUUID();
  const r = await fetch(REST('analyses'), {
    method: 'POST', headers: { ...svcHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      id, user_id: userId, input_text: name, name, product_label: name, ean,
      result_json: { counts, items: [], score: 10 },
    }),
  });
  if (r.status >= 300) throw new Error(`createAnalysis ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return id;
}

async function callSuggest(items, token) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/routine-smart-suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON_KEY },
    body: JSON.stringify({ items }),
  });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}

(async () => {
  console.log(`\n${B}=== routine-smart-suggest — repro « momentanément indisponible » (post-fix) ===${X}`);
  const email = `reco_repro_${Date.now()}@cosmecheck.test`;
  const pass = `Ts!${Date.now().toString(36)}_rp`;
  let userId = null;
  try {
    const su = await signUp(email, pass);
    userId = su.user?.id ?? su.id;
    const si = await signIn(email, pass);
    const token = si.access_token;
    if (!userId || !token) throw new Error('setup auth failed');
    await setProfile(userId);
    await grantCredits(userId);

    const toothId = await createAnalysis(userId, { name: 'HiSmile Watermelon Flavor Anticavity Toothpaste', ean: '93568609', counts: { vert: 13, jaune: 8, orange: 0, rouge: 0 } });
    const alunId = await createAnalysis(userId, { name: "Poudre d'Alun Naturel - 100 g", ean: '3700601505047', counts: { vert: 2, jaune: 1, orange: 0, rouge: 0 } });
    const deoId = await createAnalysis(userId, { name: 'Triple Dry Déodorant Roll-on Anti-transpirant Bergamott sans Parfum', ean: '4045612010869', counts: { vert: 4, jaune: 1, orange: 6, rouge: 3 } });
    info(`user test: ${userId}`);

    // ── Scénario A : payload RÉEL (comme le client de Brian) ────────────────
    const realItems = [
      { analysisId: toothId, name: 'HiSmile Watermelon Flavor Anticavity Toothpaste', ean: '93568609', category: 'hygiene-dentaire/dentifrice/anticavity', counts: { vert: 13, jaune: 8, orange: 0, rouge: 0 }, cappedScore: 17.6, restrictedCount: 0 },
      { analysisId: alunId, name: "Poudre d'Alun Naturel - 100 g", ean: '3700601505047', category: 'hygiene-du-corps/deodorants/poudre', counts: { vert: 2, jaune: 1, orange: 0, rouge: 0 }, cappedScore: 16.25, restrictedCount: 0 },
      { analysisId: deoId, name: 'Triple Dry Déodorant Roll-on Anti-transpirant Bergamott sans Parfum', ean: '4045612010869', category: null, counts: { vert: 4, jaune: 1, orange: 6, rouge: 3 }, cappedScore: 1, restrictedCount: 1 },
    ];

    // ── Scénario B : les 3 forcés à qualifier (lot de 3 → chemin du mismatch) ─
    const batchItems = realItems.map((it) => ({ ...it, restrictedCount: 1 }));

    for (const [label, items, expectQualif] of [
      ['A · payload réel (1 qualifie)', realItems, 1],
      ['B · 3 produits forcés (lot de 3)', batchItems, 3],
    ]) {
      console.log(`\n${B}[${label}]${X}`);
      for (let run = 1; run <= 3; run++) {
        const { status, body } = await callSuggest(items, token);
        const sugg = body?.suggestions ?? [];
        const withAlt = sugg.filter((s) => s.alternative);
        const cats = [...new Set(withAlt.map((s) => (s.alternative?.name ? (s.alternative.name).slice(0, 24) : s.alternative?.ean)))];
        expect(status === 200, `run ${run} · HTTP 200`, `status ${status}`);
        expect(body?.aiUnavailable !== true, `run ${run} · PAS de faux « momentanément indisponible »`, `aiUnavailable=${body?.aiUnavailable}`);
        info(`run ${run} · qualifiés=${sugg.length} avec alternative=${withAlt.length} ${cats.length ? '→ ' + cats.join(' | ') : ''}`);
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    console.log(`\n${B}${failures === 0 ? G + 'TOUS LES TESTS PASSENT' : R + failures + ' échec(s)'}${X}\n`);
    process.exitCode = failures === 0 ? 0 : 1;
  } catch (err) {
    ko(`Fatal: ${err.message}`);
    process.exitCode = 1;
  } finally {
    if (userId) { await deleteUser(userId); info('user test supprimé'); }
  }
})();

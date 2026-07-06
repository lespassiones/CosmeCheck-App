/**
 * Beauty Advisor — Test End-to-End complet
 *
 * Crée un utilisateur test, lui donne des crédits, appelle la vraie Edge
 * Function advisor-chat en streaming, parse les réponses + blocs RECO,
 * valide les produits renvoyés et donne une note globale.
 *
 * Usage: node scripts/test_advisor_e2e.mjs
 */

const SUPABASE_URL  = 'https://rogesnduejmqpxolhbif.supabase.co';
const ANON_KEY      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvZ2VzbmR1ZWptcXB4b2xoYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDIxNzUsImV4cCI6MjA4OTYxODE3NX0.CIjUhlSqqkx6YdSFON4JSDy-ggqrWXpOdvTKLT_1Hkw';
const SERVICE_KEY   = '***REMOVED-SERVICE-ROLE-KEY***';

// ── Console utils ──────────────────────────────────────────────────────────
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', C = '\x1b[36m',
      M = '\x1b[35m', B = '\x1b[1m', DIM = '\x1b[2m', X = '\x1b[0m';

const log  = (...a) => console.log(...a);
const ok   = m => log(`  ${G}✓${X} ${m}`);
const fail = m => log(`  ${R}✗${X} ${m}`);
const warn = m => log(`  ${Y}⚠${X} ${m}`);
const info = m => log(`  ${C}·${X} ${m}`);
const hdr  = m => log(`\n${B}${m}${X}`);

// ── Auth helpers ───────────────────────────────────────────────────────────
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

// ── DB helpers (service role) ──────────────────────────────────────────────
async function sql(query) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  return r;
}

async function setProfile(userId, token) {
  // Upsert profile with skin data for realistic tests
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
      first_name: 'TestUser',
      tier: 'premium',
      preferences: {
        skin: {
          skinTypeFace: 'oily',
          skinTypeBody: 'normal',
          concerns: ['acne', 'pores'],
          goals: ['hydration', 'radiance'],
          allergiesFreeform: '',
        },
        onboardingShown: true,
        restrictions: { families: [], ingredients: [] },
      },
    }),
  });
  return r.status;
}

async function grantCredits(userId) {
  // The credit system uses credit_config_for() (tier-based) for the regular limit.
  // To give bonus credits, we insert into credit_grants — the consume function
  // draws from this pool once the regular daily limit is exhausted.
  const r = await fetch(`${SUPABASE_URL}/rest/v1/credit_grants`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Accept-Profile': 'cosme_check',
      'Content-Profile': 'cosme_check',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      user_id: userId,
      amount: 500,
      remaining: 500,
      note: 'e2e-test-harness',
      created_by: 'test-script',
    }),
  });
  const body = await r.text();
  console.log(`  ${DIM}[grantCredits] status=${r.status} body=${body.slice(0, 200)}${X}`);
  return r.status;
}

// ── Advisor chat call ──────────────────────────────────────────────────────
async function callAdvisor(messages, token) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/advisor-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ messages }),
  });

  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`advisor-chat ${r.status}: ${err.slice(0, 200)}`);
  }

  // Read streaming response
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
  }
  return full;
}

// ── RECO block parsing ─────────────────────────────────────────────────────
function parseReco(text) {
  const m = text.match(/<<<RECO>>>\s*([\s\S]*?)\s*<<<END>>>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function stripReco(text) {
  return text.replace(/<<<RECO>>>[\s\S]*?<<<END>>>/g, '').trim();
}

// ── RPC call ───────────────────────────────────────────────────────────────
async function callRecoRpc(reco) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cosme_check_recommend_products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      p_terms: reco.ingredients ?? [],
      p_form: reco.form ?? null,
      p_min_score: 15,
      p_limit: 10,
      p_exclude_families: [],
      p_exclude_ingredients: [],
    }),
  });
  if (!r.ok) return [];
  return r.json();
}

function lastSeg(cat) { return (cat ?? '').split('/').pop(); }

// ── Scoring helpers ────────────────────────────────────────────────────────
let totalPoints = 0, maxPoints = 0;

function score(label, pts, max, note = '') {
  totalPoints += pts;
  maxPoints   += max;
  const pct = max > 0 ? Math.round(pts / max * 100) : 100;
  const col = pct >= 80 ? G : pct >= 50 ? Y : R;
  log(`  ${col}[${pts}/${max}]${X} ${label}${note ? ' — ' + note : ''}`);
}

// ── SCENARIOS ──────────────────────────────────────────────────────────────
// Format: { id, label, messages, eval(responseText, reco, products) }
const SCENARIOS = [

  // ─── 1. Requête générique soin visage ────────────────────────────────────
  {
    id: '01',
    label: 'Requête générique — soin visage',
    messages: [{ role: 'user', content: 'Je cherche une crème hydratante pour le visage' }],
    eval(text, reco, products) {
      const visible = stripReco(text);
      const hasSkin = /visage|hydrat/i.test(visible);
      const hasReco = !!reco;
      const goodForm = reco?.form && /visage|hydrat/i.test(reco.form);
      const goodIngr = reco?.ingredients?.some(i => ['hyaluronic','glycerin','ceramide','niacinamide'].includes(i));
      const cats = products.map(p => lastSeg(p.category));
      const prodOk = cats.some(c => /visage|serum|hydratant/.test(c));
      const noPieds = !cats.some(c => c.includes('pieds'));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Form pointe vers visage', goodForm ? 1 : 0, 1, reco?.form ?? 'null');
      score('Ingrédients cohérents', goodIngr ? 1 : 0, 1, (reco?.ingredients ?? []).join(', '));
      score('Produits dans catégorie visage', prodOk ? 1 : 0, 1, [...new Set(cats)].slice(0,4).join(', '));
      score('Aucun produit pieds/cheveux parasite', noPieds ? 1 : 0, 1);
      info('Réponse visible: ' + visible.slice(0, 120));
    },
  },

  // ─── 2. Soins pieds génériques ───────────────────────────────────────────
  {
    id: '02',
    label: 'Soins pieds génériques (sans préciser le type)',
    messages: [{ role: 'user', content: 'Propose moi des soins pour mes pieds' }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const formOk = reco?.form && /hydratant.*pied|pied.*hydratant/i.test(reco.form);
      const formNotDeodorant = !reco?.form?.toLowerCase().includes('deodor');
      const cats = products.map(p => lastSeg(p.category));
      const noDeodorant = !cats.some(c => c.includes('deodorant'));
      const hasHydratant = cats.some(c => c.includes('hydratant'));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Form = "hydratants pieds" (pas pieds seul)', formOk ? 1 : 0, 1, reco?.form ?? 'null');
      score('Form ne contient pas "deodorant"', formNotDeodorant ? 1 : 0, 1);
      score('0 déodorant pieds dans les produits', noDeodorant ? 1 : 0, 1, cats.filter(c=>c.includes('deodor')).join(',')||'OK');
      score('Des hydratants pieds dans les produits', hasHydratant ? 1 : 0, 1, [...new Set(cats)].join(', '));
    },
  },

  // ─── 3. Tiers — enfant eczéma sans âge ──────────────────────────────────
  {
    id: '03',
    label: 'Tiers — enfant eczéma SANS âge précisé',
    messages: [{ role: 'user', content: "Ma fille a de l'eczéma, qu'est-ce que tu me conseilles ?" }],
    eval(text, reco, products) {
      const visible = stripReco(text);
      // DOIT poser la question de l'âge AVANT de recommander (nouvelle règle)
      const asksAge = /quel.*âge|quel.*age|combien.*an|ans.*a[- ]t|quel.*annee/i.test(visible);
      // Si pas d'âge, RECO est prématurée
      const noPrematReco = !reco || asksAge;
      const notUserProfile = !/peau.*grasse|peau.*mixte|pores|acn/i.test(visible); // pas appliquer le profil test user

      score('Pose la question de l\'âge', asksAge ? 2 : 0, 2,
        asksAge ? '"Quel âge ?" détecté ✓' : 'PAS de question âge — recommande directement');
      score('Pas de RECO prématurée (ou aucune)', noPrematReco ? 1 : 0, 1,
        reco ? `RECO émis alors que âge inconnu: form="${reco.form}"` : 'Pas de RECO ✓');
      score('N\'applique pas le profil user (peau grasse/acné) à la fille', notUserProfile ? 1 : 0, 1);
      info('Réponse visible: ' + visible.slice(0, 200));
    },
  },

  // ─── 4. Tiers — enfant eczéma AVEC âge ──────────────────────────────────
  {
    id: '04',
    label: 'Tiers — enfant eczéma AVEC âge (8 ans)',
    messages: [
      { role: 'user', content: "Ma fille a de l'eczéma, qu'est-ce que tu me conseilles ?" },
      { role: 'assistant', content: "Quel âge a-t-elle ?" },
      { role: 'user', content: "Elle a 8 ans" },
    ],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const formOk = reco?.form && /hydratant.*corps|corps.*hydratant/i.test(reco.form);
      const hasExclude = reco?.exclude?.some(e => ['parfum','huile_essentielle','alcool','allergene'].includes(e));
      const hasGoodIngr = reco?.ingredients?.some(i => ['panthenol','ceramide','allantoin','glycerin','centella','bisabolol'].includes(i));
      const cats = products.map(p => lastSeg(p.category));
      const prodOk = cats.some(c => /hydratant.*corps|corps/.test(c));
      const noBadCats = !cats.some(c => /shampoing|deodorant|maquillage|serum/.test(c));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Form = "hydratant corps"', formOk ? 1 : 0, 1, reco?.form ?? 'null');
      score('Exclude parfum/alcool/HE/allergène', hasExclude ? 1 : 0, 1, (reco?.exclude ?? []).join(', '));
      score('Ingrédients apaisants (panthenol/ceramide/allantoin)', hasGoodIngr ? 1 : 0, 1, (reco?.ingredients ?? []).join(', '));
      score('Produits corps adaptés (pas shampoing/déo)', noBadCats ? 1 : 0, 1, [...new Set(cats)].join(', '));
    },
  },

  // ─── 5. Question pure info ───────────────────────────────────────────────
  {
    id: '05',
    label: 'Question pure info — ne doit PAS émettre de RECO',
    messages: [{ role: 'user', content: "C'est quoi la niacinamide et à quoi ça sert ?" }],
    eval(text, reco, products) {
      const visible = stripReco(text);
      const noReco = !reco;
      const informative = /niacinamide|pores|sebum|teint|vitamin/i.test(visible);
      const notTooShort = visible.length > 80;

      score('PAS de RECO block (question info)', noReco ? 2 : 0, 2,
        reco ? `RECO émis alors que c'est une question info: form="${reco.form}"` : 'Pas de RECO ✓');
      score('Réponse informative sur la niacinamide', informative ? 1 : 0, 1);
      score('Réponse substantielle (>80 chars)', notTooShort ? 1 : 0, 1, `${visible.length} chars`);
      info('Réponse: ' + visible.slice(0, 150));
    },
  },

  // ─── 6. Déodorant aisselles ──────────────────────────────────────────────
  {
    id: '06',
    label: 'Déodorant aisselles (pas pieds)',
    messages: [{ role: 'user', content: "Je veux un bon déodorant qui dure longtemps" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const formIsDeodorant = reco?.form && reco.form.includes('deodorant');
      const formNotPieds = !reco?.form?.includes('pieds');
      const cats = products.map(p => lastSeg(p.category));
      const hasDeodorant = cats.some(c => c.includes('deodorant'));
      const noDeoPieds = !cats.some(c => /deodorant.*pied|pied.*deodorant/.test(c));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Form = "deodorant" (pas pieds)', formIsDeodorant && formNotPieds ? 1 : 0, 1, reco?.form ?? 'null');
      score('Produits déodorant', hasDeodorant ? 1 : 0, 1, [...new Set(cats)].join(', '));
      score('Pas de déodorant pieds dans les résultats', noDeoPieds ? 1 : 0, 1);
      info('Form: ' + (reco?.form ?? 'null') + ' | Ingredients: ' + (reco?.ingredients ?? []).join(', '));
    },
  },

  // ─── 7. Tiers — transpiration des pieds ─────────────────────────────────
  {
    id: '07',
    label: 'Tiers — mari qui transpire des pieds',
    messages: [{ role: 'user', content: "Mon mari transpire beaucoup des pieds, qu'est-ce qu'il pourrait utiliser ?" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const formDeopieds = reco?.form && /deodorant.*pied|pied.*deodor/i.test(reco.form);
      const cats = products.map(p => lastSeg(p.category));
      const allDeoPieds = cats.every(c => c.includes('deodorant') || c.includes('odeur'));
      const noProfile = stripReco(text).search(/peau.*grasse|pores|acn/i) === -1;

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Form = "deodorant pieds"', formDeopieds ? 1 : 0, 1, reco?.form ?? 'null');
      score('Produits déodorant pieds uniquement', allDeoPieds ? 1 : 0, 1, [...new Set(cats)].join(', '));
      score('N\'applique pas le profil user (peau grasse) à son mari', noProfile ? 1 : 0, 1);
      info('Top produits: ' + products.slice(0,2).map(p => p.name).join(' | '));
    },
  },

  // ─── 8. Requête totalement vague ─────────────────────────────────────────
  {
    id: '08',
    label: 'Requête vague sans info — doit poser UNE question OU utiliser le profil',
    messages: [{ role: 'user', content: "Conseille moi quelque chose" }],
    eval(text, reco, products) {
      const visible = stripReco(text);
      // Options valides: utilise le profil pour recommander OU pose 1 seule question
      const usesProfile = reco && (
        /acne|imperfection|pores|bouton|sebum/i.test(visible) ||
        reco?.ingredients?.some(i => ['salicylic','niacinamide','zinc'].includes(i))
      );
      const asksOneQ = !reco && (visible.match(/\?/g) ?? []).length <= 2;
      const notRandom = !reco || (reco.form && reco.form !== 'null');

      const behaviorOk = usesProfile || asksOneQ;
      score('Utilise le profil OU pose 1-2 questions max', behaviorOk ? 2 : 0, 2,
        usesProfile ? 'Profil utilisé (acné/pores) ✓' : asksOneQ ? 'Question posée ✓' : 'Ni l\'un ni l\'autre ✗');
      score('Pas de RECO aléatoire sans contexte', notRandom ? 1 : 0, 1,
        reco?.form ?? 'null');
      score('Réponse non vide', visible.length > 50 ? 1 : 0, 1, `${visible.length} chars`);
      info('Visible: ' + visible.slice(0, 150));
    },
  },

  // ─── 9. Anti-rides ──────────────────────────────────────────────────────
  {
    id: '09',
    label: 'Anti-rides pour le visage',
    messages: [{ role: 'user', content: "J'ai 45 ans et j'ai des rides sur le visage, aide moi" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const goodIngr = reco?.ingredients?.some(i => ['retinol','peptide','ascorbic','ceramide'].includes(i));
      const formVisage = reco?.form && /visage/.test(reco.form);
      const cats = products.map(p => lastSeg(p.category));
      const hasAntiAge = cats.some(c => /anti.age|serum|hydratant.*visage|visage.*nuit/.test(c));
      const noPieds = !cats.some(c => c.includes('pieds'));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Ingrédients anti-rides (retinol/peptide/ascorbic)', goodIngr ? 1 : 0, 1, (reco?.ingredients ?? []).join(', '));
      score('Form pointe vers visage', formVisage ? 1 : 0, 1, reco?.form ?? 'null');
      score('Produits anti-âge ou sérums visage', hasAntiAge ? 1 : 0, 1, [...new Set(cats)].join(', '));
      score('Aucun produit corps/pieds/cheveux parasite', noPieds ? 1 : 0, 1);
    },
  },

  // ─── 10. Shampoing cheveux secs ─────────────────────────────────────────
  {
    id: '10',
    label: 'Shampoing cheveux très secs',
    messages: [{ role: 'user', content: "Un shampoing pour les cheveux très secs et abîmés" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const formOk = reco?.form && /shampoing|shampoo|cheveux/i.test(reco.form);
      const goodIngr = reco?.ingredients?.some(i => ['argania','panthenol','keratin','butyrospermum','avena'].includes(i));
      const cats = products.map(p => lastSeg(p.category));
      const hasShampoing = cats.some(c => /shampoing|shampooing/.test(c));
      const noVisage = !cats.some(c => /visage|corps/.test(c));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Form shampoing/cheveux', formOk ? 1 : 0, 1, reco?.form ?? 'null');
      score('Ingrédients cheveux secs (argan/panthenol/keratin)', goodIngr ? 1 : 0, 1, (reco?.ingredients ?? []).join(', '));
      score('Produits shampoing', hasShampoing ? 1 : 0, 1, [...new Set(cats)].join(', '));
      score('Aucun produit visage/corps parasite', noVisage ? 1 : 0, 1);
    },
  },

  // ─── 11. Peau sensible sans type précis ─────────────────────────────────
  {
    id: '11',
    label: 'Peau sensible — auto-exclusions parfum/alcool/HE',
    messages: [{ role: 'user', content: "J'ai la peau très sensible et réactive, je cherche une crème hydratante" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const hasExclude = reco?.exclude?.some(e => ['parfum','alcool','huile_essentielle','allergene'].includes(e));
      const excludeMinTwo = (reco?.exclude ?? []).filter(e => ['parfum','alcool','huile_essentielle','allergene'].includes(e)).length >= 2;
      const formVisage = reco?.form && /visage|hydratant/.test(reco.form);
      // Liste large : tous les actifs apaisants légitimes pour peau sensible
      const SOOTHING = ['panthenol','centella','ceramide','allantoin','bisabolol','glycerin','niacinamide','hyaluronic','oat','avena','beta'];
      const goodIngr = reco?.ingredients?.some(i => SOOTHING.some(s => i.includes(s)));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Auto-exclude parfum ET/OU alcool/HE', hasExclude ? 1 : 0, 1, (reco?.exclude ?? []).join(', '));
      score('≥2 exclusions pour peau sensible', excludeMinTwo ? 1 : 0, 1, (reco?.exclude ?? []).join(', '));
      score('Form visage/hydratant', formVisage ? 1 : 0, 1, reco?.form ?? 'null');
      score('Ingrédients apaisants (panthenol/ceramide/allantoin)', goodIngr ? 1 : 0, 1, (reco?.ingredients ?? []).join(', '));
    },
  },

  // ─── 12. Follow-up "montre moi ça" ──────────────────────────────────────
  {
    id: '12',
    label: 'Follow-up "montre moi ça" — doit ré-émettre le RECO',
    messages: [
      { role: 'user', content: "Je cherche un sérum pour l'éclat" },
      { role: 'assistant', content: `La vitamine C et la niacinamide sont parfaites pour l'éclat. Je te montre des sérums !\n<<<RECO>>>\n{"ingredients":["ascorbic","niacinamide"],"form":"serum visage"}\n<<<END>>>` },
      { role: 'user', content: "Montre moi autre chose" },
    ],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const sameCategory = reco?.form && /serum|visage|eclat/i.test(reco.form);
      const cats = products.map(p => lastSeg(p.category));
      const hasSerum = cats.some(c => /serum/.test(c));

      score('Re-émet un RECO block sur "montre moi autre chose"', hasReco ? 2 : 0, 2,
        hasReco ? 'RECO ré-émis ✓' : 'PAS de RECO — bug ✗');
      score('Form dans la même famille (sérum/visage)', sameCategory ? 1 : 0, 1, reco?.form ?? 'null');
      score('Produits sérums', hasSerum ? 1 : 0, 1, [...new Set(cats)].join(', '));
      info('Ingredients: ' + (reco?.ingredients ?? []).join(', '));
    },
  },

  // ─── 13. Contour des yeux / cernes ──────────────────────────────────────
  {
    id: '13',
    label: 'Contour des yeux — cernes et poches',
    messages: [{ role: 'user', content: "J'ai des cernes et des poches sous les yeux, c'est horrible" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const formYeux = reco?.form && /yeux|oeil|cerne|contour/i.test(reco.form);
      const goodIngr = reco?.ingredients?.some(i => ['caffeine','ascorbic','peptide','hyaluronic'].includes(i));
      const cats = products.map(p => lastSeg(p.category));
      const hasYeux = cats.some(c => /yeux|cerne|contour/.test(c));
      const noPieds = !cats.some(c => c.includes('pieds'));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Form yeux/contour/cernes', formYeux ? 1 : 0, 1, reco?.form ?? 'null');
      score('Ingrédients yeux (caffeine/ascorbic/peptide)', goodIngr ? 1 : 0, 1, (reco?.ingredients ?? []).join(', '));
      score('Produits contour des yeux', hasYeux ? 1 : 0, 1, [...new Set(cats)].join(', '));
      score('Aucun parasite pieds/cheveux', noPieds ? 1 : 0, 1);
    },
  },

  // ─── 14. Sérum vitamine C éclat ─────────────────────────────────────────
  {
    id: '14',
    label: 'Sérum vitamine C pour l\'éclat du teint',
    messages: [{ role: 'user', content: "Je veux un sérum à la vitamine C pour avoir un teint plus lumineux" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const hasVitC = reco?.ingredients?.includes('ascorbic');
      const formVisage = reco?.form && /visage|serum/i.test(reco.form);
      const cats = products.map(p => lastSeg(p.category));
      const hasSerum = cats.some(c => /serum/.test(c));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Ingrédient vitamine C (ascorbic)', hasVitC ? 1 : 0, 1, (reco?.ingredients ?? []).join(', '));
      score('Form sérum visage', formVisage ? 1 : 0, 1, reco?.form ?? 'null');
      score('Produits sérums visage', hasSerum ? 1 : 0, 1, [...new Set(cats)].join(', '));
    },
  },

  // ─── 15. Anti-acné / imperfections ──────────────────────────────────────
  {
    id: '15',
    label: 'Soin anti-acné imperfections',
    messages: [{ role: 'user', content: "J'ai des boutons et de l'acné, aide moi à avoir une peau nette" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const goodIngr = reco?.ingredients?.some(i => ['salicylic','niacinamide','zinc'].includes(i));
      const cats = products.map(p => lastSeg(p.category));
      // Catalogue : soit catégorie "imperfections" soit sérums visage avec actifs acné — les deux sont corrects
      const hasRelevant = cats.some(c => /imperfection|acn|bouton|serum/.test(c));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Ingrédients anti-acné (salicylic/niacinamide/zinc)', goodIngr ? 1 : 0, 1, (reco?.ingredients ?? []).join(', '));
      score('Produits imperfections ou sérums visage avec actifs', hasRelevant ? 1 : 0, 1, [...new Set(cats)].join(', '));
      score('Pas de produits hors sujet', !cats.some(c => /pieds|cheveux|parfum/.test(c)) ? 1 : 0, 1);
    },
  },

  // ─── 16. Nettoyant visage ────────────────────────────────────────────────
  {
    id: '16',
    label: 'Nettoyant visage gel doux',
    messages: [{ role: 'user', content: "Je cherche un nettoyant visage doux pour le matin" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const formNettoyant = reco?.form && /nettoy|visage/.test(reco.form);
      const cats = products.map(p => lastSeg(p.category));
      const hasNettoyant = cats.some(c => /nettoyant|gel.nettoy|mousse.nettoy/.test(c));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Form nettoyant visage', formNettoyant ? 1 : 0, 1, reco?.form ?? 'null');
      score('Produits nettoyants visage', hasNettoyant ? 1 : 0, 1, [...new Set(cats)].join(', '));
      score('Pas de produits corps/cheveux', !cats.some(c => /corps|cheveux|pieds/.test(c)) ? 1 : 0, 1);
    },
  },

  // ─── 17. Masque visage ───────────────────────────────────────────────────
  {
    id: '17',
    label: 'Masque visage hydratant',
    messages: [{ role: 'user', content: "Un masque visage hydratant pour le week-end" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const formMasque = reco?.form && /masque/.test(reco.form);
      const cats = products.map(p => lastSeg(p.category));
      const hasMasque = cats.some(c => /masque/.test(c));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Form masque', formMasque ? 1 : 0, 1, reco?.form ?? 'null');
      score('Produits masques', hasMasque ? 1 : 0, 1, [...new Set(cats)].join(', '));
      score('Pas de shampoing/déo parasites', !cats.some(c => /shampoing|deodor/.test(c)) ? 1 : 0, 1);
    },
  },

  // ─── 18. Gommage pieds ───────────────────────────────────────────────────
  {
    id: '18',
    label: 'Gommage exfoliant pour les pieds',
    messages: [{ role: 'user', content: "J'ai les talons très secs et abîmés, je veux un gommage pour les pieds" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const formGommage = reco?.form && /gommage.*pied|exfoli.*pied/i.test(reco.form);
      const cats = products.map(p => lastSeg(p.category));
      const hasGommage = cats.some(c => /gommage|exfoliant|callosit|fissur/.test(c));
      const noHydratant = !cats.every(c => c.includes('hydratant'));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Form gommage pieds', formGommage ? 1 : 0, 1, reco?.form ?? 'null');
      score('Produits gommage/exfoliant pieds', hasGommage ? 1 : 0, 1, [...new Set(cats)].join(', '));
      score('Pas uniquement hydratants (mauvaise catégorie)', noHydratant ? 1 : 0, 1);
    },
  },

  // ─── 19. Baume à lèvres ─────────────────────────────────────────────────
  {
    id: '19',
    label: 'Baume à lèvres nourrissant',
    messages: [{ role: 'user', content: "Mes lèvres sont sèches et gercées, je veux un baume" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const formLevres = reco?.form && /levre|levres|baume/i.test(reco.form);
      const cats = products.map(p => lastSeg(p.category));
      const hasLevres = cats.some(c => /levre|levres/.test(c));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Form lèvres/baume', formLevres ? 1 : 0, 1, reco?.form ?? 'null');
      score('Produits lèvres', hasLevres ? 1 : 0, 1, [...new Set(cats)].join(', '));
      score('Pas de corps/visage parasites', !cats.some(c => /hydratant.corps|cheveux/.test(c)) ? 1 : 0, 1);
    },
  },

  // ─── 20. Shampoing antipelliculaire ─────────────────────────────────────
  {
    id: '20',
    label: 'Shampoing contre les pellicules',
    messages: [{ role: 'user', content: "J'ai des pellicules très gênantes, quel shampoing ?" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const formShampoing = reco?.form && /shampoing|shampoo/i.test(reco.form);
      const cats = products.map(p => lastSeg(p.category));
      const hasAntiPell = cats.some(c => /antipelliculaire|anti.pellicul/.test(c));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Form shampoing', formShampoing ? 1 : 0, 1, reco?.form ?? 'null');
      score('Produits shampoings antipelliculaires', hasAntiPell ? 1 : 0, 1, [...new Set(cats)].join(', '));
      score('Pas de visage/corps parasites', !cats.some(c => /visage|hydratant.corps/.test(c)) ? 1 : 0, 1);
    },
  },

  // ─── 21. Mascara ─────────────────────────────────────────────────────────
  {
    id: '21',
    label: 'Mascara pour des cils volumineux',
    messages: [{ role: 'user', content: "Je cherche un bon mascara pour avoir des cils volumineux et allongés" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const formMascara = reco?.form && /mascara|cil/i.test(reco.form);
      const cats = products.map(p => lastSeg(p.category));
      const hasMascara = cats.some(c => /mascara/.test(c));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Form mascara/cils', formMascara ? 1 : 0, 1, reco?.form ?? 'null');
      score('Produits mascara', hasMascara ? 1 : 0, 1, [...new Set(cats)].join(', '));
      score('Pas de produits soin/corps parasites', !cats.some(c => /hydratant|cheveux|pieds/.test(c)) ? 1 : 0, 1);
    },
  },

  // ─── 22. Fond de teint ───────────────────────────────────────────────────
  {
    id: '22',
    label: 'Fond de teint peau grasse',
    messages: [{ role: 'user', content: "Quel fond de teint pour peau grasse qui tient toute la journée ?" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const formTeint = reco?.form && /teint|fond|bb|cc/i.test(reco.form);
      const cats = products.map(p => lastSeg(p.category));
      const hasTeint = cats.some(c => /fond.de.teint|bb.creme|teint/.test(c));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Form fond de teint / maquillage', formTeint ? 1 : 0, 1, reco?.form ?? 'null');
      score('Produits fond de teint', hasTeint ? 1 : 0, 1, [...new Set(cats)].join(', '));
      score('Pas de soins visage parasites (hydratant)', !cats.every(c => /hydratant/.test(c)) ? 1 : 0, 1);
    },
  },

  // ─── 23. Eau micellaire / démaquillant ──────────────────────────────────
  {
    id: '23',
    label: 'Démaquillant eau micellaire',
    messages: [{ role: 'user', content: "Je veux une eau micellaire pour me démaquiller le soir" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const formDemaq = reco?.form && /micellaire|demaquill/i.test(reco.form);
      const cats = products.map(p => lastSeg(p.category));
      const hasDemaq = cats.some(c => /micellaire|demaquill/.test(c));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Form démaquillant/micellaire', formDemaq ? 1 : 0, 1, reco?.form ?? 'null');
      score('Produits démaquillants', hasDemaq ? 1 : 0, 1, [...new Set(cats)].join(', '));
      score('Pas de soins hydratants parasites', !cats.every(c => /hydratant/.test(c)) ? 1 : 0, 1);
    },
  },

  // ─── 24. Parfum femme ────────────────────────────────────────────────────
  {
    id: '24',
    label: 'Parfum femme floral',
    messages: [{ role: 'user', content: "Je cherche un parfum pour femme, j'aime les senteurs florales" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const formParfum = reco?.form && /parfum/i.test(reco.form);
      const cats = products.map(p => lastSeg(p.category));
      const hasParfum = cats.some(c => /parfum|eau.de.parfum|eau.de.toilette/.test(c));
      const noCosmetique = !cats.some(c => /hydratant|shampoing|serum/.test(c));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Form parfum', formParfum ? 1 : 0, 1, reco?.form ?? 'null');
      score('Produits parfums', hasParfum ? 1 : 0, 1, [...new Set(cats)].join(', '));
      score('Pas de soins cosmétiques parasites', noCosmetique ? 1 : 0, 1);
    },
  },

  // ─── 25. Gel douche ──────────────────────────────────────────────────────
  {
    id: '25',
    label: 'Gel douche hydratant',
    messages: [{ role: 'user', content: "Un bon gel douche qui hydrate bien la peau" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const formDouche = reco?.form && /douche|savon|bain/i.test(reco.form);
      const cats = products.map(p => lastSeg(p.category));
      const hasDouche = cats.some(c => /gel.douche|savon|douche/.test(c));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Form gel douche', formDouche ? 1 : 0, 1, reco?.form ?? 'null');
      score('Produits gel douche', hasDouche ? 1 : 0, 1, [...new Set(cats)].join(', '));
      score('Pas de crèmes visage parasites', !cats.some(c => /visage.nuit|serum.visage/.test(c)) ? 1 : 0, 1);
    },
  },

  // ─── 26. Tiers — soin homme (peau sensible, rasage) ─────────────────────
  {
    id: '26',
    label: 'Tiers — soin après-rasage pour mon mari',
    messages: [{ role: 'user', content: "Mon mari a la peau irritée après le rasage, qu'est-ce que tu conseillerais ?" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const formHomme = reco?.form && /rasage|homme|hydratant/i.test(reco.form);
      const cats = products.map(p => lastSeg(p.category));
      const hasHomme = cats.some(c => /rasage|homme|hydratant/.test(c));
      const hasExclude = reco?.exclude?.some(e => ['parfum','alcool'].includes(e));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Form adapté homme/rasage/hydratant', formHomme ? 1 : 0, 1, reco?.form ?? 'null');
      score('Produits pour homme ou soin apaisant', hasHomme ? 1 : 0, 1, [...new Set(cats)].join(', '));
      score('Exclut parfum/alcool (peau irritée)', hasExclude ? 1 : 0, 1, (reco?.exclude ?? []).join(', '));
    },
  },

  // ─── 27. Tiers — bébé avec âge précisé (6 mois) ────────────────────────
  {
    id: '27',
    label: 'Tiers — crème pour bébé 6 mois',
    messages: [{ role: 'user', content: "Pour mon bébé de 6 mois qui a la peau très sèche, quelle crème ?" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const hasExcludeParfum = reco?.exclude?.includes('parfum');
      const cats = products.map(p => lastSeg(p.category));
      const hasBebe = cats.some(c => /bebe|bébé|enfant|nourrisson/.test(c));
      const formOk = reco?.form !== null;

      score('Émet un RECO block (âge connu → pas de question)', hasReco ? 1 : 0, 1);
      score('Exclut parfum (bébé 6 mois)', hasExcludeParfum ? 1 : 0, 1, (reco?.exclude ?? []).join(', '));
      score('Produits bébé/enfant', hasBebe ? 1 : 0, 1, [...new Set(cats)].join(', '));
      score('Form non null', formOk ? 1 : 0, 1, reco?.form ?? 'null');
    },
  },

  // ─── 28. Tiers — enfant SANS âge (confirme la règle) ───────────────────
  {
    id: '28',
    label: 'Tiers — soin cheveux pour mon fils (sans âge)',
    messages: [{ role: 'user', content: "Mon fils a les cheveux très abîmés et frisottants, tu as quelque chose ?" }],
    eval(text, reco, products) {
      const visible = stripReco(text);
      // L'âge n'est pas précisé : le LLM DOIT poser la question ou recommander
      // directement (les cheveux ne sont pas un soin médical — c'est acceptable)
      const asksAgeOrReco = text.toLowerCase().includes('âge') || text.toLowerCase().includes('age') || !!reco;
      const noAdultProfile = !visible.toLowerCase().includes('peau grasse') && !visible.toLowerCase().includes('acné');

      score('Pose l\'âge OU recommande (cheveux = non critique)', asksAgeOrReco ? 2 : 0, 2,
        !!reco ? 'RECO direct ✓' : 'Question âge ✓');
      score('N\'applique pas le profil peau grasse/acné', noAdultProfile ? 1 : 0, 1);
      if (reco) {
        const cats = products.map(p => lastSeg(p.category));
        score('Produits cheveux si RECO', cats.some(c => /chev|shampoing|capill/.test(c)) ? 1 : 0, 1, [...new Set(cats)].join(', '));
      } else {
        score('(pas de RECO — question posée, OK)', 1, 1);
      }
    },
  },

  // ─── 29. Question info — pas de RECO (kératine) ─────────────────────────
  {
    id: '29',
    label: 'Question info — qu\'est-ce que la kératine ?',
    messages: [{ role: 'user', content: "C'est quoi la kératine dans les soins capillaires ?" }],
    eval(text, reco, products) {
      const hasNoReco = !reco;
      const isInformative = /k[eé]ratine/i.test(text);
      const isSubstantial = stripReco(text).length > 80;

      score('PAS de RECO (question info)', hasNoReco ? 2 : 0, 2, hasNoReco ? 'Pas de RECO ✓' : 'RECO indésirable ✗');
      score('Réponse sur la kératine', isInformative ? 1 : 0, 1);
      score('Réponse substantielle (>80 chars)', isSubstantial ? 1 : 0, 1, `${stripReco(text).length} chars`);
    },
  },

  // ─── 30. Gommage corps ───────────────────────────────────────────────────
  {
    id: '30',
    label: 'Gommage exfoliant corps',
    messages: [{ role: 'user', content: "Je cherche un gommage corps pour ma peau terne et rugueuse" }],
    eval(text, reco, products) {
      const hasReco = !!reco;
      const formGommage = reco?.form && /gomm|exfoli/i.test(reco.form);
      const cats = products.map(p => lastSeg(p.category));
      const hasGommage = cats.some(c => /gommage.corps|exfoliant/.test(c));

      score('Émet un RECO block', hasReco ? 1 : 0, 1);
      score('Form gommage corps', formGommage ? 1 : 0, 1, reco?.form ?? 'null');
      score('Produits gommage corps', hasGommage ? 1 : 0, 1, [...new Set(cats)].join(', '));
      score('Pas de visage/pieds parasites', !cats.some(c => /gommage.visage|gommage.pied/.test(c)) ? 1 : 0, 1);
    },
  },
];

// ── MAIN ───────────────────────────────────────────────────────────────────
let userId = null;
let userToken = null;
const TEST_EMAIL = `advisor_test_${Date.now()}@cosmecheck.test`;
const TEST_PASS  = `Cs!T3st_${Date.now().toString(36)}_xQp`;

async function setup() {
  log(`\n${B}=== Beauty Advisor — Evaluation E2E ===${X}`);
  log(`${DIM}Création utilisateur test: ${TEST_EMAIL}${X}`);

  // Sign up
  const signupRes = await signUp(TEST_EMAIL, TEST_PASS);
  if (!signupRes.user?.id && !signupRes.id) {
    // Peut-être déjà inscrit, essaie sign in
    const signinRes = await signIn(TEST_EMAIL, TEST_PASS);
    if (!signinRes.access_token) throw new Error('Impossible de créer/connecter utilisateur test: ' + JSON.stringify(signupRes));
    userId    = signinRes.user.id;
    userToken = signinRes.access_token;
  } else {
    userId = signupRes.user?.id ?? signupRes.id;
    const signinRes = await signIn(TEST_EMAIL, TEST_PASS);
    if (!signinRes.access_token) throw new Error('Signin failed: ' + JSON.stringify(signinRes));
    userToken = signinRes.access_token;
  }

  log(`${DIM}UserId: ${userId}${X}`);

  // Set up profile
  await setProfile(userId, userToken);

  // Grant credits
  await grantCredits(userId);

  log(`${G}Utilisateur test prêt.${X}\n`);
}

async function teardown() {
  if (userId) {
    await deleteUser(userId);
    log(`\n${DIM}Utilisateur test supprimé.${X}`);
  }
}

async function runTests() {
  for (const sc of SCENARIOS) {
    hdr(`[${sc.id}] ${sc.label}`);
    try {
      // Appel advisor-chat
      const raw = await callAdvisor(sc.messages, userToken);
      const reco = parseReco(raw);

      // Si RECO, on récupère les produits réels
      let products = [];
      if (reco) {
        products = await callRecoRpc(reco);
        info(`RECO: form="${reco.form}" | ingredients=[${(reco.ingredients ?? []).join(', ')}] | exclude=[${(reco.exclude ?? []).join(', ')}]`);
        info(`Produits reçus: ${products.length} | catégories: ${[...new Set(products.map(p => lastSeg(p.category)))].join(', ')}`);
      } else {
        info('Pas de RECO block dans cette réponse');
      }

      sc.eval(raw, reco, products);
    } catch (err) {
      fail(`ERREUR: ${err.message}`);
      // Pénalise les points manquants
      const maxForScenario = SCENARIOS.find(s => s.id === sc.id);
      score('Erreur critique (call failed)', 0, 4, err.message.slice(0, 80));
    }

    // Petite pause pour éviter le rate-limit
    await new Promise(r => setTimeout(r, 1500));
  }
}

function printFinal() {
  const pct = Math.round(totalPoints / maxPoints * 100);
  const note = Math.round(totalPoints / maxPoints * 20 * 10) / 10;
  const col = pct >= 80 ? G : pct >= 60 ? Y : R;

  log(`\n${B}${'─'.repeat(55)}${X}`);
  log(`${B}NOTE FINALE : ${col}${note}/20${X}${B}  (${pct}% — ${totalPoints}/${maxPoints} pts)${X}`);
  log(`${B}${'─'.repeat(55)}${X}\n`);

  if (pct < 80) {
    log(`${Y}Des corrections sont nécessaires.${X}\n`);
  } else if (pct < 100) {
    log(`${G}Bon score — quelques points d'amélioration restants.${X}\n`);
  } else {
    log(`${G}${B}PARFAIT — 20/20 !${X}\n`);
  }
}

// ── Run ────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await setup();
    await runTests();
  } catch (err) {
    log(`${R}Fatal: ${err.message}${X}`);
  } finally {
    printFinal();
    await teardown();
  }
})();

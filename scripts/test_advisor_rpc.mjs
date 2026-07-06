/**
 * Test harness — Beauty Advisor RPC recommendations
 *
 * Valide que les form values générées par le LLM retournent les BONNES
 * catégories en base. Teste les scénarios clés (pieds, eczéma, visage...).
 *
 * Usage: node scripts/test_advisor_rpc.mjs
 */

const SUPABASE_URL = 'https://rogesnduejmqpxolhbif.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvZ2VzbmR1ZWptcXB4b2xoYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDIxNzUsImV4cCI6MjA4OTYxODE3NX0.CIjUhlSqqkx6YdSFON4JSDy-ggqrWXpOdvTKLT_1Hkw';

async function callRpc(params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cosme_check_recommend_products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`RPC error ${res.status}: ${err}`);
  }
  return res.json();
}

// Couleurs console
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function ok(msg) { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${RED}✗${RESET} ${msg}`); }
function warn(msg) { console.log(`  ${YELLOW}⚠${RESET} ${msg}`); }
function info(msg) { console.log(`  ${CYAN}·${RESET} ${msg}`); }

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    ok(`${label}${detail ? ' — ' + detail : ''}`);
    passed++;
  } else {
    fail(`${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function lastSegment(category) {
  return category ? category.split('/').pop() : '';
}

// Scénarios de test
const TESTS = [
  // ── PIEDS ─────────────────────────────────────────────────────────────────
  {
    name: 'PIEDS — form "hydratants pieds" → uniquement hydratants pieds',
    params: {
      p_terms: ['panthenol', 'urea', 'glycerin'],
      p_form: 'hydratants pieds',
      p_min_score: 15,
      p_limit: 24,
      p_exclude_families: [],
      p_exclude_ingredients: [],
    },
    checks: (rows) => {
      const cats = rows.map(r => lastSegment(r.category));
      const hasDeodorant = cats.some(c => c.includes('deodorant'));
      const hasHydratant = cats.some(c => c.includes('hydratant'));
      check('Retourne des résultats', rows.length > 0, `${rows.length} produits`);
      check('Pas de déodorant pieds', !hasDeodorant, cats.filter(c => c.includes('deodorant')).join(', ') || 'OK');
      check('Contient hydratants pieds', hasHydratant, cats.filter(c => c.includes('hydratant')).join(', ') || '?');
    },
  },
  {
    name: 'PIEDS — form "pieds" seul → mélange (bug référence avant fix)',
    params: {
      p_terms: ['panthenol', 'urea', 'glycerin'],
      p_form: 'pieds',
      p_min_score: 15,
      p_limit: 24,
      p_exclude_families: [],
      p_exclude_ingredients: [],
    },
    checks: (rows) => {
      const cats = rows.map(r => lastSegment(r.category));
      const hasDeodorant = cats.some(c => c.includes('deodorant'));
      const hasHydratant = cats.some(c => c.includes('hydratant'));
      const hasGommage = cats.some(c => c.includes('gommage'));
      check('Retourne des résultats', rows.length > 0, `${rows.length} produits`);
      warn(`"pieds" seul retourne du déodorant : ${hasDeodorant} — MÉLANGE ATTENDU (référence bug)`);
      info(`Catégories: ${[...new Set(cats)].join(', ')}`);
    },
  },
  {
    name: 'PIEDS — form "deodorant pieds" → uniquement déodorants pieds',
    params: {
      p_terms: ['zinc', 'baking'],
      p_form: 'deodorant pieds',
      p_min_score: 15,
      p_limit: 24,
      p_exclude_families: [],
      p_exclude_ingredients: [],
    },
    checks: (rows) => {
      const cats = rows.map(r => lastSegment(r.category));
      const allDeodorant = cats.every(c => c.includes('deodorant') || c.includes('odeur'));
      check('Retourne des résultats', rows.length > 0, `${rows.length} produits`);
      check('Tous déodorants pieds', allDeodorant, [...new Set(cats)].join(', '));
    },
  },
  {
    name: 'PIEDS — form "gommage pieds" → gommages/exfoliants uniquement',
    params: {
      p_terms: ['urea', 'salicylic'],
      p_form: 'gommage pieds',
      p_min_score: 15,
      p_limit: 24,
      p_exclude_families: [],
      p_exclude_ingredients: [],
    },
    checks: (rows) => {
      const cats = rows.map(r => lastSegment(r.category));
      const allGommage = cats.every(c => c.includes('gommage') || c.includes('exfoliant') || c.includes('callosit') || c.includes('fissur'));
      check('Retourne des résultats', rows.length > 0, `${rows.length} produits`);
      check('Tous gommages/exfoliants pieds', allGommage, [...new Set(cats)].join(', '));
    },
  },

  // ── ECZÉMA / PEAU ATOPIQUE ─────────────────────────────────────────────────
  {
    name: 'ECZÉMA — form "hydratant corps" + exclude → crèmes corps adaptées',
    params: {
      p_terms: ['panthenol', 'ceramide', 'allantoin', 'glycerin'],
      p_form: 'hydratant corps',
      p_min_score: 15,
      p_limit: 10,
      p_exclude_families: ['allergene-parfumant'],
      p_exclude_ingredients: ['parfum', 'fragrance', 'alcohol', 'alcohol denat.'],
    },
    checks: (rows) => {
      const cats = rows.map(r => lastSegment(r.category));
      const noFaceOnly = !cats.some(c => c.includes('visage') && !c.includes('corps'));
      const noWrongTypes = !cats.some(c =>
        c.includes('shampoing') || c.includes('deodorant') || c.includes('maquillage')
      );
      check('Retourne des résultats', rows.length > 0, `${rows.length} produits`);
      check('Pas de crèmes visage-seul parasites', noFaceOnly, [...new Set(cats)].join(', '));
      check('Pas de shampoing/déo/maquillage', noWrongTypes, [...new Set(cats.filter(c =>
        c.includes('shampoing') || c.includes('deodorant') || c.includes('maquillage')
      ))].join(', ') || 'OK');
      info('Catégories: ' + [...new Set(cats)].join(', '));
      info('Top 3: ' + rows.slice(0, 3).map(r => `${r.brand} ${r.name} (${r.category})`).join(' | '));
    },
  },
  {
    name: 'ECZÉMA — form null (BUG référence) → produits hors catégorie',
    params: {
      p_terms: ['panthenol', 'ceramide', 'allantoin', 'glycerin'],
      p_form: null,
      p_min_score: 15,
      p_limit: 10,
      p_exclude_families: [],
      p_exclude_ingredients: [],
    },
    checks: (rows) => {
      const cats = rows.map(r => lastSegment(r.category));
      const hasWrongType = cats.some(c =>
        c.includes('visage') || c.includes('shampoing') || c.includes('maquillage')
      );
      check('Retourne des résultats', rows.length > 0, `${rows.length} produits`);
      warn(`form=null retourne hors-catégorie : ${hasWrongType} — BUG RÉFÉRENCE`);
      info('Catégories: ' + [...new Set(cats)].slice(0, 5).join(', '));
      info('Top 3: ' + rows.slice(0, 3).map(r => `${r.name} (${r.category})`).join(' | '));
    },
  },

  // ── VISAGE ─────────────────────────────────────────────────────────────────
  {
    name: 'VISAGE — form "hydratant visage" → hydratants visage (pas corps/cheveux)',
    params: {
      p_terms: ['hyaluronic', 'glycerin', 'ceramide'],
      p_form: 'hydratant visage',
      p_min_score: 15,
      p_limit: 10,
      p_exclude_families: [],
      p_exclude_ingredients: [],
    },
    checks: (rows) => {
      const cats = rows.map(r => lastSegment(r.category));
      const hasWrong = cats.some(c =>
        (c.includes('corps') && !c.includes('visage')) || c.includes('cheveux') || c.includes('pieds') || c.includes('mains')
      );
      check('Retourne des résultats', rows.length > 0, `${rows.length} produits`);
      check('Pas de corps-seul/cheveux/pieds/mains', !hasWrong, [...new Set(cats.filter(c =>
        (c.includes('corps') && !c.includes('visage')) || c.includes('cheveux') || c.includes('pieds')
      ))].join(', ') || 'OK');
      info('Catégories: ' + [...new Set(cats)].join(', '));
    },
  },
  {
    name: 'VISAGE — form "serum visage" → sérums visage',
    params: {
      p_terms: ['niacinamide', 'ascorbic'],
      p_form: 'serum visage',
      p_min_score: 15,
      p_limit: 10,
      p_exclude_families: [],
      p_exclude_ingredients: [],
    },
    checks: (rows) => {
      const cats = rows.map(r => lastSegment(r.category));
      const allSerum = cats.every(c => c.includes('serum') || c.includes('sérum'));
      check('Retourne des résultats', rows.length > 0, `${rows.length} produits`);
      check('Tous des sérums', allSerum, [...new Set(cats)].join(', '));
    },
  },

  // ── CHEVEUX ────────────────────────────────────────────────────────────────
  {
    name: 'CHEVEUX — form "shampoing" → shampoings uniquement',
    params: {
      p_terms: ['caffeine', 'biotin', 'panthenol'],
      p_form: 'shampoing',
      p_min_score: 15,
      p_limit: 10,
      p_exclude_families: [],
      p_exclude_ingredients: [],
    },
    checks: (rows) => {
      const cats = rows.map(r => lastSegment(r.category));
      const allShampoing = cats.every(c => c.includes('shampoing') || c.includes('shampooing'));
      check('Retourne des résultats', rows.length > 0, `${rows.length} produits`);
      check('Tous des shampoings', allShampoing, [...new Set(cats)].join(', '));
    },
  },

  // ── LÈVRES ─────────────────────────────────────────────────────────────────
  {
    name: 'LÈVRES — form "baume levres" → baumes lèvres',
    params: {
      p_terms: ['butyrospermum', 'castor', 'ceramide'],
      p_form: 'baume levres',
      p_min_score: 15,
      p_limit: 10,
      p_exclude_families: [],
      p_exclude_ingredients: [],
    },
    checks: (rows) => {
      const cats = rows.map(r => lastSegment(r.category));
      const hasLevre = cats.some(c => c.includes('levre') || c.includes('lèvre') || c.includes('levres'));
      check('Retourne des résultats', rows.length > 0, `${rows.length} produits`);
      check('Produits lèvres', hasLevre, [...new Set(cats)].join(', '));
    },
  },

  // ── DÉODORANT GÉNÉRAL ──────────────────────────────────────────────────────
  {
    name: 'DÉODORANT — form "deodorant" (général, sans "pieds") → pas de déo pieds',
    params: {
      p_terms: ['zinc', 'baking'],
      p_form: 'deodorant',
      p_min_score: 15,
      p_limit: 24,
      p_exclude_families: [],
      p_exclude_ingredients: [],
    },
    checks: (rows) => {
      const cats = rows.map(r => lastSegment(r.category));
      // form "deodorant" seul devrait matcher les déodorants généralistes (aisselles)
      // et potentiellement déodorant pieds (car "pieds" n'est pas dans le form)
      const allDeodorant = cats.every(c => c.includes('deodorant'));
      check('Retourne des résultats', rows.length > 0, `${rows.length} produits`);
      check('Tous des déodorants', allDeodorant, [...new Set(cats)].join(', '));
    },
  },

  // ── MAINS ─────────────────────────────────────────────────────────────────
  {
    name: 'MAINS — form "mains" → crèmes mains',
    params: {
      p_terms: ['glycerin', 'panthenol', 'ceramide'],
      p_form: 'mains',
      p_min_score: 15,
      p_limit: 10,
      p_exclude_families: [],
      p_exclude_ingredients: [],
    },
    checks: (rows) => {
      const cats = rows.map(r => lastSegment(r.category));
      const hasMains = cats.some(c => c.includes('main'));
      const hasWrong = cats.some(c => c.includes('visage') || c.includes('corps') || c.includes('pieds'));
      check('Retourne des résultats', rows.length > 0, `${rows.length} produits`);
      check('Produits mains', hasMains, [...new Set(cats)].join(', '));
      check('Pas visage/corps/pieds', !hasWrong, [...new Set(cats)].join(', '));
    },
  },
];

// ── RUN ────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n${BOLD}=== Beauty Advisor RPC Recommendation Tests ===${RESET}\n`);

  for (const test of TESTS) {
    console.log(`\n${BOLD}${test.name}${RESET}`);
    try {
      const rows = await callRpc(test.params);
      info(`form="${test.params.p_form}", ingredients=[${test.params.p_terms.join(', ')}]`);
      test.checks(rows);
    } catch (err) {
      fail(`ERREUR: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${BOLD}=== Résultats: ${GREEN}${passed} OK${RESET}${BOLD} / ${RED}${failed} FAIL${RESET}${BOLD} ===${RESET}\n`);

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

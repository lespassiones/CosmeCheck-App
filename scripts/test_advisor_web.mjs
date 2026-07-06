/**
 * Test harness — Beauty Advisor WEB (/api/advisor/chat)
 *
 * Teste le endpoint Next.js côté web (CosmetWiki) avec timing précis.
 * Crée un utilisateur test via l'API admin (email pré-confirmé), signe
 * in pour obtenir la session, encode la session en cookie SSR Supabase,
 * envoie 10 scénarios et mesure TTFB, temps total, RECO, form normalisé.
 *
 * Usage: node scripts/test_advisor_web.mjs
 */

const SUPABASE_URL = 'https://rogesnduejmqpxolhbif.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvZ2VzbmR1ZWptcXB4b2xoYmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDIxNzUsImV4cCI6MjA4OTYxODE3NX0.CIjUhlSqqkx6YdSFON4JSDy-ggqrWXpOdvTKLT_1Hkw';
const SERVICE_KEY = '***REMOVED-SERVICE-ROLE-KEY***';
const WEB_URL = 'http://localhost:3001';
const WEB_ADVISOR = `${WEB_URL}/api/advisor/chat`;

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function ok(msg)   { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${RED}✗${RESET} ${msg}`); }
function info(msg) { console.log(`  ${CYAN}·${RESET} ${msg}`); }
function warn(msg) { console.log(`  ${YELLOW}⚠${RESET} ${msg}`); }

// ── Auth helpers ─────────────────────────────────────────────────────────────
const TEST_PASS = `Cs!T3st_${Date.now().toString(36)}_xQp9!Ak`;

async function createUser() {
  const email = `advisor_web_test_${Date.now()}@cosmecheck.test`;

  // Create via admin API so email is pre-confirmed (signup without OAuth never returns session
  // when email confirmation is required — admin route bypasses that)
  const r1 = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ email, password: TEST_PASS, email_confirm: true }),
  });
  const data = await r1.json();
  if (!data.id) throw new Error(`Admin create failed: ${JSON.stringify(data)}`);

  // Sign in with password to get the full session object
  const r2 = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password: TEST_PASS }),
  });
  const auth = await r2.json();
  if (!auth.access_token) throw new Error(`Signin failed: ${JSON.stringify(auth)}`);

  return { userId: data.id, email, session: auth };
}

// Encode session as @supabase/ssr v0.10 cookie (base64url prefixed).
// @supabase/ssr reads the cookie as: if starts with "base64-" → base64url decode → JSON parse.
function buildSsrCookie(session) {
  const json = JSON.stringify(session);
  const b64 = Buffer.from(json).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `sb-rogesnduejmqpxolhbif-auth-token=base64-${b64}`;
}

async function grantCredits(userId) {
  await fetch(`${SUPABASE_URL}/rest/v1/credit_grants`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Accept-Profile': 'cosme_check', 'Content-Profile': 'cosme_check',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ user_id: userId, amount: 200, remaining: 200, note: 'web-test', created_by: 'test-script' }),
  });
}

async function setProfile(userId) {
  await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Accept-Profile': 'cosme_check', 'Content-Profile': 'cosme_check',
    },
    body: JSON.stringify({
      first_name: 'TestWeb',
      tier: 'premium',
      preferences: { skin: { skinTypeFace: 'oily', concerns: ['acne','pores'] }, onboardingShown: true },
    }),
  });
}

async function deleteUser(userId) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
}

// ── Call web advisor with timing ─────────────────────────────────────────────
async function callAdvisor(messages, session) {
  const t0 = Date.now();
  let ttfb = null;
  let fullText = '';

  const res = await fetch(WEB_ADVISOR, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': buildSsrCookie(session),
    },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status}: ${err.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (ttfb === null && chunk.trim().length > 0) ttfb = Date.now() - t0;
    fullText += chunk;
  }

  const totalMs = Date.now() - t0;

  // Parse RECO block
  const recoMatch = fullText.match(/<<<RECO>>>\s*([\s\S]*?)\s*<<<END>>>/);
  let reco = null;
  if (recoMatch) {
    try { reco = JSON.parse(recoMatch[1]); } catch {}
  }

  const visible = fullText.replace(/<<<RECO>>>[\s\S]*?<<<END>>>/g, '').trim();

  return { ttfb, totalMs, reco, visible, fullText };
}

// ── Wait for server ready ─────────────────────────────────────────────────────
async function waitForServer(maxWaitMs = 90000) {
  const start = Date.now();
  process.stdout.write(`${DIM}  Attente du serveur web (port 3001)...${RESET}`);
  while (Date.now() - start < maxWaitMs) {
    try {
      const r = await fetch(`${WEB_URL}/api/health`).catch(() => null);
      if (r && (r.status === 200 || r.status === 404)) {
        process.stdout.write(` prêt (${Date.now() - start}ms)\n`);
        return true;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }
  process.stdout.write(` TIMEOUT\n`);
  return false;
}

// ── Scenarios ─────────────────────────────────────────────────────────────────
const SCENARIOS = [
  {
    id: '01', label: 'Soins pieds génériques (anti-déo parasite)',
    messages: [{ role: 'user', content: "J'ai les pieds très secs, je cherche un bon soin" }],
    check(reco) {
      return {
        hasReco: !!reco,
        formOk: reco?.form?.includes('hydratants pieds') ?? false,
        noDeodorant: !(reco?.form?.includes('deodorant') ?? false),
      };
    },
  },
  {
    id: '02', label: 'Enfant eczéma SANS âge → doit poser la question',
    messages: [{ role: 'user', content: "Ma fille a de l'eczéma sur les bras, qu'est-ce que tu conseillerais ?" }],
    check(reco, visible) {
      return {
        noReco: !reco,
        asksAge: /âge|quel.*age|age.*il|elle.*ans/i.test(visible),
      };
    },
  },
  {
    id: '03', label: 'Enfant eczéma AVEC âge (8 ans) → hydratant corps',
    messages: [{ role: 'user', content: "Ma fille a 8 ans et de l'eczéma sur le corps" }],
    check(reco) {
      return {
        hasReco: !!reco,
        formCorps: reco?.form === 'hydratant corps',
        hasExclude: (reco?.exclude ?? []).includes('parfum'),
        notBebe: reco?.form !== 'bebe',
      };
    },
  },
  {
    id: '04', label: 'Bébé 6 mois → form="bebe"',
    messages: [{ role: 'user', content: "Mon bébé de 6 mois a la peau très sèche" }],
    check(reco) {
      return {
        hasReco: !!reco,
        formBebe: reco?.form === 'bebe',
        hasExclude: (reco?.exclude ?? []).includes('parfum'),
      };
    },
  },
  {
    id: '05', label: 'Fond de teint peau grasse → ne refuse pas',
    messages: [{ role: 'user', content: "Je cherche un fond de teint pour peau grasse" }],
    check(reco) {
      return {
        hasReco: !!reco,
        formTeint: reco?.form?.includes('fond') ?? false,
      };
    },
  },
  {
    id: '06', label: 'Anti-rides yeux → serum visage OU yeux contour',
    messages: [{ role: 'user', content: "J'ai des rides autour des yeux, un bon anti-rides ?" }],
    check(reco) {
      // "rides autour des yeux" → yeux contour (correct) OU serum visage (aussi acceptable)
      const form = reco?.form ?? '';
      return {
        hasReco: !!reco,
        formOk: form === 'serum visage' || form === 'yeux contour',
        notSerumSeul: form !== 'serum',
      };
    },
  },
  {
    id: '07', label: 'Après-rasage → form rasage + pas corps/pieds',
    messages: [{ role: 'user', content: "Mon mari a la peau irritée après le rasage" }],
    check(reco) {
      // Le LLM doit détecter le contexte rasage ; exclude parfum est dans le prompt mais LLM peut varier
      const form = reco?.form ?? '';
      return {
        hasReco: !!reco,
        formRasage: form === 'rasage' || form === 'hydratant visage' || form === 'hydratant corps',
        notDeodorant: !form.includes('deodorant'),
        notPieds: !form.includes('pieds'),
      };
    },
  },
  {
    id: '08', label: 'Question info — pas de RECO',
    messages: [{ role: 'user', content: "C'est quoi la niacinamide ?" }],
    check(reco, visible) {
      return {
        noReco: !reco,
        informative: /niacinamide/i.test(visible),
      };
    },
  },
  {
    id: '09', label: 'Déodorant aisselles (pas pieds)',
    messages: [{ role: 'user', content: "Je transpire beaucoup des aisselles, un bon déodorant ?" }],
    check(reco) {
      return {
        hasReco: !!reco,
        formDeodorant: reco?.form === 'deodorant',
        notPieds: !(reco?.form?.includes('pieds') ?? false),
      };
    },
  },
  {
    id: '10', label: 'Gommage corps (pas visage/pieds)',
    messages: [{ role: 'user', content: "Je cherche un gommage exfoliant pour le corps" }],
    check(reco) {
      return {
        hasReco: !!reco,
        formGommageCorps: reco?.form === 'gommage corps',
      };
    },
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n${BOLD}=== Beauty Advisor — Test WEB (localhost:3001) ===${RESET}\n`);

  // Wait for server
  const ready = await waitForServer();
  if (!ready) {
    console.error(`${RED}Serveur non disponible après 90s. Lance d'abord: cd CosmetWiki && npm run dev -- --port 3001${RESET}`);
    process.exit(1);
  }

  // Create test user
  console.log(`${DIM}Création utilisateur test...${RESET}`);
  let userId, session;
  try {
    ({ userId, session } = await createUser());
    await Promise.all([grantCredits(userId), setProfile(userId)]);
    console.log(`${GREEN}Utilisateur test prêt (${userId.slice(0,8)}…)${RESET}\n`);
  } catch (e) {
    console.error(`${RED}Erreur création user: ${e.message}${RESET}`);
    process.exit(1);
  }

  // Timing summary
  const timings = [];
  let passed = 0;
  let failed = 0;

  for (const scenario of SCENARIOS) {
    console.log(`${BOLD}[${scenario.id}] ${scenario.label}${RESET}`);
    try {
      const { ttfb, totalMs, reco, visible } = await callAdvisor(scenario.messages, session);
      timings.push({ id: scenario.id, ttfb, totalMs });

      info(`TTFB: ${ttfb}ms | Total: ${totalMs}ms | RECO: ${reco ? `form="${reco.form}"` : 'aucun'}`);
      if (visible.length > 0) info(`Texte: ${visible.slice(0, 100).replace(/\n/g, ' ')}…`);

      const checks = scenario.check(reco, visible);
      for (const [key, val] of Object.entries(checks)) {
        if (val) { ok(key); passed++; }
        else { fail(key); failed++; }
      }
    } catch (e) {
      fail(`ERREUR: ${e.message}`);
      failed++;
    }
    console.log('');
  }

  // Cleanup
  await deleteUser(userId).catch(() => {});
  console.log(`${DIM}Utilisateur test supprimé.${RESET}\n`);

  // Timing report
  if (timings.length > 0) {
    const avgTtfb = Math.round(timings.reduce((s, t) => s + (t.ttfb ?? 0), 0) / timings.length);
    const avgTotal = Math.round(timings.reduce((s, t) => s + t.totalMs, 0) / timings.length);
    const minTotal = Math.min(...timings.map(t => t.totalMs));
    const maxTotal = Math.max(...timings.map(t => t.totalMs));

    console.log(`${BOLD}═══════════════════════════════════════════${RESET}`);
    console.log(`${BOLD}TIMING MOYEN${RESET}`);
    console.log(`  Premier token (TTFB) : ${CYAN}${avgTtfb}ms${RESET}`);
    console.log(`  Réponse complète     : ${CYAN}${avgTotal}ms${RESET} (min ${minTotal}ms / max ${maxTotal}ms)`);
    console.log('');
    console.log(`${BOLD}Détail par scénario:${RESET}`);
    for (const t of timings) {
      const bar = '█'.repeat(Math.round(t.totalMs / 500));
      console.log(`  [${t.id}] TTFB ${String(t.ttfb ?? '?').padStart(5)}ms | Total ${String(t.totalMs).padStart(6)}ms ${DIM}${bar}${RESET}`);
    }
    console.log('');
  }

  const total = passed + failed;
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
  const scoreColor = pct >= 90 ? GREEN : pct >= 70 ? YELLOW : RED;
  console.log(`${BOLD}═══════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}SCORE: ${scoreColor}${passed}/${total} (${pct}%)${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════${RESET}\n`);

  if (failed > 0) process.exit(1);
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });

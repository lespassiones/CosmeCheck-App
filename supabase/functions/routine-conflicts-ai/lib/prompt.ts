/**
 * Feuille PURE (ZÉRO import, zéro global Deno) : construction du prompt de
 * l'Edge `routine-conflicts-ai`.
 *
 * QUOI : `buildPrompt(req)` produit { system, user } en français, à partir de la
 * requête déjà validée par `normalize.ts`.
 *
 * POURQUOI : garder le texte du prompt versionné et testable hors runtime Deno.
 * Le prompt VERROUILLE le comportement du modèle : ne pas répéter les findings
 * déterministes, ne jamais citer un score produit, ne pas inventer d'ingrédient
 * hors `signals`, ne pas flagger vitamine C + niacinamide (mythe), tutoiement,
 * aucun tiret cadratin, sortie JSON stricte, sévérités `medium|info` uniquement
 * (le `high` reste réservé au moteur déterministe).
 *
 * ZÉRO import : la forme de la requête est redéclarée localement (parité de
 * structure avec `DeepCheckRequest` de normalize.ts) pour garder cette feuille
 * autonome et importable telle quelle par ts-jest comme par Deno.
 */

/** Version du prompt : à bumper (et à répercuter sur le préfixe de clé cache) à chaque changement. */
export const PROMPT_VERSION = 'v1'

type PromptProduct = {
  name: string
  category: string | null
  categoryPrecise: string | null
  timeOfDay: 'morning' | 'evening' | 'both' | null
  frequency: 'daily' | 'weekly' | 'monthly'
  signals: string[]
}

type PromptRequest = {
  products: PromptProduct[]
  profileSummary: string | null
  deterministicFindings: { ruleId: string; title: string }[]
}

function slotLabel(t: PromptProduct['timeOfDay']): string {
  if (t === 'morning') return 'matin'
  if (t === 'evening') return 'soir'
  if (t === 'both') return 'matin et soir'
  return 'créneau non précisé'
}

function freqLabel(f: PromptProduct['frequency']): string {
  if (f === 'weekly') return 'hebdomadaire'
  if (f === 'monthly') return 'mensuel'
  return 'quotidien'
}

export function buildPrompt(req: PromptRequest): { system: string; user: string } {
  const system = [
    'Tu es un assistant dermo-cosmétique prudent et pédagogue.',
    "Tu analyses une routine de soins pour repérer des interactions ou incohérences SUBTILES entre produits, en complément d'une analyse déterministe déjà effectuée.",
    'Règles strictes :',
    '- Tutoie l\'utilisateur.',
    '- Ne répète JAMAIS les conflits déjà listés dans "conflits_deja_detectes".',
    '- Ne cite JAMAIS de note ou de score de produit (aucune valeur du type X/20).',
    '- N\'invente aucun ingrédient : appuie-toi uniquement sur les "signaux" fournis pour chaque produit.',
    '- Ne signale JAMAIS l\'association vitamine C + niacinamide : c\'est un mythe, elle est sans risque aux formulations modernes.',
    '- N\'utilise jamais le caractère tiret cadratin.',
    '- Reste mesuré : n\'alarme pas inutilement, une routine sans problème renvoie une liste vide.',
    'Sévérités autorisées : "medium" ou "info" uniquement (jamais "high").',
    'Réponds STRICTEMENT en JSON valide, sans texte autour, au format :',
    '{ "additional_conflicts": [ { "title": string, "explanation": string, "tip": string, "severity": "medium"|"info", "products": string[] } ], "overall_note": string|null }',
    'Maximum 5 éléments dans "additional_conflicts". "overall_note" est une synthèse courte et bienveillante ou null.',
  ].join('\n')

  const productLines = req.products.map((p) => {
    const signals = p.signals.length > 0 ? p.signals.join(', ') : 'aucun signal notable'
    const cat = p.category ? ` (${p.category})` : ''
    return `- "${p.name}"${cat} | ${slotLabel(p.timeOfDay)} | usage ${freqLabel(p.frequency)} | signaux: ${signals}`
  })

  const findingLines =
    req.deterministicFindings.length > 0
      ? req.deterministicFindings.map((f) => `- ${f.title}`)
      : ['- aucun']

  const user = [
    req.profileSummary ? `Profil peau : ${req.profileSummary}` : 'Profil peau : non renseigné.',
    '',
    'Produits de la routine :',
    ...productLines,
    '',
    'Conflits déjà détectés (à NE PAS répéter) :',
    ...findingLines,
    '',
    'Repère uniquement des interactions ou incohérences SUPPLÉMENTAIRES et subtiles. Renvoie une liste vide si rien de pertinent.',
  ].join('\n')

  return { system, user }
}

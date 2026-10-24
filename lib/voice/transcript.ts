/**
 * Dictée vocale du Beauty Advisor : logique PURE (testable en Node).
 *
 * Deux niveaux de correction du texte dicté :
 *   1. `correctTranscriptLocal` : immédiate, hors ligne. Espaces, ponctuation
 *      dite à voix haute (« virgule », « point d'interrogation »…), vocabulaire
 *      cosmétique que la reconnaissance écorche (« nia sinamide » → niacinamide),
 *      majuscules, point d'interrogation des questions.
 *   2. Passe IA côté serveur (Edge Function `voice-correct`) appliquée ensuite,
 *      seulement si `acceptServerCorrection` la juge sûre et que la personne
 *      n'a pas retouché le texte entre-temps.
 *
 * Regex : ni `\b` (il ne voit pas les lettres accentuées comme des lettres), ni
 * `\p{L}` / lookbehind (support inégal selon les moteurs JS). Les bornes de mot
 * sont écrites à la main avec la classe `LETTER`.
 */

/** Langue de reconnaissance par défaut (demande produit : français). */
export const DICTATION_LANG = 'fr-FR'

/** Longueur max de la saisie de l'Advisor (même plafond que le TextInput). */
export const DICTATION_MAX_CHARS = 500

/**
 * Mots que la reconnaissance doit privilégier (biais du moteur natif :
 * `contextualStrings` iOS, `EXTRA_BIASING_STRINGS` Android 13+).
 */
export const DICTATION_CONTEXT_WORDS = [
  'Perle',
  'CosmeCheck',
  'INCI',
  'SPF',
  'niacinamide',
  'acide hyaluronique',
  'acide salicylique',
  'acide glycolique',
  'rétinol',
  'rétinal',
  'céramides',
  'vitamine C',
  'panthénol',
  'squalane',
  'parabènes',
  'silicones',
  'sulfates',
  'peau mixte',
  'peau grasse',
  'peau sèche',
  'peau sensible',
  'rosacée',
  'eczéma',
  'acné',
  'sérum',
  'crème solaire',
  'démaquillant',
]

/** Joint des morceaux de texte par une espace, sans doublon ni bord vide. */
export function joinSpoken(...parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ?? '').trim())
    .filter((p) => p.length > 0)
    .join(' ')
}

/**
 * Texte affiché dans la saisie pendant la dictée : ce qui était déjà écrit
 * (`base`), puis les phrases validées par le moteur (`committed`), puis le
 * morceau en cours de reconnaissance (`interim`, qui change à chaque mot).
 */
export function composeDraft(base: string, committed: string, interim: string): string {
  return joinSpoken(base, committed, interim).slice(0, DICTATION_MAX_CHARS)
}

/**
 * Accumulation des résultats du moteur. Un résultat FINAL s'ajoute aux phrases
 * validées ; un résultat partiel remplace seulement le morceau en cours.
 */
export function applyRecognitionResult(
  state: { committed: string; interim: string },
  transcript: string,
  isFinal: boolean,
): { committed: string; interim: string } {
  const t = transcript.trim()
  if (isFinal) {
    if (!t) return { committed: state.committed, interim: '' }
    // iOS (mode continu) renvoie en final la transcription CUMULÉE de la
    // séance : si elle reprend déjà ce qui est validé, on la prend telle quelle.
    if (state.committed && normalizeForCompare(t).startsWith(normalizeForCompare(state.committed))) {
      return { committed: t, interim: '' }
    }
    return { committed: joinSpoken(state.committed, t), interim: '' }
  }
  return { committed: state.committed, interim: t }
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalizeForCompare(s: string): string {
  return stripAccents(s.toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// ─── Correction locale ───────────────────────────────────────────────────────

/** Lettres et chiffres (dont accents français) : borne de mot faite main. */
const LETTER = "A-Za-z0-9À-ÖØ-öø-ÿŒœ"

type Replacement = string | ((match: string) => string)

/** Règle sur mot(s) entier(s). `src` ne contient que des groupes non capturants. */
function rule(src: string, rep: Replacement): [RegExp, Replacement] {
  return [new RegExp(`(^|[^${LETTER}])(${src})(?=[^${LETTER}]|$)`, 'gi'), rep]
}

function applyRules(text: string, rules: Array<[RegExp, Replacement]>): string {
  let t = text
  for (const [re, rep] of rules) {
    t = t.replace(re, (_m: string, pre: string, match: string) =>
      pre + (typeof rep === 'string' ? rep : rep(match)),
    )
  }
  return t
}

/** Ponctuation dictée à voix haute → signe. L'ordre compte (le plus long d'abord). */
const SPOKEN_PUNCTUATION: Array<[RegExp, Replacement]> = [
  rule("points? d'interrogation", '?'),
  rule("points? d'exclamation", '!'),
  rule('points? de suspension', '…'),
  rule('deux[- ]points', ':'),
  rule('point[- ]virgule', ';'),
  rule('virgule', ','),
  rule('point final', '.'),
  rule('à la ligne', '\n'),
]

/** Hésitations retirées (mots entiers, suivis d'une éventuelle virgule). */
const HESITATIONS = rule('(?:euh+|heu+|hum+|hmm+|bah|ben)(?: ?,)?', '')

/** Vocabulaire cosmétique que la reconnaissance générale écorche. */
const LEXICON: Array<[RegExp, Replacement]> = [
  rule('nia[ -]?(?:sin|cin|ci|si|ssi)[ -]?amides?', 'niacinamide'),
  rule('niacine[ -]amides?', 'niacinamide'),
  rule('acides? hyal[uo]roniques?', 'acide hyaluronique'),
  rule('acides? salic[iy]liques?', 'acide salicylique'),
  rule('acides? glycoliques?', 'acide glycolique'),
  rule('r[eé]tinole?s?', 'rétinol'),
  rule('r[eé]tinal', 'rétinal'),
  rule('c[eé]ramides?', 'céramides'),
  rule('panth[eé]nol', 'panthénol'),
  rule('squal[aeè]ne', 'squalane'),
  rule('parab[eèé]nes?', 'parabènes'),
  rule("vitamine (?:c|c'est|sait|ses?)", 'vitamine C'),
  rule('vitamine (?:e|euh)', 'vitamine E'),
  rule('(?:s\\.? ?p\\.? ?f\\.?|esse? p[eé]e? effe?|fps)', 'SPF'),
  rule('inci', 'INCI'),
  rule('cosm[eéi]+ ?t? ?check', 'CosmeCheck'),
  rule('perle', 'Perle'),
  rule('ros[ae]c[eé]e', 'rosacée'),
  rule('[eé]cz[eé]ma', 'eczéma'),
  rule('acn[eé]', 'acné'),
  rule('s[eé]rums?', (m) => (m.toLowerCase().endsWith('s') ? 'sérums' : 'sérum')),
]

/** Débuts de phrase qui en font une question (minuscules, sans accents). */
const QUESTION_STARTS = [
  'est-ce que',
  'est ce que',
  "qu'est-ce",
  "qu'est ce",
  'quel ',
  'quelle',
  'quels',
  'quelles',
  'comment',
  'pourquoi',
  'combien',
  'ou ',
  'quand',
  'peux-tu',
  'peux tu',
  'pourrais-tu',
  'pourrais tu',
  'tu peux',
  'tu pourrais',
  'tu penses',
  'tu me conseilles',
  'tu conseilles',
  'tu connais',
  'tu sais',
  'je peux ',
  'on peut ',
  'je dois ',
  'est-ce bien',
  'dois-je',
  'puis-je',
  'faut-il',
  'est-il',
  'est-elle',
  'y a-t-il',
  'y a t il',
  'a quoi',
  'que penses',
  'que me conseilles',
  'que dois',
  'lequel',
  'laquelle',
  'lesquels',
  'lesquelles',
  "c'est quoi",
  'c est quoi',
]

/** La phrase ressemble-t-elle à une question ? (heuristique sur le début) */
export function looksLikeQuestion(sentence: string): boolean {
  const s = stripAccents(sentence.trim().toLowerCase())
  if (!s) return false
  if (s.endsWith('?')) return true
  if (QUESTION_STARTS.some((q) => s.startsWith(q))) return true
  return /(^|[^a-z])est[- ]ce que /.test(s)
}

const LOWER = 'a-zà-öø-ÿœ'

function capitalizeSentences(text: string): string {
  // Première lettre du texte, puis après . ! ? … et retour à la ligne.
  const re = new RegExp(`(^|[.!?…]\\s+|\\n\\s*)([${LOWER}])`, 'g')
  return text.replace(re, (_m, pre: string, ch: string) => pre + ch.toUpperCase())
}

/**
 * Correction locale immédiate d'un texte dicté. Idempotente : la rappeler sur
 * son propre résultat ne change rien.
 */
export function correctTranscriptLocal(raw: string): string {
  // Tirets longs interdits dans l'app (remplacés par une virgule).
  let t = raw.replace(/\s*[—–]\s*/g, ', ').replace(/[ \t]+/g, ' ').trim()
  if (!t) return ''

  t = applyRules(t, [HESITATIONS])
  t = applyRules(t, SPOKEN_PUNCTUATION)
  // « SPF 50 », même si le moteur a collé les chiffres (« spf50 »).
  t = t.replace(/(^|[^A-Za-z])(?:spf|fps) ?(\d{2})(?!\d)/gi, '$1SPF $2')
  t = applyRules(t, LEXICON)

  // Typographie française simple : pas d'espace avant , . … ; une espace
  // avant ? ! : ; ; une espace après toute ponctuation suivie d'un mot.
  t = t
    .replace(/[ \t]+([,.…])/g, '$1')
    .replace(/[ \t]*([?!:;])/g, ' $1')
    .replace(new RegExp(`([,.;:?!…])(?=[${LETTER}])`, 'g'), '$1 ')
    .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/^[\s,.;:]+/, '')
    .trim()

  // Point d'interrogation final pour une question sans ponctuation finale.
  if (!/[.!?…:;,]$/.test(t)) {
    const lastSentence = t.split(/[.!?…\n]\s*/).filter(Boolean).pop() ?? t
    // « J'ai de l'eczéma, quelle crème choisir » : la question peut suivre une virgule.
    const lastClause = lastSentence.split(/[,;:]\s*/).filter(Boolean).pop() ?? lastSentence
    if (looksLikeQuestion(lastSentence) || looksLikeQuestion(lastClause)) t += ' ?'
  }

  return capitalizeSentences(t).slice(0, DICTATION_MAX_CHARS)
}

// ─── Garde-fou de la correction serveur ──────────────────────────────────────

/**
 * Si la correction locale avait repéré une question et que l'IA a fini par un
 * point (« Je peux mettre du rétinol le soir. »), on garde le « ? ».
 */
export function keepQuestionMark(local: string, server: string): string {
  const s = server.trim()
  if (local.trim().endsWith('?') && /[.]$/.test(s) && !/\.\.$/.test(s)) {
    return `${s.slice(0, -1).trimEnd()} ?`
  }
  return s
}

function words(s: string): string[] {
  return normalizeForCompare(s).split(' ').filter(Boolean)
}

/**
 * La correction IA est-elle sûre ? Elle doit garder le sens : longueur proche
 * et une large part des mots d'origine. Sinon (réponse à la question au lieu
 * de la corriger, texte inventé, vide…), on garde la correction locale.
 */
export function acceptServerCorrection(original: string, corrected: string | null | undefined): boolean {
  if (!corrected) return false
  const c = corrected.trim()
  const o = original.trim()
  if (!c || !o) return false
  if (c.length > DICTATION_MAX_CHARS) return false
  if (c.length > o.length * 1.6 + 12 || c.length < o.length * 0.5) return false
  if (/[—–]/.test(c)) return false
  const ow = words(o)
  const cw = new Set(words(c))
  if (ow.length === 0) return false
  const kept = ow.filter((w) => cw.has(w)).length
  // Courtes dictées : la reconnaissance peut se tromper sur 1 ou 2 mots.
  const minRatio = ow.length <= 4 ? 0.34 : 0.5
  return kept / ow.length >= minRatio
}

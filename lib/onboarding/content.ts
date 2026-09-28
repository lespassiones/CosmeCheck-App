/**
 * Textes et correspondances de l'onboarding « Le diagnostic de Perle ».
 *
 * Tout ce qui réagit à une réponse vit ici, en données pures : la variante de
 * « Ce que ça dit de ta peau », l'explication de chaque ingrédient à éviter,
 * la réplique après « combien de produits arrêtés », les lignes du plan, les
 * objectifs pré-cochés d'après les soucis. Les écrans n'ont plus qu'à afficher.
 *
 * Règles d'écriture : tutoiement, phrases courtes, aucun accord de genre (la
 * personne n'a pas donné le sien), aucun tiret cadratin, aucune promesse
 * médicale (« peut », « souvent », jamais « soigne »).
 */

import type {
  HairConcern,
  ProfileGoal,
  SkinConcern,
  SkinTypeBody,
  SkinTypeFace,
} from '@/lib/skin/profile'

// ── Moyenne d'ingrédients par produit ────────────────────────────────────
/**
 * Médiane mesurée sur le catalogue le 28/09/2026 : 25 ingrédients (moyenne
 * 26,9, échantillon de 1 000 produits). On garde la médiane, plus prudente.
 */
export const INGREDIENTS_PER_PRODUCT = 25

/** Produits notés avec leur liste d'ingrédients (478 532 le 28/09/2026). */
export const CATALOG_SIZE_LABEL = '470 000+'

// ── A5 : scènes vécues ───────────────────────────────────────────────────
export const PAIN_CARDS = [
  { icon: 'water-outline', title: 'La crème « peau sensible » qui pique', sub: 'Et tes joues rouges le lendemain.' },
  { icon: 'wallet-outline', title: 'Le sérum à 40 € qui ne fait rien', sub: "Fini à moitié, au fond d'un tiroir." },
  { icon: 'leaf-outline', title: "« C'est naturel, donc c'est doux »", sub: "Jusqu'à la première réaction." },
  { icon: 'search-outline', title: "La liste d'ingrédients en magasin", sub: "Tu l'as retournée, puis reposée." },
  { icon: 'radio-button-on-outline', title: 'Les boutons qui reviennent', sub: 'Sans savoir quel produit les déclenche.' },
] as const

// ── A6 : motivations ─────────────────────────────────────────────────────
export type MotivationKey =
  | 'comprendre'
  | 'achats'
  | 'souci'
  | 'eviter'
  | 'routine'
  | 'simplifier'
  | 'clean'
  | 'tout'

export const MOTIVATIONS: { key: MotivationKey; label: string }[] = [
  { key: 'comprendre', label: 'Comprendre ce que je mets sur ma peau' },
  { key: 'achats', label: 'Arrêter les achats ratés' },
  { key: 'souci', label: 'Régler un souci de peau précis' },
  { key: 'eviter', label: 'Éviter certains ingrédients' },
  { key: 'routine', label: 'Construire une routine qui marche' },
  { key: 'simplifier', label: 'Simplifier ma routine' },
  { key: 'clean', label: 'Trouver des produits plus clean' },
  { key: 'tout', label: 'Un peu tout, franchement' },
]

/**
 * Les seules motivations qui sont de vrais objectifs du profil (groupe
 * « Routine » de l'ancien questionnaire). Les autres restent de la motivation,
 * rangée à part dans `preferences.onboarding` : les stocker comme objectifs
 * ressusciterait des valeurs retirées de la taxonomie.
 */
export const MOTIVATION_GOALS: Partial<Record<MotivationKey, ProfileGoal>> = {
  simplifier: 'simplifier_routine',
  clean: 'decouvrir_clean',
}

// ── A7 : petit test de peau ──────────────────────────────────────────────
export type SkinTestAnswer = SkinTypeFace | 'inconnu'

export const SKIN_TEST_OPTIONS: { key: SkinTestAnswer; label: string }[] = [
  { key: 'grasse', label: 'Elle brille partout' },
  { key: 'mixte', label: 'Elle brille au front et au nez, pas ailleurs' },
  { key: 'seche', label: 'Elle tire, surtout après la douche' },
  { key: 'sensible', label: 'Elle chauffe ou rougit pour un rien' },
  { key: 'normale', label: 'Rien à signaler, elle est tranquille' },
  { key: 'inconnu', label: 'Aucune idée' },
]

export const SKIN_TYPE_SHORT: Record<SkinTestAnswer, string> = {
  grasse: 'grasse',
  mixte: 'mixte',
  seche: 'sèche',
  sensible: 'sensible',
  normale: 'normale',
  inconnu: '',
}

// ── A8 : ce que ça dit de ta peau ────────────────────────────────────────
export interface WatchItem {
  /** Nom INCI affiché dans la pastille orange. */
  inci: string
  /** Explication courte à côté. */
  why: string
  /** Reconnaît l'ingrédient dans une liste INCI (nom en minuscules). */
  match: RegExp
  /** Libellé dans une alerte de verdict : « Contient {label} ». */
  label: string
}

const ALCOHOL_DENAT = /^(alcohol denat\.?|alcohol|sd alcohol.*|ethanol)$/
const SLS = /^sodium lauryl sulfate$/
const PARFUM = /^(parfum|fragrance|aroma)$/

export const SKIN_REVEAL: Record<
  SkinTestAnswer,
  { title: string; text: string; watch: WatchItem[] }
> = {
  grasse: {
    title: 'Peau grasse.',
    text: "Ta peau produit beaucoup de sébum. Le réflexe, c'est de la décaper. Mauvaise idée : elle se défend en produisant encore plus.",
    watch: [
      { inci: 'Isopropyl Myristate', why: 'Peut boucher les pores', match: /^isopropyl myristate$/, label: "de l'isopropyl myristate" },
      { inci: 'Alcohol denat.', why: 'Peut relancer la brillance', match: ALCOHOL_DENAT, label: "de l'alcool asséchant" },
    ],
  },
  mixte: {
    title: 'Peau mixte.',
    text: 'Ta zone T produit plus de sébum que tes joues. Le piège : un produit pour peau grasse partout, qui assèche le reste.',
    watch: [
      { inci: 'Alcohol denat.', why: 'Assèche les joues', match: ALCOHOL_DENAT, label: "de l'alcool asséchant" },
      { inci: 'Sodium Lauryl Sulfate', why: 'Décape trop fort', match: SLS, label: 'un sulfate décapant' },
    ],
  },
  seche: {
    title: 'Peau sèche.',
    text: "Ta peau manque de gras protecteur. L'hydrater ne suffit pas, il faut aussi la nourrir.",
    watch: [
      { inci: 'Alcohol denat.', why: "L'assèche encore plus", match: ALCOHOL_DENAT, label: "de l'alcool asséchant" },
      { inci: 'Sodium Lauryl Sulfate', why: 'Abîme sa barrière', match: SLS, label: 'un sulfate décapant' },
    ],
  },
  sensible: {
    title: 'Peau sensible.',
    text: 'Ta peau réagit vite. Avec elle, moins il y a d’ingrédients, mieux elle se porte.',
    watch: [
      { inci: 'Parfum', why: "Cause fréquente d'allergie", match: PARFUM, label: 'du parfum' },
      { inci: 'Methylisothiazolinone', why: 'Conservateur très allergisant', match: /^methylisothiazolinone$/, label: 'de la methylisothiazolinone' },
    ],
  },
  normale: {
    title: 'Peau normale.',
    text: "Bonne nouvelle, ta peau est équilibrée. Le but : la garder comme ça, sans l'agresser pour rien.",
    watch: [
      { inci: 'Parfum', why: 'Inutile pour ta peau', match: PARFUM, label: 'du parfum' },
      { inci: 'Alcohol denat.', why: 'Asséchant à la longue', match: ALCOHOL_DENAT, label: "de l'alcool asséchant" },
    ],
  },
  inconnu: {
    title: 'On va le découvrir ensemble.',
    text: "Pas grave, c'est très courant. Tu pourras le préciser dans ton profil. En attendant, je te signale les ingrédients les plus irritants.",
    watch: [
      { inci: 'Parfum', why: 'Irritant fréquent', match: PARFUM, label: 'du parfum' },
      { inci: 'Alcohol denat.', why: 'Souvent asséchant', match: ALCOHOL_DENAT, label: "de l'alcool asséchant" },
    ],
  },
}

// ── Écran ajouté : peau du corps ─────────────────────────────────────────
export type BodySkinAnswer = SkinTypeBody | 'inconnu'

export const BODY_SKIN_OPTIONS: { key: BodySkinAnswer; label: string }[] = [
  { key: 'seche', label: 'Sèche, elle tire souvent' },
  { key: 'tres_seche', label: 'Très sèche, voire atopique' },
  { key: 'sensible', label: 'Sensible, elle réagit vite' },
  { key: 'mixte', label: 'Mixte, sèche par endroits' },
  { key: 'normale', label: 'Normale, sans souci' },
  { key: 'inconnu', label: 'Je ne sais pas' },
]

// ── Choix multiples de peau → profil lu par la compatibilité ─────────────
//
// Le profil (`preferences.skin`) garde UN type de peau visage et UN type corps,
// plus une « précision » en texte libre : c'est ce que lisent l'analyseur, les
// blocs IA et le Beauty Advisor. Plusieurs réponses se rangent donc ainsi :
//   - le type principal est celui qui déclenche le plus de vérifications pour
//     la compatibilité ;
//   - les autres réponses partent en précision (« Aussi : … »), lue par l'IA ;
//   - « chauffe ou rougit » au visage pré-coche le souci « Rougeurs », que la
//     compatibilité lit comme une sensibilité du VISAGE seulement.

/** Réponses qui excluent les autres (on ne peut pas être « normale » et « sèche »). */
export const FACE_EXCLUSIVE: readonly SkinTestAnswer[] = ['normale', 'inconnu']
export const BODY_EXCLUSIVE: readonly BodySkinAnswer[] = ['normale', 'inconnu']

/** Coche ou décoche une réponse en respectant les réponses exclusives. */
export function toggleAnswer<T extends string>(list: readonly T[], key: T, exclusive: readonly T[]): T[] {
  if (list.includes(key)) return list.filter((k) => k !== key)
  if (exclusive.includes(key)) return [key]
  return [...list.filter((k) => !exclusive.includes(k)), key]
}

export interface FaceSkinResolution {
  primary: SkinTestAnswer | null
  /** « Chauffe ou rougit » coché en plus d'un autre type. */
  sensitive: boolean
  /** Types cochés qui ne sont pas le type principal. */
  extras: SkinTestAnswer[]
}

export function resolveFaceSkin(selection: readonly SkinTestAnswer[]): FaceSkinResolution {
  if (selection.length === 0) return { primary: null, sensitive: false, extras: [] }
  if (selection.includes('inconnu')) return { primary: 'inconnu', sensitive: false, extras: [] }
  if (selection.includes('normale')) return { primary: 'normale', sensitive: false, extras: [] }
  const sensitive = selection.includes('sensible')
  const oily = selection.includes('grasse')
  const zoneT = selection.includes('mixte')
  const dry = selection.includes('seche')
  let primary: SkinTestAnswer
  if (zoneT || (dry && oily)) primary = 'mixte' // brille par endroits, tire ailleurs
  else if (oily) primary = 'grasse'
  else if (dry) primary = 'seche'
  else primary = 'sensible'
  const extras = selection.filter((k) => k !== primary && k !== 'sensible')
  return { primary, sensitive: sensitive && primary !== 'sensible', extras }
}

/**
 * Corps : « sensible » passe en premier, car c'est lui qui déclenche le plus de
 * vérifications (parfum ET alcool asséchant) dans la compatibilité ; la
 * sécheresse est alors gardée en précision.
 */
const BODY_PRIORITY: readonly BodySkinAnswer[] = ['sensible', 'tres_seche', 'seche', 'mixte']

export function resolveBodySkin(selection: readonly BodySkinAnswer[]): {
  primary: BodySkinAnswer | null
  extras: BodySkinAnswer[]
} {
  if (selection.length === 0) return { primary: null, extras: [] }
  if (selection.includes('inconnu')) return { primary: 'inconnu', extras: [] }
  if (selection.includes('normale')) return { primary: 'normale', extras: [] }
  const primary = BODY_PRIORITY.find((k) => selection.includes(k)) ?? selection[0]
  return { primary, extras: selection.filter((k) => k !== primary) }
}

const FACE_PRECISION: Partial<Record<SkinTestAnswer, string>> = {
  grasse: 'brille partout',
  mixte: 'zone T qui brille',
  seche: 'tire après la douche',
  sensible: 'chauffe ou rougit pour un rien',
}

const BODY_PRECISION: Partial<Record<BodySkinAnswer, string>> = {
  seche: 'sèche',
  tres_seche: 'très sèche, voire atopique',
  sensible: 'sensible, réagit vite',
  mixte: 'mixte, sèche par endroits',
}

/** Texte de précision visage (`otherSkinTypeFace`), ou `null` s'il n'y a rien à ajouter. */
export function facePrecision(selection: readonly SkinTestAnswer[]): string | null {
  const r = resolveFaceSkin(selection)
  const parts = r.extras.map((k) => FACE_PRECISION[k]).filter((s): s is string => Boolean(s))
  if (r.sensitive) parts.push(FACE_PRECISION.sensible as string)
  return parts.length > 0 ? `Aussi : ${parts.join(', ')}` : null
}

/** Texte de précision corps (`otherSkinTypeBody`), ou `null`. */
export function bodyPrecision(selection: readonly BodySkinAnswer[]): string | null {
  const r = resolveBodySkin(selection)
  const parts = r.extras.map((k) => BODY_PRECISION[k]).filter((s): s is string => Boolean(s))
  return parts.length > 0 ? `Aussi : ${parts.join(', ')}` : null
}

/** Écran « Ce que ça dit de ta peau », en tenant compte d'une peau aussi sensible. */
export function skinRevealFor(
  primary: SkinTestAnswer | null | undefined,
  sensitive = false,
): { title: string; text: string; watch: WatchItem[] } {
  const base = SKIN_REVEAL[primary ?? 'inconnu']
  if (!sensitive || !primary || primary === 'sensible' || primary === 'inconnu' || primary === 'normale') {
    return base
  }
  const extra = SKIN_REVEAL.sensible.watch[0]
  const watch = [base.watch[0], extra].filter(
    (w, i, all) => all.findIndex((o) => o.inci === w.inci) === i,
  )
  return {
    title: `Peau ${SKIN_TYPE_SHORT[primary]} et sensible.`,
    text: `${base.text} Et elle réagit vite : je surveille aussi ce qui l'irrite.`,
    watch,
  }
}

// ── A9 : soucis ──────────────────────────────────────────────────────────
export type ConcernIconKey =
  | 'boutons'
  | 'pores'
  | 'brillance'
  | 'rougeurs'
  | 'taches'
  | 'rides'
  | 'secheresse'
  | 'cernes'
  | 'reactions'
  | 'corps'
  | 'rien'

export const CONCERN_OPTIONS: {
  key: SkinConcern
  label: string
  icon: ConcernIconKey
  /** Forme reprise dans « La vérité » (« tes boutons »). */
  mine: string
}[] = [
  { key: 'acne', label: 'Boutons', icon: 'boutons', mine: 'tes boutons' },
  { key: 'pores_dilates', label: 'Points noirs et pores', icon: 'pores', mine: 'tes pores' },
  { key: 'exces_sebum', label: 'Brillance', icon: 'brillance', mine: 'ta brillance' },
  { key: 'rougeurs', label: 'Rougeurs', icon: 'rougeurs', mine: 'tes rougeurs' },
  { key: 'taches', label: 'Taches', icon: 'taches', mine: 'tes taches' },
  { key: 'rides', label: 'Rides et ridules', icon: 'rides', mine: 'tes rides' },
  { key: 'secheresse', label: 'Sécheresse', icon: 'secheresse', mine: 'ta sécheresse' },
  { key: 'cernes_poches', label: 'Cernes et poches', icon: 'cernes', mine: 'tes cernes' },
  { key: 'sensibilite', label: 'Réactions, picotements', icon: 'reactions', mine: 'tes réactions' },
  { key: 'vergetures_cellulite', label: 'Cellulite, vergetures', icon: 'corps', mine: 'tes vergetures' },
]

// ── A10 : la vérité ──────────────────────────────────────────────────────
export function truthBubble(count: number): string {
  if (count <= 0) return 'Même une peau tranquille peut réagir à un mauvais produit. Je veille pour toi.'
  if (count === 1) return 'Pour ce souci, je sais quels ingrédients regarder en premier.'
  return `Pour ces ${count} soucis, je sais quels ingrédients regarder en premier.`
}

export function truthTitle(count: number): string {
  return count <= 0
    ? 'Ta peau va bien ? Gardons-la comme ça.'
    : "Souvent, ce n'est pas ta peau le problème. C'est ce qu'on met dessus."
}

// ── Écran ajouté : objectifs ─────────────────────────────────────────────
export const GOAL_SECTIONS: { title: string; goals: { key: ProfileGoal; label: string }[] }[] = [
  {
    title: 'VISAGE',
    goals: [
      { key: 'attenuer_boutons', label: 'Moins de boutons' },
      { key: 'teint_uniforme', label: 'Un teint uniforme' },
      { key: 'calmer_rougeurs', label: 'Calmer mes rougeurs' },
      { key: 'reduire_taches', label: 'Réduire mes taches' },
      { key: 'reduire_rides', label: 'Moins de rides' },
      { key: 'hydrater_profondeur', label: 'Une peau bien hydratée' },
      { key: 'peau_douce', label: 'Une peau plus douce' },
      { key: 'renforcer_barriere', label: 'Une peau plus résistante' },
    ],
  },
  {
    title: 'CORPS',
    goals: [
      { key: 'adoucir_corps', label: 'Une peau du corps plus douce' },
      { key: 'reduire_vergetures', label: 'Moins de vergetures' },
      { key: 'proteger_soleil', label: 'Mieux me protéger du soleil' },
    ],
  },
  {
    title: 'CHEVEUX',
    goals: [
      { key: 'cheveux_brillants', label: 'Des cheveux brillants' },
      { key: 'renforcer_cheveux', label: 'Des cheveux plus forts' },
      { key: 'definir_boucles', label: 'Des boucles définies' },
      { key: 'cuir_chevelu_sain', label: 'Un cuir chevelu sain' },
      { key: 'reduire_chute', label: 'Moins de chute' },
    ],
  },
]

/** Objectif qui découle naturellement d'un souci déclaré. */
const CONCERN_TO_GOAL: Partial<Record<SkinConcern, ProfileGoal>> = {
  acne: 'attenuer_boutons',
  rougeurs: 'calmer_rougeurs',
  taches: 'reduire_taches',
  rides: 'reduire_rides',
  secheresse: 'hydrater_profondeur',
  sensibilite: 'renforcer_barriere',
  vergetures_cellulite: 'reduire_vergetures',
  exces_sebum: 'teint_uniforme',
}

/** Objectifs pré-cochés à l'arrivée sur l'écran, d'après les soucis. */
export function preselectedGoals(concerns: readonly SkinConcern[]): ProfileGoal[] {
  const out: ProfileGoal[] = []
  for (const c of concerns) {
    const g = CONCERN_TO_GOAL[c]
    if (g && !out.includes(g)) out.push(g)
  }
  return out
}

export function goalsBubble(name: string, preselected: number): string {
  const who = name ? `, ${name}` : ''
  return preselected > 0
    ? `Qu'est-ce que tu aimerais obtenir${who} ? J'ai déjà coché ce que tu m'as dit.`
    : `Qu'est-ce que tu aimerais obtenir${who} ?`
}

// ── A11 : ingrédients à éviter ───────────────────────────────────────────
export type RestrictionKey =
  | 'parfum'
  | 'huiles'
  | 'alcool'
  | 'sulfates'
  | 'silicones'
  | 'parabenes'

export const RESTRICTION_OPTIONS: {
  key: RestrictionKey
  label: string
  /** Familles `ingredient_families` (slug = tag) écrites dans le profil. */
  families: string[]
  explain: string
  /** Forme courte pour « Sans parfum ni sulfates ». */
  short: string
  /** Titre d'alerte au verdict : « Contient {alert} ». */
  alert: string
}[] = [
  {
    key: 'parfum',
    label: 'Parfum',
    families: ['parfum-synthese', 'allergene-parfumant'],
    explain: 'Il se cache aussi sous Fragrance ou Aroma, et derrière des noms comme Linalool, Limonene ou Citronellol.',
    short: 'parfum',
    alert: 'du parfum',
  },
  {
    key: 'huiles',
    label: 'Huiles essentielles',
    families: ['huile-essentielle'],
    explain: 'Elles portent leur nom latin : Lavandula Angustifolia Oil, Citrus Limon Peel Oil… Je les repère pour toi.',
    short: 'huiles essentielles',
    alert: 'des huiles essentielles',
  },
  {
    key: 'alcool',
    label: 'Alcool asséchant',
    families: ['alcool'],
    explain: 'Tous les alcools ne se valent pas. Alcohol denat. assèche, Cetearyl Alcohol adoucit. Je fais la différence.',
    short: 'alcool',
    alert: "de l'alcool asséchant",
  },
  {
    key: 'sulfates',
    label: 'Sulfates',
    families: ['sulfate'],
    explain: 'Sodium Lauryl Sulfate, Sodium Laureth Sulfate : ils moussent bien, et décapent aussi. Je les repère pour toi.',
    short: 'sulfates',
    alert: 'des sulfates',
  },
  {
    key: 'silicones',
    label: 'Silicones',
    families: ['silicone'],
    explain: 'Ils finissent souvent en -cone ou -siloxane : Dimethicone, Cyclopentasiloxane.',
    short: 'silicones',
    alert: 'des silicones',
  },
  {
    key: 'parabenes',
    label: 'Parabènes',
    families: ['paraben'],
    explain: 'Ils finissent tous par -paraben : Methylparaben, Propylparaben.',
    short: 'parabènes',
    alert: 'des parabènes',
  },
]

export const RESTRICTION_NONE_EXPLAIN = 'Parfait. Tu pourras en ajouter à tout moment depuis ton profil.'

/** « Sans parfum ni sulfates », « Sans parfum, sulfates ni silicones ». */
export function withoutLabel(shorts: readonly string[]): string | null {
  if (shorts.length === 0) return null
  if (shorts.length === 1) return `Sans ${shorts[0]}`
  const head = shorts.slice(0, -1).join(', ')
  return `Sans ${head} ni ${shorts[shorts.length - 1]}`
}

// ── A12 à A14 : volume, projection, cobaye ──────────────────────────────
export const VOLUME_OPTIONS: { value: number; label: string; filled: 1 | 2 | 3 | 4 }[] = [
  { value: 2, label: '1 à 3', filled: 1 },
  { value: 5, label: '4 à 6', filled: 2 },
  { value: 8, label: '7 à 10', filled: 3 },
  { value: 12, label: 'Plus de 10, je préfère ne pas compter', filled: 4 },
]

export function ingredientsPerDay(productsPerDay: number): number {
  return Math.max(0, Math.round(productsPerDay)) * INGREDIENTS_PER_PRODUCT
}

export type AbandonedKey = 'aucun' | 'un_deux' | 'trois_cinq' | 'plus_cinq'

export const ABANDONED_OPTIONS: { key: AbandonedKey; label: string; reaction: string }[] = [
  { key: 'aucun', label: 'Aucun', reaction: "Bravo, c'est rare. On va faire en sorte que ça continue." },
  { key: 'un_deux', label: '1 ou 2', reaction: "2 fois cobaye, c'est déjà 2 fois de trop. La prochaine fois, tu le sauras avant de payer." },
  { key: 'trois_cinq', label: '3 à 5', reaction: '4 fois, ta peau a servi de cobaye. La prochaine fois, tu le sauras avant de payer.' },
  { key: 'plus_cinq', label: 'Plus de 5', reaction: "Plus de 5 fois cobaye, et combien d'euros avec ? On arrête ça ensemble." },
]

// ── A15 : le plan ────────────────────────────────────────────────────────
export interface PlanInput {
  skin: SkinTestAnswer | null
  concerns: readonly SkinConcern[]
  restrictionShorts: readonly string[]
}

/** Début de la phrase : « Pour ta peau mixte et tes 3 soucis ». */
export function planLead(p: PlanInput): { before: string; skin: string | null; middle: string; concerns: string | null } {
  const skin = p.skin && p.skin !== 'inconnu' ? `peau ${SKIN_TYPE_SHORT[p.skin]}` : null
  const n = p.concerns.length
  const concerns = n === 0 ? null : n === 1 ? 'ton souci' : `${n} soucis`
  if (skin && concerns) {
    return { before: 'Pour ta ', skin, middle: n === 1 ? ' et ' : ' et tes ', concerns }
  }
  if (skin) return { before: 'Pour ta ', skin, middle: '', concerns: null }
  if (concerns) return { before: n === 1 ? 'Pour ' : 'Pour tes ', skin: null, middle: '', concerns }
  return { before: 'Pour ta peau', skin: null, middle: '', concerns: null }
}

/**
 * Ce que le plan promet (textes validés le 28/09/2026). La personnalisation
 * vit dans la phrase d'introduction (`planLead` : « Pour ta peau sèche et tes
 * 2 soucis ») ; ces cinq lignes restent courtes et directes.
 *
 * « à risque » plutôt que « dangereux » : l'app ne pose pas de diagnostic, et
 * c'est le vocabulaire déjà employé ailleurs (« Éviter les ingrédients risqués »).
 */
export function planLines(_p?: PlanInput): { icon: string; text: string }[] {
  return [
    { icon: 'person-circle-outline', text: 'Des produits qui correspondent parfaitement à ton profil' },
    { icon: 'flask-outline', text: 'Des ingrédients faits pour toi, pensés pour tes objectifs' },
    { icon: 'shield-checkmark-outline', text: 'Les ingrédients à risque signalés dans chaque produit que tu scannes' },
    { icon: 'partly-sunny-outline', text: 'Une routine simple, sans doublons' },
    { icon: 'checkmark-circle-outline', text: "Plus aucun achat à l'aveugle" },
  ]
}

/** Produits ratés « évités » par an, repris de la réponse A14 (mêmes chiffres que la réaction de Perle). */
const ABANDONED_AVOIDED: Record<AbandonedKey, number> = { aucun: 0, un_deux: 2, trois_cinq: 4, plus_cinq: 5 }

/**
 * Notes chiffrées du graphe du plan : ce que la personne GAGNE avec nous.
 * Chaque chiffre vient de ses réponses, jamais d'une statistique inventée :
 *   - en haut de la courbe : sa routine vérifiée à 100 % ;
 *   - la note manuscrite : les produits ratés de l'année (A14) en moins, ou,
 *     si elle n'en a raté aucun, ses ingrédients du quotidien décryptés (A13).
 */
export function planChartNotes(p: {
  productsPerDay: number | null | undefined
  abandoned: AbandonedKey | null | undefined
}): { tag: string; note: string } {
  const avoided = p.abandoned ? ABANDONED_AVOIDED[p.abandoned] : 0
  return {
    tag: '100 % de ta routine vérifiée',
    note:
      avoided > 0
        ? `-${avoided} produits ratés par an`
        : `${ingredientsPerDay(p.productsPerDay ?? 5)} ingrédients décryptés`,
  }
}

function withArticle(short: string): string {
  if (short === 'parfum') return 'le parfum'
  if (short === 'alcool') return "l'alcool"
  return `les ${short}`
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`
}

// ── A18 : cheveux ────────────────────────────────────────────────────────
export const HAIR_OPTIONS: { key: HairConcern | 'ok'; label: string }[] = [
  { key: 'secs', label: 'Secs' },
  { key: 'gras', label: 'Gras' },
  { key: 'ternes_cassants', label: 'Ternes ou cassants' },
  { key: 'cuir_chevelu_sensible', label: 'Cuir chevelu sensible' },
  { key: 'pellicules', label: 'Pellicules' },
  { key: 'chute', label: 'Chute' },
  { key: 'ok', label: 'Ça va très bien' },
]

// ── A20 : le montage ─────────────────────────────────────────────────────
export function montageLines(p: {
  skin: SkinTestAnswer | null
  restrictionShorts: readonly string[]
}): string[] {
  const lines = ['Je lis tes réponses…']
  if (p.skin && p.skin !== 'inconnu') lines.push(`Je note ta peau ${SKIN_TYPE_SHORT[p.skin]}…`)
  else lines.push('Je prépare ta carte de peau…')
  if (p.restrictionShorts.length > 0) {
    lines.push(`J'ajoute ${joinAnd(p.restrictionShorts.map(withArticle))} à ta liste…`)
  } else {
    lines.push('Je règle tes alertes ingrédients…')
  }
  lines.push('Je prépare tes alternatives…')
  return lines
}

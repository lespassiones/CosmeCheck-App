/**
 * Moteur DÉTERMINISTE de détection des conflits de routine.
 *
 * QUOI : à partir des produits d'une routine (matin/soir), du profil peau et
 * des restrictions de l'utilisateur, produit une liste ordonnée et stable de
 * `RoutineConflict` (association irritante, exfoliant sans SPF, allergène en
 * double, ingrédient restreint, etc.). 100 % local, gratuit, sans IA.
 *
 * POURQUOI : donner un signal immédiat et fiable dès l'ouverture de l'onglet
 * routine (badge + bottom sheet), sans dépendre du réseau ni consommer de
 * crédit. L'analyse IA approfondie (Edge `routine-conflicts-ai`) ne fait que
 * NUANCER par-dessus ce socle déterministe.
 *
 * Contraintes éditoriales : aucune chaîne ne contient U+2014 (tiret cadratin) ;
 * aucun score produit /20 n'apparaît jamais (vocabulaire pastille uniquement).
 *
 * Fréquence : PAS de gate. Un produit hebdomadaire en conflit reste un conflit
 * (le tip demeure valable) ; la fréquence est transmise à l'IA pour nuance.
 *
 * MYTHE Vitamine C + Niacinamide : JAMAIS flaggé. La prétendue incompatibilité
 * vient d'études des années 1960 sur des formes instables chauffées ; aux pH et
 * concentrations des formules modernes le complexe niacinamide-ascorbate ne se
 * forme pas en conditions d'usage. Flagger nuirait à la crédibilité. Un test
 * dédié vérifie l'absence de conflit sur ce couple.
 */
import type { AnalyseItem, EuFragranceAllergens } from '@/lib/analysis/types'
import type { SkinProfile } from '@/lib/skin/profile'
import type { UserRestrictions } from '@/lib/supabase/types'
import type { IngredientFamily } from '@/lib/restrictions/check'
import { checkRestrictions } from '@/lib/restrictions/check'
import { computeAllergenOverlap } from '@/lib/routine/engine'
import {
  ACTIVE_CLASS_LABEL,
  ALCOHOL_TAG,
  ESSENTIAL_OIL_TAG,
  classifyItem,
  isSunscreenProduct,
  type ActiveClass,
} from '@/lib/inci/activesDictionary'

export type TimeOfDay = 'morning' | 'evening' | 'both'
export type ConflictSeverity = 'high' | 'medium' | 'info'
export type ConflictSlot = 'morning' | 'evening' | 'both' | null

export type ConflictInput = {
  analysisId: string
  name: string
  /** null => traité comme 'both' (le chantier time_of_day peut ne pas être mergé). */
  timeOfDay: TimeOfDay | null
  frequency: 'daily' | 'weekly' | 'monthly'
  category: string | null
  categoryPrecise: string | null
  productType: string | null
  items: AnalyseItem[]
  euAllergens: EuFragranceAllergens | null
}

export type RoutineConflict = {
  /** `${ruleId}:${productIds triés et joints par ','}` (stable, indépendant de l'ordre). */
  id: string
  ruleId: string
  severity: ConflictSeverity
  title: string
  explanation: string
  tip: string
  productIds: string[]
  slot: ConflictSlot
}

// ─── Helpers publics ────────────────────────────────────────────────────────

export function conflictId(ruleId: string, productIds: string[]): string {
  return `${ruleId}:${[...productIds].sort().join(',')}`
}

/** Badge = nombre de conflits actionnables (les `info` sont pédagogiques). */
export function countBadgeConflicts(conflicts: RoutineConflict[]): number {
  return conflicts.filter((c) => c.severity !== 'info').length
}

/** Descend d'un cran : high -> medium -> info (info reste info). */
export function downgrade(sev: ConflictSeverity): ConflictSeverity {
  if (sev === 'high') return 'medium'
  if (sev === 'medium') return 'info'
  return 'info'
}

// ─── Helpers internes ─────────────────────────────────────────────────────

const SEVERITY_RANK: Record<ConflictSeverity, number> = { high: 0, medium: 1, info: 2 }

/** Vrai quand l'item est en trace (après premier parfum OU premier conservateur). */
function isInTrace(item: AnalyseItem): boolean {
  return (
    item.thresholdContext === 'after_fragrance' ||
    item.thresholdContext === 'after_preservative'
  )
}

/** Mot de créneau pour les explications de paire. */
function slotWord(slot: ConflictSlot): string {
  if (slot === 'morning') return 'le même matin'
  if (slot === 'evening') return 'le même soir'
  return 'matin et soir'
}

type Slot = 'morning' | 'evening'

/** Vue analysée d'un produit : slots occupés + items par classe d'actif. */
type Analyzed = {
  input: ConflictInput
  slots: Slot[]
  classItems: Map<ActiveClass, AnalyseItem[]>
}

function slotsOf(p: ConflictInput): Slot[] {
  if (p.timeOfDay === 'morning') return ['morning']
  if (p.timeOfDay === 'evening') return ['evening']
  // 'both' OU null (défensif tant que time_of_day n'est pas renseigné).
  return ['morning', 'evening']
}

function analyze(p: ConflictInput): Analyzed {
  const classItems = new Map<ActiveClass, AnalyseItem[]>()
  for (const it of p.items) {
    for (const cls of classifyItem(it.slug, it.tags)) {
      const list = classItems.get(cls)
      if (list) list.push(it)
      else classItems.set(cls, [it])
    }
  }
  return { input: p, slots: slotsOf(p), classItems }
}

function hasClass(a: Analyzed, cls: ActiveClass): boolean {
  return (a.classItems.get(cls)?.length ?? 0) > 0
}

function hasExfoliant(a: Analyzed): boolean {
  return hasClass(a, 'aha') || hasClass(a, 'bha') || hasClass(a, 'pha')
}

/** Vrai si TOUS les items déclencheurs de cette classe sont en trace. */
function classAllTrace(a: Analyzed, cls: ActiveClass): boolean {
  const list = a.classItems.get(cls) ?? []
  return list.length > 0 && list.every(isInTrace)
}

/** Nom représentatif d'une classe dans un produit (item name sinon libellé de classe). */
function classRepName(a: Analyzed, cls: ActiveClass): string {
  const it = a.classItems.get(cls)?.[0]
  const nm = it?.name?.trim()
  return nm && nm.length > 0 ? nm : ACTIVE_CLASS_LABEL[cls]
}

/** Créneau de chevauchement entre deux produits (null si aucun). */
function overlapSlot(a: Analyzed, b: Analyzed): ConflictSlot {
  const inter = a.slots.filter((s) => b.slots.includes(s))
  if (inter.length === 0) return null
  if (inter.length === 2) return 'both'
  return inter[0]
}

function sunscreenSignals(p: ConflictInput) {
  return {
    category: p.category,
    categoryPrecise: p.categoryPrecise,
    productType: p.productType,
    itemTags: p.items.map((it) => ({ tags: it.tags ?? [], position: it.position })),
  }
}

/** Concerns du profil (tolérant : jamais undefined). */
function concernsOf(profile: SkinProfile): Set<string> {
  return new Set(profile.concerns ?? [])
}

// ─── Moteur ─────────────────────────────────────────────────────────────────

const EXFOLIANT_CLASSES: ActiveClass[] = ['aha', 'bha', 'pha']

export function detectConflicts(
  products: ConflictInput[],
  profile: SkinProfile,
  restrictions: UserRestrictions,
  families: IngredientFamily[],
): RoutineConflict[] {
  const raw: RoutineConflict[] = []
  const analyzed = products.map(analyze)
  const concerns = concernsOf(profile)
  const sensitiveProfile = concerns.has('sensibilite') || concerns.has('rougeurs')

  const push = (
    ruleId: string,
    severity: ConflictSeverity,
    title: string,
    explanation: string,
    tip: string,
    productIds: string[],
    slot: ConflictSlot,
  ) => {
    raw.push({
      id: conflictId(ruleId, productIds),
      ruleId,
      severity,
      title,
      explanation,
      tip,
      productIds,
      slot,
    })
  }

  // ── R01 rétinoïde + exfoliant même créneau (1 conflit par paire) ─────────
  for (let i = 0; i < analyzed.length; i++) {
    for (let j = 0; j < analyzed.length; j++) {
      if (i === j) continue
      const a = analyzed[i]
      const b = analyzed[j]
      if (!hasClass(a, 'retinoid') || !hasExfoliant(b)) continue
      const slot = overlapSlot(a, b)
      if (slot === null) continue
      // Classe exfoliante représentative de B (ordre aha > bha > pha).
      const exfCls = EXFOLIANT_CLASSES.find((c) => hasClass(b, c))!
      let sev: ConflictSeverity = 'high'
      // Downgrade trace : si tous les items d'un côté sont en trace.
      if (classAllTrace(a, 'retinoid') || classAllTrace(b, exfCls)) sev = downgrade(sev)
      push(
        'retinoid-exfoliant-same-slot',
        sev,
        `${classRepName(a, 'retinoid')} + ${classRepName(b, exfCls)}`,
        `Association irritante ${slotWord(slot)}.`,
        'Utilise-les un soir sur deux.',
        [a.input.analysisId, b.input.analysisId],
        slot,
      )
    }
  }

  // ── R02 rétinoïde + vitamine C même créneau ──────────────────────────────
  for (let i = 0; i < analyzed.length; i++) {
    for (let j = 0; j < analyzed.length; j++) {
      if (i === j) continue
      const a = analyzed[i]
      const b = analyzed[j]
      if (!hasClass(a, 'retinoid')) continue
      const isPure = hasClass(b, 'vitc_pure')
      const isDeriv = hasClass(b, 'vitc_derivative')
      if (!isPure && !isDeriv) continue
      const slot = overlapSlot(a, b)
      if (slot === null) continue
      let sev: ConflictSeverity = isPure ? 'medium' : 'info'
      const vitCls: ActiveClass = isPure ? 'vitc_pure' : 'vitc_derivative'
      if (classAllTrace(a, 'retinoid') || classAllTrace(b, vitCls)) sev = downgrade(sev)
      const vitLabel = isPure ? 'Vitamine C pure' : ACTIVE_CLASS_LABEL.vitc_derivative
      push(
        'retinoid-vitc-same-slot',
        sev,
        `${classRepName(a, 'retinoid')} + ${vitLabel}`,
        'Moins efficace et plus irritant ensemble.',
        'Vitamine C le matin, rétinol le soir.',
        [a.input.analysisId, b.input.analysisId],
        slot,
      )
    }
  }

  // ── R03 rétinoïde le matin ───────────────────────────────────────────────
  for (const a of analyzed) {
    if (!hasClass(a, 'retinoid')) continue
    if (!a.slots.includes('morning')) continue
    let sev: ConflictSeverity = 'medium'
    if (classAllTrace(a, 'retinoid')) sev = downgrade(sev)
    push(
      'retinoid-morning',
      sev,
      'Rétinoïde le matin',
      'Photosensibilisant, à réserver au soir.',
      'Déplace-le vers le soir.',
      [a.input.analysisId],
      'morning',
    )
  }

  // ── SPF présent le matin ? (partagé R04 / R05) ───────────────────────────
  const morningProducts = analyzed.filter((a) => a.slots.includes('morning'))
  const morningHasSpf = morningProducts.some((a) => isSunscreenProduct(sunscreenSignals(a.input)))

  // ── R04 exfoliant (AHA/BHA) le matin sans SPF ────────────────────────────
  const morningExfoliants = morningProducts.filter((a) => hasClass(a, 'aha') || hasClass(a, 'bha'))
  if (morningExfoliants.length > 0 && !morningHasSpf) {
    let sev: ConflictSeverity = 'high'
    // Downgrade trace : tous les items exfoliants déclencheurs en trace.
    const triggerItems: AnalyseItem[] = []
    for (const a of morningExfoliants) {
      for (const cls of ['aha', 'bha'] as ActiveClass[]) {
        for (const it of a.classItems.get(cls) ?? []) triggerItems.push(it)
      }
    }
    if (triggerItems.length > 0 && triggerItems.every(isInTrace)) sev = downgrade(sev)
    push(
      'acids-morning-no-spf',
      sev,
      'Exfoliant le matin sans SPF',
      'Acides photosensibilisants, pas de SPF le matin.',
      'Ajoute un SPF le matin.',
      morningExfoliants.map((a) => a.input.analysisId),
      'morning',
    )
  }

  // ── R05 rétinoïde (tout créneau) sans SPF le matin ───────────────────────
  const retinoidProducts = analyzed.filter((a) => hasClass(a, 'retinoid'))
  if (retinoidProducts.length > 0 && !morningHasSpf) {
    push(
      'retinoid-no-morning-spf',
      'info',
      'Rétinoïde sans SPF le matin',
      'Rétinoïde le soir : SPF conseillé le lendemain.',
      'Ajoute un SPF le matin.',
      retinoidProducts.map((a) => a.input.analysisId),
      'morning',
    )
  }

  // ── R06 sur-exfoliation (>= 3 produits exfoliants toute la routine) ──────
  const exfoliantProducts = analyzed.filter(hasExfoliant)
  if (exfoliantProducts.length >= 3) {
    const sev: ConflictSeverity = sensitiveProfile ? 'high' : 'medium'
    push(
      'over-exfoliation',
      sev,
      'Plusieurs exfoliants dans ta routine',
      `${exfoliantProducts.length} exfoliants : risque de sur-exfoliation.`,
      'Garde-en un seul, espace les autres.',
      exfoliantProducts.map((a) => a.input.analysisId),
      null,
    )
  }

  // ── R07 peroxyde de benzoyle + rétinoïde même créneau ────────────────────
  for (let i = 0; i < analyzed.length; i++) {
    for (let j = 0; j < analyzed.length; j++) {
      if (i === j) continue
      const a = analyzed[i]
      const b = analyzed[j]
      if (!hasClass(a, 'benzoyl_peroxide') || !hasClass(b, 'retinoid')) continue
      const slot = overlapSlot(a, b)
      if (slot === null) continue
      let sev: ConflictSeverity = 'high'
      if (classAllTrace(a, 'benzoyl_peroxide') || classAllTrace(b, 'retinoid')) sev = downgrade(sev)
      push(
        'bpo-retinoid-same-slot',
        sev,
        `Peroxyde de benzoyle + ${classRepName(b, 'retinoid')}`,
        'Deux irritants sur le même créneau.',
        'Alterne : peroxyde le matin, rétinoïde le soir.',
        [a.input.analysisId, b.input.analysisId],
        slot,
      )
    }
  }

  // NOTE : Vitamine C + Niacinamide n'est JAMAIS émis (mythe, cf. en-tête).

  // ── R09 allergène parfumant en double (>= 2 produits) ────────────────────
  const overlaps = computeAllergenOverlap(
    products.map((p) => ({ id: p.analysisId, result: { items: p.items } })),
  )
  for (const ov of overlaps) {
    const sev: ConflictSeverity = sensitiveProfile ? 'medium' : 'info'
    push(
      'allergen-duplication',
      sev,
      `Allergène en double : ${ov.label}`,
      `Présent dans ${ov.productIds.length} produits.`,
      'Limite les produits parfumés le même jour.',
      ov.productIds,
      null,
    )
  }

  // ── R10 alcool desséchant et peau sèche/sensible ─────────────────────────
  const dry = concerns.has('secheresse') || profile.skinTypeFace === 'seche'
  const alcoholRisk =
    dry || concerns.has('sensibilite') || profile.skinTypeFace === 'sensible'
  if (alcoholRisk) {
    const word = dry ? 'sèche' : 'sensible'
    for (const a of analyzed) {
      const hasAlcohol = a.input.items.some(
        (it) =>
          it.position > 0 &&
          it.position <= 8 &&
          !isInTrace(it) &&
          (it.tags ?? []).includes(ALCOHOL_TAG),
      )
      if (!hasAlcohol) continue
      push(
        'alcohol-dry-skin',
        'medium',
        `Alcool et peau ${word}`,
        'Alcool en tête de formule, dessèche.',
        'Usage ponctuel ou version sans alcool.',
        [a.input.analysisId],
        null,
      )
    }
  }

  // ── R11 huiles essentielles et peau sensible ─────────────────────────────
  if (concerns.has('sensibilite')) {
    const eoProducts = analyzed.filter((a) =>
      a.input.items.some((it) => !isInTrace(it) && (it.tags ?? []).includes(ESSENTIAL_OIL_TAG)),
    )
    if (eoProducts.length > 0) {
      push(
        'essential-oils-sensitive',
        'medium',
        'Huiles essentielles et peau sensible',
        `${eoProducts.length} produit(s) avec huiles essentielles.`,
        'Introduis-les un par un.',
        eoProducts.map((a) => a.input.analysisId),
        null,
      )
    }
  }

  // ── R12 ingrédient restreint (par produit) ───────────────────────────────
  // Pas de downgrade trace : une restriction reste une restriction.
  for (const p of products) {
    const matches = checkRestrictions(p.items, restrictions, families)
    if (matches.length === 0) continue
    const first = matches[0].label
    const label = matches.length > 1 ? `${first} + ${matches.length - 1} autres` : first
    push(
      'restricted-ingredient',
      'high',
      'Ingrédient que tu évites',
      `Contient ${label}.`,
      'Remplace-le par une alternative.',
      [p.analysisId],
      null,
    )
  }

  // Dédoublonnage par id (R01/R07 bidirectionnels), puis ordre déterministe.
  const byId = new Map<string, RoutineConflict>()
  for (const c of raw) {
    if (!byId.has(c.id)) byId.set(c.id, c)
  }
  return Array.from(byId.values()).sort((a, b) => {
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    }
    if (a.ruleId !== b.ruleId) return a.ruleId < b.ruleId ? -1 : 1
    return a.productIds.join(',') < b.productIds.join(',') ? -1 : a.productIds.join(',') > b.productIds.join(',') ? 1 : 0
  })
}

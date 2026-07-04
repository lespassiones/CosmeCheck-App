/**
 * NOTATION PROPRIÉTAIRE CosmeCheck — moteur PASTILLE (miroir mobile de
 * `supabase/functions/analyser/score.ts`). Couleurs par ingrédient dérivées de
 * sources PUBLIQUES (règlement CE 1223/2009 : annexes II/III/IV/V/VI + CMR,
 * perturbateurs endocriniens, 26 allergènes UE) — plus AUCUNE dépendance à la
 * source tierce.
 *
 * On calcule une pastille (position + composition, NON dégressive) puis on la
 * synthétise en score 0–20 dans la bande correspondante, pour que
 * `verdictToneFromScore` (essentiel/engine) et tout le tri retombent
 * EXACTEMENT sur la pastille.
 *
 * Doit rester en parité avec la version Edge et `Cosme-Scraper/rescore_lab/
 * derive_product_pastille.py`.
 */
import type { VerdictTone } from '../essentiel/engine'

export type PastilleColor = 'Vert' | 'Jaune' | 'Orange' | 'Rouge'

const RANK: Record<PastilleColor, number> = { Vert: 0, Jaune: 1, Orange: 2, Rouge: 3 }
const UNRANK: Record<number, PastilleColor> = { 0: 'Vert', 1: 'Jaune', 2: 'Orange', 3: 'Rouge' }

export type PastilleResult = {
  tone: VerdictTone
  reason: string
  nVert: number
  nJaune: number
  nOrange: number
  nRouge: number
  nIdent: number
}

/**
 * Pastille d'un produit à partir des couleurs positionnées.
 * @param gate  si true → "unknown" quand < 50 % identifiés (bulk catalogue) ;
 *              false pour un scan/affichage en direct.
 */
export function pastilleTone(
  colored: { color: PastilleColor | null | undefined; position: number }[],
  totalInci: number,
  gate = false,
): PastilleResult {
  const ident = colored
    .filter((c): c is { color: PastilleColor; position: number } => !!c.color && c.color in RANK)
    .slice()
    .sort((a, b) => a.position - b.position)
  const n = ident.length
  let nVert = 0, nJaune = 0, nOrange = 0, nRouge = 0
  for (const { color } of ident) {
    if (color === 'Vert') nVert++
    else if (color === 'Jaune') nJaune++
    else if (color === 'Orange') nOrange++
    else if (color === 'Rouge') nRouge++
  }
  const base = { nVert, nJaune, nOrange, nRouge, nIdent: n }

  if (n === 0 || (gate && totalInci && n / totalInci < 0.5)) {
    return { tone: 'unknown', reason: "Trop d'ingrédients non identifiés", ...base }
  }

  // ── BRANCHE DOUCE : uniquement vert + jaune ──
  // Forcément vert ; œil jaune UNIQUEMENT si les jaunes dépassent les verts.
  if (nOrange === 0 && nRouge === 0) {
    if (nJaune > nVert) return { tone: 'caution', reason: `jaunes ${nJaune} > verts ${nVert}`, ...base }
    if (nJaune === 0) return { tone: 'very-safe', reason: `${nVert} verts, aucun à surveiller`, ...base }
    return { tone: 'safe', reason: `${nVert} verts / ${nJaune} jaunes`, ...base }
  }

  // ── BRANCHE SÉVÈRE : au moins un orange/rouge (position + composition) ──
  const corpsMax = Math.ceil(0.6 * n)
  const zoneOf = (rank1: number): 'Tete' | 'Corps' | 'Queue' =>
    rank1 <= 5 ? 'Tete' : rank1 <= corpsMax ? 'Corps' : 'Queue'

  let ceiling = 0
  let cntRouge = 0, cntOrange = 0
  let sgood = 0, stot = 0
  ident.forEach(({ color }, i) => {
    const z = zoneOf(i + 1)
    const w = z === 'Tete' ? 3 : z === 'Corps' ? 2 : 1
    stot += w
    if (color === 'Vert') sgood += w
    else if (color === 'Jaune') sgood += 0.5 * w
    if (color === 'Rouge') {
      cntRouge++
      ceiling = Math.max(ceiling, z === 'Tete' ? 3 : z === 'Corps' ? 2 : 1)
    } else if (color === 'Orange') {
      cntOrange++
      // V2 (allègement) : un orange isolé ne plafonne qu'à Jaune (rien en queue).
      ceiling = Math.max(ceiling, z === 'Queue' ? 0 : 1)
    }
  })
  if (cntRouge >= 2) ceiling = Math.max(ceiling, 2)
  if (cntOrange >= 4) ceiling = Math.max(ceiling, 2)

  const ratio = stot ? sgood / stot : 0
  const comp = ratio >= 0.8 ? 0 : ratio >= 0.55 ? 1 : ratio >= 0.32 ? 2 : 3
  // Sans AUCUN rouge, la composition seule ne peut pas descendre en "rouge"
  // (danger) : un produit 100 % orange = orange (warning), pas danger.
  const compCapped = cntRouge === 0 ? Math.min(comp, 2) : comp
  const final = Math.max(ceiling, compCapped)
  const reason = `plafond=${UNRANK[ceiling]} compo=${UNRANK[comp]} (ratio ${ratio.toFixed(2)}) ${n} ingr.`
  if (final === 3) return { tone: cntRouge >= 2 ? 'high-risk' : 'danger', reason, ...base }
  if (final === 2) return { tone: 'warning', reason, ...base }
  if (final === 1) return { tone: 'caution', reason, ...base }
  return { tone: 'safe', reason, ...base }
}

// Bandes de score synthétisé par pastille [base, largeur] (cf. finalize_local.py).
const BAND: Record<Exclude<VerdictTone, 'unknown'>, [number, number]> = {
  'very-safe': [17.0, 3.0],
  safe: [13.0, 3.9],
  caution: [9.0, 3.9],
  warning: [5.0, 3.9],
  danger: [0.0, 4.9],
  'high-risk': [0.0, 2.0],
}

/** Score 0–20 synthétisé dans la bande de la pastille ; null si indéterminée. */
export function synthScore(p: PastilleResult): number | null {
  if (p.tone === 'unknown') return null
  const [b, w] = BAND[p.tone]
  const ratio = p.nIdent ? (p.nVert + 0.5 * p.nJaune) / p.nIdent : 0
  return Math.round((b + w * ratio) * 100) / 100
}

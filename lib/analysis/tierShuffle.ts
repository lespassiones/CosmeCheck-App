/**
 * Mélange « aléatoire contrôlé » des alternatives — À GARDER EN PHASE avec le web
 * (CosmetWiki/lib/alternatives/tierShuffle.ts).
 *
 * On préserve l'ORDRE DES NIVEAUX de pastille (le meilleur tier d'abord :
 * cœur vert ≥17, feuille verte ≥13, jaune ≥9, orange ≥5, rouge <5) mais on
 * MÉLANGE les produits À L'INTÉRIEUR de chaque tier, avec une graine
 * DÉTERMINISTE (l'ID de l'analyse). Ainsi :
 *   - même analyse rouverte  → mêmes alternatives (stable) ;
 *   - autre analyse (même gamme) → tirage différent parmi les « très bien ».
 */

/** Rang de tier (0 = meilleur). Mêmes seuils que verdictToneFromScore. */
export function tierRank(score: number | null | undefined): number {
  const s = typeof score === 'number' ? score : 0
  if (s >= 17) return 0
  if (s >= 13) return 1
  if (s >= 9) return 2
  if (s >= 5) return 3
  return 4
}

/** Hash FNV-1a d'une chaîne → entier 32 bits (graine du PRNG). */
export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** PRNG déterministe mulberry32. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates déterministe (graine). Ne modifie pas l'entrée. */
export function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const a = arr.slice()
  const rand = mulberry32(seed)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = a[i]
    a[i] = a[j]
    a[j] = tmp
  }
  return a
}

/**
 * Ordonne les items : par tier croissant (meilleur d'abord), mélangés DANS
 * chaque tier via la graine. `scoreOf` renvoie la note plafonnée (celle qui
 * détermine la pastille).
 */
export function orderByTierShuffled<T>(
  items: readonly T[],
  seed: string,
  scoreOf: (t: T) => number | null | undefined,
): T[] {
  const base = hashSeed(seed || 'default')
  const groups = new Map<number, T[]>()
  for (const it of items) {
    const r = tierRank(scoreOf(it))
    const g = groups.get(r)
    if (g) g.push(it)
    else groups.set(r, [it])
  }
  const out: T[] = []
  for (let r = 0; r <= 4; r++) {
    const g = groups.get(r)
    if (g && g.length) {
      // graine décalée par tier → chaque tier mélange différemment mais de façon stable.
      out.push(...seededShuffle(g, (base + r * 0x9e3779b1) >>> 0))
    }
  }
  return out
}

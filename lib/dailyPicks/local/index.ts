/**
 * Catalogue LOCAL du quiz du jour (embarqué dans l'app, aucun appel serveur).
 *
 * 10 packs thématiques de 100 questions = 1000 questions = 100 jours de 10.
 * Les packs sont intercalés jour par jour (jour 1 = pack 01, jour 2 = pack 02,
 * …, jour 11 = pack 01 bloc 2…) pour que deux journées consécutives ne portent
 * pas sur le même thème. Les choix des quiz sont mélangés de façon
 * déterministe (graine = texte de la question).
 */
import type { DailyPickItem } from '@/lib/dailyPicks/select'
import type { LocalPick } from './helpers'
import { PACK_01 } from './pack01'
import { PACK_02 } from './pack02'
import { PACK_03 } from './pack03'
import { PACK_04 } from './pack04'
import { PACK_05 } from './pack05'
import { PACK_06 } from './pack06'
import { PACK_07 } from './pack07'
import { PACK_08 } from './pack08'
import { PACK_09 } from './pack09'
import { PACK_10 } from './pack10'

export const LOCAL_PACKS: LocalPick[][] = [
  PACK_01, PACK_02, PACK_03, PACK_04, PACK_05, PACK_06, PACK_07, PACK_08, PACK_09, PACK_10,
]

const PER_DAY = 10

/** Hash FNV-1a 32 bits (stable, sans dépendance). */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Mélange déterministe des choix d'un quiz, bonne réponse suivie. */
export function shuffleOptions(pick: LocalPick): { options: string[]; correct_index: number } {
  if (pick.kind !== 'quiz') return { options: pick.options, correct_index: pick.correct_index }
  let seed = hash(pick.question)
  const order = pick.options.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    seed = Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) >>> 0
    const j = seed % (i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return {
    options: order.map((i) => pick.options[i]),
    correct_index: order.indexOf(pick.correct_index),
  }
}

/** Catalogue local complet, ordonné jour par jour (packs intercalés). */
export function buildLocalCatalog(packs: LocalPick[][] = LOCAL_PACKS, startIndex = 0): DailyPickItem[] {
  const days = Math.max(...packs.map((p) => Math.ceil(p.length / PER_DAY)))
  const out: DailyPickItem[] = []
  for (let block = 0; block < days; block++) {
    packs.forEach((pack, p) => {
      pack.slice(block * PER_DAY, (block + 1) * PER_DAY).forEach((pick, k) => {
        const { options, correct_index } = shuffleOptions(pick)
        out.push({
          id: `local-${p + 1}-${block * PER_DAY + k + 1}`,
          kind: pick.kind,
          order_index: startIndex + out.length,
          question: pick.question,
          options,
          correct_index,
          reveal: pick.reveal,
          category: pick.category,
        })
      })
    })
  }
  return out
}

let cached: DailyPickItem[] | null = null

/** Catalogue local, construit une seule fois. */
export function getLocalCatalog(): DailyPickItem[] {
  if (cached === null) cached = buildLocalCatalog()
  return cached
}

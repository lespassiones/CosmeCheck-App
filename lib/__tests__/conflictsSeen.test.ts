/**
 * Tests du seen-store des conflits (`lib/routine/conflictsSeen.ts`).
 *
 * QUOI : fonctions PURES (`parseSeenState`, `diffNewHighConflicts`) testées sans
 * mock, puis `reconcileSeenConflicts` avec le mock AsyncStorage standard + un
 * mock de `react-native` exposant DeviceEventEmitter.emit espionné.
 *
 * POURQUOI : garantir qu'on ne renotifie que sur des conflits HIGH inédits, que
 * l'état persisté est parsé défensivement, et que l'événement notifications est
 * bien émis (contrat avec le module notifications).
 */

const memory = new Map<string, string>()
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => memory.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      memory.set(k, v)
    }),
    removeItem: jest.fn(async (k: string) => {
      memory.delete(k)
    }),
  },
}))

const emitSpy = jest.fn()
jest.mock('react-native', () => ({
  __esModule: true,
  DeviceEventEmitter: { emit: emitSpy },
}))

import {
  CONFLICTS_SEEN_KEY,
  NEW_HIGH_CONFLICTS_EVENT,
  diffNewHighConflicts,
  parseSeenState,
  reconcileSeenConflicts,
} from '@/lib/routine/conflictsSeen'
import type { RoutineConflict } from '@/lib/routine/conflicts'

function conflict(id: string, severity: RoutineConflict['severity']): RoutineConflict {
  return { id, ruleId: id, severity, title: '', explanation: '', tip: '', productIds: [], slot: null }
}

beforeEach(() => {
  memory.clear()
  emitSpy.mockClear()
})

describe('parseSeenState', () => {
  it('null => état vide v1', () => {
    expect(parseSeenState(null)).toEqual({ version: 1, ids: [], updatedAt: 0 })
  })

  it('JSON corrompu => état vide v1', () => {
    expect(parseSeenState('{not json')).toEqual({ version: 1, ids: [], updatedAt: 0 })
  })

  it('mauvaise version => état vide v1', () => {
    expect(parseSeenState(JSON.stringify({ version: 2, ids: ['x'] }))).toEqual({
      version: 1,
      ids: [],
      updatedAt: 0,
    })
  })

  it('état valide => ids conservés', () => {
    const raw = JSON.stringify({ version: 1, ids: ['a', 'b'], updatedAt: 123 })
    expect(parseSeenState(raw)).toEqual({ version: 1, ids: ['a', 'b'], updatedAt: 123 })
  })
})

describe('diffNewHighConflicts', () => {
  it('détecte un high inédit', () => {
    const res = diffNewHighConflicts([conflict('h1', 'high')], [])
    expect(res.map((c) => c.id)).toEqual(['h1'])
  })

  it('ignore un high déjà vu', () => {
    const res = diffNewHighConflicts([conflict('h1', 'high')], ['h1'])
    expect(res).toHaveLength(0)
  })

  it('ne remonte jamais un medium ni un info', () => {
    const res = diffNewHighConflicts([conflict('m1', 'medium'), conflict('i1', 'info')], [])
    expect(res).toHaveLength(0)
  })

  it('id stable entre runs => pas de nouvelle notification', () => {
    const run1 = [conflict('h1', 'high')]
    const seenAfterRun1 = run1.map((c) => c.id)
    const res = diffNewHighConflicts(run1, seenAfterRun1)
    expect(res).toHaveLength(0)
  })
})

describe('reconcileSeenConflicts', () => {
  it('premier run : émet pour les nouveaux high et persiste tous les ids', async () => {
    const current = [conflict('h1', 'high'), conflict('m1', 'medium')]
    const newHigh = await reconcileSeenConflicts(current)

    expect(newHigh.map((c) => c.id)).toEqual(['h1'])
    expect(emitSpy).toHaveBeenCalledWith(NEW_HIGH_CONFLICTS_EVENT, { conflicts: newHigh })

    const persisted = parseSeenState(memory.get(CONFLICTS_SEEN_KEY) ?? null)
    expect(persisted.ids.sort()).toEqual(['h1', 'm1'])
  })

  it('deuxième run identique : aucun nouveau high, aucune émission', async () => {
    const current = [conflict('h1', 'high')]
    await reconcileSeenConflicts(current)
    emitSpy.mockClear()

    const newHigh = await reconcileSeenConflicts(current)
    expect(newHigh).toHaveLength(0)
    expect(emitSpy).not.toHaveBeenCalled()
  })
})

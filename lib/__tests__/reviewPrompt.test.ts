import {
  DEFAULT_REVIEW_STATE,
  markDone,
  markShown,
  readReviewState,
  REVIEW_MAX_ASKS,
  REVIEW_REASK_MS,
  shouldAskReview,
  type ReviewState,
} from '@/lib/review/prompt'

const NOW = 1_800_000_000_000 // instant de reference arbitraire (ms epoch)

describe('readReviewState (coercition defensive)', () => {
  it('retombe sur le defaut pour null / non-objet', () => {
    expect(readReviewState(null)).toEqual(DEFAULT_REVIEW_STATE)
    expect(readReviewState('nope')).toEqual(DEFAULT_REVIEW_STATE)
    expect(readReviewState(42)).toEqual(DEFAULT_REVIEW_STATE)
  })

  it('coerce un statut invalide en "never" et nettoie les champs', () => {
    expect(readReviewState({ status: 'bogus', lastAskedAt: 'x', askCount: -3 })).toEqual({
      status: 'never',
      lastAskedAt: null,
      askCount: 0,
    })
  })

  it('conserve un etat valide (askCount arrondi)', () => {
    expect(readReviewState({ status: 'pending', lastAskedAt: NOW, askCount: 2.9 })).toEqual({
      status: 'pending',
      lastAskedAt: NOW,
      askCount: 2,
    })
  })
})

describe('shouldAskReview', () => {
  it('propose la premiere fois (never)', () => {
    expect(shouldAskReview(DEFAULT_REVIEW_STATE, NOW)).toBe(true)
  })

  it('ne propose jamais si deja note (done)', () => {
    const st: ReviewState = { status: 'done', lastAskedAt: NOW, askCount: 1 }
    expect(shouldAskReview(st, NOW + REVIEW_REASK_MS * 100)).toBe(false)
  })

  it('ne repropose pas avant le delai (pending)', () => {
    const st: ReviewState = { status: 'pending', lastAskedAt: NOW, askCount: 1 }
    expect(shouldAskReview(st, NOW + REVIEW_REASK_MS - 1)).toBe(false)
  })

  it('repropose une fois le delai ecoule (pending)', () => {
    const st: ReviewState = { status: 'pending', lastAskedAt: NOW, askCount: 1 }
    expect(shouldAskReview(st, NOW + REVIEW_REASK_MS)).toBe(true)
  })

  it('s arrete au plafond de sollicitations', () => {
    const st: ReviewState = {
      status: 'pending',
      lastAskedAt: NOW,
      askCount: REVIEW_MAX_ASKS,
    }
    expect(shouldAskReview(st, NOW + REVIEW_REASK_MS * 10)).toBe(false)
  })
})

describe('transitions', () => {
  it('markShown passe en pending, horodate et incremente', () => {
    const next = markShown(DEFAULT_REVIEW_STATE, NOW)
    expect(next).toEqual({ status: 'pending', lastAskedAt: NOW, askCount: 1 })
  })

  it('markDone verrouille definitivement', () => {
    const st: ReviewState = { status: 'pending', lastAskedAt: NOW, askCount: 1 }
    expect(markDone(st).status).toBe('done')
  })

  it('scenario complet : refus J0 -> re-propose J+1 -> note -> stop', () => {
    let st = DEFAULT_REVIEW_STATE
    // J0 : premiere proposition (scan reussi).
    expect(shouldAskReview(st, NOW)).toBe(true)
    st = markShown(st, NOW)
    // Meme jour, nouveau scan : pas de re-proposition.
    expect(shouldAskReview(st, NOW + 60_000)).toBe(false)
    // J+1 avec un nouveau scan : re-proposition autorisee.
    const j1 = NOW + REVIEW_REASK_MS
    expect(shouldAskReview(st, j1)).toBe(true)
    st = markShown(st, j1)
    // L'utilisateur note : etat verrouille, plus jamais propose.
    st = markDone(st)
    expect(shouldAskReview(st, j1 + REVIEW_REASK_MS * 100)).toBe(false)
  })
})

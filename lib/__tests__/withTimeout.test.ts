/**
 * Bornage de promesses (lib/utils/withTimeout).
 *
 *   - `withTimeout` rejette au-dela du delai.
 *   - `bounded` ne rejette jamais et rend un resultat a examiner, pour forcer
 *     l'appelant a distinguer un delai depasse d'une vraie erreur.
 *
 * `bounded` sert le correctif du refus Apple 2.1(a) « the app is unresponsive
 * and stays on the splash screen » : un seul appel qui accepte la connexion
 * sans jamais repondre suffit a laisser un drapeau « pret » faux a vie.
 */
import { bounded, withTimeout } from '@/lib/utils/withTimeout'

jest.useFakeTimers()

it('résout avec la valeur si la promesse aboutit avant le délai', async () => {
  await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42)
})

it('propage le rejet de la promesse sous-jacente', async () => {
  await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom')
})

it('rejette avec le label si le délai est dépassé', async () => {
  const never = new Promise<number>(() => {})
  const p = withTimeout(never, 5000, 'Délai dépassé')
  const assertion = expect(p).rejects.toThrow('Délai dépassé')
  jest.advanceTimersByTime(5000)
  await assertion
})

// ── bounded : ne rejette jamais, rend un cas a traiter ──────────────────

/** Laisse les micro-taches s'ecouler sans avancer l'horloge. */
const vider = () => Promise.resolve()

describe('bounded', () => {
  it('rend la valeur quand la promesse repond a temps', async () => {
    const p = bounded(Promise.resolve('ok'), 1000)
    await vider()
    await expect(p).resolves.toEqual({ ok: true, value: 'ok' })
  })

  it('rend un timeout quand la promesse ne repond JAMAIS', async () => {
    // Exactement le reseau qui accepte la connexion et se tait : la promesse
    // ne se resout ni ne rejette, donc aucun `.finally()` ne s'execute.
    const p = bounded(new Promise<string>(() => {}), 8000)
    jest.advanceTimersByTime(8000)
    await expect(p).resolves.toEqual({ ok: false, reason: 'timeout' })
  })

  it('un rejet est un resultat, pas une exception', async () => {
    const boom = new Error('reseau')
    const p = bounded(Promise.reject(boom), 1000)
    await vider()
    await expect(p).resolves.toEqual({ ok: false, reason: 'error', error: boom })
  })

  it("distingue le delai depasse de l'erreur", async () => {
    // Le coeur du module : sur timeout on garde la session, sur erreur on la
    // purge. Les confondre deconnecterait les gens qui ouvrent l'app hors ligne.
    const lent = bounded(new Promise<string>(() => {}), 500)
    jest.advanceTimersByTime(500)
    const casse = bounded(Promise.reject(new Error('x')), 500)
    await vider()

    const [a, b] = await Promise.all([lent, casse])
    expect(a).toEqual({ ok: false, reason: 'timeout' })
    expect(b.ok === false && b.reason).toBe('error')
  })

  it('le timeout ne se declenche pas si la promesse gagne', async () => {
    const p = bounded(Promise.resolve(1), 1000)
    await vider()
    const res = await p
    jest.advanceTimersByTime(5000)
    expect(res).toEqual({ ok: true, value: 1 })
  })

  it('nettoie son minuteur quand la promesse gagne', async () => {
    // Un setTimeout oublie retient une reference vivante toute la session.
    const clear = jest.spyOn(global, 'clearTimeout')
    const p = bounded(Promise.resolve('vite'), 60_000)
    await vider()
    await p
    expect(clear).toHaveBeenCalled()
    clear.mockRestore()
  })
})

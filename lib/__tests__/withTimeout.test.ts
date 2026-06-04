/**
 * withTimeout — résout si la promesse aboutit à temps, rejette sinon.
 */
import { withTimeout } from '@/lib/utils/withTimeout'

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

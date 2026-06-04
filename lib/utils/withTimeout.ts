/**
 * withTimeout — rejette si la promesse n'aboutit pas dans `ms` millisecondes.
 * Évite les écrans bloqués en « chargement » indéfini sur un fetch qui pend.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = 'Délai dépassé',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

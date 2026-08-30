/**
 * Le drapeau « connexion en cours de finalisation ».
 *
 * `signInWithPassword` ouvre la session AVANT que `signIn` n'ait fini son
 * travail. L'AuthGuard reagissait donc a `isAuthenticated: true` en lisant un
 * profil encore perime : pour le compte de demonstration d'Apple, l'accueil
 * clignotait une demi-seconde avant l'ecran de consentement.
 */
import {
  isSignInPending,
  resetSignInPending,
  withSignInPending,
} from '@/lib/auth/signInPending'

beforeEach(() => resetSignInPending())

it('faux au repos', () => {
  expect(isSignInPending()).toBe(false)
})

it('leve pendant le travail, retombe apres', async () => {
  let pendant: boolean | null = null
  await withSignInPending(async () => {
    pendant = isSignInPending()
  })
  expect(pendant).toBe(true)
  expect(isSignInPending()).toBe(false)
})

it('retombe MEME si le travail leve une erreur', async () => {
  // Sans le `finally`, une panne reseau laisserait le guard muet a vie :
  // l'app resterait figee sur l'ecran de connexion.
  await expect(
    withSignInPending(async () => {
      throw new Error('reseau')
    }),
  ).rejects.toThrow('reseau')
  expect(isSignInPending()).toBe(false)
})

it('rend la valeur du travail', async () => {
  await expect(withSignInPending(async () => 42)).resolves.toBe(42)
})

it('le guard consulte bien ce drapeau', () => {
  const fs = require('node:fs') as typeof import('node:fs')
  const path = require('node:path') as typeof import('node:path')
  const layout = fs
    .readFileSync(path.join(__dirname, '..', '..', 'app/_layout.tsx'), 'utf8')
    .replace(/\r\n/g, '\n')
  // Le garde ne se contente plus de LIRE ce drapeau dans son effet : un booleen
  // de module n'apparait dans aucune liste de dependances React, donc rien ne
  // le reveillait a sa retombee et son abstention devenait definitive. Il s'y
  // abonne, et passe la valeur observee.
  expect(layout).toMatch(/useSyncExternalStore\(\s*subscribeSignInPending/)
  expect(layout).toMatch(/signInPending,/)
})

it('la connexion e-mail est encadree par ce drapeau', () => {
  const fs = require('node:fs') as typeof import('node:fs')
  const path = require('node:path') as typeof import('node:path')
  const session = fs
    .readFileSync(path.join(__dirname, '..', '..', 'lib/auth/session.ts'), 'utf8')
    .replace(/\r\n/g, '\n')
  const bloc = session.slice(
    session.indexOf('export async function signIn('),
    session.indexOf('export async function signUp('),
  )
  expect(bloc).toMatch(/return withSignInPending\(async \(\) => \{/)
})

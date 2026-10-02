/**
 * Helpers d'écriture des packs de questions locaux (embarqués dans l'app).
 *
 * `q` = quiz à 4 choix. On écrit TOUJOURS la bonne réponse en premier
 * (correct_index 0) : l'ordre affiché est mélangé de façon déterministe au
 * chargement (`buildLocalCatalog`), donc la bonne réponse n'est pas toujours
 * en haut, et elle reste la même d'un lancement à l'autre.
 *
 * `m` = idée reçue, options fixes Vrai / Faux / Nuancé (0 / 1 / 2).
 */

export type LocalPickKind = 'quiz' | 'myth'

export interface LocalPick {
  kind: LocalPickKind
  question: string
  options: string[]
  correct_index: number
  reveal: string
  category: string
}

export const MYTH_OPTIONS = ['Vrai', 'Faux', 'Nuancé']

export const VRAI = 0
export const FAUX = 1
export const NUANCE = 2

/** Quiz : `answer` = bonne réponse, `wrong` = 3 mauvaises réponses. */
export const q = (
  question: string,
  answer: string,
  wrong: [string, string, string],
  reveal: string,
  category: string,
): LocalPick => ({ kind: 'quiz', question, options: [answer, ...wrong], correct_index: 0, reveal, category })

/** Idée reçue : `verdict` = VRAI | FAUX | NUANCE. */
export const m = (
  question: string,
  verdict: number,
  reveal: string,
  category: string,
): LocalPick => ({ kind: 'myth', question, options: MYTH_OPTIONS, correct_index: verdict, reveal, category })

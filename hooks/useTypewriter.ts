/**
 * useTypewriter — effet « machine à écrire » : écrit un mot lettre par lettre,
 * marque une pause, l'efface, puis passe au suivant, en boucle.
 *
 * Volontairement PAS trop rapide (cf. demande produit). Respecte reduce-motion :
 * dans ce cas on fait défiler les mots entiers (pas d'animation par caractère).
 *
 * Retourne la chaîne partielle courante à afficher (placeholder animé).
 */
import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

interface Options {
  /** ms par caractère à l'écriture (défaut 85 — posé, lisible). */
  typeMs?: number
  /** ms par caractère à l'effacement (défaut 45). */
  deleteMs?: number
  /** pause une fois le mot complet (défaut 1500). */
  holdFullMs?: number
  /** pause une fois effacé, avant le mot suivant (défaut 450). */
  holdEmptyMs?: number
  /** false → fige sur le 1er mot (pas d'animation). */
  enabled?: boolean
}

export function useTypewriter(words: readonly string[], opts: Options = {}): string {
  const {
    typeMs = 85,
    deleteMs = 45,
    holdFullMs = 1500,
    holdEmptyMs = 450,
    enabled = true,
  } = opts

  const [text, setText] = useState('')
  const [reduceMotion, setReduceMotion] = useState(false)

  // Index de départ aléatoire → variété à chaque montage (Math.random OK en RN).
  const wordIdx = useRef(words.length ? Math.floor(Math.random() * words.length) : 0)
  const charIdx = useRef(0)
  const deleting = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => mounted && setReduceMotion(v))
      .catch(() => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) =>
      setReduceMotion(v),
    )
    return () => {
      mounted = false
      sub.remove()
    }
  }, [])

  useEffect(() => {
    if (!words.length) return
    const clear = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }

    // reduce-motion / désactivé : mots entiers, remplacement doux, sans char anim.
    if (!enabled || reduceMotion) {
      setText(words[wordIdx.current % words.length])
      if (!enabled) return
      const rotate = () => {
        wordIdx.current = (wordIdx.current + 1) % words.length
        setText(words[wordIdx.current])
        timer.current = setTimeout(rotate, holdFullMs + 1400)
      }
      timer.current = setTimeout(rotate, holdFullMs + 1400)
      return clear
    }

    const tick = () => {
      const word = words[wordIdx.current % words.length]
      if (!deleting.current) {
        charIdx.current += 1
        setText(word.slice(0, charIdx.current))
        if (charIdx.current >= word.length) {
          deleting.current = true
          timer.current = setTimeout(tick, holdFullMs)
        } else {
          timer.current = setTimeout(tick, typeMs)
        }
      } else {
        charIdx.current -= 1
        setText(word.slice(0, Math.max(0, charIdx.current)))
        if (charIdx.current <= 0) {
          deleting.current = false
          wordIdx.current = (wordIdx.current + 1) % words.length
          timer.current = setTimeout(tick, holdEmptyMs)
        } else {
          timer.current = setTimeout(tick, deleteMs)
        }
      }
    }

    // (ré)initialise le cycle
    charIdx.current = 0
    deleting.current = false
    timer.current = setTimeout(tick, typeMs)
    return clear
  }, [words, enabled, reduceMotion, typeMs, deleteMs, holdFullMs, holdEmptyMs])

  return text
}

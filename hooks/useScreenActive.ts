/**
 * useScreenActive — vrai quand l'écran est affiché ET l'app au premier plan.
 *
 * Sert à mettre en pause les animations et minuteries décoratives (machine à
 * écrire, curseur, carrousel) : un onglet reste monté sous les écrans poussés
 * par-dessus, et ces boucles y tournaient encore ~15 fois par seconde, ce qui
 * alourdissait toute l'app au fil de la navigation.
 */
import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'

export function useScreenActive(): boolean {
  const [focused, setFocused] = useState(true)
  const [foreground, setForeground] = useState(AppState.currentState !== 'background')

  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => setFocused(false)
    }, []),
  )

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s === 'active'))
    return () => sub.remove()
  }, [])

  return focused && foreground
}

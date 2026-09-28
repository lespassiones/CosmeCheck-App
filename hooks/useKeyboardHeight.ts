/**
 * Clavier : hauteur mesurée et défilement vers le champ actif.
 *
 * Pourquoi on ne s'en remet pas au système. Sur Android, `app.json` est en
 * `softwareKeyboardLayoutMode: "pan"` et l'app est en edge-to-edge (SDK 36) :
 * la fenêtre n'est jamais redimensionnée, et le « pan » ne décale l'écran que
 * pour garder le champ lui-même visible. Un bouton sous le champ restait donc
 * caché sous le clavier (constaté sur Pixel le 28/09/2026). Sur iOS,
 * `KeyboardAvoidingView` ne sait rien des barres d'action fixées en bas.
 *
 * La règle, identique sur les deux plateformes : on mesure la hauteur réelle du
 * clavier (événements `Keyboard`), on la reporte en marge basse du conteneur
 * (les éléments remontent au-dessus du clavier), puis on fait défiler la zone
 * pour que le champ actif reste visible avec un peu d'air sous lui.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Keyboard,
  LayoutAnimation,
  Platform,
  TextInput,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native'

/** Hauteur actuelle du clavier en dp, 0 quand il est fermé. */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const ios = Platform.OS === 'ios'
    const animate = (e: KeyboardEvent | null) => {
      if (!ios) return
      // Même courbe que le clavier, comme le fait KeyboardAvoidingView.
      LayoutAnimation.configureNext({
        duration: e?.duration && e.duration > 10 ? e.duration : 250,
        update: { type: (e?.easing as never) ?? LayoutAnimation.Types.keyboard },
      })
    }
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      animate(e)
      setHeight(Math.max(0, e.endCoordinates?.height ?? 0))
    })
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) => {
      animate(e ?? null)
      setHeight(0)
    })
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  return height
}

interface Measurable {
  measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void
}

/**
 * Garde le champ actif visible dans une ScrollView dont le cadre a été réduit
 * de la hauteur du clavier. `extraSpace` : l'air laissé sous le champ (pour
 * voir aussi le bouton ou le champ suivant).
 */
export function useKeyboardAwareScroll(extraSpace = 24) {
  const scrollRef = useRef<ScrollView>(null)
  const offsetY = useRef(0)
  const keyboardHeight = useKeyboardHeight()

  const reveal = useCallback(() => {
    const input = TextInput.State.currentlyFocusedInput() as unknown as Measurable | null
    const scroll = scrollRef.current as unknown as (Measurable & ScrollView) | null
    if (!input?.measureInWindow || !scroll?.measureInWindow) return
    input.measureInWindow((_ix, iy, _iw, ih) => {
      scroll.measureInWindow((_sx, sy, _sw, sh) => {
        const visibleBottom = sy + sh - extraSpace
        const below = iy + ih - visibleBottom
        const above = sy + 12 - iy
        if (below > 0) scroll.scrollTo({ y: offsetY.current + below, animated: true })
        else if (above > 0) scroll.scrollTo({ y: Math.max(0, offsetY.current - above), animated: true })
      })
    })
  }, [extraSpace])

  // Après l'ouverture (et la remontée du contenu), on vérifie la position.
  useEffect(() => {
    if (keyboardHeight <= 0) return
    const t = setTimeout(reveal, Platform.OS === 'ios' ? 300 : 80)
    return () => clearTimeout(t)
  }, [keyboardHeight, reveal])

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetY.current = e.nativeEvent.contentOffset.y
  }, [])

  /** À brancher sur `onContentSizeChange` : un champ multiligne qui grandit. */
  const onContentSizeChange = useCallback(() => {
    if (keyboardHeight > 0) reveal()
  }, [keyboardHeight, reveal])

  return { scrollRef, keyboardHeight, onScroll, onContentSizeChange, reveal }
}

/**
 * Marge basse à réserver pour que rien ne passe sous le clavier.
 *
 * Android (edge-to-edge) : la hauteur annoncée par `Keyboard` n'inclut PAS la
 * barre de navigation du système, que le clavier recouvre pourtant (mesuré sur
 * Pixel le 28/09/2026 : le bouton restait rogné de la hauteur de cette barre).
 * iOS : la hauteur inclut déjà la zone de l'indicateur d'accueil.
 *
 * `insideSafeBottom` : le conteneur est déjà décollé du bas de `bottomInset`
 * (SafeAreaView avec le bord du bas), il ne faut pas le compter deux fois.
 */
export function keyboardPadding(keyboardHeight: number, bottomInset: number, insideSafeBottom: boolean): number {
  if (keyboardHeight <= 0) return 0
  const fromScreenBottom = Platform.OS === 'android' ? keyboardHeight + bottomInset : keyboardHeight
  return Math.max(0, insideSafeBottom ? fromScreenBottom - bottomInset : fromScreenBottom)
}

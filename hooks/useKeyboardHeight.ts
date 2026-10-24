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
  Dimensions,
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

/** Dernière hauteur de clavier vue dans la session (dp), 0 tant qu'il ne s'est pas ouvert. */
let lastKeyboardHeight = 0
Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
  const h = e.endCoordinates?.height ?? 0
  if (h > 0) lastKeyboardHeight = h
})

/** Hauteur attendue du prochain clavier : la dernière vue, sinon 40 % de l'écran. */
export function expectedKeyboardHeight(): number {
  return lastKeyboardHeight > 0 ? lastKeyboardHeight : Math.round(Dimensions.get('window').height * 0.4)
}

/** Sans clavier dans ce délai après le focus, la place réservée est rendue. */
const ANTICIPATION_TIMEOUT_MS = 1500

/**
 * Garde le champ actif visible dans une ScrollView dont le cadre a été réduit
 * de la hauteur du clavier. `extraSpace` : l'air laissé sous le champ (pour
 * voir aussi le bouton ou le champ suivant).
 *
 * `prepareFocus(input)` : à utiliser au lieu de `autoFocus` pour un champ placé
 * bas dans l'écran. Sur Android (`adjustPan`), si le clavier s'ouvre sur un
 * champ qu'il recouvre, le système décale TOUTE la fenêtre vers le haut, et ce
 * décalage s'ajoute à notre propre remontée : bouton collé sous les
 * notifications, grand vide au-dessus du clavier (constaté le 24/10/2026 sur
 * les champs « Autre » de l'onboarding). On réserve donc d'abord la place du
 * clavier attendu, on amène le champ au-dessus, PUIS on donne le focus : le
 * clavier s'ouvre sur un champ déjà visible et le système ne décale rien.
 */
export function useKeyboardAwareScroll(extraSpace = 24) {
  const scrollRef = useRef<ScrollView>(null)
  const offsetY = useRef(0)
  const realHeight = useKeyboardHeight()
  const [anticipated, setAnticipated] = useState(0)
  const keyboardHeight = realHeight > 0 ? realHeight : anticipated
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const reveal = useCallback(
    (target?: Measurable | null, animated = true) => {
      const input = target ?? (TextInput.State.currentlyFocusedInput() as unknown as Measurable | null)
      const scroll = scrollRef.current as unknown as (Measurable & ScrollView) | null
      if (!input?.measureInWindow || !scroll?.measureInWindow) return
      input.measureInWindow((_ix, iy, _iw, ih) => {
        scroll.measureInWindow((_sx, sy, _sw, sh) => {
          const visibleBottom = sy + sh - extraSpace
          const below = iy + ih - visibleBottom
          // Marge avant que le champ ne touche le haut de la zone. Un grand
          // `extraSpace` dans une zone que le clavier a raccourcie faisait sortir
          // le champ par le haut (onboarding, « ingrédients à éviter », 24/10/2026) :
          // le champ s'arrête en haut, jamais au-delà.
          const toTop = iy - (sy + 12)
          if (toTop < 0) scroll.scrollTo({ y: Math.max(0, offsetY.current + toTop), animated })
          else if (below > 0) scroll.scrollTo({ y: offsetY.current + Math.min(below, toTop), animated })
        })
      })
    },
    [extraSpace],
  )

  // Après l'ouverture (et la remontée du contenu), on vérifie la position.
  useEffect(() => {
    if (realHeight <= 0) return
    const t = setTimeout(() => reveal(), Platform.OS === 'ios' ? 300 : 80)
    return () => clearTimeout(t)
  }, [realHeight, reveal])

  // Clavier refermé : la place réservée d'avance n'a plus lieu d'être.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (realHeight > 0) wasOpen.current = true
    else if (wasOpen.current) {
      wasOpen.current = false
      setAnticipated(0)
    }
  }, [realHeight])

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout)
    },
    [],
  )

  const reserve = useCallback(() => {
    if (Platform.OS !== 'android' || realHeight > 0) return false
    setAnticipated(expectedKeyboardHeight())
    timers.current.push(
      setTimeout(() => {
        if (!TextInput.State.currentlyFocusedInput()) setAnticipated(0)
      }, ANTICIPATION_TIMEOUT_MS),
    )
    return true
  }, [realHeight])

  const prepareFocus = useCallback(
    (input: TextInput | null) => {
      if (!input) return
      if (!reserve()) {
        input.focus()
        return
      }
      // Une image pour que la place réservée soit en page, le défilement, puis le focus.
      timers.current.push(
        setTimeout(() => {
          reveal(input as unknown as Measurable, false)
          timers.current.push(setTimeout(() => input.focus(), 60))
        }, 60),
      )
    },
    [reserve, reveal],
  )

  /** À brancher sur `onPressIn` d'un champ déjà affiché : même réserve, avant le focus natif. */
  const prepareTouch = useCallback(() => {
    reserve()
  }, [reserve])

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetY.current = e.nativeEvent.contentOffset.y
  }, [])

  /** À brancher sur `onContentSizeChange` : un champ multiligne qui grandit. */
  const onContentSizeChange = useCallback(() => {
    if (keyboardHeight > 0) reveal()
  }, [keyboardHeight, reveal])

  return { scrollRef, keyboardHeight, onScroll, onContentSizeChange, reveal, prepareFocus, prepareTouch }
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

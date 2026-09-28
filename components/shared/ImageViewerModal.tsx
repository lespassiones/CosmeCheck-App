/**
 * ImageViewerModal : visionneuse plein écran d'une image (photo produit).
 *
 * - Ouverture : l'image s'agrandit DEPUIS la vignette tapée (`originRect`,
 *   coordonnées fenêtre) jusqu'au plein écran, fond noir en fondu. La
 *   fermeture refait le chemin inverse vers la vignette.
 * - Zoom : pincement (centré sur les doigts, x5 max), double-tap (x2,5 centré
 *   sur le point tapé, re-double-tap = retour à 1). Zoomée, l'image se déplace
 *   au doigt avec inertie, bornée aux bords de l'image.
 * - Fermeture : bouton X, retour Android, tap sur le fond noir, ou glisser
 *   l'image vers le haut/bas quand elle n'est pas zoomée.
 *
 * Aucun ressort ni rebond : uniquement des timings (easing out) et une
 * inertie bornée. Reduce-motion : ReduceMotion.System sur chaque animation.
 */

import { useEffect, type FC } from 'react'
import { Modal, StyleSheet, useWindowDimensions } from 'react-native'
import { Image } from 'expo-image'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withTiming,
} from 'react-native-reanimated'

import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'
import { radius } from '@/constants/spacing'

export interface ViewerRect {
  x: number
  y: number
  width: number
  height: number
}

interface ImageViewerModalProps {
  uri: string | null
  visible: boolean
  onClose: () => void
  /** Position de la vignette dans la fenêtre : l'image en part et y revient. */
  originRect?: ViewerRect | null
  /** Dimensions natives de l'image (onLoad de la vignette) pour cadrer au plus juste. */
  imageSize?: { width: number; height: number } | null
  /** Arrondi de la vignette, repris au départ de l'agrandissement. */
  originRadius?: number
  accessibilityLabel?: string
}

const SCRIM = '#000000'
const MAX_SCALE = 5
const MIN_PINCH_SCALE = 0.6
const DOUBLE_TAP_SCALE = 2.5
const DISMISS_DISTANCE = 110
const DISMISS_VELOCITY = 900
/** Résistance quand on tire l'image zoomée au-delà de son bord. */
const EDGE_RESISTANCE = 0.35

const OPEN = { duration: 300, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }
const CLOSE = { duration: 240, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }
const SETTLE = { duration: 220, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }

export const ImageViewerModal: FC<ImageViewerModalProps> = ({
  uri,
  visible,
  onClose,
  originRect,
  imageSize,
  originRadius = radius.md,
  accessibilityLabel = 'Photo du produit',
}) => {
  const { width: W, height: H } = useWindowDimensions()
  const insets = useSafeAreaInsets()

  // Cadre final : l'image entière, centrée, au ratio natif (sinon plein écran).
  const aspect =
    imageSize && imageSize.width > 0 && imageSize.height > 0
      ? imageSize.width / imageSize.height
      : originRect && originRect.height > 0
        ? originRect.width / originRect.height
        : W / H
  const fitW = Math.min(W, H * aspect)
  const fitH = fitW / aspect

  // Cadre de départ : la vignette, sinon un léger zoom avant depuis le centre.
  const from: ViewerRect = originRect ?? { x: W * 0.08, y: H * 0.08, width: W * 0.84, height: H * 0.84 }
  // Dans la vignette l'image est en « cover » : taille qui recouvre son cadre.
  const coverW = Math.max(from.width, from.height * aspect)
  const coverH = coverW / aspect

  const progress = useSharedValue(0)
  const closing = useSharedValue(false)
  const scale = useSharedValue(1)
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const dragY = useSharedValue(0)
  const pinching = useSharedValue(false)
  const startScale = useSharedValue(1)
  const startTx = useSharedValue(0)
  const startTy = useSharedValue(0)
  const originX = useSharedValue(0)
  const originY = useSharedValue(0)
  const lastX = useSharedValue(0)
  const lastY = useSharedValue(0)

  useEffect(() => {
    if (!visible) return
    closing.value = false
    scale.value = 1
    tx.value = 0
    ty.value = 0
    dragY.value = 0
    progress.value = 0
    progress.value = withTiming(1, OPEN)
  }, [visible, closing, scale, tx, ty, dragY, progress])

  const maxX = (s: number) => {
    'worklet'
    return Math.max(0, (fitW * s - W) / 2)
  }
  const maxY = (s: number) => {
    'worklet'
    return Math.max(0, (fitH * s - H) / 2)
  }
  const clamp = (v: number, m: number) => {
    'worklet'
    return Math.min(m, Math.max(-m, v))
  }

  const resetZoom = (config = SETTLE) => {
    'worklet'
    scale.value = withTiming(1, config)
    tx.value = withTiming(0, config)
    ty.value = withTiming(0, config)
  }

  /** Remet l'image dans ses bornes (ou à 1 si on a dézoomé en dessous). */
  const settle = () => {
    'worklet'
    if (scale.value <= 1) {
      resetZoom()
      return
    }
    tx.value = withTiming(clamp(tx.value, maxX(scale.value)), SETTLE)
    ty.value = withTiming(clamp(ty.value, maxY(scale.value)), SETTLE)
  }

  const animateClose = () => {
    'worklet'
    if (closing.value) return
    closing.value = true
    resetZoom(CLOSE)
    dragY.value = withTiming(0, CLOSE)
    progress.value = withTiming(0, CLOSE, () => {
      runOnJS(onClose)()
    })
  }

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      if (closing.value) return
      pinching.value = true
      startScale.value = scale.value
      startTx.value = tx.value
      startTy.value = ty.value
      originX.value = e.focalX - W / 2
      originY.value = e.focalY - H / 2
    })
    .onUpdate((e) => {
      if (closing.value || !pinching.value) return
      const next = Math.min(MAX_SCALE, Math.max(MIN_PINCH_SCALE, startScale.value * e.scale))
      const ratio = next / startScale.value
      // Le point de l'image sous les doigts au départ reste sous les doigts
      // (qui peuvent se déplacer pendant le pincement).
      tx.value = e.focalX - W / 2 - (originX.value - startTx.value) * ratio
      ty.value = e.focalY - H / 2 - (originY.value - startTy.value) * ratio
      scale.value = next
    })
    .onEnd(() => {
      if (closing.value) return
      settle()
    })
    .onFinalize(() => {
      pinching.value = false
    })

  const pan = Gesture.Pan()
    .averageTouches(true)
    .maxPointers(2)
    .onStart(() => {
      lastX.value = 0
      lastY.value = 0
    })
    .onUpdate((e) => {
      const dx = e.translationX - lastX.value
      const dy = e.translationY - lastY.value
      lastX.value = e.translationX
      lastY.value = e.translationY
      // Pendant un pincement, c'est lui qui déplace l'image.
      if (closing.value || pinching.value) return
      if (scale.value > 1.01) {
        const nx = tx.value + dx
        const ny = ty.value + dy
        tx.value = Math.abs(nx) > maxX(scale.value) ? tx.value + dx * EDGE_RESISTANCE : nx
        ty.value = Math.abs(ny) > maxY(scale.value) ? ty.value + dy * EDGE_RESISTANCE : ny
      } else {
        dragY.value += dy
      }
    })
    .onEnd((e) => {
      if (closing.value || pinching.value) return
      if (scale.value > 1.01) {
        const mx = maxX(scale.value)
        const my = maxY(scale.value)
        // Inertie bornée si l'image est dans ses bornes, sinon retour au bord.
        tx.value =
          Math.abs(tx.value) > mx
            ? withTiming(clamp(tx.value, mx), SETTLE)
            : withDecay({ velocity: e.velocityX, clamp: [-mx, mx], reduceMotion: ReduceMotion.System })
        ty.value =
          Math.abs(ty.value) > my
            ? withTiming(clamp(ty.value, my), SETTLE)
            : withDecay({ velocity: e.velocityY, clamp: [-my, my], reduceMotion: ReduceMotion.System })
        return
      }
      if (Math.abs(dragY.value) > DISMISS_DISTANCE || Math.abs(e.velocityY) > DISMISS_VELOCITY) {
        animateClose()
      } else {
        dragY.value = withTiming(0, SETTLE)
      }
    })

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd((e) => {
      if (closing.value) return
      if (scale.value > 1.01) {
        resetZoom()
        return
      }
      const s = DOUBLE_TAP_SCALE
      // Zoom centré sur le point tapé : il reste sous le doigt.
      scale.value = withTiming(s, SETTLE)
      tx.value = withTiming(clamp(-(e.x - W / 2) * (s - 1), maxX(s)), SETTLE)
      ty.value = withTiming(clamp(-(e.y - H / 2) * (s - 1), maxY(s)), SETTLE)
    })

  // Tap sur le fond noir (hors de l'image, non zoomée) : fermeture.
  const singleTap = Gesture.Tap().onEnd((e) => {
    if (closing.value || scale.value > 1.01) return
    const outsideX = Math.abs(e.x - W / 2) > fitW / 2
    const outsideY = Math.abs(e.y - H / 2) > fitH / 2
    if (outsideX || outsideY) animateClose()
  })

  const gesture = Gesture.Race(
    Gesture.Simultaneous(pinch, pan),
    Gesture.Exclusive(doubleTap, singleTap),
  )

  const scrimStyle = useAnimatedStyle(() => {
    const dragFade = interpolate(Math.abs(dragY.value), [0, H * 0.4], [1, 0.3], Extrapolation.CLAMP)
    return { opacity: progress.value * dragFade }
  })

  const chromeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value * interpolate(Math.abs(dragY.value), [0, DISMISS_DISTANCE], [1, 0], Extrapolation.CLAMP),
      [0.5, 1],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }))

  // Cadre qui passe de la vignette au plein écran (arrondi et rognage compris).
  const frameStyle = useAnimatedStyle(() => {
    const p = progress.value
    const shrink = interpolate(Math.abs(dragY.value), [0, H * 0.5], [1, 0.82], Extrapolation.CLAMP)
    return {
      left: interpolate(p, [0, 1], [from.x, 0]),
      top: interpolate(p, [0, 1], [from.y, 0]),
      width: interpolate(p, [0, 1], [from.width, W]),
      height: interpolate(p, [0, 1], [from.height, H]),
      borderRadius: interpolate(p, [0, 1], [originRadius, 0]),
      transform: [{ translateY: dragY.value }, { scale: shrink }],
    }
  })

  // Image à son ratio : taille « cover » de la vignette → taille « contain »
  // plein écran, centrée dans le cadre, puis zoom/déplacement de l'utilisateur.
  const imageStyle = useAnimatedStyle(() => {
    const p = progress.value
    const frameW = interpolate(p, [0, 1], [from.width, W])
    const frameH = interpolate(p, [0, 1], [from.height, H])
    const w = interpolate(p, [0, 1], [coverW, fitW])
    const h = interpolate(p, [0, 1], [coverH, fitH])
    return {
      width: w,
      height: h,
      left: (frameW - w) / 2,
      top: (frameH - h) / 2,
      transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
    }
  })

  if (!uri) return null

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => animateClose()}
    >
      <GestureHandlerRootView style={styles.flex}>
        {visible ? <StatusBar style="light" /> : null}
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]} />

        <GestureDetector gesture={gesture}>
          <Animated.View style={StyleSheet.absoluteFill}>
            <Animated.View style={[styles.frame, frameStyle]}>
              <Animated.View style={[styles.imageBox, imageStyle]}>
                <Image
                  source={{ uri }}
                  style={styles.image}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  accessibilityLabel={accessibilityLabel}
                  accessibilityIgnoresInvertColors
                />
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </GestureDetector>

        <Animated.View
          style={[styles.closeWrap, { top: insets.top + 8 }, chromeStyle]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={() => animateClose()}
            hitSlop={10}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Fermer la photo"
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrim: { backgroundColor: SCRIM },
  frame: {
    position: 'absolute',
    overflow: 'hidden',
  },
  imageBox: { position: 'absolute' },
  image: { width: '100%', height: '100%' },
  closeWrap: {
    position: 'absolute',
    right: 16,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPressed: { opacity: 0.6 },
})

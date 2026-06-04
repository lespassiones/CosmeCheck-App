/**
 * Toast — notification éphémère bas d'écran. Store zustand module-level pour
 * pouvoir l'appeler depuis n'importe où (mutations, catch) via `showToast()`,
 * sans context. `<ToastHost/>` est monté une fois dans `_layout`.
 */

import { useEffect, useRef, type FC } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { create } from 'zustand'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'

type ToastType = 'error' | 'success' | 'info'

interface ToastState {
  message: string | null
  type: ToastType
  seq: number
  show: (message: string, type?: ToastType) => void
  hide: () => void
}

const useToastStore = create<ToastState>((set) => ({
  message: null,
  type: 'info',
  seq: 0,
  show: (message, type = 'info') => set((s) => ({ message, type, seq: s.seq + 1 })),
  hide: () => set({ message: null }),
}))

/** Affiche un toast depuis n'importe où (hooks, mutations, catch). */
export function showToast(message: string, type: ToastType = 'info'): void {
  useToastStore.getState().show(message, type)
}

const DURATION_MS = 3200

export const ToastHost: FC = () => {
  const message = useToastStore((s) => s.message)
  const type = useToastStore((s) => s.type)
  const seq = useToastStore((s) => s.seq)
  const hide = useToastStore((s) => s.hide)
  const insets = useSafeAreaInsets()
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!message) return
    Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start()
    const t = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(() => hide())
    }, DURATION_MS)
    return () => clearTimeout(t)
  }, [seq, message, opacity, hide])

  if (!message) return null

  const bg =
    type === 'error'
      ? colors.roseDeep
      : type === 'success'
        ? colors.success
        : colors.ink

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { bottom: insets.bottom + 24, opacity }]}
    >
      <View style={[styles.toast, { backgroundColor: bg }]}>
        <Text style={styles.text} numberOfLines={3}>
          {message}
        </Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.base,
    right: spacing.base,
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    maxWidth: 480,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 8,
  },
  text: {
    ...typography.smallMedium,
    color: '#FFFFFF',
    textAlign: 'center',
  },
})

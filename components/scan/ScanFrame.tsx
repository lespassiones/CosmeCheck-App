/**
 * ScanFrame — chrome partagé pour les écrans de scan (modal-like).
 *
 * Header sticky : bouton X de fermeture (gauche) + titre centré + slot droit
 * optionnel. Theme `light` (texte sombre, fond bg) ou `dark` (texte blanc,
 * fond #0B0B0F — pour la Photo OCR).
 *
 * Utilisé par PhotoOcrFlow (dark), PasteLinkFlow (light), ManualInciInput
 * (light), ProductSearchMode (light).
 */

import { type FC, type ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'

export type ScanFrameTheme = 'light' | 'dark'

interface Props {
  title?: string
  theme?: ScanFrameTheme
  onClose: () => void
  /** Slot dans le header à droite (ex: action contextuelle). */
  headerRight?: ReactNode
  children: ReactNode
}

export const ScanFrame: FC<Props> = ({
  title,
  theme = 'light',
  onClose,
  headerRight,
  children,
}) => {
  const isDark = theme === 'dark'
  const palette = isDark ? DARK : LIGHT

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.bg }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          style={[styles.closeBtn, { backgroundColor: palette.closeBg }]}
          accessibilityRole="button"
          accessibilityLabel="Fermer"
        >
          <Ionicons name="close" size={18} color={palette.fg} />
        </Pressable>
        {title ? (
          <Text style={[styles.title, { color: palette.fg }]} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          <View />
        )}
        <View style={styles.headerRight}>{headerRight ?? <View style={styles.closeBtnSpacer} />}</View>
      </View>
      <View style={styles.body}>{children}</View>
    </SafeAreaView>
  )
}

const LIGHT = {
  bg: colors.bg,
  fg: colors.ink,
  closeBg: 'rgba(0,0,0,0.06)',
}

const DARK = {
  bg: '#0B0B0F',
  fg: '#FFFFFF',
  closeBg: 'rgba(255,255,255,0.10)',
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: Platform.OS === 'android' ? spacing.sm : 0,
    paddingBottom: spacing.sm,
    minHeight: 48,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnSpacer: { width: 36, height: 36 },
  title: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing.sm,
  },
  headerRight: { width: 36, alignItems: 'flex-end' },
  body: { flex: 1, paddingHorizontal: spacing.lg },
})

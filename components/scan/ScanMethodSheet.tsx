/**
 * ScanMethodSheet — bottom-sheet de sélection de la méthode d'analyse.
 *
 * Apparaît quand on tape sur le FAB « Décode » (BottomTabBar), organisée en
 * grille asymétrique (twin du web) :
 *   - Colonne gauche (grande carte) : Code-barres.
 *   - Colonne droite (cartes compactes) : Coller la composition, Rechercher un
 *     produit.
 * (Le scan par photo/OCR a été retiré ; le lien e-commerce est désactivé.)
 *
 * Les hauteurs sont FIXES pour que les deux colonnes restent visuellement
 * alignées et tiennent dans la sheet :
 *   leftCol  = 2 × BIG_H  + 1 × GAP   = 234
 *   rightCol = 3 × SMALL_H + 2 × GAP   = 234
 *
 * Le choix ferme la sheet et navigue vers `/scan?mode=…` ; l'écran scan ouvre
 * le bon flow selon la query.
 */

import { type FC, useCallback, useEffect } from 'react'
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'

export type ScanMethod = 'barcode' | 'manual' | 'link' | 'search'

type IoniconName = keyof typeof Ionicons.glyphMap

interface Props {
  visible: boolean
  onClose: () => void
  onSelect: (method: ScanMethod) => void
}

const NAVY = '#1E3A8A'
const BORDER = '#E5E7EB'

// Dimensions fixes pour aligner les deux colonnes (cf. doc en tête de fichier).
// Photo OCR retirée, Lien désactivé → gauche = 1 carte, droite = 2 cartes.
// BIG_H = 2 × SMALL_H + GAP pour conserver l'alignement vertical.
const SMALL_H = 70
const GAP = 10
const BIG_H = 2 * SMALL_H + GAP // 150

export const ScanMethodSheet: FC<Props> = ({ visible, onClose, onSelect }) => {
  const insets = useSafeAreaInsets()
  const translateY = useSharedValue(600)
  const backdrop = useSharedValue(0)

  useEffect(() => {
    let reduce = false
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        reduce = v
      })
      .catch(() => {})

    if (visible) {
      backdrop.value = withTiming(1, {
        duration: reduce ? 0 : 180,
        easing: Easing.out(Easing.ease),
      })
      translateY.value = withTiming(0, {
        duration: reduce ? 0 : 260,
        easing: Easing.out(Easing.cubic),
      })
    } else {
      backdrop.value = withTiming(0, { duration: reduce ? 0 : 160 })
      translateY.value = withTiming(600, {
        duration: reduce ? 0 : 220,
        easing: Easing.in(Easing.cubic),
      })
    }
  }, [visible, backdrop, translateY])

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }))
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value,
  }))

  const handleSelect = useCallback(
    (m: ScanMethod) => {
      onSelect(m)
    },
    [onSelect],
  )

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable
            accessibilityLabel="Fermer"
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + spacing.md },
            sheetStyle,
          ]}
        >
          <View style={styles.handle} />

          <Text style={styles.title}>Comment veux-tu analyser ?</Text>

          <View style={styles.grid}>
            {/* Colonne gauche : Code-barres (photo OCR désactivée) */}
            <View style={styles.leftCol}>
              <BigOption
                icon="barcode-outline"
                title="Code-barres"
                subtitle="Scan rapide en magasin"
                onPress={() => handleSelect('barcode')}
                grow
              />
            </View>

            {/* Colonne droite : 2 cartes (lien désactivé) */}
            <View style={styles.rightCol}>
              <SmallOption
                icon="document-text-outline"
                title="Coller la composition"
                onPress={() => handleSelect('manual')}
              />
              {/* Coller le lien — temporairement désactivé
              {false && (
                <SmallOption
                  icon="link-outline"
                  title="Coller le lien"
                  badge="NEW"
                  onPress={() => handleSelect('link')}
                />
              )}
              */}
              <SmallOption
                icon="search-outline"
                title="Rechercher un produit"
                onPress={() => handleSelect('search')}
              />
            </View>
          </View>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.cancelBtn,
              pressed && styles.cancelBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Annuler"
          >
            <Text style={styles.cancelText}>Annuler</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  )
}

// ─── Carte grande (icône en haut, titre, sous-titre) ──────────────────────────

const BigOption: FC<{
  icon: IoniconName
  title: string
  subtitle: string
  onPress: () => void
  grow?: boolean
}> = ({ icon, title, subtitle, onPress, grow }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.bigCard, grow && styles.bigCardGrow, pressed && styles.cardPressed]}
    accessibilityRole="button"
  >
    <Ionicons name={icon} size={48} color={colors.ink} />
    <Text style={styles.bigTitle} numberOfLines={2}>
      {title}
    </Text>
    <Text style={styles.bigSubtitle} numberOfLines={1}>
      {subtitle}
    </Text>
  </Pressable>
)

// ─── Carte compacte (icône à gauche, titre) ───────────────────────────────────

const SmallOption: FC<{
  icon: IoniconName
  title: string
  badge?: string
  onPress: () => void
}> = ({ icon, title, badge, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.smallCard, pressed && styles.cardPressed]}
    accessibilityRole="button"
  >
    <Ionicons name={icon} size={20} color={colors.ink} />
    <Text style={styles.smallTitle} numberOfLines={2}>
      {title}
    </Text>
    {badge ? (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{badge}</Text>
      </View>
    ) : null}
  </Pressable>
)

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 20,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fontFamilies.bold,
    fontSize: 17,
    color: NAVY,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    gap: GAP,
  },
  leftCol: {
    flex: 1,
    gap: GAP,
  },
  rightCol: {
    flex: 1,
    gap: GAP,
  },
  // ── Grande carte ──
  bigCard: {
    height: BIG_H,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: 'space-between',
  },
  bigCardGrow: {
    height: undefined,
    flex: 1,
  },
  bigTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13.5,
    color: colors.ink,
    lineHeight: 17,
  },
  bigSubtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.inkMuted,
    lineHeight: 14,
  },
  // ── Petite carte ──
  smallCard: {
    height: SMALL_H,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  smallTitle: {
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 17,
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  // ── Badge NEW ──
  badge: {
    position: 'absolute',
    top: -7,
    right: -6,
    backgroundColor: '#F43F5E',
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    shadowColor: '#F43F5E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  badgeText: {
    fontFamily: fontFamilies.bold,
    fontSize: 9,
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  // ── Annuler ──
  cancelBtn: {
    alignSelf: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: radius.full,
    backgroundColor: '#E5E7EB',
  },
  cancelBtnPressed: { opacity: 0.8 },
  cancelText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: colors.inkMuted,
  },
})

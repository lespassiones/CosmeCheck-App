/**
 * ScanPreviewCard — carte APERÇU affichée en bas de l'écran de scan dès qu'un
 * produit du catalogue est reconnu, SANS lancer l'analyse complète. Reprend le
 * « haut d'analyse » : photo, nom, marque, sous-catégorie, pastilles (VerdictGauge)
 * + Partager + « Voir le produit » (qui, lui, lance l'analyse complète).
 *
 * 100% instantané : toutes les données viennent d'une seule lecture catalogue
 * renvoyée par `product-by-barcode` (champ `preview`). Aucun calcul lourd ici.
 */
import { memo, useCallback } from 'react'
import { Pressable, Share, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'

import { VerdictGauge } from '@/components/analysis/VerdictGauge'
import { verdictToneFromScore, type VerdictTone } from '@/lib/essentiel/engine'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'

export type ScanPreview = {
  ean: string
  brand: string | null
  name: string | null
  category: string | null
  score: number | null
  scoreTone: string | null
  scoreLabel: string | null
  countOrange: number
  countRouge: number
  imageUrl: string | null
}

interface Props {
  preview: ScanPreview
  /** « Voir le produit » → lance l'analyse complète + navigue. */
  onSeeProduct: () => void
  /** Ferme la carte et réarme le scanner. */
  onClose: () => void
}

/** Dernier segment du chemin de catégorie, humanisé (« gel-douche » → « Gel douche »). */
function subcategoryLabel(category: string | null): string | null {
  if (!category) return null
  const leaf = category.split('/').filter(Boolean).pop()
  if (!leaf) return null
  const words = leaf.replace(/-/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function toneFor(preview: ScanPreview): VerdictTone {
  if (preview.countRouge >= 2) return 'high-risk'
  return verdictToneFromScore(preview.score)
}

export const ScanPreviewCard = memo(function ScanPreviewCard({ preview, onSeeProduct, onClose }: Props) {
  const subcat = subcategoryLabel(preview.category)
  const tone = toneFor(preview)

  const onShare = useCallback(() => {
    const title = [preview.brand, preview.name].filter(Boolean).join(' ')
    Share.share({
      message: `${title || 'Ce produit'} — analysé sur Cosme Check`,
    }).catch(() => {})
  }, [preview.brand, preview.name])

  return (
    <Animated.View
      key={preview.ean}
      entering={FadeInDown.duration(320).springify().damping(18)}
      style={styles.card}
    >
      <Pressable
        onPress={onSeeProduct}
        accessibilityRole="button"
        accessibilityLabel="Ouvrir l'analyse complète"
      >
      <View style={styles.topRow}>
        <View style={styles.imageWrap}>
          {preview.imageUrl ? (
            <Image
              source={{ uri: preview.imageUrl }}
              style={styles.image}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={120}
            />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]}>
              <Ionicons name="cube-outline" size={26} color={colors.inkMuted} />
            </View>
          )}
        </View>

        <View style={styles.info}>
          {!!preview.brand && <Text style={styles.brand} numberOfLines={1}>{preview.brand}</Text>}
          <Text style={styles.name} numberOfLines={2}>{preview.name ?? 'Produit'}</Text>
          {!!subcat && (
            <View style={styles.chip}>
              <Text style={styles.chipText} numberOfLines={1}>{subcat}</Text>
            </View>
          )}
        </View>

        <Pressable style={styles.close} onPress={onClose} hitSlop={10} accessibilityLabel="Fermer">
          <Ionicons name="close" size={20} color={colors.inkMuted} />
        </Pressable>
      </View>

      {/* Pastilles (haut d'analyse) */}
      <VerdictGauge tone={tone} style={styles.gauge} />

      <View style={styles.actions}>
        <Pressable style={styles.shareBtn} onPress={onShare} hitSlop={6} accessibilityLabel="Partager">
          <Ionicons name="share-social-outline" size={18} color={colors.ink} />
          <Text style={styles.shareText}>Partager</Text>
        </Pressable>
        <Pressable style={styles.seeBtn} onPress={onSeeProduct} hitSlop={6}>
          <Text style={styles.seeText}>Voir le produit</Text>
        </Pressable>
      </View>
      </Pressable>
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.lg,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  imageWrap: { width: 72, height: 72, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#F1F5F9' },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minHeight: 72, justifyContent: 'center' },
  brand: { ...typography.small, color: colors.inkMuted, marginBottom: 2 },
  name: { ...typography.h4, color: colors.ink },
  chip: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: '#EEF2F6',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  chipText: { ...typography.xs, color: colors.ink },
  close: { padding: 2 },
  gauge: { marginTop: spacing.md, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: '#F1F5F9',
  },
  shareText: { ...typography.button, color: colors.ink },
  seeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
  },
  seeText: { ...typography.button, color: '#FFFFFF' },
})

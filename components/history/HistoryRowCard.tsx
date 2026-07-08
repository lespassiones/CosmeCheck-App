/**
 * HistoryRowCard — une carte de la liste d'historique.
 *
 * Affiche :
 *  - l'IMAGE produit à gauche (résolue via EAN = source de vérité, fallback
 *    placeholder si le produit n'a pas d'image) — remplace l'ancien demi-donut ;
 *  - le titre (nom > product_label > fallback) + chip catégorie + CTA promesse ;
 *  - à droite : un ANNEAU de proportion des ingrédients (vert/jaune/orange/rouge)
 *    juste au-dessus du favori (signet) et du kebab (•••).
 *
 * En mode sélection (comparaison), la carte devient un toggle avec coche, image
 * compacte + titre.
 */

import { memo, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import Svg, { Circle, G } from 'react-native-svg'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { WhiteCard } from '@/components/design/WhiteCard'
import { getProductImage } from '@/lib/storage/productImageCache'
import type { ColorRating } from '@/lib/analysis/types'

/** Affichage de la date relative (« il y a 8 h »). Désactivé pour libérer de la
 *  place au nom du produit. Repasser à true pour le réactiver. */
const SHOW_DATE = false

export interface HistoryItemView {
  id: string
  title: string
  category: string | null
  score: number | null
  rating: ColorRating
  counts: { vert: number; jaune: number; orange: number; rouge: number }
  dateLabel: string
  latestCoherenceId: string | null
  favori: boolean
  ean: string | null
  brand: string | null
  /** Image produit résolue en lot (par EAN) dans la requête historique. */
  imageUrl: string | null
}

interface Props {
  item: HistoryItemView
  selectMode: boolean
  selected: boolean
  onPress: () => void
  onToggleSelect: () => void
  onOpenActions: () => void
  onAnalysePromesse: () => void
  onToggleFavori: () => void
}

const RING_ORDER = ['vert', 'jaune', 'orange', 'rouge'] as const

/** Anneau plein (donut) montrant la proportion des ingrédients par couleur. */
const ProportionRing = memo(function ProportionRing({
  counts,
  size = 40,
  stroke = 7,
}: {
  counts: HistoryItemView['counts']
  size?: number
  stroke?: number
}) {
  const total = counts.vert + counts.jaune + counts.orange + counts.rouge
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const cx = size / 2
  const cy = size / 2

  const segments: { key: (typeof RING_ORDER)[number]; frac: number; offset: number }[] = []
  if (total > 0) {
    let acc = 0
    for (const k of RING_ORDER) {
      const v = counts[k]
      if (v <= 0) continue
      const frac = v / total
      segments.push({ key: k, frac, offset: acc })
      acc += frac
    }
  }

  return (
    <Svg width={size} height={size}>
      <G rotation={-90} originX={cx} originY={cy}>
        {/* Piste de fond */}
        <Circle cx={cx} cy={cy} r={r} stroke={colors.spectrum.empty} strokeWidth={stroke} fill="none" />
        {segments.map((s) => (
          <Circle
            key={s.key}
            cx={cx}
            cy={cy}
            r={r}
            stroke={colors.spectrum[s.key]}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${s.frac * circ} ${circ - s.frac * circ}`}
            strokeDashoffset={-s.offset * circ}
            strokeLinecap="butt"
          />
        ))}
      </G>
    </Svg>
  )
})

/**
 * Image produit : la requête historique a déjà résolu `item.imageUrl` en lot
 * (par EAN, source de vérité). On retombe sur le cache local uniquement pour les
 * produits hors catalogue (coller-lien / photo) dont l'image a été stockée à
 * l'analyse.
 */
function useProductImage(item: HistoryItemView): string | null {
  const [url, setUrl] = useState<string | null>(item.imageUrl ?? null)
  useEffect(() => {
    if (item.imageUrl) {
      setUrl(item.imageUrl)
      return
    }
    let cancelled = false
    void getProductImage(item.id).then((cached) => {
      if (!cancelled && cached) setUrl(cached)
    })
    return () => {
      cancelled = true
    }
  }, [item.id, item.imageUrl])
  return url
}

function ProductThumb({
  url,
  width,
  iconSize,
}: {
  url: string | null
  width: number
  iconSize: number
}) {
  return (
    // Largeur fixe, hauteur étirée sur toute la carte (portrait, pas carré).
    <View style={[styles.thumb, { width }]}>
      {url ? (
        <Image
          source={{ uri: url }}
          style={styles.thumbImg}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Ionicons name="image-outline" size={iconSize} color={colors.inkLight} />
      )}
    </View>
  )
}

export const HistoryRowCard = memo(function HistoryRowCard({
  item,
  selectMode,
  selected,
  onPress,
  onToggleSelect,
  onOpenActions,
  onAnalysePromesse,
  onToggleFavori,
}: Props) {
  const imageUrl = useProductImage(item)

  if (selectMode) {
    return (
      <WhiteCard
        onPress={onToggleSelect}
        padding={spacing.base}
        borderRadius={radius.lg}
        style={selected ? styles.cardSelected : undefined}
      >
        <View style={styles.row}>
          <View style={[styles.checkbox, selected && styles.checkboxOn]}>
            {selected && <Ionicons name="checkmark" size={14} color={colors.surface} />}
          </View>
          <ProductThumb url={imageUrl} width={52} iconSize={20} />
          <View style={styles.main}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            {SHOW_DATE ? <Text style={styles.date}>{item.dateLabel}</Text> : null}
          </View>
          <View style={styles.selfCenter}>
            <ProportionRing counts={item.counts} size={36} stroke={6} />
          </View>
        </View>
      </WhiteCard>
    )
  }

  const hasCoherence = Boolean(item.latestCoherenceId)

  return (
    <WhiteCard onPress={onPress} padding={spacing.base} borderRadius={radius.lg}>
      <View style={styles.row}>
        <ProductThumb url={imageUrl} width={64} iconSize={24} />

        <View style={styles.main}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          {item.category ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {item.category}
            </Text>
          ) : null}
          {SHOW_DATE ? (
            <Text style={styles.date} numberOfLines={1}>
              {item.dateLabel}
            </Text>
          ) : null}

          <Pressable
            onPress={onAnalysePromesse}
            style={[
              styles.promesseCta,
              { borderColor: hasCoherence ? colors.success : colors.accent },
            ]}
            accessibilityRole="button"
          >
            <Ionicons
              name="sparkles"
              size={12}
              color={hasCoherence ? colors.success : colors.accent}
            />
            <Text
              style={[
                styles.promesseText,
                { color: hasCoherence ? colors.success : colors.accent },
              ]}
            >
              {hasCoherence ? "Voir l'analyse de la promesse" : 'Analyser la promesse'}
            </Text>
          </Pressable>
        </View>

        {/* Colonne de droite : anneau de proportion au-dessus du favori + kebab. */}
        <View style={styles.rightCol}>
          <ProportionRing counts={item.counts} size={40} stroke={7} />
          <View style={styles.actions}>
            <Pressable
              onPress={onToggleFavori}
              hitSlop={8}
              style={styles.kebab}
              accessibilityRole="button"
              accessibilityLabel={item.favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            >
              <Ionicons
                name={item.favori ? 'bookmark' : 'bookmark-outline'}
                size={18}
                color={item.favori ? colors.rose : colors.inkMuted}
              />
            </Pressable>
            <Pressable
              onPress={onOpenActions}
              hitSlop={8}
              style={styles.kebab}
              accessibilityRole="button"
              accessibilityLabel="Plus d'actions"
            >
              <Ionicons name="ellipsis-vertical" size={18} color={colors.inkMuted} />
            </Pressable>
          </View>
        </View>
      </View>
    </WhiteCard>
  )
})

const styles = StyleSheet.create({
  cardSelected: { borderWidth: 2, borderColor: colors.ink },
  // 'stretch' : l'image (thumb) épouse toute la hauteur de la carte.
  // 'minHeight' : hauteur commune → toutes les cartes ont la même taille quel
  // que soit le contenu (texte 1 ou 2 lignes) ou l'image.
  row: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md, minHeight: 90 },
  thumb: {
    position: 'relative',
    borderRadius: radius.md,
    backgroundColor: colors.gray100,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    // Déborde dans le padding de la carte (16) pour ne laisser qu'un petit
    // liseré (~6px) haut/bas/gauche → l'image occupe ~90% de la hauteur.
    marginVertical: -10,
    marginLeft: -10,
    minHeight: 56,
    flexShrink: 0,
  },
  // Image en position absolue : elle remplit la hauteur définie par la colonne
  // texte (via 'stretch') SANS que sa taille intrinsèque ne gonfle la carte.
  thumbImg: { ...StyleSheet.absoluteFillObject },
  selfCenter: { alignSelf: 'center' },
  main: { flex: 1, minWidth: 0, alignSelf: 'center' },
  title: { ...typography.bodySemiBold, color: colors.ink },
  subtitle: { ...typography.xs, color: colors.inkMuted, marginTop: 2 },
  date: { ...typography.xs, color: colors.inkLight, marginTop: 2 },
  rightCol: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginRight: -spacing.xs,
  },
  actions: { flexDirection: 'row', alignItems: 'center' },
  kebab: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.inkLight,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  checkboxOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  promesseCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    backgroundColor: 'transparent',
    marginTop: spacing.sm,
  },
  promesseText: { ...typography.xsSemiBold, fontSize: 10 },
})

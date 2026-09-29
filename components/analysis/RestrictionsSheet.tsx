/**
 * RestrictionsSheet : feuille « N de tes restrictions », ouverte au tap sur
 * « Contient N de tes restrictions » (carte de compatibilité de l'analyse).
 *
 * Une ligne par restriction présente dans le produit : bouclier + nom de la
 * famille (ou de l'ingrédient restreint) + ingrédients concernés en dessous.
 *   - un seul ingrédient concerné : le tap ouvre sa fiche ;
 *   - plusieurs : le tap déplie la liste, chaque ingrédient ouvre sa fiche.
 * En bas, « Gérer mes restrictions » mène à /profile/restrictions.
 *
 * Pattern Modal repris de ConflictsSheet (fond transparent + poignée).
 */
import { useEffect, useState, type FC } from 'react'
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native'
import { HapticPressable as Pressable } from '@/components/shared/HapticPressable'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { radius, spacing } from '@/constants/spacing'
import { PressableScale, StaggerItem } from '@/components/design/motion'
import type { RestrictionGroup } from '@/lib/restrictions/group'
import { runAfterModalClose } from '@/lib/navigation/afterModalClose'

interface Props {
  visible: boolean
  onClose: () => void
  groups: RestrictionGroup[]
  /** Ouvre la fiche ingrédient (/ingredient/[slug]). */
  onIngredientPress: (slug: string) => void
  /** Ouvre /profile/restrictions. */
  onManage: () => void
}

function prettyName(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

export const RestrictionsSheet: FC<Props> = ({
  visible,
  onClose,
  groups,
  onIngredientPress,
  onManage,
}) => {
  const insets = useSafeAreaInsets()
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) setExpanded(null)
  }, [visible])

  // Naviguer APRÈS la sortie de la feuille (Modal) : pousser un écran pendant
  // qu'elle se ferme peut laisser un calque invisible qui bloque tout (iOS).
  const openIngredient = (slug: string) => {
    onClose()
    runAfterModalClose(() => onIngredientPress(slug))
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          haptic="none"
          pressScale={false}
          accessibilityRole="button"
          accessibilityLabel="Fermer"
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.base }]}>
          <View style={styles.handle} />
          <Text style={styles.title} accessibilityRole="header">
            {groups.length} de tes restrictions
          </Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              {groups.map((g, i) => (
                <StaggerItem key={g.key} index={i}>
                  <RestrictionRow
                    group={g}
                    first={i === 0}
                    expanded={expanded === g.key}
                    onToggle={() => setExpanded((k) => (k === g.key ? null : g.key))}
                    onOpenIngredient={openIngredient}
                  />
                </StaggerItem>
              ))}
            </View>
          </ScrollView>

          <PressableScale
            style={styles.manageButton}
            onPress={() => {
              onClose()
              runAfterModalClose(onManage)
            }}
            haptic="primary"
            accessibilityRole="button"
            accessibilityLabel="Gérer mes restrictions"
          >
            <Text style={styles.manageText}>Gérer mes restrictions</Text>
          </PressableScale>
        </View>
      </View>
    </Modal>
  )
}

// ── Ligne d'une restriction ──────────────────────────────────────────────────

const RestrictionRow: FC<{
  group: RestrictionGroup
  first: boolean
  expanded: boolean
  onToggle: () => void
  onOpenIngredient: (slug: string) => void
}> = ({ group, first, expanded, onToggle, onOpenIngredient }) => {
  const names = group.ingredients.map((it) => prettyName(it.name))
  const subtitle =
    group.kind === 'family' ? names.join(', ') : 'Ingrédient que tu évites'
  const linkable = group.ingredients.filter((it) => it.slug)
  const single = linkable.length === 1 && group.ingredients.length === 1
  const multiple = group.ingredients.length > 1 && linkable.length > 0

  const onPress = single
    ? () => onOpenIngredient(linkable[0].slug!)
    : multiple
      ? onToggle
      : undefined

  return (
    <View style={!first && styles.rowDivider}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${group.label}, ${subtitle}` : group.label}
        accessibilityState={multiple ? { expanded } : undefined}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <Ionicons name="shield-checkmark-outline" size={24} color={colors.ink} />
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{group.label}</Text>
          {subtitle ? (
            <Text style={styles.rowSub} numberOfLines={expanded ? undefined : 2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {onPress ? (
          <Ionicons
            name={multiple ? (expanded ? 'chevron-up' : 'chevron-down') : 'chevron-forward'}
            size={20}
            color={colors.inkMuted}
          />
        ) : null}
      </Pressable>

      {multiple && expanded ? (
        <View style={styles.subList}>
          {group.ingredients.map((it) => (
            <Pressable
              key={it.position}
              onPress={it.slug ? () => onOpenIngredient(it.slug!) : undefined}
              disabled={!it.slug}
              accessibilityRole="button"
              accessibilityLabel={`Voir la fiche de ${prettyName(it.name)}`}
              style={({ pressed }) => [styles.subRow, pressed && styles.rowPressed]}
            >
              <Text style={styles.subName} numberOfLines={1}>
                {prettyName(it.name)}
              </Text>
              {it.slug ? (
                <Ionicons name="chevron-forward" size={16} color={colors.inkMuted} />
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const ICON_COL = 24 + spacing.md

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    maxHeight: '85%',
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.gray300,
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: fontFamilies.bold,
    fontSize: 24,
    lineHeight: 30,
    color: colors.ink,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.base,
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.base,
  },
  rowPressed: { backgroundColor: colors.gray50 },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowText: { flex: 1, minWidth: 0 },
  // Titre en rouge, même teinte que « Contient N de tes restrictions ».
  rowTitle: { fontFamily: fontFamilies.semiBold, fontSize: 16, color: colors.rating.rouge.text },
  rowSub: {
    fontFamily: fontFamilies.regular,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.inkMuted,
    marginTop: 2,
  },
  subList: { paddingBottom: spacing.sm },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.base + ICON_COL,
    paddingRight: spacing.base,
    paddingVertical: spacing.sm + 2,
  },
  subName: { flex: 1, fontFamily: fontFamilies.medium, fontSize: 14, color: colors.ink },
  manageButton: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageText: { fontFamily: fontFamilies.semiBold, fontSize: 16, color: '#FFFFFF' },
})

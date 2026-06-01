/**
 * SkinProfileCard — carte récapitulatif du profil beauté.
 *
 * Affiche le type de peau (visage / corps), les préoccupations principales et
 * les objectifs, ou un CTA « Compléter mon profil » si rien n'est renseigné.
 * Le bouton « Modifier » ouvre le formulaire d'édition (onEditPress).
 *
 * Lit le profil via @/lib/skin/profile (readSkinProfile) directement depuis la
 * vue `skin` fournie par useProfile, pour rester aligné avec le web.
 */

import { type FC, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import {
  HAIR_CONCERN_LABEL,
  PROFILE_GOAL_LABEL,
  SKIN_CONCERN_LABEL,
  SKIN_TYPE_BODY_LABEL,
  SKIN_TYPE_FACE_LABEL,
  isProfileStarted,
  type HairConcern,
  type ProfileGoal,
  type SkinConcern,
  type SkinProfile,
  type SkinTypeBody,
  type SkinTypeFace,
} from '@/lib/skin/profile'
import { NeuCard } from '@/components/design/NeuCard'

interface Props {
  skin: SkinProfile
  onEditPress: () => void
  compact?: boolean
}

/** Chip lecture seule (préoccupation / objectif). */
const ReadChip: FC<{ label: string; tone?: 'accent' | 'rose' }> = ({
  label,
  tone = 'rose',
}) => {
  const bg = tone === 'rose' ? colors.roseSoft : colors.accentSoft
  const fg = tone === 'rose' ? colors.roseDeep : colors.accentDeep
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
    </View>
  )
}

const TypeRow: FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.typeRow}>
    <Text style={styles.typeLabel}>{label}</Text>
    <View style={styles.typeBadge}>
      <Text style={styles.typeBadgeText}>{value}</Text>
    </View>
  </View>
)

export const SkinProfileCard: FC<Props> = ({ skin, onEditPress, compact = false }) => {
  const started = isProfileStarted(skin)

  const faceLabel = skin.skinTypeFace
    ? SKIN_TYPE_FACE_LABEL[skin.skinTypeFace as SkinTypeFace]
    : skin.otherSkinTypeFace ?? null
  const bodyLabel = skin.skinTypeBody
    ? SKIN_TYPE_BODY_LABEL[skin.skinTypeBody as SkinTypeBody]
    : skin.otherSkinTypeBody ?? null

  const concernLabels = useMemo(() => {
    const skinC = (skin.concerns ?? []).map(
      (c: SkinConcern) => SKIN_CONCERN_LABEL[c],
    )
    const hairC = (skin.hairConcerns ?? []).map(
      (c: HairConcern) => HAIR_CONCERN_LABEL[c],
    )
    return [...skinC, ...hairC].filter(Boolean).slice(0, 3)
  }, [skin.concerns, skin.hairConcerns])

  const goalLabels = useMemo(
    () =>
      (skin.goals ?? [])
        .map((g: ProfileGoal) => PROFILE_GOAL_LABEL[g])
        .filter(Boolean)
        .slice(0, 2),
    [skin.goals],
  )

  // ── État incomplet : CTA de complétion ──────────────────────────────
  if (!started) {
    return (
      <NeuCard padding={spacing.lg} interactive={false} style={styles.card}>
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="sparkles-outline" size={22} color={colors.accent} />
          </View>
          <Text style={styles.emptyTitle}>Personnalise ton expérience</Text>
          <Text style={styles.emptyText}>
            Renseigne ton profil beauté pour des analyses et des conseils adaptés à toi.
          </Text>
          <Pressable
            onPress={onEditPress}
            accessibilityRole="button"
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          >
            <Text style={styles.ctaText}>Compléter mon profil</Text>
          </Pressable>
        </View>
      </NeuCard>
    )
  }

  return (
    <NeuCard padding={spacing.lg} interactive={false} style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.cardTitle}>Mon profil beauté</Text>
        <Pressable
          onPress={onEditPress}
          accessibilityRole="button"
          accessibilityLabel="Modifier mon profil"
          hitSlop={8}
          style={({ pressed }) => [styles.editBtn, pressed && styles.editPressed]}
        >
          <Ionicons name="pencil" size={14} color={colors.accent} />
          <Text style={styles.editText}>Modifier</Text>
        </Pressable>
      </View>

      <View style={styles.types}>
        {faceLabel ? <TypeRow label="Peau du visage" value={faceLabel} /> : null}
        {bodyLabel ? <TypeRow label="Peau du corps" value={bodyLabel} /> : null}
      </View>

      {!compact && concernLabels.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Mes préoccupations principales</Text>
          <View style={styles.chips}>
            {concernLabels.map((label) => (
              <ReadChip key={label} label={label} tone="rose" />
            ))}
          </View>
        </View>
      ) : null}

      {!compact && goalLabels.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Mes objectifs</Text>
          <View style={styles.chips}>
            {goalLabels.map((label) => (
              <ReadChip key={label} label={label} tone="accent" />
            ))}
          </View>
        </View>
      ) : null}
    </NeuCard>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  cardTitle: { ...typography.h4, color: colors.ink },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
  },
  editPressed: { opacity: 0.6 },
  editText: { ...typography.smallSemiBold, color: colors.accent },
  types: { gap: spacing.sm },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeLabel: { ...typography.small, color: colors.inkMuted },
  typeBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.accentSoft,
  },
  typeBadgeText: { ...typography.smallMedium, color: colors.accentDeep },
  section: { marginTop: spacing.md, gap: spacing.sm },
  sectionLabel: { ...typography.xsMedium, color: colors.inkMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  chipText: { ...typography.xsMedium },
  // ── Empty state ──────────────────────────────────────────────────
  emptyWrap: { alignItems: 'center', gap: spacing.sm },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: { ...typography.bodyMedium, color: colors.ink },
  emptyText: {
    ...typography.small,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  cta: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  ctaPressed: { opacity: 0.85 },
  ctaText: { ...typography.button, color: '#FFFFFF' },
})

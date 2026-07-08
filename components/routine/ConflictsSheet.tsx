/**
 * ConflictsSheet — bottom sheet « Conflits détectés » de l'onglet routine.
 *
 * Deux niveaux :
 *   1. Conflits DÉTERMINISTES (socle local, gratuit) : liste ordonnée par
 *      sévérité, avec icône + titre + explication + conseil + produits concernés.
 *      Note de pied : « Vérification instantanée. Sans IA. Sans crédit. »
 *   2. Analyse approfondie IA (optionnelle, 1 crédit) : CTA qui invoque l'Edge
 *      `routine-conflicts-ai` ; le résultat NUANCE le socle sans le répéter.
 *
 * Le state IA (chargement / résultats / erreur) est possédé par le hook côté
 * onglet et injecté en props. Aucun tiret cadratin, aucun score produit affiché.
 *
 * Pattern Modal repris de PenalizingDetailModal (app/(tabs)/routine.tsx).
 */
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import type { ConflictSeverity, RoutineConflict } from '@/lib/routine/conflicts'

/** Conflit issu de l'analyse IA (le high reste réservé au moteur déterministe). */
export type AiConflict = {
  title: string
  explanation: string
  tip: string
  severity: 'medium' | 'info'
  products: string[]
}

export interface ConflictsSheetProps {
  visible: boolean
  onClose: () => void
  conflicts: RoutineConflict[]
  productNameById: (id: string) => string
  /** flag_conflicts actif ET routine non vide : la section IA est proposée. */
  aiEnabled: boolean
  aiLoading: boolean
  aiResults: { conflicts: AiConflict[]; note: string | null } | null
  aiError: string | null
  onRunAi: () => void
}

type SeverityStyle = { icon: keyof typeof Ionicons.glyphMap; color: string }

function severityStyle(sev: ConflictSeverity): SeverityStyle {
  if (sev === 'high') return { icon: 'warning', color: colors.rating.rouge.text }
  if (sev === 'medium') return { icon: 'warning', color: colors.rating.orange.text }
  return { icon: 'information-circle', color: colors.inkMuted }
}

/** Carte d'un conflit (déterministe ou IA) : icône + titre + explication + tip. */
function ConflictCard({
  severity,
  title,
  explanation,
  tip,
  productNames,
  ai,
}: {
  severity: ConflictSeverity
  title: string
  explanation: string
  tip: string
  productNames: string
  ai?: boolean
}) {
  const sev = severityStyle(severity)
  return (
    <View style={[styles.card, ai && styles.cardAi]}>
      <View style={styles.cardHead}>
        <Ionicons
          name={ai ? 'sparkles' : sev.icon}
          size={16}
          color={ai ? colors.accent : sev.color}
        />
        {title.length > 0 && <Text style={styles.cardTitle}>{title}</Text>}
      </View>
      {explanation.length > 0 && <Text style={styles.cardExplanation}>{explanation}</Text>}
      {tip.length > 0 && (
        <View style={styles.tipRow}>
          <Ionicons name="arrow-forward" size={14} color={colors.accent} />
          <Text style={styles.tipText}>{tip}</Text>
        </View>
      )}
      {productNames.length > 0 && <Text style={styles.cardProducts}>{productNames}</Text>}
    </View>
  )
}

export function ConflictsSheet({
  visible,
  onClose,
  conflicts,
  productNameById,
  aiEnabled,
  aiLoading,
  aiResults,
  aiError,
  onRunAi,
}: ConflictsSheetProps) {
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.title}>Conflits détectés</Text>
              {conflicts.length > 0 && (
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{conflicts.length}</Text>
                </View>
              )}
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <Ionicons name="close" size={20} color={colors.inkMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {conflicts.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="checkmark-circle" size={40} color={colors.success} />
                <Text style={styles.emptyText}>Aucun conflit détecté dans ta routine.</Text>
              </View>
            ) : (
              conflicts.map((c) => (
                <ConflictCard
                  key={c.id}
                  severity={c.severity}
                  title={c.title}
                  explanation={c.explanation}
                  tip={c.tip}
                  productNames={c.productIds.map(productNameById).filter(Boolean).join(' · ')}
                />
              ))
            )}

            <Text style={styles.footerNote}>
              Vérification instantanée. Sans IA. Sans crédit.
            </Text>

            {aiEnabled && (
              <View style={styles.aiSection}>
                {aiResults ? (
                  <>
                    <Text style={styles.aiSectionTitle}>Analyse approfondie</Text>
                    {aiResults.conflicts.length === 0 ? (
                      <Text style={styles.aiEmptyText}>
                        Rien de plus à signaler au-delà des points ci-dessus.
                      </Text>
                    ) : (
                      aiResults.conflicts.map((c, i) => (
                        <ConflictCard
                          key={`ai-${i}`}
                          severity={c.severity}
                          title={c.title}
                          explanation={c.explanation}
                          tip={c.tip}
                          productNames={c.products.filter(Boolean).join(' · ')}
                          ai
                        />
                      ))
                    )}
                    {aiResults.note && <Text style={styles.aiNote}>{aiResults.note}</Text>}
                  </>
                ) : (
                  <>
                    <Pressable
                      style={[styles.aiCta, aiLoading && styles.aiCtaDisabled]}
                      onPress={onRunAi}
                      disabled={aiLoading}
                      accessibilityRole="button"
                      accessibilityLabel="Lancer l'analyse approfondie par IA"
                    >
                      {aiLoading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Ionicons name="sparkles" size={16} color="#FFFFFF" />
                      )}
                      <Text style={styles.aiCtaText}>Analyse approfondie IA</Text>
                      <View style={styles.creditChip}>
                        <Text style={styles.creditChipText}>1 crédit</Text>
                      </View>
                    </Pressable>
                    {aiError && (
                      <View style={styles.errorRow}>
                        <Text style={styles.errorText}>{aiError}</Text>
                        <Pressable onPress={onRunAi} hitSlop={6}>
                          <Text style={styles.retryText}>Réessayer</Text>
                        </Pressable>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    maxHeight: '80%',
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray300,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { fontFamily: fontFamilies.bold, fontSize: 16, color: colors.ink },
  countPill: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.rating.orange.text,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countPillText: { fontFamily: fontFamilies.bold, fontSize: 11, color: '#FFFFFF' },
  list: { padding: spacing.lg, gap: spacing.md },

  // Empty state
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: colors.inkMuted,
    textAlign: 'center',
  },

  // Conflict card
  card: {
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  cardAi: {
    backgroundColor: colors.accentSoft,
    borderColor: 'transparent',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: {
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  cardExplanation: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  tipText: { flex: 1, fontFamily: fontFamilies.medium, fontSize: 13, color: colors.accent },
  cardProducts: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.inkLight,
    marginTop: 2,
  },

  // Footer note
  footerNote: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.inkLight,
    textAlign: 'center',
    marginTop: spacing.xs,
  },

  // AI section
  aiSection: { marginTop: spacing.md, gap: spacing.md },
  aiSectionTitle: { fontFamily: fontFamilies.bold, fontSize: 14, color: colors.ink },
  aiEmptyText: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted },
  aiNote: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.inkMuted,
    fontStyle: 'italic',
  },
  aiCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  aiCtaDisabled: { opacity: 0.7 },
  aiCtaText: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: '#FFFFFF' },
  creditChip: {
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  creditChipText: { fontFamily: fontFamilies.semiBold, fontSize: 11, color: '#FFFFFF' },
  errorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  errorText: { fontFamily: fontFamilies.regular, fontSize: 12, color: colors.error },
  retryText: { fontFamily: fontFamilies.semiBold, fontSize: 12, color: colors.accent },
})

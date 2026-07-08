/**
 * MaPeauScreen — page « Ma peau » (score de peau /100 dans le temps).
 *
 * Sections :
 *   - hero : anneau /100 (headline = blend bilan + scan documenté dans
 *     lib/skin/score.ts) + variation hebdo + source ;
 *   - ÉVOLUTION : graphe (3 mois / 6 mois / 1 an) filtrable par dimension
 *     (Global, Imperfections, Rougeurs, Sécheresse, Brillance, Douceur) +
 *     phrase d'insight déterministe ;
 *   - CTA bilan hebdo (gratuit, 5 questions ~45 s) ;
 *   - JOURNAL PHOTO (privé, suppression long-press) ;
 *   - Scanner mon visage (IA, 2 crédits).
 *
 * Le score PEAU /100 est autorisé à l'affichage (ce n'est pas un score produit).
 */

import { type FC, useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/useAuth'
import { useSkinScore } from '@/hooks/useSkinScore'
import { deleteFaceScan, type FaceScanRow } from '@/lib/skin/api'
import { insightLine, SKIN_DIMENSIONS, type SkinDimension } from '@/lib/skin/score'
import { showToast } from '@/components/shared/Toast'
import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { WhiteCard } from '@/components/design/WhiteCard'
import { Reveal } from '@/components/design/Reveal'
import { ScoreRing } from '@/components/peau/ScoreRing'
import { DeltaChip } from '@/components/peau/DeltaChip'
import { SkinGraph } from '@/components/peau/SkinGraph'
import { PhotoJournalStrip } from '@/components/peau/PhotoJournalStrip'

type GraphDim = 'global' | SkinDimension
type Period = 3 | 6 | 12

const DIM_CHIPS: { value: GraphDim; label: string }[] = [
  { value: 'global', label: 'Global' },
  { value: 'imperfections', label: 'Imperfections' },
  { value: 'rougeurs', label: 'Rougeurs' },
  { value: 'secheresse', label: 'Sécheresse' },
  { value: 'brillance', label: 'Brillance' },
  { value: 'douceur', label: 'Douceur' },
]

const PERIOD_TABS: { value: Period; label: string }[] = [
  { value: 3, label: '3 mois' },
  { value: 6, label: '6 mois' },
  { value: 12, label: '1 an' },
]

// Sanity : les chips couvrent global + toutes les dimensions.
if (DIM_CHIPS.length !== SKIN_DIMENSIONS.length + 1) {
  throw new Error('MaPeauScreen : chips et SKIN_DIMENSIONS désalignées')
}

const MaPeauScreen: FC = () => {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { headline, blended, delta, lastCheckinWeekDone, timeline, scans, hasData, isLoading } =
    useSkinScore()

  const [dim, setDim] = useState<GraphDim>('global')
  const [period, setPeriod] = useState<Period>(6)

  const insight = insightLine(timeline, dim)

  const handleDeleteScan = useCallback(
    async (scan: FaceScanRow) => {
      try {
        await deleteFaceScan(scan.id, scan.photo_path)
        void qc.invalidateQueries({ queryKey: ['faceScans', user?.id ?? null] })
      } catch {
        showToast('Suppression impossible. Réessaie.', 'error')
      }
    },
    [qc, user?.id],
  )

  return (
    <View style={styles.root}>
      <BackgroundGlow variant="minimal" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace(ROUTES.TABS.HOME))}
            hitSlop={12}
            style={styles.backPill}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <Ionicons name="chevron-back" size={16} color={colors.ink} />
            <Text style={styles.backPillText}>Retour</Text>
          </Pressable>
          <Text style={styles.topTitle}>Ma peau</Text>
          <View style={styles.topSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.rose} />
            </View>
          ) : (
            <Reveal stagger={70}>
              {/* ── Hero : score /100 ── */}
              <WhiteCard padding={spacing.lg} style={styles.sectionCard}>
                <View style={styles.hero}>
                  <ScoreRing score={headline} size={140} animated />
                  <View style={styles.heroDelta}>
                    <DeltaChip delta={delta} />
                  </View>
                  {hasData ? (
                    <Text style={styles.heroSource}>
                      {blended ? 'Bilan hebdo + scan visage IA' : 'Basé sur ton bilan hebdo'}
                    </Text>
                  ) : (
                    <Text style={styles.heroSource}>
                      Fais ton premier bilan pour démarrer ton suivi.
                    </Text>
                  )}
                </View>
              </WhiteCard>

              {/* ── Évolution ── */}
              {hasData && (
                <WhiteCard padding={spacing.lg} style={styles.sectionCard}>
                  <View style={styles.evolutionHeader}>
                    <Text style={styles.sectionKicker}>ÉVOLUTION</Text>
                    <View style={styles.periodTabs}>
                      {PERIOD_TABS.map((p) => {
                        const active = p.value === period
                        return (
                          <Pressable
                            key={p.value}
                            onPress={() => setPeriod(p.value)}
                            style={[styles.periodTab, active && styles.periodTabActive]}
                          >
                            <Text
                              style={[styles.periodTabText, active && styles.periodTabTextActive]}
                            >
                              {p.label}
                            </Text>
                          </Pressable>
                        )
                      })}
                    </View>
                  </View>

                  <SkinGraph points={timeline} dim={dim} months={period} />

                  <View style={styles.dimChips}>
                    {DIM_CHIPS.map((c) => {
                      const active = c.value === dim
                      return (
                        <Pressable
                          key={c.value}
                          onPress={() => setDim(c.value)}
                          style={[styles.dimChip, active && styles.dimChipActive]}
                        >
                          <Text style={[styles.dimChipText, active && styles.dimChipTextActive]}>
                            {c.label}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>

                  {insight && (
                    <View style={styles.insightRow}>
                      <Ionicons name="sparkles" size={12} color={colors.rose} />
                      <Text style={styles.insightText}>{insight}</Text>
                    </View>
                  )}
                </WhiteCard>
              )}

              {/* ── CTA bilan hebdo ── */}
              <WhiteCard padding={spacing.lg} style={styles.sectionCard}>
                <View style={styles.bilanHeader}>
                  <View style={styles.bilanIconWrap}>
                    <Ionicons name="calendar-outline" size={18} color={colors.rose} />
                  </View>
                  <View style={styles.bilanMain}>
                    <Text style={styles.bilanTitle}>
                      {lastCheckinWeekDone
                        ? 'Bilan fait cette semaine'
                        : 'Ton bilan hebdo t’attend'}
                    </Text>
                    <Text style={styles.bilanHint}>
                      {lastCheckinWeekDone
                        ? 'Tu peux le refaire, il remplacera celui de la semaine.'
                        : '5 questions, environ 45 s'}
                    </Text>
                  </View>
                </View>
                <Pressable
                  style={styles.bilanBtn}
                  onPress={() => router.push(ROUTES.PEAU.BILAN)}
                  accessibilityRole="button"
                >
                  <Text style={styles.bilanBtnText}>
                    {lastCheckinWeekDone ? 'Refaire mon bilan' : 'Faire mon bilan de la semaine'}
                  </Text>
                </Pressable>
              </WhiteCard>

              {/* ── Journal photo ── */}
              <WhiteCard padding={spacing.lg} style={styles.sectionCard}>
                <Text style={styles.sectionKicker}>JOURNAL PHOTO</Text>
                <View style={styles.journalWrap}>
                  <PhotoJournalStrip scans={scans} onDelete={handleDeleteScan} />
                </View>
              </WhiteCard>

              {/* ── Scan visage IA ── */}
              <WhiteCard
                padding={spacing.lg}
                style={styles.sectionCard}
                onPress={() => router.push(ROUTES.PEAU.SCAN)}
              >
                <View style={styles.scanRow}>
                  <View style={styles.scanIconWrap}>
                    <Ionicons name="scan-outline" size={20} color={colors.accent} />
                  </View>
                  <View style={styles.scanMain}>
                    <Text style={styles.scanTitle}>Scanner mon visage</Text>
                    <Text style={styles.scanHint}>
                      Une mesure objective de ta peau, ajoutée à ton graphe.
                    </Text>
                  </View>
                  <View style={styles.creditsChip}>
                    <Ionicons name="flash" size={11} color={colors.accent} />
                    <Text style={styles.creditsChipText}>2 crédits</Text>
                  </View>
                </View>
              </WhiteCard>
            </Reveal>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

export default MaPeauScreen

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  backPillText: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: colors.ink },
  topTitle: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink },
  topSpacer: { width: 78 },
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing['3xl'],
  },
  center: { paddingTop: spacing['3xl'], alignItems: 'center' },
  sectionCard: { marginBottom: spacing.base },
  sectionKicker: {
    fontFamily: fontFamilies.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.inkMuted,
  },

  // Hero
  hero: { alignItems: 'center' },
  heroDelta: { marginTop: spacing.md },
  heroSource: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkLight,
    marginTop: spacing.sm,
    textAlign: 'center',
  },

  // Évolution
  evolutionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  periodTabs: {
    flexDirection: 'row',
    backgroundColor: colors.gray100,
    borderRadius: radius.full,
    padding: 2,
  },
  periodTab: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  periodTabActive: { backgroundColor: colors.rose },
  periodTabText: { fontFamily: fontFamilies.medium, fontSize: 11, color: colors.inkMuted },
  periodTabTextActive: { color: '#FFFFFF', fontFamily: fontFamilies.semiBold },
  dimChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.md,
  },
  dimChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.gray100,
  },
  dimChipActive: { backgroundColor: colors.rose },
  dimChipText: { fontFamily: fontFamilies.medium, fontSize: 11, color: colors.inkMuted },
  dimChipTextActive: { color: '#FFFFFF', fontFamily: fontFamilies.semiBold },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
  },
  insightText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    color: colors.ink,
    flex: 1,
  },

  // Bilan
  bilanHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bilanIconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.roseSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bilanMain: { flex: 1 },
  bilanTitle: { fontFamily: fontFamilies.semiBold, fontSize: 14, color: colors.ink },
  bilanHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkMuted,
    marginTop: 1,
  },
  bilanBtn: {
    backgroundColor: colors.rose,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  bilanBtnText: { fontFamily: fontFamilies.semiBold, fontSize: 14, color: '#FFFFFF' },

  // Journal
  journalWrap: { marginTop: spacing.sm },

  // Scan
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  scanIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanMain: { flex: 1 },
  scanTitle: { fontFamily: fontFamilies.semiBold, fontSize: 14, color: colors.ink },
  scanHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.inkMuted,
    marginTop: 1,
  },
  creditsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  creditsChipText: { fontFamily: fontFamilies.semiBold, fontSize: 10, color: colors.accent },
})

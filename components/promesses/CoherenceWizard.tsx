/**
 * CoherenceWizard — assistant 3 étapes (twin mobile du web CoherenceWizard).
 *
 *   1. Description  : coller le texte marketing du produit.
 *   2. Produit      : choisir une analyse INCI de l'historique (onglet
 *                     "Historique") ou coller une liste INCI ("Coller").
 *   3. Vérification : confirmer le produit choisi puis lancer.
 *
 * L'action "Lancer" :
 *   - branche "Coller une liste INCI" : runAnalysis() crée d'abord une analyse
 *     INCI réelle (ajoutée à l'historique), puis on enchaîne sur la cohérence.
 *   - cohérence : invoke('coherence-analyze', { analysis_id, description }).
 *     Si la fonction n'est pas déployée / échoue, on DÉGRADE proprement :
 *     message "Analyse de cohérence bientôt disponible" + on garde les saisies,
 *     jamais de crash.
 */

import { type FC, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { GlassCard } from '@/components/design/GlassCard'
import { Reveal } from '@/components/design/Reveal'
import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { supabase } from '@/lib/supabase/client'
import { runAnalysis } from '@/lib/analysis/analyser'
import { useAuth } from '@/hooks/useAuth'

export interface AnalysisOption {
  id: string
  title: string
  createdAt: string
  totalIngredients: number
  matchedIngredients: number
  counts: { vert: number; jaune: number; orange: number; rouge: number }
  top3: string[]
}

type Step = 'description' | 'pickProduct' | 'confirm' | 'running'
type PickMode = 'history' | 'paste'

const MIN_DESCRIPTION = 30
const MAX_DESCRIPTION = 6000
const MIN_INCI = 20
const MAX_INCI = 12000

const STEP_ORDER: Step[] = ['description', 'pickProduct', 'confirm']

const STEPS: { key: Exclude<Step, 'running'>; label: string }[] = [
  { key: 'description', label: 'Description' },
  { key: 'pickProduct', label: 'Produit' },
  { key: 'confirm', label: 'Vérification' },
]

export const CoherenceWizard: FC<{ options: AnalysisOption[] }> = ({ options }) => {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [step, setStep] = useState<Step>('description')
  const [maxStep, setMaxStep] = useState<Step>('description')
  const [description, setDescription] = useState('')
  const [pickMode, setPickMode] = useState<PickMode>(options.length === 0 ? 'paste' : 'history')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pastedOption, setPastedOption] = useState<AnalysisOption | null>(null)
  const [pasteName, setPasteName] = useState('')
  const [pasteInci, setPasteInci] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // État de dégradation : true quand l'Edge Function coherence-analyze
  // n'est pas (encore) disponible. On affiche un message rassurant.
  const [unavailable, setUnavailable] = useState(false)

  const selected =
    pastedOption && pastedOption.id === selectedId
      ? pastedOption
      : options.find((o) => o.id === selectedId) ?? null

  function advanceTo(target: Step) {
    setStep(target)
    if (STEP_ORDER.indexOf(target) > STEP_ORDER.indexOf(maxStep)) setMaxStep(target)
  }

  function jumpToStep(target: Exclude<Step, 'running'>) {
    if (STEP_ORDER.indexOf(target) > STEP_ORDER.indexOf(maxStep)) return
    setError(null)
    setStep(target)
  }

  function back() {
    setError(null)
    if (step === 'pickProduct') setStep('description')
    else if (step === 'confirm') setStep('pickProduct')
  }

  function next() {
    setError(null)
    if (step === 'description') {
      if (description.trim().length < MIN_DESCRIPTION) {
        setError(`Colle une description un peu plus complète (au moins ${MIN_DESCRIPTION} caractères).`)
        return
      }
      advanceTo('pickProduct')
      return
    }
    if (step === 'pickProduct') {
      if (pickMode === 'history') {
        if (!selected) {
          setError('Choisis le produit à comparer.')
          return
        }
        advanceTo('confirm')
        return
      }
      void runPasteAnalysis()
      return
    }
    if (step === 'confirm') void launch()
  }

  async function runPasteAnalysis() {
    if (!userId) {
      setError('Tu dois être connecté pour analyser une liste INCI.')
      return
    }
    const inci = pasteInci.trim()
    if (inci.length < MIN_INCI) {
      setError(`Colle une liste INCI complète (au moins ${MIN_INCI} caractères).`)
      return
    }
    if (inci.length > MAX_INCI) {
      setError(`Liste trop longue (max ${MAX_INCI} caractères).`)
      return
    }
    const label = pasteName.trim().slice(0, 200)
    setBusy(true)
    setError(null)
    try {
      const result = await runAnalysis({
        inciInput: inci,
        productName: label || undefined,
        source: 'manual',
        userId,
      })
      const items = result.response.items ?? []
      const top3 = items
        .slice()
        .sort((a, b) => a.position - b.position)
        .slice(0, 3)
        .map((it) => it.name ?? it.input)
      const countOf = (c: 'Vert' | 'Jaune' | 'Orange' | 'Rouge') =>
        items.filter((it) => it.colorRating === c).length
      const opt: AnalysisOption = {
        id: result.analysisId,
        title: label || `Analyse du ${new Date().toLocaleDateString('fr-FR')}`,
        createdAt: new Date().toISOString(),
        totalIngredients: result.response.counts?.total ?? items.length,
        matchedIngredients: result.response.counts?.matched ?? 0,
        counts: { vert: countOf('Vert'), jaune: countOf('Jaune'), orange: countOf('Orange'), rouge: countOf('Rouge') },
        top3,
      }
      setPastedOption(opt)
      setSelectedId(opt.id)
      advanceTo('confirm')
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur pendant l'analyse INCI.")
    } finally {
      setBusy(false)
    }
  }

  async function launch() {
    if (!selected) return
    setStep('running')
    setError(null)
    setUnavailable(false)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('coherence-analyze', {
        body: { analysis_id: selected.id, description: description.trim() },
      })
      if (fnError) {
        // Edge Function pas déployée / indisponible → dégradation gracieuse.
        setUnavailable(true)
        setStep('confirm')
        return
      }
      const newId = (data as { id?: string } | null)?.id
      if (!newId) {
        setUnavailable(true)
        setStep('confirm')
        return
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      router.replace(ROUTES.PROMESSES.DETAIL(newId))
    } catch {
      setUnavailable(true)
      setStep('confirm')
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Stepper step={step} maxStep={maxStep} onJump={jumpToStep} />

      {/* Reveal : chaque étape remonte au changement de step → l'entrée rejoue. */}
      {step === 'description' ? (
        <Reveal>
        <GlassCard style={styles.card} padding={spacing.lg}>
          <Text style={styles.stepTitle}>1. Colle la description du produit</Text>
          <Text style={styles.stepHelp}>
            Le texte marketing tel qu&apos;il apparaît sur l&apos;emballage ou la fiche produit en ligne.
          </Text>
          <TextInput
            value={description}
            onChangeText={(t) => setDescription(t.slice(0, MAX_DESCRIPTION))}
            multiline
            placeholder="Ex : Cette crème densifiante anti-chute booste la pousse, renforce l'ancrage du cheveu et hydrate intensément. Formule à base d'huile d'argan, panthénol et caféine. Naturel à 96 %."
            placeholderTextColor={colors.inkLight}
            selectionColor={colors.textSelection}
            style={[styles.input, styles.textArea]}
          />
          <View style={styles.counterRow}>
            <Text style={styles.counter}>{description.trim().length} caractères</Text>
            <Text style={styles.counter}>
              min {MIN_DESCRIPTION} · max {MAX_DESCRIPTION}
            </Text>
          </View>
        </GlassCard>
        </Reveal>
      ) : null}

      {step === 'pickProduct' ? (
        <Reveal>
        <GlassCard style={styles.card} padding={spacing.lg}>
          <Text style={styles.stepTitle}>2. Choisis le produit à comparer</Text>
          <Text style={styles.stepHelp}>
            Sélectionne une analyse INCI déjà sauvegardée, ou colle la liste INCI d&apos;un produit non
            analysé.
          </Text>

          <View style={styles.segment}>
            <Pressable
              onPress={() => {
                if (options.length === 0) return
                setError(null)
                setPickMode('history')
              }}
              disabled={options.length === 0}
              style={[styles.segmentBtn, pickMode === 'history' && styles.segmentBtnActive]}
            >
              <Text
                style={[
                  styles.segmentText,
                  pickMode === 'history' && styles.segmentTextActive,
                  options.length === 0 && styles.segmentTextDisabled,
                ]}
              >
                Depuis l&apos;historique
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setError(null)
                setPickMode('paste')
              }}
              style={[styles.segmentBtn, pickMode === 'paste' && styles.segmentBtnActive]}
            >
              <Text style={[styles.segmentText, pickMode === 'paste' && styles.segmentTextActive]}>
                Coller une liste INCI
              </Text>
            </Pressable>
          </View>

          {pickMode === 'history' ? (
            options.length === 0 ? (
              <Text style={styles.muted}>
                Tu n&apos;as encore aucune analyse INCI sauvegardée. Colle la liste INCI pour comparer.
              </Text>
            ) : (
              <View style={styles.optionList}>
                {options.map((o) => {
                  const isSel = selectedId === o.id
                  const date = new Date(o.createdAt).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                  return (
                    <Pressable
                      key={o.id}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {})
                        setPastedOption((prev) => (prev && prev.id === o.id ? prev : null))
                        setSelectedId(o.id)
                      }}
                      style={[styles.option, isSel && styles.optionSelected]}
                    >
                      <View style={styles.optionMain}>
                        <Text style={styles.optionTitle} numberOfLines={1}>
                          {o.title}
                        </Text>
                        <Text style={styles.optionMeta}>
                          {o.matchedIngredients} / {o.totalIngredients} ingrédients · {date}
                        </Text>
                      </View>
                      {isSel ? (
                        <View style={styles.check}>
                          <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                        </View>
                      ) : null}
                    </Pressable>
                  )
                })}
              </View>
            )
          ) : (
            <View style={styles.pasteWrap}>
              <Text style={styles.label}>
                Nom du produit <Text style={styles.optional}>(optionnel)</Text>
              </Text>
              <TextInput
                value={pasteName}
                onChangeText={(t) => setPasteName(t.slice(0, 200))}
                placeholder="Ex : Mon savon à froid lavande"
                placeholderTextColor={colors.inkLight}
                selectionColor={colors.textSelection}
                style={styles.input}
              />
              <Text style={[styles.label, styles.labelGap]}>Liste INCI</Text>
              <TextInput
                value={pasteInci}
                onChangeText={(t) => setPasteInci(t.slice(0, MAX_INCI))}
                multiline
                placeholder="Aqua, Sodium Olivate, Sodium Cocoate, Glycerin, Lavandula Angustifolia Oil…"
                placeholderTextColor={colors.inkLight}
                selectionColor={colors.textSelection}
                style={[styles.input, styles.textArea]}
              />
              <View style={styles.counterRow}>
                <Text style={styles.counter}>{pasteInci.trim().length} caractères</Text>
                <Text style={styles.counter}>
                  min {MIN_INCI} · max {MAX_INCI}
                </Text>
              </View>
              <View style={styles.notice}>
                <Text style={styles.noticeText}>
                  Cette liste sera analysée puis ajoutée à ton historique avant la cohérence.
                </Text>
              </View>
            </View>
          )}
        </GlassCard>
        </Reveal>
      ) : null}

      {step === 'confirm' && selected ? (
        <Reveal>
        <GlassCard style={styles.card} padding={spacing.lg}>
          <Text style={styles.stepTitle}>3. Vérifie le produit choisi</Text>
          <Text style={styles.stepHelp}>
            Si l&apos;analyse INCI sélectionnée ne correspond pas au produit dont tu as collé la
            description, le résultat sera incorrect.
          </Text>

          <View style={styles.confirmBox}>
            <Text style={styles.confirmKicker}>PRODUIT SÉLECTIONNÉ</Text>
            <Text style={styles.confirmTitle}>{selected.title}</Text>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmDt}>Ingrédients</Text>
              <Text style={styles.confirmDd}>
                {selected.matchedIngredients} reconnus sur {selected.totalIngredients}
              </Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmDt}>3 premiers</Text>
              <Text style={styles.confirmDd} numberOfLines={1}>
                {selected.top3.length > 0 ? selected.top3.join(', ') : '-'}
              </Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmDt}>Répartition</Text>
              <View style={styles.dots}>
                <Dot color={colors.spectrum.vert} n={selected.counts.vert} />
                <Dot color={colors.spectrum.jaune} n={selected.counts.jaune} />
                <Dot color={colors.spectrum.orange} n={selected.counts.orange} />
                <Dot color={colors.spectrum.rouge} n={selected.counts.rouge} />
              </View>
            </View>
          </View>

          {unavailable ? (
            <View style={styles.unavailable}>
              <Ionicons name="time-outline" size={18} color={colors.warning} />
              <Text style={styles.unavailableText}>
                Analyse de cohérence bientôt disponible. Tes saisies sont conservées — réessaie dans un
                instant.
              </Text>
            </View>
          ) : (
            <Text style={styles.confirmFoot}>
              C&apos;est bien ce produit ? Si oui, lance l&apos;analyse de cohérence.
            </Text>
          )}
        </GlassCard>
        </Reveal>
      ) : null}

      {step === 'running' ? (
        <Reveal>
        <GlassCard style={styles.card} padding={spacing['2xl']}>
          <View style={styles.runningWrap}>
            <ActivityIndicator size="large" color={colors.rose} />
            <Text style={styles.runningTitle}>Analyse en cours…</Text>
            <Text style={styles.runningSub}>
              On lit la description, on identifie les promesses, on vérifie la formule.
            </Text>
          </View>
        </GlassCard>
        </Reveal>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {step !== 'running' ? (
        <View style={styles.actions}>
          {step !== 'description' ? (
            <Pressable onPress={back} disabled={busy} style={[styles.backBtn, busy && styles.disabled]}>
              <Text style={styles.backText}>Retour</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={next} disabled={busy} style={[styles.nextBtn, busy && styles.disabled]}>
            {busy ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.nextText}>{step === 'confirm' ? "Lancer l'analyse" : 'Continuer'}</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  )
}

const Dot: FC<{ color: string; n: number }> = ({ color, n }) => (
  <View style={styles.dotItem}>
    <View style={[styles.dotSwatch, { backgroundColor: color }]} />
    <Text style={styles.dotNum}>{n}</Text>
  </View>
)

const Stepper: FC<{
  step: Step
  maxStep: Step
  onJump: (s: Exclude<Step, 'running'>) => void
}> = ({ step, maxStep, onJump }) => {
  const idx = STEPS.findIndex((s) => s.key === step)
  const maxIdx = STEPS.findIndex((s) => s.key === maxStep)
  return (
    <View style={styles.stepper}>
      {STEPS.map((s, i) => {
        const active = i === idx
        const reached = i <= maxIdx
        const clickable = reached && !active
        return (
          <View key={s.key} style={styles.stepperItem}>
            <Pressable
              onPress={() => clickable && onJump(s.key)}
              disabled={!clickable}
              style={styles.stepperCell}
            >
              <View
                style={[
                  styles.stepCircle,
                  active ? styles.stepCircleActive : reached ? styles.stepCircleReached : styles.stepCircleIdle,
                ]}
              >
                {reached && !active ? (
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                ) : (
                  <Text style={[styles.stepNum, active ? styles.stepNumActive : styles.stepNumIdle]}>
                    {i + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  active ? styles.stepLabelActive : reached ? styles.stepLabelReached : styles.stepLabelIdle,
                ]}
              >
                {s.label}
              </Text>
            </Pressable>
            {i < STEPS.length - 1 ? <View style={styles.stepConnector} /> : null}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing['3xl'], gap: spacing.base },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepperItem: { flexDirection: 'row', alignItems: 'center' },
  stepperCell: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stepCircle: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepCircleActive: { backgroundColor: colors.ink },
  stepCircleReached: { backgroundColor: colors.verdict.tenue.DEFAULT },
  stepCircleIdle: { backgroundColor: colors.gray100 },
  stepNum: { fontFamily: fontFamilies.semiBold, fontSize: 11 },
  stepNumActive: { color: '#FFFFFF' },
  stepNumIdle: { color: colors.inkMuted },
  stepLabel: { fontFamily: fontFamilies.medium, fontSize: 12 },
  stepLabelActive: { color: colors.ink },
  stepLabelReached: { color: colors.verdict.tenue.text },
  stepLabelIdle: { color: colors.inkLight },
  stepConnector: { width: 20, height: 1, backgroundColor: colors.border, marginHorizontal: spacing.sm },

  card: {},
  stepTitle: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink },
  stepHelp: { fontFamily: fontFamilies.regular, fontSize: 12, lineHeight: 17, color: colors.inkMuted, marginTop: 4, marginBottom: spacing.base },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: colors.ink,
  },
  textArea: { minHeight: 150, textAlignVertical: 'top' },
  counterRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  counter: { fontFamily: fontFamilies.regular, fontSize: 11, color: colors.inkLight },
  muted: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted },

  segment: { flexDirection: 'row', backgroundColor: colors.gray100, borderRadius: radius.full, padding: 4, marginBottom: spacing.base },
  segmentBtn: { flex: 1, borderRadius: radius.full, paddingVertical: 8, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: colors.surface },
  segmentText: { fontFamily: fontFamilies.semiBold, fontSize: 12, color: colors.inkMuted },
  segmentTextActive: { color: colors.ink },
  segmentTextDisabled: { color: colors.gray300 },

  optionList: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  optionSelected: { borderColor: colors.rose, backgroundColor: colors.roseSoft },
  optionMain: { flex: 1, minWidth: 0 },
  optionTitle: { fontFamily: fontFamilies.semiBold, fontSize: 14, color: colors.ink },
  optionMeta: { fontFamily: fontFamilies.regular, fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  check: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.rose, alignItems: 'center', justifyContent: 'center' },

  pasteWrap: { gap: spacing.sm },
  label: { fontFamily: fontFamilies.medium, fontSize: 12, color: colors.inkMuted },
  labelGap: { marginTop: spacing.sm },
  optional: { color: colors.inkLight },
  notice: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FDE68A', borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.xs },
  noticeText: { fontFamily: fontFamilies.regular, fontSize: 11, lineHeight: 16, color: '#92400E' },

  confirmBox: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.base },
  confirmKicker: { fontFamily: fontFamilies.medium, fontSize: 10, letterSpacing: 0.8, color: colors.inkMuted, marginBottom: 4 },
  confirmTitle: { fontFamily: fontFamilies.bold, fontSize: 16, color: colors.ink, marginBottom: spacing.md },
  confirmRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.sm },
  confirmDt: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted, flexShrink: 0 },
  confirmDd: { flex: 1, textAlign: 'right', fontFamily: fontFamilies.medium, fontSize: 13, color: colors.ink },
  dots: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dotItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dotSwatch: { width: 8, height: 8, borderRadius: 4 },
  dotNum: { fontFamily: fontFamilies.medium, fontSize: 13, color: colors.ink },
  confirmFoot: { fontFamily: fontFamilies.regular, fontSize: 12, color: colors.inkMuted, marginTop: spacing.base },
  unavailable: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.base,
  },
  unavailableText: { flex: 1, fontFamily: fontFamilies.medium, fontSize: 12, lineHeight: 17, color: '#92400E' },

  runningWrap: { alignItems: 'center', gap: spacing.sm },
  runningTitle: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink, marginTop: spacing.sm },
  runningSub: { fontFamily: fontFamilies.regular, fontSize: 12, lineHeight: 17, color: colors.inkMuted, textAlign: 'center' },

  error: { ...typography.xs, color: colors.roseDeep, backgroundColor: colors.roseSoft, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },

  actions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  backBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: spacing.xl, paddingVertical: 12, backgroundColor: colors.surface },
  backText: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: colors.ink },
  nextBtn: { flex: 1, backgroundColor: colors.ink, borderRadius: radius.full, paddingVertical: 14, alignItems: 'center' },
  nextText: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: '#FFFFFF' },
  disabled: { opacity: 0.6 },
})

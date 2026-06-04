/**
 * PromesseFlowModal — flux automatisé "Analyser la promesse" depuis une analyse
 * INCI existante. Port mobile du web `PromesseFlowModal.tsx`.
 *
 * Pipeline :
 *   1. **identifying**       — invoke `promesse-identify` avec l'INCI + nom
 *                              produit. L'Edge Function utilise un LLM pour
 *                              trouver des candidats produits sur internet.
 *   2. **pickCandidate**     — montre la liste des candidats trouvés
 *                              (nom, marque, source URL, confidence). User
 *                              choisit lequel correspond à son produit.
 *   3. **fetchingDescription**— invoke `promesse-fetch-description` qui scrape
 *                              la page e-commerce et extrait la description
 *                              marketing (claims).
 *   4. **runningCoherence**  — invoke `coherence-analyze` avec analysisId +
 *                              description → génère le verdict de cohérence.
 *   5. **redirecting**       — navigue vers /promesses/[id].
 *
 * Fallbacks :
 *   - Si identify renvoie `notFound` → bascule sur **manualPromise** (textarea
 *     pour saisir la promesse soi-même).
 *   - Si fetch-description renvoie `notFound` → bascule sur manualPromise.
 *   - Erreurs réseau / 5xx → écran **error** avec bouton "Réessayer" + fallback
 *     vers le wizard manuel `/promesses/nouvelle`.
 */

import { type FC, useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { supabase } from '@/lib/supabase/client'
import { ThinkingPhrases } from '@/components/shared/ThinkingPhrases'

const MIN_MANUAL_DESC = 30
const MAX_MANUAL_DESC = 4000

/** Phrases « thinking » affichées pendant l'analyse de cohérence. */
const COHERENCE_PHRASES = [
  'On confronte chaque promesse à la formule…',
  'On cherche les actifs qui tiennent la promesse…',
  'On démêle le marketing de la réalité…',
  'On vérifie ce que la composition permet vraiment…',
  'On traque les promesses non tenues…',
  'On pèse chaque ingrédient face aux allégations…',
]

/** Phrases pendant la recherche du produit sur internet. */
const IDENTIFY_PHRASES = [
  'On parcourt le web à la recherche du produit…',
  'On recoupe la marque et la composition…',
  'On compare les fiches produit…',
  'On vérifie les sources officielles…',
]

/** Phrases pendant la récupération de la description marketing. */
const FETCH_PHRASES = [
  'On lit la fiche produit…',
  'On extrait les promesses marketing…',
  'On isole les bénéfices revendiqués…',
  'On nettoie le texte de la marque…',
]

type Step =
  | 'identifying'
  | 'pickCandidate'
  | 'fetchingDescription'
  | 'manualPromise'
  | 'runningCoherence'
  | 'redirecting'
  | 'error'

interface Candidate {
  name: string
  brand: string | null
  productType: string | null
  sourceUrl: string
  confidence?: number
}

interface Props {
  visible: boolean
  onClose: () => void
  inci: string
  productLabel: string | null
  brand: string | null
  productType: string | null
  analysisId: string | null
}

export const PromesseFlowModal: FC<Props> = ({
  visible,
  onClose,
  inci,
  productLabel,
  brand,
  productType,
  analysisId,
}) => {
  const router = useRouter()
  const [step, setStep] = useState<Step>('identifying')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [manualDescription, setManualDescription] = useState('')
  const [notFoundReason, setNotFoundReason] = useState<string | null>(null)

  // ── 3. Lancement coherence-analyze ────────────────────────────────────
  const runCoherence = useCallback(
    async (description: string) => {
      const desc = description.slice(0, MAX_MANUAL_DESC).trim()
      // Sans analysisId on ne peut pas lier la cohérence → bascule wizard
      if (!analysisId) {
        onClose()
        router.push({
          pathname: ROUTES.PROMESSES.NOUVELLE,
          params: { description: desc },
        })
        return
      }
      setStep('runningCoherence')
      setErrorMsg(null)
      try {
        const { data, error } = await supabase.functions.invoke('coherence-analyze', {
          body: { analysis_id: analysisId, description: desc },
        })
        if (error) {
          setErrorMsg("Échec de l'analyse de cohérence.")
          setStep('error')
          return
        }
        const res = data as { id?: string } | null
        if (!res?.id) {
          setErrorMsg('Réponse serveur invalide.')
          setStep('error')
          return
        }
        setStep('redirecting')
        onClose()
        router.push(ROUTES.PROMESSES.DETAIL(res.id))
      } catch {
        setErrorMsg('Connexion impossible.')
        setStep('error')
      }
    },
    [analysisId, onClose, router],
  )

  // ── 1. Identification automatique au montage ─────────────────────────
  const identify = useCallback(async () => {
    setStep('identifying')
    setErrorMsg(null)
    try {
      const { data, error } = await supabase.functions.invoke('promesse-identify', {
        body: { inci, productLabel, brand, productType },
      })
      if (error) {
        setErrorMsg('Identification impossible. Réessaie ou saisis la promesse manuellement.')
        setStep('error')
        return
      }
      const res = data as
        | { notFound?: boolean; candidates?: Candidate[]; reason?: string }
        | null
      if (res?.notFound) {
        setNotFoundReason(res.reason ?? null)
        setStep('manualPromise')
        return
      }
      const list = res?.candidates ?? []
      if (list.length === 0) {
        setStep('manualPromise')
        return
      }
      setCandidates(list)
      setStep('pickCandidate')
    } catch {
      setErrorMsg('Connexion impossible.')
      setStep('error')
    }
  }, [inci, productLabel, brand, productType])

  // Réinitialise et identifie à chaque ouverture
  useEffect(() => {
    if (!visible) return
    setCandidates([])
    setErrorMsg(null)
    setManualDescription('')
    setNotFoundReason(null)
    void identify()
  }, [visible, identify])

  // ── 2. Choix d'un candidat → fetch description → coherence ────────────
  const pickCandidate = useCallback(
    async (c: Candidate) => {
      setStep('fetchingDescription')
      setErrorMsg(null)
      try {
        const { data, error } = await supabase.functions.invoke(
          'promesse-fetch-description',
          {
            body: {
              sourceUrl: c.sourceUrl,
              candidateName: c.name,
              brand: c.brand,
              productType: c.productType,
              analysisId,
            },
          },
        )
        if (error) {
          setErrorMsg(
            'Impossible de récupérer la description du produit. Tu peux la saisir manuellement.',
          )
          setStep('error')
          return
        }
        const res = data as
          | { notFound?: boolean; description?: string; reason?: string }
          | null
        if (res?.notFound || !res?.description) {
          setNotFoundReason(res?.reason ?? null)
          setStep('manualPromise')
          return
        }
        await runCoherence(res.description)
      } catch {
        setErrorMsg('Connexion impossible pendant la récupération.')
        setStep('error')
      }
    },
    [analysisId, runCoherence],
  )

  const submitManual = useCallback(() => {
    const desc = manualDescription.trim()
    if (desc.length < MIN_MANUAL_DESC) {
      setErrorMsg(
        `Décris la promesse en au moins ${MIN_MANUAL_DESC} caractères.`,
      )
      return
    }
    setErrorMsg(null)
    void runCoherence(desc)
  }, [manualDescription, runCoherence])

  // ── Rendus par étape ──────────────────────────────────────────────────

  const renderIdentifying = () => (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.loadingTitle}>Recherche du produit…</Text>
      <Text style={styles.loadingHint}>
        On cherche {productLabel ?? 'ce produit'} sur internet pour récupérer la
        description marketing.
      </Text>
      <ThinkingPhrases phrases={IDENTIFY_PHRASES} />
    </View>
  )

  const renderPickCandidate = () => (
    <ScrollView
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.h2}>On a trouvé ces produits</Text>
      <Text style={styles.subtitle}>
        Sélectionne celui qui correspond à ton produit. On va ensuite récupérer
        sa promesse marketing pour la comparer à la composition.
      </Text>
      <View style={styles.candidates}>
        {candidates.map((c, i) => {
          const conf = c.confidence != null ? Math.round(c.confidence * 100) : null
          return (
            <Pressable
              key={`${c.sourceUrl}-${i}`}
              style={styles.candidateRow}
              onPress={() => void pickCandidate(c)}
            >
              <View style={styles.candidateMain}>
                {c.brand ? (
                  <Text style={styles.candidateBrand}>{c.brand}</Text>
                ) : null}
                <Text style={styles.candidateName} numberOfLines={2}>
                  {c.name}
                </Text>
                <View style={styles.candidateMeta}>
                  <Ionicons name="globe-outline" size={11} color={colors.inkLight} />
                  <Text style={styles.candidateUrl} numberOfLines={1}>
                    {hostnameOf(c.sourceUrl)}
                  </Text>
                  {conf !== null ? (
                    <Text style={styles.candidateConf}>· {conf}% confiance</Text>
                  ) : null}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkLight} />
            </Pressable>
          )
        })}
      </View>
      <Pressable
        style={styles.linkBtn}
        onPress={() => setStep('manualPromise')}
      >
        <Text style={styles.linkText}>Aucun ne correspond — saisir la promesse</Text>
      </Pressable>
    </ScrollView>
  )

  const renderFetching = () => (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.loadingTitle}>Récupération de la description…</Text>
      <Text style={styles.loadingHint}>
        On lit la page produit pour extraire les promesses marketing.
      </Text>
      <ThinkingPhrases phrases={FETCH_PHRASES} />
    </View>
  )

  const renderRunning = () => (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.loadingTitle}>Analyse de cohérence…</Text>
      <Text style={styles.loadingHint}>
        On compare chaque promesse à la composition INCI réelle du produit.
      </Text>
      <ThinkingPhrases phrases={COHERENCE_PHRASES} />
    </View>
  )

  const renderManual = () => {
    const len = manualDescription.length
    return (
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.h2}>Saisis la promesse marketing</Text>
        {notFoundReason ? (
          <View style={styles.warnBox}>
            <Ionicons name="information-circle-outline" size={14} color={colors.warning} />
            <Text style={styles.warnText}>
              {notFoundReason}. Tu peux coller toi-même la description du produit.
            </Text>
          </View>
        ) : (
          <Text style={styles.subtitle}>
            Colle le texte marketing qui apparaît sur l’emballage ou la fiche
            produit en ligne (min. {MIN_MANUAL_DESC} caractères).
          </Text>
        )}
        <View style={styles.textareaWrap}>
          <TextInput
            style={styles.textarea}
            value={manualDescription}
            onChangeText={(t) => setManualDescription(t.slice(0, MAX_MANUAL_DESC))}
            placeholder={
              'Ex : Cette crème densifiante anti-chute booste la pousse, renforce l’ancrage du cheveu et hydrate intensément. Formule à base d’huile d’argan, panthénol et caféine.'
            }
            placeholderTextColor={colors.inkLight}
            selectionColor={colors.textSelection}
            multiline
            textAlignVertical="top"
            autoCapitalize="sentences"
          />
        </View>
        <View style={styles.counterRow}>
          <Text style={[styles.counter, len < MIN_MANUAL_DESC && styles.counterWarn]}>
            {len} caractères
          </Text>
          <Text style={styles.counter}>
            min {MIN_MANUAL_DESC} · max {MAX_MANUAL_DESC}
          </Text>
        </View>
        {errorMsg ? <Text style={styles.errorInline}>{errorMsg}</Text> : null}
        <Pressable
          style={[
            styles.cta,
            (len < MIN_MANUAL_DESC || step === 'runningCoherence') && styles.ctaDisabled,
          ]}
          disabled={len < MIN_MANUAL_DESC || step === 'runningCoherence'}
          onPress={submitManual}
        >
          <Ionicons name="sparkles" size={16} color="#FFFFFF" />
          <Text style={styles.ctaText}>Analyser la promesse</Text>
        </Pressable>
      </ScrollView>
    )
  }

  const renderError = () => (
    <View style={styles.centered}>
      <Ionicons name="alert-circle-outline" size={44} color={colors.warning} />
      <Text style={styles.loadingTitle}>Oups</Text>
      <Text style={styles.loadingHint}>{errorMsg ?? 'Une erreur est survenue.'}</Text>
      <Pressable style={styles.cta} onPress={() => void identify()}>
        <Text style={styles.ctaText}>Réessayer</Text>
      </Pressable>
      <Pressable
        style={styles.linkBtn}
        onPress={() => {
          onClose()
          router.push(ROUTES.PROMESSES.NOUVELLE)
        }}
      >
        <Text style={styles.linkText}>Saisir la promesse manuellement</Text>
      </Pressable>
    </View>
  )

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
          >
            <Ionicons name="close" size={20} color={colors.ink} />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            Analyser la promesse
          </Text>
          <View style={styles.closeBtn} />
        </View>
        <View style={styles.body}>
          {step === 'identifying' && renderIdentifying()}
          {step === 'pickCandidate' && renderPickCandidate()}
          {step === 'fetchingDescription' && renderFetching()}
          {step === 'manualPromise' && renderManual()}
          {step === 'runningCoherence' && renderRunning()}
          {step === 'redirecting' && renderRunning()}
          {step === 'error' && renderError()}
        </View>
      </SafeAreaView>
    </Modal>
  )
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fontFamilies.semiBold, fontSize: 16, color: colors.ink },
  body: { flex: 1, paddingHorizontal: spacing.lg },
  scroll: { paddingVertical: spacing.lg, paddingBottom: spacing.xl },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  loadingTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    color: colors.ink,
    marginTop: spacing.md,
  },
  loadingHint: {
    ...typography.small,
    color: colors.inkMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  h2: { ...typography.h4, color: colors.ink, marginBottom: spacing.sm },
  subtitle: {
    ...typography.small,
    color: colors.inkMuted,
    marginBottom: spacing.lg,
    lineHeight: 21,
  },
  candidates: { gap: spacing.sm, marginBottom: spacing.lg },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  candidateMain: { flex: 1, minWidth: 0 },
  candidateBrand: {
    ...typography.caption,
    color: colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  candidateName: { ...typography.smallSemiBold, color: colors.ink },
  candidateMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  candidateUrl: { ...typography.caption, color: colors.inkLight, flexShrink: 1 },
  candidateConf: { ...typography.caption, color: colors.inkLight },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.rose,
    borderRadius: radius.full,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { ...typography.button, color: '#FFFFFF' },
  linkBtn: { paddingVertical: spacing.md, alignItems: 'center' },
  linkText: { ...typography.smallSemiBold, color: colors.rose },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: colors.warningSoft,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  warnText: { ...typography.xs, color: colors.ink, flex: 1, lineHeight: 18 },
  textareaWrap: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  textarea: {
    ...typography.small,
    color: colors.ink,
    minHeight: 160,
    maxHeight: 280,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    lineHeight: 22,
  },
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  counter: { ...typography.caption, color: colors.inkLight },
  counterWarn: { color: colors.warning },
  errorInline: {
    ...typography.xs,
    color: colors.roseDeep,
    marginBottom: spacing.sm,
  },
})

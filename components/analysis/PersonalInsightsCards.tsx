/**
 * PersonalInsightsCards — 3 encarts PERSONNALISÉS (objectifs / peau / à
 * surveiller) générés par l'Edge Function `personal-insights` selon le profil.
 *
 * Comportement (validé produit) :
 *   - Si les blocs sont déjà persistés (initialBlocks) → affichage instantané.
 *   - Sinon : appel lazy. Pendant le chargement → skeleton « shimmer ».
 *   - 0 crédit (429) → blocs VERROUILLÉS (flou + cadenas) → tap = page /offre.
 *     Aucun appel IA n'a été fait, aucun crédit consommé.
 *   - Le débit (1 crédit) a lieu côté Edge À LA GÉNÉRATION ; relecture gratuite.
 */

import { type FC, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { useRouter } from 'expo-router'

import { WhiteCard } from '@/components/design/WhiteCard'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { supabase } from '@/lib/supabase/client'

type Tone = 'vert' | 'ambre' | 'rouge' | 'neutre'
type Block = { title: string; description: string; tone: Tone }
export type PersonalBlocks = { goals: Block; skin: Block; watch: Block }

// Version de prompt courante des blocs perso. DOIT rester synchro avec
// `PERSONAL_PROMPT_VERSION` de supabase/functions/personal-insights/lib.ts.
// Sert à détecter des blocs persistés PÉRIMÉS (générés sous un ancien prompt)
// et à déclencher un rafraîchissement silencieux (gratuit, déjà payé).
export const PERSONAL_BLOCKS_VERSION = 10

// Ton → couleurs pastel (halo + texte). Icône FIXE par bloc (clé).
const TONE_VISUAL: Record<Tone, { bg: string; text: string }> = {
  vert: { bg: colors.rating.vert.bg, text: colors.rating.vert.text },
  ambre: { bg: colors.rating.jaune.bg, text: colors.rating.jaune.text },
  rouge: { bg: colors.rating.rouge.bg, text: colors.rating.rouge.text },
  neutre: { bg: colors.gray100, text: colors.inkMuted },
}

// Icônes illustrées line-art (assets), teintées par le ton du bloc (tintColor)
// pour conserver le système de couleurs. Potion = objectifs, silhouette = peau,
// silhouette + loupe = à surveiller.
const BLOCK_ORDER: { key: keyof PersonalBlocks; icon: ImageSourcePropType }[] = [
  { key: 'goals', icon: require('@/assets/icons/analyse/potion.png') },
  { key: 'skin', icon: require('@/assets/icons/analyse/body.png') },
  { key: 'watch', icon: require('@/assets/icons/analyse/bodyloop.png') },
]

type State =
  | { status: 'loading' }
  | { status: 'ready'; blocks: PersonalBlocks }
  | { status: 'locked' }
  | { status: 'error' }

interface Props {
  analysisId?: string
  /** Blocs déjà persistés sur l'analyse (affichage instantané, pas d'appel). */
  initialBlocks?: PersonalBlocks | null
  /** Clé persistée (`v{N}:prof:res`) — sert à détecter une version périmée. */
  initialBlocksKey?: string | null
}

export const PersonalInsightsCards: FC<Props> = ({ analysisId, initialBlocks, initialBlocksKey }) => {
  const router = useRouter()
  const [state, setState] = useState<State>(
    initialBlocks ? { status: 'ready', blocks: initialBlocks } : { status: 'loading' },
  )
  const fetchedRef = useRef(false)

  // Blocs persistés mais générés sous un ANCIEN prompt → on les rafraîchit en
  // tâche de fond (gratuit côté Edge car déjà payés), sans flouter l'affichage.
  const stale =
    Boolean(initialBlocks) &&
    (!initialBlocksKey || !initialBlocksKey.startsWith(`v${PERSONAL_BLOCKS_VERSION}:`))

  // `background` = rafraîchissement silencieux : on n'affiche ni skeleton ni
  // verrou ni erreur ; on garde les blocs existants et on swappe si succès.
  const run = (background = false) => {
    if (!analysisId) {
      if (!background) setState({ status: 'error' })
      return
    }
    if (!background) setState({ status: 'loading' })
    void (async () => {
      try {
        const { data, error, response } = await supabase.functions.invoke('personal-insights', {
          body: { analysisId },
        })
        if (error) {
          if (background) return
          const res: Response | undefined =
            response ?? ((error as { context?: Response }).context as Response | undefined)
          if (res?.status === 429) {
            setState({ status: 'locked' })
            return
          }
          setState({ status: 'error' })
          return
        }
        const res = data as { blocks?: PersonalBlocks } | null
        if (res?.blocks?.goals && res.blocks.skin && res.blocks.watch) {
          setState({ status: 'ready', blocks: res.blocks })
        } else if (!background) {
          setState({ status: 'error' })
        }
      } catch {
        if (!background) setState({ status: 'error' })
      }
    })()
  }

  useEffect(() => {
    if (fetchedRef.current) return
    if (!initialBlocks) {
      fetchedRef.current = true
      run()
      return
    }
    if (stale) {
      fetchedRef.current = true
      run(true) // refresh silencieux (gratuit)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId])

  if (state.status === 'loading') {
    return (
      <View style={styles.list}>
        {BLOCK_ORDER.map((b) => (
          <WhiteCard key={b.key} padding={spacing.md}>
            <View style={styles.row}>
              <View style={[styles.skeletonIcon]} />
              <View style={styles.body}>
                <View style={[styles.skelLine, { width: '55%' }]} />
                <View style={[styles.skelLine, { width: '90%', marginTop: 8 }]} />
              </View>
            </View>
          </WhiteCard>
        ))}
        <View style={styles.loadingHint}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.loadingText}>Personnalisation selon ton profil…</Text>
        </View>
      </View>
    )
  }

  if (state.status === 'locked') {
    return (
      <Pressable
        onPress={() => router.push(ROUTES.OFFRE.INDEX)}
        accessibilityRole="button"
        accessibilityLabel="Débloquer l'analyse personnalisée avec Premium"
        style={styles.lockedWrap}
      >
        {/* Teaser : les 3 blocs apparents mais grisés (aucune donnée générée) */}
        <View style={styles.list} pointerEvents="none">
          {BLOCK_ORDER.map((b, i) => (
            <WhiteCard key={b.key} padding={spacing.md}>
              <View style={styles.row}>
                <View style={styles.haloWrap}>
                  <View style={[styles.haloRing, { backgroundColor: colors.gray100 }]} />
                  <View style={[styles.haloInner, { backgroundColor: colors.gray100 }]}>
                    <Image
                      source={b.icon}
                      style={[styles.blockIcon, { tintColor: colors.inkLight }]}
                      resizeMode="contain"
                    />
                  </View>
                </View>
                <View style={styles.body}>
                  <View style={[styles.skelLine, { width: (['58%', '46%', '62%'] as const)[i] }]} />
                  <View style={[styles.skelLine, { width: '92%', marginTop: 8 }]} />
                </View>
              </View>
            </WhiteCard>
          ))}
        </View>

        {/* Cadre flou + scrim qui encapsule les 3 blocs */}
        <BlurView intensity={16} tint="light" style={styles.lockBlur} pointerEvents="none" />
        <View style={styles.lockScrim} pointerEvents="none" />

        {/* Cadenas + CTA centrés */}
        <View style={styles.lockOverlay} pointerEvents="none">
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={22} color={colors.accent} />
          </View>
          <Text style={styles.lockTitle}>Analyse personnalisée</Text>
          <Text style={styles.lockSub}>Découvre si ce produit te correspond vraiment.</Text>
          <View style={styles.lockedCta}>
            <Ionicons name="sparkles" size={14} color={colors.surface} />
            <Text style={styles.lockedCtaText}>Débloquer avec Premium</Text>
          </View>
        </View>
      </Pressable>
    )
  }

  if (state.status === 'error') {
    return (
      <WhiteCard padding={spacing.md}>
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>Analyse personnalisée indisponible.</Text>
          <Pressable onPress={() => run()} hitSlop={8}>
            <Text style={styles.retry}>Réessayer</Text>
          </Pressable>
        </View>
      </WhiteCard>
    )
  }

  // ready
  return (
    <View style={styles.list}>
      {BLOCK_ORDER.map(({ key, icon }) => {
        const block = state.blocks[key]
        const v = TONE_VISUAL[block.tone] ?? TONE_VISUAL.neutre
        return (
          <WhiteCard key={key} padding={spacing.md}>
            <View style={styles.row}>
              <View style={styles.haloWrap}>
                <View style={[styles.haloRing, { backgroundColor: v.bg }]} />
                <View style={[styles.haloInner, { backgroundColor: v.bg }]}>
                  <Image
                    source={icon}
                    style={[styles.blockIcon, { tintColor: v.text }]}
                    resizeMode="contain"
                  />
                </View>
              </View>
              <View style={styles.body}>
                <Text style={styles.title}>{block.title}</Text>
                {block.description ? (
                  <Text style={styles.desc}>{block.description}</Text>
                ) : null}
              </View>
            </View>
          </WhiteCard>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  // gap icône↔texte réduit (~37% vs base) + padding carte resserré (cf. cardPad)
  // pour pousser l'icône et le texte vers la gauche.
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  haloWrap: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  haloRing: { position: 'absolute', width: 46, height: 46, borderRadius: 23, opacity: 0.4 },
  haloInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  blockIcon: { width: 30, height: 30 },
  body: { flex: 1, minWidth: 0 },
  title: { fontFamily: fontFamilies.bold, fontSize: 16, color: colors.ink, letterSpacing: -0.2 },
  desc: { fontFamily: fontFamilies.regular, fontSize: 13, lineHeight: 19, color: colors.inkMuted, marginTop: 3 },

  // Skeleton
  skeletonIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.gray100 },
  skelLine: { height: 12, borderRadius: 6, backgroundColor: colors.gray100 },
  loadingHint: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center', paddingTop: spacing.xs },
  loadingText: { fontFamily: fontFamilies.medium, fontSize: 12, color: colors.inkMuted },

  // Locked (3 blocs teaser + cadre flou + cadenas + CTA)
  lockedWrap: { position: 'relative' },
  lockBlur: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  lockScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderRadius: radius.lg,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  lockBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  lockTitle: { fontFamily: fontFamilies.bold, fontSize: 16, color: colors.ink, textAlign: 'center' },
  lockSub: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: 2,
  },
  lockedCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    marginTop: spacing.base,
  },
  lockedCtaText: { fontFamily: fontFamilies.semiBold, fontSize: 14, color: colors.surface },

  // Error
  errorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  errorText: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted, flex: 1 },
  retry: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: colors.accent },
})

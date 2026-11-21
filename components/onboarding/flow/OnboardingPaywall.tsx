/**
 * OnboardingPaywall (A21) : LE paywall de l'app. Né pour la fin d'onboarding
 * « Le diagnostic de Perle » ; depuis le 28/09/2026 c'est aussi lui que rend
 * /offre partout (pastille crédits, crédits épuisés, profil, menu).
 *
 * Personnalisé avec le profil qui vient d'être écrit (prénom, peau, soucis,
 * ingrédients évités) et bâti sur la même logique d'achat que /offre
 * (`usePaywallCheckout`). Règles tenues :
 *   - « Plus tard » visible dès l'arrivée (Apple 3.1.1, paywall passable) ;
 *   - prix, durée, renouvellement et liens légaux lisibles avant l'achat
 *     (Apple 3.1.2). Formules, bouton et liens sont FIXÉS en bas (visibles sans
 *     défiler) ; le texte complet de renouvellement clôt la zone qui défile ;
 *   - aucun prix barré : l'économie se lit en pourcentage ;
 *   - aucun essai gratuit : on achète directement (essai retiré des magasins le
 *     31/10/2026, et de l'écran le 10/11/2026 : ni badge, ni frise, ni bouton) ;
 *   - formules sur le modèle validé par Brian le 10/11/2026 : l'annuel en haut,
 *     présélectionné, badge « Économise XX % », prix ramené à la journée à
 *     droite, montant facturé par an en clair (le montant prélevé reste le
 *     plus lisible, Apple 3.1.2) ; le mensuel dessous, « Sans engagement ».
 *     Pourcentage et prix calculés sur les packages RevenueCat, jamais écrits ;
 *   - le tableau Gratuit / Premium (28/09/2026, sur le modèle de MemoryPilot)
 *     ne met AUCUNE croix mensongère : aucune fonction n'est réservée à
 *     Premium, la différence est le nombre de crédits IA. Les chiffres sont
 *     lus en direct dans `credit_tiers` (`useCreditTiers`), et une note dit
 *     que les crédits sont partagés entre les fonctions.
 */

import { useState, type FC } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import Animated from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { useProfile } from '@/hooks/useProfile'
import { STORE_NAME, type usePaywallCheckout } from '@/hooks/usePaywallCheckout'
import { type ProfileGoal, type SkinConcern, type SkinTypeFace } from '@/lib/skin/profile'
import { CATALOG_SIZE_LABEL, RESTRICTION_OPTIONS, withoutLabel } from '@/lib/onboarding/content'
import { buildPaywallPromise } from '@/lib/onboarding/paywallPromise'
import { periodLabel, useCreditTiers } from '@/hooks/useCreditTiers'
import { Image } from 'expo-image'
import { LegalModal, type LegalDoc } from '@/components/legal/LegalModal'
import { PressableScale, StaggerItem } from '@/components/design/motion'

const LAUREL_L = require('../../../assets/images/onboarding/laurel-left.webp')
const LAUREL_R = require('../../../assets/images/onboarding/laurel-right.webp')
const PERLE = require('../../../assets/images/onboarding/perle.webp')
import { FLOW_MAX_WIDTH, PrimaryButton } from '@/components/onboarding/flow/ui'
import { fadeUp } from '@/components/onboarding/flow/motion'

/** Fond crème réservé à l'offre Premium (règle du design system). */
export const PREMIUM_CREAM = '#FDF6EC'
/**
 * En-tête sombre (03/11/2026) : nuit prune qui démarque la promesse du
 * tableau et des formules, restés sur crème. Pas de violet (`accent` fait « IA »).
 */
export const PAYWALL_NIGHT = '#1A1219'
const NIGHT_GRADIENT = ['#120D12', '#2A1520'] as const
/** Rose éclairci : `rose` pur manque de contraste sur la nuit. */
const ROSE_ON_NIGHT = '#FB7185'
const PRIX_INCONNU = '…'
/** Espace insécable : « 50 % » ne se coupe jamais. */
const NBSP = String.fromCharCode(0xa0)

type Cell = { kind: 'check' } | { kind: 'infinite' } | { kind: 'text'; value: string }

interface Row {
  label: string
  free: Cell
  premium: Cell
  strong?: boolean
}

const CHECK: Cell = { kind: 'check' }
const txt = (value: string): Cell => ({ kind: 'text', value })

/** Lignes du tableau, construites sur les VRAIS quotas de crédits. */
function buildRows(
  tiers: ReturnType<typeof useCreditTiers>['data'],
): { rows: Row[]; note: string | null } {
  const free = tiers?.free
  const prem = tiers?.premium
  const routine: Row = { label: 'Routine, historique et fiches ingrédients', free: CHECK, premium: CHECK }
  if (!free || !prem) {
    return {
      rows: [
        routine,
        { label: 'Fonctions IA personnalisées', free: txt('Limitées'), premium: txt('Étendues'), strong: true },
      ],
      note: null,
    }
  }
  const same = free.period === prem.period
  const per = same ? periodLabel(free.period) : ''
  // « Scan personnalisé » = l'analyse « pour toi » d'un produit (3 blocs IA),
  // 1 crédit IA. Le scan simple reste gratuit et illimité (voir analyser) : on
  // n'affiche donc pas de limite sur « scanner », seulement sur la version
  // personnalisée, qui consomme réellement des crédits.
  const rows: Row[] = [
    {
      label: 'Scan personnalisé',
      free: txt(same ? `${free.amount}` : `${free.amount} ${periodLabel(free.period)}`),
      premium: txt(same ? `${prem.amount}` : `${prem.amount} ${periodLabel(prem.period)}`),
    },
    routine,
  ]
  rows.push({
    label: `Crédits IA${per ? ` ${per}` : ''}`,
    free: txt(same ? `${free.amount}` : `${free.amount} ${periodLabel(free.period)}`),
    premium: txt(same ? `${prem.amount}` : `${prem.amount} ${periodLabel(prem.period)}`),
    strong: true,
  })
  if (!same) return { rows, note: null }
  rows.push(
    { label: 'Questions au Beauty Advisor', free: txt(`${free.amount}`), premium: txt(`${prem.amount}`) },
    {
      label: 'Couverture de tes objectifs',
      free: txt(`${Math.floor(free.amount / 3)}`),
      premium: txt(`${Math.floor(prem.amount / 3)}`),
    },
  )
  return {
    rows,
    note: `Chiffres ${per}. Les crédits IA sont partagés entre ces fonctions : 1 par scan personnalisé ou question, 3 pour la couverture des objectifs.`,
  }
}

const CellView: FC<{ cell: Cell; premium: boolean; strong?: boolean }> = ({ cell, premium, strong }) => {
  if (cell.kind === 'check') {
    return <Ionicons name="checkmark" size={20} color={premium ? colors.success : colors.inkMuted} />
  }
  if (cell.kind === 'infinite') {
    return <Text style={[styles.cellInf, { color: premium ? colors.success : colors.inkMuted }]}>∞</Text>
  }
  return (
    <Text style={[styles.cellText, premium && styles.cellTextPremium, strong && premium && styles.cellTextStrong]}>
      {cell.value}
    </Text>
  )
}

const COL_W = 92

const ComparisonTable: FC<{ rows: Row[] }> = ({ rows }) => (
  <View style={styles.table}>
    <View style={styles.freeCol} pointerEvents="none" />
    <View style={styles.premiumCol} pointerEvents="none" />
    <View style={[styles.tRow, styles.tHead]}>
      <View style={styles.tLabelCell} />
      <View style={styles.tCell}>
        <Text style={styles.freeHead}>GRATUIT</Text>
      </View>
      <View style={styles.tCell}>
        <View style={styles.premiumHead}>
          <Text style={styles.premiumHeadText}>PREMIUM</Text>
        </View>
      </View>
    </View>
    {rows.map((r) => (
      <View
        key={r.label}
        style={[styles.tRow, styles.tDivider]}
        accessible
        accessibilityLabel={`${r.label} : gratuit ${describe(r.free)}, Premium ${describe(r.premium)}`}
      >
        <View style={styles.tLabelCell}>
          <Text style={[styles.tLabel, r.strong && styles.tLabelStrong]}>{r.label}</Text>
        </View>
        <View style={styles.tCell}>
          <CellView cell={r.free} premium={false} strong={r.strong} />
        </View>
        <View style={styles.tCell}>
          <CellView cell={r.premium} premium strong={r.strong} />
        </View>
      </View>
    ))}
  </View>
)

function describe(c: Cell): string {
  if (c.kind === 'check') return 'inclus'
  if (c.kind === 'infinite') return 'illimité'
  return c.value
}

/**
 * Ce que le paywall affiche de la personne. Sans compte (paywall du parcours
 * invité), ça vient des réponses du parcours ; sinon, du profil enregistré.
 */
export interface PaywallPerson {
  firstName: string | null
  skinTypeFace?: SkinTypeFace
  concerns: readonly SkinConcern[]
  goals: readonly ProfileGoal[]
  restrictionFamilies: readonly string[]
}

interface Props {
  checkout: ReturnType<typeof usePaywallCheckout>
  onLater: () => void
  /** Réponses du parcours invité ; absent = lire le profil enregistré. */
  person?: PaywallPerson
  /** Rendu dans le parcours, qui gère déjà la zone sûre du haut. */
  embedded?: boolean
}

export const OnboardingPaywall: FC<Props> = ({ checkout, onLater, person, embedded = false }) => {
  const profile = useProfile()
  const firstName = person ? person.firstName : profile.firstName
  // Affiché en tête de titre : « brian » tapé au clavier devient « Brian ».
  const name = firstName?.trim() ? firstName.trim().charAt(0).toUpperCase() + firstName.trim().slice(1) : null
  const skin = person
    ? { skinTypeFace: person.skinTypeFace, concerns: [...person.concerns] }
    : profile.skin
  const restrictions = person ? { families: [...person.restrictionFamilies] } : profile.restrictions
  const { data: tiers } = useCreditTiers()
  const { rows, note } = buildRows(tiers)
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null)

  const {
    monthly,
    yearly,
    selected,
    setSelected,
    isLoadingPrices,
    isPurchasing,
    isFallbackPrice,
    diagnostic,
    retrying,
    labels,
    handlePurchase,
    handleRestore,
  } = checkout

  const insets = useSafeAreaInsets()

  // Promesse bâtie sur le profil que le parcours vient d'écrire.
  const promise = buildPaywallPromise({
    name,
    skinTypeFace: skin.skinTypeFace,
    concerns: skin.concerns ?? [],
    goals: (person ? person.goals : profile.skin.goals) ?? [],
    without: withoutLabel(
      RESTRICTION_OPTIONS.filter((o) => o.families.some((f) => restrictions.families.includes(f))).map((o) => o.short),
    ),
  })

  const buy = async () => {
    await handlePurchase()
  }

  const yearlyPrice = labels.yearlyPrice ?? PRIX_INCONNU
  const monthlyPrice = labels.monthlyPrice ?? PRIX_INCONNU
  const cta = isFallbackPrice ? 'Recharger les tarifs' : 'Prendre soin de ma peau'

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <StatusBar style="light" />
      {/* « Plus tard » reste fixe (Apple 3.1.1) ; l'en-tête sombre défile dessous. */}
      <View style={[styles.topBar, { paddingTop: (embedded ? 0 : insets.top) + 6 }]}>
        <Pressable onPress={onLater} hitSlop={12} accessibilityRole="button" accessibilityLabel="Plus tard">
          <Text style={styles.later}>Plus tard</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Nuit prolongée au-dessus : le rebond iOS ne découvre jamais de crème. */}
        <View style={styles.overscroll} pointerEvents="none" />
        {/* En-tête sombre (03/11/2026) : Perle et la promesse. */}
        <LinearGradient colors={NIGHT_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.hero}>
          <View style={styles.column}>
            {/* Perle à gauche, la promesse à droite, sur la même ligne. */}
            <Animated.View entering={fadeUp(0)} style={styles.heroHead}>
              <Image source={PERLE} style={styles.perle} contentFit="contain" />
              <Text
                style={styles.title}
                accessibilityRole="header"
                numberOfLines={4}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {promise.lead}
                <Text style={styles.titleRose}>{promise.highlight}</Text>
                {promise.tail}
              </Text>
            </Animated.View>
          </View>
        </LinearGradient>

        <View style={[styles.column, styles.body]}>
          <StaggerItem index={0}>
            <ComparisonTable rows={rows} />
          </StaggerItem>
          {note ? <Text style={styles.note}>{note}</Text> : null}
          {/* Preuve juste sous le tableau. */}
          <View style={styles.proof}>
            <Image source={LAUREL_L} style={styles.laurel} contentFit="contain" />
            <View style={styles.proofCol}>
              <Text style={styles.proofNum} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {CATALOG_SIZE_LABEL}
              </Text>
              <Text style={styles.proofLabel}>produits décryptés</Text>
            </View>
            <Image source={LAUREL_R} style={styles.laurel} contentFit="contain" />
          </View>
          {/* Sous le tableau (03/11/2026) : la phrase perso et les objectifs. */}
          <Text style={styles.subtitle}>{promise.subtitle}</Text>
          {promise.pills.length > 0 ? (
            <View style={styles.goals}>
              {promise.pills.map((g) => (
                <View key={g} style={styles.goal}>
                  <Ionicons name="checkmark-circle" size={15} color={colors.rose} />
                  <Text style={styles.goalText} numberOfLines={1}>
                    {g}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.reassure}>
            <Ionicons name="lock-closed" size={14} color={colors.inkMuted} />
            <Text style={styles.reassureText}>Sans engagement · Annulable à tout moment</Text>
          </View>
          <Text style={styles.legal}>{labels.legal}</Text>
          {/* Prix indicatif (magasin muet) : en bas de la zone qui défile, plus
              dans le pied fixe où il poussait tout l'écran. */}
          {isFallbackPrice ? (
            <View style={styles.fallback}>
              <Ionicons name="information-circle-outline" size={16} color={colors.inkMuted} />
              <View style={styles.flex}>
                <Text style={styles.fallbackText}>
                  Prix indicatif : {STORE_NAME} n'a pas répondu. Recharge pour voir le tarif exact et t'abonner.
                </Text>
                {/* La raison exacte (SDK absent, clé, magasin qui refuse...). Seule
                    ligne qui distingue les pannes entre elles ; sélectionnable
                    pour être collée dans un message. Déjà envoyée à Sentry. */}
                {diagnostic ? (
                  <Text style={styles.diagnostic} selectable>
                    {diagnostic}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

        </View>
      </ScrollView>

      {/* Fixé en bas (28/09/2026) : les formules, le bouton et les liens se
          voient sans faire défiler. Prix et durée restent sur les cartes. */}
      {/* Pied sombre (03/11/2026), comme l'en-tête, coins hauts arrondis. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 6 }]}>
        <View style={styles.column}>
          <View style={styles.plans} accessibilityRole="radiogroup">
            {/* Annuel en haut, présélectionné, mis en avant subtilement. */}
            <AnnualCard
              selected={selected === 'yearly'}
              onPress={() => setSelected('yearly')}
              savePercent={labels.savePercent}
              billed={yearlyPrice}
              perDay={labels.yearlyPerDay}
              loading={isLoadingPrices && !yearly}
            />
            <MonthlyCard
              selected={selected === 'monthly'}
              onPress={() => setSelected('monthly')}
              price={monthlyPrice}
              loading={isLoadingPrices && !monthly}
            />
          </View>

          <View style={styles.ctaWrap}>
            <PrimaryButton compact label={cta} onPress={() => void buy()} loading={isPurchasing || retrying} />
          </View>
          {/* Une seule ligne, tout en bas : réduite plutôt que coupée sur un écran étroit. */}
          <Text style={styles.links} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            <Text style={styles.link} onPress={() => setLegalDoc('cgu')} accessibilityRole="link">
              Conditions
            </Text>
            <Text style={styles.dot}>{'   ·   '}</Text>
            <Text style={styles.link} onPress={() => setLegalDoc('privacy')} accessibilityRole="link">
              Confidentialité
            </Text>
            <Text style={styles.dot}>{'   ·   '}</Text>
            <Text style={styles.link} onPress={() => void handleRestore()} accessibilityRole="link">
              Restaurer mes achats
            </Text>
          </Text>
        </View>
      </View>
      <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </SafeAreaView>
  )
}

/** Coche ronde : pleine quand la formule est choisie, grise sinon (comme le modèle). */
const PlanCheck: FC<{ selected: boolean }> = ({ selected }) => (
  <View style={[styles.check, selected && styles.checkOn]}>
    <Ionicons name="checkmark" size={18} color={selected ? colors.surface : 'rgba(255,255,255,0.45)'} />
  </View>
)

/**
 * Carte de l'annuel (modèle du 10/11/2026) : badge d'économie, montant facturé
 * par an, comparaison avec douze mensuels, et le prix ramené à la journée à
 * droite. Le badge et sa ligne de comparaison disparaissent si le pourcentage
 * n'est pas calculable ; sans prix par jour, la droite affiche le prix annuel.
 */
const AnnualCard: FC<{
  selected: boolean
  onPress: () => void
  savePercent: number | null
  billed: string
  perDay: string | null
  loading: boolean
}> = ({ selected, onPress, savePercent, billed, perDay, loading }) => {
  const badge = savePercent ? `Économise ${savePercent}${NBSP}%` : null
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.985}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={['Annuel', badge, `${billed} facturés par an`, perDay ? `soit ${perDay} par jour` : null]
        .filter(Boolean)
        .join(', ')}
      style={[styles.plan, selected && styles.planOn]}
    >
      <View style={styles.flex}>
        {badge ? (
          <View style={styles.save}>
            <Text style={styles.saveText}>{badge}</Text>
          </View>
        ) : null}
        <Text style={styles.planTitle}>Annuel</Text>
        {loading ? (
          <ActivityIndicator color={colors.rose} style={styles.planLoading} />
        ) : (
          <Text style={styles.billed}>{`${billed} facturés par an`}</Text>
        )}
        {badge ? <Text style={styles.compare}>comparé à 12 paiements mensuels</Text> : null}
      </View>
      {!loading ? (
        <View style={styles.side}>
          <Text style={styles.sidePriceSoft} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {perDay ?? billed}
          </Text>
          <Text style={styles.sideUnit}>{perDay ? 'par jour' : 'par an'}</Text>
        </View>
      ) : null}
      <PlanCheck selected={selected} />
    </PressableScale>
  )
}

/** Carte du mensuel : « Sans engagement », prix du mois en grand à droite. */
const MonthlyCard: FC<{
  selected: boolean
  onPress: () => void
  price: string
  loading: boolean
}> = ({ selected, onPress, price, loading }) => (
  <PressableScale
    onPress={onPress}
    scaleTo={0.985}
    accessibilityRole="radio"
    accessibilityState={{ checked: selected }}
    accessibilityLabel={`Mensuel, sans engagement, ${price} par mois`}
    style={[styles.plan, selected && styles.planOn]}
  >
    <View style={styles.flex}>
      <Text style={styles.planTitle}>Mensuel</Text>
      <Text style={styles.planSub}>Sans engagement</Text>
    </View>
    {loading ? (
      <ActivityIndicator color={colors.rose} />
    ) : (
      <View style={styles.side}>
        <Text style={styles.sidePrice} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {price}
        </Text>
        <Text style={styles.sideUnit}>par mois</Text>
      </View>
    )}
    <PlanCheck selected={selected} />
  </PressableScale>
)

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: PREMIUM_CREAM },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 22,
    backgroundColor: NIGHT_GRADIENT[0],
  },
  // Discret à la demande (03/11/2026) mais PAS en dessous de 0,25 : Apple 3.1.1
  // veut une sortie visible, un « Plus tard » invisible fait refuser la review.
  later: { fontFamily: fontFamilies.medium, fontSize: 16, color: 'rgba(255,255,255,0.25)', paddingVertical: 6 },
  scroll: { paddingBottom: 28 },
  column: { width: '100%', maxWidth: FLOW_MAX_WIDTH, alignSelf: 'center' },
  overscroll: {
    position: 'absolute',
    top: -1000,
    left: 0,
    right: 0,
    height: 1000,
    backgroundColor: NIGHT_GRADIENT[0],
  },
  hero: {
    paddingHorizontal: 24,
    paddingBottom: 22,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
  },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  perle: { width: 64, height: 74 },
  title: {
    fontFamily: fontFamilies.bold,
    flex: 1,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: colors.surface,
  },
  titleRose: { color: ROSE_ON_NIGHT, fontFamily: fontFamilies.bold },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: 18,
    paddingHorizontal: 6,
  },
  goals: { alignSelf: 'center', alignItems: 'stretch', gap: 8, marginTop: 12 },
  goal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.roseSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  goalText: { fontFamily: fontFamilies.semiBold, fontSize: 13.5, color: colors.ink, flexShrink: 1 },
  body: { paddingHorizontal: 20 },

  table: {
    marginTop: 18,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  // Filet entre les libellés et la colonne Gratuit.
  freeCol: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: COL_W,
    width: COL_W,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  premiumCol: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: COL_W,
    // Colonne Premium en vert (03/11/2026), le vert unique de l'app.
    backgroundColor: '#F0FDF4',
    borderLeftWidth: 1.5,
    borderLeftColor: colors.success,
  },
  tRow: { flexDirection: 'row', alignItems: 'center', minHeight: 54 },
  tHead: { minHeight: 56 },
  tDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  tLabelCell: { flex: 1, paddingHorizontal: 16, paddingVertical: 10 },
  tLabel: { fontFamily: fontFamilies.semiBold, fontSize: 15, lineHeight: 20, color: colors.ink },
  tLabelStrong: { fontFamily: fontFamilies.bold },
  tCell: { width: COL_W, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 6 },
  freeHead: { fontFamily: fontFamilies.bold, fontSize: 12, letterSpacing: 1.4, color: colors.inkLight },
  premiumHead: {
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  premiumHeadText: { fontFamily: fontFamilies.bold, fontSize: 11, letterSpacing: 0.8, color: colors.gold },
  cellInf: { fontFamily: fontFamilies.bold, fontSize: 22, lineHeight: 26 },
  cellText: { fontFamily: fontFamilies.semiBold, fontSize: 16, color: colors.inkMuted, textAlign: 'center' },
  cellTextPremium: { color: colors.success, fontFamily: fontFamilies.bold },
  cellTextStrong: { fontSize: 19 },
  note: {
    fontFamily: fontFamilies.regular,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 8,
  },
  proof: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 },
  laurel: { width: 20, height: 46 },
  proofCol: { alignItems: 'center' },
  proofNum: { fontFamily: fontFamilies.bold, fontSize: 24, color: colors.ink },
  proofLabel: { fontFamily: fontFamilies.regular, fontSize: 13, color: colors.inkMuted },
  footer: {
    backgroundColor: PAYWALL_NIGHT,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    // Place pour la pastille « Le plus choisi », posée à cheval sur la carte.
    paddingTop: 22,
  },
  plans: { gap: 10 },
  // Cartes du modèle (10/11/2026) : sombres, l'annuel choisi d'office.
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  planOn: { borderColor: colors.rose, backgroundColor: 'rgba(244,63,94,0.10)' },
  planTitle: { fontFamily: fontFamilies.bold, fontSize: 19, color: colors.surface },
  planSub: { fontFamily: fontFamilies.regular, fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  planLoading: { alignSelf: 'flex-start', marginTop: 6 },
  save: {
    alignSelf: 'flex-start',
    backgroundColor: colors.rose,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 6,
  },
  saveText: { fontFamily: fontFamilies.bold, fontSize: 13, color: colors.surface },
  // Montant prélevé : le plus lisible des prix de la carte (Apple 3.1.2).
  billed: { fontFamily: fontFamilies.bold, fontSize: 16, lineHeight: 21, color: colors.surface, marginTop: 4 },
  compare: { fontFamily: fontFamilies.regular, fontSize: 12.5, color: 'rgba(255,255,255,0.5)', marginTop: 4 },
  side: { alignItems: 'flex-end', maxWidth: 110 },
  sidePriceSoft: { fontFamily: fontFamilies.semiBold, fontSize: 20, color: 'rgba(255,255,255,0.72)' },
  sidePrice: { fontFamily: fontFamilies.bold, fontSize: 24, color: colors.surface },
  sideUnit: { fontFamily: fontFamilies.regular, fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  check: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.rose },
  fallback: { flexDirection: 'row', gap: 8, marginTop: 16, alignItems: 'flex-start' },
  fallbackText: { fontFamily: fontFamilies.regular, fontSize: 12.5, lineHeight: 17, color: colors.inkMuted },
  diagnostic: { fontFamily: fontFamilies.regular, fontSize: 11, lineHeight: 15, color: colors.inkLight, marginTop: 4 },
  ctaWrap: { marginTop: 10 },
  reassure: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20 },
  reassureText: { fontFamily: fontFamilies.regular, fontSize: 13.5, color: colors.inkMuted },
  legal: {
    fontFamily: fontFamilies.regular,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.inkLight,
    textAlign: 'center',
    marginTop: 12,
  },
  links: { textAlign: 'center', marginTop: 8, fontFamily: fontFamilies.regular, fontSize: 12.5, lineHeight: 18 },
  link: { fontFamily: fontFamilies.regular, fontSize: 12.5, color: 'rgba(255,255,255,0.6)', textDecorationLine: 'underline' },
  dot: { fontSize: 12.5, color: 'rgba(255,255,255,0.35)', textDecorationLine: 'none' },
})

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
 *   - l'essai et sa frise ne s'affichent que si le magasin l'accorde, et la
 *     ligne « on te rappelle » seulement si les notifications sont autorisées
 *     (c'est `scheduleTrialReminder` qui tient cette promesse) ;
 *   - le tableau Gratuit / Premium (28/09/2026, sur le modèle de MemoryPilot)
 *     ne met AUCUNE croix mensongère : aucune fonction n'est réservée à
 *     Premium, la différence est le nombre de crédits IA. Les chiffres sont
 *     lus en direct dans `credit_tiers` (`useCreditTiers`), et une note dit
 *     que les crédits sont partagés entre les fonctions.
 */

import { useEffect, useState, type FC } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import Animated, { FadeInDown } from 'react-native-reanimated'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { useProfile } from '@/hooks/useProfile'
import { STORE_NAME, type usePaywallCheckout } from '@/hooks/usePaywallCheckout'
import { trialDays } from '@/lib/paywall/prices'
import { getPermissionStatus } from '@/lib/notifications/scheduler'
import { scheduleTrialReminder } from '@/lib/notifications/trialReminder'
import { SKIN_TYPE_FACE_LABEL, type SkinConcern, type SkinTypeFace } from '@/lib/skin/profile'
import { CATALOG_SIZE_LABEL, CONCERN_OPTIONS, RESTRICTION_OPTIONS, withoutLabel } from '@/lib/onboarding/content'
import { periodLabel, useCreditTiers } from '@/hooks/useCreditTiers'
import { Image } from 'expo-image'
import { LegalModal, type LegalDoc } from '@/components/legal/LegalModal'
import { PressableScale, StaggerItem } from '@/components/design/motion'

const LAUREL_L = require('../../../assets/images/onboarding/laurel-left.webp')
const LAUREL_R = require('../../../assets/images/onboarding/laurel-right.webp')
import { FLOW_MAX_WIDTH, PrimaryButton } from '@/components/onboarding/flow/ui'

/** Fond crème réservé à l'offre Premium (règle du design system). */
export const PREMIUM_CREAM = '#FDF6EC'
const PRIX_INCONNU = '…'
/** Essai des deux formules, sur les 175 territoires (App Store Connect, relevé du 04/09/2026). */
const ADVERTISED_TRIAL = '3 jours'
/** Espace insécable : « 3 jours » ne se coupe jamais en fin de ligne. */
const NBSP = String.fromCharCode(0xa0)

/** « 3 jours offerts », « 1 mois offert », « 2 semaines offertes » : accordé à la durée. */
function offeredWord(trial: string): string {
  const one = trial.startsWith('1 ')
  if (/semaine/.test(trial)) return one ? 'offerte' : 'offertes'
  return one ? 'offert' : 'offerts'
}

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
    return <Ionicons name="checkmark" size={20} color={premium ? colors.rose : colors.inkMuted} />
  }
  if (cell.kind === 'infinite') {
    return <Text style={[styles.cellInf, { color: premium ? colors.rose : colors.inkMuted }]}>∞</Text>
  }
  return (
    <Text style={[styles.cellText, premium && styles.cellTextPremium, strong && premium && styles.cellTextStrong]}>
      {cell.value}
    </Text>
  )
}

const COL_W = 84

const ComparisonTable: FC<{ rows: Row[] }> = ({ rows }) => (
  <View style={styles.table}>
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
  const [notifGranted, setNotifGranted] = useState(false)

  useEffect(() => {
    void getPermissionStatus().then((s) => setNotifGranted(s === 'granted'))
  }, [])

  const {
    monthly,
    yearly,
    selected,
    setSelected,
    selectedPkg,
    isLoadingPrices,
    isPurchasing,
    isFallbackPrice,
    diagnostic,
    retrying,
    labels,
    handlePurchase,
    handleRestore,
  } = checkout

  const trial = labels.trial
  const days = trialDays(selectedPkg)
  // Titre : « 3 jours » affiché d'office (demande du 28/09/2026), même quand le
  // magasin n'a pas encore répondu. Seule exception : le magasin a RÉPONDU et
  // n'accorde pas l'essai à cette personne (ancien abonné). On ne lui promet
  // pas un essai qu'elle n'aura pas : elle serait débitée tout de suite.
  const storeAnswered = !isLoadingPrices && !isFallbackPrice
  const titleTrial = storeAnswered ? trial : ADVERTISED_TRIAL

  // « Ton plan » : ce que le parcours vient d'écrire dans le profil.
  const chips: string[] = []
  if (skin.skinTypeFace) chips.push(`Peau ${SKIN_TYPE_FACE_LABEL[skin.skinTypeFace].toLowerCase()}`)
  const concernLabels = CONCERN_OPTIONS.filter((c) => skin.concerns?.includes(c.key))
    .slice(0, 2)
    .map((c) => c.label.toLowerCase())
  if (concernLabels.length > 0) {
    const txt = concernLabels.join(', ')
    chips.push(txt.charAt(0).toUpperCase() + txt.slice(1))
  }
  const without = withoutLabel(
    RESTRICTION_OPTIONS.filter((o) => o.families.some((f) => restrictions.families.includes(f))).map((o) => o.short),
  )
  if (without) chips.push(without)

  const buy = async () => {
    const ok = await handlePurchase()
    if (ok && days && notifGranted) void scheduleTrialReminder(days)
  }

  const yearlyPrice = labels.yearlyPrice ?? PRIX_INCONNU
  const monthlyPrice = labels.monthlyPrice ?? PRIX_INCONNU
  const cta = isFallbackPrice
    ? 'Recharger les tarifs'
    : trial
      ? `Commencer mes ${trial} gratuits`
      : "M'abonner"

  return (
    <SafeAreaView style={styles.safe} edges={embedded ? ['bottom'] : ['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={onLater} hitSlop={12} accessibilityRole="button" accessibilityLabel="Plus tard">
          <Text style={styles.later}>Plus tard</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.column}>
          {/* En-tête compact (28/09/2026) : 4 lignes au plus, titre (2) + plan (2).
              Pastille « PREMIUM » retirée le même jour. */}
          <Text
            style={styles.title}
            accessibilityRole="header"
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {name ? `${name}, ta peau mérite mieux que le hasard.` : 'Ta peau mérite mieux que le hasard.'}
            {titleTrial ? (
              <>
                {' '}
                <Text style={styles.highlight}>{`${NBSP}${titleTrial.replace(/ /g, NBSP)}${NBSP}`}</Text>
                {`${NBSP}${offeredWord(titleTrial)}.`}
              </>
            ) : null}
          </Text>
          <Text style={styles.planLine} numberOfLines={2}>
            {chips.length > 0 ? (
              <>
                Ton plan :{' '}
                {chips.map((c, i) => (
                  <Text key={c}>
                    {i > 0 ? <Text style={styles.planSep}>{'  ·  '}</Text> : null}
                    <Text style={styles.planItem}>{c.charAt(0).toLowerCase() + c.slice(1)}</Text>
                  </Text>
                ))}
              </>
            ) : (
              'Tout débloquer, dès maintenant.'
            )}
          </Text>

          <StaggerItem index={0}>
            <ComparisonTable rows={rows} />
          </StaggerItem>
          {note ? <Text style={styles.note}>{note}</Text> : null}

          <View style={styles.proof}>
            <Image source={LAUREL_L} style={styles.laurel} contentFit="contain" />
            <View style={styles.proofCol}>
              <Text style={styles.proofNum}>{CATALOG_SIZE_LABEL}</Text>
              <Text style={styles.proofLabel}>produits décryptés</Text>
            </View>
            <Image source={LAUREL_R} style={styles.laurel} contentFit="contain" />
          </View>

          {trial && days ? (
            <Animated.View entering={FadeInDown.delay(200).duration(360)} style={styles.timeline}>
              <TimelineStep icon="lock-open" strong title="Aujourd'hui" text="Accès complet, sans rien payer" />
              {notifGranted && days >= 2 ? (
                <TimelineStep icon="notifications" title={`Jour ${days - 1}`} text="On te rappelle que l'essai se termine" />
              ) : null}
              <TimelineStep icon="star" title={`Jour ${days}`} text="Début de l'abonnement, annulable avant" last />
            </Animated.View>
          ) : null}

          <View style={styles.reassure}>
            <Ionicons name="lock-closed" size={14} color={colors.inkMuted} />
            <Text style={styles.reassureText}>Sans engagement · Annulable à tout moment</Text>
          </View>
          <Text style={styles.legal}>{labels.legal}</Text>
        </View>
      </ScrollView>

      {/* Fixé en bas (28/09/2026) : les formules, le bouton et les liens se
          voient sans faire défiler. Prix et durée restent sur les cartes. */}
      <View style={styles.footer}>
        <View style={styles.column}>
          <View style={styles.plans}>
            <PlanCard
              selected={selected === 'yearly'}
              onPress={() => setSelected('yearly')}
              title="Annuel"
              ribbon="Le plus choisi"
              badge={labels.savePercent ? `-${labels.savePercent} %` : null}
              price={`${yearlyPrice}/an`}
              sub={[
                labels.yearlyPerMonth ? `soit ${labels.yearlyPerMonth}/mois` : null,
                labels.yearlyTrial ? `${labels.yearlyTrial} gratuits` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              loading={isLoadingPrices && !yearly}
            />
            <PlanCard
              selected={selected === 'monthly'}
              onPress={() => setSelected('monthly')}
              title="Mensuel"
              badge={null}
              price={`${monthlyPrice}/mois`}
              sub=""
              loading={isLoadingPrices && !monthly}
            />
          </View>

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

          <View style={styles.ctaWrap}>
            <PrimaryButton label={cta} onPress={() => void buy()} loading={isPurchasing || retrying} />
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

const TimelineStep: FC<{
  icon: keyof typeof Ionicons.glyphMap
  title: string
  text: string
  strong?: boolean
  last?: boolean
}> = ({ icon, title, text, strong = false, last = false }) => (
  <View style={styles.tlRow}>
    <View style={styles.tlRail}>
      <View style={[styles.tlDot, strong && styles.tlDotStrong]}>
        <Ionicons name={icon} size={16} color={strong ? colors.surface : colors.rose} />
      </View>
      {!last ? <View style={styles.tlLine} /> : null}
    </View>
    <View style={styles.tlTexts}>
      <Text style={styles.tlTitle}>{title}</Text>
      <Text style={styles.tlText}>{text}</Text>
    </View>
  </View>
)

const PlanCard: FC<{
  selected: boolean
  onPress: () => void
  title: string
  /** Pastille posée sur le bord haut de la carte. */
  ribbon?: string
  badge: string | null
  price: string
  sub: string
  loading: boolean
}> = ({ selected, onPress, title, ribbon, badge, price, sub, loading }) => (
  <PressableScale
    onPress={onPress}
    scaleTo={0.985}
    accessibilityRole="radio"
    accessibilityState={{ checked: selected }}
    accessibilityLabel={`${title}${ribbon ? `, ${ribbon}` : ''}, ${price}${sub ? `, ${sub}` : ''}`}
    style={[styles.plan, selected && styles.planOn]}
  >
    {ribbon ? (
      <View style={styles.ribbon} pointerEvents="none">
        <Text style={styles.ribbonText}>{ribbon.toUpperCase()}</Text>
      </View>
    ) : null}
    <View style={styles.flex}>
      <View style={styles.planHead}>
        <Text style={styles.planTitle}>{title}</Text>
        {badge ? (
          <View style={styles.save}>
            <Text style={styles.saveText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {sub ? <Text style={styles.planSub}>{sub}</Text> : null}
    </View>
    {loading ? <ActivityIndicator color={colors.rose} /> : <Text style={styles.planPrice}>{price}</Text>}
    <View style={[styles.radio, selected && styles.radioOn]}>
      {selected ? <Ionicons name="checkmark" size={15} color={colors.surface} /> : null}
    </View>
  </PressableScale>
)

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: PREMIUM_CREAM },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 22, paddingTop: 6 },
  later: { fontFamily: fontFamilies.medium, fontSize: 16, color: colors.inkMuted, paddingVertical: 6 },
  scroll: { paddingHorizontal: 20, paddingBottom: 28 },
  column: { width: '100%', maxWidth: FLOW_MAX_WIDTH, alignSelf: 'center' },
  title: {
    fontFamily: fontFamilies.bold,
    fontSize: 29,
    lineHeight: 35,
    letterSpacing: -0.6,
    color: colors.ink,
    textAlign: 'center',
    marginTop: 4,
  },
  highlight: { backgroundColor: colors.roseSoft, color: colors.roseDeep, fontFamily: fontFamilies.bold },
  planLine: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 6,
  },
  planItem: { fontFamily: fontFamilies.semiBold, color: colors.roseDeep },
  planSep: { color: colors.inkLight },

  table: {
    marginTop: 18,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  premiumCol: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 84,
    backgroundColor: '#FFF5F6',
    borderLeftWidth: 1.5,
    borderLeftColor: colors.rose,
  },
  tRow: { flexDirection: 'row', alignItems: 'center', minHeight: 54 },
  tHead: { minHeight: 56 },
  tDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  tLabelCell: { flex: 1, paddingHorizontal: 16, paddingVertical: 10 },
  tLabel: { fontFamily: fontFamilies.semiBold, fontSize: 15, lineHeight: 20, color: colors.ink },
  tLabelStrong: { fontFamily: fontFamilies.bold },
  tCell: { width: 84, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  freeHead: { fontFamily: fontFamilies.bold, fontSize: 12, letterSpacing: 1.4, color: colors.inkLight },
  premiumHead: {
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  premiumHeadText: { fontFamily: fontFamilies.bold, fontSize: 11.5, letterSpacing: 1, color: colors.gold },
  cellInf: { fontFamily: fontFamilies.bold, fontSize: 22, lineHeight: 26 },
  cellText: { fontFamily: fontFamilies.semiBold, fontSize: 16, color: colors.inkMuted, textAlign: 'center' },
  cellTextPremium: { color: colors.rose, fontFamily: fontFamilies.bold },
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
  timeline: { marginTop: 20, paddingHorizontal: 6 },
  tlRow: { flexDirection: 'row', gap: 14 },
  tlRail: { alignItems: 'center', width: 40 },
  tlDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.roseSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tlDotStrong: { backgroundColor: colors.rose },
  tlLine: { width: 2, flex: 1, minHeight: 14, backgroundColor: colors.rose, opacity: 0.5 },
  tlTexts: { flex: 1, paddingBottom: 16, paddingTop: 2 },
  tlTitle: { fontFamily: fontFamilies.bold, fontSize: 16, color: colors.ink },
  tlText: { fontFamily: fontFamilies.regular, fontSize: 14.5, lineHeight: 20, color: colors.inkMuted, marginTop: 2 },
  footer: {
    backgroundColor: PREMIUM_CREAM,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: 20,
    // Place pour la pastille « Le plus choisi », posée à cheval sur la carte.
    paddingTop: 20,
    paddingBottom: 6,
  },
  plans: { gap: 10 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  planOn: { borderColor: colors.rose, borderWidth: 2 },
  ribbon: {
    position: 'absolute',
    top: -11,
    right: 18,
    backgroundColor: colors.rose,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  ribbonText: { fontFamily: fontFamilies.bold, fontSize: 11, letterSpacing: 1, color: colors.surface },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planTitle: { fontFamily: fontFamilies.bold, fontSize: 18, color: colors.ink },
  planSub: { fontFamily: fontFamilies.regular, fontSize: 13.5, color: colors.inkMuted, marginTop: 4 },
  save: { backgroundColor: colors.rating.vert.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  saveText: { fontFamily: fontFamilies.bold, fontSize: 13, color: colors.success },
  planPrice: { fontFamily: fontFamilies.bold, fontSize: 18, color: colors.ink },
  radio: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: colors.rose, borderColor: colors.rose },
  fallback: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'flex-start' },
  fallbackText: { fontFamily: fontFamilies.regular, fontSize: 12.5, lineHeight: 17, color: colors.inkMuted },
  diagnostic: { fontFamily: fontFamilies.regular, fontSize: 11, lineHeight: 15, color: colors.inkLight, marginTop: 4 },
  ctaWrap: { marginTop: 12 },
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
  links: { textAlign: 'center', marginTop: 10, fontFamily: fontFamilies.regular, fontSize: 12.5, lineHeight: 18 },
  link: { fontFamily: fontFamilies.regular, fontSize: 12.5, color: colors.inkMuted, textDecorationLine: 'underline' },
  dot: { fontSize: 12.5, color: colors.inkLight, textDecorationLine: 'none' },
})

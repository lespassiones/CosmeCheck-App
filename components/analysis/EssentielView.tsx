/**
 * EssentielView — aperçu « L'essentiel » en 3 cartes, port mobile du web
 * (CosmetWiki components/analyse/EssentielView.tsx).
 *
 *   1. Carte « L'essentiel »  : verdict en une phrase + pastille tonale.
 *   2. Carte « Ce qui est bien » : top 3 ingrédients verts (hors eau) + leurs fonctions.
 *   3. Carte « À surveiller »   : une ligne par tier problématique (famille +
 *      effet), ou « Tout va bien » si rien à signaler.
 *
 * Consomme directement `EssentielData` produit par `@/lib/essentiel/engine`
 * (computeEssentiel) — entièrement déterministe, pas d'appel IA.
 *
 * Le bouton « Voir l'analyse complète » est extrait (EssentielToggleButton)
 * pour que le parent puisse le rendre séparément.
 */

import { memo, type FC } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { WhiteCard } from '@/components/design/WhiteCard'
import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { spacing } from '@/constants/spacing'
import { verdictToneFromScore } from '@/lib/essentiel/engine'
import type { ConcernTier, EssentielData, VerdictTone } from '@/lib/essentiel/engine'

// Phrase L'ESSENTIEL — préfixe FIXE selon la pastille + qualificatif du compteur
// d'ingrédients pénalisants (orange + rouge), propre à chaque niveau :
//   œil → "à suivre" · triangle → "pénalisant(s)" · stop → "problématique(s)".
const VERDICT_PHRASE: Record<
  VerdictTone,
  { prefix: string; noun: 'à suivre' | 'pénalisant' | 'problématique' | null }
> = {
  'very-safe': { prefix: 'Formule très douce', noun: null },
  safe: { prefix: 'Formule globalement saine', noun: null },
  caution: { prefix: 'Formule moyenne', noun: 'à suivre' },
  warning: { prefix: 'Formule à suivre de près', noun: 'pénalisant' },
  danger: { prefix: 'Formule à examiner attentivement', noun: 'problématique' },
  'high-risk': { prefix: 'Formule à examiner attentivement', noun: 'problématique' },
  unknown: { prefix: '', noun: null },
}

/**
 * Phrase L'ESSENTIEL : préfixe imposé par le SCORE (= la pastille), suivi
 * UNIQUEMENT du nombre d'ingrédients pénalisants (orange + rouge) avec le
 * qualificatif du niveau. Si aucun pénalisant (ou cœur/feuille) → juste le préfixe.
 */
function buildVerdictPhrase(
  enginePhrase: string,
  verdictScore: number | null | undefined,
  penalizingCount: number,
): string {
  if (verdictScore == null) return enginePhrase
  const cfg = VERDICT_PHRASE[verdictToneFromScore(verdictScore)]
  if (!cfg.prefix) return enginePhrase
  if (!cfg.noun || penalizingCount <= 0) return `${cfg.prefix}.`
  const plural = penalizingCount > 1
  const ingr = plural ? 'ingrédients' : 'ingrédient'
  const qual = cfg.noun === 'à suivre' ? 'à suivre' : plural ? `${cfg.noun}s` : cfg.noun
  const count = penalizingCount === 1 ? 'un' : String(penalizingCount)
  return `${cfg.prefix}, ${count} ${ingr} ${qual}.`
}

interface Props {
  data: EssentielData
  expanded: boolean
  onToggle: () => void
  hideToggle?: boolean
  /** Score global (INCI Beauty) — la pastille L'ESSENTIEL en dérive, identique
   *  à la jauge du verdict (cœur/feuille/œil/triangle/stop). */
  verdictScore?: number | null
  /** Nombre d'ingrédients pénalisants (orange + rouge) — quantifié dans la phrase. */
  penalizingCount?: number
  /** Nombre d'ingrédients de l'analyse qui tombent dans les restrictions de
   *  l'utilisateur — affiché en alerte dans la carte L'ESSENTIEL. */
  restrictedCount?: number
  /** Noms des familles restreintes présentes dans ce produit (ex: ["Parabens", "Sulfates"]) — pour la modal. */
  restrictedFamilies?: string[]
  /** Navigue vers /profile/restrictions (lien « Gérer vos restrictions »). */
  onManageRestrictions?: () => void
  /** Callback au tap sur la ligne restrictions — ouvre la modal des familles. */
  onShowRestrictedFamilies?: () => void
}

export const EssentielView: FC<Props> = ({
  data,
  expanded,
  onToggle,
  hideToggle = false,
  verdictScore,
  penalizingCount = 0,
  restrictedCount = 0,
  restrictedFamilies = [],
  onManageRestrictions,
  onShowRestrictedFamilies,
}) => {
  return (
    <View style={styles.section} accessibilityLabel="Aperçu essentiel de l'analyse">
      <VerdictCard
        verdict={data.verdict}
        verdictScore={verdictScore}
        penalizingCount={penalizingCount}
        restrictedCount={restrictedCount}
        onManageRestrictions={onManageRestrictions}
        onShowRestrictedFamilies={onShowRestrictedFamilies}
      />

      {data.positives.length > 0 ? <PositivesCard positives={data.positives} /> : null}

      {data.concerns.length > 0 ? <ConcernsCard concerns={data.concerns} /> : <AllClearCard />}

      {hideToggle ? null : (
        <View style={styles.toggleWrap}>
          <EssentielToggleButton expanded={expanded} onToggle={onToggle} />
        </View>
      )}
    </View>
  )
}

export const EssentielToggleButton: FC<{ expanded: boolean; onToggle: () => void }> = ({
  expanded,
  onToggle,
}) => {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      style={({ pressed }) => [styles.toggleBtn, pressed && styles.toggleBtnPressed]}
    >
      <Text style={styles.toggleText}>
        {expanded ? 'Masquer le détail' : "Voir l'analyse complète"}
      </Text>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.gray700} />
    </Pressable>
  )
}

// ── Icône « halo » (disque pastel clair + cercle central + ombre douce) ──────
// Effet en 2 tons : un anneau pastel translucide derrière (plus clair) + un
// cercle plein de la même teinte au centre, avec une ombre portée légère.
// Toujours circulaire, pour les 4 blocs (y compris « ce qui est bien »).

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

const HaloIcon: FC<{ name: IoniconName; iconColor: string; bg: string }> = ({
  name,
  iconColor,
  bg,
}) => (
  <View style={styles.haloWrap}>
    <View style={[styles.haloRing, { backgroundColor: bg }]} />
    <View style={[styles.haloInner, { backgroundColor: bg }]}>
      <Ionicons name={name} size={24} color={iconColor} />
    </View>
  </View>
)

// ── Cartes ───────────────────────────────────────────────────────────────────

function VerdictCard({
  verdict,
  verdictScore,
  penalizingCount = 0,
  restrictedCount = 0,
  onManageRestrictions,
  onShowRestrictedFamilies,
}: {
  verdict: EssentielData['verdict']
  verdictScore?: number | null
  penalizingCount?: number
  restrictedCount?: number
  onManageRestrictions?: () => void
  onShowRestrictedFamilies?: () => void
}) {
  // Icône dérivée du score (même logique que la jauge verdict) ; fallback sur
  // le ton calculé par le moteur quand le score est absent.
  const pv = VERDICT_VISUAL[verdictScore != null ? verdictToneFromScore(verdictScore) : verdict.tone]

  // « Vert » = pastille cœur ou feuille (score ≥ 13). Sur un produit vert qui
  // contient malgré tout une restriction, on n'affiche QUE l'alerte restriction
  // (pas de phrase « formule très douce » qui rassurerait à tort).
  const tone = verdictToneFromScore(verdictScore)
  const isGreen = tone === 'very-safe' || tone === 'safe'
  const hasRestriction = restrictedCount > 0

  // Règles :
  //   vert + 0 restriction  → « Ne contient aucune… » + phrase verdict
  //   vert + ≥1 restriction → « Contient N… » SEUL (pas de phrase)
  //   non-vert              → phrase verdict toujours ; + « Contient N… » si restriction
  const showRestrictionLine = isGreen || hasRestriction
  const showVerdictPhrase = !(isGreen && hasRestriction)

  const restrictionText = hasRestriction
    ? `Contient ${restrictedCount} de vos restrictions`
    : 'Ne contient aucune de vos restrictions'

  return (
    <WhiteCard padding={spacing.base} style={styles.cardRow}>
      <View style={styles.cardInner}>
        <HaloIcon name={pv.icon} iconColor={pv.iconColor} bg={pv.badgeBg} />
        <View style={styles.cardBody}>
          <Text style={styles.eyebrow}>L'ESSENTIEL</Text>

          {showRestrictionLine ? (
            <Pressable
              onPress={onShowRestrictedFamilies}
              disabled={!onShowRestrictedFamilies}
              accessibilityRole="button"
              accessibilityLabel={restrictionText}
              style={({ pressed }) => [
                styles.restrictionRow,
                hasRestriction ? styles.restrictionRowAlert : styles.restrictionRowOk,
                pressed && onShowRestrictedFamilies ? styles.restrictionRowPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.restrictionText,
                  { color: hasRestriction ? colors.rating.rouge.text : colors.rating.vert.text },
                ]}
                numberOfLines={2}
              >
                {restrictionText}
              </Text>
              <View style={styles.manageRow}>
                <Text
                  style={[
                    styles.manageText,
                    { color: hasRestriction ? colors.rating.rouge.text : colors.rating.vert.text },
                  ]}
                >
                  Gérer
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={12}
                  color={hasRestriction ? colors.rating.rouge.text : colors.rating.vert.text}
                />
              </View>
            </Pressable>
          ) : null}

          {showVerdictPhrase ? (
            <Text style={[styles.verdictPhrase, showRestrictionLine && styles.verdictPhraseSpaced]}>
              {buildVerdictPhrase(verdict.phrase, verdictScore, penalizingCount)}
            </Text>
          ) : null}
        </View>
      </View>
    </WhiteCard>
  )
}

function PositivesCard({ positives }: { positives: EssentielData['positives'] }) {
  return (
    <WhiteCard padding={spacing.base}>
      <View style={styles.cardInnerTop}>
        {/* Bloc du positif : cercle halo vert pâle (comme les autres). */}
        <HaloIcon
          name="shield-checkmark-outline"
          iconColor={colors.rating.vert.text}
          bg={colors.rating.vert.bg}
        />
        <View style={styles.cardBody}>
          <Text style={styles.eyebrow}>CE QUI EST BIEN</Text>
          <View style={styles.list}>
            {positives.map((p, i) => (
              <View key={i} style={styles.listItem}>
                <Ionicons
                  name="checkmark"
                  size={14}
                  color={colors.success}
                  style={styles.listIcon}
                />
                <Text style={styles.listText}>
                  <Text style={styles.listName}>{p.name}</Text>
                  <Text style={styles.listMuted}> {'->'} {p.verb}</Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </WhiteCard>
  )
}

function ConcernsCard({ concerns }: { concerns: EssentielData['concerns'] }) {
  const worst = concerns[0]
  const v = CONCERN_VISUAL[worst.tier]
  return (
    <WhiteCard padding={spacing.base}>
      <View style={styles.cardInnerTop}>
        <HaloIcon name={v.icon} iconColor={v.iconColor} bg={v.badgeBg} />
        <View style={styles.cardBody}>
          <Text style={styles.eyebrow}>À SURVEILLER</Text>
          <View style={styles.list}>
            {concerns.map((c, i) => {
              const cv = CONCERN_VISUAL[c.tier]
              return (
                <View key={i} style={styles.listItem}>
                  <View style={[styles.concernDot, { backgroundColor: cv.dotColor }]} />
                  <Text style={styles.listText}>
                    <Text style={styles.listName}>{c.family}</Text>
                    <Text style={styles.listMuted}> {'->'} {c.effect}</Text>
                  </Text>
                </View>
              )
            })}
          </View>
        </View>
      </View>
    </WhiteCard>
  )
}

function AllClearCard() {
  return (
    <WhiteCard padding={spacing.base} style={styles.cardRow}>
      <View style={styles.cardInner}>
        <HaloIcon name="checkmark" iconColor={colors.rating.vert.text} bg={colors.rating.vert.bg} />
        <View style={styles.cardBody}>
          <Text style={styles.eyebrow}>TOUT VA BIEN</Text>
          <Text style={styles.verdictPhrase}>Aucun ingrédient à signaler dans cette formule.</Text>
        </View>
      </View>
    </WhiteCard>
  )
}

// ── Maps visuelles ───────────────────────────────────────────────────────────

const VERDICT_VISUAL: Record<
  VerdictTone,
  { icon: IoniconName; badgeBg: string; iconColor: string }
> = {
  'very-safe': { icon: 'heart', badgeBg: colors.rating.vert.bg, iconColor: colors.rating.vert.text },
  safe: { icon: 'leaf-outline', badgeBg: colors.rating.vert.bg, iconColor: colors.rating.vert.text },
  caution: { icon: 'eye-outline', badgeBg: colors.rating.jaune.bg, iconColor: colors.rating.jaune.text },
  warning: { icon: 'warning-outline', badgeBg: colors.rating.orange.bg, iconColor: colors.rating.orange.text },
  danger: { icon: 'alert-circle-outline', badgeBg: colors.rating.rouge.bg, iconColor: colors.rating.rouge.text },
  'high-risk': { icon: 'ban-outline', badgeBg: colors.rating.rouge.bg, iconColor: colors.rating.rouge.ink },
  unknown: { icon: 'help-circle-outline', badgeBg: colors.gray100, iconColor: colors.inkMuted },
}

const CONCERN_VISUAL: Record<
  ConcernTier,
  { icon: IoniconName; badgeBg: string; iconColor: string; dotColor: string }
> = {
  jaune: {
    icon: 'eye-outline',
    badgeBg: colors.rating.jaune.bg,
    iconColor: colors.rating.jaune.text,
    dotColor: colors.rating.jaune.DEFAULT,
  },
  orange: {
    icon: 'warning-outline',
    badgeBg: colors.rating.orange.bg,
    iconColor: colors.rating.orange.text,
    dotColor: colors.rating.orange.DEFAULT,
  },
  rouge: {
    icon: 'alert-circle-outline',
    badgeBg: colors.rating.rouge.bg,
    iconColor: colors.rating.rouge.text,
    dotColor: colors.rating.rouge.DEFAULT,
  },
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  cardRow: {},
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
  },
  cardInnerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.base,
  },
  // Icône « halo » : disque pastel clair derrière (anneau) + cercle plein au
  // centre + ombre douce. Toujours circulaire.
  haloWrap: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloRing: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
    opacity: 0.4,
  },
  haloInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.inkMuted,
    marginBottom: 4,
  },
  verdictPhrase: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: colors.gray900,
    lineHeight: 20,
  },
  verdictPhraseSpaced: {
    marginTop: 8,
  },
  // Ligne restriction (alerte rose si match, vert discret sinon) — tappable → Gérer.
  restrictionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 2,
  },
  restrictionRowAlert: {
    backgroundColor: colors.rating.rouge.bg,
  },
  restrictionRowOk: {
    backgroundColor: colors.rating.vert.bg,
  },
  restrictionRowPressed: {
    opacity: 0.7,
  },
  restrictionText: {
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 17,
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  manageText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
  },
  list: {
    gap: 6,
    marginTop: 2,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  listIcon: {
    marginTop: 3,
  },
  concernDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  listText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  listName: {
    fontFamily: fontFamilies.semiBold,
    color: colors.gray900,
  },
  listMuted: {
    fontFamily: fontFamilies.regular,
    color: colors.inkMuted,
  },
  toggleWrap: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 9999,
    paddingHorizontal: 20,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  toggleBtnPressed: {
    opacity: 0.8,
  },
  toggleText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    color: colors.gray700,
  },
})

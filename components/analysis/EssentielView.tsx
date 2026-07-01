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

      {/* « Ce qui est bien » / « À surveiller » remplacés par les 3 blocs IA
          personnalisés (PersonalInsightsCards), rendus par le parent. */}

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
      <Ionicons name={name} size={20} color={iconColor} />
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

  // La ligne restriction est TOUJOURS affichée : « Contient N… » s'il y a des
  // restrictions, sinon « Ne contient aucune… ». La phrase verdict (« Formule
  // moyenne… ») a été retirée : la pastille tonale + cette ligne suffisent et
  // c'est l'info que l'utilisateur attend (parité avec le web).
  const hasRestriction = restrictedCount > 0
  const restrictionText = hasRestriction
    ? `Contient ${restrictedCount} de vos restrictions`
    : 'Ne contient aucune de vos restrictions'

  return (
    <WhiteCard padding={spacing.base} style={styles.cardRow}>
      <View style={styles.cardInner}>
        <HaloIcon name={pv.icon} iconColor={pv.iconColor} bg={pv.badgeBg} />
        <View style={styles.cardBody}>
          <Text style={styles.eyebrow}>L'ESSENTIEL</Text>

          <Pressable
            onPress={hasRestriction ? onShowRestrictedFamilies : onManageRestrictions}
            disabled={!(hasRestriction ? onShowRestrictedFamilies : onManageRestrictions)}
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
    gap: spacing.md,
  },
  cardInnerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  // Icône « halo » : disque pastel clair derrière (anneau) + cercle plein au
  // centre + ombre douce. Toujours circulaire.
  haloWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    opacity: 0.4,
  },
  haloInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    fontFamily: fontFamilies.bold,
    fontSize: 13,
    letterSpacing: 0.3,
    color: colors.ink,
    marginBottom: 6,
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
    fontSize: 12,
    lineHeight: 16,
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

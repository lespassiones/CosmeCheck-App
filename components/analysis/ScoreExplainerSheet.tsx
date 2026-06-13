/**
 * ScoreExplainerSheet : « Comment cette note est calculée ? »
 *
 * Pendant Cosme Check de la page « Comment le produit est-il noté ? » d'INCI
 * Beauty, mais : (1) PERSONNALISÉ avec les données réelles du produit affiché
 * (sa note, sa composition couleur, sa position vs la moyenne de sa catégorie),
 * (2) textes reformulés (pas de copier-coller), (3) logique pure, AUCUNE IA.
 *
 * Sections :
 *   1. La note de ce produit (pastille + échelle 0-20).
 *   2. Face aux produits similaires (moyenne de la sous-catégorie + écart).
 *   3. Sa composition en couleurs (barre de proportion + compteurs).
 *   4. Ce que veulent dire les couleurs (légende).
 *   5. Comment la note est construite (barème reformulé + plancher de sécurité).
 */
import { type FC, type ReactNode } from 'react'
import {
  Linking,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { radius, spacing } from '@/constants/spacing'
import { CatalogPastille } from '@/components/shared/CatalogPastille'
import type { ColorRating } from '@/lib/analysis/types'
import { scoreLabelFromScore } from '@/lib/analysis/scoreCap'
import { useCategoryScoreStats } from '@/hooks/useCategoryScoreStats'

/** Sources officielles citées dans la méthodologie (liens vers les vraies pages). */
const RESOURCES: { label: string; sub: string; url: string }[] = [
  {
    label: 'Règlement (CE) n° 1223/2009',
    sub: 'Cadre européen des cosmétiques + annexes (substances interdites, restreintes, colorants, conservateurs, filtres UV)',
    url: 'https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32009R1223',
  },
  {
    label: 'ANSES',
    sub: "Agence nationale de sécurité sanitaire de l'alimentation, de l'environnement et du travail",
    url: 'https://www.anses.fr',
  },
  {
    label: 'ANSM',
    sub: 'Agence nationale de sécurité du médicament et des produits de santé',
    url: 'https://ansm.sante.fr',
  },
  {
    label: 'Comité scientifique européen (SCCS)',
    sub: 'Sécurité des consommateurs, Commission européenne',
    url: 'https://health.ec.europa.eu/scientific-committees/scientific-committee-consumer-safety-sccs_en',
  },
  {
    label: 'ECHA',
    sub: 'Agence européenne des produits chimiques',
    url: 'https://echa.europa.eu/fr',
  },
]

interface Props {
  visible: boolean
  onClose: () => void
  productName: string | null
  category: string | null
  score: number | null
  counts: Record<ColorRating | 'unknown', number>
}

const COLOR_ORDER: (ColorRating | 'unknown')[] = ['vert', 'jaune', 'orange', 'rouge', 'unknown']

const COLOR_DOT: Record<ColorRating | 'unknown', string> = {
  vert: colors.rating.vert.DEFAULT,
  jaune: colors.rating.jaune.DEFAULT,
  orange: colors.rating.orange.DEFAULT,
  rouge: colors.rating.rouge.DEFAULT,
  unknown: colors.inkLight,
}

const LEGEND: { key: ColorRating | 'unknown'; title: string; desc: string }[] = [
  { key: 'vert', title: 'Vert : rien à signaler', desc: 'Aucun risque connu à ce jour.' },
  { key: 'jaune', title: 'Jaune : à surveiller', desc: 'Encadré, parfois irritant ou allergène.' },
  { key: 'orange', title: 'Orange : synthèse ou pétrochimie', desc: 'Impact santé ou environnement à considérer.' },
  { key: 'rouge', title: 'Rouge : controversé', desc: 'Potentiellement à risque pour la santé ou la planète.' },
  { key: 'unknown', title: 'Gris : non reconnu', desc: "Ingrédient qu'on n'a pas pu évaluer." },
]

function pctLeft(score: number): DimensionValue {
  const pct = Math.max(4, Math.min(96, (score / 20) * 100))
  return `${pct}%` as DimensionValue
}

export const ScoreExplainerSheet: FC<Props> = ({
  visible,
  onClose,
  productName,
  category,
  score,
  counts,
}) => {
  const stats = useCategoryScoreStats(category, visible)
  const total = COLOR_ORDER.reduce((s, k) => s + (counts[k] ?? 0), 0)
  const avg = stats.data?.avgScore ?? null
  const delta = score != null && avg != null ? score - avg : null
  const badgeLabel = score != null ? scoreLabelFromScore(score) : null

  // Comparaison QUALITATIVE (pas de note chiffrée côté utilisateur : on parle badge).
  const compareSentence =
    delta == null
      ? null
      : delta > 0.5
        ? 'Ce produit est mieux noté que la moyenne des produits similaires.'
        : delta < -0.5
          ? 'Ce produit est moins bien noté que la moyenne des produits similaires.'
          : 'Ce produit se situe dans la moyenne des produits similaires.'

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Comment cette note est calculée ?</Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            style={styles.close}
          >
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* 1. La note de ce produit */}
          <Section title="La note de ce produit">
            <View style={styles.scoreRow}>
              <CatalogPastille score={score} size={56} />
              <Text style={[styles.paragraph, styles.scoreText]}>
                {badgeLabel ? (
                  <Text>
                    Ce produit reçoit le badge{' '}
                    <Text style={styles.bold}>« {badgeLabel} »</Text>.{' '}
                  </Text>
                ) : null}
                Chaque produit reçoit un badge coloré, du rouge (à éviter) au vert
                (très bien) : plus il est vert, plus la formule est jugée sûre au
                regard de ses ingrédients.
              </Text>
            </View>
          </Section>

          {/* 2. Face aux produits similaires */}
          {avg != null && score != null ? (
            <Section title="Face aux produits similaires">
              <Text style={styles.paragraph}>
                Comparé à la moyenne des produits de la même catégorie.
              </Text>
              <SimilarBar score={score} avg={avg} />
              <Text style={styles.compareNote}>
                <Text style={styles.bold}>{compareSentence}</Text>
                {stats.data?.productCount
                  ? ` Comparaison établie sur ${stats.data.productCount.toLocaleString('fr-FR')} produits de la même catégorie.`
                  : ''}
              </Text>
            </Section>
          ) : null}

          {/* 3. Sa composition en couleurs */}
          {total > 0 ? (
            <Section title="Sa composition en un coup d'œil">
              <Text style={styles.paragraph}>
                Chaque ingrédient est classé par couleur. Plus on approche du rouge,
                plus il est jugé controversé.
              </Text>
              <ProportionBar counts={counts} total={total} />
              <View style={styles.countChips}>
                {COLOR_ORDER.map((k) => {
                  const n = counts[k] ?? 0
                  if (n === 0) return null
                  return (
                    <View key={k} style={styles.countChip}>
                      <View style={[styles.countDot, { backgroundColor: COLOR_DOT[k] }]} />
                      <Text style={styles.countChipText}>
                        {n} {COLOR_LABEL[k]}
                      </Text>
                    </View>
                  )
                })}
              </View>
            </Section>
          ) : null}

          {/* 4. Légende des couleurs */}
          <Section title="Ce que veulent dire les couleurs">
            <View style={styles.legend}>
              {LEGEND.map((l) => (
                <View key={l.key} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: COLOR_DOT[l.key] }]} />
                  <View style={styles.legendText}>
                    <Text style={styles.legendTitle}>{l.title}</Text>
                    <Text style={styles.legendDesc}>{l.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Section>

          {/* 5. Sur quoi repose la note (méthodologie, sans dévoiler le barème) */}
          <Section title="Sur quoi repose cette note">
            <Text style={styles.paragraph}>
              La note reflète les ingrédients réellement présents dans la formule
              et la place qu'ils occupent dans la liste.
            </Text>
            <Text style={styles.paragraph}>
              Chaque ingrédient est apprécié au regard de la réglementation
              européenne des cosmétiques (Règlement CE 1223/2009) et des travaux
              d'organismes de référence comme l'ANSES, l'ANSM, le Comité
              scientifique européen pour la sécurité des consommateurs (SCCS) ou
              l'Agence européenne des produits chimiques (ECHA).
            </Text>
            <Text style={styles.paragraph}>
              Plus un ingrédient est encadré, discuté ou signalé comme préoccupant
              par ces sources, plus il influence la note. Une formule composée
              d'ingrédients bien tolérés s'en sort donc mieux.
            </Text>
            <Text style={styles.footnote}>
              Pour les produits déjà référencés, la note provient d'une base
              d'évaluation spécialisée. Pour les produits trouvés hors base, elle
              est estimée à partir de leur composition. Une note basse ne veut pas
              dire « mauvais produit » : elle signale surtout la présence
              d'ingrédients qui font débat.
            </Text>
          </Section>

          {/* 6. Sources officielles (liens externes vers les vraies pages) */}
          <Section title="Sources officielles">
            <Text style={styles.paragraph}>
              Pour aller plus loin, consulte directement les textes et organismes
              de référence :
            </Text>
            <View style={styles.resources}>
              {RESOURCES.map((r, i) => (
                <ResourceRow key={r.url} {...r} showDivider={i < RESOURCES.length - 1} />
              ))}
            </View>
          </Section>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

const COLOR_LABEL: Record<ColorRating | 'unknown', string> = {
  vert: 'verts',
  jaune: 'jaunes',
  orange: 'orange',
  rouge: 'rouges',
  unknown: 'non reconnus',
}

// ── Sous-composants ──────────────────────────────────────────────────────────

const Section: FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
)

/** Barre 0-20 à 5 segments + repères moyenne (tick) et produit (point). */
const SimilarBar: FC<{ score: number; avg: number }> = ({ score, avg }) => {
  const SEGMENTS = [
    colors.rating.rouge.DEFAULT,
    colors.rating.orange.DEFAULT,
    colors.rating.jaune.DEFAULT,
    '#A3D977',
    colors.rating.vert.DEFAULT,
  ]
  return (
    <View style={styles.gauge}>
      <View style={styles.gaugeTrack}>
        {SEGMENTS.map((c, i) => (
          <View key={i} style={[styles.gaugeSeg, { backgroundColor: c }]} />
        ))}
        {/* repère moyenne */}
        <View style={[styles.gaugeAvg, { left: pctLeft(avg) }]} />
        {/* repère produit */}
        <View style={[styles.gaugeDot, { left: pctLeft(score) }]} />
      </View>
      <View style={styles.gaugeScale}>
        <Text style={styles.gaugeScaleText}>À éviter</Text>
        <Text style={styles.gaugeScaleText}>Très bien</Text>
      </View>
      <View style={styles.gaugeLegend}>
        <View style={styles.gaugeLegendItem}>
          <View style={styles.gaugeLegendDot} />
          <Text style={styles.gaugeLegendText}>Ce produit</Text>
        </View>
        <View style={styles.gaugeLegendItem}>
          <View style={styles.gaugeLegendTick} />
          <Text style={styles.gaugeLegendText}>Moyenne de la catégorie</Text>
        </View>
      </View>
    </View>
  )
}

/** Barre empilée des proportions de couleurs. */
const ProportionBar: FC<{ counts: Record<ColorRating | 'unknown', number>; total: number }> = ({
  counts,
  total,
}) => (
  <View style={styles.propBar}>
    {COLOR_ORDER.map((k) => {
      const n = counts[k] ?? 0
      if (n === 0) return null
      return (
        <View
          key={k}
          style={{ flex: n / total, backgroundColor: COLOR_DOT[k] }}
        />
      )
    })}
  </View>
)

/** Ligne « source officielle » : ouvre l'URL réelle dans le navigateur. */
const ResourceRow: FC<{
  label: string
  sub: string
  url: string
  showDivider: boolean
}> = ({ label, sub, url, showDivider }) => (
  <Pressable
    onPress={() => void Linking.openURL(url)}
    style={({ pressed }) => [
      styles.resourceRow,
      showDivider && styles.resourceDivider,
      pressed && { opacity: 0.55 },
    ]}
    accessibilityRole="link"
    accessibilityLabel={`Ouvrir ${label}`}
  >
    <View style={styles.resourceText}>
      <Text style={styles.resourceLabel}>{label}</Text>
      <Text style={styles.resourceSub}>{sub}</Text>
    </View>
    <Ionicons name="open-outline" size={18} color={colors.inkMuted} />
  </Pressable>
)

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
  headerTitle: { fontFamily: fontFamilies.semiBold, fontSize: 17, color: colors.ink, flex: 1 },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray100,
  },
  content: { padding: spacing.base, paddingBottom: spacing.xl, gap: spacing.lg },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  sectionTitle: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink },
  paragraph: {
    fontFamily: fontFamilies.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.inkMuted,
  },
  bold: { fontFamily: fontFamilies.semiBold, color: colors.ink },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.base },
  scoreText: { flex: 1 },
  compareNote: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkMuted,
  },
  // Gauge
  gauge: { marginVertical: spacing.sm },
  gaugeTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'visible',
    position: 'relative',
  },
  gaugeSeg: { flex: 1, height: 10 },
  gaugeAvg: {
    position: 'absolute',
    top: -4,
    width: 2,
    height: 18,
    marginLeft: -1,
    backgroundColor: colors.ink,
    borderRadius: 1,
  },
  gaugeDot: {
    position: 'absolute',
    top: -3,
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.ink,
  },
  gaugeScale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  gaugeScaleText: { fontFamily: fontFamilies.medium, fontSize: 11, color: colors.inkLight },
  gaugeLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.base, marginTop: 10 },
  gaugeLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gaugeLegendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.ink,
  },
  gaugeLegendTick: { width: 2, height: 14, backgroundColor: colors.ink, borderRadius: 1 },
  gaugeLegendText: { fontFamily: fontFamilies.regular, fontSize: 11.5, color: colors.inkMuted },
  // Proportion bar
  propBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    marginVertical: spacing.sm,
  },
  countChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  countChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countDot: { width: 10, height: 10, borderRadius: 5 },
  countChipText: { fontFamily: fontFamilies.medium, fontSize: 12.5, color: colors.ink },
  // Legend
  legend: { gap: spacing.md, marginTop: 4 },
  legendRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  legendDot: { width: 16, height: 16, borderRadius: 8, marginTop: 2 },
  legendText: { flex: 1, minWidth: 0 },
  legendTitle: { fontFamily: fontFamilies.semiBold, fontSize: 13.5, color: colors.ink },
  legendDesc: {
    fontFamily: fontFamilies.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.inkMuted,
    marginTop: 1,
  },
  footnote: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkLight,
    marginTop: spacing.sm,
  },
  // Sources
  resources: { marginTop: 4 },
  resourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  resourceDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resourceText: { flex: 1, minWidth: 0 },
  resourceLabel: { fontFamily: fontFamilies.medium, fontSize: 14, color: colors.ink },
  resourceSub: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkMuted,
    marginTop: 2,
  },
})

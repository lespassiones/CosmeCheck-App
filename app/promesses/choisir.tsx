/**
 * ChoisirPromesseScreen — page intermédiaire "Promesses vs Formule".
 *
 * Atteinte depuis la tuile "Promesses vs Formule" du dashboard. Demande à
 * l'utilisateur COMMENT il veut identifier le produit dont il veut vérifier la
 * promesse, via 4 boutons verticaux :
 *   1. Rechercher le produit        → recherche catalogue (scan mode=search)
 *   2. Scanner le produit           → scan code-barres (scan mode=barcode)
 *   3. Récupérer dans l'historique  → onglet Historique (CTA "Analyser la promesse")
 *   4. Coller moi-même la promesse   → assistant manuel (/promesses/nouvelle)
 */

import { type FC } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'

import { BackgroundGlow } from '@/components/design/BackgroundGlow'
import { Reveal } from '@/components/design/Reveal'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies, typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { db } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

interface Choice {
  key: string
  title: string
  subtitle: string
  icon: keyof typeof Ionicons.glyphMap
  tint: string
  tintBg: string
  onPress: () => void
}

const CHOICES: Choice[] = [
  {
    key: 'search',
    title: 'Rechercher le produit',
    subtitle: 'Trouve le produit dans notre catalogue',
    icon: 'search-outline',
    tint: colors.accent,
    tintBg: colors.accentSoft,
    onPress: () =>
      router.push({
        pathname: ROUTES.TABS.SCAN,
        params: { mode: 'search', returnTo: ROUTES.PROMESSES.CHOISIR },
      }),
  },
  {
    key: 'scan',
    title: 'Scanner le produit',
    subtitle: 'Scanne le code-barres avec ta caméra',
    icon: 'barcode-outline',
    tint: colors.rose,
    tintBg: colors.roseSoft,
    onPress: () =>
      router.push({
        pathname: ROUTES.TABS.SCAN,
        params: { mode: 'barcode', returnTo: ROUTES.PROMESSES.CHOISIR },
      }),
  },
  {
    key: 'history',
    title: 'Récupérer dans l’historique',
    subtitle: 'Choisis un produit déjà analysé',
    icon: 'time-outline',
    tint: colors.verdict.tenue.text,
    tintBg: colors.verdict.tenue.soft,
    onPress: () =>
      router.push({
        pathname: ROUTES.TABS.HISTORY,
        params: { returnTo: ROUTES.PROMESSES.CHOISIR },
      }),
  },
  {
    key: 'paste',
    title: 'Coller moi-même la promesse',
    subtitle: 'Saisis le texte marketing à vérifier',
    icon: 'create-outline',
    tint: colors.ink,
    tintBg: colors.gray100,
    onPress: () => router.push(ROUTES.PROMESSES.NOUVELLE),
  },
]

const ChoisirPromesseScreen: FC = () => {
  const { user } = useAuth()
  const userId = user?.id ?? null

  // Compte neuf = aucune analyse dans l'historique -> on masque l'option
  // « Récupérer dans l'historique » (il n'y a rien à récupérer). Dès qu'une
  // analyse existe, les 4 options s'affichent tel quel.
  const { data: hasHistory = false } = useQuery<boolean>({
    queryKey: ['has-analyses', userId],
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!userId) return false
      const { count, error } = await db()
        .from('analyses')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
      if (error) throw error
      return (count ?? 0) > 0
    },
  })

  const choices = hasHistory ? CHOICES : CHOICES.filter((c) => c.key !== 'history')

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <BackgroundGlow variant="minimal" />

      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          Promesses vs Formule
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <Text style={styles.h1}>Quelle promesse veux-tu vérifier ?</Text>
          <Text style={styles.introSub}>
            Choisis comment identifier le produit dont tu veux confronter la promesse à sa formule réelle.
          </Text>
        </View>

        <Reveal stagger={70} duration={400} style={styles.list}>
          {choices.map((c) => (
            <Pressable
              key={c.key}
              onPress={c.onPress}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel={c.title}
            >
              <View style={[styles.iconWrap, { backgroundColor: c.tintBg }]}>
                <Ionicons name={c.icon} size={22} color={c.tint} />
              </View>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>{c.title}</Text>
                <Text style={styles.rowSub}>{c.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.inkLight} />
            </Pressable>
          ))}
        </Reveal>
      </ScrollView>
    </SafeAreaView>
  )
}

export default ChoisirPromesseScreen

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backBtn: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  topTitle: { ...typography.h4, color: colors.ink },
  scroll: { paddingHorizontal: spacing.base, paddingBottom: spacing['4xl'] },
  intro: { paddingTop: spacing.xs, paddingBottom: spacing.lg },
  h1: { ...typography.h2, color: colors.ink },
  introSub: { ...typography.xs, color: colors.inkMuted, marginTop: spacing.sm, lineHeight: 18 },
  list: { gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  rowPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  iconWrap: { width: 44, height: 44, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fontFamilies.semiBold, fontSize: 15, color: colors.ink },
  rowSub: { fontFamily: fontFamilies.regular, fontSize: 12, color: colors.inkMuted, marginTop: 2, lineHeight: 16 },
})

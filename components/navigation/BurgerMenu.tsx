/**
 * BurgerMenu — bouton burger flottant (haut-droite) + drawer modal qui glisse
 * depuis la droite, twin du web (CosmetWiki MobileBurgerMenu).
 *
 * Le drawer reprend la liste complète des items de nav (Accueil, Routine,
 * Promesses, Beauty Advisor, Historique, Offre, Profil) — donc les pages qui
 * ne tiennent pas dans les 5 slots de la barre du bas — plus la CreditsPill,
 * une carte d'upsell Premium et une action de déconnexion (useAuth signOut).
 *
 * Animation : translateX du drawer (~220ms) + fondu du backdrop, via Reanimated
 * et désactivés si reduce-motion est actif (motion.ts).
 */

import { type FC, useCallback, useEffect, useState } from 'react'
import {
  AccessibilityInfo,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter, usePathname } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  ClockIcon,
  CloseIcon,
  DiamondIcon,
  HomeIcon,
  LayersIcon,
  LogoutIcon,
  MenuIcon,
  PromisesIcon,
  SparklesIcon,
  UserIcon,
} from '@/components/navigation/NavIcons'
import { colors } from '@/constants/colors'
import { easings } from '@/constants/motion'
import { radius } from '@/constants/spacing'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/useAuth'

type IconCmp = FC<{ size?: number; color?: string }>

type NavItem = {
  href: string
  matchPrefix: string
  label: string
  Icon: IconCmp
}

// Liste complète, ordre identique au web AppShell NAV_ITEMS.
const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: ROUTES.TABS.HOME, matchPrefix: '/(tabs)', label: 'Accueil', Icon: HomeIcon },
  { href: ROUTES.TABS.ROUTINE, matchPrefix: '/routine', label: 'Routine', Icon: LayersIcon },
  { href: ROUTES.TABS.PROMESSES, matchPrefix: '/promesses', label: 'Promesses', Icon: PromisesIcon },
  { href: ROUTES.ADVISOR.INDEX, matchPrefix: '/advisor', label: 'Beauty Advisor', Icon: SparklesIcon },
  { href: ROUTES.TABS.HISTORY, matchPrefix: '/history', label: 'Historique', Icon: ClockIcon },
  { href: ROUTES.OFFRE.INDEX, matchPrefix: '/offre', label: 'Offre', Icon: DiamondIcon },
  { href: ROUTES.PROFILE.INDEX, matchPrefix: '/profile', label: 'Profil', Icon: UserIcon },
]

const SCREEN_W = Dimensions.get('window').width
const DRAWER_W = Math.min(320, SCREEN_W * 0.78)

export const BurgerMenu: FC = () => {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const pathname = usePathname() ?? '/'
  const { signOut } = useAuth()

  const [open, setOpen] = useState(false)
  // `mounted` garde la Modal montée le temps de l'animation de fermeture.
  const [mounted, setMounted] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)

  const translateX = useSharedValue(DRAWER_W)
  const backdrop = useSharedValue(0)

  useEffect(() => {
    let isMounted = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => isMounted && setReduceMotion(v))
      .catch(() => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) =>
      setReduceMotion(v),
    )
    return () => {
      isMounted = false
      sub.remove()
    }
  }, [])

  const timing = useCallback(
    (toValue: number, onDone?: () => void) =>
      withTiming(
        toValue,
        { duration: reduceMotion ? 0 : 220, easing: easings.reveal },
        (finished) => {
          if (finished && onDone) runOnJS(onDone)()
        },
      ),
    [reduceMotion],
  )

  const openDrawer = useCallback(() => {
    setMounted(true)
    setOpen(true)
    backdrop.value = withTiming(1, { duration: reduceMotion ? 0 : 180, easing: Easing.out(Easing.ease) })
    translateX.value = timing(0)
  }, [backdrop, translateX, timing, reduceMotion])

  const closeDrawer = useCallback(() => {
    setOpen(false)
    backdrop.value = withTiming(0, { duration: reduceMotion ? 0 : 180, easing: Easing.out(Easing.ease) })
    translateX.value = timing(DRAWER_W, () => setMounted(false))
  }, [backdrop, translateX, timing, reduceMotion])

  // Navigue puis ferme le drawer.
  const go = useCallback(
    (href: string) => {
      closeDrawer()
      // Laisse l'animation de fermeture démarrer avant le changement de route.
      router.push(href as never)
    },
    [closeDrawer, router],
  )

  const handleLogout = useCallback(() => {
    closeDrawer()
    void signOut()
  }, [closeDrawer, signOut])

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value,
  }))

  const isActive = (item: NavItem) =>
    item.href === ROUTES.TABS.HOME
      ? pathname === '/' || pathname === '/(tabs)'
      : pathname.startsWith(item.matchPrefix)

  return (
    <>
      {/* Bouton burger flottant — haut-droite, au-dessus du contenu. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ouvrir le menu"
        onPress={openDrawer}
        style={[styles.burger, { top: insets.top + 8 }]}
        hitSlop={6}
      >
        <MenuIcon size={20} color={colors.ink} />
      </Pressable>

      <Modal
        visible={mounted}
        transparent
        animationType="none"
        onRequestClose={closeDrawer}
        statusBarTranslucent
      >
        <View style={styles.overlay}>
          {/* Backdrop assombri — tap pour fermer. */}
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
            <Pressable
              accessibilityLabel="Fermer le menu"
              style={StyleSheet.absoluteFill}
              onPress={closeDrawer}
            />
          </Animated.View>

          {/* Drawer — glisse depuis la droite. */}
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.drawer,
              { width: DRAWER_W, paddingTop: insets.top },
              drawerStyle,
            ]}
          >
            {/* Header logo + fermeture */}
            <View style={styles.header}>
              <Text style={styles.logo}>
                <Text style={styles.logoInk}>Cosme </Text>
                <Text style={styles.logoRose}>Check</Text>
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fermer"
                onPress={closeDrawer}
                style={styles.closeBtn}
                hitSlop={6}
              >
                <CloseIcon size={20} color={colors.ink} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.nav}
              contentContainerStyle={[styles.navContent, { paddingBottom: insets.bottom + 16 }]}
              showsVerticalScrollIndicator={false}
            >
              {/* Items de navigation */}
              <View style={styles.itemList}>
                {NAV_ITEMS.map((item) => {
                  const active = isActive(item)
                  return (
                    <Pressable
                      key={item.href}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => go(item.href)}
                      style={[styles.item, active && styles.itemActive]}
                    >
                      <item.Icon size={20} color={active ? colors.ink : '#4B5563'} />
                      <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              {/* Bloc bas : crédits + upsell Premium + déconnexion */}
              <View style={styles.bottomBlock}>
                <View style={styles.creditsRow}>
                  <Text style={styles.creditsLabel}>Vos crédits restants</Text>
                  <CreditsPill />
                </View>

                {!pathname.startsWith('/offre') && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Passez Premium"
                    onPress={() => go(ROUTES.OFFRE.INDEX)}
                    style={styles.premiumCard}
                  >
                    <View style={styles.premiumHead}>
                      <DiamondIcon size={16} color={colors.rose} />
                      <Text style={styles.premiumTitle}>Passez Premium</Text>
                    </View>
                    <Text style={styles.premiumDesc}>
                      Analyses illimitées et fonctionnalités avancées.
                    </Text>
                    <LinearGradient
                      colors={['#F43F5E', '#EC4899']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.premiumCta}
                    >
                      <Text style={styles.premiumCtaText}>Découvrir</Text>
                    </LinearGradient>
                  </Pressable>
                )}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Se déconnecter"
                  onPress={handleLogout}
                  style={styles.logoutBtn}
                >
                  <LogoutIcon size={16} color="#BE123C" />
                  <Text style={styles.logoutText}>Se déconnecter</Text>
                </Pressable>
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </>
  )
}

/**
 * CreditsPill — pilule de crédits style pièce d'or, twin du web CreditsPill.
 * Sans backend branché ici (pas d'/api/credits côté mobile) on affiche un
 * placeholder neutre ; le composant se câblera quand l'API crédits existera.
 */
const CreditsPill: FC = () => (
  <View style={styles.pill}>
    <View style={styles.coin}>
      <Text style={styles.coinText}>C</Text>
    </View>
    <Text style={styles.pillCount}>—</Text>
    <View style={styles.pillPlus}>
      <Text style={styles.pillPlusText}>+</Text>
    </View>
  </View>
)

const styles = StyleSheet.create({
  burger: {
    position: 'absolute',
    right: 12,
    zIndex: 40,
    height: 44,
    width: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
  },
  overlay: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FAFAFA',
    shadowColor: '#0F172A',
    shadowOffset: { width: -12, height: 0 },
    shadowOpacity: 0.30,
    shadowRadius: 40,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  logo: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  logoInk: { color: '#111111' },
  logoRose: { color: colors.rose },
  closeBtn: {
    height: 36,
    width: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nav: {
    flex: 1,
  },
  navContent: {
    paddingHorizontal: 12,
    paddingTop: 16,
    flexGrow: 1,
  },
  itemList: {
    gap: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.lg,
  },
  itemActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
    elevation: 2,
  },
  itemLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
  },
  itemLabelActive: {
    color: '#111111',
    fontWeight: '700',
  },
  bottomBlock: {
    marginTop: 'auto',
    paddingTop: 16,
    gap: 12,
  },
  creditsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  creditsLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.inkMuted,
  },
  // ── CreditsPill ──
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.30)',
    paddingLeft: 6,
    paddingRight: 4,
    paddingVertical: 4,
  },
  coin: {
    height: 18,
    width: 18,
    borderRadius: 9,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#7C2D12',
  },
  pillCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFBEB',
  },
  pillPlus: {
    height: 22,
    width: 22,
    borderRadius: 11,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillPlusText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#451A03',
    lineHeight: 16,
  },
  // ── Premium upsell ──
  premiumCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.roseSoft,
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.40)',
    padding: 16,
  },
  premiumHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  premiumTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.rose,
  },
  premiumDesc: {
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(159,18,57,0.80)',
  },
  premiumCta: {
    marginTop: 12,
    borderRadius: radius.full,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumCtaText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.surface,
  },
  // ── Logout ──
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.lg,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    paddingVertical: 12,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#BE123C',
  },
})

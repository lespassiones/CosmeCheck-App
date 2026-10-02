/**
 * TabsLayout — layout principal de l'app avec la BottomTabBar custom.
 *
 * Déclare les 5 écrans : index (Accueil), routine, scan (bouton central de la
 * barre), history (Analyses / Favoris / Promesses), profil. Aucun header natif.
 *
 * Plus de menu latéral (supprimé le 28/09/2026) : le Profil est un onglet de
 * la barre et regroupe ce que le menu contenait (crédits, offre, annuaire des
 * ingrédients, déconnexion).
 *
 * Monte le bouton flottant Beauty Advisor (bas-droite, au-dessus de la barre), avec
 *     la mascotte Perle dedans. Masqué sur /scan. Le tap ouvre l'Advisor en
 *     cercle qui grandit depuis Perle (`AdvisorReveal`), et le retour s'y referme.
 */

import { useCallback, useEffect, type FC } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { Tabs, useRouter, usePathname } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  ADVISOR_FAB_GAP,
  ADVISOR_FAB_SIZE,
  BottomTabBar,
  TAB_BAR_HEIGHT,
} from '@/components/navigation/BottomTabBar'
import { AdvisorFAB } from '@/components/navigation/AdvisorFAB'
import { AdvisorRevealOverlay, useAdvisorReveal } from '@/components/navigation/AdvisorReveal'
import { ROUTES } from '@/constants/routes'
import { askAdsConsentOnce } from '@/lib/ads/metaAds'

// Laisse l'accueil s'afficher avant la question (et une éventuelle page ouverte
// par-dessus à la fin de l'onboarding).
const ADS_CONSENT_DELAY_MS = 5000

const FAB_SIZE = ADVISOR_FAB_SIZE
const FAB_RIGHT = 16

const TabsLayout: FC = () => {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const pathname = usePathname()
  // Masqué pendant le scan (caméra plein écran, recherche, saisie) : il ne doit pas gêner.
  const onScan = pathname?.includes('/scan') ?? false
  // Bouton flottant calé 16 px au-dessus de la barre d'onglets.
  const fabBottom = Math.max(insets.bottom, 8) + TAB_BAR_HEIGHT + ADVISOR_FAB_GAP

  // Mesure publicitaire Meta : filet pour les comptes déjà inscrits qui ne
  // repassent pas par l'onboarding. Sans effet si déjà répondu.
  useEffect(() => {
    const t = setTimeout(() => void askAdsConsentOnce(), ADS_CONSENT_DELAY_MS)
    return () => clearTimeout(t)
  }, [])

  const openAdvisor = useCallback(() => router.push(ROUTES.ADVISOR.INDEX), [router])
  const reveal = useAdvisorReveal({
    onNavigate: openAdvisor,
    fabRight: FAB_RIGHT,
    fabBottom,
    fabSize: FAB_SIZE,
  })

  return (
    <View style={styles.root} onLayout={reveal.onLayout}>
      <Tabs
        tabBar={(props) => <BottomTabBar {...props} />}
        // PAS de freezeOnBlur (retiré le 29/09/2026) : react-native-screens 4.16
        // peut geler un onglet dans le même rendu que sa désactivation (deux taps
        // rapprochés), la vue native reste « au premier plan » et la barre affiche
        // Accueil sur le contenu de Routine, sans retour possible (issue #4518).
        // Les boucles décoratives se coupent via useScreenActive.
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
        <Tabs.Screen name="routine" options={{ title: 'Routine' }} />
        <Tabs.Screen name="scan" options={{ title: 'Scan' }} />
        <Tabs.Screen name="history" options={{ title: 'Historique' }} />
        <Tabs.Screen name="profil" options={{ title: 'Profil' }} />
      </Tabs>

      {/* Les vagues de l'ouverture : au-dessus des onglets, sous le bouton. */}
      <AdvisorRevealOverlay reveal={reveal} />

      {!onScan && (
        <Animated.View style={[styles.advisorBtn, { bottom: fabBottom }, reveal.fabStyle]}>
          <AdvisorFAB onPress={reveal.open} size={FAB_SIZE} />
        </Animated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  advisorBtn: {
    position: 'absolute',
    right: FAB_RIGHT,
    zIndex: 75,
  },
})

export default TabsLayout

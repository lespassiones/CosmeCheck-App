/**
 * TabsLayout — layout principal de l'app avec la BottomTabBar custom.
 *
 * Déclare les 5 écrans dans l'ordre de la barre : index (Accueil), routine,
 * scan (FAB central), history, promesses. Aucun header natif.
 *
 * Monte aussi la chrome de navigation qui flotte au-dessus des écrans :
 *   - BurgerMenu : bouton burger haut-droite + drawer (pages hors barre).
 *   - Bouton flottant Beauty Advisor (gold-sparkle) au-dessus de la barre,
 *     masqué sur /advisor — twin du web AppShell.
 */

import type { FC } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Tabs, useRouter, usePathname } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BottomTabBar } from '@/components/navigation/BottomTabBar'
import { BurgerMenu } from '@/components/navigation/BurgerMenu'
import { colors } from '@/constants/colors'
import { ROUTES } from '@/constants/routes'

const TabsLayout: FC = () => {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const pathname = usePathname()
  // Masqué pendant le scan (caméra plein écran) : le bouton ne doit pas gêner.
  const onScan = pathname?.includes('/scan') ?? false

  return (
    <View style={styles.root}>
      <Tabs
        tabBar={(props) => <BottomTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
        <Tabs.Screen name="routine" options={{ title: 'Routine' }} />
        <Tabs.Screen name="scan" options={{ title: 'Décode' }} />
        <Tabs.Screen name="history" options={{ title: 'Historique' }} />
        <Tabs.Screen name="promesses" options={{ title: 'Promesses' }} />
      </Tabs>

      {/* Bouton burger flottant (haut-droite) + drawer */}
      <BurgerMenu />

      {/* Bouton flottant Beauty Advisor — clair + icône chatbot.
          Masqué pendant le scan (caméra plein écran). */}
      {!onScan && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ouvrir Beauty Advisor"
          onPress={() => router.push(ROUTES.ADVISOR.INDEX)}
          style={[styles.advisorBtn, { bottom: insets.bottom + 88 }]}
          hitSlop={6}
        >
          <View style={styles.advisorInner}>
            <Ionicons name="chatbubble-ellipses" size={22} color={colors.rose} />
          </View>
        </Pressable>
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
    right: 16,
    zIndex: 75,
    height: 48,
    width: 48,
    borderRadius: 24,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
  },
  advisorInner: {
    flex: 1,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
})

export default TabsLayout

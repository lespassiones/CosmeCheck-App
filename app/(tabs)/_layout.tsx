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
import { Tabs, useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BottomTabBar } from '@/components/navigation/BottomTabBar'
import { BurgerMenu } from '@/components/navigation/BurgerMenu'
import { SparklesIcon } from '@/components/navigation/NavIcons'
import { gradients } from '@/constants/gradients'
import { ROUTES } from '@/constants/routes'

const TabsLayout: FC = () => {
  const router = useRouter()
  const insets = useSafeAreaInsets()

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

      {/* Bouton flottant Beauty Advisor — au-dessus de la barre du bas.
          (Toujours visible dans les tabs : /advisor est une route hors-tabs.) */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ouvrir Beauty Advisor"
        onPress={() => router.push(ROUTES.ADVISOR.INDEX)}
        style={[
          styles.advisorBtn,
          { bottom: insets.bottom + 88 },
        ]}
        hitSlop={6}
      >
        <LinearGradient
          colors={gradients.darkGlass.colors}
          start={gradients.darkGlass.start}
          end={gradients.darkGlass.end}
          style={styles.advisorGradient}
        >
          <SparklesIcon size={20} color="#FBBF24" />
        </LinearGradient>
      </Pressable>
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
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  advisorGradient: {
    flex: 1,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
})

export default TabsLayout

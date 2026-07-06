/**
 * BottomTabBar — twin de la nav mobile web (CosmetWiki AppShell MobileBottomNav).
 *
 * Une PILULE flottante arrondie (rounded-full) — pas une barre plate :
 *   - fond dégradé rose/pink (gradients.bottomNavPill)
 *   - anneau blanc (ring-1 white/70 → border)
 *   - halo rose doux (surfaceShadows.bottomNavPill)
 *   - max-width centrée, posée au-dessus de la safe-area
 *
 * 5 emplacements : Accueil · Routine · [Décode FAB centré, surélevé] ·
 * Historique · Promesses. L'item actif voit son icône dans une pilule rose
 * givrée (#FFD1DC, double-ombre néomorphique) + label rose ; inactif = atténué.
 *
 * Choix d'icônes alignés sur le web : home, layers (Routine), clock
 * (Historique), document/ribbon (Promesses).
 */

import { type FC, useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'

import {
  ClockIcon,
  HomeIcon,
  LayersIcon,
  PromisesIcon,
} from '@/components/navigation/NavIcons'
import { ScanFAB } from '@/components/navigation/ScanFAB'
import { ScanMethodSheet, type ScanMethod } from '@/components/scan/ScanMethodSheet'
import { surfaceShadows } from '@/constants/shadows'
import { radius } from '@/constants/spacing'

type IconCmp = FC<{ size?: number; color?: string }>

/** Métadonnées d'affichage par nom de route (le fichier d'écran). */
const TAB_META: Record<string, { label: string; Icon: IconCmp }> = {
  index: { label: 'Accueil', Icon: HomeIcon },
  routine: { label: 'Routine', Icon: LayersIcon },
  history: { label: 'Historique', Icon: ClockIcon },
  promesses: { label: 'Promesses', Icon: PromisesIcon },
}

// Couleurs reprises du web : actif #F43F5E, inactif #4B5563.
const ACTIVE = '#F43F5E'
const INACTIVE = '#4B5563'

export const BottomTabBar: FC<BottomTabBarProps> = ({ state, navigation }) => {
  const insets = useSafeAreaInsets()
  const [pickerOpen, setPickerOpen] = useState(false)

  const activeName = state.routes[state.index]?.name

  // Items normaux (sans le slot scan, inséré au centre).
  const items = useMemo(
    () => state.routes.filter((r) => r.name !== 'scan'),
    [state.routes],
  )

  const left = items.slice(0, 2)
  const right = items.slice(2)

  const renderTab = (routeName: string, routeKey: string) => {
    const meta = TAB_META[routeName]
    if (!meta) return null
    const focused = activeName === routeName
    const { Icon } = meta
    const tint = focused ? ACTIVE : INACTIVE

    const onPress = () => {
      Haptics.selectionAsync().catch(() => {})
      const event = navigation.emit({
        type: 'tabPress',
        target: routeKey,
        canPreventDefault: true,
      })
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(routeName)
      }
    }

    return (
      <Pressable
        key={routeKey}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
        onPress={onPress}
        style={styles.tab}
        hitSlop={6}
      >
        {/* L'item actif obtient sa propre petite pilule rose givrée. */}
        <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
          <Icon size={20} color={tint} />
        </View>
        <Text
          allowFontScaling={false}
          style={[styles.label, focused ? styles.labelActive : null, { color: tint }]}
        >
          {meta.label}
        </Text>
      </Pressable>
    )
  }

  const openMethodPicker = () => {
    setPickerOpen(true)
  }

  const handleMethodSelect = useCallback(
    (method: ScanMethod) => {
      setPickerOpen(false)
      const scanRoute = state.routes.find((r) => r.name === 'scan')
      if (scanRoute) {
        navigation.navigate(scanRoute.name, { mode: method })
      }
    },
    [navigation, state.routes],
  )

  const scanFocused = activeName === 'scan'

  // Scan code-barres = plein écran immersif (comme INCI Beauty) : on masque la
  // navbar pendant le scan caméra. Les autres modes gardent la barre.
  const scanMode = (state.routes.find((r) => r.name === 'scan')?.params as { mode?: string } | undefined)?.mode
  if (scanFocused && scanMode === 'barcode') return null

  return (
    <View
      style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}
      pointerEvents="box-none"
    >
      <View style={styles.centered} pointerEvents="box-none">
        {/* La pilule — fond blanc opaque, pas de blur ni gradient. */}
        <View style={styles.pillShadow}>
          <View style={styles.pillClip}>
            <View style={styles.row}>
              {left.map((r) => renderTab(r.name, r.key))}
              {/* Réserve la place du FAB central (le FAB lui-même flotte au-dessus). */}
              <View style={styles.fabGap} aria-hidden />
              {right.map((r) => renderTab(r.name, r.key))}
            </View>
          </View>
        </View>

        {/* FAB central « Décode » — surélevé, chevauche le haut de la pilule. */}
        <View style={styles.fabLift} pointerEvents="box-none">
          <ScanFAB onPress={openMethodPicker} focused={scanFocused} />
        </View>
      </View>

      <ScanMethodSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleMethodSelect}
      />
    </View>
  )
}

const PILL_HEIGHT = 66
const PILL_MAX_WIDTH = 420 // ~ max-w-md du web

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  centered: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: PILL_MAX_WIDTH,
    alignItems: 'center',
  },
  // Vue d'ombre séparée du clip arrondi (overflow:hidden coupe l'ombre).
  pillShadow: {
    width: '100%',
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
    ...surfaceShadows.bottomNavPill,
  },
  pillClip: {
    width: '100%',
    height: PILL_HEIGHT,
    borderRadius: radius.full,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingVertical: 4,
  },
  iconWrap: {
    height: 32,
    width: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Bulle ronde rose givrée pour l'item actif — vrai cercle surélevé,
  // ombre douce et symétrique pour un effet "soft button" (pas carré).
  iconWrapActive: {
    height: 40,
    width: 40,
    borderRadius: 20,
    backgroundColor: '#FFD1DC',
    shadowColor: '#E8A8B4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
    elevation: 5,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: -0.1,
    lineHeight: 12,
  },
  labelActive: {
    fontWeight: '700',
  },
  fabGap: {
    width: 64,
    height: 64,
  },
  // Le FAB flotte au centre, débordant vers le haut (-top-6 du web ≈ 24px).
  fabLift: {
    position: 'absolute',
    top: -24,
    alignSelf: 'center',
  },
})

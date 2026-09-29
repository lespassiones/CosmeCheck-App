/**
 * BottomTabBar : barre d'onglets COLLÉE en bas de l'écran (28/09/2026).
 *
 * Elle ne flotte plus : fond blanc sur toute la largeur, coins du haut arrondis
 * (24 px), ombre noire vers le haut, et elle descend jusqu'au bord de l'écran
 * (la zone du geste système est incluse dans son fond). Les onglets restent
 * centrés sur 520 px au plus.
 *
 * 5 emplacements : Accueil · Routine · [Scan, bouton central surélevé qui
 * ouvre le choix de méthode] · Historique · Profil (Profil a remplacé
 * Promesses le 28/09/2026 ; les promesses vivent dans l'Historique). Le Beauty Advisor est
 * le bouton flottant à droite, avec Perle dedans (`app/(tabs)/_layout.tsx`).
 * L'item actif voit son icône se REMPLIR de rose (variante `filled` de
 * NavIcons, sans pastille autour) + label rose gras ; inactif = contour gris.
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
  UserIcon,
} from '@/components/navigation/NavIcons'
import { ScanFAB } from '@/components/navigation/ScanFAB'
import { ScanMethodSheet, type ScanMethod } from '@/components/scan/ScanMethodSheet'

type IconCmp = FC<{ size?: number; color?: string; filled?: boolean }>

/** Métadonnées d'affichage par nom de route (le fichier d'écran). */
const TAB_META: Record<string, { label: string; Icon: IconCmp }> = {
  index: { label: 'Accueil', Icon: HomeIcon },
  routine: { label: 'Routine', Icon: LayersIcon },
  history: { label: 'Historique', Icon: ClockIcon },
  profil: { label: 'Profil', Icon: UserIcon },
}

// Couleurs reprises du web : actif #F43F5E, inactif #4B5563.
const ACTIVE = '#F43F5E'
const INACTIVE = '#4B5563'

/** Hauteur de la barre hors zone du geste système (le bouton flottant s'y cale). */
export const TAB_BAR_HEIGHT = 66
/** Bouton flottant Perle (Beauty Advisor), calé au-dessus de la barre. */
export const ADVISOR_FAB_SIZE = 56
export const ADVISOR_FAB_GAP = 16
/**
 * Marge basse d'un contenu d'onglet (à ajouter à insets.bottom) : barre +
 * bouton Perle + respiration, pour que la fin de chaque page puisse remonter
 * AU-DESSUS du bouton au lieu de rester cachée dessous.
 */
export const TAB_CONTENT_BOTTOM = TAB_BAR_HEIGHT + ADVISOR_FAB_GAP + ADVISOR_FAB_SIZE + 16

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
        {/* L'item actif : icône pleine, sans bloc coloré autour. */}
        <View style={styles.iconWrap}>
          <Icon size={20} color={tint} filled={focused} />
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

  const handleMethodSelect = useCallback(
    (method: ScanMethod) => {
      setPickerOpen(false)
      const scanRoute = state.routes.find((r) => r.name === 'scan')
      if (scanRoute) navigation.navigate(scanRoute.name, { mode: method })
    },
    [navigation, state.routes],
  )

  // Scan code-barres = plein écran immersif (comme INCI Beauty) : on masque la
  // navbar pendant le scan caméra. Les autres modes gardent la barre.
  const scanFocused = activeName === 'scan'
  const scanMode = (state.routes.find((r) => r.name === 'scan')?.params as { mode?: string } | undefined)?.mode
  if (scanFocused && scanMode === 'barcode') return null

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.centered} pointerEvents="box-none">
        <View style={styles.row}>
          {left.map((r) => renderTab(r.name, r.key))}
          {/* Réserve la place du bouton Scan central (il dépasse au-dessus). */}
          <View style={styles.fabGap} aria-hidden />
          {right.map((r) => renderTab(r.name, r.key))}
        </View>

        {/* Bouton central Scan, surélevé : il chevauche le haut de la barre. */}
        <View style={styles.fabLift} pointerEvents="box-none">
          <ScanFAB onPress={() => setPickerOpen(true)} focused={scanFocused} />
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

const BAR_ROW_HEIGHT = TAB_BAR_HEIGHT - 4
const BAR_MAX_WIDTH = 520

const styles = StyleSheet.create({
  // Collée au bas de l'écran, fond blanc jusqu'au bord (zone du geste incluse).
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 4,
    backgroundColor: '#FFFFFF',
    // Coins du haut arrondis ; le filet suit la courbe (haut + côtés).
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    // Ombre noire vers le haut. `boxShadow` (nouvelle architecture) suit les
    // coins arrondis sur Android comme sur iOS ; l'`elevation` d'Android, elle,
    // ne projette presque rien vers le haut.
    boxShadow: '0px -6px 20px rgba(0, 0, 0, 0.14)',
  },
  centered: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: BAR_MAX_WIDTH,
    alignItems: 'center',
  },
  row: {
    width: '100%',
    height: BAR_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
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
  // Le bouton central, débordant vers le haut de la barre.
  fabLift: {
    position: 'absolute',
    top: -26,
    alignSelf: 'center',
  },
})

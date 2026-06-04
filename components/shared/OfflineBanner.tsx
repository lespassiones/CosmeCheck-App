/**
 * OfflineBanner — bandeau « Hors ligne » affiché en haut dès que l'appareil
 * perd la connexion. Monté une fois dans `_layout`.
 *
 * Import DÉFENSIF de NetInfo : c'est un module natif. S'il n'est pas présent
 * dans le binaire (ex. APK buildé avant son ajout, ou environnement de test),
 * on dégrade en silence (pas de bannière) au lieu de crasher. Il fonctionnera
 * pleinement après un rebuild qui embarque le module.
 */

import { useEffect, useState, type FC } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'

// Chargement défensif du module natif (peut être absent du binaire).
type NetInfoModule = {
  addEventListener: (
    cb: (state: { isConnected: boolean | null }) => void,
  ) => () => void
}
let NetInfo: NetInfoModule | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  NetInfo = require('@react-native-community/netinfo').default as NetInfoModule
} catch {
  NetInfo = null
}

export const OfflineBanner: FC = () => {
  const [offline, setOffline] = useState(false)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    if (!NetInfo) return
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false)
    })
    return () => unsubscribe()
  }, [])

  if (!offline) return null

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]} pointerEvents="none">
      <Ionicons name="cloud-offline-outline" size={14} color="#FFFFFF" />
      <Text style={styles.text}>Hors ligne — vérifie ta connexion</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9998,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingBottom: 6,
    backgroundColor: colors.inkMuted,
  },
  text: {
    ...typography.xsSemiBold,
    color: '#FFFFFF',
  },
})

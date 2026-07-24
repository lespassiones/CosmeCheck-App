/**
 * SearchPromptBar — barre de recherche du dashboard avec placeholder ANIMÉ
 * « machine à écrire » qui cycle ~200 noms de produits (écrit/efface, lentement,
 * en gris clair). Purement visuelle : au tap, ouvre la recherche produit.
 *
 * Elle NE prend PAS le focus clavier (le placeholder animé serait sinon masqué) ;
 * c'est une pilule tappable qui navigue vers l'écran de recherche dédié.
 */
import { type FC, useEffect, useRef } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { radius } from '@/constants/spacing'
import { PRODUCT_TICKER } from '@/constants/productTicker'
import { useTypewriter } from '@/hooks/useTypewriter'

interface Props {
  onPress: () => void
}

export const SearchPromptBar: FC<Props> = ({ onPress }) => {
  const typed = useTypewriter(PRODUCT_TICKER)
  const caret = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(caret, { toValue: 0, duration: 480, useNativeDriver: true }),
        Animated.timing(caret, { toValue: 1, duration: 480, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [caret])

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="search"
      accessibilityLabel="Rechercher un produit"
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <Ionicons name="search" size={18} color={colors.inkMuted} style={styles.leadingIcon} />
      <View style={styles.textRow}>
        <Text style={styles.placeholder} numberOfLines={1} ellipsizeMode="clip">
          {typed}
        </Text>
        <Animated.View style={[styles.caret, { opacity: caret }]} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // Même look que SearchBar : pilule blanche, drop shadow doux.
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  pressed: { opacity: 0.85 },
  leadingIcon: { marginRight: 10 },
  textRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  placeholder: {
    flexShrink: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    color: colors.inkLight, // gris clair
  },
  caret: {
    width: 1.5,
    height: 18,
    marginLeft: 1,
    borderRadius: 1,
    backgroundColor: colors.inkLight,
  },
})

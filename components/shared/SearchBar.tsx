/**
 * SearchBar — champ de recherche neumorphique réutilisable.
 *
 * Look "inset" (enfoncé) sur fond neu.bg, icône loupe à gauche et bouton ×
 * apparaissant dès qu'il y a du texte. Contrôlé par le parent.
 *
 * Props : { value, onChangeText, placeholder?, onClear? }
 */

import { type FC, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { radius } from '@/constants/spacing'

interface Props {
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  onClear?: () => void
  style?: StyleProp<ViewStyle>
}

export const SearchBar: FC<Props> = ({
  value,
  onChangeText,
  placeholder = 'Rechercher…',
  onClear,
  style,
}) => {
  const [isFocused, setIsFocused] = useState(false)

  const handleClear = () => {
    onChangeText('')
    onClear?.()
  }

  return (
    <View style={[styles.container, isFocused && styles.focused, style]}>
      <Ionicons name="search" size={18} color={colors.inkMuted} style={styles.leadingIcon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkLight}
        style={styles.input}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="never"
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
      {value.length > 0 && (
        <Pressable hitSlop={8} onPress={handleClear} style={styles.clearBtn}>
          <Ionicons name="close-circle" size={18} color={colors.inkMuted} />
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  // Look "carte propre" : fond blanc, fine bordure et drop shadow doux comme WhiteCard.
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
  focused: {
    borderColor: colors.accent,
  },
  leadingIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    color: colors.ink,
    padding: 0,
  },
  clearBtn: {
    marginLeft: 6,
    padding: 2,
  },
})

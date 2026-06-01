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
  Platform,
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
    <View
      style={[
        styles.container,
        Platform.OS === 'ios' ? styles.inset : styles.insetAndroid,
        isFocused && styles.focused,
        style,
      ]}
    >
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
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.neu.bg,
  },
  // Effet enfoncé (inset) simulé par des ombres internes côté iOS.
  inset: {
    shadowColor: colors.neu.shadowDark,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  insetAndroid: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  focused: {
    borderColor: colors.accent,
  },
  leadingIcon: {
    marginRight: 8,
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

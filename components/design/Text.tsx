import { Text as RNText, type TextProps as RNTextProps } from 'react-native'
import { colors } from '@/constants/colors'

interface TextProps extends RNTextProps {
  children?: React.ReactNode
}

export function Text({ style, ...props }: TextProps) {
  return (
    <RNText
      {...props}
      style={[{ color: colors.ink, fontFamily: 'Inter-Regular' }, style]}
    />
  )
}

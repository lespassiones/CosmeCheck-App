/**
 * Briques visuelles de l'onboarding « Le diagnostic de Perle ».
 *
 * Toutes les couleurs viennent de `constants/colors` : blanc cassé #FAFAFA en
 * fond, cartes blanches, rose #F43F5E comme unique couleur d'action, couleurs
 * de notation réservées aux ingrédients.
 *
 * Mouvement et toucher (28/09/2026) :
 *   - chaque écran se construit sous les yeux : `StepLayout` fait entrer ses
 *     blocs un par un (titres et textes compris), avec une entrée différente
 *     selon la nature du bloc ; `Cascade` fait de même pour une liste ;
 *   - Perle apparaît dans son rond puis respire doucement ;
 *   - une option cochée vibre et sa coche se pose en fondu ;
 *   - AUCUN rebond : tout passe par `motion.ts` (fondus, glissements doux).
 *   - le clavier remonte tout ce qui est en bas (`useKeyboardAwareScroll`).
 * Toutes les animations respectent le réglage « réduire les animations ».
 *
 * Tout doit tenir au-dessus du bouton, sans défiler, quel que soit l'appareil
 * (29/09/2026, retour sur un iPhone 6,1") : `StepLayout` resserre l'écran
 * (`useFit`) tant que son contenu dépasse, y compris ce qui apparaît après une
 * réponse (réaction de Perle).
 */

import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  Easing,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { AnimatedGaugeFill, PressableScale } from '@/components/design/motion'
import { haptic } from '@/lib/haptics'
import { keyboardPadding, useKeyboardAwareScroll } from '@/hooks/useKeyboardHeight'
import { EASE_OUT, RM, fade, fadeSide, fadeUp, softScaleIn } from '@/components/onboarding/flow/motion'

export const PERLE_AVATAR = require('../../../assets/images/onboarding/perle-avatar.webp')

/** Largeur de lecture maximale (iPad, pliables, fenêtre de compatibilité). */
export const FLOW_MAX_WIDTH = 560
export const GUTTER = 20

/** Écart entre deux blocs qui entrent. */
const REVEAL_STEP = 110
/** Passé ce délai après l'arrivée sur l'écran, un bloc qui apparaît (une réaction) entre sans attendre. */
const REVEAL_WINDOW = 900

/** Délai d'entrée du bloc courant : les listes et bulles imbriquées partent de là. */
const RevealDelay = createContext(0)
export const useRevealDelay = (): number => useContext(RevealDelay)

/**
 * Fixe à la main le moment d'entrée d'un bloc (en ms depuis l'arrivée sur
 * l'écran), pour les écrans qui racontent dans un ordre différent de la page.
 */
export const RevealAt: FC<{ delay: number; children: ReactNode }> = ({ delay, children }) => (
  <RevealDelay.Provider value={delay}>{children}</RevealDelay.Provider>
)

// ── Resserrement (petits écrans) ─────────────────────────────────────────

/**
 * Resserrement maximal des espaces et hauteurs (textes à 70 %). Au-delà, tout
 * le contenu est réduit à l'échelle (voir StepLayout) : il tient toujours.
 */
const FIT_MIN = 0.62

const StepFit = createContext(1)

/** Resserrement de l'écran en cours : 1 à l'aise, jusqu'à `FIT_MIN` quand la place manque. */
export const useFit = (): number => useContext(StepFit)

/** Un espace ou une hauteur, resserré. */
export const fitSize = (value: number, fit: number): number => Math.round(value * fit)

/** Une taille de texte, resserrée presque autant que les espaces (demande du 29/09/2026). */
export const fitFont = (size: number, fit: number): number => Math.round(size * (1 - (1 - fit) * 0.8) * 2) / 2

// ── En-tête : retour + barre ─────────────────────────────────────────────

export const FlowHeader: FC<{
  progress: number
  onBack?: () => void
  animateKey: string
}> = ({ progress, onBack, animateKey }) => (
  <View style={styles.header}>
    {onBack ? (
      <Pressable
        onPress={() => {
          haptic.selection()
          onBack()
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Retour"
        style={({ pressed }) => [styles.back, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="arrow-back" size={22} color={colors.ink} />
      </Pressable>
    ) : (
      <View style={styles.backPlaceholder} />
    )}
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: progress }}
    >
      <AnimatedGaugeFill percent={progress} color={colors.rose} animateKey={animateKey} duration={450} />
    </View>
  </View>
)

// ── Textes ───────────────────────────────────────────────────────────────

export const Eyebrow: FC<{ children: string; align?: 'center' | 'left'; color?: string }> = ({
  children,
  align = 'center',
  color = colors.rose,
}) => {
  const fit = useFit()
  return (
    <Text style={[styles.eyebrow, { textAlign: align, color, marginBottom: fitSize(8, fit) }]} accessibilityRole="header">
      {children}
    </Text>
  )
}

export const Title: FC<{
  children: ReactNode
  align?: 'center' | 'left'
  size?: number
  style?: StyleProp<TextStyle>
}> = ({ children, align = 'center', size = 30, style }) => {
  const fitted = fitFont(size, useFit())
  return (
    <Text
      style={[
        styles.title,
        { textAlign: align, fontSize: fitted, lineHeight: Math.round(fitted * 1.18) },
        style,
      ]}
      accessibilityRole="header"
    >
      {children}
    </Text>
  )
}

export const Body: FC<{ children: ReactNode; align?: 'center' | 'left'; style?: StyleProp<TextStyle> }> = ({
  children,
  align = 'center',
  style,
}) => {
  const size = fitFont(16, useFit())
  return (
    <Text style={[styles.body, { textAlign: align, fontSize: size, lineHeight: Math.round(size * 1.47) }, style]}>
      {children}
    </Text>
  )
}

// ── Bulle de Perle ───────────────────────────────────────────────────────

/** Perle respire : une échelle qui va et vient, très lentement. */
const BreathingAvatar: FC<{ size: number }> = ({ size }) => {
  const s = useSharedValue(1)
  useEffect(() => {
    s.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1500, easing: Easing.inOut(Easing.quad), reduceMotion: RM }),
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad), reduceMotion: RM }),
      ),
      -1,
    )
  }, [s])
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }))
  return (
    <Animated.View style={anim}>
      <Image
        source={PERLE_AVATAR}
        style={{ width: size * 0.9, height: size * 0.9 }}
        contentFit="contain"
        accessibilityIgnoresInvertColors
      />
    </Animated.View>
  )
}

export const PerleBubble: FC<{
  children: ReactNode
  size?: number
  highlight?: boolean
  style?: StyleProp<ViewStyle>
}> = ({ children, size = 52, highlight = false, style }) => {
  const base = useRevealDelay()
  const fit = useFit()
  const avatar = fitSize(size, fit)
  return (
    <View style={[styles.bubbleRow, style]}>
      <Animated.View
        entering={softScaleIn(base, 0.85, 420)}
        style={[styles.avatar, { width: avatar, height: avatar, borderRadius: avatar / 2 }]}
      >
        <BreathingAvatar size={avatar} />
      </Animated.View>
      <Animated.View entering={fadeSide('left', base + 160, 440)} style={styles.bubbleWrap}>
        <View style={[styles.pointer, highlight && styles.pointerHighlight]} />
        <View style={[styles.bubble, { paddingVertical: fitSize(11, fit) }, highlight && styles.bubbleHighlight]}>
          {typeof children === 'string' ? <BubbleText>{children}</BubbleText> : children}
        </View>
      </Animated.View>
    </View>
  )
}

export const BubbleText: FC<{ children: ReactNode }> = ({ children }) => {
  const size = fitFont(16, useFit())
  return <Text style={[styles.bubbleText, { fontSize: size, lineHeight: Math.round(size * 1.33) }]}>{children}</Text>
}

export const Accent: FC<{ children: ReactNode }> = ({ children }) => (
  <Text style={styles.accent}>{children}</Text>
)

// ── Boutons ──────────────────────────────────────────────────────────────

export const PrimaryButton: FC<{
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  icon?: keyof typeof Ionicons.glyphMap
  iconRight?: keyof typeof Ionicons.glyphMap
  leading?: ReactNode
}> = ({ label, onPress, disabled = false, loading = false, icon, iconRight, leading }) => {
  const off = disabled || loading
  return (
    <View>
      <PressableScale
        onPress={() => {
          if (off) return
          haptic.press()
          onPress()
        }}
        disabled={off}
        accessibilityRole="button"
        accessibilityState={{ disabled: off, busy: loading }}
        accessibilityLabel={label}
        style={[styles.primary, off && !loading && styles.primaryOff]}
      >
        {loading ? (
          <ActivityIndicator color={colors.surface} />
        ) : (
          <View style={styles.btnRow}>
            {leading}
            {icon ? (
              <Ionicons name={icon} size={20} color={off ? colors.inkLight : colors.surface} />
            ) : null}
            <Text style={[styles.primaryText, off && styles.primaryTextOff]}>{label}</Text>
            {iconRight ? (
              <Ionicons name={iconRight} size={20} color={off ? colors.inkLight : colors.surface} />
            ) : null}
          </View>
        )}
      </PressableScale>
    </View>
  )
}

export const SecondaryButton: FC<{ label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap }> = ({
  label,
  onPress,
  icon,
}) => (
  <PressableScale
    onPress={() => {
      haptic.select()
      onPress()
    }}
    accessibilityRole="button"
    accessibilityLabel={label}
    style={styles.secondary}
  >
    <View style={styles.btnRow}>
      {icon ? <Ionicons name={icon} size={20} color={colors.ink} /> : null}
      <Text style={styles.secondaryText}>{label}</Text>
    </View>
  </PressableScale>
)

export const TextLink: FC<{ label: string; onPress: () => void; color?: string }> = ({
  label,
  onPress,
  color = colors.inkMuted,
}) => {
  const fit = useFit()
  return (
    <Pressable
      onPress={() => {
        haptic.selection()
        onPress()
      }}
      hitSlop={10}
      accessibilityRole="link"
      style={[styles.linkWrap, { paddingVertical: fitSize(8, fit) }]}
    >
      <Text style={[styles.link, { color }]}>{label}</Text>
    </Pressable>
  )
}

// ── Choix ────────────────────────────────────────────────────────────────

const CheckDot: FC = () => (
  <Animated.View entering={softScaleIn(0, 0.6, 220)} style={styles.checkDot}>
    <Ionicons name="checkmark" size={14} color={colors.surface} />
  </Animated.View>
)

export const OptionCard: FC<{
  label: string
  sub?: string
  selected?: boolean
  onPress: () => void
  left?: ReactNode
  multi?: boolean
  outlined?: boolean
  minHeight?: number
}> = ({ label, sub, selected = false, onPress, left, multi = false, outlined = false, minHeight = 52 }) => {
  const fit = useFit()
  const labelSize = fitFont(15.5, fit)
  const subSize = fitFont(13.5, fit)
  return (
    <View>
      <PressableScale
        onPress={() => {
          if (selected) haptic.selection()
          else haptic.select()
          onPress()
        }}
        scaleTo={0.985}
        accessibilityRole={multi ? 'checkbox' : 'radio'}
        accessibilityState={{ checked: selected }}
        accessibilityLabel={sub ? `${label}. ${sub}` : label}
        style={[
          styles.option,
          { minHeight: fitSize(minHeight, fit), paddingVertical: fitSize(10, fit) },
          outlined && styles.optionOutlined,
          selected && styles.optionOn,
        ]}
      >
        {left ? <View style={styles.optionLeft}>{left}</View> : null}
        <View style={styles.optionTexts}>
          <Text
            style={[
              styles.optionLabel,
              { fontSize: labelSize, lineHeight: Math.round(labelSize * 1.33) },
              sub ? styles.optionLabelStrong : null,
            ]}
          >
            {label}
          </Text>
          {sub ? (
            <Text style={[styles.optionSub, { fontSize: subSize, lineHeight: Math.round(subSize * 1.36) }]}>{sub}</Text>
          ) : null}
        </View>
        {selected ? <CheckDot /> : null}
      </PressableScale>
    </View>
  )
}

export const Chip: FC<{
  label: string
  selected?: boolean
  onPress: () => void
  icon?: ReactNode
  dashed?: boolean
  /** Occupe toute sa case (grille à deux colonnes). */
  fill?: boolean
}> = ({ label, selected = false, onPress, icon, dashed = false, fill = false }) => {
  const fit = useFit()
  return (
    <View style={fill ? styles.fill : undefined}>
      <PressableScale
        onPress={() => {
          if (selected) haptic.selection()
          else haptic.select()
          onPress()
        }}
        scaleTo={0.95}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={label}
        style={[
          styles.chip,
          { minHeight: fitSize(46, fit) },
          fill && [styles.chipFill, { minHeight: fitSize(54, fit), paddingVertical: fitSize(8, fit) }],
          dashed && styles.chipDashed,
          selected && styles.chipOn,
        ]}
      >
        {icon}
        <Text
          style={[
            styles.chipText,
            { fontSize: fitFont(16, fit) },
            fill && [styles.chipTextFill, { fontSize: fitFont(15, fit), lineHeight: Math.round(fitFont(15, fit) * 1.27) }],
            selected && styles.chipTextOn,
          ]}
          numberOfLines={fill ? 2 : undefined}
        >
          {label}
        </Text>
      </PressableScale>
    </View>
  )
}

export const Hint: FC<{ children: string }> = ({ children }) => {
  const fit = useFit()
  return <Text style={[styles.hint, { marginTop: fitSize(10, fit) }]}>{children}</Text>
}

// ── Entrées progressives ─────────────────────────────────────────────────

type CascadeFrom = 'down' | 'right' | 'left' | 'pop'

function itemEntrance(from: CascadeFrom, delay: number) {
  switch (from) {
    case 'right':
      return fadeSide('right', delay, 380)
    case 'left':
      return fadeSide('left', delay, 380)
    case 'pop':
      return softScaleIn(delay, 0.92, 340)
    default:
      return fadeUp(delay, 16, 380)
  }
}

/**
 * Une liste dont les éléments arrivent l'un après l'autre, à partir du moment
 * où le bloc qui la contient entre lui-même à l'écran.
 */
export const Cascade: FC<{
  children: ReactNode
  from?: CascadeFrom
  step?: number
  /** Écart vertical entre les éléments, resserré avec l'écran. */
  gap?: number
  style?: StyleProp<ViewStyle>
  itemStyle?: StyleProp<ViewStyle>
}> = ({ children, from = 'down', step = 60, gap, style, itemStyle }) => {
  const base = useRevealDelay()
  const fit = useFit()
  const mountedAt = useRef(Date.now())
  const fresh = Date.now() - mountedAt.current < REVEAL_WINDOW
  let i = 0
  return (
    <View style={[gap !== undefined && { gap: fitSize(gap, fit) }, style]}>
      {Children.toArray(children).map((child) => {
        if (!isValidElement(child)) return child
        const delay = fresh ? base + Math.min(i++, 12) * step : 0
        return (
          <Animated.View key={child.key} entering={itemEntrance(from, delay)} style={itemStyle}>
            {child}
          </Animated.View>
        )
      })}
    </View>
  )
}

/**
 * Un bloc qui se pose en s'agrandissant légèrement (sans rebond).
 * `onShown` est appelé quand il est visible : le bon moment pour une vibration.
 */
export const PopIn: FC<{ children: ReactNode; onShown?: () => void; style?: StyleProp<ViewStyle> }> = ({
  children,
  onShown,
  style,
}) => {
  const base = useRevealDelay()
  const cb = useRef(onShown)
  cb.current = onShown
  useEffect(() => {
    if (!cb.current) return
    const t = setTimeout(() => cb.current?.(), base + 260)
    return () => clearTimeout(t)
  }, [base])
  return (
    <Animated.View entering={softScaleIn(base, 0.9, 480)} style={style}>
      {children}
    </Animated.View>
  )
}

/** Un composant marqué ainsi gère lui-même son entrée (avec `useRevealDelay`). */
export function selfAnimated<T>(component: T): T {
  ;(component as unknown as { selfAnimated?: boolean }).selfAnimated = true
  return component
}

/** Entrée d'un bloc de premier niveau, selon sa nature. */
function blockEntrance(type: unknown, delay: number) {
  if (type === PerleBubble || type === Cascade || type === PopIn) return undefined // s'animent eux-mêmes
  if ((type as { selfAnimated?: boolean } | null)?.selfAnimated) return undefined
  if (type === Eyebrow) return fade(delay, 420)
  if (type === Title) return fadeUp(delay, 22, 480)
  return fadeUp(delay, 14, 420)
}

// ── Mise en page d'une étape ─────────────────────────────────────────────

/**
 * Corps + barre d'actions fixe en bas.
 *
 *   - Les blocs entrent un par un (`animate`, actif par défaut).
 *   - Clavier ouvert : la barre du bas remonte au-dessus du clavier et la zone
 *     défile pour garder le champ actif visible. Rien n'est jamais recouvert.
 *   - Tout tient au-dessus du bouton, sans défiler, quel que soit l'appareil
 *     (demande du 29/09/2026) : si le contenu dépasse à l'arrivée, l'écran se
 *     resserre (`useFit`, espaces ET textes, jusqu'à `FIT_MIN`), puis en dernier
 *     recours tout le contenu est réduit à l'échelle. Mesuré, pas deviné : la
 *     même règle vaut pour un iPhone SE, une tablette ou un texte agrandi par
 *     l'accessibilité.
 *   - Ce resserrement se fait À L'ABRI des regards, puis le contenu est remonté
 *     et ses entrées jouent sur la mise en page finale. Sur Android (Reanimated
 *     4), un bloc dont la place change pendant son animation d'entrée garde son
 *     ancienne position : de grands trous apparaissaient (constaté le 29/09).
 *     Pour la même raison, ce qui apparaît après une réponse (réaction de
 *     Perle) a sa place réservée dès l'arrivée : rien ne bouge ensuite.
 */
export const StepLayout: FC<{
  children: ReactNode
  footer?: ReactNode
  contentStyle?: StyleProp<ViewStyle>
  animate?: boolean
  /**
   * Air à garder sous le champ actif quand le clavier est ouvert. Une liste de
   * suggestions sous le champ en demande davantage : la zone défile alors
   * jusqu'à laisser le champ en haut, comme si on avait fait défiler.
   */
  focusSpace?: number
  /** Moment d'entrée de la barre du bas, quand l'écran règle lui-même son ordre. */
  footerDelay?: number
}> = ({ children, footer, contentStyle, animate = true, focusSpace = 28, footerDelay: footerAt }) => {
  const insets = useSafeAreaInsets()
  const { scrollRef, keyboardHeight, onScroll, onContentSizeChange } = useKeyboardAwareScroll(focusSpace)
  const mountedAt = useRef(Date.now())
  const fresh = Date.now() - mountedAt.current < REVEAL_WINDOW
  const keyboardOpen = keyboardHeight > 0
  const keyboardOpenRef = useRef(keyboardOpen)
  keyboardOpenRef.current = keyboardOpen

  // Hauteur naturelle de la colonne (avant mise à l'échelle), sa position et
  // la zone visible. Réglé une fois, à l'arrivée ; clavier ouvert, on ne touche
  // à rien. `pass` remonte le contenu une fois réglé (entrées rejouées à neuf).
  const [fit, setFit] = useState({ fit: 1, zoom: 1, natural: 0, hidden: false, pass: 0 })
  // `measuredAt` : le resserrement auquel la hauteur a été mesurée. Tant que la
  // colonne n'a pas été remesurée au dernier réglage, on attend : sinon une
  // mesure de la zone visible arrivée entre-temps resserrait deux fois.
  const measure = useRef({ fit: 1, zoom: 1, natural: 0, top: 0, viewport: 0, measuredAt: 1, fitting: false, settled: false })
  const settle = useCallback(() => {
    const m = measure.current
    if (m.settled) return
    m.settled = true
    if (m.fitting) setFit((f) => ({ ...f, hidden: false, pass: f.pass + 1 }))
  }, [])
  const adjustFit = useCallback(() => {
    const m = measure.current
    if (m.settled || keyboardOpenRef.current || m.viewport <= 0 || m.natural <= 0 || m.measuredAt !== m.fit) return
    const room = m.viewport - m.top - fitSize(24, m.fit)
    if (m.natural * m.zoom <= room + 1) {
      settle()
      return
    }
    m.fitting = true
    if (m.fit > FIT_MIN) {
      // Par petits pas : un texte qui perd une ligne libère d'un coup plus que
      // prévu, et on ne desserre jamais. La mesure suivante enchaîne si besoin.
      const overflow = 1 - room / (m.natural * m.zoom)
      m.fit = Math.max(FIT_MIN, m.fit - Math.max(0.015, overflow * m.fit * 0.6))
    } else {
      // Tient par construction : c'est réglé.
      m.zoom = room / m.natural
      m.settled = true
    }
    setFit((f) => ({
      fit: m.fit,
      zoom: m.zoom,
      natural: m.natural,
      hidden: !m.settled,
      pass: m.settled ? f.pass + 1 : f.pass,
    }))
  }, [settle])
  // Resserrement de ce rendu : une mesure de la colonne le reflète, pas un réglage à venir.
  const renderedFit = useRef(1)
  renderedFit.current = fit.fit
  // Filet : quoi qu'il arrive (clavier ouvert d'emblée, mesure absente), on montre.
  useEffect(() => {
    const t = setTimeout(settle, 600)
    return () => clearTimeout(t)
  }, [settle])
  const onViewportLayout = useCallback(
    (e: LayoutChangeEvent) => {
      measure.current.viewport = e.nativeEvent.layout.height
      adjustFit()
    },
    [adjustFit],
  )
  const onColumnLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const m = measure.current
      m.natural = e.nativeEvent.layout.height
      m.measuredAt = renderedFit.current
      m.top = e.nativeEvent.layout.y
      // Mise à l'échelle en cours : la marge qui la compense suit la hauteur.
      if (m.zoom < 1) setFit((f) => (f.natural === m.natural ? f : { ...f, natural: m.natural }))
      adjustFit()
    },
    [adjustFit],
  )

  let order = 0
  const blocks = Children.toArray(children).map((child) => {
    if (!animate || !isValidElement(child) || child.type === Gap) return child
    const delay = fresh ? order++ * REVEAL_STEP : 0
    return (
      <RevealDelay.Provider key={child.key} value={delay}>
        <Animated.View entering={blockEntrance(child.type, delay)}>{child}</Animated.View>
      </RevealDelay.Provider>
    )
  })
  const footerDelay = footerAt ?? (fresh ? Math.min(order, 5) * REVEAL_STEP : 0)

  return (
    <StepFit.Provider value={fit.fit}>
      <View style={[styles.flex, keyboardOpen && { paddingBottom: keyboardPadding(keyboardHeight, insets.bottom, false) }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingTop: fitSize(4, fit.fit), paddingBottom: fitSize(24, fit.fit) },
            contentStyle,
            // De la place pour pouvoir faire remonter le champ au-dessus des suggestions.
            keyboardOpen && focusSpace > 28 ? { paddingBottom: focusSpace } : null,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
          onLayout={onViewportLayout}
          onContentSizeChange={onContentSizeChange}
        >
          <View
            key={fit.pass}
            onLayout={onColumnLayout}
            pointerEvents={fit.hidden ? 'none' : 'auto'}
            style={[
              styles.column,
              fit.hidden && styles.hidden,
              // Dernier recours : réduit depuis le haut, la marge négative rend la place gagnée.
              fit.zoom < 1 && {
                transform: [{ scale: fit.zoom }],
                transformOrigin: 'top',
                marginBottom: -fit.natural * (1 - fit.zoom),
              },
            ]}
          >
            {blocks}
          </View>
        </ScrollView>
        {footer ? (
          <Animated.View
            entering={
              animate || footerAt !== undefined
                ? FadeInUp.delay(footerDelay).duration(420).easing(EASE_OUT).reduceMotion(RM)
                : undefined
            }
            style={[styles.footer, { paddingBottom: keyboardOpen ? 12 : Math.max(insets.bottom, 12) + 4 }]}
          >
            <View style={[styles.column, styles.footerColumn]}>{footer}</View>
          </Animated.View>
        ) : null}
      </View>
    </StepFit.Provider>
  )
}

export const Gap: FC<{ h: number }> = ({ h }) => <View style={{ height: fitSize(h, useFit()) }} />

// ── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hidden: { opacity: 0 },
  fill: { width: '100%' },
  column: { width: '100%', maxWidth: FLOW_MAX_WIDTH, alignSelf: 'center' },
  /** Haut et bas : resserrés avec l'écran (voir StepLayout). */
  content: { paddingHorizontal: GUTTER, flexGrow: 1 },
  footer: { paddingHorizontal: GUTTER, paddingTop: 10, backgroundColor: colors.bg },
  /** Écart entre les boutons empilés de la barre du bas. */
  footerColumn: { gap: 12 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: GUTTER,
    paddingTop: 4,
    paddingBottom: 6,
    width: '100%',
    maxWidth: FLOW_MAX_WIDTH + GUTTER * 2,
    alignSelf: 'center',
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPlaceholder: { width: 40, height: 40 },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.roseSoft,
    overflow: 'hidden',
  },

  eyebrow: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fontFamilies.bold,
    color: colors.ink,
    letterSpacing: -0.6,
  },
  body: {
    fontFamily: fontFamilies.regular,
    color: colors.inkMuted,
  },

  bubbleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    backgroundColor: colors.roseSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bubbleWrap: { flex: 1, justifyContent: 'center' },
  pointer: {
    position: 'absolute',
    left: -6,
    top: '50%',
    marginTop: -7,
    width: 14,
    height: 14,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    transform: [{ rotate: '45deg' }],
    zIndex: 1,
  },
  pointerHighlight: { borderColor: colors.rose, borderLeftWidth: 1.5, borderBottomWidth: 1.5 },
  bubble: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 15,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  bubbleHighlight: { borderColor: colors.rose, borderWidth: 1.5 },
  bubbleText: {
    fontFamily: fontFamilies.semiBold,
    color: colors.ink,
  },
  accent: { color: colors.rose, fontFamily: fontFamilies.bold },

  btnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primary: {
    height: 56,
    borderRadius: 999,
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    shadowColor: colors.rose,
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  primaryOff: { backgroundColor: colors.border, shadowOpacity: 0, elevation: 0 },
  primaryText: { fontFamily: fontFamilies.semiBold, fontSize: 17, color: colors.surface },
  primaryTextOff: { color: colors.inkLight },
  secondary: {
    height: 56,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  secondaryText: { fontFamily: fontFamilies.semiBold, fontSize: 17, color: colors.ink },
  linkWrap: { alignSelf: 'center' },
  link: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    gap: 14,
  },
  optionOutlined: { borderWidth: 1.5, borderColor: colors.ink },
  optionOn: { backgroundColor: colors.roseSoft, borderColor: colors.rose, borderWidth: 1.5 },
  optionLeft: { alignItems: 'center', justifyContent: 'center' },
  optionTexts: { flex: 1, gap: 3 },
  optionLabel: { fontFamily: fontFamilies.regular, color: colors.ink },
  optionLabelStrong: { fontFamily: fontFamilies.semiBold },
  optionSub: { fontFamily: fontFamilies.regular, color: colors.inkLight },
  checkDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
  },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipFill: {
    width: '100%',
    justifyContent: 'center',
    borderRadius: 18,
    paddingHorizontal: 10,
  },
  chipDashed: { borderStyle: 'dashed', borderColor: colors.inkLight },
  chipOn: { backgroundColor: colors.roseSoft, borderColor: colors.rose, borderWidth: 1.5 },
  chipText: { fontFamily: fontFamilies.regular, color: colors.ink },
  chipTextFill: { textAlign: 'center', flexShrink: 1 },
  chipTextOn: { color: colors.roseDeep, fontFamily: fontFamilies.medium },

  hint: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    color: colors.inkLight,
    textAlign: 'center',
  },
})

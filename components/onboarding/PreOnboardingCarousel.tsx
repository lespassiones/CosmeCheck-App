/**
 * PreOnboardingCarousel : carrousel de présentation montré à toute personne
 * non connectée : première installation, réouverture, retour après
 * déconnexion. C'est la vitrine, et l'écran de connexion ne doit jamais la
 * court-circuiter.
 *
 * 4 illustrations (assets/images/PreOnboarding/ecran{1..4}.webp), les
 * titres/sous-titres étant DÉJÀ intégrés dans les images. C'est le fait
 * marquant de cet écran, et toute la raison de sa mise en page : ici, rogner
 * l'image, c'est rogner du texte.
 *
 * ── Le défaut corrigé (31/08/2026) ──────────────────────────────────────────
 *
 * Refus Apple guideline 4 (Design), vérifié sur iPad Air 11 pouces : interface
 * jugée encombrée, textes coupés et recouverts. Les captures d'Apple montraient
 * les pastilles de pagination posées au milieu d'un sous-titre, un badge coupé
 * en haut, et un titre tranché par le bouton.
 *
 * Deux causes, et l'arithmétique est sans appel :
 *
 *   1. `contentFit="cover"` sur une image au rapport 0,472. Sur un iPhone 15
 *      Plus (0,461) le cadrage ne rogne quasi rien, d'où une mise en page qui
 *      semblait juste. Ailleurs, `cover` cadre sur la largeur et coupe le haut
 *      comme le bas.
 *
 *      ⚠️ Le rapport à retenir n'est PAS celui de l'écran de l'iPad (0,695) :
 *      une app iPhone n'y tourne pas en plein écran, mais dans une fenêtre de
 *      compatibilité. Mesurée sur les captures d'Apple, cette fenêtre fait
 *      environ 0,55, soit très exactement le rapport d'un **iPhone SE**
 *      (0,562). Le rognage etait donc d'environ **15 %, ~7 % en haut et ~7 %
 *      en bas**, et Apple a vu le defaut que vivait deja tout possesseur
 *      d'iPhone SE. Ce n'etait pas un defaut propre a l'iPad.
 *
 *   2. Les contrôles du bas étaient posés en `position: absolute` PAR-DESSUS
 *      l'image. Tant que le cadrage ne bougeait pas, ils tombaient dans la
 *      marge basse de l'illustration. Dès que le cadrage décale le contenu,
 *      ils atterrissent sur du texte.
 *
 * La règle qui remplace ça : **`contain`, et les contrôles hors de l'image.**
 * L'illustration est affichée entière quelle que soit la fenêtre, et la barre
 * du bas occupe sa propre place dans le flux, donc elle ne peut plus rien
 * recouvrir. Les bandes de remplissage éventuelles sont de la couleur de fond
 * des illustrations, donc invisibles.
 *
 * Au « Commencer » / « Passer » : on marque le carrousel comme traversé POUR CE
 * LANCEMENT, puis on route vers l'inscription. L'AuthGuard prend le relais.
 */

import { useCallback, useEffect, useRef, useState, type FC } from 'react'
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { Image } from 'expo-image'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { markPreOnboardingDone } from '@/lib/storage/preOnboarding'

// require() renvoie un id d'asset (number) côté RN. Chemins relatifs pour rester
// robuste quel que soit le réglage d'alias du bundler.
const SLIDES = [
  require('../../assets/images/PreOnboarding/ecran1.webp'),
  require('../../assets/images/PreOnboarding/ecran2.webp'),
  require('../../assets/images/PreOnboarding/ecran3.webp'),
  require('../../assets/images/PreOnboarding/ecran4.webp'),
] as number[]

/**
 * Largeur maximale de la barre du bas.
 *
 * Sur une fenêtre large, un bouton étiré sur toute la largeur est exactement
 * ce que la guideline 4 appelle une mise en page qui n'a pas été pensée pour
 * l'appareil. On le centre et on le borne.
 */
const CONTROLS_MAX_WIDTH = 520

export const PreOnboardingCarousel: FC = () => {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const listRef = useRef<FlatList<number>>(null)
  const [index, setIndex] = useState(0)
  const isLast = index === SLIDES.length - 1

  // Miroir de `index` lisible sans redéclencher l'effet de recalage ci-dessous.
  const indexRef = useRef(0)
  indexRef.current = index

  // Hauteur RÉELLE de la zone d'image, mesurée après que la barre du bas a pris
  // sa place. On ne la déduit pas de la hauteur de fenêtre : ce calcul-là
  // ignorerait la barre, les encoches et l'indicateur d'accueil, et c'est
  // précisément le genre d'approximation qui a coûté ce refus.
  const [areaHeight, setAreaHeight] = useState(0)
  const onAreaLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height)
    setAreaHeight((prev) => (prev === h ? prev : h))
  }, [])

  // Recalage sur changement de taille de fenêtre.
  //
  // Le défilement d'une FlatList horizontale est un décalage en PIXELS. Quand
  // la fenêtre change de largeur, ce décalage ne veut plus rien dire : on se
  // retrouve à cheval sur deux illustrations. Ça n'arrive jamais sur un
  // téléphone verrouillé en portrait, et tout le temps sur l'appareil qui a
  // motivé ce refus : la fenêtre de compatibilité d'un iPad se redimensionne
  // d'un geste, et Apple y vérifie l'app.
  useEffect(() => {
    if (areaHeight <= 0) return
    listRef.current?.scrollToOffset({
      offset: indexRef.current * width,
      animated: false,
    })
  }, [width, areaHeight])

  const finish = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    // Marquage SYNCHRONE avant la navigation : l'AuthGuard lit le flag dans le
    // même tick et ne renvoie donc pas au carrousel qu'on vient de quitter.
    markPreOnboardingDone()
    router.replace(ROUTES.AUTH.WELCOME)
  }, [router])

  const goNext = useCallback(() => {
    if (isLast) {
      finish()
      return
    }
    const next = index + 1
    Haptics.selectionAsync().catch(() => {})
    listRef.current?.scrollToIndex({ index: next, animated: true })
    setIndex(next)
  }, [index, isLast, finish])

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / width)
      if (i !== index) setIndex(i)
    },
    [index, width],
  )

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<number>) => (
      <Image
        source={item}
        style={{ width, height: areaHeight }}
        // `contain` et pas `cover` : les titres sont DANS l'image, donc un
        // cadrage qui rogne est un texte tronqué. Voir l'en-tête du fichier.
        contentFit="contain"
        transition={150}
      />
    ),
    [width, areaHeight],
  )

  return (
    // Racine PLEIN ECRAN, et pas une zone sure : l'illustration n'a aucune
    // raison de s'arreter sous la barre d'etat, elle y perdait de la hauteur
    // donc de la taille. Seuls les elements interactifs ont besoin des marges
    // sures : la barre du bas les prend, et « Passer » lit l'encoche.
    <View style={styles.root}>
      <View style={styles.imageArea} onLayout={onAreaLayout}>
        {areaHeight > 0 && (
          <FlatList
            ref={listRef}
            data={SLIDES}
            renderItem={renderItem}
            keyExtractor={(_, i) => `slide-${i}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumEnd}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* « Passer » en haut à droite (caché sur le dernier écran). Reste en
            surimpression, mais sur une zone que les illustrations gardent
            libre, et jamais sur la barre du bas. */}
        {!isLast && (
          <Pressable
            onPress={finish}
            hitSlop={10}
            style={({ pressed }) => [
              styles.skip,
              { top: insets.top + spacing.md },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Passer l'introduction"
          >
            <Text style={styles.skipText}>Passer</Text>
          </Pressable>
        )}
      </View>

      {/* Barre du bas : DANS le flux, sous l'image. Elle occupe sa place au
          lieu de la prendre, donc elle ne peut plus recouvrir un texte. */}
      <SafeAreaView edges={['bottom']} style={styles.footerSafe}>
        <View style={styles.footer}>
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
          <Pressable
            onPress={goNext}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            accessibilityRole="button"
            accessibilityLabel={isLast ? 'Commencer' : 'Écran suivant'}
          >
            <Text style={styles.ctaText}>{isLast ? 'Commencer' : 'Suivant'}</Text>
            {!isLast && (
              <Ionicons name="arrow-forward" size={18} color={colors.surface} />
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  imageArea: {
    flex: 1,
    // Même fond que celui des illustrations : les bandes que `contain` laisse
    // sur une fenêtre au rapport different ne se voient donc pas.
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  skip: {
    position: 'absolute',
    // `top` est fourni au rendu depuis l'encoche : en dur, la pilule passait
    // sous la barre d'etat sur les appareils qui en ont une.
    right: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  skipText: {
    ...typography.smallMedium,
    color: colors.inkMuted,
  },
  pressed: {
    opacity: 0.6,
  },
  footerSafe: {
    backgroundColor: colors.surface,
  },
  footer: {
    width: '100%',
    maxWidth: CONTROLS_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    paddingBottom: spacing.base,
    gap: spacing.base,
    backgroundColor: colors.surface,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.gray300,
  },
  dotActive: {
    width: 22,
    backgroundColor: colors.rose,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 54,
    borderRadius: radius.full,
    backgroundColor: colors.success,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  ctaPressed: {
    backgroundColor: colors.successDeep,
  },
  ctaText: {
    ...typography.button,
    color: colors.surface,
  },
})

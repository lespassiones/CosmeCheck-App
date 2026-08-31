/**
 * DataConsentScreen : recueil du consentement AVANT le questionnaire de profil.
 *
 * Pourquoi cet écran existe. Le questionnaire demande le type de peau, les
 * sensibilités et les allergies : ce sont des données de santé au sens de
 * l'article 9 du RGPD. On ne peut pas les collecter sur un simple bandeau ni
 * sur un consentement présumé. Il faut un oui explicite, éclairé, donné avant
 * la première question, et conservé avec sa date.
 *
 * Apple regarde la même chose sous un autre angle (règles 5.1.1 et 5.1.2) :
 * une app qui demande des informations personnelles doit expliquer clairement à
 * quoi elles servent, au moment où elle les demande. Un écran de réglages
 * enterré ne suffit pas.
 *
 * Le texte est volontairement long et se lit en entier : ce qui est calculé
 * sans IA, ce qui passe par un modèle, ce qui n'arrive jamais aux données. Il
 * reprend mot pour mot les engagements de `app/legal/privacy.tsx` (sous-
 * traitants, durées, base légale). Si l'un des deux change, l'autre doit
 * changer aussi.
 *
 * ── Le recours à l'IA est annoncé AVANT le détail (31/08/2026) ──────────────
 *
 * Le rôle de l'intelligence artificielle n'était expliqué qu'en troisième
 * section, après deux écrans de défilement. Un consentement éclairé ne se
 * juge pas à ce qui est écrit quelque part, mais à ce qui est lu avant de
 * cocher : le destinataire des données doit apparaître d'emblée. Un encart en
 * tête d'écran l'annonce donc en quatre lignes, la section détaillée reste en
 * place plus bas, et la case à cocher le nomme explicitement, puisque c'est
 * elle qui vaut consentement.
 *
 * Le bouton reste inerte tant que la case n'est pas cochée : c'est le geste qui
 * fait le consentement, pas le fait d'avoir atteint le bas de la page.
 */

import { useCallback, useState, type FC, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import { LegalModal, type LegalDoc } from '@/components/legal/LegalModal'
import { WhiteCard } from '@/components/design/WhiteCard'
import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { typography } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { useProfile } from '@/hooks/useProfile'
import { showToast } from '@/components/shared/Toast'

/** Un paragraphe de section, avec son titre et son icône. */
const Section: FC<{
  icon: keyof typeof Ionicons.glyphMap
  tint: string
  title: string
  children: ReactNode
}> = ({ icon, tint, title, children }) => (
  <WhiteCard padding={spacing.lg} style={styles.card}>
    <View style={styles.cardHead}>
      <View style={[styles.cardIcon, { backgroundColor: `${tint}1A` }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
    </View>
    {children}
  </WhiteCard>
)

/** Paragraphe courant. */
const P: FC<{ children: ReactNode }> = ({ children }) => (
  <Text style={styles.para}>{children}</Text>
)

/** Puce d'une liste. */
const Bullet: FC<{ children: ReactNode; tint?: string }> = ({
  children,
  tint = colors.inkMuted,
}) => (
  <View style={styles.bulletRow}>
    <View style={[styles.bulletDot, { backgroundColor: tint }]} />
    <Text style={styles.bulletText}>{children}</Text>
  </View>
)

/** Puce d'une liste de garanties (coche verte). */
const Never: FC<{ children: ReactNode }> = ({ children }) => (
  <View style={styles.bulletRow}>
    <Ionicons
      name="close-circle"
      size={17}
      color={colors.success}
      style={styles.neverIcon}
    />
    <Text style={styles.bulletText}>{children}</Text>
  </View>
)

export const DataConsentScreen: FC = () => {
  const { giveDataConsent } = useProfile()
  const [checked, setChecked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null)

  const toggle = useCallback(() => {
    Haptics.selectionAsync().catch(() => {})
    setChecked((v) => !v)
  }, [])

  const accept = useCallback(async () => {
    if (!checked || saving) return
    setSaving(true)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    try {
      await giveDataConsent()
      // Le consentement est déjà vrai dans le cache (écriture optimiste
      // synchrone) : l'AuthGuard enchaînerait de lui-même, mais on nomme la
      // destination pour que le parcours reste lisible dans le code.
      router.replace(ROUTES.ONBOARDING.INDEX)
    } catch {
      setSaving(false)
      showToast("Impossible d'enregistrer ton choix. Réessaie.", 'error')
    }
  }, [checked, saving, giveDataConsent])

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator
      >
        {/* En-tête */}
        <View style={styles.heroIcon}>
          <Ionicons name="shield-checkmark" size={30} color={colors.accent} />
        </View>
        <Text style={styles.title}>Avant de parler de ta peau</Text>
        <Text style={styles.lede}>
          Les questions qui suivent portent sur ta peau, tes cheveux et tes
          sensibilités. Ce sont des informations personnelles sensibles, alors
          voici précisément ce qu'on en fait, et ce qu'on n'en fait pas. Prends
          le temps de lire, c'est fait pour.
        </Text>

        {/* L'essentiel, avant le détail : à qui vont les données et pour quoi.
            C'est ce qui distingue un consentement éclairé d'un consentement
            simplement documenté. */}
        <View style={styles.aiCallout}>
          <View style={styles.aiHead}>
            <View style={styles.aiIcon}>
              <Ionicons name="sparkles" size={16} color={colors.accent} />
            </View>
            <Text style={styles.aiTitle}>
              Ton profil est transmis à une intelligence artificielle
            </Text>
          </View>
          <Text style={styles.aiPara}>
            Toutes les réponses <Text style={styles.aiStrong}>personnalisées</Text>{' '}
            de l'application, les explications d'ingrédients, la compatibilité
            avec ta peau, les conseils de routine et le conseiller beauté, sont
            rédigées par des modèles d'intelligence artificielle (OpenAI,
            Mistral AI). On leur transmet pour cela{' '}
            <Text style={styles.aiStrong}>ton profil beauté</Text> et la
            composition du produit concerné.
          </Text>
          <View style={styles.aiFacts}>
            <Text style={styles.aiFact}>
              · Jamais ton nom, ton adresse e-mail ni ton identifiant de compte.
            </Text>
            <Text style={styles.aiFact}>
              · Jamais pour entraîner un modèle, c'est contractuellement exclu.
            </Text>
            <Text style={styles.aiFact}>
              · La note d'un produit, elle, est calculée sans IA, et ton profil
              ne la modifie pas.
            </Text>
          </View>
          <Text style={styles.aiMore}>Tout le détail plus bas, « Le rôle de l'intelligence artificielle ».</Text>
        </View>

        <Section icon="flask-outline" tint={colors.accent} title="Ce que fait Cosme Check">
          <P>
            Cosme Check lit la liste INCI d'un produit, c'est-à-dire la liste
            officielle de ses ingrédients, et lui attribue une note. Cette note
            est calculée par un moteur déterministe : les mêmes ingrédients
            donnent toujours le même résultat, pour tout le monde. Aucune
            intelligence artificielle n'intervient dans le calcul de la note, et
            ton profil ne la modifie pas.
          </P>
          <P>
            Mais une note générale ne dit pas tout. Un produit très bien noté
            peut mal te convenir, et un produit moyen peut être exactement ce
            qu'il te faut. Un actif qui aide une peau sèche peut irriter une
            peau réactive. Un ingrédient inoffensif pour la plupart des gens
            devient un problème si tu y es allergique.
          </P>
          <P>
            Le vrai apport de l'application est là : te dire si CE produit
            convient à TA peau. C'est cette compatibilité, propre à toi, qui
            demande de savoir de quelle peau on parle.
          </P>
        </Section>

        <Section
          icon="person-outline"
          tint={colors.rose}
          title="Pourquoi on a besoin de ton profil"
        >
          <P>
            Sans profil, l'application ne peut faire qu'une chose : afficher une
            note et une liste d'ingrédients. Avec ton profil, elle peut :
          </P>
          <Bullet tint={colors.rose}>
            juger la compatibilité de chaque produit avec ta peau plutôt que
            dans l'absolu ;
          </Bullet>
          <Bullet tint={colors.rose}>
            signaler les ingrédients auxquels tu as dit être sensible ou
            allergique, avant que tu n'achètes ;
          </Bullet>
          <Bullet tint={colors.rose}>
            proposer des alternatives qui tiennent compte de ton type de peau et
            de tes objectifs ;
          </Bullet>
          <Bullet tint={colors.rose}>
            repérer les conflits entre les produits de ta routine ;
          </Bullet>
          <Bullet tint={colors.rose}>
            confronter les promesses affichées sur l'emballage à la composition
            réelle, pour ton cas.
          </Bullet>
          <P>
            Tu restes libre de ne rien renseigner ou de passer des questions :
            l'application continue de fonctionner, simplement sans
            personnalisation. Tu peux modifier ou effacer ton profil à tout
            moment depuis « Mon profil ».
          </P>
        </Section>

        <Section
          icon="sparkles-outline"
          tint={colors.accent}
          title="Le rôle de l'intelligence artificielle"
        >
          <P>
            Rédiger une explication compréhensible, comparer deux produits ou
            répondre à une question ouverte demande autre chose qu'un calcul.
            Pour ces parties précises, l'application fait appel à des modèles de
            langage : OpenAI en principal, Mistral AI en complément et en
            secours.
          </P>
          <P>
            Ce qui leur est transmis se limite à ce qui est nécessaire : les
            éléments de ton profil beauté utiles à la demande, et la composition
            du produit concerné. Ton nom, ton adresse e-mail et ton identifiant
            de compte ne leur sont pas envoyés.
          </P>
          <P>
            Les appels passent par les interfaces professionnelles de ces
            fournisseurs, pas par leurs applications grand public. Sur ces
            interfaces, les données envoyées ne servent pas à entraîner les
            modèles : c'est un engagement contractuel du fournisseur, et
            l'option correspondante est désactivée sur notre compte. Elles sont
            conservées trente jours au maximum chez le fournisseur pour des
            raisons de sécurité, puis supprimées.
          </P>
        </Section>

        <Section
          icon="lock-closed-outline"
          tint={colors.success}
          title="Ce qui n'arrivera pas"
        >
          <Never>Tes données ne servent pas à entraîner un modèle d'IA.</Never>
          <Never>Elles ne sont ni vendues, ni louées, ni échangées.</Never>
          <Never>Elles ne servent pas à te cibler avec de la publicité.</Never>
          <Never>
            Aucun autre utilisateur ne peut y accéder : chaque ligne est
            cloisonnée au niveau de la base de données.
          </Never>
        </Section>

        <Section icon="server-outline" tint={colors.inkMuted} title="Où vont tes données">
          <Bullet>
            Hébergement principal chez Supabase, sur des serveurs situés en
            Irlande, dans l'Union européenne.
          </Bullet>
          <Bullet>
            Les appels à OpenAI impliquent un transfert vers les États-Unis,
            encadré par les Clauses Contractuelles Types de la Commission
            européenne.
          </Bullet>
          <Bullet>
            Mistral AI est une société française, dont l'hébergement est
            principalement européen.
          </Bullet>
          <Bullet>
            Tes données sont chiffrées pendant leur transport et au repos.
          </Bullet>
        </Section>

        <Section icon="key-outline" tint={colors.rose} title="Tes droits">
          <P>
            La base légale de ce traitement est ton consentement, au titre des
            articles 6.1.a et 9.2.a du RGPD. Tu peux le retirer quand tu veux,
            sans avoir à te justifier, en effaçant ton profil beauté depuis
            « Mon profil ». Le retrait ne remet pas en cause ce qui a été fait
            avant.
          </P>
          <P>
            Tu disposes également d'un droit d'accès, de rectification,
            d'effacement, de limitation et de portabilité. La suppression de ton
            compte efface tes données sous trente jours. Pour toute demande,
            écris à contact@cosme-check.com.
          </P>
        </Section>

        <Section icon="medkit-outline" tint={colors.warning} title="Ce n'est pas un avis médical">
          <P>
            Cosme Check est un outil d'information sur la composition des
            cosmétiques. Il ne pose aucun diagnostic et ne remplace pas l'avis
            d'un médecin ou d'un dermatologue. En cas de réaction cutanée, de
            traitement en cours ou de grossesse, demande conseil à un
            professionnel de santé.
          </P>
        </Section>

        {/* Documents complets, en modal : ouvrir une route ici ferait sortir de
            l'étape de consentement, que le guard réimposerait aussitôt. */}
        <View style={styles.linksRow}>
          <Pressable onPress={() => setLegalDoc('privacy')} hitSlop={8}>
            <Text style={styles.link}>Politique de confidentialité</Text>
          </Pressable>
          <Text style={styles.linkDot}>·</Text>
          <Pressable onPress={() => setLegalDoc('cgu')} hitSlop={8}>
            <Text style={styles.link}>Conditions d'utilisation</Text>
          </Pressable>
        </View>

        {/* Case à cocher : le geste qui vaut consentement. */}
        <Pressable
          onPress={toggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel="J'accepte l'utilisation de mon profil beauté, y compris par des modèles d'intelligence artificielle, pour personnaliser mes analyses"
          style={[styles.consentBox, checked && styles.consentBoxOn]}
        >
          <View style={[styles.checkbox, checked && styles.checkboxOn]}>
            {checked && <Ionicons name="checkmark" size={16} color={colors.surface} />}
          </View>
          <Text style={styles.consentText}>
            J'ai lu ce qui précède et j'accepte que mon profil beauté, y compris
            mes sensibilités et allergies déclarées, soit utilisé pour
            personnaliser mes analyses et mes conseils,{' '}
            <Text style={styles.consentStrong}>
              y compris en étant transmis à des modèles d'intelligence
              artificielle (OpenAI, Mistral AI)
            </Text>
            , dans les conditions décrites ci-dessus.
          </Text>
        </Pressable>
      </ScrollView>

      {/* Barre d'action fixe : le bouton reste inerte tant que la case n'est
          pas cochée. On ne le masque pas, pour que l'action à faire soit
          visible sans avoir à deviner. */}
      <View style={styles.footer}>
        <Pressable
          onPress={() => void accept()}
          disabled={!checked || saving}
          accessibilityRole="button"
          accessibilityState={{ disabled: !checked || saving }}
          style={({ pressed }) => [
            styles.cta,
            (!checked || saving) && styles.ctaOff,
            pressed && checked && styles.ctaPressed,
          ]}
        >
          {saving ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.ctaText}>Continuer</Text>
          )}
        </Pressable>
        {!checked && (
          <Text style={styles.footerHint}>
            Coche la case ci-dessus pour continuer.
          </Text>
        )}
      </View>

      <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </SafeAreaView>
  )
}

/**
 * Largeur de lecture maximale.
 *
 * Sur une fenêtre large (iPad, pliable, mode compatibilité), un paragraphe
 * étiré sur toute la largeur devient pénible à lire et c'est exactement ce que
 * la guideline 4 d'Apple sanctionne. On borne la colonne et on la centre.
 */
const READING_MAX_WIDTH = 560

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: {
    width: '100%',
    maxWidth: READING_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },

  // ── Encart « l'IA lit ton profil », en tête d'écran ──────────────────
  aiCallout: {
    marginTop: spacing.base,
    marginBottom: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: `${colors.accent}33`,
    gap: spacing.sm,
  },
  aiHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  aiIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiTitle: {
    ...typography.bodySemiBold,
    color: colors.ink,
    flex: 1,
  },
  aiPara: {
    ...typography.small,
    color: colors.ink,
    lineHeight: 20,
  },
  aiStrong: {
    ...typography.smallSemiBold,
    color: colors.ink,
  },
  aiFacts: {
    gap: 4,
  },
  aiFact: {
    ...typography.small,
    color: colors.inkMuted,
    lineHeight: 19,
  },
  aiMore: {
    ...typography.xs,
    color: colors.accentDeep,
  },

  heroIcon: {
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: radius.full,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.ink,
    textAlign: 'center',
  },
  lede: {
    ...typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },

  card: { marginBottom: spacing.md },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    ...typography.bodySemiBold,
    color: colors.ink,
    flex: 1,
  },
  para: {
    ...typography.small,
    color: colors.inkMuted,
    lineHeight: 21,
    marginTop: spacing.sm,
  },

  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: radius.full,
    marginTop: 8,
  },
  neverIcon: { marginTop: 1 },
  bulletText: {
    ...typography.small,
    color: colors.inkMuted,
    lineHeight: 21,
    flex: 1,
  },

  linksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  link: {
    ...typography.xs,
    color: colors.inkMuted,
    textDecorationLine: 'underline',
  },
  linkDot: { ...typography.xs, color: colors.inkLight },

  consentBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  consentBoxOn: {
    borderColor: colors.success,
    backgroundColor: colors.successSoft,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.inkLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  consentText: {
    ...typography.small,
    color: colors.ink,
    lineHeight: 20,
    flex: 1,
  },
  consentStrong: {
    ...typography.smallSemiBold,
    color: colors.ink,
  },

  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  cta: {
    width: '100%',
    maxWidth: READING_MAX_WIDTH - spacing.lg * 2,
    alignSelf: 'center',
    height: 54,
    borderRadius: radius.full,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaOff: { backgroundColor: colors.gray300 },
  ctaPressed: { backgroundColor: colors.successDeep },
  ctaText: { ...typography.button, color: colors.surface },
  footerHint: {
    ...typography.xs,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
})

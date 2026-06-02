/**
 * Écran « À propos » — contient :
 *   - l'avertissement médical (CRITIQUE pour les reviewers Apple/Play sur une
 *     app à thématique santé/cosmétique) ;
 *   - les sources INCI et crédits techniques ;
 *   - la version de l'application (extraite d'expo-constants).
 *
 * Tu peux pointer ici depuis la submission Apple / Google pour montrer que
 * l'app décline toute responsabilité médicale.
 */
import { StyleSheet, Text, View } from 'react-native'
import Constants from 'expo-constants'
import { Ionicons } from '@expo/vector-icons'

import { LegalScreen } from '@/components/legal/LegalScreen'
import { colors } from '@/constants/colors'
import { spacing, radius } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'

function appVersion(): string {
  const v = Constants.expoConfig?.version ?? '—'
  const build =
    (Constants.expoConfig?.ios?.buildNumber as string | undefined) ??
    (Constants.expoConfig?.android?.versionCode as number | undefined)?.toString()
  return build ? `${v} (build ${build})` : v
}

function MedicalDisclaimer() {
  return (
    <View style={styles.disclaimer}>
      <View style={styles.disclaimerHead}>
        <Ionicons name="medkit-outline" size={20} color={colors.rose} />
        <Text style={styles.disclaimerTitle}>Avertissement médical</Text>
      </View>
      <Text style={styles.disclaimerBody}>
        Cosme Check est un outil pédagogique et informatif. Les notes, scores et
        commentaires affichés ne constituent ni un avis médical, ni un diagnostic,
        ni une prescription. Ils ne remplacent en aucun cas la consultation d'un
        professionnel de santé (médecin, dermatologue, allergologue, pharmacien).
      </Text>
      <Text style={styles.disclaimerBody}>
        En cas de doute, de réaction cutanée ou de pathologie, consulte un
        professionnel. Aucun ingrédient « rouge » ne signifie qu'il sera nécessairement
        problématique pour toi, et aucun « vert » ne garantit qu'il sera bien toléré.
        L'analyse repose sur des données publiques sur les ingrédients et ne tient
        pas compte de la concentration réelle dans la formule ni de ta sensibilité
        individuelle.
      </Text>
    </View>
  )
}

function VersionFooter() {
  return (
    <View style={styles.versionBox}>
      <Text style={styles.versionLabel}>Version de l'application</Text>
      <Text style={styles.versionValue}>{appVersion()}</Text>
    </View>
  )
}

export default function AboutScreen() {
  return (
    <LegalScreen
      title="À propos"
      sections={[
        {
          paragraphs: [
            "Cosme Check t'aide à décrypter les compositions cosmétiques pour faire des choix éclairés, en t'expliquant le rôle de chaque ingrédient et en signalant ceux qui appellent à la vigilance selon les données publiques disponibles.",
          ],
        },
        {
          title: 'Sources des données',
          paragraphs: [
            "Notre base ingrédients agrège plusieurs sources publiques et propriétaires :",
          ],
          bullets: [
            "Open Beauty Facts et Open Products Facts (sous licence ODbL).",
            "CosIng — base européenne des ingrédients cosmétiques.",
            "Règlement (CE) N° 1223/2009 sur les produits cosmétiques.",
            "Base éditoriale Cosme Check (classifications, catégories d'usage, fonctions).",
          ],
        },
        {
          title: 'Méthode de notation',
          paragraphs: [
            "Chaque ingrédient reçoit une « tolérance » indicative (Vert / Jaune / Orange / Rouge) basée sur les données publiques disponibles : statut réglementaire, listes d'allergènes encadrés, controverses documentées et profil environnemental connu.",
            "Le score global d'un produit est une moyenne pondérée des tolérances, qui donne plus de poids aux ingrédients en début de liste (présents en plus grande quantité dans la formule).",
            "Cette note est une INDICATION pédagogique, pas un verdict. Voir l'avertissement médical ci-dessous.",
          ],
        },
        {
          title: 'Confidentialité',
          paragraphs: [
            "Nous ne lisons aucun identifiant publicitaire, n'utilisons aucun cookie tiers, et ne partageons pas tes données avec des annonceurs. Tes analyses, ta routine et tes restrictions sont stockées de manière sécurisée et accessibles uniquement par toi via ton compte.",
            "Détails dans la « Politique de confidentialité » accessible depuis « Mon profil ».",
          ],
        },
        {
          title: 'Beauty Advisor',
          paragraphs: [
            "L'assistant Beauty Advisor s'appuie sur des modèles de langage (OpenAI / Mistral) pour répondre à tes questions de manière contextuelle. Il est CADRÉ pour rester factuel : il ne donne aucun conseil médical, ne prescrit aucun produit ni aucune marque, et redirige vers un professionnel pour toute question de santé.",
          ],
        },
        {
          title: 'Crédits techniques',
          paragraphs: [
            "Cosme Check est développée avec React Native, Expo, Supabase (PostgreSQL + Edge Functions) et React Query. Le code est conçu pour fonctionner aussi bien en ligne qu'avec un cache local pour les analyses récentes.",
          ],
        },
        {
          title: 'Contact',
          paragraphs: [
            "Une question, un retour, un bug ? Écris-nous à contact@cosme-check.com.",
          ],
        },
      ]}
      footer={
        <View style={styles.footer}>
          <MedicalDisclaimer />
          <VersionFooter />
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  footer: { gap: spacing.lg, marginTop: spacing.lg },
  disclaimer: {
    backgroundColor: colors.roseSoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.rose,
  },
  disclaimerHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  disclaimerTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: colors.roseDeep,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  disclaimerBody: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
  versionBox: {
    alignItems: 'center',
    padding: spacing.lg,
    gap: 4,
  },
  versionLabel: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    color: colors.inkLight,
  },
  versionValue: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    color: colors.inkMuted,
  },
})

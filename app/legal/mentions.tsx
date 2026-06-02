/**
 * Écran « Mentions légales » — obligatoire en droit français (LCEN 2004-575,
 * art. 6-III). Identifie l'éditeur (Brian-Clarky Biendou, EI), le directeur
 * de la publication et l'hébergeur (Supabase / AWS eu-west-1).
 */
import { LegalScreen } from '@/components/legal/LegalScreen'

export default function MentionsScreen() {
  return (
    <LegalScreen
      title="Mentions légales"
      subtitle="Dernière mise à jour : 2 juin 2026"
      sections={[
        {
          title: 'Éditeur',
          paragraphs: [
            "L'application mobile Cosme Check est éditée par :",
          ],
          bullets: [
            "Raison sociale : Brian-Clarky BIENDOU",
            "Forme juridique : Entrepreneur individuel (EI)",
            "Siège social : 5 Bis rue Vestrepain, 31100 Toulouse, France",
            "SIREN : 919 153 189",
            "SIRET (siège) : 919 153 189 00015",
            "RCS Toulouse : 919 153 189",
            "Code APE / NAF : 8559B (Autres enseignements)",
            "N° TVA intracommunautaire : FR33919153189",
            "Email : contact@cosme-check.com",
          ],
        },
        {
          title: 'Directeur de la publication',
          paragraphs: [
            "Monsieur Brian-Clarky BIENDOU, en sa qualité d'entrepreneur individuel.",
          ],
        },
        {
          title: 'Hébergement',
          paragraphs: [
            "Les serveurs et la base de données sont hébergés par Supabase Inc. sur l'infrastructure Amazon Web Services (AWS), région eu-west-1 (Irlande).",
          ],
          bullets: [
            "Supabase Inc., 970 Toa Payoh North, #07-04, Singapour 318992.",
            "Amazon Web Services EMEA SARL, 38 avenue John F. Kennedy, L-1855 Luxembourg.",
          ],
        },
        {
          title: 'Distribution',
          paragraphs: [
            "L'application est distribuée via l'Apple App Store (Apple Distribution International Limited, Hollyhill Industrial Estate, Hollyhill, Cork, T23 YK84, Irlande) et le Google Play Store (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irlande).",
          ],
        },
        {
          title: 'Propriété intellectuelle',
          paragraphs: [
            "L'ensemble des éléments composant l'Application — code source, interface, charte graphique, logos, illustrations, textes éditoriaux, algorithmes de notation — est protégé par le droit d'auteur et le droit des marques. Toute reproduction, représentation ou exploitation non autorisée est interdite.",
            "Les marques de produits cosmétiques éventuellement citées dans l'Application restent la propriété de leurs détenteurs respectifs. Leur mention vise uniquement à fournir une information factuelle à l'utilisateur, sans aucune affiliation ni endossement.",
          ],
        },
        {
          title: 'Sources des données ingrédients (INCI)',
          paragraphs: [
            "La base de connaissances ingrédients de Cosme Check s'appuie sur des sources publiques et propriétaires :",
          ],
          bullets: [
            "Open Beauty Facts (openbeautyfacts.org) — base collaborative sous licence Open Database License (ODbL).",
            "Open Products Facts (openproductsfacts.org) — base collaborative sous licence ODbL.",
            "CosIng — la base européenne d'ingrédients cosmétiques publiée par la Commission européenne.",
            "Annexes du Règlement (CE) N° 1223/2009 sur les produits cosmétiques.",
            "Base d'ingrédients enrichie et catégorisée par l'équipe éditoriale de Cosme Check.",
          ],
        },
        {
          title: 'Crédits techniques',
          paragraphs: [
            "L'Application est développée en React Native via le framework Expo. Les principales briques techniques utilisées sont mentionnées dans l'écran « À propos ».",
          ],
        },
        {
          title: 'Signalement d\'un contenu',
          paragraphs: [
            "Conformément à la LCEN, tout contenu illicite peut être signalé à contact@cosme-check.com. Nous nous engageons à examiner ces signalements et à agir promptement si la demande est fondée.",
          ],
        },
      ]}
    />
  )
}

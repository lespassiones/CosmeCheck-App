/**
 * Écran « Conditions Générales d'Utilisation » — texte complet, conforme aux
 * exigences App Store & Play Store (Apple §3.1 / Google Play Policy §4.8).
 *
 * Éditeur : Brian-Clarky BIENDOU, entrepreneur individuel (Toulouse, FR).
 */
import { LegalScreen } from '@/components/legal/LegalScreen'

export default function CguScreen() {
  return (
    <LegalScreen
      title="Conditions d'utilisation"
      subtitle="Dernière mise à jour : 2 juin 2026"
      sections={[
        {
          paragraphs: [
            "Les présentes Conditions Générales d'Utilisation (« CGU ») régissent l'usage de l'application mobile Cosme Check (« l'Application »), éditée par Monsieur Brian-Clarky BIENDOU, entrepreneur individuel immatriculé au RCS de Toulouse sous le numéro 919 153 189, dont le siège est situé 5 Bis rue Vestrepain, 31100 Toulouse, France (« l'Éditeur »), et l'ensemble des services associés. En téléchargeant, installant ou utilisant l'Application, tu acceptes sans réserve les présentes CGU.",
          ],
        },
        {
          title: '1. Objet du service',
          paragraphs: [
            "Cosme Check est une application d'analyse de produits cosmétiques destinée au grand public. Elle te permet : de scanner le code-barres d'un produit ou de saisir sa liste d'ingrédients (INCI), d'obtenir une décomposition pédagogique de la formule, de constituer une routine, de comparer des produits et de poser des questions à un assistant IA.",
            "L'Application ne remplace en aucun cas l'avis d'un professionnel de santé (médecin, dermatologue, pharmacien). Voir l'avertissement médical dans la rubrique « À propos ».",
          ],
        },
        {
          title: '2. Acceptation et modification',
          paragraphs: [
            "L'utilisation de l'Application implique l'acceptation pleine et entière des présentes CGU. L'Éditeur se réserve le droit de modifier les CGU à tout moment. La date de dernière mise à jour figure en haut de cet écran. En continuant d'utiliser l'Application après modification, tu acceptes les nouvelles CGU.",
          ],
        },
        {
          title: '3. Compte utilisateur',
          paragraphs: [
            "L'accès aux fonctionnalités personnelles (historique, routine, profil beauté) nécessite la création d'un compte avec une adresse email valide. Tu t'engages à fournir des informations exactes et à conserver tes identifiants de connexion confidentiels.",
            "Tu peux te déconnecter ou demander la suppression de ton compte à tout moment depuis l'écran « Mon profil ».",
          ],
        },
        {
          title: '4. Crédits et abonnement Premium',
          paragraphs: [
            "L'Application est gratuite à l'usage et inclut un quota quotidien d'analyses. Au-delà du quota, l'accès aux analyses peut être limité jusqu'au renouvellement quotidien (à minuit UTC) ou via l'abonnement Premium.",
            "L'abonnement Premium est facturé via les stores Apple App Store et Google Play. Les conditions de facturation, renouvellement automatique et remboursement sont régies par les conditions des stores respectifs.",
            "Pour un abonnement souscrit directement sur le site (hors stores), tu disposes d'un droit de rétractation de 14 jours. En cas de rétractation dans ce délai après avoir commencé à utiliser Premium, seul le temps d'abonnement non utilisé est remboursé.",
          ],
        },
        {
          title: '5. Utilisation conforme',
          paragraphs: ["Tu t'engages à utiliser l'Application :"],
          bullets: [
            "à des fins personnelles et non commerciales ;",
            "sans porter atteinte à son fonctionnement (reverse engineering, contournement des limites, scraping massif) ;",
            "dans le respect des lois en vigueur et des droits des tiers ;",
            "sans publier ou téléverser de contenu illégal, diffamatoire ou portant atteinte à un tiers via l'Application.",
          ],
        },
        {
          title: '6. Propriété intellectuelle',
          paragraphs: [
            "L'Application, son interface, ses textes, ses illustrations et son code source sont la propriété de l'Éditeur ou de ses ayants droit. Toute reproduction, représentation ou diffusion non autorisée est interdite et susceptible de poursuites.",
            "Les données INCI proviennent de bases publiques (notamment Open Beauty Facts) sous licence ODbL ainsi que de bases propriétaires développées par l'Éditeur.",
          ],
        },
        {
          title: '7. Données et confidentialité',
          paragraphs: [
            "Le traitement de tes données personnelles est détaillé dans la Politique de confidentialité accessible depuis l'écran « Mon profil ».",
          ],
        },
        {
          title: '8. Limitation de responsabilité',
          paragraphs: [
            "L'Application fournit des informations à titre éducatif et informatif uniquement. Les notations, scores et commentaires ne constituent pas un avis médical, un diagnostic, une prescription ni une garantie d'innocuité pour un individu donné.",
            "L'Éditeur ne saurait être tenu responsable des conséquences d'un usage des informations affichées, notamment en cas de réaction allergique, d'intolérance ou d'effet indésirable. En cas de doute, consulte un professionnel de santé.",
            "L'Application est fournie « en l'état ». L'Éditeur ne garantit pas l'absence d'erreurs, d'interruptions ou d'incompatibilités, et se réserve le droit de modifier ou suspendre tout ou partie du service sans préavis.",
          ],
        },
        {
          title: '9. Résiliation',
          paragraphs: [
            "Tu peux désinstaller l'Application et demander la suppression de ton compte à tout moment. L'Éditeur se réserve le droit de suspendre l'accès en cas de violation grave des présentes CGU.",
          ],
        },
        {
          title: '10. Droit applicable et juridiction',
          paragraphs: [
            "Les présentes CGU sont régies par le droit français. Tout litige relatif à leur interprétation ou exécution relève, à défaut de résolution amiable, des tribunaux compétents du ressort du siège social de l'Éditeur.",
            "Conformément à l'article L.612-1 du Code de la consommation, tu peux recourir gratuitement au médiateur de la consommation en vue de la résolution amiable d'un litige.",
          ],
        },
        {
          title: '11. Contact',
          paragraphs: [
            "Pour toute question relative aux présentes CGU, contacte-nous à contact@cosme-check.com.",
          ],
        },
      ]}
    />
  )
}

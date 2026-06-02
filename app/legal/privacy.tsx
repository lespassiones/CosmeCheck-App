/**
 * Écran « Politique de confidentialité » — conforme RGPD (UE 2016/679) et
 * exigences Apple App Store §5.1 / Google Play Data safety. Doit être
 * accessible AVANT l'inscription (lien dans /sign-up) ET depuis le profil.
 */
import { LegalScreen } from '@/components/legal/LegalScreen'

export default function PrivacyScreen() {
  return (
    <LegalScreen
      title="Confidentialité"
      subtitle="Dernière mise à jour : 2 juin 2026"
      sections={[
        {
          paragraphs: [
            "La présente Politique de confidentialité explique comment Cosme Check (« nous », « l'Application ») collecte, utilise et protège tes données personnelles, conformément au Règlement Général sur la Protection des Données (RGPD, UE 2016/679) et à la loi Informatique et Libertés.",
          ],
        },
        {
          title: '1. Responsable du traitement',
          paragraphs: [
            "Le responsable du traitement de tes données est Monsieur Brian-Clarky BIENDOU, entrepreneur individuel, dont le siège est situé au 5 Bis rue Vestrepain, 31100 Toulouse (France), immatriculé au RCS de Toulouse sous le numéro 919 153 189 (SIRET : 919 153 189 00015).",
            "Email de contact : contact@cosme-check.com",
          ],
        },
        {
          title: '2. Données collectées',
          paragraphs: [
            "Nous collectons uniquement les données strictement nécessaires au fonctionnement du service :",
          ],
          bullets: [
            "Données de compte : email, prénom (optionnel), mot de passe chiffré.",
            "Profil beauté : type de peau, préoccupations, allergies déclarées, restrictions d'ingrédients (saisis volontairement par toi).",
            "Activité dans l'app : analyses effectuées, produits ajoutés à la routine, comparaisons, conversations avec l'assistant Beauty Advisor.",
            "Données techniques : identifiant utilisateur, horodatage des actions, compteurs de quota quotidien, logs d'erreurs anonymes.",
            "Lorsque tu scannes un produit : le code-barres ou la photo de la liste INCI. La photo est traitée pour extraire le texte puis n'est PAS conservée sur nos serveurs.",
          ],
        },
        {
          title: '3. Finalités',
          paragraphs: ["Tes données sont traitées pour les finalités suivantes :"],
          bullets: [
            "Te fournir l'analyse des produits cosmétiques et personnaliser les résultats selon ton profil et tes restrictions.",
            "Mémoriser ton historique, ta routine et tes préférences entre les sessions.",
            "Sécuriser ton compte (authentification, anti-abus, limitation de débit).",
            "Améliorer le service (statistiques d'usage agrégées et anonymes).",
            "Te répondre quand tu nous contactes.",
          ],
        },
        {
          title: '4. Base légale',
          paragraphs: [
            "Le traitement repose sur l'exécution du contrat qui te lie au service (art. 6.1.b RGPD) pour ce qui concerne la fourniture des fonctionnalités, et sur ton consentement (art. 6.1.a RGPD) pour les données sensibles que tu choisis volontairement d'inscrire (préoccupations cutanées, allergies).",
          ],
        },
        {
          title: '5. Durée de conservation',
          bullets: [
            "Données de compte et profil beauté : conservées tant que ton compte est actif. En cas de demande de suppression, effacement sous 30 jours.",
            "Analyses et routine : conservées tant que ton compte est actif.",
            "Logs techniques : 30 jours maximum.",
            "Logs de modération d'erreurs : 14 jours maximum.",
            "Photos OCR : non conservées (traitement à la volée).",
          ],
        },
        {
          title: '6. Destinataires et sous-traitants',
          paragraphs: ["Tes données sont hébergées et traitées par les sous-traitants suivants :"],
          bullets: [
            "Supabase (base de données et authentification) — serveurs Amazon Web Services en Irlande (région eu-west-1). Conformité RGPD assurée par les Clauses Contractuelles Types.",
            "OpenAI / Mistral AI (modèles de langage utilisés par l'assistant Beauty Advisor et les fonctionnalités d'aide rédactionnelle) — invoqués sans stockage des messages côté modèle ; transferts encadrés par les conditions de service de ces fournisseurs.",
            "Apple App Store / Google Play (gestion des abonnements Premium).",
          ],
        },
        {
          title: '7. Transferts hors UE',
          paragraphs: [
            "Les appels aux modèles OpenAI peuvent impliquer un transfert temporaire de données vers les États-Unis. Ces transferts sont encadrés par les Clauses Contractuelles Types de la Commission européenne. Aucune donnée sensible (santé) n'est transmise sans ton initiative explicite (poser une question à l'assistant).",
          ],
        },
        {
          title: '8. Tes droits',
          paragraphs: ["Conformément aux articles 15 à 22 du RGPD, tu disposes des droits suivants :"],
          bullets: [
            "Droit d'accès : connaître les données que nous détenons sur toi.",
            "Droit de rectification : corriger une donnée inexacte.",
            "Droit à l'effacement (« droit à l'oubli ») : demander la suppression de tes données.",
            "Droit à la limitation et à l'opposition au traitement.",
            "Droit à la portabilité : récupérer tes données dans un format structuré.",
            "Droit de définir des directives post-mortem sur le sort de tes données.",
            "Droit d'introduire une réclamation auprès de la CNIL (www.cnil.fr).",
          ],
        },
        {
          paragraphs: [
            "Pour exercer ces droits, écris-nous à contact@cosme-check.com en précisant l'objet de ta demande. Réponse sous 30 jours maximum.",
            "Tu peux supprimer toi-même ton compte directement depuis l'écran « Mon profil » → « Supprimer mon compte ».",
          ],
        },
        {
          title: '9. Cookies et traceurs',
          paragraphs: [
            "L'Application mobile n'utilise PAS de cookies publicitaires, ni de traceurs marketing tiers. Aucun ID publicitaire (IDFA, GAID) n'est lu ni transmis. Les seules informations stockées localement sont indispensables au fonctionnement de l'app (session, cache des analyses, préférences).",
          ],
        },
        {
          title: '10. Sécurité',
          paragraphs: [
            "Tes données sont chiffrées en transit (HTTPS / TLS) et au repos (chiffrement des bases Supabase). L'accès aux données serveur est contrôlé par Row Level Security (RLS) Postgres, garantissant qu'aucun autre utilisateur ne peut accéder aux tiennes.",
          ],
        },
        {
          title: '11. Mineurs',
          paragraphs: [
            "L'Application est destinée à un public de 13 ans et plus. Si tu as moins de 16 ans (UE) ou l'âge légal applicable dans ton pays, tu dois obtenir l'autorisation d'un parent ou tuteur avant de créer un compte.",
          ],
        },
        {
          title: '12. Modification',
          paragraphs: [
            "Nous pouvons mettre à jour cette politique. Toute modification substantielle sera notifiée dans l'Application avant son entrée en vigueur. La date en haut indique la version courante.",
          ],
        },
      ]}
    />
  )
}

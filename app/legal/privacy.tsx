/**
 * Écran « Politique de confidentialité » — conforme RGPD (UE 2016/679) et
 * exigences Apple App Store §5.1 / Google Play Data safety. Doit être
 * accessible AVANT l'inscription (lien dans /sign-up) ET depuis le profil.
 */
import { LegalScreen, type LegalSection } from '@/components/legal/LegalScreen'
import { STORE_NAME } from '@/lib/legal/store'

const PRIVACY_SECTIONS: LegalSection[] = [
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
            "Lorsque tu scannes un produit : le code-barres du produit.",
            "Si tu proposes une photo pour signaler ou illustrer un produit : cette photo est conservée sur nos serveurs afin d'être vérifiée par notre équipe de modération.",
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
            "Photos proposées pour un produit (signalement / illustration) : conservées le temps de leur modération, puis supprimées si elles sont rejetées.",
          ],
        },
        {
          title: '6. Destinataires et sous-traitants',
          paragraphs: [
            "Tes données sont hébergées et traitées par les sous-traitants suivants, chacun agissant sur nos instructions et sans réutilisation à leurs propres fins :",
          ],
          bullets: [
            "Supabase (base de données et authentification) — serveurs Amazon Web Services en Irlande (région eu-west-1, UE). Conformité RGPD assurée par les Clauses Contractuelles Types.",
            "OpenAI (modèles d'IA générative utilisés par l'assistant Beauty Advisor et par la personnalisation des analyses, synthèses et comparaisons) — États-Unis, transferts encadrés par les Clauses Contractuelles Types ; données API non utilisées pour l'entraînement, conservées 30 jours maximum côté fournisseur.",
            "Mistral AI (modèles d'IA, en complément / secours d'OpenAI) — société française, hébergement principalement dans l'Union européenne.",
            "PostHog (mesure d'audience anonyme, pour comprendre l'usage global de l'app) — serveurs situés dans l'Union européenne ; aucune donnée nominative ni enregistrement d'écran.",
            "Sentry (détection des plantages et erreurs techniques) — serveurs situés dans l'Union européenne (Allemagne).",
            "RevenueCat (gestion technique des abonnements) — identifiant technique d'abonnement, sans profil beauté ni contenu d'analyse.",
            "Expo (Expo Push, envoi des notifications) — uniquement si tu as activé les notifications ; un jeton technique d'appareil est transmis.",
            "Brevo (envoi des emails de service et, si tu y as consenti, de la newsletter) — hébergement dans l'Union européenne ; reçoit ton email et ton prénom.",
            `${STORE_NAME} (gestion et facturation des abonnements Premium).`,
          ],
        },
        {
          title: '7. Transferts hors UE et traitement par IA',
          paragraphs: [
            "Pour personnaliser tes analyses, tes synthèses, tes comparaisons et les réponses de l'assistant Beauty Advisor, les informations nécessaires — y compris, le cas échéant, ton profil beauté (type de peau, sensibilités, restrictions d'ingrédients) et la composition des produits — sont transmises de façon sécurisée à nos prestataires d'intelligence artificielle (OpenAI et Mistral AI). Ce traitement n'a lieu que si tu as renseigné ces informations et repose sur ton consentement (art. 6.1.a et 9.2.a RGPD).",
            "Les appels aux modèles OpenAI impliquent un transfert de données vers les États-Unis, encadré par les Clauses Contractuelles Types de la Commission européenne. Les données transmises via l'API ne sont pas utilisées pour entraîner les modèles et sont conservées 30 jours maximum côté fournisseur. Tu peux à tout moment retirer ton consentement en effaçant ton profil beauté depuis « Mon profil ».",
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
            "L'Application mobile n'utilise PAS de cookies publicitaires, ni de traceurs marketing tiers. Aucun identifiant publicitaire (IDFA, GAID) n'est lu ni transmis.",
            "Nous utilisons uniquement un outil de mesure d'audience anonyme (PostHog) pour comprendre l'usage global de l'app (nombre de scans, taux de complétion de l'onboarding). Cette mesure ne t'identifie pas nominativement, n'enregistre pas ton écran et ne recoupe pas ton activité avec d'autres services : elle est donc exemptée de consentement. Les autres informations stockées localement sont indispensables au fonctionnement de l'app (session, cache des analyses, préférences).",
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
]

export const PRIVACY_CONTENT = {
  title: 'Confidentialité',
  subtitle: 'Dernière mise à jour : 2 juin 2026',
  sections: PRIVACY_SECTIONS,
}

export default function PrivacyScreen() {
  return <LegalScreen {...PRIVACY_CONTENT} />
}

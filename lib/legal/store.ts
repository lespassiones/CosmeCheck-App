/**
 * Nom et identité juridique du magasin qui distribue l'app, selon la plateforme.
 *
 * Pourquoi ce module. Les textes légaux sont communs aux deux plateformes et
 * nommaient donc les deux magasins dans la même phrase. C'est juste sur le fond,
 * mais la règle 2.3.10 d'Apple interdit de faire figurer le nom d'une autre
 * plateforme mobile dans l'app, et un écran de CGU consulté sur iPhone qui parle
 * de Google Play est exactement ce qu'un vérificateur relève.
 *
 * On ne supprime donc pas l'information, on la rend exacte pour la personne qui
 * la lit : sur iPhone elle ne concerne que l'App Store, sur Android que Google
 * Play. Chacun voit les conditions du magasin qui l'a réellement débité.
 */

import { Platform } from 'react-native'

const IOS = Platform.OS === 'ios'

/** « App Store » ou « Google Play ». Le magasin qui encaisse, ici et maintenant. */
export const STORE_NAME = IOS ? 'App Store' : 'Google Play'

/** Formulation longue pour les phrases de facturation. */
export const STORE_NAME_LONG = IOS ? "l'Apple App Store" : 'le Google Play Store'

/** Entité juridique distributrice, exigée dans les mentions légales. */
export const STORE_ENTITY = IOS
  ? "Apple Distribution International Limited, Hollyhill Industrial Estate, Hollyhill, Cork, T23 YK84, Irlande"
  : 'Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irlande'

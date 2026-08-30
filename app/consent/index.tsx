/**
 * ConsentScreen : étape de consentement, entre l'authentification et le
 * questionnaire de profil.
 *
 * Route volontairement placée hors des groupes `( )` : elle porte donc le
 * segment `consent`, que l'AuthGuard reconnaît sans ambiguïté, et surtout elle
 * ne revendique pas `/`. Quatre groupes se le disputaient déjà, et c'est ce qui
 * faisait s'ouvrir l'app sur l'écran de connexion.
 */

import { type FC } from 'react'
import { StatusBar } from 'expo-status-bar'

import { DataConsentScreen } from '@/components/consent/DataConsentScreen'

const ConsentScreen: FC = () => (
  <>
    <StatusBar style="dark" />
    <DataConsentScreen />
  </>
)

export default ConsentScreen

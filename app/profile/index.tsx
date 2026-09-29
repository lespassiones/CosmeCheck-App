/**
 * /profile : le profil est devenu un onglet de la barre du bas (28/09/2026).
 * Cette route reste pour les liens existants et renvoie vers l'onglet.
 *
 * dismissTo, pas <Redirect> : Redirect fait un replace depuis la pile racine,
 * qui empilait une 2e copie complète des onglets par-dessus la première.
 */

import { useEffect, type FC } from 'react'
import { router } from 'expo-router'

import { ROUTES } from '@/constants/routes'

const ProfileRedirect: FC = () => {
  useEffect(() => {
    router.dismissTo(ROUTES.TABS.PROFIL)
  }, [])
  return null
}

export default ProfileRedirect

/**
 * /profile : le profil est devenu un onglet de la barre du bas (28/09/2026).
 * Cette route reste pour les liens existants et renvoie vers l'onglet.
 */

import type { FC } from 'react'
import { Redirect } from 'expo-router'

import { ROUTES } from '@/constants/routes'

const ProfileRedirect: FC = () => <Redirect href={ROUTES.TABS.PROFIL} />

export default ProfileRedirect

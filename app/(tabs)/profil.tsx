/**
 * Onglet Profil (barre du bas, à la place de l'ancien onglet Promesses depuis
 * le 28/09/2026). L'écran lui-même vit dans components/profile/ProfileScreen.
 */

import type { FC } from 'react'

import { ProfileScreen } from '@/components/profile/ProfileScreen'

const ProfilTab: FC = () => <ProfileScreen inTab />

export default ProfilTab

/**
 * Client Supabase configuré pour Expo / React Native.
 *
 * - URL + clé anon depuis les variables d'environnement EXPO_PUBLIC_*.
 * - Stockage de session via AsyncStorage (approche officielle Supabase + Expo).
 *   Note : expo-secure-store a une limite ~2 Ko qui tronque silencieusement
 *   les JWT longs et casse l'auth. On utilise donc AsyncStorage ici ;
 *   on pourra passer à un SecureStore chunké plus tard si besoin.
 * - `react-native-url-polyfill` est requis par supabase-js sous RN.
 *
 * IMPORTANT (schéma) : les tables métier vivent dans le schéma PostgreSQL
 * `cosme_check`. On y accède via `db()` (= supabase.schema('cosme_check')).
 * Cela suppose que `cosme_check` est exposé dans
 * Supabase Dashboard > Project Settings > API > Exposed schemas
 * (déjà le cas pour le web). Les RPC publiques `cosme_check_*` restent
 * appelables via `supabase.rpc(...)`.
 */

import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

import type { Database } from './types'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variables Supabase manquantes : définis EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY dans .env',
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

/** Accès typé au schéma applicatif `cosme_check`. */
export const db = () => supabase.schema('cosme_check')

/** Base URL de l'API web CosmetWiki (pour les features IA, branchées plus tard). */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://www.cosme-check.com'

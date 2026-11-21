/**
 * Retient l'écran de démarrage au tout premier lancement le temps d'appliquer
 * une OTA déjà publiée (3 s au plus). Voir `lib/updates/firstLaunchUpdate.ts`.
 *
 * Renvoie `true` tant qu'il faut garder l'écran de démarrage. Aucun
 * téléchargement en double : on observe celui que expo-updates lance déjà au
 * démarrage (`checkAutomatically` ON_LOAD), puis on recharge s'il aboutit.
 */

import { useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Updates from 'expo-updates'

import {
  FIRST_LAUNCH_UPDATE_KEY,
  FIRST_LAUNCH_UPDATE_MAX_MS,
  firstLaunchStep,
} from '@/lib/updates/firstLaunchUpdate'

// Compté depuis l'évaluation du module, donc au plus près du démarrage du JS.
const BOOT_AT = Date.now()

// Hors build de store (dev, Expo Go) ou déjà sur une OTA : rien à attendre.
const SUPPORTED = !__DEV__ && Updates.isEnabled && Updates.isEmbeddedLaunch

export function useFirstLaunchUpdateHold(): boolean {
  const { isUpdatePending, isStartupProcedureRunning } = Updates.useUpdates()
  const [eligible, setEligible] = useState<boolean | null>(SUPPORTED ? null : false)
  const [expired, setExpired] = useState(() => Date.now() - BOOT_AT >= FIRST_LAUNCH_UPDATE_MAX_MS)
  const [released, setReleased] = useState(!SUPPORTED)
  const reloading = useRef(false)

  useEffect(() => {
    if (!SUPPORTED) return
    let alive = true
    void (async () => {
      try {
        const seen = await AsyncStorage.getItem(FIRST_LAUNCH_UPDATE_KEY)
        if (!seen) await AsyncStorage.setItem(FIRST_LAUNCH_UPDATE_KEY, String(Date.now()))
        if (alive) setEligible(!seen)
      } catch {
        if (alive) setEligible(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (released || expired) return
    const t = setTimeout(() => setExpired(true), Math.max(0, FIRST_LAUNCH_UPDATE_MAX_MS - (Date.now() - BOOT_AT)))
    return () => clearTimeout(t)
  }, [released, expired])

  const step = released
    ? 'release'
    : firstLaunchStep({ eligible, expired, isUpdatePending, isStartupProcedureRunning })

  useEffect(() => {
    if (step === 'release') {
      // Verrou : une fois l'app lâchée, plus jamais de rechargement à chaud.
      // Un rechargement déjà lancé n'est pas interrompu par le plafond.
      if (!reloading.current) setReleased(true)
      return
    }
    if (step !== 'reload' || reloading.current) return
    reloading.current = true
    Updates.reloadAsync().catch(() => setReleased(true))
  }, [step])

  // Le plafond de l'écran animé (`MAX_WAIT`) reste le filet ultime.
  return !released && (reloading.current || step !== 'release')
}

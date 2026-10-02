/**
 * Mesure des publicités Meta (Facebook, Instagram) : SDK Meta minimal + ATT +
 * relais RevenueCat. Ajouté le 29/09/2026.
 *
 * CE QUI PART CHEZ META, ET RIEN D'AUTRE :
 *   - l'installation et les ouvertures de l'app (journal automatique du SDK) ;
 *   - l'essai, l'achat et les renouvellements, envoyés CÔTÉ SERVEUR par
 *     RevenueCat (intégration « Meta Ads » du tableau de bord RevenueCat), qui
 *     relie l'achat à la pub grâce à l'identifiant anonyme Meta qu'on lui passe.
 * JAMAIS de donnée de peau, de santé ou de profil (article 9 RGPD) : ce module
 * n'envoie aucun événement personnalisé.
 *
 * CONSENTEMENT D'ABORD : le SDK est configuré dans app.json SANS démarrage
 * automatique, sans journal automatique et sans collecte d'identifiant
 * publicitaire. Il ne démarre qu'après accord (ATT sur iPhone, choix dans l'app
 * sur Android). Refus = rien ne part.
 *
 * Modules natifs chargés PARESSEUSEMENT (comme lib/notifications/native.ts) :
 * une mise à jour OTA peut arriver sur un binaire construit avant leur ajout.
 * Module absent = no-op silencieux, jamais de crash.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { Alert, Platform } from 'react-native'

import { shareAdIdentifiers } from '@/lib/revenucat/client'

import {
  isValidMetaAppId,
  resolveAdsConsent,
  type AdsConsent,
  type AttStatus,
  type StoredChoice,
} from './consentCore'

const STORAGE_KEY = 'cosmecheck:ads_consent'

// Volontairement `any` : les packages peuvent être absents du binaire.
type AnyModule = any // eslint-disable-line @typescript-eslint/no-explicit-any

let fbCached: AnyModule | null | undefined
let attCached: AnyModule | null | undefined

function fbsdk(): AnyModule | null {
  if (fbCached !== undefined) return fbCached
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const mod = require('react-native-fbsdk-next')
    fbCached = mod?.Settings && mod?.AppEventsLogger ? mod : null
  } catch {
    fbCached = null
  }
  return fbCached
}

function attModule(): AnyModule | null {
  if (attCached !== undefined) return attCached
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    attCached = require('expo-tracking-transparency') ?? null
  } catch {
    attCached = null
  }
  return attCached
}

/** App ID lu dans la config du plugin (un seul endroit à remplir : app.json). */
function metaAppId(): string | null {
  const plugins = (Constants.expoConfig?.plugins ?? []) as unknown[]
  for (const p of plugins) {
    if (Array.isArray(p) && p[0] === 'react-native-fbsdk-next') {
      const id = (p[1] as { appID?: unknown } | undefined)?.appID
      return isValidMetaAppId(id) ? id : null
    }
  }
  return null
}

/** Tout est-il là pour mesurer ? (binaire à jour + App ID Meta rempli) */
export function metaAdsAvailable(): boolean {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false
  return fbsdk() != null && metaAppId() != null
}

async function readAtt(): Promise<AttStatus> {
  if (Platform.OS !== 'ios') return 'unavailable'
  const att = attModule()
  if (!att) return 'unavailable'
  try {
    const res = await att.getTrackingPermissionsAsync()
    if (res.granted) return 'granted'
    return res.status === 'undetermined' ? 'undetermined' : 'denied'
  } catch {
    return 'unavailable'
  }
}

async function readStored(): Promise<StoredChoice> {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY)
    return v === 'granted' || v === 'denied' ? v : null
  } catch {
    return null
  }
}

async function store(choice: 'granted' | 'denied'): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // best-effort : au pire la question reviendra au prochain lancement.
  }
}

export async function getAdsConsent(): Promise<AdsConsent> {
  const [att, stored] = await Promise.all([readAtt(), readStored()])
  return resolveAdsConsent({ platform: Platform.OS, att, stored })
}

let started = false

/**
 * Démarre le SDK Meta (une fois par lancement) puis passe les identifiants à
 * RevenueCat. Appelé seulement quand le consentement est acquis.
 */
async function startMeta(): Promise<void> {
  const fb = fbsdk()
  if (!fb) return
  try {
    if (!started) {
      if (Platform.OS === 'ios') await fb.Settings.setAdvertiserTrackingEnabled(true)
      fb.Settings.setAdvertiserIDCollectionEnabled(true)
      fb.Settings.setAutoLogAppEventsEnabled(true)
      fb.Settings.initializeSDK()
      started = true
    }
    const anonId: string | null = await fb.AppEventsLogger.getAnonymousID()
    await shareAdIdentifiers(anonId)
  } catch (err) {
    console.warn('[MetaAds] démarrage impossible :', err)
  }
}

/** Retrait du consentement (Android, depuis le Profil) : on coupe tout. */
function stopMeta(): void {
  const fb = fbsdk()
  if (!fb) return
  try {
    fb.Settings.setAutoLogAppEventsEnabled(false)
    fb.Settings.setAdvertiserIDCollectionEnabled(false)
  } catch {
    // best-effort
  }
  started = false
}

/**
 * Au lancement, et après la connexion (RevenueCat change d'identifiant, les
 * identifiants publicitaires doivent suivre) : démarre si déjà consenti.
 * Ne pose JAMAIS la question.
 */
export async function syncMetaAds(): Promise<void> {
  if (!metaAdsAvailable()) return
  if ((await getAdsConsent()) === 'granted') await startMeta()
}

/** `null` : alerte fermée sans choisir (on redemandera plus tard). */
function askAndroid(): Promise<boolean | null> {
  return new Promise((resolve) => {
    Alert.alert(
      'Mesurer nos publicités ?',
      "Cosme Check peut indiquer à Meta (Facebook, Instagram) que l'app a été installée et " +
        "qu'un abonnement a été pris, pour savoir quelles publicités fonctionnent. " +
        "Aucune donnée de peau, de santé ou de profil n'est partagée. " +
        "Tu peux changer d'avis à tout moment dans Profil.",
      [
        { text: 'Refuser', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Autoriser', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    )
  })
}

let asking: Promise<void> | null = null

/**
 * Pose la question UNE fois (fenêtre ATT sur iPhone, alerte sur Android), puis
 * démarre si c'est oui. Sans effet si déjà répondu ou si rien n'est configuré.
 * Sur Android, fermer l'alerte sans choisir ne compte pas comme une réponse.
 */
export function askAdsConsentOnce(): Promise<void> {
  if (asking) return asking
  asking = (async () => {
    if (!metaAdsAvailable()) return
    const consent = await getAdsConsent()
    if (consent === 'granted') return startMeta()
    if (consent === 'denied') return

    if (Platform.OS === 'ios') {
      const att = attModule()
      if (!att) return
      try {
        const res = await att.requestTrackingPermissionsAsync()
        if (res.granted) await startMeta()
      } catch {
        // fenêtre refusée par le système : on réessaiera au prochain lancement.
      }
      return
    }

    const accepted = await askAndroid()
    if (accepted === null) return
    await store(accepted ? 'granted' : 'denied')
    if (accepted) await startMeta()
  })().finally(() => {
    asking = null
  })
  return asking
}

/** Interrupteur du Profil (Android). Sur iPhone, c'est Réglages qui décide. */
export async function setAdsConsent(granted: boolean): Promise<void> {
  await store(granted ? 'granted' : 'denied')
  if (granted) await startMeta()
  else stopMeta()
}

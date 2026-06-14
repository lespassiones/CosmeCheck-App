/**
 * SubmitProductPhotosSheet — modale « Ajouter une photo de ce produit ».
 *
 * Reformulation de « Envoyer de nouvelles photos ». N'apparaît que lorsque le
 * produit analysé n'a pas d'image. L'utilisateur peut joindre 1 OU 2 photos
 * (caméra ou galerie) ; elles sont compressées en WebP, envoyées dans le bucket
 * et mises en file de modération (catalog_photo_submissions). Un admin les
 * valide ensuite côté web → la photo retenue devient l'image du produit.
 */
import { useState, type FC } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'

import { colors } from '@/constants/colors'
import { fontFamilies } from '@/constants/typography'
import { radius, spacing } from '@/constants/spacing'
import { submitProductPhotos } from '@/lib/productTools/photoSubmission'

interface Props {
  visible: boolean
  onClose: () => void
  productEan: string | null
  brand: string | null
  productName: string | null
  category: string | null
}

type Phase = 'form' | 'sending' | 'done' | 'error'

export const SubmitProductPhotosSheet: FC<Props> = ({
  visible,
  onClose,
  productEan,
  brand,
  productName,
  category,
}) => {
  const [uris, setUris] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('form')

  function reset() {
    setUris([])
    setPhase('form')
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function pickFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(
        'Caméra non autorisée',
        "Autorise l'accès à la caméra dans les réglages pour ajouter une photo.",
      )
      return
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 1 })
    if (!result.canceled && result.assets[0]) {
      setUris((prev) => [...prev, result.assets[0].uri].slice(0, 2))
    }
  }

  async function pickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 1,
      mediaTypes: ['images'],
    })
    if (!result.canceled && result.assets[0]) {
      setUris((prev) => [...prev, result.assets[0].uri].slice(0, 2))
    }
  }

  function addPhoto() {
    Alert.alert('Ajouter une photo', undefined, [
      { text: 'Prendre une photo', onPress: () => void pickFromCamera() },
      { text: 'Choisir dans la galerie', onPress: () => void pickFromLibrary() },
      { text: 'Annuler', style: 'cancel' },
    ])
  }

  function removePhoto(index: number) {
    setUris((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSend() {
    if (uris.length === 0) return
    setPhase('sending')
    const res = await submitProductPhotos({
      ean: productEan,
      brand,
      name: productName,
      category,
      localUris: uris,
    })
    setPhase(res.ok ? 'done' : 'error')
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Ajouter une photo du produit</Text>
          <Pressable
            onPress={handleClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            style={styles.close}
          >
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
        </View>

        <View style={styles.body}>
          {phase === 'done' ? (
            <View style={styles.center}>
              <View style={[styles.statusIcon, { backgroundColor: colors.rating.vert.bg }]}>
                <Ionicons name="checkmark" size={32} color={colors.rating.vert.DEFAULT} />
              </View>
              <Text style={styles.statusTitle}>Merci pour ta contribution</Text>
              <Text style={styles.statusText}>
                Ta photo sera vérifiée par notre équipe avant d'apparaître sur le
                produit. Grâce à toi, les autres utilisateurs le reconnaîtront plus
                facilement.
              </Text>
              <Pressable style={styles.primaryBtn} onPress={handleClose}>
                <Text style={styles.primaryBtnText}>Fermer</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.intro}>
                Ce produit n'a pas encore de photo. Ajoute une photo de l'emballage
                (de face, nette){productName ? ` pour « ${productName} »` : ''}. Tu
                peux en mettre jusqu'à deux.
              </Text>

              <View style={styles.slots}>
                {[0, 1].map((i) => {
                  const uri = uris[i]
                  if (uri) {
                    return (
                      <View key={i} style={styles.slot}>
                        <Image source={{ uri }} style={styles.slotImage} contentFit="cover" />
                        <Pressable
                          style={styles.slotRemove}
                          onPress={() => removePhoto(i)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="Retirer la photo"
                        >
                          <Ionicons name="close" size={16} color="#FFFFFF" />
                        </Pressable>
                      </View>
                    )
                  }
                  // Premier slot vide = bouton d'ajout ; second slot vide = visible
                  // uniquement si au moins une photo est déjà choisie.
                  if (i === 0 || uris.length >= 1) {
                    return (
                      <Pressable
                        key={i}
                        style={styles.slotEmpty}
                        onPress={addPhoto}
                        disabled={phase === 'sending'}
                        accessibilityRole="button"
                        accessibilityLabel="Ajouter une photo"
                      >
                        <Ionicons name="camera-outline" size={28} color={colors.inkLight} />
                        <Text style={styles.slotEmptyText}>Ajouter</Text>
                      </Pressable>
                    )
                  }
                  return <View key={i} style={styles.slotPlaceholder} />
                })}
              </View>

              {phase === 'error' ? (
                <Text style={styles.errorText}>
                  L'envoi a échoué. Vérifie ta connexion et réessaie.
                </Text>
              ) : null}

              <Pressable
                style={[styles.primaryBtn, uris.length === 0 && styles.primaryBtnDisabled]}
                onPress={handleSend}
                disabled={uris.length === 0 || phase === 'sending'}
              >
                {phase === 'sending' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>Envoyer</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const SLOT = 150

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderMuted,
  },
  title: { fontFamily: fontFamilies.semiBold, fontSize: 17, color: colors.ink, flex: 1 },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray100,
  },
  body: { flex: 1, padding: spacing.base, gap: spacing.lg },
  intro: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkMuted,
  },
  slots: { flexDirection: 'row', gap: spacing.md },
  slot: { width: SLOT, height: SLOT, borderRadius: radius.lg, overflow: 'hidden' },
  slotImage: { width: '100%', height: '100%' },
  slotRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotEmpty: {
    width: SLOT,
    height: SLOT,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  slotEmptyText: { fontFamily: fontFamilies.medium, fontSize: 13, color: colors.inkLight },
  slotPlaceholder: { width: SLOT, height: SLOT },
  errorText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    color: colors.rating.rouge.DEFAULT,
  },
  primaryBtn: {
    marginTop: 'auto',
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { backgroundColor: colors.inkLight },
  primaryBtnText: { fontFamily: fontFamilies.semiBold, fontSize: 16, color: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
  statusIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontFamily: fontFamilies.semiBold, fontSize: 18, color: colors.ink },
  statusText: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkMuted,
    textAlign: 'center',
  },
})

/**
 * ContributeProductSheet — « Ajouter ce produit » après un scan d'un produit
 * ABSENT du catalogue. L'utilisateur aide à référencer le produit en 2 photos :
 *   1. le DEVANT du produit (en main),
 *   2. la LISTE DES INGRÉDIENTS au dos (bien nette → lue par OCR côté admin).
 * + un nom facultatif. On a déjà le code-barres (scan). Rien n'est publié ici :
 * un admin valide, lance l'OCR + le calcul, puis publie (catalog_photo_submissions).
 *
 * Réutilise submitProductPhotos (hiRes pour la photo ingrédients). Gratuit.
 */
import { type FC, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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
  ean: string
}

type Phase = 'form' | 'sending' | 'done' | 'error'

export const ContributeProductSheet: FC<Props> = ({ visible, onClose, ean }) => {
  const [frontUri, setFrontUri] = useState<string | null>(null)
  const [ingUri, setIngUri] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phase, setPhase] = useState<Phase>('form')

  function reset() {
    setFrontUri(null)
    setIngUri(null)
    setName('')
    setPhase('form')
  }
  function handleClose() {
    reset()
    onClose()
  }

  async function pick(setter: (uri: string) => void) {
    Alert.alert('Ajouter une photo', undefined, [
      {
        text: 'Prendre une photo',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync()
          if (!perm.granted) {
            Alert.alert('Caméra non autorisée', "Autorise l'accès à la caméra dans les réglages.")
            return
          }
          const r = await ImagePicker.launchCameraAsync({ quality: 1 })
          if (!r.canceled && r.assets[0]) setter(r.assets[0].uri)
        },
      },
      {
        text: 'Choisir dans la galerie',
        onPress: async () => {
          const r = await ImagePicker.launchImageLibraryAsync({ quality: 1, mediaTypes: ['images'] })
          if (!r.canceled && r.assets[0]) setter(r.assets[0].uri)
        },
      },
      { text: 'Annuler', style: 'cancel' },
    ])
  }

  async function handleSend() {
    if (!frontUri || !ingUri) return
    setPhase('sending')
    const res = await submitProductPhotos({
      ean,
      brand: null,
      name: name.trim() || null,
      category: null,
      localUris: [frontUri, ingUri],
      hiRes: true,
    })
    setPhase(res.ok ? 'done' : 'error')
  }

  const canSend = Boolean(frontUri && ingUri) && phase !== 'sending'

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Ajouter ce produit</Text>
          <Pressable onPress={handleClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.close}>
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
        </View>

        <View style={styles.body}>
          {phase === 'done' ? (
            <View style={styles.center}>
              <View style={[styles.statusIcon, { backgroundColor: colors.rating.vert.bg }]}>
                <Ionicons name="checkmark" size={32} color={colors.rating.vert.DEFAULT} />
              </View>
              <Text style={styles.statusTitle}>Merci pour ta contribution 🙌</Text>
              <Text style={styles.statusText}>
                On vérifie tes photos, on lit la composition et on ajoute le produit très vite. Tu
                aides toute la communauté à mieux décrypter ses cosmétiques.
              </Text>
              <Pressable style={styles.primaryBtn} onPress={handleClose}>
                <Text style={styles.primaryBtnText}>Terminé</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.intro}>
                Ce produit n'est pas encore dans notre base. Aide-nous à l'ajouter avec 2 photos —
                on lira la composition pour le noter.
              </Text>

              <PhotoSlot
                label="1. Le devant du produit"
                hint="Tiens le produit en main, bien cadré."
                icon="cube-outline"
                uri={frontUri}
                onPick={() => void pick(setFrontUri)}
                onRemove={() => setFrontUri(null)}
                disabled={phase === 'sending'}
              />
              <PhotoSlot
                label="2. La liste des ingrédients (au dos)"
                hint="Cadre bien la liste « Ingredients / INCI », nette et lisible."
                icon="list-outline"
                uri={ingUri}
                onPick={() => void pick(setIngUri)}
                onRemove={() => setIngUri(null)}
                disabled={phase === 'sending'}
              />

              <View>
                <Text style={styles.fieldLabel}>Nom du produit (facultatif)</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="ex. Crème hydratante visage"
                  placeholderTextColor={colors.inkLight}
                  maxLength={120}
                  editable={phase !== 'sending'}
                />
              </View>

              {phase === 'error' ? (
                <Text style={styles.errorText}>L'envoi a échoué. Vérifie ta connexion et réessaie.</Text>
              ) : null}

              <Pressable
                style={[styles.primaryBtn, !canSend && styles.primaryBtnDisabled]}
                onPress={handleSend}
                disabled={!canSend}
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

const PhotoSlot: FC<{
  label: string
  hint: string
  icon: keyof typeof Ionicons.glyphMap
  uri: string | null
  onPick: () => void
  onRemove: () => void
  disabled: boolean
}> = ({ label, hint, icon, uri, onPick, onRemove, disabled }) => (
  <View style={styles.slotRow}>
    {uri ? (
      <View style={styles.thumb}>
        <Image source={{ uri }} style={styles.thumbImg} contentFit="cover" />
        <Pressable style={styles.thumbRemove} onPress={onRemove} hitSlop={8} accessibilityLabel="Retirer">
          <Ionicons name="close" size={14} color="#FFFFFF" />
        </Pressable>
      </View>
    ) : (
      <Pressable style={styles.thumbEmpty} onPress={onPick} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}>
        <Ionicons name={icon} size={26} color={colors.inkLight} />
      </Pressable>
    )}
    <View style={styles.slotInfo}>
      <Text style={styles.slotLabel}>{label}</Text>
      <Text style={styles.slotHint}>{hint}</Text>
      {!uri ? (
        <Pressable onPress={onPick} disabled={disabled} hitSlop={6}>
          <Text style={styles.slotAction}>Prendre / choisir une photo</Text>
        </Pressable>
      ) : (
        <Pressable onPress={onPick} disabled={disabled} hitSlop={6}>
          <Text style={styles.slotAction}>Remplacer</Text>
        </Pressable>
      )}
    </View>
  </View>
)

const THUMB = 84

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
  close: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray100 },
  body: { flex: 1, padding: spacing.base, gap: spacing.lg },
  intro: { fontFamily: fontFamilies.regular, fontSize: 14, lineHeight: 20, color: colors.inkMuted },
  slotRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.lg, overflow: 'hidden' },
  thumbImg: { width: '100%', height: '100%' },
  thumbRemove: {
    position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  thumbEmpty: {
    width: THUMB, height: THUMB, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border,
    borderStyle: 'dashed', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  slotInfo: { flex: 1, gap: 2 },
  slotLabel: { fontFamily: fontFamilies.semiBold, fontSize: 14, color: colors.ink },
  slotHint: { fontFamily: fontFamilies.regular, fontSize: 12.5, lineHeight: 17, color: colors.inkMuted },
  slotAction: { fontFamily: fontFamilies.semiBold, fontSize: 13, color: colors.accent, marginTop: 2 },
  fieldLabel: { fontFamily: fontFamilies.medium, fontSize: 13, color: colors.inkMuted, marginBottom: 6 },
  input: {
    fontFamily: fontFamilies.regular, fontSize: 14, color: colors.ink, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },
  errorText: { fontFamily: fontFamilies.medium, fontSize: 13, color: colors.rating.rouge.DEFAULT },
  primaryBtn: { marginTop: 'auto', height: 52, borderRadius: radius.full, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  primaryBtnDisabled: { backgroundColor: colors.inkLight },
  primaryBtnText: { fontFamily: fontFamilies.semiBold, fontSize: 16, color: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
  statusIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontFamily: fontFamilies.semiBold, fontSize: 18, color: colors.ink },
  statusText: { fontFamily: fontFamilies.regular, fontSize: 14, lineHeight: 20, color: colors.inkMuted, textAlign: 'center' },
})

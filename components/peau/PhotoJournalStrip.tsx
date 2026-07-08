/**
 * PhotoJournalStrip — journal photo horizontal de la page « Ma peau ».
 *
 * Vignettes datées (photos privées du bucket `skin-photos`, lues via URL signée
 * 1 h par une query ['skinPhotoUrl', path] NON persistée) + tuile « Ajouter une
 * photo » (→ scan visage). Long-press sur une vignette → suppression (confirm).
 * Note de confidentialité affichée sous la liste.
 */

import { type FC } from 'react'
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/colors'
import { radius, spacing } from '@/constants/spacing'
import { fontFamilies } from '@/constants/typography'
import { ROUTES } from '@/constants/routes'
import { signedPhotoUrl, type FaceScanRow } from '@/lib/skin/api'

const TILE = 86

interface Props {
  scans: FaceScanRow[]
  onDelete?: (scan: FaceScanRow) => void
}

function formatFrShortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

const PhotoTile: FC<{ scan: FaceScanRow; onDelete?: (scan: FaceScanRow) => void }> = ({
  scan,
  onDelete,
}) => {
  // URL signée expirante : staleTime < 1 h, jamais persistée (blacklist persister).
  const { data: url } = useQuery({
    queryKey: ['skinPhotoUrl', scan.photo_path],
    staleTime: 45 * 60 * 1000,
    gcTime: 50 * 60 * 1000,
    queryFn: () => signedPhotoUrl(scan.photo_path),
  })

  const confirmDelete = () => {
    if (!onDelete) return
    Alert.alert('Supprimer cette photo', 'Cette photo sera retirée de ton journal.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => onDelete(scan) },
    ])
  }

  return (
    <Pressable
      onLongPress={confirmDelete}
      delayLongPress={350}
      style={styles.tile}
      accessibilityLabel={`Photo du ${formatFrShortDate(scan.created_at)}`}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          style={styles.photo}
          contentFit="cover"
          cachePolicy="memory"
          transition={120}
        />
      ) : (
        <View style={[styles.photo, styles.photoPlaceholder]}>
          <Ionicons name="image-outline" size={20} color={colors.inkLight} />
        </View>
      )}
      <Text style={styles.date}>{formatFrShortDate(scan.created_at)}</Text>
    </Pressable>
  )
}

export const PhotoJournalStrip: FC<Props> = ({ scans, onDelete }) => {
  const router = useRouter()

  return (
    <View>
      <FlatList
        horizontal
        data={scans}
        keyExtractor={(s) => s.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <PhotoTile scan={item} onDelete={onDelete} />}
        ListFooterComponent={
          <Pressable
            style={styles.addTile}
            onPress={() => router.push(ROUTES.PEAU.SCAN)}
            accessibilityRole="button"
            accessibilityLabel="Ajouter une photo"
          >
            <View style={styles.addCircle}>
              <Ionicons name="camera-outline" size={20} color={colors.rose} />
            </View>
            <Text style={styles.addText}>Ajouter{'\n'}une photo</Text>
          </Pressable>
        }
      />
      <View style={styles.privacyRow}>
        <Ionicons name="lock-closed-outline" size={12} color={colors.inkLight} />
        <Text style={styles.privacyText}>
          Tes photos restent privées, visibles par toi seule.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  listContent: { gap: spacing.sm, paddingVertical: spacing.xs },
  tile: { width: TILE, gap: 4 },
  photo: {
    width: TILE,
    height: TILE * 1.25,
    borderRadius: radius.md,
    backgroundColor: colors.gray100,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  date: {
    fontFamily: fontFamilies.regular,
    fontSize: 10,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  addTile: {
    width: TILE,
    height: TILE * 1.25,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.roseSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
  },
  privacyText: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.inkLight,
  },
})

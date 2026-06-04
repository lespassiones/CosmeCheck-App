/**
 * PackedChips — dispose des puces à LARGEUR NATURELLE en remplissant au mieux
 * chaque ligne (bin-packing « first-fit »), pour éviter le vide à droite que
 * laisse un simple `flexWrap` (qui remplit ligne par ligne dans l'ordre, sans
 * revenir combler les trous des lignes précédentes).
 *
 * Fonctionnement :
 *   1. Une couche de mesure cachée (absolute + opacity 0) rend les puces une
 *      fois pour capter leur largeur réelle via onLayout.
 *   2. Dès que la largeur du conteneur ET toutes les largeurs de puces sont
 *      connues, on calcule les lignes en first-fit : chaque puce est placée
 *      dans la PREMIÈRE ligne où elle tient encore → les petites puces vont
 *      combler les trous laissés en haut.
 *   3. Tant que la mesure n'est pas finie, on affiche un `flexWrap` classique
 *      (même rendu qu'avant, pas d'écran vide).
 *
 * Les puces NE sont PAS étirées : on garde leur taille de contenu.
 */

import { Children, isValidElement, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native'

import { spacing } from '@/constants/spacing'

interface Props {
  children: ReactNode
  /** Espace horizontal ET vertical entre les puces. */
  gap?: number
}

export function PackedChips({ children, gap = spacing.sm }: Props) {
  const items = Children.toArray(children).filter(isValidElement)
  const keys = items.map((c, i) => String(c.key ?? i))

  const [containerW, setContainerW] = useState(0)
  const widthsRef = useRef<Map<string, number>>(new Map())
  const [, bump] = useState(0)

  const allMeasured =
    keys.length > 0 && keys.every((k) => widthsRef.current.has(k))

  const handleContainer = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    if (w && Math.abs(w - containerW) > 0.5) setContainerW(w)
  }

  const handleItem = (k: string, e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    if (w && widthsRef.current.get(k) !== w) {
      widthsRef.current.set(k, w)
      if (keys.every((kk) => widthsRef.current.has(kk))) bump((v) => v + 1)
    }
  }

  // ── First-fit : place chaque puce dans la 1re ligne où elle tient. ─────────
  let rows: { key: string; node: ReactNode }[][] | null = null
  if (containerW > 0 && allMeasured) {
    const packed: { key: string; node: ReactNode }[][] = []
    const rowW: number[] = []
    items.forEach((node, i) => {
      const k = keys[i]
      const w = widthsRef.current.get(k) ?? 0
      let placed = false
      for (let j = 0; j < packed.length; j++) {
        if (rowW[j] + gap + w <= containerW + 0.5) {
          packed[j].push({ key: k, node })
          rowW[j] += gap + w
          placed = true
          break
        }
      }
      if (!placed) {
        packed.push([{ key: k, node }])
        rowW.push(w)
      }
    })
    rows = packed
  }

  return (
    <View onLayout={handleContainer}>
      {/* Couche de mesure cachée (largeurs naturelles). */}
      <View style={[styles.measure, { gap }]} pointerEvents="none">
        {items.map((node, i) => (
          <View key={keys[i]} onLayout={(e) => handleItem(keys[i], e)}>
            {node}
          </View>
        ))}
      </View>

      {rows ? (
        rows.map((row, ri) => (
          <View
            key={ri}
            style={{ flexDirection: 'row', gap, marginTop: ri ? gap : 0 }}
          >
            {row.map(({ key, node }) => (
              <View key={key}>{node}</View>
            ))}
          </View>
        ))
      ) : (
        <View style={[styles.fallback, { gap }]}>
          {items.map((node, i) => (
            <View key={keys[i]}>{node}</View>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  measure: {
    position: 'absolute',
    left: 0,
    right: 0,
    opacity: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  fallback: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
})

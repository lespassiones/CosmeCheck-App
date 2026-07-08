/**
 * Genere assets/images/notification-icon.png : 96x96 RGBA, silhouette BLANCHE
 * sur fond TRANSPARENT (contrainte Android : l'icone de notif n'utilise que le
 * canal ALPHA et est teintee en blanc par le systeme, sinon carre gris).
 *
 * Reprend le LOGO CosmeCheck : 3 pastilles alignees horizontalement (version
 * monochrome fidele, les couleurs rose/vert/violet sont perdues a la teinte
 * systeme de toute facon). Encodage PNG maison via zlib (zero dependance).
 *
 * Lancer : node scripts/gen-notification-icon.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SIZE = 96
// 3 pastilles alignees (logo CosmeCheck). Centrees verticalement, un peu plus
// grandes que dans le logo pour rester lisibles a petite taille de notif.
const DOT_R = 12
const DOT_Y = SIZE / 2
const DOT_XS = [SIZE / 2 - 26, SIZE / 2, SIZE / 2 + 26]

// Table CRC32.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

/** Alpha d'un pixel : union de 3 disques blancs (logo), bords antialiases. */
function alphaAt(x, y) {
  const edge = 1.5
  let a = 0
  for (const cxDot of DOT_XS) {
    const d = Math.sqrt((x - cxDot) * (x - cxDot) + (y - DOT_Y) * (y - DOT_Y))
    if (d <= DOT_R) a = Math.max(a, Math.min(1, (DOT_R - d) / edge + 1e-9 + (DOT_R - d >= edge ? 1 : 0)))
  }
  // Simplification : plein a l'interieur, transition douce sur le dernier pixel.
  a = 0
  for (const cxDot of DOT_XS) {
    const d = Math.sqrt((x - cxDot) * (x - cxDot) + (y - DOT_Y) * (y - DOT_Y))
    if (d <= DOT_R - edge) a = Math.max(a, 1)
    else if (d <= DOT_R) a = Math.max(a, (DOT_R - d) / edge)
  }
  return Math.round(Math.max(0, Math.min(1, a)) * 255)
}

// Scanlines filtrees (filtre 0 = None) : [filter, R,G,B,A x SIZE] par ligne.
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
let p = 0
for (let y = 0; y < SIZE; y++) {
  raw[p++] = 0 // filter None
  for (let x = 0; x < SIZE; x++) {
    const a = alphaAt(x, y)
    raw[p++] = 255 // R blanc
    raw[p++] = 255 // G
    raw[p++] = 255 // B
    raw[p++] = a // A
  }
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0
const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'assets', 'images', 'notification-icon.png')
writeFileSync(out, png)
console.log('notification-icon.png ecrit :', out, png.length, 'octets')

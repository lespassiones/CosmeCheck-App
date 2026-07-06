# -*- coding: utf-8 -*-
"""Genere le QR code CosmeCheck (https://www.cosme-check.com) en 5 declinaisons vertes.

Reprend le design de assets/marketing/qrcode_cosmecheck.png :
- modules arrondis, fond creme #FCFCFF
- boite blanche centrale avec le logo 3 points (rose / vert / violet, conserves)
- titre "CosmeCheck" + baseline "Votre peau merite la transparence"
Seule la couleur rose #F43F5E des modules + du titre + du soulignement devient verte.
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers.pil import RoundedModuleDrawer
from qrcode.image.styles.colormasks import SolidFillColorMask

URL = "https://www.cosme-check.com"

# --- Layout (mesure sur l'original 603x703) ---
W, H = 603, 703
BG = (252, 252, 255)          # #FCFCFF creme
QR_SIZE = 470                 # taille de l'image QR (avec quiet zone) posee
QR_CENTER = (301, 289)        # centre du QR = centre du logo
BOX_SIZE = 134                # boite blanche centrale
DOT_R = 9                     # rayon des 3 points
DOT_GAP = 34                  # ecart entre centres des points
# Couleurs de marque du logo (conservees telles quelles)
DOT_COLORS = [(246, 9, 155), (87, 213, 33), (95, 30, 225)]  # rose, vert, violet
GRAY = (107, 114, 128)        # #6B7280 tagline

FONT_DIR = "C:/Windows/Fonts"
FONT_TITLE = os.path.join(FONT_DIR, "segoeuib.ttf")   # bold (~ Inter Bold)
FONT_BODY = os.path.join(FONT_DIR, "segoeui.ttf")

# Declinaisons de couleurs distinctes (aucune rouge)
GREENS = [
    ("vert-vif",       (0x22, 0xC5, 0x5E)),  # #22C55E
    ("vert-moyen",     (0x16, 0xA3, 0x4A)),  # #16A34A
    ("vert-foret",     (0x15, 0x80, 0x3D)),  # #15803D
    ("vert-emeraude",  (0x05, 0x96, 0x69)),  # #059669
    ("vert-teal",      (0x0D, 0x94, 0x88)),  # #0D9488
]

# Autres couleurs distinctes demandees (toujours aucune rouge)
OTHERS = [
    ("bleu",       (0x25, 0x63, 0xEB)),  # #2563EB bleu roi
    ("violet",     (0x7C, 0x3A, 0xED)),  # #7C3AED
    ("turquoise",  (0x06, 0xB6, 0xD4)),  # #06B6D4 cyan
    ("orange",     (0xF9, 0x73, 0x16)),  # #F97316 (chaud, pas rouge)
    ("fuchsia",    (0xC0, 0x26, 0xD3)),  # #C026D3 magenta
    ("indigo",     (0x43, 0x38, 0xCA)),  # #4338CA
    ("anthracite", (0x1F, 0x29, 0x37)),  # #1F2937 noir doux
]

PALETTE = GREENS + OTHERS

OUT_DIR = "assets/marketing/qr-variants"


def make_qr_layer(green):
    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_H,  # H -> survit au logo central
        box_size=20,
        border=2,
    )
    qr.add_data(URL)
    qr.make(fit=True)
    img = qr.make_image(
        image_factory=StyledPilImage,
        module_drawer=RoundedModuleDrawer(),
        color_mask=SolidFillColorMask(front_color=green, back_color=BG),
    ).convert("RGBA")
    return img.resize((QR_SIZE, QR_SIZE), Image.LANCZOS)


def draw_center_logo(canvas, green):
    cx, cy = QR_CENTER
    half = BOX_SIZE // 2
    # ombre douce
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        [cx - half + 4, cy - half + 8, cx + half + 4, cy + half + 10],
        radius=30, fill=(60, 60, 80, 55),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(9))
    canvas.alpha_composite(shadow)

    d = ImageDraw.Draw(canvas)
    # boite blanche + fin liseret vert
    d.rounded_rectangle(
        [cx - half, cy - half, cx + half, cy + half],
        radius=28, fill=(255, 255, 255, 255),
        outline=green + (255,), width=2,
    )
    # 3 points de marque
    start = cx - DOT_GAP
    for i, col in enumerate(DOT_COLORS):
        px = start + i * DOT_GAP
        d.ellipse([px - DOT_R, cy - DOT_R, px + DOT_R, cy + DOT_R], fill=col + (255,))


def draw_text(canvas, green):
    d = ImageDraw.Draw(canvas)
    f_title = ImageFont.truetype(FONT_TITLE, 42)
    f_body = ImageFont.truetype(FONT_BODY, 20)

    title = "CosmeCheck"
    tb = d.textbbox((0, 0), title, font=f_title)
    tw = tb[2] - tb[0]
    d.text(((W - tw) // 2 - tb[0], 570), title, font=f_title, fill=green + (255,))

    tag = "Votre peau mérite la transparence"
    gb = d.textbbox((0, 0), tag, font=f_body)
    gw = gb[2] - gb[0]
    d.text(((W - gw) // 2 - gb[0], 628), tag, font=f_body, fill=GRAY + (255,))

    # petit soulignement vert centre
    ux = W // 2
    d.rounded_rectangle([ux - 26, 662, ux + 26, 666], radius=2, fill=green + (255,))


def build(name, green):
    canvas = Image.new("RGBA", (W, H), BG + (255,))
    qr = make_qr_layer(green)
    qx = QR_CENTER[0] - QR_SIZE // 2
    qy = QR_CENTER[1] - QR_SIZE // 2
    canvas.alpha_composite(qr, (qx, qy))
    draw_center_logo(canvas, green)
    draw_text(canvas, green)

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, f"qrcode_cosmecheck_{name}.png")
    canvas.convert("RGB").save(out, "PNG")
    return out


if __name__ == "__main__":
    import cv2
    det = cv2.QRCodeDetector()
    for name, green in PALETTE:
        path = build(name, green)
        img = cv2.imread(path)
        data, _, _ = det.detectAndDecode(img)
        ok = "OK" if data == URL else f"FAIL ({data!r})"
        print(f"#{'%02X%02X%02X' % green}  {path}  -> scan {ok}")

# -*- coding: utf-8 -*-
"""Genere le QR code "SCAN ME" CosmeCheck pointant sur le lien intelligent /dl.

Un seul QR pour les deux stores : /dl detecte l'OS depuis le User-Agent et
redirige vers l'App Store (iOS) ou Google Play (Android). Voir
CosmetWiki/app/dl/route.ts.

Design reprenant la maquette validee : 3 points de marque, titre "CosmeCheck",
filet noir, badge violet "SCAN ME" pose sur le cadre noir epais, QR a modules
arrondis, logo 3 points au centre du QR.

Sortie : assets/marketing/qrcode_cosmecheck_smartlink{,_print}.png
"""
import os

import qrcode
from PIL import Image, ImageDraw, ImageFont
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.colormasks import SolidFillColorMask
from qrcode.image.styles.moduledrawers.pil import RoundedModuleDrawer

URL = "https://www.cosme-check.com/dl"

# --- Palette ---------------------------------------------------------------
WHITE = (255, 255, 255)
INK = (11, 11, 15)             # noir doux du titre, du filet et du cadre
PURPLE = (124, 58, 237)        # #7C3AED badge SCAN ME
GRAY = (107, 114, 128)         # #6B7280 ligne d'URL
DOT_COLORS = [(246, 9, 155), (87, 213, 33), (95, 30, 225)]  # rose / vert / violet

FONT_DIR = "C:/Windows/Fonts"
FONT_HEAVY = os.path.join(FONT_DIR, "seguibl.ttf")   # Segoe UI Black
FONT_BODY = os.path.join(FONT_DIR, "segoeui.ttf")

# --- Geometrie de base (en unites "x1", multipliee par SCALE) --------------
W, H = 1200, 1660
CX = W // 2

DOTS_Y, DOTS_R, DOTS_GAP = 140, 27, 112
TITLE_TARGET_W, TITLE_TOP = 1010, 205   # le corps est calcule pour tenir cette largeur
RULE_Y, RULE_W, RULE_H = 430, 200, 16

FRAME = (130, 560, 1070, 1500)  # cadre noir : x0, y0, x1, y1
FRAME_BORDER, FRAME_RADIUS = 52, 110

BADGE_W, BADGE_H, BADGE_RADIUS = 500, 140, 32
BADGE_CY = FRAME[1]             # le badge chevauche le bord haut du cadre
BADGE_SIZE, BADGE_TRACKING = 84, 9

QR_PX = 790                     # cote de l'image QR posee (zone de silence incluse)
LOGO_W, LOGO_H, LOGO_RADIUS = 204, 80, 22
LOGO_DOT_R, LOGO_DOT_GAP = 15, 58
LOGO_CLEAR = 14               # marge blanche degagee autour de la pastille

URL_SIZE, URL_Y = 46, 1552


def s(v, scale):
    """Met une mesure a l'echelle."""
    return int(round(v * scale))


def make_qr(px):
    """QR a modules arrondis, correction H (survit au logo central)."""
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=30, border=3)
    qr.add_data(URL)
    qr.make(fit=True)
    img = qr.make_image(
        image_factory=StyledPilImage,
        module_drawer=RoundedModuleDrawer(),
        color_mask=SolidFillColorMask(front_color=INK, back_color=WHITE),
    ).convert("RGBA")
    return img.resize((px, px), Image.LANCZOS)


def fit_font(draw, label, path, target_w):
    """Plus grand corps de `path` dont `label` tient dans `target_w`."""
    size = 10
    while size < 600:
        f = ImageFont.truetype(path, size + 2)
        if draw.textlength(label, font=f) > target_w:
            break
        size += 2
    return ImageFont.truetype(path, size)


def text_centered(draw, y, label, font, fill, tracking=0, middle=False):
    """Ecrit `label` centre horizontalement.

    `y` est le bord haut de l'encre, ou son milieu vertical si `middle`.
    Le calage se fait sur la bbox reelle des glyphes : sur du capitale pur
    (SCAN ME), l'em box inclut des jambages inexistants et le texte
    paraitrait trop haut.
    """
    box = draw.textbbox((0, 0), label, font=font, anchor="lt")
    y0 = y - (box[3] - box[1]) / 2 if middle else y
    y0 -= box[1]
    if not tracking:
        draw.text((CX, y0), label, font=font, fill=fill, anchor="ma")
        return
    widths = [draw.textlength(ch, font=font) for ch in label]
    total = sum(widths) + tracking * (len(label) - 1)
    x = CX - total / 2
    for ch, w in zip(label, widths):
        draw.text((x, y0), ch, font=font, fill=fill, anchor="la")
        x += w + tracking


def build(scale):
    global CX
    W_s, H_s = s(W, scale), s(H, scale)
    CX = W_s // 2
    canvas = Image.new("RGB", (W_s, H_s), WHITE)
    d = ImageDraw.Draw(canvas)

    # 1. Les 3 points de marque
    r, gap = s(DOTS_R, scale), s(DOTS_GAP, scale)
    cy = s(DOTS_Y, scale)
    for i, color in enumerate(DOT_COLORS):
        px = CX + (i - 1) * gap
        d.ellipse([px - r, cy - r, px + r, cy + r], fill=color)

    # 2. Titre + filet
    f_title = fit_font(d, "CosmeCheck", FONT_HEAVY, s(TITLE_TARGET_W, scale))
    text_centered(d, s(TITLE_TOP, scale), "CosmeCheck", f_title, INK)
    rw, rh = s(RULE_W, scale), s(RULE_H, scale)
    ry = s(RULE_Y, scale)
    d.rounded_rectangle([CX - rw // 2, ry, CX + rw // 2, ry + rh], radius=rh // 2, fill=INK)

    # 3. Cadre noir epais
    x0, y0, x1, y1 = (s(v, scale) for v in FRAME)
    d.rounded_rectangle(
        [x0, y0, x1, y1],
        radius=s(FRAME_RADIUS, scale),
        outline=INK,
        width=s(FRAME_BORDER, scale),
    )

    # 4. QR centre dans le cadre + boite blanche et logo au centre
    qr_px = s(QR_PX, scale)
    qr = make_qr(qr_px)
    qcx, qcy = (x0 + x1) // 2, (y0 + y1) // 2
    canvas.paste(qr, (qcx - qr_px // 2, qcy - qr_px // 2))

    # Deux rectangles blancs concentriques : le plus grand degage les modules
    # arrondis voisins (sinon leurs angles mordent le bord de la pastille et
    # la silhouette parait dechiree), le second dessine la pastille elle-meme.
    lw, lh = s(LOGO_W, scale), s(LOGO_H, scale)
    clear = s(LOGO_CLEAR, scale)
    for pad, radius in ((clear, LOGO_RADIUS + LOGO_CLEAR), (0, LOGO_RADIUS)):
        d.rounded_rectangle(
            [qcx - lw // 2 - pad, qcy - lh // 2 - pad, qcx + lw // 2 + pad, qcy + lh // 2 + pad],
            radius=s(radius, scale),
            fill=WHITE,
        )
    lr, lgap = s(LOGO_DOT_R, scale), s(LOGO_DOT_GAP, scale)
    for i, color in enumerate(DOT_COLORS):
        px = qcx + (i - 1) * lgap
        d.ellipse([px - lr, qcy - lr, px + lr, qcy + lr], fill=color)

    # 5. Badge "SCAN ME" pose sur le bord haut du cadre
    bw, bh = s(BADGE_W, scale), s(BADGE_H, scale)
    bcy = s(BADGE_CY, scale)
    d.rounded_rectangle(
        [CX - bw // 2, bcy - bh // 2, CX + bw // 2, bcy + bh // 2],
        radius=s(BADGE_RADIUS, scale),
        fill=PURPLE,
    )
    f_badge = ImageFont.truetype(FONT_HEAVY, s(BADGE_SIZE, scale))
    text_centered(d, bcy, "SCAN ME", f_badge, WHITE, tracking=s(BADGE_TRACKING, scale), middle=True)

    # 6. Rappel de l'URL pour ceux qui ne peuvent pas scanner
    f_url = ImageFont.truetype(FONT_BODY, s(URL_SIZE, scale))
    text_centered(d, s(URL_Y, scale), "cosme-check.com/dl", f_url, GRAY)

    return canvas


if __name__ == "__main__":
    from PIL import ImageFilter

    out_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "marketing"
    )
    os.makedirs(out_dir, exist_ok=True)

    # Verification avec zxing-cpp (moteur de la famille utilisee par les
    # scanners Android). `pip install zxing-cpp` si absent. On teste aussi une
    # version reduite et floutee : c'est la photo prise de loin, en biais, qui
    # decide si un QR imprime marche vraiment.
    import zxingcpp

    def decodes(img):
        return any(r.text == URL for r in zxingcpp.read_barcodes(img))

    for suffix, scale in (("", 1.0), ("_print", 2.0)):
        img = build(scale)
        path = os.path.join(out_dir, f"qrcode_cosmecheck_smartlink{suffix}.png")
        img.save(path, "PNG")

        far = img.resize((360, round(img.height * 360 / img.width)), Image.LANCZOS)
        far = far.filter(ImageFilter.GaussianBlur(0.6))
        checks = [("plein format", decodes(img)), ("360 px + flou", decodes(far))]
        verdict = " | ".join(f"{name}: {'OK' if ok else 'ECHEC'}" for name, ok in checks)
        print(f"{path}  {img.width}x{img.height}  {verdict}")

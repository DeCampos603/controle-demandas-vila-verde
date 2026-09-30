"""Vetoriza a placa/medalha oficial do Vila Verde para docs/assets/vila-verde.svg.

A logo original é uma renderização fotorrealista (metal escovado, relevo dourado).
Em vez de rastrear os gradientes ao pé da letra — o que geraria um SVG pesado e
ruidoso — o pipeline:
  1. Borra a imagem para apagar a textura do metal escovado;
  2. Classifica cada pixel por matiz/valor num dos 5 tons do tema do site
     (verde-900/700, ouro, ouro-esc, marinho — ver docs/css/tema.css);
  3. Extrai o contorno de cada classe com OpenCV (findContours + approxPolyDP)
     e escreve os caminhos direto em SVG, recortados ao círculo do anel.

Uso: py -3 ferramentas/vetorizar_logo.py
Entrada: ferramentas/logo-original.webp   Saída: docs/assets/vila-verde.svg
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter

RAIZ = Path(__file__).resolve().parent.parent
ORIGEM = RAIZ / "ferramentas" / "logo-original.webp"
DESTINO = RAIZ / "docs" / "assets" / "vila-verde.svg"

# Centro e raio do anel externo, medidos na imagem original (1254x1254).
CX, CY, R = 627.0, 627.0, 616.0
ESCALA = 4.0  # reduz o viewBox (1254 -> ~314) para um arquivo mais leve

PALETA = {  # nome -> RGB, igual aos tokens de docs/css/tema.css
    "verde-900": (0x12, 0x3D, 0x1F),
    "verde-700": (0x1E, 0x6B, 0x34),
    "ouro-esc": (0x7A, 0x5F, 0x00),
    "ouro": (0xC9, 0xA2, 0x27),
    "marinho": (0x1B, 0x2A, 0x4A),
}
ORDEM = ["verde-900", "verde-700", "ouro-esc", "ouro", "marinho"]  # ordem de pintura


def classificar(im: Image.Image) -> np.ndarray:
    """Reduz a foto a poucas cores flat, mapeadas para a paleta do site."""
    borrada = im.filter(ImageFilter.GaussianBlur(radius=5))
    arr = np.asarray(borrada).astype(np.float32) / 255.0
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    maxc, minc = arr.max(axis=2), arr.min(axis=2)
    v = maxc
    s = np.where(maxc > 0, (maxc - minc) / np.where(maxc == 0, 1, maxc), 0)
    delta = maxc - minc
    mask = delta > 1e-6
    rc = np.zeros_like(maxc); gc = np.zeros_like(maxc); bc = np.zeros_like(maxc)
    rc[mask] = (maxc[mask] - r[mask]) / delta[mask]
    gc[mask] = (maxc[mask] - g[mask]) / delta[mask]
    bc[mask] = (maxc[mask] - b[mask]) / delta[mask]
    is_r = (r == maxc) & mask
    is_g = (g == maxc) & mask & ~is_r
    is_b = (b == maxc) & mask & ~is_r & ~is_g
    hue = np.zeros_like(maxc)
    hue[is_r] = bc[is_r] - gc[is_r]
    hue[is_g] = 2.0 + (rc[is_g] - bc[is_g])
    hue[is_b] = 4.0 + (gc[is_b] - rc[is_b])
    hue = (hue * 60.0) % 360.0

    H, W = v.shape
    out = np.empty((H, W, 3), dtype=np.uint8)
    is_gold = mask & (hue >= 25) & (hue <= 65) & (s >= 0.20)
    is_green = mask & (hue >= 70) & (hue <= 170) & (s >= 0.12)
    is_dark = (v < 0.28) & ~is_gold & ~is_green
    is_bg = ~is_gold & ~is_green & ~is_dark
    out[is_bg] = (0xFF, 0xFF, 0xFF)
    out[is_gold & (v >= 0.62)] = PALETA["ouro"]
    out[is_gold & (v < 0.62)] = PALETA["ouro-esc"]
    out[is_green & (v >= 0.30)] = PALETA["verde-700"]
    out[is_green & (v < 0.30)] = PALETA["verde-900"]
    out[is_dark] = PALETA["marinho"]

    yy, xx = np.mgrid[0:H, 0:W]
    fora_do_anel = np.sqrt((xx - CX) ** 2 + (yy - CY) ** 2) > R
    out[fora_do_anel] = (0xFF, 0xFF, 0xFF)
    return out


def contornos_para_path(mask: np.ndarray, eps: float = 1.4) -> str:
    cnts, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hier is None:
        return ""
    partes = []
    for c in cnts:
        if cv2.contourArea(c) < 3:
            continue
        aprox = cv2.approxPolyDP(c, eps, True).reshape(-1, 2)
        if len(aprox) < 3:
            continue
        pts = aprox / ESCALA
        partes.append("M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in pts) + " Z")
    return " ".join(partes)


def main() -> None:
    quantizado = classificar(Image.open(ORIGEM).convert("RGB"))
    H, W = quantizado.shape[:2]
    vw, vh = W / ESCALA, H / ESCALA
    cx, cy, r = CX / ESCALA, CY / ESCALA, R / ESCALA

    linhas = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '
        f'{vw:.1f} {vh:.1f}" role="img" aria-label="Brasão do Residencial Vila Verde">',
        f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="#FFFFFF"/>',
    ]
    for nome in ORDEM:
        cor = np.array(PALETA[nome])
        mask = (np.all(quantizado == cor, axis=-1) * 255).astype(np.uint8)
        if not mask.any():
            continue
        d = contornos_para_path(mask)
        if d:
            hexcor = "#%02X%02X%02X" % tuple(cor)
            linhas.append(f'<path fill-rule="evenodd" fill="{hexcor}" d="{d}"/>')
    linhas.append("</svg>")

    DESTINO.write_text("\n".join(linhas), encoding="utf-8")
    print(f"Gravado {DESTINO} ({DESTINO.stat().st_size} bytes)")


if __name__ == "__main__":
    main()

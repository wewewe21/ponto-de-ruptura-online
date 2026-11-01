"""Converte as imagens geradas (tools/_gen) para os formatos do jogo.
 - ui/*.png      -> assets/ui/*.jpg (qualidade 86, no máx. 1920 px de largura)
 - tex/*.png     -> assets/tex/<nome>_c.jpg (cor, tileável), _n.jpg (normal), _r.jpg (rugosidade), 1024 px
Uso: python tools/process_images.py   (rode com o python do ComfyUI: tem PIL e numpy)
"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.join(HERE, '_gen')
OUT = os.path.join(HERE, '..', 'assets')


def make_tileable(a):
    """a: float array HxWxC. Mistura com a versão deslocada de meio tile (janela cosseno) para tirar a emenda."""
    h, w = a.shape[:2]
    wx = (np.sin(np.pi * (np.arange(w) + 0.5) / w) ** 2)[None, :, None]
    wy = (np.sin(np.pi * (np.arange(h) + 0.5) / h) ** 2)[:, None, None]
    a1 = a * wx + np.roll(a, w // 2, axis=1) * (1 - wx)
    a2 = a1 * wy + np.roll(a1, h // 2, axis=0) * (1 - wy)
    return a2


def normalize_light(a):
    """Tira o gradiente de iluminação de baixa frequência (a textura fica uniforme ao repetir)."""
    img = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    low = np.asarray(img.filter(ImageFilter.GaussianBlur(radius=a.shape[0] / 8)), dtype=np.float32) / 255.0
    mean = low.mean(axis=(0, 1), keepdims=True)
    return np.clip(a - low + mean, 0, 1)


def height_to_normal(h, strength=3.0):
    gx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5
    gy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5
    nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    n = np.stack([nx / l, ny / l, nz / l], axis=-1)
    return (n * 0.5 + 0.5)


def process_tex(path, name, size=1024):
    im = Image.open(path).convert('RGB').resize((size, size), Image.LANCZOS)
    a = np.asarray(im, dtype=np.float32) / 255.0
    a = normalize_light(a)
    a = make_tileable(a)
    lum = (a * np.array([0.299, 0.587, 0.114], dtype=np.float32)).sum(-1)
    # altura: mistura de duas escalas da luminância (relevo plausível a partir do albedo)
    L = Image.fromarray((lum * 255).astype(np.uint8))
    h1 = np.asarray(L.filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32) / 255.0
    h2 = np.asarray(L.filter(ImageFilter.GaussianBlur(5)), dtype=np.float32) / 255.0
    height = h1 * 0.6 + h2 * 0.4
    nrm = height_to_normal(height, 4.0)
    rough = np.clip(0.88 - (lum - lum.mean()) * 0.9 - 0.0, 0.25, 1.0)
    d = os.path.join(OUT, 'tex'); os.makedirs(d, exist_ok=True)
    Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).save(os.path.join(d, name + '_c.jpg'), quality=90)
    Image.fromarray((nrm * 255).astype(np.uint8)).save(os.path.join(d, name + '_n.jpg'), quality=92)
    Image.fromarray((rough * 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS).save(os.path.join(d, name + '_r.jpg'), quality=88)


def process_ui(path, rel):
    im = Image.open(path).convert('RGB')
    if im.width > 1920:
        im = im.resize((1920, int(im.height * 1920 / im.width)), Image.LANCZOS)
    dst = os.path.join(OUT, os.path.splitext(rel)[0] + '.jpg')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im.save(dst, quality=86, optimize=True)


def main():
    n = 0
    for root, _, files in os.walk(GEN):
        for f in sorted(files):
            if not f.lower().endswith('.png'):
                continue
            p = os.path.join(root, f)
            rel = os.path.relpath(p, GEN).replace('\\', '/')
            name = f[:-4]
            if rel.startswith('tex/'):
                process_tex(p, name.replace('tex_', ''))
            elif rel.startswith('ui/'):
                process_ui(p, rel)
            else:
                continue
            n += 1
    print('processadas', n)


if __name__ == '__main__':
    main()

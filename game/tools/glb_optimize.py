"""Reduz o tamanho de GLBs do Trellis: reencoda as texturas embutidas (PNG -> JPEG) e opcionalmente redimensiona.
Uso: python tools/glb_optimize.py <entrada.glb> <saida.glb> [max_textura=1024] [qualidade=86]
Mantém a geometria intacta; só troca os bytes das imagens e reempacota o BIN.
"""
import io, json, struct, sys
from PIL import Image


def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, version, length = struct.unpack('<4sII', data[:12])
    assert magic == b'glTF'
    off = 12
    js, binc = None, b''
    while off < length:
        clen, ctype = struct.unpack('<II', data[off:off + 8])
        chunk = data[off + 8:off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode('utf8'))
        elif ctype == 0x004E4942:
            binc = chunk
        off += 8 + clen
    return js, binc


def write_glb(path, js, binc):
    jb = json.dumps(js, separators=(',', ':')).encode('utf8')
    jb += b' ' * ((4 - len(jb) % 4) % 4)
    binc += b'\0' * ((4 - len(binc) % 4) % 4)
    total = 12 + 8 + len(jb) + 8 + len(binc)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<II', len(jb), 0x4E4F534A)); f.write(jb)
        f.write(struct.pack('<II', len(binc), 0x004E4942)); f.write(binc)


def optimize(src, dst, max_tex=1024, quality=86):
    js, binc = read_glb(src)
    views = js['bufferViews']
    images = js.get('images', [])
    used = {im['bufferView'] for im in images if 'bufferView' in im}
    # novos bytes por bufferView de imagem
    new = {}
    for im in images:
        bv = im.get('bufferView')
        if bv is None:
            continue
        v = views[bv]
        raw = binc[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        img = Image.open(io.BytesIO(raw))
        img.load()
        if img.mode not in ('RGB', 'L'):
            img = img.convert('RGB')
        if max(img.size) > max_tex:
            r = max_tex / max(img.size)
            img = img.resize((max(1, int(img.width * r)), max(1, int(img.height * r))), Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, format='JPEG', quality=quality, optimize=True)
        new[bv] = out.getvalue()
        im['mimeType'] = 'image/jpeg'
    # reempacota: cópia dos demais views + novos
    out_bin = bytearray()
    for i, v in enumerate(views):
        b = new[i] if i in new else binc[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        while len(out_bin) % 4:
            out_bin.append(0)
        v['byteOffset'] = len(out_bin)
        v['byteLength'] = len(b)
        out_bin += b
    js['buffers'] = [{'byteLength': len(out_bin)}]
    write_glb(dst, js, bytes(out_bin))
    return len(out_bin)


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    mt = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
    q = int(sys.argv[4]) if len(sys.argv) > 4 else 86
    n = optimize(src, dst, mt, q)
    print(dst, n, 'bytes')

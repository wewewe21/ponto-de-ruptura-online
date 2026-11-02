"""Resumo rápido de um GLB: malhas, vértices, caixa, texturas. Uso: python tools/inspect_glb.py <arquivo.glb> ..."""
import json, struct, sys

def read_json(path):
    with open(path, 'rb') as f:
        d = f.read(2000000000)
    off = 12
    js = None
    while off < len(d):
        clen, ctype = struct.unpack('<II', d[off:off + 8])
        if ctype == 0x4E4F534A:
            js = json.loads(d[off + 8:off + 8 + clen].decode('utf8'))
            break
        off += 8 + clen
    return js

for p in sys.argv[1:]:
    js = read_json(p)
    print('==', p)
    print(' meshes', len(js.get('meshes', [])), 'nodes', len(js.get('nodes', [])), 'skins', len(js.get('skins', [])), 'anims', len(js.get('animations', [])), 'materials', len(js.get('materials', [])))
    for i, im in enumerate(js.get('images', [])):
        v = js['bufferViews'][im['bufferView']] if 'bufferView' in im else {}
        print(' image', i, im.get('mimeType'), v.get('byteLength'))
    acc = js['accessors']
    for mi, m in enumerate(js.get('meshes', [])):
        for pr in m['primitives']:
            a = acc[pr['attributes']['POSITION']]
            print(' mesh', mi, m.get('name'), 'verts', a['count'], 'min', [round(x, 3) for x in a['min']], 'max', [round(x, 3) for x in a['max']], 'attrs', list(pr['attributes'].keys()), 'idx', acc[pr['indices']]['count'] if 'indices' in pr else None)
    for n in js.get('nodes', [])[:12]:
        print(' node', {k: v for k, v in n.items() if k in ('name', 'mesh', 'translation', 'rotation', 'scale', 'children')})

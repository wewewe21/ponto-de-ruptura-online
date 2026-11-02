"""Renderiza a visão da câmera de cada estação (PNG) para conferir as poses.
Uso: blender --background <arquivo.blend> --python render_stations.py -- <pasta_saida> [ids separados por vírgula] [extra]
Com "extra" também gera vistas laterais/superiores (para depurar a posição dos braços).
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
from mathutils import Vector
from common import script_args

args = script_args()
out = args[0]
only = args[1].split(',') if len(args) > 1 and args[1] != '-' else None
extra = len(args) > 2
os.makedirs(out, exist_ok=True)
sc = bpy.context.scene
sc.render.resolution_x = 1280; sc.render.resolution_y = 720
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
frames = {m.name: m.frame for m in sc.timeline_markers}
sc.timeline_markers.clear()          # senão o marcador troca a câmera durante o render
for cam in [o for o in bpy.data.objects if o.type == 'CAMERA' and o.name.startswith('Camera_')]:
    gid = cam.name.replace('Camera_', '')
    if only and gid not in only:
        continue
    sc.camera = cam
    sc.render.filepath = os.path.join(out, f'est_{gid}.png')
    bpy.ops.render.render(write_still=True)
    if extra:
        org = cam.location
        for name, loc, rot in (('lado', org + Vector((1.9, -0.4, 0.0)), (math.pi / 2, 0, math.radians(90))), ('cima', org + Vector((0.1, -0.3, 1.9)), (0, 0, 0)), ('tras', org + Vector((0, -1.8, 0.1)), (math.pi / 2, 0, 0))):
            c2 = bpy.data.objects.new('dbg', bpy.data.cameras.new('dbg')); sc.collection.objects.link(c2)
            c2.location = loc; c2.rotation_euler = rot; c2.data.angle = math.radians(60); sc.camera = c2
            sc.render.filepath = os.path.join(out, f'est_{gid}_{name}.png'); bpy.ops.render.render(write_still=True)
            bpy.data.objects.remove(c2)
print('OK')

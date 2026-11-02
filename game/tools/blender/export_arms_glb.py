"""Exporta os braços do FPS Arms.fbx como GLB (malha com pele + esqueleto em pose de repouso) para o jogo.
Uso: blender --background --python export_arms_glb.py -- <saida.glb> <pasta_texturas_jpg>
Texturas esperadas na pasta: arm_base.jpg arm_normal.jpg hand_base.jpg hand_normal.jpg
"""
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import script_args

ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
FBX = os.path.join(ROOT, 'Assets', 'novos', 'source', 'FPS Arms.fbx')

out, texdir = script_args()[:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX)
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); mesh = next(o for o in bpy.data.objects if o.type == 'MESH')
if rig.animation_data:
    rig.animation_data_clear()
for pb in rig.pose.bones:
    pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.scale = (1, 1, 1)
rig.data.pose_position = 'REST'
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)


def material(name, base, normal):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    for n in list(nt.nodes):
        if n.type == 'TEX_IMAGE':
            nt.nodes.remove(n)
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(texdir, base)); nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = bpy.data.images.load(os.path.join(texdir, normal)); tn.image.colorspace_settings.name = 'Non-Color'
    nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = 0.75; b.inputs['Metallic'].default_value = 0.0
    return m


arm_m = material('FPS_Arm', 'arm_base.jpg', 'arm_normal.jpg')
hand_m = material('FPS_Hand', 'hand_base.jpg', 'hand_normal.jpg')
for slot in mesh.material_slots:
    slot.material = hand_m if 'Hand' in (slot.material.name if slot.material else '') else arm_m
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=False, export_skins=True, export_apply=False,
                          export_image_format='JPEG', export_yup=True, use_selection=True)
print('GLB', out, os.path.getsize(out))
print('BONES', [b.name for b in rig.data.bones][:6], len(rig.data.bones))

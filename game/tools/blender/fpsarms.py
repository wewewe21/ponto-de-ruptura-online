"""Braços em primeira pessoa (FPS Arms.fbx, 51 ossos com dedos) para as estações de pose.

build_arms(coll, origin, tag) importa uma cópia do FBX, liga as texturas, congela a pose do arquivo, e acrescenta por lado:
    ik_target.L/.R   controle do pulso (mova/gire: o braço acompanha por IK)
    pole.L/.R        direção do cotovelo
A câmera da estação fica em `origin`; o braço é posicionado de modo que os ombros fiquem abaixo e à frente da câmera
(as pontas cortadas dos braços ficam fora da visão), como no jogo.
"""
import math
import os

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
FBX = os.path.join(ROOT, 'Assets', 'novos', 'source', 'FPS Arms.fbx')
TEX = os.path.join(ROOT, 'Assets', 'novos', 'textures')

ARM_SCALE = 1.0                       # 1.0 = tamanho do arquivo original (mão ~13 cm); armas são maiores que a mão
EYE = Vector((0.0, -0.30, 1.65))      # onde fica a câmera no espaço do FBX (olho), em metros; ombros ficam em z=1,29 -> 0,36 m abaixo e 0,3 m à frente

SIDES = {'L': 'Left', 'R': 'Right'}
FINGER_CHAINS = {  # nome no FBX -> nome amigável (do polegar ao mindinho)
    'Finger_1': 'polegar', 'Finger_2': 'indicador', 'Finger_3': 'medio', 'Finger_4': 'anelar', 'Finger_5': 'mindinho',
}


def _material(name, base, normal=None, rough=None):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes['Principled BSDF']
    for n in list(nt.nodes):
        if n.type == 'TEX_IMAGE':
            nt.nodes.remove(n)

    def img(path, nonc=False):
        i = bpy.data.images.load(path); i.pack()
        if nonc:
            i.colorspace_settings.name = 'Non-Color'
        return i
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img(os.path.join(TEX, base)); nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    if normal and os.path.exists(os.path.join(TEX, normal)):
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img(os.path.join(TEX, normal), True)
        nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if rough and os.path.exists(os.path.join(TEX, rough)):
        tr = nt.nodes.new('ShaderNodeTexImage'); tr.image = img(os.path.join(TEX, rough), True); nt.links.new(tr.outputs['Color'], bsdf.inputs['Roughness'])
    return m


def import_arms(coll, tag):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=FBX)
    new = [o for o in bpy.data.objects if o not in before]
    rig = next(o for o in new if o.type == 'ARMATURE'); mesh = next(o for o in new if o.type == 'MESH')
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        if o.type in ('ARMATURE', 'MESH'):
            coll.objects.link(o)
        else:
            bpy.data.objects.remove(o, do_unlink=True)
    rig.name = 'Rig_' + tag; rig.data.name = 'Rig_' + tag; mesh.name = 'Arms_' + tag
    # materiais
    arm_m = _material('FPS_Arm', 'Arm_and_Hand_Arm_BaseColor.png', 'Arm_and_Hand_Arm_Normal.png', 'Arm_and_Hand_Arm_Roughness.png')
    hand_m = _material('FPS_Hand', 'Hand_Hand_BaseColor.png', 'Hand_Hand_Normal.png', 'Hand_Hand_Roughness.png')
    for i, slot in enumerate(mesh.material_slots):
        slot.material = hand_m if 'Hand' in slot.material.name else arm_m
    return rig, mesh


def freeze_pose(rig):
    """Congela a pose da animação do FBX como pose estática (para poder editar à vontade)."""
    bpy.context.view_layer.update()
    saved = {pb.name: pb.matrix_basis.copy() for pb in rig.pose.bones}
    if rig.animation_data:
        rig.animation_data.action = None
        rig.animation_data_clear()
    for pb in rig.pose.bones:
        pb.matrix_basis = saved[pb.name]


def build_arms(coll, origin, tag):
    org = Vector(origin)
    rig, mesh = import_arms(coll, tag)
    bpy.context.view_layer.objects.active = rig
    rig.scale = (ARM_SCALE,) * 3
    rig.location = org - EYE * ARM_SCALE
    bpy.context.view_layer.update()
    # guarda a matriz posada do pulso/mão (para os controles começarem onde o FBX deixou)
    posed = {}
    for suf in SIDES:
        for n in ('Arm_1', 'Arm_2', 'Hand_1'):
            posed[f'{n}.{suf}'] = rig.pose.bones[f'{n}.{suf}'].matrix.copy()
    freeze_pose(rig)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = rig.data.edit_bones
    ctrl = {}
    for suf in SIDES:
        h1 = eb[f'Hand_1.{suf}']
        c = eb.new(f'ik_target.{suf}'); c.head = h1.head.copy(); c.tail = h1.head + (h1.tail - h1.head).normalized() * 0.07
        c.roll = h1.roll; c.use_deform = False
        e = eb[f'Arm_2.{suf}'].head
        p = eb.new(f'pole.{suf}'); p.head = e + Vector((0, 0, -0.25)); p.tail = p.head + Vector((0, 0.05, 0)); p.use_deform = False
    bpy.ops.object.mode_set(mode='POSE')
    for suf in SIDES:
        pb = rig.pose.bones
        ik = pb[f'Arm_2.{suf}'].constraints.new('IK')
        ik.target = rig; ik.subtarget = f'ik_target.{suf}'; ik.pole_target = rig; ik.pole_subtarget = f'pole.{suf}'
        ik.chain_count = 2; ik.use_tail = True
        cr = pb[f'Hand_1.{suf}'].constraints.new('COPY_ROTATION'); cr.target = rig; cr.subtarget = f'ik_target.{suf}'
        for n, pal in (('ik_target', 'THEME03'), ('pole', 'THEME04')):
            pb[f'{n}.{suf}'].color.palette = pal
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.update()
    return mesh, rig, posed


def rest_axes(rig, name):
    """(direção dos dedos, costas da mão) da pose de repouso do osso, no espaço da armadura."""
    b = rig.data.bones[name]
    f = (b.tail_local - b.head_local).normalized()
    m = b.matrix_local.to_3x3()
    return f, [m @ Vector((1, 0, 0)), m @ Vector((0, 0, 1))]


def pick_pole_angle(rig, suf):
    """Escolhe o ângulo do pólo em que o cotovelo fica mais baixo."""
    ik = next(c for c in rig.pose.bones[f'Arm_2.{suf}'].constraints if c.type == 'IK')
    best = (1e9, 0)
    for deg in (0, 90, 180, -90):
        ik.pole_angle = math.radians(deg); bpy.context.view_layer.update()
        z = (rig.matrix_world @ rig.pose.bones[f'Arm_2.{suf}'].head).z
        if z < best[0]:
            best = (z, deg)
    ik.pole_angle = math.radians(best[1]); bpy.context.view_layer.update()
    return best[1]

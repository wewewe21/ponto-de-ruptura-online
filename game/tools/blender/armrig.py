"""Malha dos braços do soldado + armadura com dedos, construída no Blender a partir de data/arm_mesh.json (exportada do jogo).

build_arms(coll, origin, tag) cria, em torno de `origin` (posição da "câmera" da estação, coordenadas Blender):
  - o objeto de malha  Arms_<tag>  (peles da manga + luva, com a textura do soldado)
  - a armadura         Rig_<tag>   com, por lado (.L = esquerda do soldado, que fica à esquerda da tela):
        upper_arm, forearm, hand, index/middle/ring/pinky _1 _2, thumb_1 _2 _3     (ossos que deformam)
        ik_target (controle do pulso: mova/gire para posicionar a mão), pole (joelho/cotovelo)
Os ossos estão no espaço do viewmodel do jogo (câmera na origem olhando para +Y no Blender) e na escala K.
"""
import math
import os

import bpy
from mathutils import Matrix, Quaternion, Vector

from common import K, game_to_blender, load_json
from handrig import HandModel, smooth, FINGERS

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
SIDES = {'Left': '.L', 'Right': '.R'}

# transformação do espaço do modelo do soldado para o espaço do viewmodel do jogo (igual a FPArms.root)
def root_params(d):
    arm = d['J']['LeftArm']
    return {'K': K, 'pos': (0.0, -0.55 - K * arm[1], K * arm[2] - 0.78)}


def model_to_vm(p, rp):
    # rotação Y de 180° (x,z -> -x,-z), escala K, translação
    return (rp['pos'][0] - K * p[0], rp['pos'][1] + K * p[1], rp['pos'][2] - K * p[2])


def model_to_blender(p, rp):
    return game_to_blender(model_to_vm(p, rp))


def arm_weights(p, side, H, J):
    """Pesos dos ossos (nomes sem sufixo) para um vértice do braço do lado `side`."""
    sg = H.sign
    t = H.t(p)
    shoulder, elbow = J[side + 'Arm'], J[side + 'ForeArm']
    x = sg * p[0]
    xe, xs = sg * elbow[0], sg * shoulder[0]
    # braço -> antebraço ao redor do cotovelo
    f = smooth(xe - 0.05, xe + 0.05, x)
    w = {'upper_arm': 1 - f}
    hw = 1 - smooth(-0.05, 0.03, t)         # 1 = só antebraço; 0 = já é mão
    w['forearm'] = f * hw
    if hw < 1:
        for k, v in H.hand_weights(p).items():
            w[k] = w.get(k, 0) + v * (1 - hw) * f
        w['upper_arm'] += 0.0
    return w


def build_arms(coll, origin, tag, data=None, image_path=None):
    d = data or load_json(os.path.join(DATA, 'arm_mesh.json'))
    rp = root_params(d)
    pos, uv = d['pos'], d['uv']
    pts = [(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) for i in range(len(pos) // 3)]
    hands = {s: HandModel(pts, d['hands'][s], s) for s in ('Left', 'Right')}
    # solda por posição+uv
    key, verts, uvs, tri = {}, [], [], []
    for i, p in enumerate(pts):
        k = (round(p[0], 5), round(p[1], 5), round(p[2], 5), round(uv[i * 2], 5), round(uv[i * 2 + 1], 5))
        if k not in key:
            key[k] = len(verts); verts.append(p); uvs.append((uv[i * 2], uv[i * 2 + 1]))
        tri.append(key[k])
    faces = [tri[i:i + 3] for i in range(0, len(tri), 3)]
    org = Vector(origin)
    bverts = [tuple(model_to_blender(p, rp)) for p in verts]
    mesh = bpy.data.meshes.new('Arms_' + tag); mesh.from_pydata(bverts, [], faces); mesh.update()
    uvl = mesh.uv_layers.new(name='UVMap')
    for poly in mesh.polygons:
        for li, vi in zip(poly.loop_indices, poly.vertices):
            uvl.data[li].uv = (uvs[vi][0], 1 - uvs[vi][1])
    for poly in mesh.polygons:
        poly.use_smooth = True
    # a rotação Y de 180° inverte a orientação das faces? não: é uma rotação própria (det > 0)
    mobj = bpy.data.objects.new('Arms_' + tag, mesh)
    coll.objects.link(mobj)
    mat = bpy.data.materials.get('SoldierSkin')
    if not mat:
        mat = bpy.data.materials.new('SoldierSkin'); mat.use_nodes = True
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(image_path or os.path.join(DATA, 'ally1_tex_0.png')); tex.image.pack()
        mat.node_tree.links.new(tex.outputs['Color'], mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
        mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
    mesh.materials.append(mat)
    # armadura
    arm = bpy.data.armatures.new('Rig_' + tag); rig = bpy.data.objects.new('Rig_' + tag, arm)
    coll.objects.link(rig); rig.location = org
    rig.show_in_front = True; arm.display_type = 'OCTAHEDRAL'
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones
    bone_defs = {}
    for side, suf in SIDES.items():
        H = hands[side]
        J = d['J']
        sh, el = model_to_blender(J[side + 'Arm'], rp), model_to_blender(J[side + 'ForeArm'], rp)
        wr = model_to_blender(H.wrist, rp)
        up = Vector((0, 0, 1))
        defs = {}
        defs['upper_arm'] = (Vector(sh), Vector(el), None, up)
        defs['forearm'] = (Vector(el), Vector(wr), 'upper_arm', up)
        back = Vector(game_to_blender(tuple(Vector(H.n_back))))
        back_vm = Vector((-H.n_back[0], H.n_back[1], -H.n_back[2]))   # vetor (sem escala) no espaço do viewmodel
        back_b = game_to_blender(back_vm).normalized()
        hb = H.bones()
        for name, (a, b) in hb.items():
            parent = 'forearm' if name == 'hand' else ('hand' if name.endswith('_1') else name[:-1] + str(int(name[-1]) - 1))
            defs[name] = (Vector(model_to_blender(a, rp)), Vector(model_to_blender(b, rp)), parent, back_b)
        for name, (head, tail, parent, roll_to) in defs.items():
            e = eb.new(name + suf); e.head = head; e.tail = tail
            if (e.tail - e.head).length < 1e-4:
                e.tail = e.head + Vector((0, 0.01, 0))
            e.use_connect = False
            if parent:
                e.parent = eb[parent + suf]
            e.align_roll(roll_to if roll_to is not None else up)
            bone_defs[name + suf] = True
        # controles
        wmat_head = Vector(wr)
        c = eb.new('ik_target' + suf); c.head = wmat_head; c.tail = wmat_head + (Vector(tail_dir(hands[side], rp)) * 0.06)
        c.align_roll(back_b); c.use_deform = False
        mid = (Vector(sh) + wmat_head) * 0.5
        pole = eb.new('pole' + suf); pole.head = mid + Vector((-H.sign * 0.0 + (1 if suf == '.R' else -1) * 0.05, 0.0, -0.45)); pole.tail = pole.head + Vector((0, 0.05, 0)); pole.use_deform = False
    bpy.ops.object.mode_set(mode='OBJECT')
    # pesos
    vgs = {}
    for side, suf in SIDES.items():
        for name in ('upper_arm', 'forearm', 'hand') + tuple(f'{f}_{n}' for f in FINGERS for n in (1, 2)) + ('thumb_1', 'thumb_2', 'thumb_3'):
            vgs[name + suf] = mobj.vertex_groups.new(name=name + suf)
    for i, p in enumerate(verts):
        side = 'Left' if p[0] > 0 else 'Right'
        suf = SIDES[side]
        w = arm_weights(p, side, hands[side], d['J'])
        tot = sum(w.values()) or 1.0
        for name, v in w.items():
            if v / tot > 0.002:
                vgs[name + suf].add([i], v / tot, 'REPLACE')
    mod = mobj.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
    mobj.parent = rig
    # restrições: IK no antebraço + hand copia a rotação do controle
    bpy.ops.object.mode_set(mode='POSE')
    for suf in SIDES.values():
        pb = rig.pose.bones
        ik = pb['forearm' + suf].constraints.new('IK')
        ik.target = rig; ik.subtarget = 'ik_target' + suf
        ik.pole_target = rig; ik.pole_subtarget = 'pole' + suf
        ik.pole_angle = math.radians(90); ik.chain_count = 2; ik.use_tail = True
        cr = pb['hand' + suf].constraints.new('COPY_ROTATION')
        cr.target = rig; cr.subtarget = 'ik_target' + suf
        pb['ik_target' + suf].custom_shape_scale_xyz = (1, 1, 1)
        for n in ('ik_target', 'pole'):
            pb[n + suf].bone.color.palette = 'THEME03' if n == 'ik_target' else 'THEME04'
    bpy.ops.object.mode_set(mode='OBJECT')
    return mobj, rig, hands, rp


def tail_dir(H, rp):
    # direção dos dedos no espaço Blender (sem escala)
    d = (-H.d[0], H.d[1], -H.d[2])
    return game_to_blender(d)

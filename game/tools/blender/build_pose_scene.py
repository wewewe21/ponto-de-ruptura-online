"""Gera o arquivo .blend onde você posiciona as mãos em cada arma.

Uso:  blender --background --python build_pose_scene.py -- <saida.blend> [dados_iniciais.json]

Uma "estação" por arma, lado a lado no eixo X. Cada estação tem a câmera do jogo (campo de visão 54°, olhando para +Y),
a arma na posição em que ela aparece na tela, e os dois braços do FPS Arms.fbx (com dedos) em Pose.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

from common import clear_scene, game_to_blender, load_json, new_collection, script_args
import fpsarms

ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
MODELS = os.path.join(ROOT, 'game', 'assets', 'models')
SPACING = 5.0

# espaço do jogo (Y cima, câmera olhando -Z) -> Blender (Z cima, câmera olhando +Y)
C4 = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
C4i = C4.inverted()


def game_matrix_to_blender(M):
    return C4 @ M @ C4i


def mat_from_three(e):
    return Matrix(((e[0], e[4], e[8], e[12]), (e[1], e[5], e[9], e[13]), (e[2], e[6], e[10], e[14]), (e[3], e[7], e[11], e[15])))


# (id, nome, arquivo, flip, comprimento novo (m), comprimento antigo, origem do modelo)
# Comprimentos: armas maiores que a mão (a mão do FBX tem ~13 cm); proporções próximas das reais.
GUNS = [
    ('SD9', 'Fuzil SD-9 / KR-7', os.path.join(MODELS, 'rifle.glb'), False, 0.95, 0.84, (0.05, 0.27)),
    ('MK5', 'Submetralhadora MK-5', os.path.join(MODELS, 'weapons', 'smg.glb'), False, 0.90, 0.84, (0.05, 0.355)),
    ('P19', 'Pistola Glock brasileira', os.path.join(MODELS, 'weapons', 'glock.glb'), False, 0.36, 0.40, (0.03, 0.527)),
    ('VK12', 'DMR VK-12', os.path.join(MODELS, 'weapons', 'scifi.glb'), True, 1.05, 0.95, (0.0, 0.171)),
    ('AX50', 'Sniper brasileira', os.path.join(MODELS, 'weapons', 'sniper_br.glb'), False, 1.15, 1.0, (0.02, 0.14)),
    ('KNIFE', 'Faca', os.path.join(MODELS, 'weapons', 'knife.glb'), None, 0.28, 0.3, (0, 0.2)),
    ('BRK8', 'Escopeta BRK-8 (modelo simples)', None, None, 1.0, 1.0, (0, 0)),
    ('RPL2', 'Lança-foguetes RPL-2 (modelo simples)', None, None, 1.0, 1.0, (0, 0)),
    ('LASER', 'Designador a laser (modelo simples)', None, None, 1.0, 1.0, (0, 0)),
]
# posição (x, y, z) da arma na tela, no espaço do jogo; mais perto da câmera, para os braços alcançarem
HIP = {'SD9': (0.13, -0.15, -0.62), 'MK5': (0.12, -0.15, -0.62), 'P19': (0.10, -0.11, -0.56), 'VK12': (0.11, -0.14, -0.68), 'AX50': (0.10, -0.14, -0.72),
       'KNIFE': (0.14, -0.16, -0.52), 'BRK8': (0.14, -0.15, -0.62), 'RPL2': (0.15, -0.14, -0.55), 'LASER': (0.13, -0.14, -0.55)}
HIP_ROT = (0.015, 0.1, 0.0)    # rx, ry, rz (Euler XYZ do three.js): arma levemente virada para o centro


def hip_matrix(gid):
    rx, ry, rz = HIP_ROT
    R = Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rz, 4, 'Z')
    return Matrix.Translation(HIP[gid]) @ R


def model_to_gun_matrix(gun):
    gid, _, _, flip, length, _, origin = gun
    if gid == 'KNIFE':
        return Matrix.Rotation(-math.pi / 2, 4, 'X') @ Matrix.Scale(length, 4) @ Matrix.Translation((0, -0.2, 0))
    rot = Matrix.Rotation(math.pi / 2 if flip else -math.pi / 2, 4, 'Y')
    return rot @ Matrix.Scale(length, 4) @ Matrix.Translation((-origin[0], -origin[1], 0))


def import_glb_mesh(path, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    for o in meshes:
        o.data.transform(o.matrix_world); o.parent = None; o.matrix_world = Matrix.Identity(4)
    for o in new:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    if len(meshes) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for o in meshes:
            o.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active if len(meshes) > 1 else meshes[0]
    obj.name = name
    return obj


def prim_box(name, size, center, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object; o.name = name
    o.scale = (size[0], size[2], size[1]); o.location = game_to_blender(center); o.rotation_euler = (-rot[0], 0, 0)
    o.data.materials.append(mat)
    return o


def prim_cyl(name, radius, length, center, mat):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=length, vertices=16)
    o = bpy.context.active_object; o.name = name
    o.rotation_euler = (math.pi / 2, 0, 0); o.location = game_to_blender(center)
    o.data.materials.append(mat)
    return o


def build_simple_gun(gid, mat):
    if gid == 'BRK8':
        return [prim_box('receptor', (0.06, 0.08, 0.26), (0, 0, 0), mat), prim_cyl('cano', 0.016, 0.52, (0, 0.022, -0.39), mat),
                prim_cyl('tubo', 0.014, 0.42, (0, -0.022, -0.33), mat), prim_box('pump', (0.055, 0.05, 0.18), (0, -0.025, -0.28), mat),
                prim_box('empunhadura', (0.04, 0.1, 0.05), (0, -0.08, 0.09), mat, (-0.35, 0, 0)), prim_box('coronha', (0.05, 0.08, 0.24), (0, -0.02, 0.26), mat)]
    if gid == 'RPL2':
        return [prim_cyl('tubo', 0.045, 1.0, (0, 0, -0.15), mat), prim_cyl('traseira', 0.055, 0.12, (0, 0, 0.33), mat),
                prim_box('empunhadura', (0.035, 0.1, 0.05), (0, -0.08, 0.05), mat, (-0.3, 0, 0)), prim_box('apoio', (0.03, 0.08, 0.04), (0, -0.07, -0.2), mat),
                prim_box('mira', (0.03, 0.05, 0.06), (-0.06, 0.055, -0.1), mat)]
    return [prim_box('corpo', (0.08, 0.09, 0.2), (0, 0, -0.05), mat), prim_cyl('lente', 0.03, 0.05, (0.015, 0, -0.17), mat),
            prim_box('empunhadura', (0.035, 0.1, 0.05), (0, -0.09, 0.03), mat, (-0.2, 0, 0))]


def frame(f, b):
    """Base ortonormal (colunas: dedos, costas, lateral)."""
    f = f.normalized(); b = (b - f * b.dot(f)).normalized(); s = f.cross(b)
    return Matrix((f, b, s)).transposed()


def main():
    args = script_args()
    out = args[0] if args else os.path.join(ROOT, 'Assets', 'poses', 'poses_armas.blend')
    init_path = args[1] if len(args) > 1 else os.path.join(HERE, 'data', 'initial_poses.json')
    clear_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    initial = load_json(init_path)
    gray = bpy.data.materials.new('metal_cinza'); gray.use_nodes = True
    gray.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.12, 0.13, 0.14, 1)
    gray.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.6
    stations = []
    for i, gun in enumerate(GUNS):
        gid = gun[0]
        coll = new_collection(f'{i + 1:02d}_{gid}')
        org = Vector((i * SPACING, 0, 0))
        cam_data = bpy.data.cameras.new(f'Cam_{gid}'); cam_data.sensor_fit = 'VERTICAL'; cam_data.angle = math.radians(54); cam_data.clip_start = 0.01
        cam = bpy.data.objects.new(f'Camera_{gid}', cam_data); coll.objects.link(cam)
        cam.location = org; cam.rotation_euler = (math.pi / 2, 0, 0)
        # arma
        hip = game_matrix_to_blender(hip_matrix(gid))
        empty = bpy.data.objects.new(f'ARMA_{gid}', None); empty.empty_display_type = 'ARROWS'; empty.empty_display_size = 0.12
        coll.objects.link(empty); empty.matrix_world = Matrix.Translation(org) @ hip
        if gun[2]:
            mesh = import_glb_mesh(gun[2], f'Modelo_{gid}')
            for c in list(mesh.users_collection):
                c.objects.unlink(mesh)
            coll.objects.link(mesh)
            mesh.parent = empty; mesh.matrix_parent_inverse = Matrix.Identity(4)
            mesh.matrix_basis = game_matrix_to_blender(model_to_gun_matrix(gun))
        else:
            for o in build_simple_gun(gid, gray):
                for c in list(o.users_collection):
                    c.objects.unlink(o)
                coll.objects.link(o); o.parent = empty; o.matrix_parent_inverse = Matrix.Identity(4)
        mobj, rig, posed = fpsarms.build_arms(coll, org, gid)
        stations.append((gid, coll, cam, empty, rig, gun))
        m = scene.timeline_markers.new(gid, frame=i + 1); m.camera = cam
    bpy.context.view_layer.update()
    # poses iniciais: pulso junto à empunhadura (posição em relação à arma, vinda do jogo), dedos como no FBX
    for gid, coll, cam, empty, rig, gun in stations:
        rec = initial[gid]
        old_hip = mat_from_three(rec['gun'])
        ratio = gun[4] / gun[5]
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.mode_set(mode='POSE')
        winv = rig.matrix_world.inverted()
        for suf, side in (('L', 'Left'), ('R', 'Right')):
            p_gun = (old_hip.inverted() @ Vector(rec[side]['pos']).to_4d()).to_3d() * ratio      # pulso no espaço da arma (jogo)
            p_world = empty.matrix_world @ game_to_blender(p_gun)
            # orientação: dedos para a frente da arma; costas da mão para a direita (mão direita) ou para baixo (esquerda)
            f_world = empty.matrix_world.to_3x3() @ Vector((0, 1, 0))
            b_world = empty.matrix_world.to_3x3() @ (Vector((1, 0, 0)) if suf == 'R' else Vector((0, 0, -1)))
            rest_h = rig.data.bones[f'Hand_1.{suf}']
            f0, b0 = (rest_h.tail_local - rest_h.head_local).normalized(), Vector((0, 0, 1))
            R = frame(winv.to_3x3() @ f_world, winv.to_3x3() @ b_world) @ frame(f0, b0).inverted()
            # escolhe o giro do pulso (em torno do eixo dos dedos) que menos torce o antebraço
            f_arm = winv.to_3x3() @ f_world
            best = (1e9, None)
            for roll in (0, 90, 180, -90):
                Rr = Matrix.Rotation(math.radians(roll), 3, f_arm) @ R
                rig.pose.bones[f'ik_target.{suf}'].matrix = Matrix.Translation(winv @ p_world) @ (Rr @ rest_h.matrix_local.to_3x3()).to_4x4()
                bpy.context.view_layer.update()
                hp, pp = rig.pose.bones[f'Hand_1.{suf}'], rig.pose.bones[f'Arm_2.{suf}']
                loc = (pp.matrix.inverted() @ hp.matrix).to_3x3() @ (pp.bone.matrix_local.inverted() @ hp.bone.matrix_local).to_3x3().inverted()
                twist = abs(math.degrees(loc.to_quaternion().to_euler('XYZ').y))
                if twist < best[0]:
                    best = (twist, Rr)
            rot_h = (best[1] @ rest_h.matrix_local.to_3x3()).to_4x4()
            rig.pose.bones[f'ik_target.{suf}'].matrix = Matrix.Translation(winv @ p_world) @ rot_h
            bpy.context.view_layer.update()
            sh = rig.pose.bones[f'Arm_1.{suf}'].head
            mid = (sh + winv @ p_world) * 0.5
            rig.pose.bones[f'pole.{suf}'].matrix = Matrix.Translation(mid + Vector((0.0, -0.05, -0.35)))
            bpy.context.view_layer.update()
            fpsarms.pick_pole_angle(rig, suf)
        bpy.ops.object.mode_set(mode='OBJECT')
    scene.frame_start = 1; scene.frame_end = len(GUNS); scene.frame_set(1)
    scene.render.resolution_x = 1920; scene.render.resolution_y = 1080
    scene.camera = stations[0][2]
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'TEXTURE'
    scene.world = bpy.data.worlds.new('mundo'); scene.world.color = (0.32, 0.36, 0.42)
    txt = bpy.data.texts.new('LEIA-ME')
    lp = os.path.join(HERE, 'LEIA-ME_poses.txt')
    txt.write(open(lp, encoding='utf8').read() if os.path.exists(lp) else 'Veja docs/POSES_MAOS.md')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print('SALVO', out)


if __name__ == '__main__':
    main()

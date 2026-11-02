"""Gera o arquivo .blend onde você posiciona as mãos em cada arma.

Uso:  blender --background --python build_pose_scene.py -- <saida.blend> [dados_iniciais.json]

Uma "estação" por arma, lado a lado no eixo X. Cada estação tem a câmera do jogo (campo de visão 54°, olhando para +Y),
a arma na posição em que ela aparece na tela, e os dois braços (com dedos) em Pose.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy
from mathutils import Matrix, Vector, Quaternion, Euler

from common import clear_scene, game_to_blender, load_json, new_collection, script_args
from armrig import build_arms, SIDES
from handrig import FINGERS

ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
MODELS = os.path.join(ROOT, 'game', 'assets', 'models')
SPACING = 5.0

# C: espaço do jogo (Y para cima, câmera olhando -Z) -> Blender (Z para cima, câmera olhando +Y)
C4 = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
C4i = C4.inverted()


def game_matrix_to_blender(M):
    return C4 @ M @ C4i


def mat_from_three(elements):
    """THREE.Matrix4.elements (coluna-major) -> mathutils.Matrix."""
    e = elements
    return Matrix(((e[0], e[4], e[8], e[12]), (e[1], e[5], e[9], e[13]), (e[2], e[6], e[10], e[14]), (e[3], e[7], e[11], e[15])))


def quat_from_three(q):
    return Quaternion((q[3], q[0], q[1], q[2]))   # three: x,y,z,w -> mathutils: w,x,y,z


# fichas: (id, nome na lista, arquivo glb, flip, comprimento, origem do modelo, observação)
GUNS = [
    ('SD9', 'Fuzil SD-9 e KR-7 (mesma pose)', os.path.join(MODELS, 'rifle.glb'), False, 0.84, (0.05, 0.27, 0)),
    ('MK5', 'Submetralhadora MK-5', os.path.join(MODELS, 'weapons', 'smg.glb'), False, 0.84, (0.05, 0.355, 0)),
    ('P19', 'Pistola P-19', os.path.join(MODELS, 'weapons', 'pistol.glb'), False, 0.4, (0.1, 0.528, 0)),
    ('VK12', 'DMR VK-12', os.path.join(MODELS, 'weapons', 'scifi.glb'), True, 0.95, (0.0, 0.171, 0)),
    ('AX50', 'Sniper AX-50', os.path.join(MODELS, 'weapons', 'sniper.glb'), True, 1.0, (-0.03, 0.17, 0)),
    ('KNIFE', 'Faca', os.path.join(MODELS, 'weapons', 'knife.glb'), None, 0.3, (0, 0.2, 0)),
    ('BRK8', 'Escopeta BRK-8 (modelo simples)', None, None, 1.0, (0, 0, 0)),
    ('RPL2', 'Lança-foguetes RPL-2 (modelo simples)', None, None, 1.0, (0, 0, 0)),
    ('LASER', 'Designador a laser (modelo simples)', None, None, 1.0, (0, 0, 0)),
]


def model_to_gun_matrix(gun):
    """Matriz (espaço do jogo) que leva as coordenadas do modelo GLB ao espaço da arma (cano em -Z)."""
    gid, _, _, flip, length, origin = gun
    if gid == 'KNIFE':
        return Matrix.Rotation(-math.pi / 2, 4, 'X') @ Matrix.Scale(length, 4) @ Matrix.Translation((0, -0.2, 0))
    rot = Matrix.Rotation(math.pi / 2 if flip else -math.pi / 2, 4, 'Y')
    return rot @ Matrix.Scale(length, 4) @ Matrix.Translation((-origin[0], -origin[1], 0))


def import_glb_mesh(path, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    # aplica a transformação do importador (conversão de eixos) nos vértices e solta de qualquer pai
    for o in meshes:
        o.data.transform(o.matrix_world); o.parent = None; o.matrix_world = Matrix.Identity(4)
    for o in new:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    # junta em um único objeto
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
    """Caixa descrita em coordenadas do espaço da arma do jogo (X lateral, Y cima, Z para trás)."""
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object; o.name = name
    o.scale = (size[0], size[2], size[1])           # Blender: X lateral, Y frente/trás, Z cima
    o.location = game_to_blender(center); o.rotation_euler = (-rot[0], 0, 0)
    o.data.materials.append(mat)
    return o


def prim_cyl(name, radius, length, center, mat):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=length, vertices=16)
    o = bpy.context.active_object; o.name = name
    o.rotation_euler = (math.pi / 2, 0, 0); o.location = game_to_blender(center)
    o.data.materials.append(mat)
    return o


def build_simple_gun(gid, mat):
    objs = []
    if gid == 'BRK8':
        objs += [prim_box('receptor', (0.06, 0.08, 0.26), (0, 0, 0), mat), prim_cyl('cano', 0.016, 0.52, (0, 0.022, -0.39), mat),
                 prim_cyl('tubo', 0.014, 0.42, (0, -0.022, -0.33), mat), prim_box('pump', (0.055, 0.05, 0.18), (0, -0.025, -0.28), mat),
                 prim_box('empunhadura', (0.04, 0.1, 0.05), (0, -0.08, 0.09), mat, (-0.35, 0, 0)), prim_box('coronha', (0.05, 0.08, 0.24), (0, -0.02, 0.26), mat)]
    elif gid == 'RPL2':
        objs += [prim_cyl('tubo', 0.045, 1.0, (0, 0, -0.15), mat), prim_cyl('traseira', 0.055, 0.12, (0, 0, 0.33), mat),
                 prim_box('empunhadura', (0.035, 0.1, 0.05), (0, -0.08, 0.05), mat, (-0.3, 0, 0)), prim_box('apoio', (0.03, 0.08, 0.04), (0, -0.07, -0.2), mat),
                 prim_box('mira', (0.03, 0.05, 0.06), (-0.06, 0.055, -0.1), mat)]
    else:
        objs += [prim_box('corpo', (0.08, 0.09, 0.2), (0, 0, -0.05), mat), prim_cyl('lente', 0.03, 0.05, (0.015, 0, -0.17), mat),
                 prim_box('empunhadura', (0.035, 0.1, 0.05), (0, -0.09, 0.03), mat, (-0.2, 0, 0))]
    return objs


def curl_bone(rig, name, angle, sign):
    pb = rig.pose.bones[name]
    pb.rotation_mode = 'XYZ'
    pb.rotation_euler = (sign * angle, 0, 0)


def main():
    args = script_args()
    out = args[0] if args else os.path.join(ROOT, 'Assets', 'poses', 'poses_armas.blend')
    init_path = args[1] if len(args) > 1 else os.path.join(HERE, 'data', 'initial_poses.json')
    clear_scene()
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    initial = load_json(init_path)
    # material simples para as armas procedurais
    gray = bpy.data.materials.new('metal_cinza'); gray.use_nodes = True
    gray.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.12, 0.13, 0.14, 1)
    gray.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0.6
    stations = []
    for i, gun in enumerate(GUNS):
        gid = gun[0]
        coll = new_collection(f'{i + 1:02d}_{gid}')
        org = Vector((i * SPACING, 0, 0))
        rec = initial[gid]
        # câmera do jogo
        cam_data = bpy.data.cameras.new(f'Cam_{gid}'); cam_data.sensor_fit = 'VERTICAL'; cam_data.angle = math.radians(54); cam_data.clip_start = 0.01
        cam = bpy.data.objects.new(f'Camera_{gid}', cam_data); coll.objects.link(cam)
        cam.location = org; cam.rotation_euler = (math.pi / 2, 0, 0)
        # arma
        hip = game_matrix_to_blender(mat_from_three(rec['gun']))
        empty = bpy.data.objects.new(f'ARMA_{gid}', None); empty.empty_display_type = 'ARROWS'; empty.empty_display_size = 0.12
        coll.objects.link(empty); empty.matrix_world = Matrix.Translation(org) @ hip
        if gun[2]:
            mesh = import_glb_mesh(gun[2], f'Modelo_{gid}')
            coll.objects.link(mesh) if mesh.name not in coll.objects else None
            for c in list(mesh.users_collection):
                if c != coll:
                    c.objects.unlink(mesh)
            mesh.parent = empty; mesh.matrix_parent_inverse = Matrix.Identity(4)
            mesh.matrix_basis = game_matrix_to_blender(model_to_gun_matrix(gun))
        else:
            for o in build_simple_gun(gid, gray):
                for c in list(o.users_collection):
                    c.objects.unlink(o)
                coll.objects.link(o); o.parent = empty; o.matrix_parent_inverse = Matrix.Identity(4)
        # braços
        mobj, rig, hands, rp = build_arms(coll, org, gid)
        bpy.context.view_layer.update()
        stations.append((gid, coll, cam, empty, rig, rec, hands, rp, org))
        # marcador ligado à câmera
        m = scene.timeline_markers.new(f'{gid}', frame=i + 1); m.camera = cam
    # poses iniciais (a partir da pose atual do jogo)
    bpy.context.view_layer.update()
    for gid, coll, cam, empty, rig, rec, hands, rp, org in stations:
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.mode_set(mode='POSE')
        for side, suf in SIDES.items():
            R = rec[side]
            q = quat_from_three(R['quat'])
            reff = (q @ Quaternion((0, 0, 1, 0)).inverted()).to_matrix().to_4x4()    # remove a rotação Y de 180° da raiz
            # (Ry(π) como quaternion w=0,y=1)
            reff_b = C4 @ reff @ C4i
            hand_rest = rig.data.bones['hand' + suf].matrix_local.to_3x3().to_4x4()
            target_rest = rig.data.bones['ik_target' + suf].matrix_local.to_3x3().to_4x4()
            loc = game_to_blender(R['pos'])
            desired = Matrix.Translation(loc) @ (reff_b @ hand_rest)
            rig.pose.bones['ik_target' + suf].matrix = desired
            # pólo (cotovelo) abaixo e para fora
            sh = rig.data.bones['upper_arm' + suf].head_local
            mid = (sh + loc) * 0.5
            pole = rig.pose.bones['pole' + suf]
            pole.matrix = Matrix.Translation(mid + Vector((0.08 if suf == '.R' else -0.08, 0.0, -0.45)))
            bpy.context.view_layer.update()
            c0, c1 = rec['curl'][side]
            for f in FINGERS:
                curl_bone(rig, f'{f}_1{suf}', c0 * 0.9, -1); curl_bone(rig, f'{f}_2{suf}', c1 * 0.9, -1)
            curl_bone(rig, 'thumb_1' + suf, 0.25, -1); curl_bone(rig, 'thumb_2' + suf, 0.35, -1); curl_bone(rig, 'thumb_3' + suf, 0.4, -1)
        bpy.ops.object.mode_set(mode='OBJECT')
    # cena
    scene.frame_start = 1; scene.frame_end = len(GUNS); scene.frame_set(1)
    scene.render.resolution_x = 1920; scene.render.resolution_y = 1080
    scene.camera = stations[0][2]
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'TEXTURE'
    scene.world = bpy.data.worlds.new('mundo'); scene.world.color = (0.32, 0.36, 0.42)
    # texto de instruções dentro do arquivo
    txt = bpy.data.texts.new('LEIA-ME')
    txt.write(open(os.path.join(HERE, 'LEIA-ME_poses.txt'), encoding='utf8').read() if os.path.exists(os.path.join(HERE, 'LEIA-ME_poses.txt')) else 'Veja docs/POSES_MAOS.md')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print('SALVO', out)


main()

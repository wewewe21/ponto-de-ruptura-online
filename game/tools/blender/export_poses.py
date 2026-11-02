"""Lê o .blend de poses e exporta tudo que o jogo precisa em JSON.

Uso: blender --background <poses_armas.blend> --python export_poses.py -- <saida_poses.json> [saida_malha.json]

poses.json: por arma (id da estação)
    gun        matriz da arma no espaço do viewmodel (câmera na origem, Y para cima, olhando -Z)
    bones      por osso: { parent, rest, pose, restGun, poseGun }   (matrizes 4x4 coluna-major, no espaço do jogo;
               "Gun" = relativas à arma, que é o que vale quando a arma balança/mira)
    pole       posição do cotovelo (espaço do viewmodel) por lado
malha.json: vértices (espaço do viewmodel, pose de repouso), UVs, índices e pesos por osso (para recriar a malha em three.js).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
from mathutils import Matrix, Vector

from common import script_args

C4 = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
C4i = C4.inverted()


def to_game(M, org):
    """Matriz no mundo do Blender -> espaço do jogo da estação (origem na câmera)."""
    return C4i @ (Matrix.Translation(-org) @ M) @ C4


def three(M):
    return [round(M[r][c], 6) for c in range(4) for r in range(4)]   # coluna-major


def station_ids():
    return sorted(o.name[len('Camera_'):] for o in bpy.data.objects if o.type == 'CAMERA' and o.name.startswith('Camera_'))


def main():
    args = script_args()
    out_pose = args[0]
    out_mesh = args[1] if len(args) > 1 else None
    bpy.context.view_layer.update()
    result = {'version': 1, 'stations': {}}
    for gid in station_ids():
        cam = bpy.data.objects['Camera_' + gid]; rig = bpy.data.objects['Rig_' + gid]; gun = bpy.data.objects['ARMA_' + gid]
        org = cam.matrix_world.translation.copy()
        gun_g = to_game(gun.matrix_world, org)
        gun_inv = gun_g.inverted()
        bones = {}
        for pb in rig.pose.bones:
            if pb.name.startswith(('ik_target', 'pole')):
                continue
            rest = to_game(rig.matrix_world @ pb.bone.matrix_local, org)
            pose = to_game(rig.matrix_world @ pb.matrix, org)
            bones[pb.name] = {'parent': pb.parent.name if pb.parent else None, 'rest': three(rest), 'pose': three(pose), 'restGun': three(gun_inv @ rest), 'poseGun': three(gun_inv @ pose)}
        poles = {}
        for suf in ('.L', '.R'):
            pole = rig.pose.bones['pole' + suf]
            elbow = rig.pose.bones['forearm' + suf].head
            poles[suf] = {'elbow': list(to_game(Matrix.Translation(rig.matrix_world @ elbow), org).translation), 'ctrl': list(to_game(rig.matrix_world @ pole.matrix, org).translation)}
        result['stations'][gid] = {'gun': three(gun_g), 'bones': bones, 'pole': poles}
    with open(out_pose, 'w', encoding='utf8') as f:
        json.dump(result, f)
    print('POSES', out_pose, list(result['stations']))
    if out_mesh:
        gid = station_ids()[0]
        rig = bpy.data.objects['Rig_' + gid]; cam = bpy.data.objects['Camera_' + gid]; org = cam.matrix_world.translation.copy()
        mobj = bpy.data.objects['Arms_' + gid]; me = mobj.data
        names = {vg.index: vg.name for vg in mobj.vertex_groups}
        verts, weights = [], []
        for v in me.vertices:
            p = C4i @ (mobj.matrix_world @ v.co - org)
            verts.append([round(p.x, 6), round(p.y, 6), round(p.z, 6)])
            w = sorted(((names[g.group], round(g.weight, 4)) for g in v.groups), key=lambda x: -x[1])[:4]
            weights.append(w)
        uv = me.uv_layers['UVMap'].data
        # um UV por vértice (a malha foi soldada por posição+uv, então é único)
        uvs = [None] * len(me.vertices)
        tris = []
        for poly in me.polygons:
            for li, vi in zip(poly.loop_indices, poly.vertices):
                uvs[vi] = [round(uv[li].uv[0], 6), round(uv[li].uv[1], 6)]
            tris.extend(poly.vertices)
        with open(out_mesh, 'w', encoding='utf8') as f:
            json.dump({'positions': verts, 'uv': uvs, 'index': tris, 'weights': weights}, f)
        print('MALHA', out_mesh, len(verts), len(tris) // 3)


main()

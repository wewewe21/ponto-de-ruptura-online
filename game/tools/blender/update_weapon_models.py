"""Troca o MODELO 3D de armas dentro do .blend de poses, SEM mexer nas poses das mãos, câmeras nem nos braços.

Uso: blender --background <poses_armas.blend> --python update_weapon_models.py -- [ID ID ...]
Sem ids: troca as armas da lista PADRAO (as do modelo novo). Salva o próprio arquivo (faça backup antes).

Para cada arma: apaga o objeto `Modelo_ID`, importa o GLB que está em GUNS (build_pose_scene.py) e o coloca dentro do
vazio `ARMA_ID` com a mesma conversão usada pelo jogo (comprimento, origem, giro) — então a mão continua no mesmo lugar
em relação à arma e o que você vê no Blender é o que aparece no jogo.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
from mathutils import Matrix

from build_pose_scene import GUNS, game_matrix_to_blender, import_glb_mesh, model_to_gun_matrix
from common import script_args

PADRAO = ['P19', 'AX50']


def swap_model(gun):
    gid, label = gun[0], gun[1]
    empty = bpy.data.objects.get(f'ARMA_{gid}')
    old = bpy.data.objects.get(f'Modelo_{gid}')
    if empty is None:
        print('SEM ESTACAO', gid); return
    colls = list(old.users_collection) if old else list(empty.users_collection)
    old_data = old.data if old else None
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    if old_data and old_data.users == 0:
        for mat in list(old_data.materials):
            old_data.materials.clear()
            if mat and mat.users == 0:
                bpy.data.materials.remove(mat)
        bpy.data.meshes.remove(old_data)
    mesh = import_glb_mesh(gun[2], f'Modelo_{gid}')
    for c in list(mesh.users_collection):
        c.objects.unlink(mesh)
    for c in colls:
        c.objects.link(mesh)
    mesh.parent = empty
    mesh.matrix_parent_inverse = Matrix.Identity(4)
    mesh.matrix_basis = game_matrix_to_blender(model_to_gun_matrix(gun))
    mesh.data.name = f'Modelo_{gid}'
    print('TROCADO', gid, label, os.path.basename(gun[2]), 'vertices', len(mesh.data.vertices))


def main():
    ids = script_args() or PADRAO
    table = {g[0]: g for g in GUNS}
    for gid in ids:
        swap_model(table[gid])
    # imagens/texturas dos modelos antigos que ficaram sem uso
    for img in list(bpy.data.images):
        if img.users == 0:
            bpy.data.images.remove(img)
    bpy.ops.wm.save_mainfile()
    print('SALVO', bpy.data.filepath)


main()

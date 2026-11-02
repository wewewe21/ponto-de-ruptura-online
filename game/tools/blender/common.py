"""Utilidades compartilhadas dos scripts do Blender (rode com: blender --background --python <script> -- <args>).

Convenções: o jogo usa Y para cima e câmera olhando para -Z; o Blender usa Z para cima. A conversão (igual à do glTF) é
    blender = (x, -z, y)      jogo = (x, z, -y)
Assim a câmera do jogo (olhando -Z) olha para +Y no Blender.
"""
import json
import math
import os
import sys

import bpy
import mathutils
from mathutils import Matrix, Vector

K = 1.5   # escala dos braços no viewmodel (igual a FPArms.K em game/src/actors/fparms.js)


def game_to_blender(v):
    return Vector((v[0], -v[2], v[1]))


def blender_to_game(v):
    return Vector((v[0], v[2], -v[1]))


def script_args():
    argv = sys.argv
    return argv[argv.index('--') + 1:] if '--' in argv else []


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)


def load_json(path):
    with open(path, 'r', encoding='utf8') as f:
        return json.load(f)


def new_collection(name, parent=None):
    coll = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(coll)
    return coll


def link(obj, coll):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)

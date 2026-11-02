import bpy, math, sys
from mathutils import Vector
sys.path.insert(0, '.')
from common import script_args
out = script_args()[0]
sc = bpy.context.scene; sc.timeline_markers.clear()
sc.render.resolution_x = 1000; sc.render.resolution_y = 700; sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
for gid in ('SD9', 'P19'):
    rig = bpy.data.objects['Rig_' + gid]
    for suf in ('.L', '.R'):
        h = rig.matrix_world @ rig.pose.bones['hand' + suf].head
        look = h + Vector((0, 0.05, 0))
        c = bpy.data.objects.new('dbg', bpy.data.cameras.new('dbg')); sc.collection.objects.link(c)
        c.location = h + Vector((0.0, -0.35, 0.22)); c.data.angle = math.radians(50)
        d = look - c.location; c.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); sc.camera = c
        sc.render.filepath = f'{out}/close_{gid}{suf}.png'; bpy.ops.render.render(write_still=True); bpy.data.objects.remove(c)

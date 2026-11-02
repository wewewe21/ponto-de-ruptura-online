import bpy
print('ACTIONS', [(a.name, tuple(a.frame_range)) for a in bpy.data.actions])
for o in bpy.data.objects:
    if o.type == 'ARMATURE':
        ad = o.animation_data
        print('RIG', o.name, tuple(round(x,3) for x in o.location), tuple(round(x,3) for x in o.scale), 'anim', (ad.action.name if ad and ad.action else None))

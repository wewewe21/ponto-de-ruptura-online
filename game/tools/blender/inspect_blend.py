"""Resumo do .blend de poses: objetos por estação, ações/keyframes, transformações das armas e dos controles."""
import bpy
sc = bpy.context.scene
print('QUADROS', sc.frame_start, sc.frame_end, 'atual', sc.frame_current)
for o in sorted(bpy.data.objects, key=lambda x: x.name):
    if o.type in ('ARMATURE', 'EMPTY', 'CAMERA'):
        ad = o.animation_data
        act = ad.action if ad else None
        kf = sorted({round(k.co[0]) for fc in act.fcurves for k in fc.keyframe_points}) if act else []
        print(o.type, o.name, 'loc', tuple(round(x, 3) for x in o.location), 'scale', tuple(round(x, 3) for x in o.scale), 'acao', act.name if act else None, 'fcurves', len(act.fcurves) if act else 0, 'frames', kf[:8])

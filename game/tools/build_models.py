"""Otimiza os GLBs gerados (tools/_gen/models) e copia para assets/models/{soldiers,env,veh}. Rode com o python do ComfyUI."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glb_optimize import optimize

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '_gen', 'models')
DST = os.path.join(HERE, '..', 'assets', 'models')

def target(name):
    if name.startswith('sol_'): return 'soldiers', 1024
    if name in ('heli', 'truck', 'truck_cargo'): return 'veh', 1024
    return 'env', 1024

for f in sorted(os.listdir(SRC)) if os.path.isdir(SRC) else []:
    if not f.endswith('.glb'): continue
    name = f[:-4]
    sub, tex = target(name)
    os.makedirs(os.path.join(DST, sub), exist_ok=True)
    out = os.path.join(DST, sub, f)
    if os.path.exists(out) and os.path.getmtime(out) > os.path.getmtime(os.path.join(SRC, f)):
        continue
    n = optimize(os.path.join(SRC, f), out, tex, 86)
    print(sub, name, n // 1024, 'KB')

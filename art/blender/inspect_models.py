import os, sys, glob
sys.path.insert(0, os.path.expanduser("~/.claude/skills/3d-studio/scripts"))
import bl_kit as K, bpy
LIB = K.ASSETS + "/polyhaven/models"
for d in [x for x in sorted(os.listdir(LIB)) if x >= "vintage_c"]:
    g = glob.glob(f"{LIB}/{d}/*.gltf")
    if not g: continue
    K.reset()
    try:
        r = K.import_model(g[0], name=d)
    except Exception as e:
        print("DIM FAIL", d, e); continue
    ms = K.meshes(r)
    lo, hi = K.bbox(ms)
    s = hi - lo
    tris = K.stats(ms)
    print(f"DIM {d:32s} x={s.x:.3f} y={s.y:.3f} z={s.z:.3f} meshes={len(ms)} names={[m.name for m in ms][:6]}", flush=True)

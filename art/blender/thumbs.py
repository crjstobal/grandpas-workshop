import os, sys, glob
sys.path.insert(0, os.path.expanduser("~/.claude/skills/3d-studio/scripts"))
import bl_kit as K, bpy
LIB = K.ASSETS + "/polyhaven/models"
OUT = K.args()["out"]
for d in sorted(os.listdir(LIB)):
    g = glob.glob(f"{LIB}/{d}/*.gltf")
    if not g or os.path.exists(f"{OUT}/{d}.png"): continue
    K.reset()
    K.render_setup(360, 360, engine="EEVEE", samples=16)
    K.world_hdri(K.ASSETS + "/polyhaven/hdris/studio_small_09/studio_small_09_2k.hdr", strength=1.0, bg=(0.2,0.2,0.2))
    try:
        r = K.import_model(g[0], name=d)
    except Exception as e:
        print("FAIL", d, e); continue
    cam = K.camera((0, -5, 1), (0, 0, 0.5), lens=50)
    K.frame(cam, K.meshes(r), margin=1.1, yaw_deg=25, pitch_deg=20)
    K.render(f"{OUT}/{d}.png")

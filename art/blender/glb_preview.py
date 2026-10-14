"""Preview a GLB: list meshes/materials, put a test texture on 'Drawing', render a few views."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gw import *
from gw import K, bpy, Vector
import math
A = K.args(); OUT = A["out"]; GLB = A["glb"]
K.reset()
sc = K.render_setup(640, 640, engine="CYCLES", samples=64)
K.world_hdri(f"{HDR}/christmas_photo_studio_01/christmas_photo_studio_01_2k.hdr", strength=1.0, bg=(0.18, 0.2, 0.24))
bpy.ops.import_scene.gltf(filepath=GLB)
ms = [o for o in bpy.data.objects if o.type == "MESH"]
for o in ms:
    if A.get("hide") and o.name.startswith(A["hide"]): o.hide_render = True
print("MESHES", sorted({o.name for o in ms}))
print("MATERIALS", sorted({m.name for o in ms for m in o.data.materials if m}))
lo, hi = K.bbox(ms); print("BBOX", tuple(round(v, 3) for v in lo), tuple(round(v, 3) for v in hi), "size", tuple(round(v, 3) for v in hi - lo))
if A.get("tex") and "Drawing" in bpy.data.materials:
    m = bpy.data.materials["Drawing"]
    nt = m.node_tree; b = K._bsdf(m)
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(A["tex"])
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    d = [o for o in ms if o.name.startswith("Drawing")]
    print("DRAWING_UV", [len(o.data.uv_layers) for o in d])
cam = K.camera((0, -3, 0), (0, 0, 0), lens=float(A.get("lens", 50)))
K.light("AREA", (-1.5, -2, 2), (0, 0, 0), power=150, size=1.5, k=4500)
for i, (yaw, pitch) in enumerate([(0, 5), (180, 5), (35, 25), (90, 10)]):
    K.frame(cam, ms, margin=1.15, yaw_deg=yaw, pitch_deg=pitch)
    K.render(f"{OUT}_{i}.png")

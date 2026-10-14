"""ornament.glb: glass Christmas bauble with a brass cap and loop and a flat circular inset on the front
(mesh + material "Drawing", UVs 0..1) where a player's drawing is applied at runtime.

glTF axes: +Y up, the inset faces +Z. Origin at the ball centre, ball diameter 1.0; the loop top is at
about y = +0.68 (hang it from there).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gw import *  # noqa
from gw import K, bpy, Vector
import math

A = K.args(); OUT = A["out"]
K.reset()
R = 0.5
BALL = K.mat("BaubleGlass", (0.50, 0.025, 0.03), rough=0.08, coat=1.0)
BR = K.mat("Brass", (0.86, 0.63, 0.31), rough=0.28, metal=1.0)
BR2 = K.mat("BrassDark", (0.66, 0.46, 0.2), rough=0.4, metal=1.0)
PAPER = K.mat("Drawing", (0.94, 0.90, 0.82), rough=0.8)
parts = []
keep = lambda o: parts.append(o) or o  # noqa: E731

ball = sphere("bauble", R, (0, 0, 0), BALL, seg=96, rings=48)
# flatten the front: cut a disc-shaped facet where the label sits
RI = 0.27                                   # inset radius
depth = R - math.sqrt(R * R - (RI + 0.04) ** 2)
c = box("cut", (1.2, 1.0, 1.2), (0, -R - 0.5 + depth, 0), None)
boolean(ball, c)
keep(ball)
yf = -R + depth                              # plane of the flat facet (front = -Y in Blender)
# brass bezel around the label
keep(torus("bezel", RI + 0.012, 0.018, (0, yf - 0.004, 0), BR, rot=(math.pi / 2, 0, 0), seg=96, mseg=14))
for i in range(12):
    a = 2 * math.pi * i / 12
    keep(sphere(f"bead{i}", 0.014, ((RI + 0.05) * math.cos(a), yf + 0.003, (RI + 0.05) * math.sin(a)), BR2,
                seg=16, rings=8))
# the Drawing disc, UVs 0..1 as seen from the front
N = 96
verts = [(0, yf - 0.004, 0)] + [(RI * math.cos(2 * math.pi * i / N), yf - 0.004, RI * math.sin(2 * math.pi * i / N))
                                 for i in range(N)]
faces = [(0, 1 + i, 1 + (i + 1) % N) for i in range(N)]  # normals towards -Y (front = glTF +Z)
d = mesh_obj("Drawing", verts, faces, mat=PAPER)
uv = d.data.uv_layers.new(name="UVMap")
for p in d.data.polygons:
    for li in p.loop_indices:
        v = d.data.vertices[d.data.loops[li].vertex_index].co
        uv.data[li].uv = (v.x / (2 * RI) + 0.5, v.z / (2 * RI) + 0.5)
keep(d)
# brass cap with fluting, and the hanging loop
capz = math.sqrt(R * R - 0.1 ** 2)
prof = [(0.105, capz - 0.03), (0.115, capz - 0.01), (0.112, capz + 0.04), (0.098, capz + 0.07), (0.07, capz + 0.09),
        (0.04, capz + 0.095), (0.0, capz + 0.095)]
cap = keep(lathe("cap", prof, seg=64, mat=BR, cap_top=True))
for i in range(16):
    a = 2 * math.pi * i / 16
    keep(cyl(f"flute{i}", 0.008, 0.07, (0.113 * math.cos(a), 0.113 * math.sin(a), capz + 0.015), BR2, verts=10))
keep(torus("loop", 0.055, 0.011, (0, 0, capz + 0.15), BR, rot=(math.pi / 2, 0, 0), seg=48, mseg=12))
keep(cyl("loop_post", 0.012, 0.03, (0, 0, capz + 0.095), BR, verts=16))
# a few gold glitter stripes around the ball for a hand-painted feel
for z in (-0.37, 0.37):
    rr = math.sqrt(R * R - z * z) + 0.002
    t = torus(f"stripe{z}", rr, 0.006, (0, 0, z), BR, seg=96, mseg=8)
    # remove the part of the stripe that crosses the flat facet
    cc = box("sc", (1.2, 1.0, 1.2), (0, -R - 0.5 + depth + 0.02, 0), None)
    boolean(t, cc)
    keep(t)

for o in parts:
    if o.type == "MESH":
        K.sel(o)
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
root = empty("Ornament")
for o in parts:
    o.parent = root
print("STATS", K.stats([o for o in parts if o.type == "MESH"]))
bpy.ops.object.select_all(action="DESELECT")
for o in [root] + parts:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_yup=True,
                          export_apply=True, export_cameras=False, export_lights=False)
print("EXPORT", OUT, os.path.getsize(OUT) // 1024, "KB", "LOOP_TOP", capz + 0.15 + 0.066)
K.save(os.path.join(os.path.dirname(os.path.abspath(__file__)), "ornament.blend"))

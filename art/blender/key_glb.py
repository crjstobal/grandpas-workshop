"""key.glb: ornate antique brass key for three.js.

glTF axes: +Y up, key length along X, the medallion's FRONT faces +Z (Blender -Y) and carries the mesh
and material named "Drawing" (UVs 0..1, the user's drawing is applied there at runtime). The BACK of the
medallion has "24 12" embossed as real geometry. Origin at the centre, ~1 unit long.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gw import *  # noqa
from gw import K, bpy, bmesh, Vector, Matrix
import math

A = K.args(); OUT = A["out"]
K.reset()

BR = K.mat("Brass", (0.86, 0.63, 0.31), rough=0.3, metal=1.0)
BR2 = K.mat("BrassDark", (0.66, 0.46, 0.2), rough=0.42, metal=1.0)
PAPER = K.mat("Drawing", (0.93, 0.89, 0.80), rough=0.85)

R = 0.17          # medallion radius
T = 0.045         # medallion thickness (Y)
BX = -0.33        # medallion centre x
parts = []


def keep(o):
    parts.append(o)
    return o


# medallion body: a short cylinder along Y (faces -Y front / +Y back)
body = keep(cyl("bow_body", R, T, (BX, 0, 0), BR, rot=(math.pi / 2, 0, 0), verts=96, bevel=0.004))
# front recess: cut a shallow pocket for the drawing
pocket = cyl("pocket", R * 0.82, 0.03, (BX, -T / 2 - 0.006, 0), None, rot=(math.pi / 2, 0, 0), verts=96)
boolean(body, pocket)
# the Drawing disc (separate mesh) sitting in the pocket, UVs 0..1 as seen from the front
N = 96
rd = R * 0.82 - 0.002
verts = [(BX, -T / 2 + 0.006, 0.0)] + [(BX + rd * math.cos(2 * math.pi * i / N), -T / 2 + 0.006,
                                          rd * math.sin(2 * math.pi * i / N)) for i in range(N)]
faces = [(0, 1 + i, 1 + (i + 1) % N) for i in range(N)]  # normals towards -Y (front = glTF +Z)
dr = mesh_obj("Drawing", verts, faces, mat=PAPER)
uv = dr.data.uv_layers.new(name="UVMap")
for p in dr.data.polygons:
    for li in p.loop_indices:
        v = dr.data.vertices[dr.data.loops[li].vertex_index].co
        uv.data[li].uv = ((v.x - BX) / (2 * rd) + 0.5, v.z / (2 * rd) + 0.5)
for p in dr.data.polygons:
    p.use_smooth = False
keep(dr)
# ornate rims: front and back rings, a ring of beads, and a scalloped outer edge
for side in (-1, 1):
    keep(torus(f"rim{side}", R * 0.86, 0.011, (BX, side * (T / 2), 0), BR, rot=(math.pi / 2, 0, 0), seg=96, mseg=12))
for i in range(16):
    a = 2 * math.pi * i / 16
    keep(sphere(f"bead{i}", 0.018, (BX + (R + 0.012) * math.cos(a), 0, (R + 0.012) * math.sin(a)), BR,
                seg=16, rings=8))
for i in range(8):
    a = 2 * math.pi * (i + 0.5) / 8
    lobe = cyl(f"lobe{i}", 0.032, T * 0.7, (BX + (R + 0.02) * math.cos(a), 0, (R + 0.02) * math.sin(a)), BR2,
               rot=(math.pi / 2, 0, 0), verts=32, bevel=0.003)
    keep(lobe)
# the back face: "24 12" embossed (the only text in the whole project)
cu = bpy.data.curves.new("num", "FONT")
cu.body = "24 12"
cu.align_x, cu.align_y = "CENTER", "CENTER"
cu.size = 0.11
cu.extrude = 0.012
cu.bevel_depth = 0.0012
cu.resolution_u = 6
to = bpy.data.objects.new("num", cu)
link(to)
# text x -> -X (reads correctly from the back), text y -> +Z, text normal -> +Y
to.matrix_world = Matrix(((-1, 0, 0, BX), (0, 0, 1, T / 2 + 0.0155), (0, 1, 0, 0.0), (0, 0, 0, 1)))
tm = to_mesh(to)
tm.name = "Engraving"
tm.data.materials.clear()
tm.data.materials.append(K.mat("Engraving", (0.07, 0.035, 0.012), rough=0.55, metal=0.2))
# darker raised plate behind the number so it reads well
keep(cyl("backplate", R * 0.68, 0.004, (BX, T / 2 + 0.0015, 0), BR, rot=(math.pi / 2, 0, 0), verts=96))
keep(tm)
# a little raised ring framing the number on the back
keep(torus("backring", R * 0.7, 0.006, (BX, T / 2 + 0.002, 0), BR2, rot=(math.pi / 2, 0, 0), seg=96, mseg=8))
# collar between bow and shaft (surface of revolution along X)
prof = [(0.0, 0.0), (0.05, 0.0), (0.058, 0.012), (0.04, 0.03), (0.045, 0.045), (0.062, 0.06), (0.062, 0.075),
        (0.045, 0.09), (0.036, 0.11), (0.042, 0.125), (0.042, 0.14), (0.034, 0.15), (0.0, 0.15)]
col = keep(lathe("collar", prof, seg=48, mat=BR, loc=(BX + R + 0.005, 0, 0), rot=(0, math.pi / 2, 0)))
# shaft
SX0 = BX + R + 0.15
L = 0.47
keep(cyl("shaft", 0.032, L, (SX0 + L / 2, 0, 0), BR, rot=(0, math.pi / 2, 0), verts=48))
for i, x in enumerate((SX0 + 0.06, SX0 + L * 0.5)):
    keep(torus(f"band{i}", 0.034, 0.008, (x, 0, 0), BR2, rot=(0, math.pi / 2, 0), seg=48, mseg=10))
# tip
keep(sphere("tip", 0.04, (SX0 + L + 0.005, 0, 0), BR, scale=(0.7, 1, 1)))
# bit: a flat plate below the shaft near the tip, with notches
bx0 = SX0 + L - 0.2
bit = box("bit", (0.17, 0.03, 0.13), (bx0 + 0.085, 0, -0.065 - 0.02), BR, bevel=0.004)
for cx, cz, w, h in ((bx0 + 0.035, -0.13, 0.03, 0.06), (bx0 + 0.1, -0.15, 0.03, 0.05), (bx0 + 0.07, -0.06, 0.018, 0.03),
                     (bx0 + 0.14, -0.1, 0.02, 0.04)):
    c = box("notch", (w, 0.1, h), (cx, 0, cz), None)
    boolean(bit, c)
bit.modifiers.clear()
b2 = bit.modifiers.new("bevel", "BEVEL")
b2.width, b2.segments, b2.limit_method = 0.003, 2, "ANGLE"
keep(bit)

# apply modifiers, centre the origin, scale to ~1 unit long, export
bpy.context.view_layer.update()
for o in parts:
    if o.type == "MESH":
        K.sel(o)
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
lo, hi = K.bbox([o for o in parts if o.type == "MESH"])
c = (lo + hi) / 2
s = 1.0 / (hi.x - lo.x)
for o in parts:
    o.location = (Vector(o.location) - c) * s
    o.scale = Vector(o.scale) * s
bpy.context.view_layer.update()
K.sel(*parts)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
root = empty("Key")
for o in parts:
    o.parent = root
print("STATS", K.stats([o for o in parts if o.type == "MESH"]))
bpy.ops.object.select_all(action="DESELECT")
for o in [root] + parts:
    o.select_set(True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_yup=True,
                          export_apply=True, export_cameras=False, export_lights=False)
print("EXPORT", OUT, os.path.getsize(OUT) // 1024, "KB")
K.save(os.path.join(os.path.dirname(os.path.abspath(__file__)), "key.blend"))

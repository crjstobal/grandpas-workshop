"""snow_globe.glb: glass sphere (material "Glass", transmissive), turned wooden base with a brass band,
inside a tiny snowy workshop cottage and a fir tree at the back, leaving the front-centre of the glass
empty for a runtime message plane.

glTF axes: +Y up, the cottage faces +Z (towards a default three.js camera). Origin = centre of the glass
sphere. Glass radius 0.40.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gw import *  # noqa
from gw import K, bpy, Vector, Matrix
import math
import random

A = K.args(); OUT = A["out"]
K.reset()
GR = 0.40
GLASS = K.mat("Glass", (1.0, 1.0, 1.0), rough=0.02, transmission=1.0, ior=1.45)
WOOD = K.mat("Wood", (1, 1, 1), rough=0.42)
_t = WOOD.node_tree.nodes.new("ShaderNodeTexImage")
_t.image = bpy.data.images.load(os.path.join(os.path.dirname(os.path.abspath(__file__)), "tex", "globe_wood_512.jpg"))
_mp = WOOD.node_tree.nodes.new("ShaderNodeMapping"); _mp.inputs["Scale"].default_value = (2.0, 1.0, 1.0)
_tc = WOOD.node_tree.nodes.new("ShaderNodeTexCoord")
WOOD.node_tree.links.new(_tc.outputs["UV"], _mp.inputs["Vector"]); WOOD.node_tree.links.new(_mp.outputs["Vector"], _t.inputs["Vector"])
WOOD.node_tree.links.new(_t.outputs["Color"], K._bsdf(WOOD).inputs["Base Color"])
BRASS = K.mat("Brass", (0.86, 0.63, 0.31), rough=0.3, metal=1.0)
SNOW = K.mat("Snow", (0.90, 0.93, 0.97), rough=0.7)
WALL = K.mat("CottageWood", (0.33, 0.17, 0.08), rough=0.7)
TRIM = K.mat("Trim", (0.40, 0.04, 0.03), rough=0.5)
ROOF = K.mat("Roof", (0.12, 0.07, 0.05), rough=0.7)
WIN = K.mat("WindowGlow", (1.0, 0.62, 0.25), rough=0.4, emit=(1.0, 0.55, 0.2), emit_strength=3.0)
NEEDLE = K.mat("Needles", (0.03, 0.12, 0.05), rough=0.6)
BARK = K.mat("Bark", (0.08, 0.05, 0.03), rough=0.8)
parts = []
keep = lambda o: parts.append(o) or o  # noqa: E731

# glass sphere: open at the bottom where it sits in the base
g = sphere("Glass", GR, (0, 0, 0), GLASS, seg=96, rings=48)
cut = box("gcut", (1, 1, 0.5), (0, 0, -GR - 0.25 + 0.06), None)
boolean(g, cut)
keep(g)
# base: turned wood with a brass band
zb = -math.sqrt(GR ** 2 - (GR - 0.06) ** 2) * 0 - (GR - 0.06)
prof = [(0.0, -0.17), (0.36, -0.17), (0.37, -0.16), (0.37, -0.13), (0.34, -0.11), (0.33, -0.07), (0.30, -0.04),
        (0.28, -0.02), (0.28, 0.0), (0.0, 0.0)]
keep(lathe("base", [(r, z + zb) for r, z in prof], seg=96, mat=WOOD, cap_bottom=False))
keep(lathe("band", [(0.336, zb - 0.105), (0.347, zb - 0.1), (0.347, zb - 0.075), (0.336, zb - 0.07)], seg=96,
           mat=BRASS))
keep(lathe("feet_ring", [(0.30, zb - 0.17), (0.372, zb - 0.17), (0.372, zb - 0.158), (0.30, zb - 0.158)], seg=96,
           mat=BRASS))
# inner snow ground: a gentle mound filling the bottom of the sphere
from mathutils import noise
N = 48
verts, faces = [], []
rr = math.sqrt(GR ** 2 - (zb + 0.0) ** 2) - 0.01
for j in range(N + 1):
    for i in range(N + 1):
        x = -rr + 2 * rr * i / N
        y = -rr + 2 * rr * j / N
        d = math.hypot(x, y) / rr
        dd = min(d, 1.0)
        z = zb + 0.08 * (1 - dd ** 2) + 0.012 * noise.noise(Vector((x * 9, y * 9, 0.3))) + 0.004
        # clamp inside the sphere
        if d > 1:
            x, y = x / d, y / d
            z = zb + 0.004
        verts.append((x, y, z))
for j in range(N):
    for i in range(N):
        a = j * (N + 1) + i
        faces.append((a, a + 1, a + N + 2, a + N + 1))
ground = keep(mesh_obj("snow_ground", verts, faces, smooth=True, mat=SNOW))


def ground_z(x, y):
    d = min(math.hypot(x, y) / rr, 1)
    return zb + 0.08 * (1 - d ** 2) + 0.004


# tiny cottage at the back left (faces -Y in Blender = +Z in glTF)
cx, cy = -0.09, 0.12
cz = ground_z(cx, cy) - 0.01
W, D, H, RH = 0.15, 0.12, 0.10, 0.17
keep(box("c_walls", (W, D, H), (cx, cy, cz + H / 2), WALL, bevel=0.003))
for sx in (-1, 1):
    keep(box(f"c_corner{sx}", (0.012, 0.012, H), (cx + sx * W / 2, cy - D / 2, cz + H / 2), TRIM, bevel=0.002))
# gable roof
for sx in (-1, 1):
    ang = math.atan2(RH - H, W / 2)
    L = (W / 2 + 0.02) / math.cos(ang)
    keep(box(f"c_roof{sx}", (L, D + 0.04, 0.014), (cx + sx * (W / 4 + 0.005), cy, cz + (H + RH) / 2 + 0.008), ROOF,
             rot=(0, sx * ang, 0)))
    sn = keep(box(f"c_snowroof{sx}", (L + 0.01, D + 0.05, 0.022), (cx + sx * (W / 4 + 0.006), cy, cz + (H + RH) / 2 + 0.024),
                  SNOW, bevel=0.009, rot=(0, sx * ang, 0)))
gable = mesh_obj("c_gable", [(cx - W / 2, cy - D / 2 - 0.0005, cz + H), (cx + W / 2, cy - D / 2 - 0.0005, cz + H),
                             (cx, cy - D / 2 - 0.0005, cz + RH)], [(0, 1, 2)], mat=WALL)
keep(gable)
gb = mesh_obj("c_gable_b", [(cx - W / 2, cy + D / 2 + 0.0005, cz + H), (cx, cy + D / 2 + 0.0005, cz + RH),
                            (cx + W / 2, cy + D / 2 + 0.0005, cz + H)], [(0, 1, 2)], mat=WALL)
keep(gb)
keep(box("c_door", (0.04, 0.006, 0.07), (cx - 0.03, cy - D / 2 - 0.003, cz + 0.035), TRIM, bevel=0.002))
keep(cyl("c_window", 0.022, 0.006, (cx + 0.035, cy - D / 2 - 0.003, cz + 0.06), WIN, rot=(math.pi / 2, 0, 0), verts=32))
keep(torus("c_winframe", 0.022, 0.004, (cx + 0.035, cy - D / 2 - 0.005, cz + 0.06), TRIM, rot=(math.pi / 2, 0, 0),
           seg=32, mseg=8))
keep(cyl("c_pipe", 0.008, 0.06, (cx + 0.045, cy + 0.02, cz + RH - 0.01), BRASS, verts=16))
keep(sphere("c_pipesnow", 0.012, (cx + 0.045, cy + 0.02, cz + RH + 0.022), SNOW, scale=(1, 1, 0.5), seg=16, rings=8))


# a stylised fir at the back right: scalloped tiers with snow on top
def tier(name, r, h, z0, x, y, seed):
    rng = random.Random(seed)
    prof = []
    n = 64
    verts = [(x, y, z0 + h)]
    ring = []
    for i in range(n):
        a = 2 * math.pi * i / n
        rrr = r * (1 + 0.08 * math.sin(a * 9 + seed))
        ring.append((x + rrr * math.cos(a), y + rrr * math.sin(a), z0 + 0.012 * math.sin(a * 9 + seed)))
    inner = [(x + 0.5 * (p[0] - x), y + 0.5 * (p[1] - y), z0 + h * 0.18) for p in ring]
    vs = verts + ring + inner
    fs = [(0, 1 + (i + 1) % n, 1 + i) for i in range(n)]
    fs += [(1 + i, 1 + (i + 1) % n, 1 + n + (i + 1) % n, 1 + n + i) for i in range(n)]
    o = mesh_obj(name, vs, fs, smooth=True, mat=NEEDLE)
    return o


tx, ty = 0.14, 0.1
tz = ground_z(tx, ty) - 0.005
keep(cyl("t_trunk", 0.012, 0.05, (tx, ty, tz + 0.025), BARK, verts=12))
for i, (r, h, z) in enumerate(((0.09, 0.1, 0.035), (0.072, 0.09, 0.09), (0.055, 0.08, 0.14), (0.036, 0.07, 0.185))):
    keep(tier(f"t_tier{i}", r, h, tz + z, tx, ty, i * 3))
    sc_ = keep(tier(f"t_snow{i}", r * 0.62, h * 0.55, tz + z + h * 0.5, tx, ty, i * 3 + 1))
    sc_.data.materials[0] = SNOW
keep(sphere("t_star", 0.012, (tx, ty, tz + 0.262), BRASS, seg=16, rings=8))
# a second small tree and a little snowman-free lantern post at front-left edge (kept low)
keep(cyl("t2_trunk", 0.008, 0.03, (0.17, -0.08, ground_z(0.17, -0.08) + 0.012), BARK, verts=10))
for i, (r, h, z) in enumerate(((0.05, 0.06, 0.02), (0.038, 0.05, 0.055), (0.025, 0.045, 0.085))):
    keep(tier(f"t2_tier{i}", r, h, ground_z(0.17, -0.08) + z, 0.17, -0.08, 7 + i))
    s2 = keep(tier(f"t2_snow{i}", r * 0.6, h * 0.5, ground_z(0.17, -0.08) + z + h * 0.5, 0.17, -0.08, 9 + i))
    s2.data.materials[0] = SNOW

# finish: apply modifiers, triangulate nothing special, export with origin at the glass centre
for o in parts:
    if o.type == "MESH":
        K.sel(o)
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
root = empty("SnowGlobe")
for o in parts:
    o.parent = root
print("STATS", K.stats([o for o in parts if o.type == "MESH"]))
bpy.ops.object.select_all(action="DESELECT")
for o in [root] + parts:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_yup=True,
                          export_apply=True, export_cameras=False, export_lights=False)
print("EXPORT", OUT, os.path.getsize(OUT) // 1024, "KB")
print("GROUND_TOP", zb + 0.084)
K.save(os.path.join(os.path.dirname(os.path.abspath(__file__)), "snow_globe.blend"))

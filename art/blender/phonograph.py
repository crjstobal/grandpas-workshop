"""phonograph.jpg: a cosy corner with Grandpa's gramophone (no record on it) next to an unlit small
Christmas tree, a rocking chair, a rug, moonlight through the window."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gw_machine import *  # noqa
from gw import K, bpy, Vector, _blob
import math
import random

A = K.args(); OUT = A["out"]; FAST = bool(A.get("fast"))
sc = setup(1920, 1080, fast=FAST, samples=512, exposure=float(A.get("exp", 0.0)))
K.world_color((0.01, 0.012, 0.02), 1.0)
WIN = (-0.75, 1.55, 0.62, 0.8)
room(W=6.0, D=5.0, H=2.6, window=WIN)
rng = random.Random(2)
FLOOR = [bpy.data.objects["floor"]]

# little cabinet for the gramophone
cm = wood("cab_wood", "wood_cabinet_worn_long", tint=(1.0, 0.8, 0.62))
GX, GY = 0.62, BACK - 0.45
CH = 0.72
top = box("cab_top", (0.62, 0.5, 0.04), (GX, GY, CH - 0.02), cm, bevel=0.008)
K.uv_real_size(top)
body = box("cab_body", (0.56, 0.44, 0.5), (GX, GY, CH - 0.04 - 0.25), cm, bevel=0.006)
K.uv_real_size(body)
for sx in (-1, 1):
    for sy in (-1, 1):
        lathe(f"cab_leg{sx}{sy}", [(0.0, 0.0), (0.02, 0.0), (0.026, 0.05), (0.018, 0.12), (0.024, 0.17), (0.024, 0.19),
                                   (0.0, 0.19)], seg=24, mat=cm, loc=(GX + sx * 0.25, GY + sy * 0.18, 0.0))
dr = box("cab_drawer", (0.5, 0.02, 0.14), (GX, GY - 0.225, CH - 0.13), cm, bevel=0.004)
K.uv_real_size(dr)
sphere("cab_knob", 0.016, (GX, GY - 0.245, CH - 0.13), brass("brass"), seg=20, rings=10)
gr = gramophone("gramophone", (GX - 0.02, GY + 0.0, CH), rz=0.0)
# a small stack of record sleeves leaning on the cabinet (plain, no labels)
for i, c in enumerate(((0.35, 0.08, 0.05), (0.12, 0.2, 0.3), (0.55, 0.45, 0.25))):
    box(f"sleeve{i}", (0.31, 0.006, 0.31), (GX + 0.42 + i * 0.012, GY - 0.05, 0.16), paint(f"sleeve{i}", c, rough=0.6, coat=0.1),
        bevel=0.002, rot=(0, math.radians(-12 + i * 2), math.radians(-6)))

# the unlit Christmas tree in a wooden bucket, with its (switched off) light string
bk = import_ph("wooden_bucket_01", "bucket", drop=("handle",))
K.fit(bk, 0.36, "x")
TX, TY = -0.22, BACK - 0.62
K.place(bk, TX, TY, on=FLOOR)
lo, hi = K.bbox(bk)
soil = cyl("soil", 0.15, 0.02, (TX, TY, hi.z - 0.04), paint("soil", (0.05, 0.03, 0.02), rough=0.95, coat=0), verts=32)
tree, tips = fir_tree("xmas", 1.45, 0.55, (TX, TY, hi.z - 0.05), seed=41, return_tips=True)
spiral = []
for i in range(60):
    t = i / 59
    z = hi.z + 0.15 + t * 1.1
    rr = 0.5 * (1 - t) ** 0.95 + 0.04
    a = t * 2 * math.pi * 4.2
    spiral.append((TX + rr * math.cos(a), TY + rr * math.sin(a), z))
fairy_lights("tree_lights", spiral, sag=0.0, per_span=1, lit=False, r=0.011, seed=4)
# a few wrapped gifts under the tree (plain paper, ribbons, no tags)
for i, (dx, dy, sz, c) in enumerate(((-0.36, -0.08, 0.2, (0.35, 0.03, 0.03)), (0.32, -0.12, 0.16, (0.05, 0.18, 0.08)),
                                      (-0.12, -0.3, 0.13, (0.7, 0.6, 0.4)))):
    gx, gy = TX + dx, TY + dy
    g = box(f"gift{i}", (sz, sz, sz * 0.8), (gx, gy, sz * 0.4 + 0.001), paint(f"giftp{i}", c, rough=0.55, coat=0.1),
            bevel=0.004, rot=(0, 0, math.radians(15 * i)))
    rib = paint("ribbon_gold", (0.7, 0.5, 0.15), rough=0.3, coat=0.5)
    for ax in (0, 1):
        box(f"gift{i}_rib{ax}", ((sz + 0.004) if ax == 0 else 0.022, 0.022 if ax == 0 else (sz + 0.004), sz * 0.8 + 0.004),
            (gx, gy, sz * 0.4 + 0.001), rib, rot=(0, 0, math.radians(15 * i)))
    sphere(f"gift{i}_bow", 0.025, (gx, gy, sz * 0.8 + 0.01), rib, scale=(1.4, 0.8, 0.6), rot=(0, 0, math.radians(15 * i)))

# rocking chair on the left with a cushion and a knitted blanket, a round rug
rc = import_ph("Rockingchair_01", "rocking")
rc.rotation_euler[2] = math.radians(-40)
K.place(rc, 1.55, BACK - 1.05, on=FLOOR)
rug_m = felt("rug", (0.2, 0.035, 0.03))
rug = cyl("rug", 1.05, 0.012, (0.3, BACK - 1.3, 0.006), rug_m, verts=96)
for i in range(1, 7):
    torus(f"rug_ring{i}", 1.05 * i / 7, 0.012, (0.3, BACK - 1.3, 0.012), felt(f"rugring{i % 2}", (0.3, 0.2, 0.11) if i % 2 else (0.06, 0.11, 0.06)),
          seg=96, mseg=6).scale = (1, 1, 0.5)
pil = import_ph("throw_pillows_01", "pillows")
for o in list(K.meshes(pil))[1:]:
    bpy.data.objects.remove(o)
K.fit(pil, 0.4, "x")
pil.rotation_euler = (math.radians(-15), 0, math.radians(-40))
lo, hi = K.bbox(rc)
K.place(pil, 1.52, BACK - 1.07, z=lo.z + 0.42)
bs = import_ph("wicker_basket_01", "basket")
K.fit(bs, 0.42, "x")
K.place(bs, 1.12, BACK - 0.55, on=FLOOR)
for i, c in enumerate(((0.42, 0.03, 0.03), (0.05, 0.2, 0.08), (0.65, 0.55, 0.35))):
    lo, hi = K.bbox(bs)
    sphere(f"yarnp{i}", 0.07, (1.05 + i * 0.08, BACK - 0.55 + (i % 2) * 0.04, lo.z + 0.08 + (0.03 if i == 1 else 0)), felt(f"yarn{i}", c))

# lights: a candle lantern on the cabinet, pendant bulb, fairy garland along the beam, moonlight
lan = import_ph("wooden_lantern_01", "cab_lantern")
K.fit(lan, 0.26, "z")
K.place(lan, GX - 0.22, GY + 0.12, on=[top])
swap_glass(lan, glow_glass("pl_glass", 1900, 2.5))
lo, hi = K.bbox(lan)
c = (lo + hi) / 2
sphere("cl_flame", 0.012, (c.x, c.y, lo.z + 0.09), emit("flame", K.kelvin(1800), 60.0), scale=(0.7, 0.7, 1.4))
K.light("POINT", (c.x, c.y, lo.z + 0.1), power=float(A.get("lan", 8)), size=0.02, k=1900, name="cab_lantern_light")
hanging_bulb("pendant", (0.25, BACK - 1.1, 1.9), length=0.6, power=float(A.get("bulb", 45)), k=2500)
fairy_lights("fl_beam", [(-1.6, BACK - 0.42, 2.38), (-0.6, BACK - 0.42, 2.36), (0.4, BACK - 0.42, 2.38), (1.5, BACK - 0.42, 2.36)],
             sag=0.14, per_span=7, strength=6.0, r=0.009)
moon = K.light("SUN", (0, 0, 5), None, power=float(A.get("moon", 1.2)), size=1.0, k=8500, name="moon")
moon.rotation_euler = (math.radians(55), 0, math.radians(170))
wl = K.light("AREA", (WIN[0], BACK + 0.4, WIN[1]), (WIN[0] + 0.5, BACK - 1, 0.8), power=float(A.get("winfill", 50)),
             size=0.7, k=9000, name="window_sky")
wl.visible_camera = wl.visible_transmission = wl.visible_glossy = False
fill = K.light("AREA", (0.3, -0.8, 2.2), (0.3, BACK - 0.5, 0.9), power=float(A.get("fill", 140)), size=2.0, k=3200,
               name="room_fill")
fill.visible_camera = fill.visible_glossy = fill.visible_transmission = False
key = K.light("AREA", (-0.3, BACK - 1.6, 1.5), (GX, GY, 1.0), power=float(A.get("key", 30)), size=0.8, k=2800, name="gram_key")
key.visible_camera = key.visible_glossy = False

cam = K.camera((0.3, BACK - 3.35, 1.32), (0.36, BACK - 0.5, 0.9), lens=float(A.get("lens", 28)), fstop=5.6)
cam.data.dof.focus_distance = (Vector((GX, GY, 1.0)) - cam.location).length
bloom(0.25, 1.5, 7)
K.save(f"{OUT}/phonograph.blend")
K.render(f"{OUT}/phonograph.png")

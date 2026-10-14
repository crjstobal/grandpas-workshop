"""roof.jpg: the flight minigame backdrop. The snowy ridge of the workshop roof runs low across the frame with a
brick chimney breathing soft smoke; above it the whole sky is the playfield: deep blue, stars, the moon, far
snowy hills and, tiny on a stone viaduct across the valley, Grandpa's little train stuck in the snow.

  ... --python roof.py -- --out DIR [--fast]     -> DIR/roof.png
  ... --python roof.py -- --out DIR --far        -> DIR/roof_far_raw.png: hills, viaduct and train only (alpha),
                                                    on a double-wide frame, for the parallax strip roof_far.png
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gw_props import *  # noqa
from gw_outdoor import hills, far_forest, viaduct, toy_train, brick_chimney, smoke_plume, snow_slab
from gw import K, bpy, Vector

A = K.args(); OUT = A["out"]; FAST = bool(A.get("fast")); FAR = bool(A.get("far"))
HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)
sc = setup(1920, 1080, fast=FAST, samples=384, exposure=float(A.get("exp", 0.0)))
night_sky(top=(0.004, 0.009, 0.034), horizon=(0.05, 0.085, 0.17), strength=1.0)

# ---------------------------------------------------------------- the workshop, turned so its ridge runs along X
D = 13.0
ws = workshop(D=D)
root = ws["root"]
root.rotation_euler = (0, 0, math.radians(90))   # old +Y (depth) -> -X; the old left slope now faces the camera (-Y)
root.location = (D / 2, 0, 0)
for n in ("workshop_pipe", "workshop_pipecap", "workshop_pipesnow"):
    bpy.data.objects.remove(bpy.data.objects[n])
bpy.context.view_layer.update()
g = snow_ground(res=120)

# brick chimney on the near slope, its foot buried in the roof
CX, CY = float(A.get("cx", -2.2)), -0.62
ch, top = brick_chimney("chimney", (CX, CY, 2.35), size=(0.6, 0.5), h=1.75)
fire = K.light("POINT", (CX, CY, top.z - 0.25), power=6, size=0.1, k=1800, name="fire_glow")
smoke_plume("smoke", top + Vector((0, 0, 0.12)), n=10, rise=2.9, drift=(1.7, 0.6), r0=0.14, r1=0.85,
            density=float(A.get("smoke", 12.0)))
from gw import _blob
for i, (dx, dy, sz) in enumerate(((-0.42, -0.05, 0.22), (0.4, -0.12, 0.18), (0.0, -0.32, 0.2))):
    bl = _blob(f"chimney_drift{i}", (sz, sz * 0.8, sz * 0.45), snow_mat(), random.Random(30 + i))
    bl.location = (CX + dx, CY + dy, 2.15 + (3.15 - 2.15) * (1 - abs(CY + dy) / 1.5) + 0.22)

# ---------------------------------------------------------------- far away: hills, forest, viaduct, train
VX, VY = float(A.get("vx", 120.0)), float(A.get("vy", 175.0))
hl = hills("hills", -420, 420, 30, 520, res=(220, 110), seed=6, amp=22.0, rise=0.05, valley=(VX, 30.0, 16.0))
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()


def ground_z(x, y):
    ok, loc, _n, _i, _o, _m = sc.ray_cast(dg, Vector((x, y, 500)), Vector((0, 0, -1)))
    return loc.z if ok else 0.0


floor = ground_z(VX, VY)
rim = (ground_z(VX - 40, VY) + ground_z(VX + 40, VY)) / 2
deck = max(floor + 12.0, rim + float(A.get("lift", 2.5)))
vroot, deck_local, VL = viaduct("viaduct", n=8, span=8.0, h=deck - floor + 3.0, w=3.4, loc=(VX, VY, floor - 3.0))
train = toy_train("train", (VX + 6.0, VY, floor - 3.0 + deck_local), rot_z=math.pi, cars=3, head_strength=80,
                  beam=float(A.get("beam", 22)))
# snow drift heaped in front of the loco: why it is stuck
snow_slab("drift", (5.0, 3.6, 1.4), (VX + 6.0 - 4.2 - 2.0, VY, floor - 3.0 + deck_local + 0.3), bevel=0.6, disp=0.4,
          noise=2.0)
rng = random.Random(8)
pts = []
for _ in range(900):
    x, y = rng.uniform(-400, 400), rng.uniform(170, 500)
    if abs(x - VX) < 26 and y < 300:
        continue
    pts.append((x, y, ground_z(x, y) - 0.5))
forest = far_forest("forest", pts, hmin=7, hmax=14)

# ---------------------------------------------------------------- sky
m_, stars = stars_and_moon(moon_dir=(0.62, 1.0, 0.5), n=1500)
m_.scale = (1.4, 1.4, 1.4)
moon = K.light("SUN", (0, 0, 10), None, power=float(A.get("moon", 0.5)), size=1.5, k=9000, name="moon")
moon.rotation_euler = (math.radians(66), 0, math.radians(-70))   # from behind the camera, left: lights the near slope
fill = K.light("AREA", (2.0, -6.0, 5.0), (0, 0, 3.0), power=float(A.get("fill", 120)), size=4.0, k=10000,
               name="sky_fill")
fill.visible_camera = fill.visible_glossy = False
snowfall("flakes", 320, (-6, -5, 2.6), (6, 4, 8.0), rmin=0.006, rmax=0.014, mat=emit("flake", (0.85, 0.9, 1.0), 0.25))

# ---------------------------------------------------------------- camera: ridge low, sky everywhere else
CAMX = float(A.get("camx", -3.4))
cam = K.camera((CAMX, -7.4, float(A.get("camz", 3.62))), (CAMX + 7.0, 10.0, float(A.get("camz", 3.62))),
               lens=float(A.get("lens", 28)), fstop=None)
cam.data.shift_y = float(A.get("sy", 0.17))
bloom(0.3, 1.2, 7)

if FAR:
    keep = {"hills", "forest"}
    for o in bpy.context.scene.objects:
        if o.type not in ("MESH", "CURVE"):
            continue
        top_ = o
        while top_.parent:
            top_ = top_.parent
        if not (o.name in keep or top_.name in ("viaduct", "train") or o.name == "drift"):
            o.hide_render = True
    sc.render.film_transparent = True
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.resolution_x = 3840
    # double sensor width on a double-wide frame: same pixel scale and horizon row as roof.png, twice the view
    cam.data.sensor_width = 72.0
    cam.data.shift_y = cam.data.shift_y / 2   # shift is in units of the frame width
    K.render(f"{OUT}/roof_far_raw.png")
else:
    K.save(f"{HERE}/roof.blend")
    K.render(f"{OUT}/roof.png")

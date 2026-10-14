"""shelf.jpg: Grandpa's toy shelf, wooden toys, and the centre drawer locked with a brass 4-wheel
combination lock (the snow globe is inside the drawer, not visible)."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gw_toys import *  # noqa
from gw import K, bpy, Vector
from bpy_extras.object_utils import world_to_camera_view
import math
import random

A = K.args(); OUT = A["out"]; FAST = bool(A.get("fast"))
sc = setup(1920, 1080, fast=FAST, samples=512, exposure=float(A.get("exp", 0.0)))
K.world_color((0.01, 0.012, 0.02), 1.0)
WIN = (1.35, 1.45, 0.6, 0.75)
room(W=6.0, D=5.0, H=2.6, window=WIN)
SX = -0.15
sh = toy_shelf("shelf", x=SX)
s1, s2, s3 = sh["shelves"][2], sh["shelves"][3], sh["shelves"][4]
y0 = sh["y0"]
ym = BACK - 0.22
rng = random.Random(3)

B124 = [bpy.data.objects["shelf_board1.24"]]
B162 = [bpy.data.objects["shelf_board1.62"]]
# shelf 1 (just above the drawers)
toy_train("train", (SX - 0.42, ym, s1), rz=math.radians(-8), s=1.7)
box("tcar", (0.13, 0.1, 0.06), (SX - 0.16, ym + 0.01, s1 + 0.06), toy_mats()["blue"], bevel=0.006)
box("tcar_ch", (0.16, 0.11, 0.02), (SX - 0.16, ym + 0.01, s1 + 0.028), toy_mats()["wood"], bevel=0.004)
for wx in (-0.05, 0.05):
    for sy in (-1, 1):
        cyl(f"tcarw{wx}{sy}", 0.024, 0.012, (SX - 0.16 + wx, ym + 0.01 + sy * 0.06, s1 + 0.024), toy_mats()["red"],
            rot=(math.pi / 2, 0, 0), verts=24, bevel=0.003)
blocks("blk", (SX + 0.05, ym - 0.04, s1), n=4, s=0.07)
drum("drum", (SX + 0.5, ym + 0.02, s1), r=0.085, h=0.1)
spinning_top("top1", (SX + 0.32, ym - 0.08, s1), s=1.5)
# shelf 2
nutcracker("nut1", (SX - 0.58, ym, s2), s=1.6, rz=math.radians(8))
nutcracker("nut2", (SX + 0.58, ym, s2), s=1.6, rz=math.radians(-10))
el = import_ph("carved_wooden_elephant", "elephant")
K.fit(el, 0.28, "x")
el.rotation_euler[2] = math.radians(-20)
K.place(el, SX - 0.25, ym, on=B124)
stacking_rings("rings", (SX + 0.05, ym, s2), s=1.5)
toy_house("house", (SX + 0.3, ym + 0.03, s2), s=1.6, rz=math.radians(-12))
spinning_top("top2", (SX - 0.02, ym - 0.1, s2), s=1.1, c1="green")
# shelf 3
airplane("plane", (SX - 0.32, ym, s3), s=1.8, rz=math.radians(-25))
bk = import_ph("book_encyclopedia_set_01", "books")
for o in list(K.meshes(bk))[7:]:
    bpy.data.objects.remove(o)
K.fit(bk, 0.24, "x")
K.place(bk, SX + 0.45, ym + 0.05, on=B162)
bowl = import_ph("wooden_bowl_01", "bowl")
K.fit(bowl, 0.24, "x")
K.place(bowl, SX + 0.1, ym, on=B162)
lo, hi = K.bbox(bowl)
for i, (dx_, dy_, c) in enumerate(((-0.04, 0.0, (0.42, 0.03, 0.03)), (0.04, 0.01, (0.05, 0.2, 0.08)), (0.0, 0.045, (0.6, 0.5, 0.3)))):
    sphere(f"yarnb{i}", 0.042, (SX + 0.1 + dx_, ym + dy_, lo.z + 0.05 + (0.025 if i == 2 else 0)), felt(f"yarn{i}", c))

# the lock on the centre drawer
dx, dyf, dz = sh["drawers"][1]
lock, wheels = combo_lock("combo", (dx, dyf, dz), s=1.45)

# garland of fairy lights along the crown, a candle on top, a hanging bulb
crown_z = 2.05
fairy_lights("fl_crown", [(SX - 0.8, y0 - 0.05, crown_z), (SX - 0.25, y0 - 0.06, crown_z), (SX + 0.3, y0 - 0.06, crown_z),
                          (SX + 0.8, y0 - 0.05, crown_z)], sag=0.16, per_span=6, strength=6.0, r=0.009)
fairy_lights("fl_shelf", [(SX - 0.7, y0 - 0.01, s2 - 0.04), (SX - 0.23, y0 - 0.015, s2 - 0.045), (SX + 0.23, y0 - 0.015, s2 - 0.045), (SX + 0.7, y0 - 0.01, s2 - 0.04)],
             sag=0.08, per_span=7, strength=5.0, r=0.008, seed=7)
bulb = hanging_bulb("pendant", (SX - 0.9, BACK - 1.0, 1.7), length=0.85, power=float(A.get("bulb", 55)), k=2500)
moon = K.light("SUN", (0, 0, 5), None, power=float(A.get("moon", 0.8)), size=1.0, k=8500, name="moon")
moon.rotation_euler = (math.radians(60), 0, math.radians(200))
wl = K.light("AREA", (WIN[0], BACK + 0.4, WIN[1]), (WIN[0] - 0.8, BACK - 1, 1.0), power=float(A.get("winfill", 40)),
             size=0.6, k=9000, name="window_sky")
wl.visible_camera = wl.visible_transmission = wl.visible_glossy = False
fill = K.light("AREA", (0.0, -0.6, 2.2), (SX, BACK - 0.3, 1.0), power=float(A.get("fill", 150)), size=2.0, k=3200,
               name="room_fill")
fill.visible_camera = fill.visible_glossy = fill.visible_transmission = False
key = K.light("AREA", (SX - 1.2, BACK - 1.2, 1.2), (dx, y0, dz), power=float(A.get("key", 25)), size=0.6, k=2700,
              name="lock_key")
key.visible_camera = False
# a rocking chair at the left edge with a throw pillow, a basket on the floor
rc = import_ph("Rockingchair_01", "rocking")
rc.rotation_euler[2] = math.radians(60)
K.place(rc, SX - 1.35, BACK - 1.0, on=[bpy.data.objects["floor"]])
bs = import_ph("wicker_basket_01", "basket")
K.fit(bs, 0.45, "x")
K.place(bs, SX + 0.95, BACK - 0.45, on=[bpy.data.objects["floor"]])

cam = K.camera((SX + 0.2, BACK - 2.45, 1.1), (SX + 0.06, BACK - 0.4, 0.98), lens=float(A.get("lens", 32)), fstop=5.6)
cam.data.dof.focus_distance = (Vector((dx, y0, dz)) - cam.location).length
bloom(0.25, 1.5, 7)
bpy.context.view_layer.update()
px = []
for w in wheels:
    v = world_to_camera_view(sc, cam, w)
    px.append([round(v.x * 1920), round((1 - v.y) * 1080)])
json.dump({"lock_wheels_px": px}, open(f"{OUT}/shelf_lock.json", "w"))
print("WHEELS", px)
K.save(f"{OUT}/shelf.blend")
K.render(f"{OUT}/shelf.png")

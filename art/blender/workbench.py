"""workbench.jpg (no Pip) and the Pip sprites rendered from the very same camera and lights.

  ... --python workbench.py -- --out DIR [--fast]                -> DIR/workbench.png
  ... --python workbench.py -- --out DIR --pip sleep|awake|cold    -> DIR/jingle_<pose>.png (RGBA crop,
      frozen box in jingle_box.json: draw it at x,y scaled to size x size on workbench.jpg)
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gw_interior import *  # noqa
from gw_pip import pip, pip_meshes
from gw import K, bpy, Vector, _blob
from bpy_extras.object_utils import world_to_camera_view
import math
import random

A = K.args(); OUT = A["out"]; FAST = bool(A.get("fast")); POSE = A.get("pip")
sc = setup(1920, 1080, fast=FAST, samples=512 if not POSE else 256, exposure=float(A.get("exp", 0.0)))
K.world_color((0.01, 0.012, 0.02), 1.0)

WIN = (-0.62, 1.66, 0.56, 0.5)
room(W=6.0, D=5.0, H=2.6, window=WIN)
wb = workbench(-1.35, 1.35, depth=0.8)
TOP = BENCH_Z
rng = random.Random(7)

# ---------------------------------------------------------------- the perch (Pip's spot, centre-right)
PERCH = (0.38, BACK - 0.42, TOP)
pr, BAR = perch("perch", PERCH)

# ---------------------------------------------------------------- tool wall behind the bench
board_m = wood("toolboard", "dark_wood", tint=(0.55, 0.42, 0.33))
tb = box("toolboard", (1.3, 0.03, 0.62), (0.55, BACK - 0.015, 1.42), board_m, bevel=0.006)
K.uv_real_size(tb)
nail_m = iron("nail")


def hang(asset, x, z, rz=0.0, ry=0.0, size=None, name=None, axis="z"):
    r = import_ph(asset, name or asset)
    if size:
        K.fit(r, size, axis)
    r.rotation_euler = (0, math.radians(ry), math.radians(rz))
    bpy.context.view_layer.update()
    lo, hi = K.bbox(r)
    r.location += Vector((x - (lo.x + hi.x) / 2, (BACK - 0.032) - hi.y, z - (lo.z + hi.z) / 2))
    bpy.context.view_layer.update()
    return r


hang("wooden_hammer_01", 0.0, 1.43, size=0.27)
hang("handsaw_wood", 0.36, 1.46, rz=90, ry=0, size=0.46, axis="y")
hang("adjustable_wrench", 0.66, 1.42, size=0.24)
hang("pliers", 0.83, 1.4, size=0.18)
hang("flathead_screwdriver", 0.96, 1.42, size=0.24, name="sd1", rz=90, ry=0)
hang("cross_pein_hammer", 1.1, 1.43, size=0.27)
for x, z in ((0.0, 1.6), (0.32, 1.64), (0.66, 1.56), (0.83, 1.5), (0.96, 1.56), (1.1, 1.6)):
    cyl(f"nail{x}", 0.004, 0.03, (x, BACK - 0.04, z), nail_m, rot=(math.pi / 2, 0, 0), verts=8)

# pinned sketches (no writing): a little bird sketch and a gear sketch
bird = [[(0.25, 0.45), (0.35, 0.62), (0.55, 0.66), (0.7, 0.55), (0.72, 0.4), (0.6, 0.3), (0.4, 0.3), (0.25, 0.45)],
        [(0.62, 0.62), (0.7, 0.72), (0.8, 0.68), (0.78, 0.6)], [(0.25, 0.45), (0.12, 0.52), (0.18, 0.4)],
        [(0.45, 0.3), (0.43, 0.18)], [(0.55, 0.3), (0.57, 0.18)]]
gearsk = [[(0.5 + 0.28 * math.cos(a / 12 * 6.283), 0.5 + 0.22 * math.sin(a / 12 * 6.283)) for a in range(13)],
          [(0.5 + 0.1 * math.cos(a / 8 * 6.283), 0.5 + 0.08 * math.sin(a / 8 * 6.283)) for a in range(9)]]
pinned_paper("sketch1", (-0.1, BACK, 1.45), w=0.17, h=0.22, rot=math.radians(4), drawing=bird)
pinned_paper("sketch2", (-0.2, BACK, 1.22), w=0.16, h=0.13, rot=math.radians(-7), drawing=gearsk,
             tint=(0.72, 0.78, 0.82))

# shelf above with jars, a clock and books
# back row on the bench: jars of parts, a little potted fir, the mantel clock, books
jar("jar1", (-0.24, BACK - 0.09, TOP), fill=26, seed=1)
jar("jar2", (-0.13, BACK - 0.08, TOP), r=0.038, h=0.09, fill=18, seed=2)
bp = import_ph("brass_pot_01", "brass_pot")
K.fit(bp, 0.13, "x")
K.place(bp, 0.06, BACK - 0.1, on=[wb["top"]])
lo, hi = K.bbox(bp)
soil = cyl("pot_soil", 0.055, 0.01, (0.06, BACK - 0.1, hi.z - 0.012), paint("soil", (0.05, 0.03, 0.02), rough=0.95, coat=0), verts=32)
fir_tree("mini_fir", 0.34, 0.15, (0.06, BACK - 0.1, hi.z - 0.012), seed=31, whorl_gap=0.022)
mc = import_ph("mantel_clock_01", "mantel_clock")
K.fit(mc, 0.3, "x")
K.place(mc, 1.0, BACK - 0.1, on=[wb["top"]])
bk = import_ph("book_encyclopedia_set_01", "books")
for o in list(K.meshes(bk))[6:]:
    bpy.data.objects.remove(o)
K.fit(bk, 0.16, "x")
bk.rotation_euler[2] = math.radians(90)
K.place(bk, 1.25, BACK - 0.12, on=[wb["top"]])

# ---------------------------------------------------------------- on the bench
vise = import_ph("bench_vice_01", "vise", drop=("Icosphere",))
K.fit(vise, 0.2, "y")
vise.rotation_euler[2] = math.radians(90)
K.place(vise, -0.95, wb["y0"] + 0.14, on=[wb["top"]])
lamp, head = magnifier_lamp("maglamp", (-0.68, BACK - 0.12, TOP), reach=(0.36, -0.3), head_z=0.36,
                            light_power=float(A.get("lamp", 22)))
hp = import_ph("hand_plane_no4", "plane")
K.fit(hp, 0.26, "x")
hp.rotation_euler[2] = math.radians(-12)
K.place(hp, -0.72, BACK - 0.62, on=[wb["top"]])
gears = scatter_gears("g", (-0.14, BACK - 0.38), area=(0.36, 0.24), n=9, seed=3)
gears += scatter_gears("gr", (0.78, BACK - 0.36), area=(0.2, 0.18), n=4, seed=8, rmax=0.035)
# springs lying on the bench
for i, (x, y, r) in enumerate(((0.02, BACK - 0.58, 0.008), (0.1, BACK - 0.52, 0.006), (0.62, BACK - 0.6, 0.01))):
    helix(f"spring{i}", r, 0.0012, 9, 0.05, copper(), loc=(x, y, TOP + r + 0.0012),
          rot=(0, math.radians(90), math.radians(30 + 40 * i)))
pw = import_ph("vintage_pocket_watch", "pocketwatch")
K.fit(pw, 0.065, "z")
lay_flat(pw, -90, 25)
K.place(pw, -0.36, BACK - 0.52, on=[wb["top"]])
sp = import_ph("round_spectacles", "specs")
K.fit(sp, 0.13, "x")
sp.rotation_euler[2] = math.radians(160)
K.place(sp, 0.06, BACK - 0.3, on=[wb["top"]])
sd = import_ph("screwdrivers_02", "screwdrivers")
K.fit(sd, 0.24, "y")
sd.rotation_euler[2] = math.radians(70)
K.place(sd, 0.62, BACK - 0.56, on=[wb["top"]])
oc = import_ph("small_oil_can_01", "oilcan")
K.fit(oc, 0.2, "x")
oc.rotation_euler[2] = math.radians(-150)
K.place(oc, 0.8, BACK - 0.24, on=[wb["top"]])
cs = import_ph("wooden_candlestick", "candlestick")
K.fit(cs, 0.17, "z")
K.place(cs, 0.74, BACK - 0.5, on=[wb["top"]])
lo, hi = K.bbox(cs)
candle("candle", ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, hi.z - 0.006), h=0.09, r=0.014,
       power=float(A.get("candle", 2.5)))
hd = import_ph("vintage_hand_drill", "handdrill")
K.fit(hd, 0.3, "z")
lay_flat(hd, 90, 70)
K.place(hd, -0.1, BACK - 0.13, on=[wb["top"]])
bowl = import_ph("wooden_bowl_01", "bowl")
K.fit(bowl, 0.17, "x")
K.place(bowl, 0.62, BACK - 0.16, on=[wb["top"]])
# a few loose screws and brass bits around Pip's perch
for i in range(9):
    a = rng.uniform(0, 6.28)
    rr = rng.uniform(0.1, 0.18)
    x, y = PERCH[0] + rr * math.cos(a) * 1.3, PERCH[1] + rr * math.sin(a) * 0.7 - 0.05
    cyl(f"bit{i}", 0.004, 0.012, (x, y, TOP + 0.004), brass("brass"), rot=(math.pi / 2, 0, a), verts=12)
# a cup of tea on its saucer, a red wool ball, a half-built wooden toy train
ts = import_ph("tea_set_01", "teaset")
cup = sau = None
for o in list(K.meshes(ts)):
    if "cup_small_01" in o.name:
        cup = o
    elif "saucer_circular_03" in o.name:
        sau = o
    else:
        bpy.data.objects.remove(o)
ts.scale = (1.0, 1.0, 1.0)
for o, x, y in ((sau, -0.42, BACK - 0.17), (cup, -0.42, BACK - 0.17)):
    lo, hi = K.bbox([o])
    o.location += Vector((x - (lo.x + hi.x) / 2, y - (lo.y + hi.y) / 2, 0))
bpy.context.view_layer.update()
lo, hi = K.bbox([sau])
sau.location.z += TOP + 0.0005 - lo.z
bpy.context.view_layer.update()
lo2, hi2 = K.bbox([sau])
lo, hi = K.bbox([cup])
cup.location.z += hi2.z - 0.004 - lo.z
bpy.context.view_layer.update()
tea = cyl("tea", 0.03, 0.002, (-0.42, BACK - 0.17, K.bbox([cup])[1].z - 0.012), paint("tea", (0.12, 0.04, 0.01), rough=0.05, coat=1.0), verts=32)
yarn_m = felt("yarn", (0.42, 0.03, 0.03))
YX, YY = 0.92, BACK - 0.5
yb = sphere("yarn_ball", 0.045, (YX, YY, TOP + 0.045), yarn_m)
for i in range(14):
    t = torus(f"yarn_w{i}", 0.045, 0.0028, (YX, YY, TOP + 0.045), yarn_m,
              rot=(rng.uniform(0, 3.14), rng.uniform(0, 3.14), rng.uniform(0, 3.14)), seg=48, mseg=6)
curve_tube("yarn_tail", [(YX, YY - 0.04, TOP + 0.01), (YX - 0.06, YY - 0.1, TOP + 0.003), (YX - 0.16, YY - 0.08, TOP + 0.003),
                         (YX - 0.23, YY - 0.13, TOP + 0.003)], 0.0026, yarn_m)
toy_red = paint("toy_red", (0.32, 0.018, 0.012), rough=0.4, coat=0.4)
toy_wood = wood("toy_wood", "oak_veneer_01", tint=(1.0, 0.85, 0.65))
tx, ty = -0.52, BACK - 0.36
cab = box("train_cab", (0.07, 0.06, 0.07), (tx + 0.04, ty, TOP + 0.022 + 0.035), toy_red, bevel=0.006)
boil = cyl("train_boiler", 0.026, 0.09, (tx - 0.03, ty, TOP + 0.022 + 0.026), toy_wood, rot=(0, math.pi / 2, 0), verts=32, bevel=0.003)
K.uv_real_size(boil)
box("train_chassis", (0.17, 0.065, 0.014), (tx, ty, TOP + 0.015), toy_wood, bevel=0.003)
cyl("train_stack", 0.009, 0.03, (tx - 0.055, ty, TOP + 0.022 + 0.06), toy_red, verts=16, r2=0.013)
for i, wx in enumerate((-0.06, 0.0, 0.06)):
    for sy in (-1, 1):
        if i == 2 and sy == 1:
            continue  # one wheel is still missing: Grandpa was working on it
        cyl(f"train_wheel{i}{sy}", 0.016, 0.008, (tx + wx, ty + sy * 0.037, TOP + 0.016), toy_red, rot=(math.pi / 2, 0, 0), verts=24, bevel=0.002)
cyl("train_wheel_loose", 0.016, 0.008, (tx + 0.1, ty + 0.1, TOP + 0.0045), toy_red, verts=24, bevel=0.002)

# under the bench: a crate and a basket
cr = import_ph("wooden_crate_01", "crate")
K.fit(cr, 0.7, "x")
K.place(cr, -0.6, BACK - 0.4, on=[wb["shelf"]])
bs = import_ph("wicker_basket_01", "basket")
K.fit(bs, 0.4, "x")
K.place(bs, 0.6, BACK - 0.4, on=[wb["shelf"]])

# fairy lights along the top of the tool board and the shelf
fairy_lights("fl_wall", [(-0.25, BACK - 0.04, 1.88), (0.3, BACK - 0.04, 1.86), (0.85, BACK - 0.04, 1.88),
                         (1.45, BACK - 0.04, 1.85)], sag=0.09, per_span=6, strength=6.0, r=0.009)

# ---------------------------------------------------------------- lights
bulb = hanging_bulb("pendant", (0.45, BACK - 0.6, 1.86), length=0.74, power=float(A.get("bulb", 60)), k=2500)
moon = K.light("SUN", (0, 0, 5), None, power=float(A.get("moon", 0.9)), size=1.0, k=8500, name="moon")
moon.rotation_euler = (math.radians(58), 0, math.radians(165))
K.light("AREA", (WIN[0], BACK + 0.4, WIN[1]), (WIN[0] + 0.2, BACK - 1, 1.0), power=float(A.get("winfill", 45)),
        size=0.6, k=9000, name="window_sky")
ws_ = bpy.data.objects["window_sky"]
ws_.visible_camera = ws_.visible_transmission = ws_.visible_glossy = False
fill = K.light("AREA", (-0.6, -0.4, 2.2), (0.2, BACK - 0.5, 1.0), power=float(A.get("fill", 160)), size=2.0,
               k=3200, name="room_fill")
fill.visible_camera = fill.visible_glossy = fill.visible_transmission = False

# ---------------------------------------------------------------- camera
cam = K.camera((0.14, BACK - 1.78, 1.36), (0.18, BACK - 0.3, 1.21), lens=float(A.get("lens", 28)), fstop=5.6)
cam.data.dof.focus_distance = (Vector(BAR) - cam.location).length
cam.data.sensor_fit = "HORIZONTAL"
bloom(0.25, 1.5, 7)
bpy.context.view_layer.update()

PIP_RZ = math.radians(-30)


def pip_box():
    """Square pixel box (1920x1080 frame) holding both poses + margin, and the perch bar pixel."""
    p1 = pip("pip_s", "sleep", tuple(BAR), rot_z=PIP_RZ)
    p2 = pip("pip_a", "awake", tuple(BAR), rot_z=PIP_RZ)
    xs, ys = [], []
    for o in pip_meshes(p1) + pip_meshes(p2):
        for c in o.bound_box:
            v = world_to_camera_view(sc, cam, o.matrix_world @ Vector(c))
            xs.append(v.x * 1920)
            ys.append((1 - v.y) * 1080)
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    side = max(max(xs) - min(xs), max(ys) - min(ys)) * 1.2
    bv = world_to_camera_view(sc, cam, Vector(BAR))
    b = {"x": round(cx - side / 2), "y": round(cy - side / 2), "size": round(side),
         "perch_bar_px": [round(bv.x * 1920), round((1 - bv.y) * 1080)]}
    for r in (p1, p2):
        for o in [r, *r.children_recursive]:
            bpy.data.objects.remove(o)
    return b


if not POSE:
    K.save(f"{OUT}/workbench.blend")
    K.render(f"{OUT}/workbench.png")
    box_px = pip_box()
    json.dump(box_px, open(f"{OUT}/pip_box.json", "w"), indent=1)
    print("PIPBOX", box_px)
else:
    # the sprite box is frozen (it is what the app uses to composite Jingle on workbench.jpg)
    box_px = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "jingle_box.json")))
    print("PIPBOX", box_px)
    p = pip("pip", POSE, tuple(BAR), rot_z=PIP_RZ)
    make_holdout_others(pip_meshes(p))
    sc.render.film_transparent = True
    sc.render.image_settings.color_mode = "RGBA"
    f = 1024.0 / box_px["size"]
    sc.render.resolution_x, sc.render.resolution_y = round(1920 * f), round(1080 * f)
    sc.render.resolution_percentage = 100
    r = sc.render
    r.use_border, r.use_crop_to_border = True, True
    r.border_min_x = box_px["x"] / 1920
    r.border_max_x = (box_px["x"] + box_px["size"]) / 1920
    r.border_max_y = 1 - box_px["y"] / 1080
    r.border_min_y = 1 - (box_px["y"] + box_px["size"]) / 1080
    sc.use_nodes = False
    K.render(f"{OUT}/jingle_{POSE}.png")

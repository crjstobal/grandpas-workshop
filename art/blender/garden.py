"""garden.jpg / garden_empty.jpg: snowy night outside the workshop, close on the round window and its deep
snowy ledge, where Jingle sleeps half frozen (chapters 1 and 2). The right third, past the corner of the
workshop, is soft out-of-focus garden and sky for the UI.

  ... --python garden.py -- --out DIR [--fast]               -> DIR/garden.png  (Jingle asleep, frosted)
  ... --python garden.py -- --out DIR --empty                -> DIR/garden_empty.png (same frame, no Jingle)
  ... --python garden.py -- --out DIR --cropempty            -> DIR/garden_crop_empty.png (the sprite box, no Jingle)
  ... --python garden.py -- --out DIR --pip POSE [--scarf] [--matte] -> DIR/garden_jingle_<pose>[_scarf]_full|matte.png
      then garden_sprite.py DIR turns those into garden_jingle_<pose>.png: an RGBA crop of the box in
      garden_jingle.json. Draw it at x,y scaled to size x size on garden_empty.
The box (and Jingle's exact silhouette on garden.jpg) is written to DIR/garden_jingle.json by the plain run.
"""
import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gw_props import *  # noqa
from gw_outdoor import jingle, silhouette_px, frost_glass_disc, snow_slab, snow_cover, icicles
from gw_pip import pip_meshes
from gw import K, bpy, Vector

A = K.args(); OUT = A["out"]; FAST = bool(A.get("fast")); POSE = A.get("pip"); SCARF = bool(A.get("scarf")); EMPTY = bool(A.get("empty"))
HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)
sc = setup(1920, 1080, fast=FAST, samples=384 if not (POSE or A.get("cropempty")) else 256, exposure=float(A.get("exp", 0.0)))
night_sky(top=(0.005, 0.010, 0.035), horizon=(0.05, 0.085, 0.17), strength=1.0)

ws = workshop()
g = snow_ground(path=[(-3.2, -9.0), (-2.2, -5.5), (-1.0, -2.5), (-0.55, -0.6)], res=200)
wx, _wy, wz = ws["win"]
R = 0.38

# ---------------------------------------------------------------- a deeper ledge under the round window
for n in ("workshop_win_sill", "workshop_sill_snow"):
    bpy.data.objects.remove(bpy.data.objects[n])
trim = bpy.data.materials["trim_red"]
LEDGE_TOP = wz - R - 0.10            # just under the frame
ledge = box("ledge", (0.74, 0.26, 0.05), (wx, -0.11, LEDGE_TOP - 0.025), trim, bevel=0.01)
for sx in (-1, 1):
    # two carved corbels holding it up
    c = box(f"corbel{sx}", (0.045, 0.16, 0.13), (wx + sx * 0.27, -0.08, LEDGE_TOP - 0.05 - 0.065), trim, bevel=0.012)
    cut = cyl("corbel_cut", 0.13, 0.2, (wx + sx * 0.27, -0.16 - 0.0, LEDGE_TOP - 0.05 - 0.13), None,
              rot=(0, math.pi / 2, 0), verts=40)
    boolean(c, cut)
ledge_snow = snow_cover("ledge_snow", wx - 0.37, wx + 0.37, -0.24, -0.004, LEDGE_TOP, thick=0.045, lip=0.02,
                        droop=0.022)
rng = random.Random(21)
icicles("ledge_ice", wx - 0.36, wx + 0.36, -0.24, LEDGE_TOP - 0.05, 11, rng, lmin=0.03, lmax=0.12, r=0.007)
# snow resting on the top of the round frame, and frost creeping over the glass
arc = []
for k in range(25):
    a = math.radians(35 + 110 * k / 24)
    arc.append((wx + (R + 0.075) * math.cos(a), -0.02, wz + (R + 0.075) * math.sin(a) + 0.02))
cap = curve_tube("frame_snow", arc, 0.03, snow_mat())
cap.scale = (1, 1.4, 1)
frost_glass_disc("win_frost", (wx, 0.02, wz), R - 0.002)

# ---------------------------------------------------------------- the garden past the corner
fir_tree("fir_mid", 3.4, 1.1, (2.75, 2.9, 0.02), seed=12, snow=0.6)
fir_tree("fir_far1", 4.2, 1.3, (5.2, 5.5, 0.0), seed=31, snow=0.6, density=0.7)
rng2 = random.Random(5)
for i in range(10):
    x = 1 + i * 2.4 + rng2.uniform(-0.6, 0.6)
    y = 9 + rng2.uniform(0, 5)
    h = rng2.uniform(4.5, 7.5)
    fir_tree(f"bg{i}", h, h * 0.32, (x, y, 0.0), seed=20 + i, snow=0.6, density=0.55, snow_pads=False)
logs_m = wood("log_end", "rough_wood", tint=(0.8, 0.6, 0.45))
for i, (dx, dz) in enumerate([(0, 0), (0.2, 0), (0.4, 0), (0.1, 0.17), (0.3, 0.17), (0.2, 0.33)]):
    c = cyl(f"log{i}", 0.09, 0.7, (1.72, 0.75 + dx, 0.1 + dz), logs_m, rot=(0, math.radians(90), 0), verts=20)
box("logsnow", (0.75, 0.6, 0.08), (1.72, 0.95, 0.56), snow_mat(), bevel=0.035)

# lantern by the door (same as the title), out of focus at the left edge
lan = import_ph("Lantern_01", "lantern")
K.fit(lan, 0.38, "z")
swap_glass(lan, glow_glass("lan_glass", 1900, 1.2, rough=0.08))
lan.location = (0, 0, 0); bpy.context.view_layer.update()
lo, hi = K.bbox(lan)
lan.location = Vector((-1.25, -0.22, 1.40)) - Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
curve_tube("bracket", [(-1.25, 0.0, 1.98), (-1.25, -0.12, 2.0), (-1.25, -0.22, 1.95), (-1.25, -0.22, 1.80)], 0.012,
           iron("bracket_iron"))
sphere("lantern_flame", 0.022, (-1.25, -0.22, 1.52), emit("flame", K.kelvin(1800), 60.0), scale=(0.7, 0.7, 1.3))
K.light("POINT", (-1.25, -0.24, 1.56), power=30, size=0.05, k=1900, name="lantern_light")

# ---------------------------------------------------------------- lights: warm inside, cold outside
inner = K.light("POINT", (wx, 1.2, 1.4), power=40, size=0.4, k=2400, name="inside")
spill = K.light("AREA", (wx, -0.06, wz - 0.05), (wx - 0.05, -0.5, LEDGE_TOP), power=float(A.get("spill", 6)),
                size=0.55, k=2200, name="win_spill")
spill.data.shape = "DISK"
spill.visible_camera = spill.visible_glossy = False
moon = K.light("SUN", (0, 0, 10), None, power=float(A.get("moon", 0.45)), size=1.5, k=9000, name="moon")
moon.rotation_euler = (math.radians(58), 0, math.radians(215))
cold = K.light("AREA", (wx - 1.3, -1.5, 1.55), (wx - 0.1, -0.1, LEDGE_TOP + 0.1), power=float(A.get("cold", 45)),
               size=1.2, k=11000, name="sky_fill")
cold.visible_camera = False  # stays visible to glossy: a cold highlight on Jingle's brass
m_, _st = stars_and_moon(moon_dir=(0.95, 1.0, 0.33))
m_.scale = (1.6, 1.6, 1.6)

# ---------------------------------------------------------------- camera
JLOC = Vector((wx - 0.08, -0.12, 0.0))
YAW = math.radians(float(A.get("yaw", -48)))
DIST = float(A.get("dist", 1.55))
aim = Vector((wx - 0.08, -0.12, LEDGE_TOP + 0.16))
cam = K.camera(tuple(aim + Vector((math.sin(YAW) * DIST, -math.cos(YAW) * DIST, float(A.get("camz", 0.19))))),
               tuple(aim), lens=float(A.get("lens", 50)), fstop=float(A.get("f", 2.4)))
cam.data.shift_x = float(A.get("sx", 0.15))
cam.data.shift_y = float(A.get("sy", 0.0))
bpy.context.view_layer.update()

# Jingle sits on the snow: drop his perch-bar origin onto the ledge snow (toes sink a little into it)
JRZ = math.radians(float(A.get("rz", -62)))
dg = bpy.context.evaluated_depsgraph_get()
ev = ledge_snow.evaluated_get(dg)
ok, hit, _n, _i = ev.ray_cast(ev.matrix_world.inverted() @ Vector((JLOC.x, JLOC.y, 2.0)), Vector((0, 0, -1)))
JLOC.z = (ev.matrix_world @ hit).z + 0.002
print("JINGLE_AT", tuple(JLOC), flush=True)
cam.data.dof.focus_distance = (JLOC + Vector((0, 0, 0.1)) - cam.location).length

# falling snow, kept out of a small tube in front of Jingle so no flake sits on his face
fl = snowfall("flakes", 900, (wx - 1.6, -1.6, 0.2), (wx + 2.6, 2.5, 2.6), rmin=0.002, rmax=0.006,
              mat=emit("flake", (0.85, 0.9, 1.0), 0.25))
import bmesh as _bm
bm = _bm.new(); bm.from_mesh(fl.data)
jc = JLOC + Vector((0, 0, 0.1))
dv = (jc - cam.location)
kill = []
for v in bm.verts:
    t = (v.co - cam.location).dot(dv) / dv.length_squared
    if 0 < t < 1.3 and (cam.location + dv * t - v.co).length < 0.16:
        kill.append(v)
_bm.ops.delete(bm, geom=kill, context="VERTS"); bm.to_mesh(fl.data); bm.free()

# close-up: tone the window down so the frost and the muntins read (same trick as door.py)
for n in bpy.data.materials["window_glow"].node_tree.nodes:
    if n.type == "MAP_RANGE":
        n.inputs["To Min"].default_value, n.inputs["To Max"].default_value = 0.7, float(A.get("win", 1.7))
bloom(0.3, 1.2, 7)


def box_for(poses):
    """Square sprite box (1920x1080 px) holding all poses + 20 % margin."""
    xs, ys = [], []
    for p in poses:
        r = jingle("jbox_" + p, p, tuple(JLOC), JRZ)
        x0, y0, x1, y1 = silhouette_px(sc, cam, pip_meshes(r))
        xs += [x0, x1]; ys += [y0, y1]
        for o in [r, *r.children_recursive]:
            bpy.data.objects.remove(o)
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    side = max(max(xs) - min(xs), max(ys) - min(ys)) * 1.2
    return {"x": round(cx - side / 2), "y": round(cy - side / 2), "size": round(side)}


def crop_to_box():
    """Renders only the sprite box, at 1024 px across."""
    bx = json.load(open(f"{HERE}/garden_jingle.json"))["sprite_box"]
    f = 1024.0 / bx["size"]
    sc.render.resolution_x, sc.render.resolution_y = round(1920 * f), round(1080 * f)
    sc.render.resolution_percentage = 100
    r = sc.render
    r.use_border, r.use_crop_to_border = True, True
    r.border_min_x, r.border_max_x = bx["x"] / 1920, (bx["x"] + bx["size"]) / 1920
    r.border_max_y, r.border_min_y = 1 - bx["y"] / 1080, 1 - (bx["y"] + bx["size"]) / 1080


if POSE or A.get("cropempty"):
    # Sprites are cut out by difference: the box rendered with Jingle, the same box without him, and a
    # matte of Jingle alone. garden_sprite.py keeps every pixel that changed (Jingle, his shadow, the
    # dent in the snow), so the sprite melts into garden_empty with no visible edge. (A shadow catcher
    # left the snow semi-opaque and a different shade, which showed as a square around him.)
    crop_to_box()
    sc.render.film_transparent = False
    if POSE:
        j = jingle("jingle", POSE, tuple(JLOC), JRZ, scarf=SCARF)
        if A.get("matte"):
            make_holdout_others(pip_meshes(j))
            sc.render.film_transparent = True
            sc.render.image_settings.color_mode = "RGBA"
            sc.use_nodes = False
    K.render(f"{OUT}/garden_jingle_{POSE}{'_scarf' if SCARF else ''}_{'matte' if A.get('matte') else 'full'}.png" if POSE
             else f"{OUT}/garden_crop_empty.png")
elif EMPTY:
    K.render(f"{OUT}/garden_empty.png")
else:
    info = {"sprite_box": box_for(["sleep", "cold", "awake"]) if not FAST else None}
    j = jingle("jingle", "sleep", tuple(JLOC), JRZ)
    x0, y0, x1, y1 = silhouette_px(sc, cam, pip_meshes(j))
    info["sleep_bbox_px"] = [round(x0), round(y0), round(x1), round(y1)]
    info["sleep_center_px"] = [round((x0 + x1) / 2), round((y0 + y1) / 2)]
    from bpy_extras.object_utils import world_to_camera_view
    v = world_to_camera_view(sc, cam, JLOC)
    info["feet_px"] = [round(v.x * 1920), round((1 - v.y) * 1080)]
    json.dump(info, open(f"{OUT}/garden_jingle.json", "w"), indent=1)
    print("GARDEN_JINGLE", info, flush=True)
    K.save(f"{HERE}/garden.blend")
    K.render(f"{OUT}/garden.png")

"""title.jpg: snowy night, the little workshop at the end of the garden."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gw_props import *
from gw import K, bpy, Vector
import random, math

A = K.args(); OUT = A["out"]; FAST = bool(A.get("fast"))
sc = setup(1920, 1080, fast=FAST, samples=384, exposure=float(A.get("exp", 0.0)))
night_sky(top=(0.005, 0.010, 0.035), horizon=(0.05, 0.085, 0.17), strength=1.0)

ws = workshop()
# the path from the viewer to the door
path = [(-3.2, -9.0), (-2.2, -5.5), (-1.0, -2.5), (-0.55, -0.6)]
g = snow_ground(path=path, res=260)

# Lantern hanging on a bracket by the door
lan = import_ph("Lantern_01", "lantern")
K.fit(lan, 0.38, "z")
swap_glass(lan, glow_glass("lan_glass", 1900, 1.2, rough=0.08))
lan.location = (0, 0, 0); bpy.context.view_layer.update()
lo, hi = K.bbox(lan)
lan.location = Vector((-1.25, -0.22, 1.40)) - Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
ir = iron("bracket_iron")
curve_tube("bracket", [(-1.25, 0.0, 1.98), (-1.25, -0.12, 2.0), (-1.25, -0.22, 1.95), (-1.25, -0.22, 1.80)], 0.012, ir, smooth=True)
flame = sphere("lantern_flame", 0.022, (-1.25, -0.22, 1.52), emit("flame", K.kelvin(1800), 60.0), scale=(0.7, 0.7, 1.3))
K.light("POINT", (-1.25, -0.24, 1.56), power=float(A.get("lan", 30)), size=0.05, k=1900, name="lantern_light")

# warm spill from the round window onto the snow
wx, wy, wz = ws["win"]
spill = K.light("AREA", (wx, -0.12, wz), (wx - 0.3, -1.6, 0.0), power=float(A.get("spill", 22)), size=0.7, k=2400, name="win_spill")
spill.data.shape = "DISK"
spill.visible_camera = False if hasattr(spill, "visible_camera") else None
K.light("AREA", (-0.6, -3.2, 2.6), (-0.3, 0, 1.2), power=float(A.get("fill", 40)), size=1.5, k=2600, name="facade_fill").visible_camera = False
inner = K.light("POINT", (wx, 1.2, 1.4), power=40, size=0.4, k=2400, name="inside")

# moonlight (cool, from behind-left) + faint fill from the sky
moon = K.light("SUN", (0, 0, 10), (2, -3, 0), power=float(A.get("moon", 0.35)), size=1.5, k=9000, name="moon")
moon.rotation_euler = (math.radians(60), 0, math.radians(200))
m, _st = stars_and_moon(moon_dir=(0.03, 1.0, 0.215))
m.scale = (1.3, 1.3, 1.3)

# trees: two big firs behind left, one right, small saplings, distant line
fir_tree("fir_big", 4.6, 1.5, (-3.0, 2.6, 0.02), seed=11, snow=0.6)
fir_tree("fir_mid", 3.4, 1.1, (2.75, 2.9, 0.02), seed=12, snow=0.6)
fir_tree("fir_small", 1.6, 0.6, (2.35, 0.2, 0.0), seed=13, snow=0.6)
fir_tree("fir_tiny", 1.0, 0.4, (-2.0, -0.4, 0.0), seed=14, snow=0.6)
rng = random.Random(5)
for i in range(16):
    x = -16 + i * 2.1 + rng.uniform(-0.6, 0.6)
    y = 9 + rng.uniform(0, 5)
    h = rng.uniform(4.5, 7.5)
    fir_tree(f"bg{i}", h, h * 0.32, (x, y, 0.0), seed=20 + i, snow=0.6, density=0.55, snow_pads=False)

# a picket fence on the left, posts capped with snow
fence_m = paint("fence_wood", (0.25, 0.17, 0.11), rough=0.85, coat=0.0, var=0.3)
for i in range(7):
    x = -7.0 + i * 0.7
    y = 0.6 + i * 0.05
    p = box(f"post{i}", (0.09, 0.09, 1.0 + (i % 2) * 0.05), (x, y, 0.45), fence_m, bevel=0.01)
    s = sphere(f"postsnow{i}", 0.07, (x, y, 0.98 + (i % 2) * 0.05), snow_mat(), scale=(1, 1, 0.5))
for z in (0.35, 0.75):
    box(f"rail{z}", (4.3, 0.04, 0.08), (-4.9, 0.75, z), fence_m, bevel=0.008, rot=(0, 0, math.radians(4)))
    box(f"railsnow{z}", (4.3, 0.06, 0.035), (-4.9, 0.75, z + 0.055), snow_mat(), bevel=0.015, rot=(0, 0, math.radians(4)))

# sled leaning by the side, a log pile under snow on the right side wall
sled_m = paint("sled_red", (0.45, 0.04, 0.03), rough=0.5, coat=0.3)
logs_m = wood("log_end", "rough_wood", tint=(0.8, 0.6, 0.45))
for i, (dx, dz) in enumerate([(0, 0), (0.2, 0), (0.4, 0), (0.1, 0.17), (0.3, 0.17), (0.2, 0.33)]):
    c = cyl(f"log{i}", 0.09, 0.7, (1.72 + 0.0, 0.5 + dx * 2.0, 0.1 + dz), logs_m, rot=(math.radians(90), 0, 0), verts=20)
    c.location = (1.72, 0.35 + dx * 1.0 + 0.4, 0.1 + dz)
    c.rotation_euler = (0, math.radians(90), 0)
s = box("logsnow", (0.75, 0.6, 0.08), (1.72, 0.95, 0.56), snow_mat(), bevel=0.035)

# little candle lanterns along the path
for i, (x, y) in enumerate([(-1.75, -1.7), (-2.65, -4.1), (-0.15, -3.0)]):
    pl = import_ph("wooden_lantern_01", f"path_lantern{i}")
    K.fit(pl, 0.42, "z")
    pl.rotation_euler[2] = math.radians(20 + 35 * i)
    K.place(pl, x, y, on=[g])
    swap_glass(pl, glow_glass("pl_glass", 1900, 2.5))
    lo, hi = K.bbox(pl)
    c = (lo + hi) / 2
    sphere(f"pl_flame{i}", 0.015, (c.x, c.y, lo.z + 0.13), emit("flame", K.kelvin(1800), 60.0), scale=(0.7, 0.7, 1.4))
    K.light("POINT", (c.x, c.y, lo.z + 0.15), power=float(A.get("pl", 6)), size=0.03, k=1900, name=f"pl_light{i}")

# falling snow
snowfall("flakes", 2600, (-9, -8, 0.0), (9, 4, 6.0), rmin=0.006, rmax=0.016, mat=emit("flake", (0.85, 0.9, 1.0), 0.25))

cam = K.camera((-3.6, -10.5, 1.35), (0.15, 0.4, 1.75), lens=35, fstop=4.0)
cam.data.dof.focus_distance = 10.8
cam.data.shift_x = -0.13
cam.data.shift_y = -0.05
bloom(0.3, 1.2, 7)
K.save(f"{OUT}/title.blend")
K.render(f"{OUT}/title.png")

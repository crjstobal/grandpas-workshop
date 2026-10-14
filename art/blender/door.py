"""door.jpg: close-up of the workshop door: big ornate brass lock with an empty keyhole, wreath,
a blank pinned envelope, snow on the step. Same workshop model as title.jpg."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gw_props import *
from gw import K, bpy, Vector
import random, math

A = K.args(); OUT = A["out"]; FAST = bool(A.get("fast"))
sc = setup(1920, 1080, fast=FAST, samples=384, exposure=float(A.get("exp", 0.0)))
night_sky(top=(0.005, 0.010, 0.035), horizon=(0.05, 0.085, 0.17), strength=1.0)
ws = workshop()
g = snow_ground(path=[(-3.2, -9.0), (-2.2, -5.5), (-1.0, -2.5), (-0.55, -0.6)], res=200)
dx = ws["door_x"]
door = ws["door"]

# wreath on the top ledge, envelope pinned below it
wreath("wreath", None, (dx, -0.112, 1.56), R=0.2)
nail = sphere("wreath_nail", 0.008, (dx, -0.06, 1.79), brass("lock_brass"), scale=(1, 0.6, 1))
ribbon = box("wreath_ribbon", (0.02, 0.004, 0.06), (dx, -0.075, 1.76), felt("bow_felt", (0.5, 0.03, 0.03)))
envelope("envelope", None, (dx - 0.17, -0.0215, 1.10), rot_y=math.radians(-4))

# snow on the step and drifted against the door
sm = snow_mat()
st = box("step_snow", (1.28, 0.4, 0.07), (dx, -0.23, 0.165), sm, bevel=0.03)
st.modifiers["bevel"].segments = 4
sub = st.modifiers.new("sub", "SUBSURF"); sub.levels = sub.render_levels = 2
dm = st.modifiers.new("disp", "DISPLACE"); tx = bpy.data.textures.new("stepsnow", "CLOUDS"); tx.noise_scale = 0.22
dm.texture, dm.strength, dm.texture_coords = tx, 0.07, "GLOBAL"
rng = random.Random(3)
for i in range(7):
    b = _b = None
from gw import _blob
o = _blob("drift", (0.62, 0.09, 0.07), sm, rng)
o.location = (dx, -0.08, 0.19)

# lantern by the door (same as title)
lan = import_ph("Lantern_01", "lantern")
K.fit(lan, 0.38, "z")
swap_glass(lan, glow_glass("lan_glass", 1900, 1.2, rough=0.08))
lan.location = (0, 0, 0); bpy.context.view_layer.update()
lo, hi = K.bbox(lan)
lan.location = Vector((-1.25, -0.22, 1.40)) - Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
curve_tube("bracket", [(-1.25, 0.0, 1.98), (-1.25, -0.12, 2.0), (-1.25, -0.22, 1.95), (-1.25, -0.22, 1.80)], 0.012, iron("bracket_iron"))
sphere("lantern_flame", 0.022, (-1.25, -0.22, 1.52), emit("flame", K.kelvin(1800), 60.0), scale=(0.7, 0.7, 1.3))
K.light("POINT", (-1.25, -0.24, 1.56), power=float(A.get("lan", 30)), size=0.05, k=1900, name="lantern_light")
# warm bounce from the window side, cool moon/sky fill from the right
f1 = K.light("AREA", (0.9, -1.4, 1.2), (dx, 0, 1.0), power=float(A.get("warm", 14)), size=0.8, k=2400, name="win_bounce")
f1.visible_camera = False
f2 = K.light("AREA", (1.8, -2.8, 3.0), (dx, 0, 0.9), power=float(A.get("cool", 60)), size=2.5, k=9500, name="sky_fill")
f2.visible_camera = False
card = K.light("AREA", (dx - 0.5, -1.2, 1.5), (dx + 0.27, 0, 0.98), power=float(A.get("card", 10)), size=0.6, k=2600, name="lock_card")
card.visible_camera = False
moon = K.light("SUN", (0, 0, 10), None, power=0.35, size=1.5, k=9000, name="moon")
moon.rotation_euler = (math.radians(60), 0, math.radians(200))

snowfall("flakes", 700, (-2.4, -1.7, 0.0), (1.8, -0.3, 2.4), rmin=0.002, rmax=0.006, mat=emit("flake", (0.85, 0.9, 1.0), 0.25))

wg = bpy.data.materials["window_glow"]
for n in wg.node_tree.nodes:
    if n.type == "MAP_RANGE":
        n.inputs["To Min"].default_value, n.inputs["To Max"].default_value = 0.9, 2.6
kh = door["keyhole"]
cam = K.camera((dx - 0.62, -3.3, 1.02), (dx + 0.12, 0, 0.93), lens=float(A.get("lens", 35)), fstop=4.0)
cam.data.dof.focus_distance = (Vector(kh) - cam.location).length
cam.data.shift_y = 0.02
bloom(0.3, 1.2, 7)
K.save(f"{OUT}/door.blend")
K.render(f"{OUT}/door.png")
print("KEYHOLE", tuple(kh))

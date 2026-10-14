"""beacon.jpg: the finale. The garden and workshop from the title camera, but a big golden star now shines on the
roof ridge like a lighthouse, sweeping two soft beams over the snow, and far down the valley, through a gap in
the firs, Grandpa's little train comes home along the viaduct with its headlight on. The left third (open sky,
low fence) is kept calm for the letter panel.

  ... --python beacon.py -- --out DIR [--fast]   -> DIR/beacon.png
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gw_props import *  # noqa
from gw_outdoor import hills, far_forest, viaduct, toy_train, star_mesh, halo, light_beam
from gw import K, bpy, Vector
from bpy_extras.object_utils import world_to_camera_view

A = K.args(); OUT = A["out"]; FAST = bool(A.get("fast"))
HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)
sc = setup(1920, 1080, fast=FAST, samples=384, exposure=float(A.get("exp", 0.0)))
night_sky(top=(0.005, 0.010, 0.035), horizon=(0.05, 0.085, 0.17), strength=1.0)

ws = workshop()
path = [(-3.2, -9.0), (-2.2, -5.5), (-1.0, -2.5), (-0.55, -0.6)]
g = snow_ground(path=path, res=260)

# ---------------------------------------------------------------- camera first (the gap in the trees depends on it)
cam = K.camera((-3.6, -10.5, 1.35), (0.15, 0.4, 1.75), lens=float(A.get("lens", 32)), fstop=4.0)
cam.data.dof.focus_distance = 10.8
cam.data.shift_x = float(A.get("sx", -0.13))
cam.data.shift_y = float(A.get("sy", 0.06))
bpy.context.view_layer.update()


def view_point(u, v, dist):
    """World point seen at frame position (u, v) (0..1, v up) at distance dist along the view."""
    fr = [cam.matrix_world @ p for p in cam.data.view_frame(scene=sc)]  # tr, br, bl, tl
    tr, br, bl, tl = fr
    p = bl + (br - bl) * u + (tl - bl) * v
    d = (p - cam.matrix_world.translation).normalized()
    return cam.matrix_world.translation + d * dist


def screen(p):
    s = world_to_camera_view(sc, cam, Vector(p))
    return s.x, s.y


# ---------------------------------------------------------------- the beacon star on the ridge
Hr = ws["Hr"]
gold = bpy.data.materials.new("star_gold")
gold.use_nodes = True
b = K._bsdf(gold)
b.inputs["Base Color"].default_value = (1.0, 0.72, 0.28, 1)
b.inputs["Metallic"].default_value = 0.7
b.inputs["Roughness"].default_value = 0.25
b.inputs["Emission Color"].default_value = (*K.kelvin(2300), 1)
b.inputs["Emission Strength"].default_value = float(A.get("star", 14.0))
SC = Vector((0.0, -0.18, Hr + 1.05))
star = star_mesh("beacon_star", R=0.58, r=0.25, depth=0.18, mat=gold)
star.location = SC
star.rotation_euler = (0, 0, math.radians(-14))   # turned a touch towards the camera
star.visible_shadow = False
cyl("star_pole", 0.03, 0.62, (SC.x, SC.y, Hr + 0.42), brass("lock_brass"), verts=20)
halo("star_halo", tuple(SC), 1.25, k=2200, strength=float(A.get("halo", 0.9)), power=5.0)
halo("star_core", tuple(SC), 0.75, k=2400, strength=float(A.get("core", 3.0)), power=3.0)
K.light("POINT", tuple(SC), power=float(A.get("starlight", 900)), size=0.5, k=2100, name="star_light")
for i, (yaw, pitch) in enumerate(((-112, 4), (66, 2))):
    bm_ = light_beam(f"beam{i}", length=float(A.get("blen", 22)), r0=0.2, r1=2.0, strength=float(A.get("beam", 0.22)),
                     k=2300)
    bm_.location = SC
    bm_.rotation_euler = (math.radians(90 - pitch), 0, math.radians(yaw))
# gold sparkles drifting around the star
rng = random.Random(12)
sp = []
for _ in range(110):
    d = Vector((rng.gauss(0, 1), rng.gauss(0, 0.6), rng.gauss(0, 1))).normalized() * rng.uniform(0.7, 2.2)
    sp.append(tuple(SC + d))
spark = mesh_obj("sparkles", sp, [])
spark.data.attributes.new("rad", "FLOAT", "POINT")
for i in range(len(sp)):
    spark.data.attributes["rad"].data[i].value = rng.uniform(0.006, 0.02)
ng = bpy.data.node_groups.new("sparkle_gn", "GeometryNodeTree")
ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
gi, go = ng.nodes.new("NodeGroupInput"), ng.nodes.new("NodeGroupOutput")
m2p = ng.nodes.new("GeometryNodeMeshToPoints")
at = ng.nodes.new("GeometryNodeInputNamedAttribute"); at.data_type = "FLOAT"; at.inputs["Name"].default_value = "rad"
sm_ = ng.nodes.new("GeometryNodeSetMaterial"); sm_.inputs["Material"].default_value = emit("sparkle", K.kelvin(2600), 25.0)
ng.links.new(gi.outputs[0], m2p.inputs["Mesh"]); ng.links.new(at.outputs[0], m2p.inputs["Radius"])
ng.links.new(m2p.outputs[0], sm_.inputs["Geometry"]); ng.links.new(sm_.outputs[0], go.inputs[0])
spark.modifiers.new("gn", "NODES").node_group = ng
spark.visible_shadow = False

# ---------------------------------------------------------------- the same garden as the title
lan = import_ph("Lantern_01", "lantern")
K.fit(lan, 0.38, "z")
swap_glass(lan, glow_glass("lan_glass", 1900, 1.2, rough=0.08))
lan.location = (0, 0, 0); bpy.context.view_layer.update()
lo, hi = K.bbox(lan)
lan.location = Vector((-1.25, -0.22, 1.40)) - Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
curve_tube("bracket", [(-1.25, 0.0, 1.98), (-1.25, -0.12, 2.0), (-1.25, -0.22, 1.95), (-1.25, -0.22, 1.80)], 0.012,
           iron("bracket_iron"), smooth=True)
sphere("lantern_flame", 0.022, (-1.25, -0.22, 1.52), emit("flame", K.kelvin(1800), 60.0), scale=(0.7, 0.7, 1.3))
K.light("POINT", (-1.25, -0.24, 1.56), power=30, size=0.05, k=1900, name="lantern_light")
wx, wy, wz = ws["win"]
spill = K.light("AREA", (wx, -0.12, wz), (wx - 0.3, -1.6, 0.0), power=22, size=0.7, k=2400, name="win_spill")
spill.data.shape = "DISK"
K.light("AREA", (-0.6, -3.2, 2.6), (-0.3, 0, 1.2), power=40, size=1.5, k=2600, name="facade_fill").visible_camera = False
K.light("POINT", (wx, 1.2, 1.4), power=40, size=0.4, k=2400, name="inside")
moon = K.light("SUN", (0, 0, 10), None, power=float(A.get("moon", 0.28)), size=1.5, k=9000, name="moon")
moon.rotation_euler = (math.radians(60), 0, math.radians(200))
_m, _st = stars_and_moon(moon_dir=(-0.9, 1.0, 0.5))
bpy.data.objects.remove(_m)   # tonight the star is the light in the sky

fir_tree("fir_mid", 3.4, 1.1, (2.75, 2.9, 0.02), seed=12, snow=0.6)
fir_tree("fir_small", 1.6, 0.6, (2.35, 0.2, 0.0), seed=13, snow=0.6)
fir_tree("fir_tiny", 1.0, 0.4, (-2.0, -0.4, 0.0), seed=14, snow=0.6)
GAP = (float(A.get("g0", 0.30)), float(A.get("g1", 0.50)))   # screen x range kept clear of background firs
rng = random.Random(5)
for i in range(16):
    x = -16 + i * 2.1 + rng.uniform(-0.6, 0.6)
    y = 9 + rng.uniform(0, 5)
    h = rng.uniform(4.5, 7.5)
    u, _v = screen((x, y, h * 0.5))
    if GAP[0] - 0.03 < u < GAP[1] + 0.03:
        continue
    fir_tree(f"bg{i}", h, h * 0.32, (x, y, 0.0), seed=20 + i, snow=0.6, density=0.55, snow_pads=False)

fence_m = paint("fence_wood", (0.25, 0.17, 0.11), rough=0.85, coat=0.0, var=0.3)
for i in range(7):
    x = -7.0 + i * 0.7
    y = 0.6 + i * 0.05
    box(f"post{i}", (0.09, 0.09, 1.0 + (i % 2) * 0.05), (x, y, 0.45), fence_m, bevel=0.01)
    sphere(f"postsnow{i}", 0.07, (x, y, 0.98 + (i % 2) * 0.05), snow_mat(), scale=(1, 1, 0.5))
for z in (0.35, 0.75):
    box(f"rail{z}", (4.3, 0.04, 0.08), (-4.9, 0.75, z), fence_m, bevel=0.008, rot=(0, 0, math.radians(4)))
    box(f"railsnow{z}", (4.3, 0.06, 0.035), (-4.9, 0.75, z + 0.055), snow_mat(), bevel=0.015, rot=(0, 0, math.radians(4)))
logs_m = wood("log_end", "rough_wood", tint=(0.8, 0.6, 0.45))
for i, (dx, dz) in enumerate([(0, 0), (0.2, 0), (0.4, 0), (0.1, 0.17), (0.3, 0.17), (0.2, 0.33)]):
    cyl(f"log{i}", 0.09, 0.7, (1.72, 0.75 + dx, 0.1 + dz), logs_m, rot=(0, math.radians(90), 0), verts=20)
box("logsnow", (0.75, 0.6, 0.08), (1.72, 0.95, 0.56), snow_mat(), bevel=0.035)
for i, (x, y) in enumerate([(-1.75, -1.7), (-2.65, -4.1), (-0.15, -3.0)]):
    pl = import_ph("wooden_lantern_01", f"path_lantern{i}")
    K.fit(pl, 0.42, "z")
    pl.rotation_euler[2] = math.radians(20 + 35 * i)
    K.place(pl, x, y, on=[g])
    swap_glass(pl, glow_glass("pl_glass", 1900, 2.5))
    lo, hi = K.bbox(pl)
    c = (lo + hi) / 2
    sphere(f"pl_flame{i}", 0.015, (c.x, c.y, lo.z + 0.13), emit("flame", K.kelvin(1800), 60.0), scale=(0.7, 0.7, 1.4))
    K.light("POINT", (c.x, c.y, lo.z + 0.15), power=6, size=0.03, k=1900, name=f"pl_light{i}")

# ---------------------------------------------------------------- the valley through the gap, and the train
hl = hills("hills", -300, 300, 13.0, 420, res=(200, 110), seed=11, base=-0.25, amp=16.0, rise=0.045,
           valley=None, z_edge=-0.3)
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()


def ground_z(x, y):
    ok, loc, _n, _i, _o, _m = sc.ray_cast(dg, Vector((x, y, 500)), Vector((0, 0, -1)), distance=1000)
    return loc.z if ok else 0.0


T = view_point((GAP[0] + GAP[1]) / 2, float(A.get("tv", 0.5)), float(A.get("tdist", 150)))
toward = (cam.matrix_world.translation - T)
yaw = math.atan2(toward.y, toward.x) + math.radians(float(A.get("tyaw", 22)))   # mostly towards us, angled
fl = ground_z(T.x, T.y)
deck = fl + 7.0
vroot, deck_local, VL = viaduct("viaduct", n=9, span=8.0, h=deck - fl + 6.0, w=3.4,
                                loc=(T.x, T.y, fl - 6.0), rot_z=yaw)
train = toy_train("train", tuple(Vector((T.x, T.y, fl - 6.0 + deck_local)) + Vector((math.cos(yaw), math.sin(yaw), 0)) * 6),
                  rot_z=yaw, cars=3, head_strength=120, beam=float(A.get("tbeam", 30)))
K.light("SPOT", tuple(Vector((T.x, T.y, deck + 2.2)) + Vector((math.cos(yaw), math.sin(yaw), 0)) * 9),
        tuple(Vector((T.x, T.y, deck)) + Vector((math.cos(yaw), math.sin(yaw), 0)) * 40), power=3000, k=3400,
        name="headlight", spot_deg=30)
rng = random.Random(8)
pts = []
for _ in range(700):
    x, y = rng.uniform(-280, 280), rng.uniform(40, 400)
    q = Vector((x - T.x, y - T.y))
    if q.length < 25:
        continue
    pts.append((x, y, ground_z(x, y) - 0.5))
far_forest("forest", pts, hmin=6, hmax=12)
lamp_p = train.matrix_world @ Vector((2.32, 0, 1.95))
halo("train_lamp_glow", tuple(lamp_p), 2.2, k=3600, strength=float(A.get("lampglow", 6.0)), power=4.0)
print("TRAIN_AT", tuple(round(c, 1) for c in T), "screen", screen(T), flush=True)

snowfall("flakes", 1800, (-9, -8, 0.0), (9, 4, 6.0), rmin=0.006, rmax=0.016, mat=emit("flake", (0.85, 0.9, 1.0), 0.25))
bloom(float(A.get("bloom", 0.4)), 1.2, 8)
K.save(f"{HERE}/beacon.blend")
K.render(f"{OUT}/beacon.png")

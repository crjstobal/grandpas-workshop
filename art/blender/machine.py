"""machine.jpg / machine_lit.jpg: the Star Machine, a whimsical brass contraption wrapped around a
Christmas tree. Same camera and scene for both:
  ... -- --out DIR            lights OFF, empty hooks, empty star socket, dim moonlight -> DIR/machine.png
  ... -- --out DIR --lit      fairy lights on, glowing brass star, warm glow, sparkles   -> DIR/machine_lit.png
Hook pixel positions are written to DIR/machine_hooks.json.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gw_machine import *  # noqa
from gw import K, bpy, Vector, _blob
from bpy_extras.object_utils import world_to_camera_view
import math
import random

A = K.args(); OUT = A["out"]; FAST = bool(A.get("fast")); LIT = bool(A.get("lit"))
sc = setup(1920, 1080, fast=FAST, samples=512, exposure=float(A.get("exp", 0.0)))
K.world_color((0.008, 0.012, 0.025), 1.0)
WIN = (-1.25, 1.55, 0.7, 0.9)
room(W=6.0, D=6.5, H=2.7, window=WIN)
FLOOR = [bpy.data.objects["floor"]]
rng = random.Random(8)
br, br2, cu = brass("brass"), old_brass(), copper()
wood_m = wood("plat_wood", "dark_wood", tint=(0.75, 0.55, 0.42))

# ---------------------------------------------------------------- platform
CX, CY = 0.3, BACK - 1.05
PH = 0.2
plat = lathe("platform", [(0.0, 0.0), (0.78, 0.0), (0.8, 0.02), (0.8, PH - 0.03), (0.78, PH), (0.0, PH)], seg=128,
             mat=wood_m, loc=(CX, CY, 0.0), cap_top=True)
for z in (0.035, PH - 0.035):
    lathe(f"plat_band{z}", [(0.8, z - 0.012), (0.812, z - 0.008), (0.812, z + 0.008), (0.8, z + 0.012)], seg=128, mat=br,
          loc=(CX, CY, 0.0))
for i in range(24):
    a = 2 * math.pi * i / 24
    sphere(f"plat_rivet{i}", 0.008, (CX + 0.813 * math.cos(a), CY + 0.813 * math.sin(a), PH - 0.035), br, seg=10, rings=5)
TOPZ = PH
# brass pot for the tree
lathe("tree_pot", [(0.0, 0.0), (0.2, 0.0), (0.23, 0.04), (0.24, 0.16), (0.27, 0.19), (0.26, 0.21), (0.22, 0.2),
                   (0.0, 0.18)], seg=96, mat=cu, loc=(CX, CY, TOPZ))
TZ = TOPZ + 0.17
TH, TR = 1.72, 0.62
tree, tips = fir_tree("machine_tree", TH, TR, (CX, CY, TZ), seed=51, return_tips=True, whorl_gap=0.06)

# ---------------------------------------------------------------- spiral pipe and bells
def r_at(z):
    t = (z - TZ) / TH
    return TR * max(0.0, 1 - (t - 0.1) / 0.9) ** 0.95 + 0.06


spiral = []
N = 120
for i in range(N + 1):
    t = i / N
    z = TZ + 0.18 + t * (TH * 0.78)
    a = t * 2 * math.pi * 2.6 + 0.6
    rr = r_at(z) + 0.02
    spiral.append((CX + rr * math.cos(a), CY + rr * math.sin(a), z))
curve_tube("spiral_pipe", spiral, 0.017, br, res=6)
for k, i in enumerate(range(6, N, 9)):
    x, y, z = spiral[i]
    # a ring clamp and a little bell hanging below the pipe
    torus(f"clamp{k}", 0.021, 0.004, (x, y, z), br2, rot=(0, math.pi / 2, math.atan2(y - CY, x - CX)), seg=24, mseg=6)
    curve_tube(f"bellchain{k}", [(x, y, z - 0.017), (x, y, z - 0.04)], 0.0015, br2, smooth=False)
    bell(f"bell{k}", (x, y, z - 0.04), s=1.2 + 0.2 * (k % 2), mat=br)

# ---------------------------------------------------------------- organ pipes (left rear) and gear tower (right rear)
OX, OY = CX - 0.5, CY + 0.28
for i, (dx, dy, h, r) in enumerate(((0, 0, 1.05, 0.035), (0.08, 0.02, 0.88, 0.032), (-0.08, 0.03, 0.75, 0.03),
                                     (0.15, 0.06, 0.62, 0.027), (-0.15, 0.07, 0.52, 0.025))):
    x, y = OX + dx, OY + dy
    cyl(f"organ{i}", r, h, (x, y, TOPZ + h / 2), br if i % 2 == 0 else cu, verts=32)
    lathe(f"organ_foot{i}", [(0.0, 0.0), (r * 0.5, 0.0), (r, 0.06), (r, 0.07)], seg=32, mat=br2, loc=(x, y, TOPZ))
    box(f"organ_mouth{i}", (r * 1.1, 0.004, r * 0.8), (x, y - r, TOPZ + 0.12), K.mat("dark", (0.01, 0.008, 0.006)),
        rot=(0, 0, 0))
    torus(f"organ_lip{i}", r * 1.02, 0.004, (x, y, TOPZ + h), br2, seg=32, mseg=6)
box("organ_rail", (0.42, 0.03, 0.03), (OX, OY + 0.0, TOPZ + 0.4), wood_m, bevel=0.005)
dial("dial_organ", (OX, OY - 0.06, TOPZ + 0.28), r=0.055, rot=(math.radians(90), 0, math.radians(0)))
GX, GY = CX + 0.58, CY + 0.25
# tower: two brass posts with a stack of meshing gears between them
for sx in (-1, 1):
    cyl(f"tower_post{sx}", 0.018, 1.25, (GX + sx * 0.13, GY, TOPZ + 0.625), br2, verts=24)
    sphere(f"tower_fin{sx}", 0.03, (GX + sx * 0.13, GY, TOPZ + 1.27), br, seg=20, rings=10)
for i, (z, r, n, m) in enumerate(((0.3, 0.17, 32, br), (0.6, 0.11, 22, cu), (0.8, 0.14, 26, br), (1.05, 0.09, 18, cu))):
    gear(f"tgear{i}", teeth=n, r=r, depth=0.02, tooth=0.12, hole=0.12, spokes=(5 if r > 0.1 else 0), mat=m,
         loc=(GX + (0.02 if i % 2 else -0.02), GY - 0.03 * (i % 2), TOPZ + z), rot=(math.radians(90), 0, math.radians(8)))
    cyl(f"taxle{i}", 0.012, 0.08, (GX + (0.02 if i % 2 else -0.02), GY - 0.03 * (i % 2), TOPZ + z), br2,
        rot=(math.radians(90), 0, math.radians(8)), verts=16)
dial("dial_tower", (GX, GY - 0.07, TOPZ + 1.17), r=0.06, rot=(math.radians(90), 0, math.radians(8)))
# big drive gears standing at the front-left edge of the platform, and a crank on the right
for i, (dx, dy, dz, r, n) in enumerate(((-0.6, -0.12, 0.62, 0.19, 34), (-0.43, -0.22, 0.4, 0.115, 22), (-0.62, -0.3, 0.22, 0.08, 16))):
    x, y = CX + dx, CY + dy
    gear(f"drive{i}", teeth=n, r=r, depth=0.025, tooth=0.11, hole=0.1, spokes=6 if r > 0.15 else 4, mat=[br, cu, br][i],
         loc=(x, y, TOPZ + dz), rot=(math.radians(90), 0, math.radians(-35)))
    cyl(f"drive_axle{i}", 0.014, 0.1, (x, y, TOPZ + dz), br2, rot=(math.radians(90), 0, math.radians(-35)), verts=16)
    box(f"drive_stand{i}", (0.04, 0.04, dz), (x + 0.03, y + 0.04, TOPZ + dz / 2), wood_m, bevel=0.005)
crk = (CX + 0.62, CY - 0.4, TOPZ + 0.16)
cyl("crank_hub", 0.04, 0.05, crk, br, rot=(math.radians(90), 0, math.radians(30)), verts=24)
curve_tube("crank_arm", [crk, (crk[0] + 0.02, crk[1] - 0.04, crk[2] + 0.14)], 0.012, br, smooth=False)
cyl("crank_knob", 0.016, 0.08, (crk[0] + 0.02, crk[1] - 0.08, crk[2] + 0.14), wood_m, rot=(math.radians(90), 0, math.radians(30)), verts=16)
box("crank_stand", (0.08, 0.08, 0.14), (crk[0], crk[1] + 0.04, TOPZ + 0.07), wood_m, bevel=0.008)
# pipes linking the organ and the tower to the spiral (curved, with valve wheels)
curve_tube("link_l", [(OX + 0.05, OY - 0.02, TOPZ + 0.6), (OX + 0.2, OY - 0.1, TOPZ + 0.66), spiral[22]], 0.012, cu)
curve_tube("link_r", [(GX - 0.1, GY - 0.02, TOPZ + 0.7), (GX - 0.25, GY - 0.12, TOPZ + 0.8), spiral[48]], 0.012, cu)
for i, p in enumerate(((OX + 0.16, OY - 0.08, TOPZ + 0.645), (GX - 0.22, GY - 0.1, TOPZ + 0.78))):
    torus(f"valve{i}", 0.03, 0.005, p, paint("valve_red", (0.35, 0.03, 0.02), rough=0.4, coat=0.4),
          rot=(math.radians(70), 0, 0), seg=24, mseg=6)

# ---------------------------------------------------------------- a little dressing on the left of the room
cr = import_ph("wooden_crate_01", "crate")
K.fit(cr, 0.75, "x")
cr.rotation_euler[2] = math.radians(12)
K.place(cr, -1.75, BACK - 0.45, on=FLOOR)
st = import_ph("wooden_stool_01", "stool")
K.fit(st, 0.42, "z")
K.place(st, -0.95, BACK - 0.75, on=FLOOR)
bs = import_ph("wicker_basket_01", "basket")
K.fit(bs, 0.42, "x")
lo, hi = K.bbox(cr)
K.place(bs, -1.8, BACK - 0.45, on=[o for o in K.meshes(cr)])
lan = import_ph("wooden_lantern_01", "stool_lantern")
K.fit(lan, 0.3, "z")
K.place(lan, -0.95, BACK - 0.75, on=K.meshes(st))
lo, hi = K.bbox(lan)
# Jingle lights this lantern when the family walks in (chapter 4), so it burns in both versions: the
# only warm light in the dark room until the machine wakes.
swap_glass(lan, glow_glass("pl_glass", 1900, 2.5))
c = (lo + hi) / 2
sphere("st_flame", 0.012, (c.x, c.y, lo.z + 0.1), emit("flame", K.kelvin(1800), 60.0), scale=(0.7, 0.7, 1.4))
K.light("POINT", (c.x, c.y, lo.z + 0.11), power=float(A.get("lantern", 8 if LIT else 22)), size=0.02, k=1900,
        name="stool_lantern_light")
LANTERN = (c.x, c.y, lo.z + 0.11)
fairy_lights("fl_wall", [(-2.6, BACK - 0.05, 2.45), (-1.3, BACK - 0.05, 2.42), (0.0, BACK - 0.05, 2.45), (1.3, BACK - 0.05, 2.42),
                         (2.6, BACK - 0.05, 2.45)], sag=0.16, per_span=8, strength=6.0, r=0.01, lit=LIT, seed=9)

# ---------------------------------------------------------------- star socket at the top
SOCK = (CX, CY, TZ + TH * 0.96)
star_socket("socket", SOCK)

# ---------------------------------------------------------------- fairy light string (same geometry on/off)
lights = []
for i in range(90):
    t = i / 89
    z = TZ + 0.12 + t * (TH * 0.8)
    a = -t * 2 * math.pi * 3.4 + 2.0
    rr = r_at(z) - 0.04
    lights.append((CX + rr * math.cos(a), CY + rr * math.sin(a), z))
bulbs = fairy_lights("tree_lights", lights, sag=0.0, per_span=1, lit=LIT, r=0.012, strength=9.0, seed=4)

# ---------------------------------------------------------------- camera
cam = K.camera((CX - 0.2, BACK - 5.9, 1.32), (CX + 0.05, CY, 0.98), lens=float(A.get("lens", 35)), fstop=6.0)
cam.data.dof.focus_distance = (Vector((CX, CY - 0.4, 1.0)) - cam.location).length
cam.data.shift_x = -0.08
cam.data.shift_y = 0.015
bpy.context.view_layer.update()

# ---------------------------------------------------------------- hooks on front-facing branch tips
cdir = (Vector((cam.location.x, cam.location.y, 0)) - Vector((CX, CY, 0))).normalized()
cand = []
for p, a, t in tips:
    d = Vector((math.cos(a), math.sin(a), 0))
    if d.dot(cdir) > 0.55 and 0.12 < t < 0.8:
        cand.append((p, a, t))
cand.sort(key=lambda c: c[2])
hooks = []
bands = [(0.12, 0.3), (0.3, 0.45), (0.45, 0.62), (0.62, 0.8)]
per = [4, 3, 3, 2]
for (lo_, hi_), n in zip(bands, per):
    row = [c for c in cand if lo_ <= c[2] < hi_]
    row.sort(key=lambda c: math.atan2(c[0].x - CX, -(c[0].y - CY)))
    if not row:
        continue
    step = max(1, len(row) // n)
    for c in row[::step][:n]:
        # stay clear of the spiral pipe
        if min((Vector(s) - c[0]).length for s in spiral) < 0.07:
            continue
        hooks.append(c[0])
px = []
for i, p in enumerate(hooks):
    hook(f"hook{i}", (p.x, p.y, p.z - 0.005), brass("hook_brass", rough=0.2), s=2.2)
    v = world_to_camera_view(sc, cam, Vector((p.x, p.y, p.z - 0.085)))
    px.append([round(v.x * 1920), round((1 - v.y) * 1080)])
sv = world_to_camera_view(sc, cam, Vector((SOCK[0], SOCK[1], SOCK[2] + 0.08)))
json.dump({"hooks_px": px, "star_socket_px": [round(sv.x * 1920), round((1 - sv.y) * 1080)],
           "note": "hooks_px = where an ornament's loop should hang (just below each brass hook), 1920x1080"},
          open(f"{OUT}/machine_hooks.json", "w"), indent=1)
print("HOOKS", len(px), px, "SOCKET", sv)

# ---------------------------------------------------------------- lighting
moon = K.light("SUN", (0, 0, 5), None, power=float(A.get("moon", 3.0)), size=1.0, k=9000, name="moon")
moon.rotation_euler = (math.radians(52), 0, math.radians(220))
wl = K.light("AREA", (WIN[0], BACK + 0.4, WIN[1]), (CX, CY, 0.9), power=float(A.get("winfill", 140)), size=0.8, k=9500,
             name="window_sky")
wl.visible_camera = wl.visible_transmission = wl.visible_glossy = False
amb = K.light("AREA", (CX - 0.8, CY - 2.6, 1.7), (CX, CY, 1.0), power=float(A.get("amb", 90)), size=3.0, k=8000, name="ambient")
amb.visible_camera = amb.visible_glossy = amb.visible_transmission = False
rim = K.light("AREA", (CX + 1.1, CY + 0.5, 1.5), (CX, CY, 1.0), power=float(A.get("rim", 45)), size=0.7, k=9000, name="rim")
rim.visible_camera = rim.visible_glossy = False
rim.data.spread = math.radians(50)
if LIT:
    # the star in its socket, glowing; warm light inside the tree; sparkles; a warmer room
    star_m = metal("star_gold", (1.0, 0.72, 0.3), rough=0.25, var=0.05, cavity=0.0)
    sb = K._bsdf(star_m)
    sb.inputs["Emission Color"].default_value = (1.0, 0.55, 0.15, 1)
    sb.inputs["Emission Strength"].default_value = float(A.get("star", 1.6))
    star_shape("star", R=0.14, r=0.06, depth=0.032, mat=star_m, loc=(SOCK[0], SOCK[1], SOCK[2] + 0.17),
               rot=(0, 0, math.radians(15)))
    K.light("POINT", (SOCK[0], SOCK[1] - 0.12, SOCK[2] + 0.17), power=float(A.get("starlight", 40)), size=0.08, k=2600,
            name="star_light")
    for i, z in enumerate((0.35, 0.75, 1.15)):
        K.light("POINT", (CX, CY - 0.12, TZ + z), power=float(A.get("glow", 30)) * (1.2 - 0.3 * i), size=0.25, k=2300,
                name=f"tree_glow{i}")
    K.light("AREA", (CX, CY - 1.6, 0.4), (CX, CY, 0.8), power=float(A.get("bounce", 90)), size=1.6, k=2400,
            name="warm_bounce").visible_camera = False
    # sparkles: tiny bright motes drifting around the tree
    verts = []
    for i in range(160):
        a = rng.uniform(0, 6.283)
        z = rng.uniform(TZ, TZ + TH * 1.05)
        rr = r_at(min(z, TZ + TH)) + rng.uniform(0.05, 0.35)
        verts.append((CX + rr * math.cos(a), CY + rr * math.sin(a), z))
    sp = mesh_obj("sparkles", verts, [])
    ng = bpy.data.node_groups.new("sparkle_gn", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    gi, go = ng.nodes.new("NodeGroupInput"), ng.nodes.new("NodeGroupOutput")
    m2p = ng.nodes.new("GeometryNodeMeshToPoints")
    rv = ng.nodes.new("FunctionNodeRandomValue")
    rv.inputs[2].default_value, rv.inputs[3].default_value = 0.002, 0.006
    smn = ng.nodes.new("GeometryNodeSetMaterial")
    smn.inputs["Material"].default_value = emit("sparkle", (1.0, 0.82, 0.5), 25.0)
    ng.links.new(gi.outputs[0], m2p.inputs["Mesh"])
    ng.links.new(rv.outputs[1], m2p.inputs["Radius"])
    ng.links.new(m2p.outputs[0], smn.inputs["Geometry"])
    ng.links.new(smn.outputs[0], go.inputs[0])
    sp.modifiers.new("gn", "NODES").node_group = ng
    # the whole room warms up when the machine wakes
    amb.data.color = K.kelvin(3200)
    moon.data.energy *= 0.6
    K.light("AREA", (CX, CY - 0.5, 2.55), (CX, CY, 0.0), power=float(A.get("halo", 60)), size=2.5, k=2600,
            name="warm_halo").visible_camera = False
    bloom(float(A.get("bloomk", 0.45)), 1.0, 8)
else:
    # lantern glow: a warm pool on the floor and the wall behind the stool, against the blue moonlight
    K.light("AREA", (LANTERN[0] + 0.3, LANTERN[1] - 0.9, 0.9), LANTERN, power=float(A.get("lanfill", 40)), size=1.0,
            k=2200, name="lantern_fill").visible_camera = False
    amb.data.color = K.kelvin(6500)
    bloom(0.35, 1.2, 7)

name = "machine_lit" if LIT else "machine"
K.save(f"{OUT}/{name}.blend")
K.render(f"{OUT}/{name}.png")

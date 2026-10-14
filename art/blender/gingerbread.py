"""gingerbread.png: one big plain gingerbread man cookie seen straight from above, undecorated, on a transparent
background (RGBA, 900x1100). Families draw the icing on it live, so the top is clean, evenly baked and nearly
flat; only the rim browns a little more, like a real cookie.

  ... --python gingerbread.py -- --out DIR [--fast]   -> DIR/gingerbread.png

The outline is a smooth union of circles and capsules (signed distance field) traced with marching squares
in the PythonEnv (scikit-image), then extruded, voxel-remeshed for soft baked edges and lightly displaced.
"""
import json
import math
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gw import *  # noqa
from gw import K, bpy, Vector

A = K.args(); OUT = A["out"]; FAST = bool(A.get("fast"))
os.makedirs(OUT, exist_ok=True)

OUTLINE = r'''
import json, sys, numpy as np
from skimage import measure
def cap(px, py, ax, ay, bx, by, r):
    pax, pay = px - ax, py - ay; bax, bay = bx - ax, by - ay
    h = np.clip((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1)
    return np.hypot(pax - bax * h, pay - bay * h) - r
def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)
s = 0.01
y, x = np.mgrid[-8:8:s, -7:7:s]
d = np.hypot(x, y - 4.65) - 2.35                                  # head
d = smin(d, np.hypot(x / 2.75, (y - 0.35) / 3.05) * 2.8 - 2.8, 0.8) # body
for sx in (-1, 1):
    d = smin(d, cap(x, y, sx * 1.6, 1.55, sx * 4.55, 0.55, 1.22), 0.7)   # arms
    d = smin(d, cap(x, y, sx * 1.15, -1.6, sx * 2.45, -5.75, 1.42), 0.7) # legs
c = max(measure.find_contours(d, 0.0), key=len)
pts = [(float(-7 + p[1] * s) / 100.0, float(-8 + p[0] * s) / 100.0) for p in c[::4]]
json.dump(pts, open(sys.argv[1], "w"))
'''
tmp = os.path.join(OUT, "_gingerbread_outline.json")
subprocess.run(["/Users/javi/PythonEnv/bin/python", "-c", OUTLINE, tmp], check=True)
pts = json.load(open(tmp))
os.remove(tmp)

sc = K.reset()
sc = K.render_setup(900, 1100, engine="CYCLES", samples=24 if FAST else 256, transparent=True)
sc.render.resolution_percentage = 50 if FAST else 100

# ---------------------------------------------------------------- the cookie
cd = bpy.data.curves.new("cookie_outline", "CURVE")
cd.dimensions = "2D"
cd.fill_mode = "BOTH"
cd.extrude = 0.0042
cd.bevel_depth = 0.0
spl = cd.splines.new("POLY")
spl.points.add(len(pts) - 1)
for p, (x, y) in zip(spl.points, pts):
    p.co = (x, y, 0, 1)
spl.use_cyclic_u = True
ob = bpy.data.objects.new("cookie", cd)
link(ob)
ck = to_mesh(ob)
ck.name = "cookie"
rm = ck.modifiers.new("remesh", "REMESH")
rm.mode, rm.voxel_size, rm.adaptivity = "VOXEL", 0.0007, 0.0
sm = ck.modifiers.new("smooth", "SMOOTH")
sm.factor, sm.iterations = 1.0, 12
tx = bpy.data.textures.new("dough", "CLOUDS")
tx.noise_scale = 0.012
dp = ck.modifiers.new("disp", "DISPLACE")
dp.texture, dp.strength, dp.texture_coords, dp.direction = tx, 0.0007, "GLOBAL", "Z"
for p in ck.data.polygons:
    p.use_smooth = True

# baked dough: warm brown with soft blotches, darker where the rim curls down, fine pores and crumbs
m = bpy.data.materials.new("gingerbread")
m.use_nodes = True
nt = m.node_tree
b = K._bsdf(m)
from gw import _noise, _ramp, _maprange
n1 = _noise(nt, 90.0, 4.0)
base = _ramp(nt, n1.outputs["Fac"], (0.20, 0.075, 0.022), (0.30, 0.125, 0.04), 0.3, 0.72)
geo = nt.nodes.new("ShaderNodeNewGeometry")
sep = nt.nodes.new("ShaderNodeSeparateXYZ")
nt.links.new(geo.outputs["Normal"], sep.inputs["Vector"])
rimf = _maprange(nt, sep.outputs["Z"], 1.0, 0.0, 0.35, 0.995)
mx = nt.nodes.new("ShaderNodeMix")
mx.data_type = "RGBA"
nt.links.new(rimf.outputs["Result"], mx.inputs["Factor"])
nt.links.new(base.outputs["Color"], mx.inputs["A"])
mx.inputs["B"].default_value = (0.085, 0.028, 0.008, 1)
nt.links.new(mx.outputs["Result"], b.inputs["Base Color"])
b.inputs["Roughness"].default_value = 0.72
b.inputs["Subsurface Weight"].default_value = 0.08
b.inputs["Subsurface Radius"].default_value = (0.6, 0.3, 0.15)
b.inputs["Subsurface Scale"].default_value = 0.002
b.inputs["Sheen Weight"].default_value = 0.15
tc = nt.nodes.new("ShaderNodeTexCoord")
vo = nt.nodes.new("ShaderNodeTexVoronoi")
vo.inputs["Scale"].default_value = 700.0
nt.links.new(tc.outputs["Object"], vo.inputs["Vector"])
pores = _maprange(nt, vo.outputs["Distance"], 0.0, 1.0, 0.0, 0.18)
n2 = _noise(nt, 400.0, 6.0)
add = nt.nodes.new("ShaderNodeMath")
add.operation = "MULTIPLY"
nt.links.new(pores.outputs["Result"], add.inputs[0])
nt.links.new(n2.outputs["Fac"], add.inputs[1])
bump = nt.nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value = 0.6
bump.inputs["Distance"].default_value = 0.0003
nt.links.new(add.outputs[0], bump.inputs["Height"])
nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
ck.data.materials.append(m)

# ---------------------------------------------------------------- soft daylight from a window, top left
K.world_color((0.55, 0.58, 0.62), 0.25)
K.light("AREA", (-0.25, 0.30, 0.45), (0, 0, 0), power=float(A.get("key", 5)), size=0.5, k=5200, name="key")
K.light("AREA", (0.35, -0.25, 0.35), (0, 0, 0), power=float(A.get("fill", 1.3)), size=0.8, k=6200, name="fill")
cam = K.camera((0, 0, 1.0), (0, 0, 0), ortho=0.2)
bpy.context.view_layer.update()
lo, hi = K.bbox([ck])
cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
cam.location = (cx, cy, 1.0)
cam.data.ortho_scale = max((hi.y - lo.y) * 1.06, (hi.x - lo.x) * 1.06 * 1100 / 900)  # height is the larger side
print("COOKIE size m", tuple(round(v, 4) for v in (hi - lo)), flush=True)
K.save(os.path.join(os.path.dirname(os.path.abspath(__file__)), "gingerbread.blend"))
K.render(f"{OUT}/gingerbread.png")

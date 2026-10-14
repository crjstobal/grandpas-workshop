"""Jingle flying sprites (the on-screen cursor): jingle_fly_a.png (wings up) and jingle_fly_b.png (wings down).
512x512 RGBA, side three-quarter view facing screen-left, same orthographic camera for both frames so the
body sits on the same pixel. Neutral warm key + soft fill + cool rim so he reads on dark and warm scenes.

  ... --python fly.py -- --out DIR          -> DIR/jingle_fly_a.png, DIR/jingle_fly_b.png, DIR/jingle_fly.json
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gw import *  # noqa
from gw import K, bpy, Vector
from gw_pip import pip, pip_meshes
from bpy_extras.object_utils import world_to_camera_view

A = K.args(); OUT = A["out"]
RZ = math.radians(-68)          # front (-Y) turned to screen-left and a bit towards the viewer
SIZE = 512


def build(pose):
    K.reset()
    sc = K.render_setup(SIZE, SIZE, engine="CYCLES", samples=int(A.get("samples", 256)), transparent=True)
    sc.cycles.adaptive_threshold = 0.01
    # reflections for the brass, invisible to camera (transparent film)
    K.world_hdri(f"{HDR}/christmas_photo_studio_01/christmas_photo_studio_01_2k.hdr", strength=0.45)
    r = pip("jingle", pose, (0, 0, 0), rot_z=RZ)
    key = K.light("AREA", (-0.45, -0.55, 0.55), (0, 0, 0.1), power=26, size=0.45, k=3600, name="key")
    fill = K.light("AREA", (0.55, -0.45, 0.15), (0, 0, 0.1), power=8, size=0.6, k=5200, name="fill")
    rim = K.light("AREA", (0.35, 0.55, 0.45), (0, 0, 0.1), power=30, size=0.3, k=7500, name="rim")
    rim2 = K.light("AREA", (-0.5, 0.45, 0.3), (0, 0, 0.1), power=14, size=0.3, k=6500, name="rim2")
    for l in (key, fill, rim, rim2):
        l.visible_camera = False
    return sc, r


def corners(root):
    pts = []
    for o in pip_meshes(root):
        pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    return pts


def silhouette(root, cam, c):
    right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
    up = cam.matrix_world.to_3x3() @ Vector((0, 1, 0))
    vx, vy = [], []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in pip_meshes(root):
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        for v in me.vertices:
            w = ev.matrix_world @ v.co
            vx.append((w - c).dot(right))
            vy.append((w - c).dot(up))
        ev.to_mesh_clear()
    return min(vx), max(vx), min(vy), max(vy)


# one fixed camera for both frames: aimed at the body centre (which does not move between frames)
CAM_DIR = Vector((0.0, -1.0, 0.18)).normalized()   # slightly from above
C = Vector((float(A.get("cx", 0.0)), float(A.get("cy", 0.0)), float(A.get("cz", 0.085))))
ORTHO = float(A.get("ortho", 0.34))
info = {}
for pose, name in (("fly_a", "jingle_fly_a"), ("fly_b", "jingle_fly_b")):
    sc, r = build(pose)
    cam = K.camera(tuple(C + CAM_DIR * 3.0), tuple(C), ortho=ORTHO)
    bpy.context.view_layer.update()
    x0, x1, y0, y1 = silhouette(r, cam, C)
    K.render(f"{OUT}/{name}.png")
    tip = bpy.data.objects["jingle_beak"].matrix_world @ Vector((0, 0, 0.015))
    v = world_to_camera_view(sc, cam, tip)
    info[name] = {"beak_tip_px": [round(v.x * SIZE), round((1 - v.y) * SIZE)],
                  "silhouette_px": [round((x0 / ORTHO + 0.5) * SIZE), round((0.5 - y1 / ORTHO) * SIZE),
                                    round((x1 / ORTHO + 0.5) * SIZE), round((0.5 - y0 / ORTHO) * SIZE)]}
    print("FLY", name, info[name], flush=True)
    K.save(f"{os.path.dirname(os.path.abspath(__file__))}/{name}.blend")
json.dump(info, open(f"{OUT}/jingle_fly.json", "w"), indent=1)

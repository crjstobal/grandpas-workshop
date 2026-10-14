"""The gramophone, bells, dials, the brass star and its socket, and the Star Machine contraption."""
import math
import random

from gw_toys import *  # noqa: F401,F403
from gw import K, bpy, Vector, Matrix, Euler, _blob


def horn_profile(L=0.5, r0=0.018, r1=0.26, n=40, k=4.2):
    """Exponential flare (r grows fast near the mouth). Returns [(r, z)] bottom (throat) to top (mouth)."""
    pts = []
    for i in range(n + 1):
        t = i / n
        r = r0 + (r1 - r0) * (math.exp(k * t) - 1) / (math.exp(k) - 1)
        pts.append((r, L * t))
    # rolled lip
    pts.append((r1 + 0.01, L + 0.004))
    pts.append((r1 + 0.012, L - 0.01))
    return pts


def gramophone(name, loc, rz=0.0):
    """Wind-up gramophone: wooden case with brass corners, felt platter (no record), tone arm on its rest,
    side crank and a big brass horn. loc = centre of the case bottom."""
    root = empty(name, loc)
    case_m = wood("gramo_case", "dark_wood", tint=(0.8, 0.55, 0.4))
    felt_m = felt("gramo_felt", (0.05, 0.14, 0.07))
    K._bsdf(felt_m).inputs["Sheen Weight"].default_value = 0.15
    br = brass("brass")
    br2 = old_brass()
    W, D, H = 0.36, 0.36, 0.16
    c = box(name + "_case", (W, D, H), (0, 0, H / 2), case_m, bevel=0.008, parent=root)
    K.uv_real_size(c)
    trim = box(name + "_lid", (W + 0.02, D + 0.02, 0.025), (0, 0, H + 0.0125), case_m, bevel=0.006, parent=root)
    K.uv_real_size(trim)
    plinth = box(name + "_foot", (W + 0.03, D + 0.03, 0.02), (0, 0, 0.01), case_m, bevel=0.005, parent=root)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(f"{name}_corner{sx}{sy}", (0.025, 0.025, H + 0.01), (sx * (W / 2 + 0.002), sy * (D / 2 + 0.002), H / 2 + 0.01),
                br, bevel=0.004, parent=root)
            sphere(f"{name}_ballfoot{sx}{sy}", 0.018, (sx * (W / 2 - 0.02), sy * (D / 2 - 0.02), 0.0 - 0.0), br,
                   scale=(1, 1, 0.6), parent=root, seg=16, rings=8)
    # front decorative panel
    box(name + "_panel", (W * 0.7, 0.006, H * 0.55), (0, -D / 2 - 0.003, H / 2), wood("gramo_panel", "oak_veneer_01",
                                                                                     tint=(0.8, 0.6, 0.45)),
        bevel=0.002, parent=root)
    top = H + 0.025
    # platter
    cyl(name + "_platter", 0.14, 0.018, (-0.03, 0.0, top + 0.009), br2, verts=64, parent=root)
    cyl(name + "_felt", 0.135, 0.004, (-0.03, 0.0, top + 0.02), felt_m, verts=64, parent=root)
    cyl(name + "_spindle", 0.004, 0.03, (-0.03, 0.0, top + 0.03), br, verts=16, parent=root)
    # tone arm: base column at back-right, arm swinging over to a rest (no record on the platter)
    ax, ay = 0.13, 0.12
    cyl(name + "_armbase", 0.03, 0.03, (ax, ay, top + 0.015), br, verts=32, parent=root)
    arm = curve_tube(name + "_arm", [(ax, ay, top + 0.04), (ax, ay, top + 0.07), (ax - 0.02, ay - 0.08, top + 0.07),
                                      (ax + 0.0, ay - 0.2, top + 0.06)], 0.009, br, parent=root)
    box(name + "_soundbox", (0.05, 0.05, 0.02), (ax + 0.0, ay - 0.22, top + 0.055), br, bevel=0.008, parent=root,
        rot=(math.pi / 2, 0, 0))
    cyl(name + "_rest", 0.006, 0.04, (ax + 0.0, ay - 0.24, top + 0.02), br, verts=12, parent=root)
    # crank on the right side
    curve_tube(name + "_crank", [(W / 2 + 0.005, 0.03, H * 0.55), (W / 2 + 0.06, 0.03, H * 0.55),
                                 (W / 2 + 0.07, 0.03, H * 0.55 - 0.08), (W / 2 + 0.12, 0.03, H * 0.55 - 0.08)], 0.007, br,
               parent=root, smooth=False)
    cyl(name + "_crankknob", 0.012, 0.05, (W / 2 + 0.13, 0.03, H * 0.55 - 0.08), case_m, rot=(0, math.pi / 2, 0),
        verts=16, parent=root)
    # horn: neck from the arm base rising behind, elbow, then the flare pointing forward and up
    neck = [(ax, ay, top + 0.04), (ax, ay + 0.06, top + 0.08), (ax - 0.02, ay + 0.1, top + 0.2),
            (ax - 0.05, ay + 0.06, top + 0.32)]
    curve_tube(name + "_neck", neck, 0.022, br, parent=root)
    hp = horn_profile(L=0.44, r0=0.022, r1=0.21)
    horn = lathe(name + "_horn", hp, seg=96, mat=br, parent=root)
    # aim: throat at the neck end, mouth towards the front-left and up
    d = Vector((-0.62, -0.62, 0.5)).normalized()
    horn.rotation_euler = Vector((0, 0, 1)).rotation_difference(d).to_euler()
    horn.location = Vector(neck[-1]) + d * 0.0
    sol = horn.modifiers.new("sol", "SOLIDIFY")
    sol.thickness = 0.003
    # brass seams along the horn (petals)
    for i in range(8):
        a = 2 * math.pi * i / 8
        pts = []
        for r, z in hp[:-2:4]:
            pts.append((r * 1.004 * math.cos(a), r * 1.004 * math.sin(a), z))
        s = curve_tube(f"{name}_seam{i}", pts, 0.0022, br2, parent=root)
        s.rotation_euler = horn.rotation_euler
        s.location = horn.location
    rim = torus(name + "_rim", 0.22, 0.007, (0, 0, 0.44), br2, parent=root, seg=96, mseg=10)
    rim.parent = horn
    rim.location = (0, 0, 0.437)
    return root


def bell(name, loc, s=1.0, mat=None, parent=None, rot=(0, 0, 0)):
    """Little hand bell hanging mouth-down from loc (top of the loop)."""
    m = mat or brass("brass")
    root = empty(name, loc, parent)
    root.rotation_euler = rot
    S = lambda v: v * s  # noqa: E731
    prof = [(0.0, 0.0), (S(0.008), -S(0.001)), (S(0.013), -S(0.008)), (S(0.015), -S(0.02)), (S(0.018), -S(0.03)),
            (S(0.025), -S(0.038)), (S(0.027), -S(0.041)), (S(0.025), -S(0.042)), (S(0.022), -S(0.038)),
            (S(0.015), -S(0.03)), (S(0.011), -S(0.01)), (0.0, -S(0.006))]
    lathe(name + "_body", prof, seg=40, mat=m, parent=root, loc=(0, 0, -S(0.008)))
    torus(name + "_loop", S(0.006), S(0.0018), (0, 0, -S(0.003)), m, rot=(math.pi / 2, 0, 0), parent=root, seg=16, mseg=6)
    sphere(name + "_clapper", S(0.006), (0, 0, -S(0.045)), old_brass(), parent=root, seg=12, rings=6)
    return root


def dial(name, loc, r=0.05, rot=(0, 0, 0), parent=None):
    """Round pressure gauge without numbers: cream face, tick marks, a needle, brass bezel and glass."""
    root = empty(name, loc, parent)
    root.rotation_euler = rot
    br = brass("brass")
    face = paint("dial_face", (0.78, 0.72, 0.58), rough=0.5, coat=0.0)
    ink = K.mat("dial_ink", (0.03, 0.03, 0.03), rough=0.5)
    cyl(name + "_case", r * 1.15, r * 0.5, (0, 0, -r * 0.25), br, verts=48, parent=root)
    torus(name + "_bezel", r * 1.08, r * 0.1, (0, 0, 0), br, parent=root, seg=48, mseg=10)
    cyl(name + "_face", r, 0.002, (0, 0, 0.0), face, verts=48, parent=root)
    for i in range(13):
        a = math.radians(-135 + 270 * i / 12)
        L = r * (0.2 if i % 3 == 0 else 0.12)
        box(f"{name}_tick{i}", (0.0018 * (r / 0.05), L, 0.001), (math.sin(a) * (r * 0.8 - L / 2), math.cos(a) * (r * 0.8 - L / 2),
                                                               0.0015), ink, parent=root, rot=(0, 0, -a))
    box(name + "_needle", (0.002 * (r / 0.05), r * 0.7, 0.0012), (math.sin(-0.6) * r * 0.3, math.cos(-0.6) * r * 0.3, 0.003),
        K.mat("dial_needle", (0.4, 0.02, 0.02), rough=0.4), parent=root, rot=(0, 0, 0.6))
    sphere(name + "_pin", r * 0.07, (0, 0, 0.003), br, parent=root, seg=12, rings=6)
    g = cyl(name + "_glass", r, 0.003, (0, 0, r * 0.06), glass("dial_glass"), verts=48, parent=root)
    g.visible_shadow = False
    return root


def star_shape(name, R=0.13, r=0.055, depth=0.03, mat=None, parent=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    """Five-point star in the XZ plane (faces -Y), bevelled, slightly domed."""
    bm = bmesh.new()
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        rr = R if i % 2 == 0 else r
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    c_front = bm.verts.new((0, -depth * 0.9, 0))
    c_back = bm.verts.new((0, depth * 0.9, 0))
    rim_f = [bm.verts.new((x, -depth * 0.25, z)) for x, z in pts]
    rim_b = [bm.verts.new((x, depth * 0.25, z)) for x, z in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((c_front, rim_f[j], rim_f[i]))
        bm.faces.new((c_back, rim_b[i], rim_b[j]))
        bm.faces.new((rim_f[i], rim_f[j], rim_b[j], rim_b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    link(o, parent)
    o.location, o.rotation_euler = loc, rot
    b = o.modifiers.new("bevel", "BEVEL")
    b.width, b.segments, b.limit_method = 0.004, 2, "ANGLE"
    if mat:
        o.data.materials.append(mat)
    return o


def star_socket(name, loc, parent=None):
    """Empty brass socket waiting for the star: a cup on a stem with five open prongs."""
    br = brass("brass")
    br2 = old_brass()
    root = empty(name, loc, parent)
    lathe(name + "_cup", [(0.0, 0.0), (0.012, 0.0), (0.016, 0.01), (0.03, 0.03), (0.045, 0.045), (0.048, 0.05),
                          (0.044, 0.052), (0.028, 0.036), (0.0, 0.028)], seg=48, mat=br, parent=root)
    cyl(name + "_stem", 0.008, 0.12, (0, 0, -0.06), br2, verts=16, parent=root)
    for i in range(5):
        a = 2 * math.pi * i / 5 + math.pi / 2
        p0 = (0.042 * math.cos(a), 0.042 * math.sin(a), 0.048)
        p1 = (0.06 * math.cos(a), 0.06 * math.sin(a), 0.09)
        p2 = (0.05 * math.cos(a), 0.05 * math.sin(a), 0.11)
        curve_tube(f"{name}_prong{i}", [p0, p1, p2], 0.004, br, parent=root)
        sphere(f"{name}_prongtip{i}", 0.006, p2, br, parent=root, seg=12, rings=6)
    return root


def hook(name, loc, mat=None, s=1.0):
    """Small brass ornament hook (eye + S curve) hanging from loc."""
    m = mat or brass("brass")
    x, y, z = loc
    S = lambda v: v * s  # noqa: E731
    pts = [(x, y, z + S(0.006)), (x + S(0.007), y, z + S(0.002)), (x + S(0.004), y, z - S(0.008)), (x, y, z - S(0.014)),
           (x - S(0.003), y, z - S(0.026)), (x + S(0.003), y, z - S(0.036)), (x + S(0.007), y, z - S(0.032))]
    return curve_tube(name, pts, S(0.0016), m)

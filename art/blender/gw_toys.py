"""Wooden toys, the toy shelf with its drawers, and the brass 4-wheel combination lock."""
import math
import random

from gw_interior import *  # noqa: F401,F403
from gw import K, bpy, Vector, Matrix, _blob

TOY_RED = None


def toy_mats():
    return {
        "red": paint("toy_red", (0.32, 0.018, 0.012), rough=0.4, coat=0.4),
        "green": paint("toy_green", (0.03, 0.14, 0.06), rough=0.4, coat=0.4),
        "blue": paint("toy_blue", (0.04, 0.08, 0.22), rough=0.4, coat=0.4),
        "cream": paint("toy_cream", (0.72, 0.62, 0.45), rough=0.45, coat=0.3),
        "black": paint("toy_black", (0.02, 0.018, 0.016), rough=0.35, coat=0.5),
        "gold": brass("brass"),
        "wood": wood("toy_wood", "oak_veneer_01", tint=(1.0, 0.85, 0.65)),
        "skin": paint("toy_skinwood", (0.62, 0.42, 0.28), rough=0.5, coat=0.2),
        "white": paint("toy_white", (0.8, 0.78, 0.74), rough=0.6, coat=0.1),
    }


def toy_train(name, loc, rz=0.0, s=1.0):
    M = toy_mats()
    root = empty(name, loc)
    root.rotation_euler = (0, 0, rz)
    z0 = 0.0
    box(name + "_chassis", (0.17 * s, 0.065 * s, 0.014 * s), (0, 0, z0 + 0.016 * s), M["wood"], bevel=0.003, parent=root)
    box(name + "_cab", (0.07 * s, 0.065 * s, 0.075 * s), (0.045 * s, 0, z0 + 0.06 * s), M["red"], bevel=0.006, parent=root)
    box(name + "_roof", (0.085 * s, 0.08 * s, 0.01 * s), (0.045 * s, 0, z0 + 0.1 * s), M["black"], bevel=0.003, parent=root)
    cyl(name + "_boiler", 0.028 * s, 0.1 * s, (-0.03 * s, 0, z0 + 0.05 * s), M["green"], rot=(0, math.pi / 2, 0),
        verts=32, bevel=0.003, parent=root)
    cyl(name + "_stack", 0.009 * s, 0.035 * s, (-0.06 * s, 0, z0 + 0.09 * s), M["black"], verts=16, r2=0.014 * s, parent=root)
    sphere(name + "_dome", 0.012 * s, (-0.02 * s, 0, z0 + 0.078 * s), M["gold"], parent=root, seg=16, rings=8)
    for wx in (-0.055, 0.0, 0.055):
        for sy in (-1, 1):
            cyl(f"{name}_w{wx}{sy}", 0.017 * s, 0.009 * s, (wx * s, sy * 0.038 * s, z0 + 0.017 * s), M["red"],
                rot=(math.pi / 2, 0, 0), verts=24, bevel=0.002, parent=root)
    return root


def spinning_top(name, loc, s=1.0, c1="red", c2="cream"):
    M = toy_mats()
    prof = [(0.0, 0.0), (0.006, 0.004), (0.03, 0.03), (0.042, 0.045), (0.043, 0.052), (0.035, 0.06), (0.01, 0.064),
            (0.006, 0.065), (0.006, 0.09), (0.0, 0.092)]
    o = lathe(name, [(r * s, z * s) for r, z in prof], seg=48, mat=M[c1], loc=loc)
    band = lathe(name + "_band", [(0.0425 * s, 0.044 * s), (0.0438 * s, 0.047 * s), (0.0438 * s, 0.051 * s),
                                  (0.0425 * s, 0.054 * s)], seg=48, mat=M[c2], loc=loc)
    o.rotation_euler = (math.radians(14), 0, 0)  # resting tilted on its rim
    band.rotation_euler = o.rotation_euler
    return o


def blocks(name, loc, n=4, s=0.05, seed=2):
    M = toy_mats()
    rng = random.Random(seed)
    cols = ["red", "blue", "green", "cream"]
    x, y, z = loc
    out = []
    stack = [(0, 0, 0), (s * 1.05, 0.004, 0), (s * 0.5, 0.0, s), (s * 2.3, -0.02, 0)]
    for i in range(n):
        dx, dy, dz = stack[i % len(stack)]
        b = box(f"{name}{i}", (s, s, s), (x + dx, y + dy, z + dz + s / 2 + 0.0005), M[cols[i % 4]], bevel=0.004,
                rot=(0, 0, math.radians(rng.uniform(-12, 12))))
        out.append(b)
    return out


def drum(name, loc, r=0.06, h=0.07):
    M = toy_mats()
    x, y, z = loc
    root = empty(name, loc)
    cyl(name + "_shell", r, h, (0, 0, h / 2), M["red"], verts=48, parent=root)
    for zz in (0.004, h - 0.004):
        torus(f"{name}_hoop{zz:.3f}", r + 0.002, 0.004, (0, 0, zz), M["gold"], parent=root, seg=48, mseg=8)
    cyl(name + "_skin", r - 0.001, 0.003, (0, 0, h + 0.0005), M["white"], verts=48, parent=root)
    pts = []
    for i in range(17):
        a = 2 * math.pi * i / 16
        zz = 0.008 if i % 2 == 0 else h - 0.008
        pts.append((r * 1.02 * math.cos(a), r * 1.02 * math.sin(a), zz))
    curve_tube(name + "_cord", pts, 0.0016, M["cream"], parent=root, smooth=False)
    for sx in (-1, 1):
        stick = cyl(f"{name}_stick{sx}", 0.0035, 0.11, (sx * 0.025, -r - 0.02, 0.006), M["wood"],
                    rot=(math.pi / 2, 0, math.radians(sx * 20)), verts=12, parent=root)
        sphere(f"{name}_stickball{sx}", 0.007, (sx * 0.025 + sx * 0.019, -r - 0.072, 0.006), M["wood"], parent=root,
               seg=12, rings=6)
    return root


def nutcracker(name, loc, s=1.0, rz=0.0):
    """Classic wooden nutcracker toy soldier (a toy, painted wood)."""
    M = toy_mats()
    root = empty(name, loc)
    root.rotation_euler = (0, 0, rz)
    S = lambda v: v * s  # noqa: E731
    box(name + "_base", (S(0.07), S(0.05), S(0.012)), (0, 0, S(0.006)), M["green"], bevel=0.002, parent=root)
    for sx in (-1, 1):
        cyl(f"{name}_boot{sx}", S(0.011), S(0.03), (sx * S(0.012), 0, S(0.027)), M["black"], verts=16, parent=root)
        cyl(f"{name}_leg{sx}", S(0.01), S(0.04), (sx * S(0.012), 0, S(0.062)), M["white"], verts=16, parent=root)
    cyl(name + "_coat", S(0.025), S(0.07), (0, 0, S(0.115)), M["red"], verts=24, bevel=0.002, parent=root)
    cyl(name + "_belt", S(0.0255), S(0.008), (0, 0, S(0.088)), M["black"], verts=24, parent=root)
    for i in range(3):
        sphere(f"{name}_btn{i}", S(0.003), (0, -S(0.0255), S(0.1 + i * 0.016)), M["gold"], parent=root, seg=8, rings=4)
    for sx in (-1, 1):
        cyl(f"{name}_arm{sx}", S(0.008), S(0.055), (sx * S(0.032), 0, S(0.118)), M["red"], verts=12, parent=root)
        sphere(f"{name}_ep{sx}", S(0.01), (sx * S(0.031), 0, S(0.148)), M["gold"], scale=(1, 1, 0.5), parent=root,
               seg=12, rings=6)
    sphere(name + "_head", S(0.021), (0, 0, S(0.168)), M["skin"], parent=root, seg=24, rings=12)
    beard = sphere(name + "_beard", S(0.016), (0, -S(0.012), S(0.158)), M["white"], scale=(1.1, 0.7, 0.9), parent=root,
                   seg=16, rings=8)
    sphere(name + "_nose", S(0.004), (0, -S(0.021), S(0.17)), M["red"], parent=root, seg=8, rings=4)
    for sx in (-1, 1):
        sphere(f"{name}_eye{sx}", S(0.0025), (sx * S(0.008), -S(0.019), S(0.176)), M["black"], parent=root, seg=8,
               rings=4)
    cyl(name + "_hat", S(0.022), S(0.05), (0, 0, S(0.205)), M["black"], verts=24, parent=root)
    cyl(name + "_hatband", S(0.0225), S(0.006), (0, 0, S(0.184)), M["gold"], verts=24, parent=root)
    sphere(name + "_plume", S(0.007), (0, -S(0.018), S(0.218)), M["gold"], parent=root, seg=12, rings=6)
    return root


def airplane(name, loc, s=1.0, rz=0.0):
    M = toy_mats()
    root = empty(name, loc)
    root.rotation_euler = (0, 0, rz)
    S = lambda v: v * s  # noqa: E731
    cyl(name + "_body", S(0.02), S(0.15), (0, 0, S(0.045)), M["blue"], rot=(0, math.pi / 2, 0), verts=24, r2=S(0.012),
        parent=root)
    box(name + "_wing", (S(0.05), S(0.2), S(0.008)), (S(0.02), 0, S(0.045)), M["cream"], bevel=0.003, parent=root)
    box(name + "_tail", (S(0.03), S(0.07), S(0.006)), (-S(0.07), 0, S(0.05)), M["cream"], bevel=0.002, parent=root)
    box(name + "_fin", (S(0.03), S(0.006), S(0.035)), (-S(0.07), 0, S(0.065)), M["red"], bevel=0.002, parent=root)
    cyl(name + "_nose", S(0.012), S(0.012), (S(0.079), 0, S(0.045)), M["red"], rot=(0, math.pi / 2, 0), verts=16,
        parent=root)
    box(name + "_prop", (S(0.004), S(0.07), S(0.008)), (S(0.087), 0, S(0.045)), M["wood"], bevel=0.001, parent=root,
        rot=(math.radians(30), 0, 0))
    for sy in (-1, 1):
        cyl(f"{name}_strut{sy}", S(0.003), S(0.03), (S(0.03), sy * S(0.03), S(0.022)), M["black"], verts=8, parent=root)
        cyl(f"{name}_wheel{sy}", S(0.011), S(0.008), (S(0.03), sy * S(0.03), S(0.011)), M["black"],
            rot=(math.pi / 2, 0, 0), verts=16, parent=root)
    return root


def combo_lock(name, loc, s=1.0, wheel_rot=(0, 0, 0, 0)):
    """Brass 4-wheel combination lock mounted on a vertical surface facing -Y. loc = centre of the back.
    The four knurled wheels show a blank lighter band through the window (digits are overlaid by the app).
    Returns (root, [wheel centre world positions])."""
    br = brass("lock_brass", rough=0.28)
    br2 = old_brass("lock_brass_dark")
    band_m = paint("wheel_band", (0.75, 0.68, 0.52), rough=0.35, coat=0.3)
    dark = K.mat("keyhole_dark", (0.004, 0.003, 0.002), rough=0.9)
    root = empty(name, loc)
    S = lambda v: v * s  # noqa: E731
    W, H, D = S(0.2), S(0.085), S(0.04)
    box(name + "_back", (W + S(0.03), S(0.008), H + S(0.03)), (0, -S(0.004), 0), br2, bevel=S(0.003), parent=root)
    body = box(name + "_body", (W, D, H), (0, -D / 2 - S(0.008), 0), br, bevel=S(0.006), parent=root)
    win = box("win_cut", (W * 0.86, D, H * 0.62), (0, -D - S(0.008), 0), None)
    win.parent = root
    bpy.context.view_layer.update()
    boolean(body, win)
    box(name + "_cavity", (W * 0.85, S(0.004), H * 0.6), (0, -S(0.012), 0), dark, parent=root)
    centres = []
    for i in range(4):
        x = (i - 1.5) * W * 0.205
        wr = S(0.026)
        g = gear(f"{name}_wheel{i}", teeth=28, r=wr, depth=S(0.026), tooth=0.07, hole=0.0, mat=br,
                 loc=(x, -D * 0.55 - S(0.008), 0), rot=(0, math.pi / 2, 0), parent=root, bevel=S(0.0006))
        g.rotation_euler = (wheel_rot[i], math.pi / 2, 0)
        bnd = cyl(f"{name}_band{i}", wr * 0.94, S(0.016), (x, -D * 0.55 - S(0.008), 0), band_m, rot=(0, math.pi / 2, 0),
                  verts=48, parent=root)
        for t in (-1, 1):
            cyl(f"{name}_sep{i}{t}", S(0.024), S(0.003), (x + t * S(0.0145), -D * 0.55 - S(0.008), 0), br2,
                rot=(0, math.pi / 2, 0), verts=32, parent=root)
        bpy.context.view_layer.update()
        centres.append(root.matrix_world @ Vector((x, -D - S(0.008), 0)))
    # screws and a small shackle-style handle on the right
    for sx in (-1, 1):
        for sz in (-1, 1):
            sphere(f"{name}_scr{sx}{sz}", S(0.006), (sx * (W / 2 + S(0.007)), -S(0.01), sz * (H / 2 + S(0.007))), br,
                   scale=(1, 0.5, 1), parent=root, seg=16, rings=8)
    return root, centres


def toy_shelf(name, x=0.0, back=BACK, W=1.5, H=2.0, D=0.42):
    """Tall wooden toy shelf against the back wall: three open shelves above, a row of three drawers at
    chest height (the centre one gets the combination lock) and two cupboard doors below.
    Returns dict with shelf heights, drawer fronts and the centre drawer's front centre."""
    wm = wood("shelf_body", "wood_cabinet_worn_long", tint=(0.95, 0.8, 0.62))
    dm = wood("shelf_drawer", "wood_cabinet_worn_long", tint=(1.1, 0.85, 0.62))
    br = brass("brass")
    root = empty(name)
    y0 = back - D
    t = 0.035
    for sx in (-1, 1):
        o = box(f"{name}_side{sx}", (t, D, H), (x + sx * (W / 2 - t / 2), back - D / 2, H / 2), wm, bevel=0.004)
        K.uv_real_size(o)
    o = box(f"{name}_back", (W, 0.015, H), (x, back - 0.0075, H / 2), wm)
    K.uv_real_size(o)
    o = box(f"{name}_crown", (W + 0.08, D + 0.05, 0.05), (x, back - D / 2 - 0.02, H + 0.025), wm, bevel=0.008)
    K.uv_real_size(o)
    shelves = []
    for z in (0.0, 0.62, 0.84, 1.24, 1.62):
        o = box(f"{name}_board{z}", (W - 2 * t, D - 0.02, 0.03), (x, back - D / 2, z + 0.015 + (0.05 if z == 0 else 0)),
                wm, bevel=0.003)
        K.uv_real_size(o)
        shelves.append(z + 0.03 + (0.05 if z == 0 else 0))
    # plinth
    o = box(f"{name}_plinth", (W, 0.03, 0.08), (x, y0 + 0.015, 0.04), wm, bevel=0.004)
    K.uv_real_size(o)
    # drawers between 0.62 and 0.84
    drawers = []
    n = 3
    inner = W - 2 * t
    for i in range(n):
        cx = x - inner / 2 + inner * (i + 0.5) / n
        f = box(f"{name}_drawer{i}", (inner / n - 0.012, 0.025, 0.19), (cx, y0 - 0.0125 + 0.012, 0.745), dm, bevel=0.006)
        K.uv_real_size(f)
        box(f"{name}_dpanel{i}", (inner / n - 0.09, 0.006, 0.12), (cx, y0 - 0.003, 0.745), wm, bevel=0.002)
        drawers.append((cx, y0 - 0.006, 0.745))
        if i != 1:
            cyl(f"{name}_pull{i}", 0.012, 0.03, (cx, y0 - 0.012, 0.745), br, rot=(math.pi / 2, 0, 0), verts=24)
            sphere(f"{name}_pullk{i}", 0.018, (cx, y0 - 0.03, 0.745), br, seg=24, rings=12)
    # cupboard doors below
    for sx in (-1, 1):
        dd = box(f"{name}_door{sx}", (inner / 2 - 0.01, 0.025, 0.52), (x + sx * inner / 4, y0 - 0.0125 + 0.012, 0.345), dm,
                 bevel=0.006)
        K.uv_real_size(dd)
        box(f"{name}_panel{sx}", (inner / 2 - 0.1, 0.008, 0.4), (x + sx * inner / 4, y0 - 0.004, 0.345), wm, bevel=0.003)
        sphere(f"{name}_knob{sx}", 0.016, (x + sx * 0.05, y0 - 0.02, 0.4), br, seg=24, rings=12)
    return {"root": root, "shelves": shelves, "drawers": drawers, "y0": y0, "x": x, "W": W}


def stacking_rings(name, loc, s=1.0):
    M = toy_mats()
    x, y, z = loc
    cols = ["red", "cream", "green", "blue", "red"]
    lathe(name + "_base", [(0.0, 0.0), (0.045 * s, 0.0), (0.045 * s, 0.012 * s), (0.0, 0.012 * s)], seg=40,
          mat=M["wood"], loc=loc, cap_top=True)
    cyl(name + "_peg", 0.008 * s, 0.13 * s, (x, y, z + 0.075 * s), M["wood"], verts=16)
    zz = z + 0.012 * s
    for i, c in enumerate(cols):
        r = (0.04 - i * 0.006) * s
        th = 0.018 * s
        torus(f"{name}_r{i}", r * 0.62, r * 0.42, (x, y, zz + th / 2), M[c], seg=40, mseg=14).scale = (1, 1, 0.7)
        zz += th * 0.95
    sphere(name + "_cap", 0.014 * s, (x, y, zz + 0.012 * s), M["red"], seg=20, rings=10)


def toy_house(name, loc, s=1.0, rz=0.0):
    M = toy_mats()
    root = empty(name, loc)
    root.rotation_euler = (0, 0, rz)
    S = lambda v: v * s  # noqa: E731
    box(name + "_walls", (S(0.09), S(0.07), S(0.07)), (0, 0, S(0.035)), M["cream"], bevel=0.003, parent=root)
    for sx in (-1, 1):
        box(f"{name}_roof{sx}", (S(0.065), S(0.08), S(0.008)), (sx * S(0.024), 0, S(0.088)), M["red"], bevel=0.002,
            rot=(0, sx * math.radians(40), 0), parent=root)
    box(name + "_door", (S(0.02), S(0.004), S(0.035)), (0, -S(0.036), S(0.018)), M["green"], parent=root)
    for sx in (-1, 1):
        box(f"{name}_win{sx}", (S(0.016), S(0.004), S(0.016)), (sx * S(0.028), -S(0.036), S(0.045)), M["blue"],
            parent=root)
    return root

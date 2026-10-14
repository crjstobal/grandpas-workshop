"""Grandpa's Workshop interior: the room, the workbench and its dressing, the magnifying lamp, the perch.

Room convention: back wall inner face at y = BACK (faces -Y), floor at z = 0, x across.
"""
import math
import random

from gw_props import *  # noqa: F401,F403
from gw import K, bmesh, bpy, Vector, Matrix, Euler, _blob

BACK = 2.0
WINDOW_PANE_HIDDEN = True
BENCH_Z = 0.92


def room(W=7.0, D=6.0, H=2.7, back=BACK, window=None, round_window_at=None, outside=True):
    """Walls (warm planks), floor, ceiling beams. window = (x, z, w, h) square window cut in the back wall,
    showing a snowy moonlit night outside."""
    wall_m = wood("in_wall", "planks_brown_10", tint=(1.05, 0.92, 0.8))
    floor_m = wood("in_floor", "wood_floor", tint=(0.8, 0.65, 0.5))
    beam_m = wood("in_beam", "dark_wood", tint=(0.6, 0.45, 0.35))
    root = empty("room")
    bw = box("back_wall", (W, 0.12, H), (0, back + 0.06, H / 2), wall_m)
    # rotate the plank texture so planks run horizontally on the back wall
    if window:
        x, z, w, h = window
        c = box("wcut", (w, 1, h), (x, back, z), None)
        boolean(bw, c)
    K.uv_real_size(bw)
    bw.parent = root
    for sx in (-1, 1):
        sw = box(f"side_wall{sx}", (0.12, D, H), (sx * W / 2, back - D / 2, H / 2), wall_m)
        K.uv_real_size(sw)
        sw.parent = root
    fl = box("floor", (W, D, 0.05), (0, back - D / 2, -0.025), floor_m)
    K.uv_real_size(fl)
    fl.parent = root
    ce = box("ceiling", (W, D, 0.05), (0, back - D / 2, H + 0.025), wall_m)
    K.uv_real_size(ce)
    ce.parent = root
    for i in range(5):
        y = back - 0.4 - i * 1.3
        b = box(f"beam{i}", (W, 0.16, 0.2), (0, y, H - 0.1), beam_m, bevel=0.01)
        K.uv_real_size(b)
        b.parent = root
    # skirting
    box("skirting", (W, 0.03, 0.12), (0, back - 0.015, 0.06), beam_m, bevel=0.004, parent=root)
    if window:
        x, z, w, h = window
        win_frame(x, z, w, h, back)
        if outside:
            outside_view(x, z, back)
    return root


def win_frame(x, z, w, h, back):
    trim = paint("in_trim", (0.30, 0.06, 0.04), rough=0.55, coat=0.1)
    t = 0.06
    for sx in (-1, 1):
        box(f"wf_side{sx}", (t, 0.16, h + 2 * t), (x + sx * (w / 2 + t / 2), back + 0.02, z), trim, bevel=0.006)
    box("wf_top", (w + 2 * t, 0.16, t), (x, back + 0.02, z + h / 2 + t / 2), trim, bevel=0.006)
    box("wf_sill", (w + 0.24, 0.24, 0.05), (x, back - 0.04, z - h / 2 - 0.025), trim, bevel=0.008)
    box("wf_mv", (0.03, 0.04, h), (x, back + 0.06, z), trim, bevel=0.004)
    box("wf_mh", (w, 0.04, 0.03), (x, back + 0.06, z), trim, bevel=0.004)
    g = glass("win_glass", (0.95, 0.97, 1.0), rough=0.03)
    pane = box("win_pane", (w, 0.006, h), (x, back + 0.08, z), g)
    pane.visible_shadow = False
    pane.hide_render = WINDOW_PANE_HIDDEN  # a pane reflects the side walls as big flat blocks; read as clear air
    # frost in the corners: a few snow lumps on the outer sill
    rng = random.Random(4)
    sm = snow_mat()
    o = _blob("sill_snow", (w * 0.5, 0.06, 0.035), sm, rng)
    o.location = (x, back + 0.14, z - h / 2 + 0.005)
    box("outer_sill", (w + 0.2, 0.14, 0.04), (x, back + 0.15, z - h / 2 - 0.02), trim, bevel=0.006)


def outside_view(x, z, back):
    """What you see through the window: snowy ground, a few snowy firs, a night gradient backdrop."""
    sky = bpy.data.materials.get("sky_card") or bpy.data.materials.new("sky_card")
    sky.use_nodes = True
    nt = sky.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.06, 0.10, 0.20, 1)
    ramp.color_ramp.elements[1].color = (0.008, 0.016, 0.05, 1)
    nt.links.new(tc.outputs["Generated"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], em.inputs["Color"])
    em.inputs["Strength"].default_value = 1.0
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    card = box("sky_card", (30, 0.1, 14), (x, back + 14, 5), sky)
    card.visible_shadow = False
    gnd = box("out_ground", (30, 14, 0.1), (x, back + 7, 0.0), snow_mat())
    rng = random.Random(9)
    for i, (dx, dy, hh) in enumerate([(-1.6, 3.0, 2.6), (0.4, 4.5, 3.2), (1.9, 2.4, 1.9), (-0.4, 7.0, 4.0),
                                      (3.0, 6.0, 3.5), (-3.0, 5.5, 3.6)]):
        fir_tree(f"out_fir{i}", hh, hh * 0.32, (x + dx, back + dy, 0.05), seed=60 + i, snow=0.6, density=0.6)
    flakes = snowfall("out_flakes", 400, (x - 2, back + 0.4, 0.5), (x + 2, back + 3, 3.0), rmin=0.004,
                      rmax=0.01, mat=emit("flake_out", (0.85, 0.9, 1.0), 0.3))
    return card


# ------------------------------------------------------------------ workbench
def workbench(x0=-1.25, x1=1.25, depth=0.78, top_z=BENCH_Z, back=BACK):
    top_m = wood("bench_top", "wood_table_worn", tint=(1.0, 0.85, 0.7))
    leg_m = wood("bench_leg", "dark_wood", tint=(0.7, 0.55, 0.42))
    root = empty("workbench")
    y0, y1 = back - depth, back - 0.02
    t = 0.08
    top = box("bench_top", (x1 - x0, depth, t), ((x0 + x1) / 2, (y0 + y1) / 2, top_z - t / 2), top_m, bevel=0.01)
    K.uv_real_size(top)
    top.parent = root
    for sx in (x0 + 0.08, x1 - 0.08):
        for sy in (y0 + 0.08, y1 - 0.08):
            lg = box(f"bench_leg{sx:.1f}{sy:.1f}", (0.1, 0.1, top_z - t), (sx, sy, (top_z - t) / 2), leg_m, bevel=0.008)
            K.uv_real_size(lg)
            lg.parent = root
    # apron with drawers
    ap = box("bench_apron", (x1 - x0 - 0.04, 0.03, 0.16), ((x0 + x1) / 2, y0 + 0.03, top_z - t - 0.08), leg_m,
             bevel=0.005)
    K.uv_real_size(ap)
    ap.parent = root
    br = brass("brass")
    n = 3
    for i in range(n):
        cx = x0 + (x1 - x0) * (i + 0.5) / n
        d = box(f"bench_drawer{i}", ((x1 - x0) / n - 0.08, 0.02, 0.13), (cx, y0 + 0.008, top_z - t - 0.08), top_m,
                bevel=0.006)
        K.uv_real_size(d)
        d.parent = root
        cyl(f"bench_pull{i}", 0.012, 0.03, (cx, y0 - 0.012, top_z - t - 0.08), br, rot=(math.pi / 2, 0, 0),
            verts=24, parent=root)
        sphere(f"bench_pullk{i}", 0.017, (cx, y0 - 0.03, top_z - t - 0.08), br, parent=root, seg=24, rings=12)
    # lower shelf with a crate and a basket
    sh = box("bench_shelf", (x1 - x0 - 0.1, depth - 0.12, 0.04), ((x0 + x1) / 2, (y0 + y1) / 2, 0.16), leg_m,
             bevel=0.005)
    K.uv_real_size(sh)
    sh.parent = root
    return {"root": root, "top": top, "y0": y0, "y1": y1, "shelf": sh}


def perch(name, loc, mat=None, h=0.13, bar=0.11):
    """Little brass bird perch: round wooden base with brass rim, a rod and a T-bar with finials.
    loc = centre of the base bottom. Returns (root, bar centre world position)."""
    root = empty(name, loc)
    br = mat or brass("brass")
    base_w = wood("perch_base", "dark_wood", tint=(0.7, 0.5, 0.38))
    b = lathe(name + "_base", [(0.0, 0.0), (0.055, 0.0), (0.058, 0.004), (0.058, 0.014), (0.05, 0.02),
                                (0.02, 0.024), (0.0, 0.024)], seg=64, mat=base_w, parent=root)
    lathe(name + "_rim", [(0.0585, 0.003), (0.0615, 0.004), (0.0615, 0.013), (0.0585, 0.0145)], seg=64, mat=br,
          parent=root)
    lathe(name + "_rod", [(0.0, 0.024), (0.014, 0.024), (0.014, 0.03), (0.006, 0.036), (0.005, h - 0.01),
                          (0.008, h - 0.006), (0.0, h - 0.004)], seg=32, mat=br, parent=root)
    cyl(name + "_bar", 0.0055, bar, (0, 0, h), br, rot=(0, math.pi / 2, 0), verts=24, parent=root)
    for sx in (-1, 1):
        sphere(f"{name}_fin{sx}", 0.0095, (sx * bar / 2, 0, h), br, parent=root, seg=24, rings=12)
    bpy.context.view_layer.update()
    return root, root.matrix_world @ Vector((0, 0, h))


def magnifier_lamp(name, base, reach=(0.45, -0.25), head_z=0.42, mat=None, light_power=25, k=3000):
    """Articulated magnifying lamp clamped on the bench back edge. base = (x, y, z) clamp point on the bench top.
    The head (lens ring + glass + small light) hangs at base + reach (dx, dy), head_z above the top."""
    br = mat or brass("brass")
    dark = paint("lamp_enamel", (0.06, 0.09, 0.07), rough=0.4, coat=0.5)
    root = empty(name)
    bx, by, bz = base
    # clamp block and post
    box(name + "_clamp", (0.06, 0.08, 0.05), (bx, by, bz + 0.025), dark, bevel=0.006, parent=root)
    cyl(name + "_post", 0.012, 0.2, (bx, by, bz + 0.15), br, verts=24, parent=root)
    j1 = Vector((bx, by, bz + 0.25))
    hx, hy = bx + reach[0], by + reach[1]
    head = Vector((hx, hy, bz + head_z))
    elbow = Vector((bx + reach[0] * 0.45, by + reach[1] * 0.4, bz + head_z + 0.32))
    for i, (a, b) in enumerate(((j1, elbow), (elbow, head + Vector((0, 0, 0.07))))):
        d = b - a
        for off in (-0.012, 0.012):
            side = d.cross(Vector((0, 0, 1))).normalized() * off
            curve_tube(f"{name}_arm{i}{off}", [tuple(a + side), tuple(b + side)], 0.0055, br, parent=root,
                       smooth=False)
        # spring along each arm
        mid = a + d * 0.5
        sp = helix(f"{name}_spring{i}", 0.007, 0.0016, 10, d.length * 0.45, br, parent=root)
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        sp.rotation_euler = q.to_euler()
        sp.location = a + d * 0.27 + d.cross(Vector((0, 0, 1))).normalized() * 0.02
    for j in (j1, elbow):
        cyl(name + f"_joint{j.z:.2f}", 0.018, 0.04, tuple(j), br, rot=(0, math.pi / 2, 0), verts=24, parent=root)
    # head: ring + lens + little hood
    ring = torus(name + "_ring", 0.075, 0.011, tuple(head), dark, rot=(math.radians(12), 0, 0), parent=root)
    lens = cyl(name + "_lens", 0.072, 0.012, tuple(head), glass("lens_glass", (1, 1, 1), 0.0),
               rot=(math.radians(12), 0, 0), verts=64, parent=root)
    lens.visible_shadow = False
    sub = lens.modifiers.new("cast", "CAST")
    sub.factor = 0.25
    cyl(name + "_neck", 0.008, 0.07, tuple(head + Vector((0, 0, 0.11))), br, verts=16, parent=root)
    # a small warm light just under the ring (the lamp itself)
    lt = K.light("AREA", tuple(head + Vector((0, 0, 0.015))), tuple(head + Vector((0, 0.05, -1))), power=light_power,
                 size=0.12, k=k, name=name + "_light")
    lt.data.shape = "DISK"
    lt.visible_camera = False
    bulb = torus(name + "_bulbring", 0.066, 0.004, tuple(head + Vector((0, 0, -0.004))),
                 emit("lamp_tube", K.kelvin(k), 8.0), rot=(math.radians(12), 0, 0), parent=root, seg=48, mseg=8)
    return root, head


def hanging_bulb(name, loc, length=0.6, power=30, k=2400, glow=30):
    """Bare filament bulb on a cord from the ceiling, with a small brass socket."""
    x, y, z = loc
    br = brass("brass")
    curve_tube(name + "_cord", [(x, y, z + length), (x, y, z + 0.07)], 0.004, K.mat("cord", (0.03, 0.02, 0.02),
                                                                                     rough=0.6), smooth=False)
    cyl(name + "_sock", 0.02, 0.05, (x, y, z + 0.05), br, verts=24)
    g = sphere(name + "_glass", 0.032, (x, y, z - 0.005), glow_glass("bulb_glass", k, 2.0, rough=0.05),
               scale=(1, 1, 1.2))
    g.visible_shadow = False
    sphere(name + "_fil", 0.009, (x, y, z), emit("filament", K.kelvin(k - 300), glow), scale=(1, 1, 1.4))
    return K.light("POINT", (x, y, z), power=power, size=0.02, k=k, name=name + "_light")


def candle(name, loc, h=0.12, r=0.018, lit=True, power=3.0):
    wax = paint("wax_candle", (0.85, 0.80, 0.68), rough=0.5, coat=0.0, var=0.05, sss=0.6)
    x, y, z = loc
    c = cyl(name, r, h, (x, y, z + h / 2), wax, verts=24)
    curve_tube(name + "_wick", [(x, y, z + h), (x, y, z + h + 0.012)], 0.0012, K.mat("wick", (0.02, 0.015, 0.01)),
               smooth=False)
    if lit:
        sphere(name + "_flame", 0.006, (x, y, z + h + 0.022), emit("flame", K.kelvin(1800), 60.0), scale=(0.7, 0.7, 2.0))
        K.light("POINT", (x, y, z + h + 0.03), power=power, size=0.01, k=1850, name=name + "_light")
    return c


def scatter_gears(prefix, center, area=(0.3, 0.2), n=7, z=BENCH_Z, seed=1, rmin=0.012, rmax=0.045, stack=True):
    """Brass and copper gears lying flat on a surface, some stacked. Returns list of objects."""
    rng = random.Random(seed)
    mats = [brass("brass"), copper(), old_brass()]
    out = []
    placed = []
    for i in range(n):
        r = rng.uniform(rmin, rmax)
        for _try in range(30):
            x = center[0] + rng.uniform(-area[0] / 2, area[0] / 2)
            y = center[1] + rng.uniform(-area[1] / 2, area[1] / 2)
            if all(math.hypot(x - px, y - py) > (r + pr) * 1.05 for px, py, pr in placed):
                break
        placed.append((x, y, r))
        th = max(0.003, r * 0.14)
        g = gear(f"{prefix}{i}", teeth=max(8, int(r * 520)), r=r, depth=th, tooth=0.14, hole=0.18,
                 spokes=(4 if r > 0.028 else 0), mat=mats[i % 3], loc=(x, y, z + th / 2 + 0.0005),
                 rot=(0, 0, rng.uniform(0, 6.28)))
        out.append(g)
        if stack and r > 0.03 and rng.random() < 0.5:
            r2 = r * rng.uniform(0.4, 0.6)
            th2 = max(0.003, r2 * 0.18)
            g2 = gear(f"{prefix}{i}s", teeth=max(8, int(r2 * 520)), r=r2, depth=th2, tooth=0.15, hole=0.25,
                      mat=mats[(i + 1) % 3], loc=(x + rng.uniform(-0.005, 0.005), y, z + th + th2 / 2 + 0.001),
                      rot=(0, 0, rng.uniform(0, 6.28)))
            out.append(g2)
    return out


def lay_flat(root, rx=90, rz=0):
    root.rotation_euler = (math.radians(rx), 0, math.radians(rz))
    bpy.context.view_layer.update()
    return root


def jar(name, loc, r=0.045, h=0.11, fill=None, seed=0):
    """Glass jar with a brass lid, optionally filled with little parts (buttons, screws, beads)."""
    x, y, z = loc
    gm = glass("jar_glass", (0.95, 0.98, 0.96), 0.03)
    j = lathe(name, [(0.0, 0.0), (r * 0.95, 0.0), (r, 0.006), (r, h * 0.85), (r * 0.82, h * 0.92), (r * 0.82, h),
                     (r * 0.78, h), (r * 0.78, h * 0.93), (r * 0.94, h * 0.84), (r * 0.94, 0.008), (0.0, 0.006)],
              seg=48, mat=gm, loc=(x, y, z))
    lathe(name + "_lid", [(0.0, h + 0.012), (r * 0.86, h + 0.012), (r * 0.88, h + 0.004), (r * 0.86, h - 0.008),
                          (r * 0.8, h - 0.008)], seg=48, mat=brass("brass"), loc=(x, y, z))
    if fill:
        rng = random.Random(seed)
        for i in range(int(fill)):
            a = rng.uniform(0, 6.28)
            rr = rng.uniform(0, r * 0.7)
            zz = z + 0.012 + (i // 9) * 0.011 + rng.uniform(0, 0.004)
            m = [paint("button_red", (0.5, 0.05, 0.03), rough=0.3, coat=0.5), brass("brass"),
                 paint("button_cream", (0.75, 0.7, 0.6), rough=0.3, coat=0.5),
                 paint("button_green", (0.05, 0.25, 0.1), rough=0.3, coat=0.5)][i % 4]
            cyl(f"{name}_bit{i}", rng.uniform(0.008, 0.012), 0.005, (x + rr * math.cos(a), y + rr * math.sin(a), zz),
                m, rot=(rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), 0), verts=16)
    return j


def wall_shelf(name, x0, x1, z, depth=0.2, back=BACK, mat=None):
    m = mat or wood("shelf_wood", "dark_wood", tint=(0.75, 0.58, 0.45))
    s = box(name, (x1 - x0, depth, 0.03), ((x0 + x1) / 2, back - depth / 2, z - 0.015), m, bevel=0.004)
    K.uv_real_size(s)
    for x in (x0 + 0.08, x1 - 0.08):
        br = box(f"{name}_br{x:.2f}", (0.025, depth * 0.85, 0.12), (x, back - depth * 0.45, z - 0.09),
                 m, bevel=0.003)
    return s


def pinned_paper(name, loc, w=0.21, h=0.28, rot=0.0, tint=(0.80, 0.74, 0.60), back=BACK, drawing=None):
    """Plain aged paper sheet pinned to the wall (no writing). drawing: optional list of polylines in
    0..1 sheet coordinates drawn as thin graphite strokes (sketches, not text)."""
    m = paint(f"paper_{name}", tint, rough=0.9, coat=0.0, var=0.06, sss=0.05)
    x, y, z = loc
    p = box(name, (w, 0.002, h), (x, back - 0.002, z), m, rot=(0, rot, 0))
    tack = sphere(name + "_tack", 0.006, (x - math.sin(rot) * h * 0.44, back - 0.006, z + math.cos(rot) * h * 0.44),
                  paint("tack_red", (0.45, 0.03, 0.03), rough=0.3, coat=0.5), scale=(1, 0.6, 1))
    if drawing:
        ink = K.mat("graphite", (0.05, 0.05, 0.07), rough=0.6)
        R = Matrix.Rotation(rot, 3, "Y")
        for i, line in enumerate(drawing):
            pts = [tuple(Vector((x, back - 0.0035, z)) + R @ Vector(((u - 0.5) * w, 0, (v - 0.5) * h))) for u, v in line]
            curve_tube(f"{name}_ink{i}", pts, 0.0007, ink, smooth=True)
    return p

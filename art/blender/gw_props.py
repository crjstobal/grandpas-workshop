"""Grandpa's Workshop: modelled props (workshop shed, door, lock, wreath, envelope, lantern dressing)."""
import math
import random

from gw import *  # noqa: F401,F403
from gw import K, bmesh, bpy, Vector, Matrix, Euler


def stained(name, tex, tint, rough_add=0.0):
    return wood(name, tex, tint=tint)


def board_set(name, x0, x1, z0, z1, y, depth, mat, parent, board_w=0.16, gap=0.006, seed=0, bevel=0.004):
    """Row of vertical boards between x0..x1 (front face at y), joined into one mesh with real-size UVs."""
    rng = random.Random(seed)
    objs = []
    n = max(1, round((x1 - x0) / board_w))
    bw = (x1 - x0) / n
    for i in range(n):
        cx = x0 + bw * (i + 0.5)
        dz = rng.uniform(-0.004, 0.004)
        b = box(f"{name}_{i}", (bw - gap, depth + rng.uniform(-0.003, 0.003), (z1 - z0) + dz),
                (cx, y + depth / 2, (z0 + z1) / 2), mat, bevel=bevel)
        b.rotation_euler = (0, rng.uniform(-0.004, 0.004), 0)
        objs.append(b)
    K.sel(*objs)
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    K.uv_real_size(o)
    o.parent = parent
    return o


def keyhole_cutter(name, loc, r=0.011, depth=0.2, rot=(math.pi / 2, 0, 0)):
    """Classic keyhole silhouette (round top + flared slot) as a cutter, axis along Y by default."""
    bm = bmesh.new()
    pts = []
    for k in range(28):
        a = math.radians(-60 + 300 * k / 27)
        pts.append((r * math.cos(a + math.pi / 2 + math.radians(30)) * 1.0, r * math.sin(a + math.pi / 2 + math.radians(30))))
    pts = [(r * math.cos(math.radians(a)), r * math.sin(math.radians(a))) for a in range(-60, 241, 10)]
    pts += [(-r * 0.75, -r * 2.6), (r * 0.75, -r * 2.6)]
    vs = [bm.verts.new((x, y, -depth / 2)) for x, y in pts]
    f = bm.faces.new(vs)
    ex = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in ex["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.z += depth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    link(o)
    o.location, o.rotation_euler = loc, rot
    return o


def scallop_plate(name, rx, rz, thick, lobes=8, amp=0.12, mat=None, parent=None, loc=(0, 0, 0)):
    """Ornate flat escutcheon in the XZ plane (faces -Y): an oval with scalloped edge, bevelled."""
    bm = bmesh.new()
    pts = []
    N = 96
    for k in range(N):
        a = 2 * math.pi * k / N
        s = 1 + amp * abs(math.cos(lobes * a / 2)) ** 2
        pts.append((rx * s * math.cos(a), rz * s * math.sin(a)))
    vs = [bm.verts.new((x, 0, z)) for x, z in pts]
    f = bm.faces.new(vs)
    ex = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in ex["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.y -= thick
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    link(o, parent)
    o.location = loc
    m = o.modifiers.new("bevel", "BEVEL")
    m.width, m.segments, m.limit_method = thick * 0.45, 3, "ANGLE"
    smooth_angle(o, 30)
    if mat:
        o.data.materials.append(mat)
    return o


def ornate_lock(name, parent, loc, scale=1.0, empty_keyhole=True):
    """Big brass rim lock (body faces -Y). loc = centre of the back face on the door surface.
    Returns (root, keyhole world position)."""
    s = scale
    root = empty(name, loc, parent)
    br = brass("lock_brass", rough=0.28)
    br2 = old_brass("lock_brass_dark")
    dark = K.mat("keyhole_dark", (0.004, 0.003, 0.002), rough=0.9)
    W, H, D = 0.24 * s, 0.17 * s, 0.045 * s
    body = box(name + "_body", (W, D, H), (0, -D / 2, 0), br, bevel=0.006 * s, parent=root)
    # raised border frame on the face
    rim = box(name + "_face", (W * 0.86, 0.008 * s, H * 0.8), (0, -D - 0.003 * s, 0), br2, bevel=0.003 * s,
              parent=root)
    inner = box(name + "_inner", (W * 0.78, 0.01 * s, H * 0.7), (0, -D - 0.005 * s, 0), br, bevel=0.004 * s,
                parent=root)
    # corner rosette screws
    for sx in (-1, 1):
        for sz in (-1, 1):
            p = (sx * W * 0.43, -D - 0.004 * s, sz * H * 0.39)
            sc = sphere(f"{name}_screw{sx}{sz}", 0.011 * s, p, br, scale=(1, 0.45, 1), parent=root, seg=24, rings=12)
            slot = box(f"{name}_slot{sx}{sz}", (0.016 * s, 0.004 * s, 0.0025 * s),
                       (p[0], p[1] - 0.004 * s, p[2]), dark, parent=root, rot=(0, math.radians(30 * sx * sz), 0))
    # escutcheon around the keyhole
    kz = -0.012 * s
    esc = scallop_plate(name + "_esc", 0.034 * s, 0.05 * s, 0.006 * s, lobes=6, amp=0.16, mat=br, parent=root,
                        loc=(0.035 * s, -D - 0.01 * s, kz))
    # a little knob (bolt thumb-turn) on the left
    kn_st = cyl(name + "_knobstem", 0.008 * s, 0.03 * s, (-0.065 * s, -D - 0.02 * s, kz), br2,
                rot=(math.pi / 2, 0, 0), verts=24, parent=root)
    kn = sphere(name + "_knob", 0.022 * s, (-0.065 * s, -D - 0.042 * s, kz), br, scale=(1, 0.8, 1), parent=root)
    # cut the keyhole through escutcheon, face plates and body
    bpy.context.view_layer.update()
    kh_world = root.matrix_world @ Vector((0.035 * s, -D - 0.016 * s, kz + 0.006 * s))
    kh_local = Vector((0.035 * s, -D - 0.016 * s, kz + 0.006 * s))
    for o in (esc, inner, rim, body):
        c = keyhole_cutter("khc", (0.035 * s, -D, kz + 0.006 * s), r=0.0095 * s, depth=0.5 * s)
        c.parent = root
        bpy.context.view_layer.update()
        boolean(o, c)
    # dark cavity behind the keyhole
    box(name + "_cavity", (0.03 * s, 0.004 * s, 0.05 * s), (0.035 * s, -D * 0.5, kz), dark, parent=root)
    # engraved scroll ring on the face (thin torus) for ornament
    t = torus(name + "_scroll", 0.045 * s, 0.0025 * s, (0.035 * s, -D - 0.011 * s, kz), br2,
              rot=(math.pi / 2, 0, 0), parent=root, seg=48, mseg=8)
    t.scale = (1.0, 1.45, 1.0)
    return root, kh_local


def strap_hinge(name, parent, loc, length=0.55, mat=None):
    """Iron strap hinge with a fleur end, lying on the door face (faces -Y)."""
    mat = mat or iron("hinge_iron")
    root = empty(name, loc, parent)
    box(name + "_strap", (length, 0.008, 0.045), (length / 2, -0.004, 0), mat, bevel=0.002, parent=root)
    sphere(name + "_end", 0.035, (length, -0.004, 0), mat, scale=(1, 0.2, 0.8), parent=root, seg=24, rings=12)
    cyl(name + "_barrel", 0.016, 0.07, (0, -0.01, 0), mat, verts=20, parent=root)
    for i in range(4):
        x = 0.06 + i * (length - 0.1) / 3
        sphere(f"{name}_nail{i}", 0.009, (x, -0.009, 0), mat, scale=(1, 0.5, 1), parent=root, seg=16, rings=8)
    return root


def plank_door(name, parent, x, w=0.95, h=1.95, y=0.0, lock_scale=1.0):
    """Chunky board door: front face at y (facing -Y), bottom at z=0, centred on x.
    Returns dict with root and keyhole position."""
    root = empty(name, (x, y, 0), parent)
    dm = wood("door_wood", "wood_cabinet_worn_long", tint=(0.95, 0.85, 0.66))
    brace_m = wood("door_brace", "wood_cabinet_worn_long", tint=(0.8, 0.7, 0.55))
    boards = board_set(name + "_boards", -w / 2, w / 2, 0.0, h, -0.055, 0.055, dm, root, board_w=0.16, gap=0.008,
                       seed=4, bevel=0.007)
    # Z brace (ledges + diagonal)
    for zz in (0.28, h - 0.3):
        b = box(f"{name}_ledge{zz:.2f}", (w * 0.9, 0.035, 0.13), (0, -0.055 - 0.0175, zz), brace_m, bevel=0.008,
                parent=root)
        K.uv_real_size(b)
    dl = math.hypot(w * 0.78, h - 0.58 - 0.13)
    ang = math.atan2(h - 0.58 - 0.13, w * 0.78)
    d = box(name + "_diag", (dl, 0.03, 0.11), (0, -0.055 - 0.015, h / 2), brace_m, bevel=0.007, parent=root,
            rot=(0, -ang, 0))
    K.uv_real_size(d)
    # hinges on the left
    for zz in (0.28, h - 0.3):
        strap_hinge(f"{name}_hinge{zz:.2f}", root, (-w / 2 + 0.01, -0.09, zz), length=0.5)
    # rim lock on the right, a ring pull above
    lock, kh_local = ornate_lock(name + "_lock", root, (w / 2 - 0.2 * lock_scale, -0.055, 0.98), scale=lock_scale)
    bpy.context.view_layer.update()
    kh = lock.matrix_world @ kh_local
    br = brass("lock_brass")
    ring_base = cyl(name + "_ringbase", 0.03, 0.012, (w / 2 - 0.2, -0.062, 1.26), br, rot=(math.pi / 2, 0, 0),
                    verts=32, parent=root)
    ring = torus(name + "_ring", 0.05, 0.007, (w / 2 - 0.2, -0.075, 1.21), br, rot=(math.radians(15), 0, 0),
                 parent=root, seg=48, mseg=12)
    bpy.context.view_layer.update()
    return {"root": root, "keyhole": kh, "lock": lock}


def round_window(name, parent, loc, r=0.38, glow=None):
    """Round window in the XZ plane (faces -Y) at loc (centre of wall face). Frame, muntins, glowing glass."""
    root = empty(name, loc, parent)
    trim = paint("trim_red", (0.36, 0.05, 0.035), rough=0.55, coat=0.1)
    prof = [(r - 0.01, -0.07), (r - 0.01, 0.03), (r + 0.09, 0.03), (r + 0.10, 0.0), (r + 0.09, -0.02),
            (r + 0.06, -0.035), (r - 0.01, -0.035)]
    fr = lathe(name + "_frame", [(a, b) for a, b in prof], seg=96, mat=trim, parent=root, rot=(math.pi / 2, 0, 0))
    gm = glow or window_glass()
    g = cyl(name + "_glass", r, 0.008, (0, 0.03, 0), gm, rot=(math.pi / 2, 0, 0), verts=64, parent=root)
    for a in (0, math.pi / 2):
        box(f"{name}_muntin{a:.1f}", (2 * r, 0.03, 0.03), (0, 0.0, 0), trim, bevel=0.005, parent=root,
            rot=(0, a, 0))
    sill = box(name + "_sill", (0.5, 0.12, 0.04), (0, -0.04, -r - 0.12), trim, bevel=0.01, parent=root)
    return root


def window_glass(name="window_glow", k=2300, strength=5.0):
    """Frosted glass lit from inside: warm emission with a soft brighter centre and frost noise."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    nt, b = m.node_tree, None
    m.use_nodes = True
    nt = m.node_tree
    b = K._bsdf(m)
    col = K.kelvin(k)
    b.inputs["Base Color"].default_value = (*col, 1)
    b.inputs["Roughness"].default_value = 0.25
    tc = nt.nodes.new("ShaderNodeTexCoord")
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "SPHERICAL"
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (2.2, 2.2, 2.2)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], grad.inputs["Vector"])
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = 40
    nt.links.new(tc.outputs["Object"], n.inputs["Vector"])
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    nt.links.new(grad.outputs["Fac"], mul.inputs[0])
    nt.links.new(n.outputs["Fac"], mul.inputs[1])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = 0.0, 0.6
    mr.inputs["To Min"].default_value, mr.inputs["To Max"].default_value = strength * 0.35, strength
    nt.links.new(mul.outputs[0], mr.inputs["Value"])
    b.inputs["Emission Color"].default_value = (*col, 1)
    nt.links.new(mr.outputs["Result"], b.inputs["Emission Strength"])
    return m


def wreath(name, parent, loc, R=0.2, seed=5):
    """Fir wreath with red berries and a red felt bow, hanging in the XZ plane (faces -Y)."""
    rng = random.Random(seed)
    root = empty(name, loc, parent)
    nm = needles_mat("needles")
    base = torus(name + "_base", R, R * 0.17, (0, 0, 0), paint("wreath_core", (0.02, 0.05, 0.02), rough=0.9),
                 rot=(math.pi / 2, 0, 0), parent=root, seg=48, mseg=12)
    from gw import _branch_mesh
    variants = []
    for v in range(3):
        key = f"wreathbranch_{v}"
        me = bpy.data.meshes.get(key) or _branch_mesh(key, seed=40 + v)
        if not me.materials:
            me.materials.append(nm)
        variants.append(me)
    n = 210
    for i in range(n):
        a = 2 * math.pi * i / n + rng.uniform(-0.05, 0.05)
        layer = i % 3  # inner, middle, outer rings of branches
        rr = R + (layer - 1) * R * 0.22 + rng.uniform(-0.02, 0.02)
        p = Vector((rr * math.cos(a), -0.02 - layer * 0.018 - rng.uniform(0, 0.015), rr * math.sin(a)))
        tang = Vector((-math.sin(a), 0, math.cos(a)))
        outw = Vector((math.cos(a), 0, math.sin(a)))
        d = (tang + outw * (layer - 1) * 0.5 + Vector((0, -rng.uniform(0.15, 0.5), 0))).normalized()
        q = Vector((1, 0, 0)).rotation_difference(d)
        L = rng.uniform(0.11, 0.16) * R / 0.2
        o = bpy.data.objects.new(f"{name}_sp{i}", variants[i % 3])
        link(o, root)
        o.matrix_basis = Matrix.Translation(p - d * L * 0.35) @ q.to_matrix().to_4x4() @ \
            Matrix.Rotation(rng.uniform(-1.2, 1.2), 4, "X") @ Matrix.Diagonal((L, L, L, 1))
    berry = paint("berry", (0.55, 0.02, 0.02), rough=0.2, coat=0.8)
    for c in range(9):
        a = 2 * math.pi * c / 9 + 0.3
        for j in range(3):
            p = (R * math.cos(a) + rng.uniform(-0.02, 0.02), -0.05 - rng.uniform(0, 0.02),
                 R * math.sin(a) + rng.uniform(-0.02, 0.02))
            sphere(f"{name}_berry{c}_{j}", 0.011 * R / 0.2, p, berry, parent=root, seg=16, rings=8)
    # pine cones (small brown ellipsoids)
    cone_m = paint("pinecone", (0.12, 0.06, 0.03), rough=0.8, coat=0.0, var=0.3)
    for a in (2.1, 3.5, 5.3):
        sphere(f"{name}_cone{a}", 0.022 * R / 0.2, (R * math.cos(a), -0.05, R * math.sin(a)), cone_m,
               scale=(0.8, 0.8, 1.3), parent=root, seg=16, rings=10, rot=(0, a, 0))
    # felt bow at the bottom: two puffy loops, a knot and two notched tails
    bow_m = felt("bow_felt", (0.55, 0.035, 0.03))
    s = R / 0.2
    bz = -R - 0.005 * s
    for sgn in (-1, 1):
        pts = []
        for k in range(17):
            a2 = 2 * math.pi * k / 16
            pts.append((sgn * (0.055 + 0.05 * math.cos(a2)) * s, -0.075, bz + 0.012 * s + 0.032 * math.sin(a2) * s))
        lp = curve_tube(f"{name}_loop{sgn}", pts, 0.014 * s, bow_m, parent=root, closed=True)
        lp.data.bevel_depth = 0.0
        lp.data.extrude = 0.0
        prof = bpy.data.curves.new(f"{name}_ribbonprof{sgn}", "CURVE")
        sp2 = prof.splines.new("POLY")
        sp2.points.add(3)
        for i2, (u, v) in enumerate([(-0.004, -0.02), (0.004, -0.02), (0.004, 0.02), (-0.004, 0.02)]):
            sp2.points[i2].co = (u * s, v * s, 0, 1)
        sp2.use_cyclic_u = True
        po = bpy.data.objects.new(f"{name}_rp{sgn}", prof)
        link(po)
        po.hide_render = True
        lp.data.bevel_mode = "OBJECT"
        lp.data.bevel_object = po
        tpts = [(sgn * 0.008 * s, -0.078, bz), (sgn * 0.03 * s, -0.08, bz - 0.06 * s), (sgn * 0.05 * s, -0.076, bz - 0.13 * s)]
        tl = curve_tube(f"{name}_tail{sgn}", tpts, 0.0, bow_m, parent=root)
        tl.data.bevel_mode = "OBJECT"
        tl.data.bevel_object = po
    sphere(f"{name}_knot", 0.02 * s, (0, -0.08, bz + 0.01 * s), bow_m, scale=(1.1, 0.7, 1.0), parent=root)
    return root


def envelope(name, parent, loc, w=0.24, h=0.16, rot_y=0.0):
    """Blank paper envelope pinned flat on a surface facing -Y (no writing). Brass tack at the top."""
    root = empty(name, loc, parent)
    root.rotation_euler = (0, rot_y, 0)
    paper = paint("paper_env", (0.80, 0.72, 0.58), rough=0.85, coat=0.0, var=0.05, sss=0.05)
    body = box(name + "_body", (w, 0.003, h), (0, -0.0015, 0), paper, bevel=0.0008, parent=root)
    # flap: a slightly raised triangle
    flap = mesh_obj(name + "_flap", [(-w / 2 + 0.003, -0.0035, h / 2 - 0.003), (w / 2 - 0.003, -0.0035, h / 2 - 0.003),
                                     (0, -0.0042, -h * 0.08)], [(0, 2, 1)], parent=root, mat=paint(
        "paper_flap", (0.76, 0.67, 0.53), rough=0.85, coat=0.0, var=0.05))
    sol = flap.modifiers.new("sol", "SOLIDIFY")
    sol.thickness = 0.0008
    # wax seal
    sphere(name + "_seal", 0.018, (0, -0.0045, -h * 0.06), paint("wax", (0.45, 0.02, 0.02), rough=0.3, coat=0.5),
           scale=(1, 0.25, 1), parent=root, seg=24, rings=12)
    sphere(name + "_tack", 0.008, (0, -0.005, h / 2 - 0.018), brass("lock_brass"), scale=(1, 0.5, 1),
           parent=root, seg=16, rings=8)
    return root


FL_STRENGTH = 10.0
LOCK_SCALE = 1.35


def workshop(name="workshop", W=3.0, D=2.6, Hw=2.15, Hr=3.15, door_x=-0.55, win_x=0.78, win_z=1.32):
    """The little wooden workshop. Front wall (gable) at y=0 facing -Y, footprint x in [-W/2, W/2],
    y in [0, D]. Returns a dict of useful anchors."""
    root = empty(name)
    wall_m = wood("wall_wood", "wood_cabinet_worn_long", tint=(1.25, 1.0, 0.8))
    trim = paint("trim_red", (0.36, 0.05, 0.035), rough=0.55, coat=0.1)
    roof_m = wood("roof_wood", "dark_wood", tint=(0.55, 0.45, 0.4))
    t = 0.1
    # front gable wall as an extruded pentagon
    pent = [(-W / 2, 0), (W / 2, 0), (W / 2, Hw), (0, Hr), (-W / 2, Hw)]
    bm = bmesh.new()
    vs = [bm.verts.new((x, 0, z)) for x, z in pent]
    f = bm.faces.new(vs)
    ex = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in ex["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.y += t
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name + "_front")
    bm.to_mesh(me)
    bm.free()
    front = bpy.data.objects.new(name + "_front", me)
    link(front, root)
    front.data.materials.append(wall_m)
    dw, dh = 0.98, 1.98
    c = box("doorcut", (dw, 1, dh * 2), (door_x, 0, 0), None)
    boolean(front, c)
    c = cyl("wincut", 0.38, 1, (win_x, 0, win_z), None, rot=(math.pi / 2, 0, 0), verts=64)
    boolean(front, c)
    K.uv_real_size(front)
    # back wall
    back = front.copy()
    back.data = front.data.copy()
    link(back, root)
    back.location = (0, D - t, 0)
    back.name = name + "_back"
    # side walls
    for sx in (-1, 1):
        sw = box(f"{name}_side{sx}", (t, D, Hw), (sx * (W / 2 - t / 2), D / 2, Hw / 2), wall_m)
        sw.parent = root
        K.uv_real_size(sw)
    # interior: a warm glow plane behind the window, a back shelf silhouette
    inner = emit("interior_glow", K.kelvin(2400), 1.2)
    box(name + "_inner_back", (W - 2 * t - 0.02, 0.02, Hw), (0, D - t - 0.02, Hw / 2), inner, parent=root)
    # base plinth (stone-ish) and corner trims
    stone = paint("stone_base", (0.22, 0.21, 0.2), rough=0.85, coat=0.0, var=0.25)
    box(name + "_plinth", (W + 0.08, D + 0.08, 0.22), (0, D / 2, 0.05), stone, bevel=0.02, parent=root)
    for sx in (-1, 1):
        box(f"{name}_corner{sx}", (0.1, 0.1, Hw + 0.02), (sx * (W / 2 + 0.01), -0.015, Hw / 2), trim, bevel=0.008,
            parent=root)
    # door frame
    for sx in (-1, 1):
        box(f"{name}_jamb{sx}", (0.09, 0.07, dh + 0.06), (door_x + sx * (dw / 2 + 0.04), -0.03, dh / 2), trim,
            bevel=0.008, parent=root)
    box(name + "_lintel", (dw + 0.3, 0.09, 0.12), (door_x, -0.04, dh + 0.06), trim, bevel=0.01, parent=root)
    # stone doorstep
    box(name + "_step", (dw + 0.35, 0.42, 0.16), (door_x, -0.22, 0.06), stone, bevel=0.025, parent=root)
    door = plank_door(name + "_door", root, door_x, w=dw - 0.02, h=dh - 0.03, y=0.035, lock_scale=LOCK_SCALE)
    win = round_window(name + "_win", root, (win_x, 0, win_z))
    # roof: two slabs + fascia + snow
    ov_f, ov_s = 0.32, 0.28
    half = W / 2 + ov_s
    slope = math.atan2(Hr - Hw, W / 2)
    L = half / math.cos(slope)
    snow_m = snow_mat()
    for sx in (-1, 1):
        cx = sx * half / 2
        cz = Hw + (Hr - Hw) * (1 - (half / 2) / (W / 2)) + 0.05
        slab = box(f"{name}_roof{sx}", (L + 0.04, D + 2 * ov_f, 0.08), (cx, D / 2, cz), roof_m, bevel=0.01,
                   rot=(0, sx * slope, 0))
        slab.parent = root
        K.uv_real_size(slab)
        # fascia boards on the gable edge
        fz = cz - 0.02
        fas = box(f"{name}_fascia{sx}", (L + 0.06, 0.05, 0.16), (cx, -ov_f - 0.02, fz), trim, bevel=0.01,
                  rot=(0, sx * slope, 0))
        fas.parent = root
        # snow slab: thick, rounded and lumpy, slightly overhanging the eave
        sn = box(f"{name}_snowroof{sx}", (L + 0.16, D + 2 * ov_f + 0.14, 0.26), (0, 0, 0), snow_m, bevel=0.11)
        sn.modifiers["bevel"].segments = 5
        sn.location = (cx + sx * 0.04, D / 2, cz + 0.14)
        sn.rotation_euler = (0, sx * slope, 0)
        sub = sn.modifiers.new("sub", "SUBSURF")
        sub.levels = sub.render_levels = 3
        dm = sn.modifiers.new("disp", "DISPLACE")
        tx = bpy.data.textures.get("snowroof") or bpy.data.textures.new("snowroof", "CLOUDS")
        tx.noise_scale = 0.45
        dm.texture, dm.strength, dm.texture_coords = tx, 0.07, "GLOBAL"
        sn.parent = root
        # icicles hanging from the low eave (side)
        rng = random.Random(10 + sx)
        ice = K.mat("ice", (0.8, 0.9, 1.0), rough=0.05, transmission=0.9, ior=1.31)
        ex_ = sx * (half - 0.02)
        ez = Hw + (Hr - Hw) * (1 - half / (W / 2)) - 0.0
        for i in range(16):
            yy = -ov_f + 0.1 + i * (D + 2 * ov_f - 0.2) / 15 + rng.uniform(-0.04, 0.04)
            ln = rng.uniform(0.06, 0.26)
            cyl(f"{name}_icicle{sx}_{i}", 0.018, ln, (ex_, yy, ez - ln / 2 + 0.03), ice, verts=10, r2=0.001,
                parent=root, rot=(math.pi, 0, 0))
    # ridge snow cap
    rc = box(name + "_ridge_snow", (0.42, D + 2 * ov_f + 0.12, 0.22), (0, D / 2, Hr + 0.22), snow_m, bevel=0.1)
    rc.modifiers["bevel"].segments = 4
    rc.parent = root
    # stovepipe chimney (copper) on the right slope with a snow cap
    cu = copper()
    px, py = 0.85, D * 0.6
    pz = Hw + (Hr - Hw) * (1 - px / (W / 2))
    cyl(name + "_pipe", 0.075, 1.0, (px, py, pz + 0.35), cu, verts=32, parent=root)
    cyl(name + "_pipecap", 0.16, 0.12, (px, py, pz + 0.95), cu, verts=32, r2=0.02, parent=root)
    sc = sphere(name + "_pipesnow", 0.15, (px, py, pz + 1.0), snow_m, scale=(1, 1, 0.45), parent=root)
    # window sill snow
    s2 = box(name + "_sill_snow", (0.5, 0.13, 0.05), (win_x, -0.04, win_z - 0.38 - 0.1), snow_m, bevel=0.024)
    s2.modifiers["bevel"].segments = 4
    s2.parent = root
    # fairy lights along the gable fascia
    anchors = []
    for i in range(9):
        t = i / 8
        x = -half + 2 * half * t
        z = Hw + (Hr - Hw) * (1 - abs(x) / (W / 2)) - 0.06
        anchors.append((x, -ov_f - 0.06, z))
    fl = fairy_lights(name + "_fl", anchors, sag=0.07, per_span=4, parent=root, strength=float(FL_STRENGTH))
    return {"root": root, "door": door, "door_x": door_x, "fl": fl, "win": (win_x, 0, win_z), "W": W, "D": D, "Hw": Hw,
            "Hr": Hr, "step_top": 0.14}


def snow_ground(name="ground", size=(40, 40), res=220, path=None, seed=2, z0=0.0, mounds=0.12):
    """Gently rolling snow field. path: list of (x, y) points of a trodden trail (a soft dip)."""
    from mathutils import noise
    nx = ny = res
    sx, sy = size
    verts, faces = [], []
    pts = path or []
    for j in range(ny + 1):
        for i in range(nx + 1):
            x = -sx / 2 + sx * i / nx
            y = -sy / 2 + sy * j / ny + sy / 2 - 8
            n = noise.noise(Vector((x * 0.25 + seed, y * 0.25, 0))) * mounds + \
                noise.noise(Vector((x * 1.3, y * 1.3, seed))) * 0.02
            dip = 0.0
            for k in range(len(pts) - 1):
                a, b = Vector((*pts[k], 0)), Vector((*pts[k + 1], 0))
                p = Vector((x, y, 0))
                ab = b - a
                tt = max(0, min(1, (p - a).dot(ab) / ab.length_squared))
                dd = (a + ab * tt - p).length
                dip = max(dip, max(0.0, 1 - (dd / 0.55) ** 2))
            z = z0 + n - dip * 0.07 + dip * noise.noise(Vector((x * 6, y * 6, 3))) * 0.025
            verts.append((x, y, z))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    o = mesh_obj(name, verts, faces, smooth=True, mat=snow_mat())
    return o


def stars_and_moon(center=(0, 60, 0), moon_dir=(-0.45, 1.0, 0.42), n=900, seed=4):
    """Far emissive moon disc + star point cloud on a big hemisphere behind the scene."""
    rng = random.Random(seed)
    d = Vector(moon_dir).normalized()
    moon_m = emit("moon", (0.85, 0.9, 1.0), 6.0)
    m = sphere("moon", 3.2, tuple(d * 150), moon_m)
    verts = []
    for _ in range(n):
        az = rng.uniform(-1.3, 1.3)
        el = rng.uniform(0.12, 1.2)
        v = Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el))) * 180
        verts.append(tuple(v))
    o = mesh_obj("stars", verts, [])
    ng = bpy.data.node_groups.new("stars_gn", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    gi, go = ng.nodes.new("NodeGroupInput"), ng.nodes.new("NodeGroupOutput")
    m2p = ng.nodes.new("GeometryNodeMeshToPoints")
    rv = ng.nodes.new("FunctionNodeRandomValue")
    rv.inputs[2].default_value, rv.inputs[3].default_value = 0.08, 0.28
    sm = ng.nodes.new("GeometryNodeSetMaterial")
    sm.inputs["Material"].default_value = emit("star", (0.9, 0.93, 1.0), 12.0)
    ng.links.new(gi.outputs[0], m2p.inputs["Mesh"])
    ng.links.new(rv.outputs[1], m2p.inputs["Radius"])
    ng.links.new(m2p.outputs[0], sm.inputs["Geometry"])
    ng.links.new(sm.outputs[0], go.inputs[0])
    o.modifiers.new("gn", "NODES").node_group = ng
    return m, o


def night_sky(top=(0.004, 0.008, 0.03), horizon=(0.03, 0.05, 0.11), strength=1.0):
    """World: vertical gradient night sky (lights the scene with a cool ambient)."""
    w = bpy.context.scene.world
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (*horizon, 1)
    ramp.color_ramp.elements[1].position = 0.55
    ramp.color_ramp.elements[1].color = (*top, 1)
    # Generated Z in world: -1..1 mapped 0..1 -> remap 0.5..1
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = 0.0, 0.8
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    return w


def fairy_lights(name, anchors, sag=0.06, per_span=5, colors=None, strength=8.0, r=0.012, parent=None, seed=3,
                 wire_r=0.003, lit=True):
    """String of bulbs drooping between anchor points (catenary-ish). colors: list of rgb. lit=False ->
    unlit glass bulbs (same geometry, so lit/unlit renders match). Returns the bulb positions."""
    rng = random.Random(seed)
    colors = colors or [K.kelvin(2300), K.kelvin(2600), (1.0, 0.55, 0.15), (1.0, 0.25, 0.12), (1.0, 0.8, 0.4)]
    pts, bulbs = [], []
    for a, b in zip(anchors[:-1], anchors[1:]):
        a, b = Vector(a), Vector(b)
        n = 12
        for i in range(n):
            t = i / n
            p = a.lerp(b, t)
            p.z -= sag * 4 * t * (1 - t)
            pts.append(tuple(p))
        for k in range(per_span):
            t = (k + 0.5) / per_span
            p = a.lerp(b, t)
            p.z -= sag * 4 * t * (1 - t) + r * 1.2
            bulbs.append(p)
    pts.append(tuple(anchors[-1]))
    wire = curve_tube(name + "_wire", pts, wire_r, K.mat("fl_wire", (0.02, 0.03, 0.02), rough=0.5), parent=parent,
                      smooth=False)
    mats = []
    for i, c in enumerate(colors):
        if lit:
            mats.append(emit(f"fl_bulb_{i}", c, strength))
        else:
            mats.append(K.mat(f"fl_bulb_off_{i}", tuple(0.12 + 0.35 * x for x in c), rough=0.12, transmission=0.5))
    for i, p in enumerate(bulbs):
        sphere(f"{name}_b{i}", r, tuple(p), mats[rng.randrange(len(mats))], scale=(1, 1, 1.35), parent=parent,
               seg=16, rings=8)
    return bulbs

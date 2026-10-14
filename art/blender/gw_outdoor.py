"""Grandpa's Workshop: outdoor props shared by garden.py, roof.py and beacon.py.

Frost dusting for Jingle, a deep snowy window ledge, frosted window glass, distant snowy hills, a stone
viaduct, Grandpa's little toy-like train, a brick chimney with soft volumetric smoke, and the golden
beacon star. Units: metres, Z up. Everything is procedural except the Poly Haven brick texture.
"""
import math
import random

from gw import *  # noqa: F401,F403
from gw import K, bmesh, bpy, Vector, Matrix, Euler, _blob
from gw_pip import pip, pip_meshes, _frost_mat, _shell


# ------------------------------------------------------------------ Jingle with frost
def frost_dusting(root, seed=7, step=0.0032, p=0.55, rmin=0.0012, rmax=0.0038, pads=True):
    """Dust of frost beads on every upward-facing surface of Jingle (ray cast straight down onto his
    meshes, so nothing floats). Built while Jingle sits at the origin; parented to root. Eyes stay clear."""
    rng = random.Random(seed)
    objs = pip_meshes(root)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    lo, hi = K.bbox(objs)
    mine = set(o.name for o in objs)
    sc = bpy.context.scene
    hits = []
    nx = int((hi.x - lo.x) / step) + 1
    ny = int((hi.y - lo.y) / step) + 1
    for i in range(nx):
        for j in range(ny):
            x = lo.x + i * step + rng.uniform(-step * 0.4, step * 0.4)
            y = lo.y + j * step + rng.uniform(-step * 0.4, step * 0.4)
            ok, loc, nrm, _i, ob, _m = sc.ray_cast(dg, Vector((x, y, hi.z + 0.05)), Vector((0, 0, -1)))
            if not ok or ob.name not in mine or nrm.z < 0.5:
                continue
            if "eye" in ob.name or "slot" in ob.name or "hole" in ob.name:
                continue
            hits.append((loc.copy(), nrm.copy(), ob.name))
    bm = bmesh.new()
    for loc, nrm, _n in hits:
        if rng.random() > p * (0.5 + 0.5 * nrm.z):
            continue
        r = rng.uniform(rmin, rmax)
        c = loc + nrm * (r * 0.35)
        M = Matrix.Translation(c) @ Matrix.Diagonal((r, r, r * rng.uniform(0.55, 0.9), 1))
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0, matrix=M)
    me = bpy.data.meshes.new(root.name + "_frostdust")
    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = True
    o = bpy.data.objects.new(root.name + "_frostdust", me)
    link(o, root)
    o.data.materials.append(_frost_mat())
    if pads and hits:
        # two soft snow caps: the highest point of the head and of the back
        fm = _frost_mat()
        for key in ("_head", "_body"):
            cand = [h for h in hits if h[2].endswith(key)]
            if not cand:
                continue
            loc, nrm, _n = max(cand, key=lambda h: h[0].z)
            s = 0.011 if key == "_head" else 0.016
            b = _blob(root.name + "_snowcap" + key, (s, s * 0.85, s * 0.35), fm, rng)
            b.location = loc + nrm * s * 0.12
            b.parent = root
    return o


def jingle(name, pose, loc, rot_z, frost=True, seed=7):
    """Jingle built at the origin, frosted (sleep and cold poses), then moved to loc / rot_z."""
    r = pip(name, pose, (0, 0, 0), rot_z=0.0)
    if frost and pose in ("sleep", "cold"):
        if pose == "sleep":
            head = bpy.data.objects[name + "_head"]
            hg = bpy.data.objects[name + "_headg"]
            c = head.matrix_world.translation + Vector((0, 0.006, 0.05))
            _shell(name + "_frosthead", head, tuple(c), 0.032, _frost_mat(), hg, grow=1.03)
        frost_dusting(r, seed=seed)
    r.location = loc
    r.rotation_euler = (0, 0, rot_z)
    bpy.context.view_layer.update()
    return r


def silhouette_px(sc, cam, objs, w=1920, h=1080):
    """Exact pixel bbox (x0, y0, x1, y1) of the evaluated vertices of objs seen from cam."""
    from bpy_extras.object_utils import world_to_camera_view
    dg = bpy.context.evaluated_depsgraph_get()
    xs, ys = [], []
    for o in objs:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        for v in me.vertices:
            p = world_to_camera_view(sc, cam, ev.matrix_world @ v.co)
            xs.append(p.x * w)
            ys.append((1 - p.y) * h)
        ev.to_mesh_clear()
    return min(xs), min(ys), max(xs), max(ys)


# ------------------------------------------------------------------ window dressing
def frost_glass_disc(name, loc, r, parent=None):
    """Thin disc just in front of a round window pane: clear in the middle, feathery frost creeping in
    from the rim (radial mask x noise). Faces -Y."""
    m = bpy.data.materials.get(name + "_m")
    if m is None:
        m = bpy.data.materials.new(name + "_m")
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        fr = nt.nodes.new("ShaderNodeBsdfPrincipled")
        fr.inputs["Base Color"].default_value = (0.85, 0.92, 1.0, 1)
        fr.inputs["Roughness"].default_value = 0.5
        fr.inputs["Subsurface Weight"].default_value = 0.3
        fr.inputs["Emission Color"].default_value = (*K.kelvin(2600), 1)
        fr.inputs["Emission Strength"].default_value = 0.6  # the frost catches the glow from inside
        tc = nt.nodes.new("ShaderNodeTexCoord")
        ln = nt.nodes.new("ShaderNodeVectorMath")
        ln.operation = "LENGTH"
        nt.links.new(tc.outputs["Object"], ln.inputs[0])
        rad = nt.nodes.new("ShaderNodeMapRange")
        rad.inputs["From Min"].default_value, rad.inputs["From Max"].default_value = r * 0.55, r * 0.98
        nt.links.new(ln.outputs["Value"], rad.inputs["Value"])
        n = nt.nodes.new("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = 28.0
        n.inputs["Detail"].default_value = 8.0
        n.inputs["Roughness"].default_value = 0.65
        nt.links.new(tc.outputs["Object"], n.inputs["Vector"])
        add = nt.nodes.new("ShaderNodeMath")
        add.operation = "ADD"
        nt.links.new(rad.outputs["Result"], add.inputs[0])
        nt.links.new(n.outputs["Fac"], add.inputs[1])
        mask = nt.nodes.new("ShaderNodeMapRange")
        mask.inputs["From Min"].default_value, mask.inputs["From Max"].default_value = 1.05, 1.45
        mask.inputs["To Max"].default_value = 0.9
        nt.links.new(add.outputs[0], mask.inputs["Value"])
        mix = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(mask.outputs["Result"], mix.inputs["Fac"])
        nt.links.new(tr.outputs[0], mix.inputs[1])
        nt.links.new(fr.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs["Surface"])
    d = cyl(name, r, 0.001, loc, m, rot=(math.pi / 2, 0, 0), verts=64, parent=parent)
    d.visible_shadow = False
    return d


def snow_slab(name, size, loc, rot=(0, 0, 0), bevel=0.03, disp=0.02, noise=0.18, parent=None):
    """Soft lumpy snow cushion (bevelled, subdivided, cloud-displaced box)."""
    sm = snow_mat()
    s = box(name, size, loc, sm, bevel=bevel, rot=rot)
    s.modifiers["bevel"].segments = 4
    sub = s.modifiers.new("sub", "SUBSURF")
    sub.levels = sub.render_levels = 2
    dm = s.modifiers.new("disp", "DISPLACE")
    tx = bpy.data.textures.get(name + "_tx") or bpy.data.textures.new(name + "_tx", "CLOUDS")
    tx.noise_scale = noise
    dm.texture, dm.strength, dm.texture_coords = tx, disp, "GLOBAL"
    if parent is not None:
        s.parent = parent
    return s


def icicles(name, x0, x1, y, z, n, rng, lmin=0.03, lmax=0.14, r=0.008, parent=None):
    ice = K.mat("ice", (0.8, 0.9, 1.0), rough=0.05, transmission=0.9, ior=1.31)
    out = []
    for i in range(n):
        x = x0 + (x1 - x0) * (i + rng.uniform(0.15, 0.85)) / n
        ln = rng.uniform(lmin, lmax) * (1.0 if rng.random() > 0.3 else 0.45)
        out.append(cyl(f"{name}{i}", r * rng.uniform(0.7, 1.2), ln, (x, y, z - ln / 2 + 0.004), ice, verts=10,
                       r2=0.0006, rot=(math.pi, 0, 0), parent=parent))
    return out


# ------------------------------------------------------------------ distance
def hills(name, x0, x1, y0, y1, res=(180, 90), seed=3, base=0.0, amp=14.0, rise=0.12, valley=None, z_edge=-2.0):
    """Big rolling snowy hills from y0 (near) to y1 (far). amp = hill height, rise = how much the land climbs
    with distance (m per m). valley = (x_center, width, depth): a soft trough along y for the railway."""
    from mathutils import noise
    nx, ny = res
    verts, faces = [], []
    for j in range(ny + 1):
        for i in range(nx + 1):
            x = x0 + (x1 - x0) * i / nx
            y = y0 + (y1 - y0) * (j / ny) ** 1.4
            t = (y - y0) / (y1 - y0)
            n = noise.fractal(Vector((x * 0.012 + seed, y * 0.012, 0.3)), 0.6, 2.0, 4)
            z = base + (y - y0) * rise + amp * (0.5 + 0.5 * n) * min(1.0, t * 3.0)
            if valley:
                vx, vw, vd = valley
                z -= vd * math.exp(-((x - vx) / vw) ** 2) * min(1.0, t * 4)
            if j == 0:
                z = z_edge
            verts.append((x, y, z))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    return mesh_obj(name, verts, faces, smooth=True, mat=snow_mat())


def far_forest(name, pts, seed=9, hmin=6.0, hmax=12.0, mat=None):
    """Distant fir silhouettes (dozens of pixels at most): stacked cones merged into one mesh."""
    rng = random.Random(seed)
    m = mat or paint("far_fir", (0.02, 0.05, 0.035), rough=0.9, coat=0.0, var=0.3)
    bm = bmesh.new()
    for (x, y, z) in pts:
        h = rng.uniform(hmin, hmax)
        for k, (f0, f1, rr) in enumerate(((0.05, 0.55, 0.30), (0.35, 0.8, 0.22), (0.6, 1.0, 0.14))):
            M = Matrix.Translation((x, y, z + h * (f0 + f1) / 2)) @ Matrix.Rotation(rng.uniform(0, 6.3), 4, "Z")
            bmesh.ops.create_cone(bm, cap_ends=True, segments=7, radius1=h * rr, radius2=0.0,
                                  depth=h * (f1 - f0), matrix=M)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    link(o)
    o.data.materials.append(m)
    return o


def viaduct(name, n=7, span=7.0, h=10.0, w=3.2, loc=(0, 0, 0), rot_z=0.0):
    """Stone railway viaduct: a long wall pierced by n round-topped arches, a parapet and snow on the deck.
    Built along local X centred on loc (bottom at loc.z). Returns (root, deck_top_z_local, length)."""
    root = empty(name, loc)
    root.rotation_euler = (0, 0, rot_z)
    st = paint("viaduct_stone", (0.30, 0.29, 0.28), rough=0.9, coat=0.0, var=0.25)
    L = n * span
    wall = box(name + "_wall", (L, w, h), (0, 0, h / 2), st)
    ar = span * 0.36
    for i in range(n):
        x = -L / 2 + span * (i + 0.5)
        zc = h - 1.6 - ar
        c1 = cyl("arch_c", ar, w * 3, (x, 0, zc), None, rot=(math.pi / 2, 0, 0), verts=40)
        boolean(wall, c1)
        c2 = box("arch_b", (2 * ar, w * 3, zc + 2), (x, 0, (zc - 2) / 2), None)
        boolean(wall, c2)
    wall.parent = root
    box(name + "_cornice", (L + 0.4, w + 0.5, 0.35), (0, 0, h - 0.1), st, bevel=0.04, parent=root)
    for sy in (-1, 1):
        box(f"{name}_parapet{sy}", (L, 0.3, 0.6), (0, sy * (w / 2 + 0.05), h + 0.35), st, parent=root)
    sn = snow_slab(name + "_snow", (L, w + 0.2, 0.18), (0, 0, h + 0.12), bevel=0.06, disp=0.06, noise=1.0,
                   parent=root)
    for sy in (-1, 1):
        snow_slab(f"{name}_psnow{sy}", (L, 0.4, 0.14), (0, sy * (w / 2 + 0.05), h + 0.66), bevel=0.05, disp=0.04,
                  noise=1.0, parent=root)
    return root, h + 0.2, L


def toy_train(name, loc=(0, 0, 0), rot_z=0.0, cars=2, head_strength=60.0, beam=0.0, s=1.0):
    """Grandpa's little steam train: red loco with brass bands, tender and lit carriages. Faces +X (headlight
    at the +X end). beam > 0 adds a soft emissive headlight cone of that length (m). s = uniform scale."""
    root = empty(name, loc)
    root.rotation_euler = (0, 0, rot_z)
    red = enamel("train_red", (0.55, 0.05, 0.03))
    dark = paint("train_dark", (0.03, 0.03, 0.035), rough=0.5, coat=0.2)
    br = brass("train_brass")
    win = emit("train_window", K.kelvin(2300), 6.0)
    lamp = emit("train_lamp", K.kelvin(3200), head_strength)
    parts = []
    # loco
    parts.append(cyl(name + "_boiler", 0.55, 2.6, (0.6, 0, 1.35), red, rot=(0, math.pi / 2, 0), verts=32))
    parts.append(cyl(name + "_smokebox", 0.57, 0.5, (1.95, 0, 1.35), dark, rot=(0, math.pi / 2, 0), verts=32))
    for bx in (-0.3, 0.5, 1.3):
        parts.append(cyl(f"{name}_band{bx}", 0.565, 0.07, (bx, 0, 1.35), br, rot=(0, math.pi / 2, 0), verts=32))
    parts.append(cyl(name + "_stack", 0.17, 0.75, (1.9, 0, 2.15), dark, verts=20, r2=0.24))
    parts.append(sphere(name + "_dome", 0.24, (0.9, 0, 1.9), br, scale=(1, 1, 0.8)))
    parts.append(box(name + "_cab", (1.3, 1.5, 1.7), (-1.15, 0, 1.75), red, bevel=0.04))
    parts.append(box(name + "_cabroof", (1.55, 1.7, 0.12), (-1.15, 0, 2.65), dark, bevel=0.03))
    for sy in (-1, 1):
        parts.append(box(f"{name}_cabwin{sy}", (0.55, 0.04, 0.5), (-1.05, sy * 0.76, 2.05), win))
    parts.append(box(name + "_frame", (4.2, 1.3, 0.3), (0.25, 0, 0.7), dark))
    for i, x in enumerate((-1.3, -0.3, 0.7, 1.7)):
        for sy in (-1, 1):
            parts.append(cyl(f"{name}_wheel{i}{sy}", 0.42 if 0 < i < 3 else 0.32, 0.12,
                             (x, sy * 0.62, 0.45 if 0 < i < 3 else 0.35), dark, rot=(math.pi / 2, 0, 0), verts=24))
    parts.append(cyl(name + "_lamp", 0.16, 0.12, (2.25, 0, 1.95), lamp, rot=(0, math.pi / 2, 0), verts=20))
    parts.append(box(name + "_cow", (0.4, 1.2, 0.4), (2.35, 0, 0.55), red, rot=(0, math.radians(30), 0)))
    # tender + carriages
    parts.append(box(name + "_tender", (2.0, 1.5, 1.3), (-2.95, 0, 1.25), red, bevel=0.04))
    x = -4.2
    for c in range(cars):
        cx = x - 2.4
        parts.append(box(f"{name}_car{c}", (4.4, 1.7, 1.8), (cx, 0, 1.6), red, bevel=0.05))
        parts.append(box(f"{name}_carroof{c}", (4.6, 1.85, 0.16), (cx, 0, 2.58), dark, bevel=0.06))
        parts.append(box(f"{name}_carbase{c}", (4.2, 1.3, 0.3), (cx, 0, 0.6), dark))
        for k in range(4):
            for sy in (-1, 1):
                parts.append(box(f"{name}_carwin{c}{k}{sy}", (0.62, 0.04, 0.6), (cx - 1.5 + k, sy * 0.86, 1.8), win))
        for wx in (-1.4, 1.4):
            for sy in (-1, 1):
                parts.append(cyl(f"{name}_cw{c}{wx}{sy}", 0.32, 0.12, (cx + wx, sy * 0.62, 0.35), dark,
                                 rot=(math.pi / 2, 0, 0), verts=20))
        # a cap of snow on each roof: the train is stuck in it
        sl = snow_slab(f"{name}_carsnow{c}", (4.5, 1.8, 0.16), (cx, 0, 2.72), bevel=0.07, disp=0.05, noise=0.6)
        parts.append(sl)
        x = cx - 2.35
    parts.append(snow_slab(name + "_cabsnow", (1.5, 1.6, 0.14), (-1.15, 0, 2.77), bevel=0.06, disp=0.04, noise=0.6))
    for p in parts:
        p.parent = root
    if beam > 0:
        b = light_beam(name + "_beam", length=beam, r0=0.15, r1=beam * 0.22, strength=1.2, k=3400)
        b.parent = root
        b.location = (2.3, 0, 1.95)
        b.rotation_euler = (0, math.pi / 2, 0)
    root.scale = (s, s, s)
    return root


def light_beam(name, length=10.0, r0=0.1, r1=2.0, strength=1.0, k=2800, mat=None):
    """Soft fake volumetric beam: an open cone along +Z whose emission fades with length and towards its
    silhouette edges (layer weight), mixed with transparency. Cheap, no volume render."""
    m = mat or bpy.data.materials.get(f"beam_{k}_{strength}")
    if m is None:
        m = bpy.data.materials.new(f"beam_{k}_{strength}")
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = (*K.kelvin(k), 1)
        add = nt.nodes.new("ShaderNodeAddShader")
        lw = nt.nodes.new("ShaderNodeLayerWeight")
        lw.inputs["Blend"].default_value = 0.5
        inv = nt.nodes.new("ShaderNodeMath")
        inv.operation = "SUBTRACT"
        inv.inputs[0].default_value = 1.0
        nt.links.new(lw.outputs["Facing"], inv.inputs[1])
        pw = nt.nodes.new("ShaderNodeMath")
        pw.operation = "POWER"
        pw.inputs[1].default_value = 2.0
        nt.links.new(inv.outputs[0], pw.inputs[0])
        tc = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(tc.outputs["Generated"], sep.inputs["Vector"])
        fade = nt.nodes.new("ShaderNodeMapRange")
        fade.inputs["From Min"].default_value, fade.inputs["From Max"].default_value = 0.0, 1.0
        fade.inputs["To Min"].default_value, fade.inputs["To Max"].default_value = 1.0, 0.0
        nt.links.new(sep.outputs["Z"], fade.inputs["Value"])
        fp = nt.nodes.new("ShaderNodeMath")
        fp.operation = "POWER"
        fp.inputs[1].default_value = 1.6
        nt.links.new(fade.outputs["Result"], fp.inputs[0])
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        nt.links.new(pw.outputs[0], mul.inputs[0])
        nt.links.new(fp.outputs[0], mul.inputs[1])
        mul2 = nt.nodes.new("ShaderNodeMath")
        mul2.operation = "MULTIPLY"
        mul2.inputs[1].default_value = strength
        nt.links.new(mul.outputs[0], mul2.inputs[0])
        nt.links.new(mul2.outputs[0], em.inputs["Strength"])
        nt.links.new(tr.outputs[0], add.inputs[0])
        nt.links.new(em.outputs[0], add.inputs[1])
        nt.links.new(add.outputs[0], out.inputs["Surface"])
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=48, radius1=r0, radius2=r1, depth=length,
                          matrix=Matrix.Translation((0, 0, length / 2)))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for f in me.polygons:
        f.use_smooth = True
    o = bpy.data.objects.new(name, me)
    link(o)
    o.data.materials.append(m)
    o.visible_shadow = False
    try:
        o.visible_diffuse = o.visible_glossy = False
    except AttributeError:
        pass
    return o


# ------------------------------------------------------------------ chimney and smoke
def brick_chimney(name, loc, size=(0.55, 0.45), h=1.6, parent=None):
    """Brick chimney stack (Poly Haven red_brick_03, real-size UVs): loc = bottom centre (buried in the roof),
    stone crown, a short clay pot and a snow cap. Returns (root, top of the pot)."""
    root = empty(name, loc, parent)
    bm_ = wood("chimney_brick", "red_brick_03", tint=(0.9, 0.8, 0.75))
    sx, sy = size
    stack = box(name + "_stack", (sx, sy, h), (0, 0, h / 2), bm_, bevel=0.01, parent=root)
    K.uv_real_size(stack)
    stone = paint("chimney_stone", (0.30, 0.29, 0.27), rough=0.85, coat=0.0, var=0.2)
    box(name + "_crown", (sx + 0.1, sy + 0.1, 0.08), (0, 0, h + 0.04), stone, bevel=0.012, parent=root)
    band = box(name + "_band", (sx + 0.04, sy + 0.04, 0.06), (0, 0, h - 0.22), bm_, bevel=0.008, parent=root)
    K.uv_real_size(band)
    clay = paint("chimney_pot", (0.42, 0.18, 0.09), rough=0.75, coat=0.0, var=0.2)
    pot = lathe(name + "_pot", [(0.11, 0.0), (0.12, 0.02), (0.10, 0.22), (0.12, 0.25), (0.12, 0.28), (0.095, 0.28),
                                (0.085, 0.05)], seg=40, mat=clay, parent=root, loc=(0, 0, h + 0.08))
    snow_slab(name + "_snowcap", (sx + 0.1, sy + 0.12, 0.07), (0, 0, h + 0.12), bevel=0.03, disp=0.015, parent=root)
    return root, Vector(loc) + Vector((0, 0, h + 0.36))


def smoke_mat(name="smoke", density=1.2, color=(0.86, 0.89, 0.95), glow=0.025):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (*color, 1)
    vol.inputs["Anisotropy"].default_value = 0.3
    vol.inputs["Absorption Color"].default_value = (0.9, 0.92, 0.95, 1)  # scatter, barely absorb: soft pale smoke
    vol.inputs["Emission Color"].default_value = (0.55, 0.62, 0.8, 1)    # a faint moonlit glow so it reads on the sky
    tc = nt.nodes.new("ShaderNodeTexCoord")
    ln = nt.nodes.new("ShaderNodeVectorMath")
    ln.operation = "LENGTH"
    nt.links.new(tc.outputs["Object"], ln.inputs[0])
    fall = nt.nodes.new("ShaderNodeMapRange")
    fall.inputs["From Min"].default_value, fall.inputs["From Max"].default_value = 0.35, 1.0
    fall.inputs["To Min"].default_value, fall.inputs["To Max"].default_value = 1.0, 0.0
    nt.links.new(ln.outputs["Value"], fall.inputs["Value"])
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = 2.2
    n.inputs["Detail"].default_value = 6.0
    n.inputs["Roughness"].default_value = 0.6
    nt.links.new(tc.outputs["Object"], n.inputs["Vector"])
    nm = nt.nodes.new("ShaderNodeMapRange")
    nm.inputs["From Min"].default_value, nm.inputs["From Max"].default_value = 0.42, 0.72
    nt.links.new(n.outputs["Fac"], nm.inputs["Value"])
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    nt.links.new(fall.outputs["Result"], mul.inputs[0])
    nt.links.new(nm.outputs["Result"], mul.inputs[1])
    oi = nt.nodes.new("ShaderNodeObjectInfo")  # per-puff density fades up the plume via the object's alpha
    mul2 = nt.nodes.new("ShaderNodeMath")
    mul2.operation = "MULTIPLY"
    nt.links.new(mul.outputs[0], mul2.inputs[0])
    nt.links.new(oi.outputs["Alpha"], mul2.inputs[1])
    mul3 = nt.nodes.new("ShaderNodeMath")
    mul3.operation = "MULTIPLY"
    mul3.inputs[1].default_value = density
    nt.links.new(mul2.outputs[0], mul3.inputs[0])
    nt.links.new(mul3.outputs[0], vol.inputs["Density"])
    em = nt.nodes.new("ShaderNodeMath")
    em.operation = "MULTIPLY"
    em.inputs[1].default_value = glow
    nt.links.new(mul3.outputs[0], em.inputs[0])
    nt.links.new(em.outputs[0], vol.inputs["Emission Strength"])
    nt.links.new(vol.outputs[0], out.inputs["Volume"])
    return m


def smoke_plume(name, base, n=9, rise=2.6, drift=(1.4, 0.3), r0=0.16, r1=0.75, seed=4, density=1.2):
    """Soft rising smoke: n overlapping volume puffs drifting with the wind, growing and thinning upward."""
    rng = random.Random(seed)
    m = smoke_mat(density=density)
    out = []
    for i in range(n):
        t = i / (n - 1)
        p = Vector(base) + Vector((drift[0] * t ** 1.5, drift[1] * t, rise * t))
        r = r0 + (r1 - r0) * t ** 1.1
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
        me = bpy.data.meshes.new(f"{name}{i}")
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(f"{name}{i}", me)
        link(o)
        o.data.materials.append(m)
        o.location = p + Vector((rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), 0))
        o.scale = (r * rng.uniform(1.0, 1.3), r, r * rng.uniform(0.8, 1.0))
        o.rotation_euler = (rng.uniform(0, 3), rng.uniform(0, 3), rng.uniform(0, 3))
        o.color = (1, 1, 1, (1.0 - 0.75 * t) * (0.55 if i == 0 else 1.0))
        o.visible_shadow = False
        out.append(o)
    return out


# ------------------------------------------------------------------ the beacon star
def star_mesh(name, R=0.5, r=0.22, depth=0.16, points=5, mat=None):
    """Classic faceted 3D star in the XZ plane (faces -Y): a bipyramid over a star polygon."""
    bm = bmesh.new()
    ring = []
    for k in range(points * 2):
        a = math.pi / 2 + math.pi * k / points
        rr = R if k % 2 == 0 else r
        ring.append(bm.verts.new((rr * math.cos(a), 0, rr * math.sin(a))))
    f = bm.verts.new((0, -depth, 0))
    b = bm.verts.new((0, depth, 0))
    n = len(ring)
    for k in range(n):
        bm.faces.new((ring[k], ring[(k + 1) % n], f))
        bm.faces.new((ring[(k + 1) % n], ring[k], b))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    link(o)
    if mat:
        o.data.materials.append(mat)
    m = o.modifiers.new("bevel", "BEVEL")
    m.width, m.segments, m.limit_method = 0.012, 2, "ANGLE"
    m.harden_normals = True
    return o


def halo(name, loc, r, k=2100, strength=2.0, power=2.5):
    """Glow sphere: emission strongest where you look straight through it, fading to nothing at the edge."""
    m = bpy.data.materials.get(name + "_m")
    if m is None:
        m = bpy.data.materials.new(name + "_m")
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        em = nt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = (*K.kelvin(k), 1)
        lw = nt.nodes.new("ShaderNodeLayerWeight")
        lw.inputs["Blend"].default_value = 0.5
        inv = nt.nodes.new("ShaderNodeMath")
        inv.operation = "SUBTRACT"
        inv.inputs[0].default_value = 1.0
        nt.links.new(lw.outputs["Facing"], inv.inputs[1])
        pw = nt.nodes.new("ShaderNodeMath")
        pw.operation = "POWER"
        pw.inputs[1].default_value = power
        nt.links.new(inv.outputs[0], pw.inputs[0])
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = strength
        nt.links.new(pw.outputs[0], mul.inputs[0])
        nt.links.new(mul.outputs[0], em.inputs["Strength"])
        add = nt.nodes.new("ShaderNodeAddShader")
        nt.links.new(tr.outputs[0], add.inputs[0])
        nt.links.new(em.outputs[0], add.inputs[1])
        nt.links.new(add.outputs[0], out.inputs["Surface"])
    s = sphere(name, r, loc, m, seg=48, rings=24)
    s.visible_shadow = False
    try:
        s.visible_diffuse = s.visible_glossy = False
    except AttributeError:
        pass
    return s


def snow_cover(name, x0, x1, y0, y1, z, thick=0.05, res=(90, 36), seed=5, lip=0.025, droop=0.03, edge=0.035):
    """Natural snow lying on a flat ledge/board top at height z over [x0, x1] x [y0, y1]: a heightfield that is
    thickest in the middle, rounds off towards the sides and rolls over the front edge (y0) as a soft
    drooping lip of `lip` metres. Open surface: the board underneath closes it."""
    from mathutils import noise
    nx, ny = res
    verts, faces = [], []
    for j in range(ny + 1):
        for i in range(nx + 1):
            u, v = i / nx, j / ny
            x = x0 + (x1 - x0) * u
            y = (y0 - lip) + (y1 - y0 + lip) * v
            # distance into the board from the side and front edges
            dx = min(x - x0, x1 - x) / edge
            dy = (y - y0) / edge
            fx = min(1.0, max(0.0, dx)) ** 0.5
            n = noise.fractal(Vector((x * 9 + seed, y * 9, 0.5)), 0.7, 2.0, 4)
            h = thick * (0.85 + 0.35 * n)
            if y < y0:  # the lip rolling over the front edge
                t = (y0 - y) / lip
                zz = z + h * fx * math.cos(t * math.pi / 2) - droop * math.sin(t * math.pi / 2) ** 2
            else:
                zz = z + h * fx * min(1.0, max(0.0, dy) ** 0.4 if dy < 1 else 1.0)
                if dy < 1:
                    zz = z + h * fx * (0.6 + 0.4 * dy)
            if dx <= 0:
                zz = z - 0.002
            verts.append((x, y, zz))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    o = mesh_obj(name, verts, faces, smooth=True, mat=snow_mat())
    sub = o.modifiers.new("sub", "SUBSURF")
    sub.levels = sub.render_levels = 1
    return o

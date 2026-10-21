"""Jingle (formerly Pip), Grandpa's clockwork robin, with a small brass jingle bell at his neck.
pip(pose='sleep'|'awake'|'cold'|'fly_a'|'fly_b', scarf=False). scarf=True adds the knitted scarf the family can
buy him in the cold chapter (he keeps it on for the rest of the night). Origin = centre of the perch bar he grips (bar along X),
facing -Y. About 0.21 m tall awake. fly_a = wings up, fly_b = wings down (feet tucked)."""
import math

from gw import *  # noqa: F401,F403
from gw import K, bpy, Vector, Matrix, Euler


def _mats():
    return {
        "body": metal("pip_brass", (0.90, 0.66, 0.32), rough=0.24, var=0.10, rough_var=0.06, scale=60, cavity=0.0),
        "dark": metal("pip_brass_dark", (0.62, 0.42, 0.18), rough=0.34, var=0.12, scale=60, cavity=0.0),
        "copper": metal("pip_copper", (0.92, 0.50, 0.34), rough=0.26, var=0.10, scale=60, cavity=0.0),
        "enamel": paint("pip_enamel", (0.60, 0.065, 0.006), rough=0.28, coat=0.35, var=0.05),
        "enamel_face": paint("pip_enamel_face", (0.60, 0.065, 0.006), rough=0.28, coat=0.35, var=0.05),
        "eye": K.mat("pip_eye", (0.012, 0.008, 0.006), rough=0.04, coat=1.0),
        "lid_line": K.mat("pip_lidline", (0.02, 0.01, 0.004), rough=0.5, metal=0.0),
        "bell": metal("jingle_bell", (0.95, 0.72, 0.36), rough=0.16, var=0.06, scale=80, cavity=0.0),
        "slot": K.mat("jingle_slot", (0.01, 0.007, 0.004), rough=0.8),
        "frost": _frost_mat(),
    }


def _frost_mat():
    m = bpy.data.materials.get("jingle_frost")
    if m:
        return m
    m = K.mat("jingle_frost", (0.86, 0.92, 1.0), rough=0.45, sss=0.4)
    nt = m.node_tree
    b = K._bsdf(m)
    v = nt.nodes.new("ShaderNodeTexVoronoi")
    v.inputs["Scale"].default_value = 700.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.6
    nt.links.new(v.outputs["Distance"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def jingle_bell(name, loc, M, parent, s=1.0):
    """Sleigh bell: polished brass ball with an equator band, a dark slot and a loop, hanging from loc."""
    root = empty(name, loc, parent)
    r = 0.0125 * s
    torus(name + "_hang", 0.004 * s, 0.0012 * s, (0, 0, -0.002 * s), M["dark"], rot=(math.pi / 2, 0, 0), parent=root,
          seg=16, mseg=6)
    torus(name + "_loop", 0.0035 * s, 0.0013 * s, (0, 0, -0.007 * s), M["bell"], rot=(0, math.pi / 2, 0), parent=root,
          seg=16, mseg=6)
    c = Vector((0, 0, -0.01 * s - r))
    sphere(name + "_ball", r, tuple(c), M["bell"], parent=root, seg=32, rings=16)
    torus(name + "_band", r * 1.0, 0.0011 * s, tuple(c), M["dark"], parent=root, seg=32, mseg=6)
    # a thin slit lying on the lower front of the ball (tangent to it), not a plate sticking out: seen head-on
    # the old slab read as a black mouth under Jingle's beak
    sl = box(name + "_slot", (r * 1.25, 0.002 * s, r * 0.13), tuple(c + Vector((0, -r * 0.745, -r * 0.625))), M["slot"],
             parent=root, rot=(math.radians(40), 0, 0))
    for sx in (-1, 1):
        sphere(f"{name}_hole{sx}", r * 0.18, tuple(c + Vector((sx * r * 0.75, -r * 0.45, -r * 0.45))), M["slot"],
               parent=root, seg=10, rings=5)
    return root


def _feather_enamel(m):
    """Engraved feather scallops on the enamel (Voronoi bump) so the breast is not a flat plastic ball."""
    nt = m.node_tree
    b = K._bsdf(m)
    if any(n.type == "TEX_VORONOI" for n in nt.nodes):
        return m
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1.0, 1.0, 1.6)
    v = nt.nodes.new("ShaderNodeTexVoronoi")
    v.inputs["Scale"].default_value = 55.0
    v.feature = "DISTANCE_TO_EDGE"
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], v.inputs["Vector"])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = 0.0, 0.08
    nt.links.new(v.outputs["Distance"], mr.inputs["Value"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.18
    bump.inputs["Distance"].default_value = 0.0004
    nt.links.new(mr.outputs["Result"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def _shell(name, src, center, r, mat, parent, grow=1.012):
    """Patch of src's surface inside a sphere (center, r): an enamel cap that follows the body shape."""
    s = src.copy()
    s.data = src.data.copy()
    link(s, parent)
    s.matrix_world = src.matrix_world.copy()
    s.scale = Vector(src.scale) * grow
    s.name = name
    s.data.materials.clear()
    s.data.materials.append(mat)
    bpy.context.view_layer.update()
    c = sphere(name + "_c", r, center, None, seg=48, rings=24)
    bpy.context.view_layer.update()
    boolean(s, c, "INTERSECT")
    for p in s.data.polygons:
        p.use_smooth = True
    return s


def _knit_mat():
    """Chunky Christmas-green wool (it has to stand out against his red breast and the brass): felt fuzz
    plus knitted ribs (a wave texture) in the bump."""
    m = bpy.data.materials.get("jingle_knit")
    if m:
        return m
    m = felt("jingle_knit", (0.012, 0.11, 0.03))
    nt = m.node_tree
    b = K._bsdf(m)
    b.inputs["Sheen Weight"].default_value = 0.3
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type, wave.bands_direction = "BANDS", "Z"
    wave.inputs["Scale"].default_value = 160.0
    wave.inputs["Distortion"].default_value = 2.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.45
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def _cream_knit():
    return felt("jingle_knit_cream", (0.8, 0.72, 0.58))


def _strip(name, pts, width, thick, mat, parent, out=Vector((0, -1, 0))):
    """A soft flat band (a scarf tail) along pts, its width across the body, its face towards 'out'."""
    verts, faces = [], []
    pts = [Vector(p) for p in pts]
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        side = t.cross(out).normalized() * (width / 2)
        verts += [tuple(p - side), tuple(p + side)]
        if i:
            faces.append((2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i))
    o = mesh_obj(name, verts, faces, parent=parent, smooth=True, mat=mat)
    so = o.modifiers.new("solid", "SOLIDIFY")
    so.thickness, so.offset = thick, 0.0
    sub = o.modifiers.new("sub", "SUBSURF")
    sub.levels = sub.render_levels = 2
    return o


def _scarf(name, M, body_g):
    """A thick green wrap round his neck, knotted at his right shoulder, two tails down his breast with
    cream stripes at the ends. The bell hangs out below the wrap."""
    knit, cream = _knit_mat(), _cream_knit()
    w = torus(f"{name}_scarf_wrap", 0.05, 0.0145, (0, -0.016, 0.126), knit, parent=body_g, seg=56, mseg=18)
    w.rotation_euler = (math.radians(-20), 0, 0)
    w.scale = (1.0, 1.0, 0.85)
    sphere(f"{name}_scarf_knot", 0.016, (0.036, -0.062, 0.122), knit, scale=(1.0, 0.8, 0.9), parent=body_g,
           seg=24, rings=12)
    tails = (
        ([(0.038, -0.07, 0.115), (0.044, -0.082, 0.092), (0.047, -0.085, 0.068), (0.048, -0.082, 0.046)], 0.022),
        ([(0.028, -0.074, 0.114), (0.026, -0.088, 0.092), (0.025, -0.092, 0.074)], 0.02),
    )
    for i, (pts, wd) in enumerate(tails):
        _strip(f"{name}_scarf_tail{i}", pts, wd, 0.006, knit, body_g)
        # two cream stripes near the end of each tail
        p0, p1 = Vector(pts[-2]), Vector(pts[-1])
        for k, t in enumerate((0.35, 0.7)):
            c = p0.lerp(p1, t)
            d = (p1 - p0).normalized() * 0.003
            _strip(f"{name}_scarf_stripe{i}{k}", [tuple(c - d), tuple(c + d)], wd * 1.04, 0.0068, cream, body_g)
    # fringe at the end of the long tail
    end = Vector(tails[0][0][-1])
    for k in range(5):
        x = end.x - 0.008 + k * 0.004
        curve_tube(f"{name}_scarf_fringe{k}", [(x, end.y, end.z), (x + 0.0005, end.y + 0.001, end.z - 0.01)], 0.0013,
                   cream, parent=body_g)


def pip(name="pip", pose="awake", loc=(0, 0, 0), rot_z=0.0, scarf=False):
    M = _mats()
    _feather_enamel(M["enamel"])
    sleep = pose == "sleep"
    cold = pose == "cold"
    fly = pose.startswith("fly")
    root = empty(name, (0, 0, 0))  # built at the origin; placed at the end so booleans work in world space
    # ---- legs and feet stay on the perch bar (tucked under the belly when flying)
    for sx in (-1, 1) if not fly else ():
        x = sx * 0.017
        curve_tube(f"{name}_leg{sx}", [(x, 0.002, 0.034 if not sleep else 0.026), (x, 0.0, 0.009)], 0.0026,
                   M["dark"], parent=root, smooth=False)
        for tx in (-0.006, 0.0, 0.006):
            curve_tube(f"{name}_toe{sx}{tx}", [(x + tx * 0.5, 0.0, 0.009), (x + tx, -0.005, 0.0075),
                                                (x + tx * 1.2, -0.0085, 0.002), (x + tx * 1.2, -0.0075, -0.0035)],
                       0.0018, M["dark"], parent=root)
        curve_tube(f"{name}_htoe{sx}", [(x, 0.0, 0.009), (x, 0.006, 0.0065), (x, 0.0085, 0.0005),
                                        (x, 0.007, -0.004)], 0.0018, M["dark"], parent=root)
    # ---- body group pivots at the feet
    body_g = empty(name + "_bodyg", (0, 0, 0), root)
    if fly:
        for sx in (-1, 1):
            x = sx * 0.016
            curve_tube(f"{name}_tleg{sx}", [(x, 0.0, 0.03), (x, 0.022, 0.022), (x, 0.03, 0.026)], 0.0026, M["dark"],
                       parent=body_g)
            for tx in (-0.004, 0.0, 0.004):
                curve_tube(f"{name}_ttoe{sx}{tx}", [(x, 0.03, 0.026), (x + tx, 0.037, 0.022), (x + tx, 0.036, 0.016)],
                           0.0017, M["dark"], parent=body_g)
    body = sphere(name + "_body", 1.0, (0, 0.006, 0.083), M["body"], scale=(0.063, 0.078, 0.07), parent=body_g,
                  seg=64, rings=32)
    body.rotation_euler = (math.radians(-18), 0, 0)
    bpy.context.view_layer.update()
    _shell(name + "_breast", body, (0, -0.075, 0.098), 0.066, M["enamel"], body_g)
    # riveted seam band along the breast edge and a belly plate seam
    band = torus(name + "_band", 0.066, 0.0028, (0, 0.006, 0.083), M["dark"], parent=body_g, seg=64, mseg=8)
    band.rotation_euler = (math.radians(72), 0, 0)
    band.scale = (0.97, 1.1, 1.0)
    for i in range(11):
        a = math.radians(-150 + 300 * i / 10)
        p = Matrix.Translation((0, 0.006, 0.083)) @ Euler((math.radians(72), 0, 0)).to_matrix().to_4x4() @ \
            Vector((0.066 * 0.97 * math.cos(a), 0.066 * 1.1 * math.sin(a), 0.0))
        sphere(f"{name}_rivet{i}", 0.0032, tuple(p), M["dark"], parent=body_g, seg=12, rings=6)
    # neck collar
    collar = torus(name + "_collar", 0.035, 0.0055, (0, -0.022, 0.131), M["copper"], parent=body_g, seg=48, mseg=12)
    collar.rotation_euler = (math.radians(-28), 0, 0)
    if scarf:
        _scarf(name, M, body_g)
    # tail fan
    tail_g = empty(name + "_tailg", (0, 0.07, 0.068), body_g)
    tail_g.rotation_euler = (math.radians(-18 if sleep else (-6 if fly else (-28 if cold else -38))), 0, 0)
    for i, a in enumerate((-26, -13, 0, 13, 26)):
        f = sphere(f"{name}_tail{i}", 1.0, (0, 0, 0), M["copper"] if i % 2 else M["body"], parent=tail_g, seg=24,
                   rings=12)
        f.scale = (0.012, 0.042, 0.0035)
        f.rotation_euler = (0, 0, math.radians(a))
        f.location = (math.sin(math.radians(a)) * 0.032, math.cos(math.radians(a)) * 0.032, 0.0015 * abs(i - 2))
    # wings: layered feather plates hinged at the shoulder
    for sx in (-1, 1):
        wg = empty(f"{name}_wing{sx}", (sx * 0.055, -0.002, 0.108), body_g)
        if sleep:
            wg.rotation_euler = (math.radians(10), sx * math.radians(-2), sx * math.radians(2))
        elif cold:  # wrapped forward around the chest like a shawl
            wg.location = (sx * 0.062, -0.012, 0.116)
            wg.rotation_euler = (math.radians(-18), sx * math.radians(-10), sx * math.radians(146))
        elif pose == "fly_a":  # wings up
            wg.rotation_euler = (0, -sx * math.radians(58), 0)
        elif pose == "fly_b":  # wings down
            wg.rotation_euler = (0, sx * math.radians(38), 0)
        else:
            wg.rotation_euler = (math.radians(-22), sx * math.radians(-28), sx * math.radians(-6))
        if fly:
            # spread wing: long feather plates fanned from "out" towards "back", lying in the wing plane
            for i, (ang, L) in enumerate(((8, 0.115), (32, 0.105), (56, 0.09), (78, 0.07))):
                a_ = math.radians(ang)
                d = Vector((sx * math.cos(a_), math.sin(a_), 0.0))
                side = Vector((0, 0, 1)).cross(d).normalized()
                fp = sphere(f"{name}_fw{sx}{i}", 1.0, (0, 0, 0), M["body"] if i % 2 == 0 else M["copper"], parent=wg,
                            seg=32, rings=12)
                pos = d * L * 0.48 + Vector((0, 0, 0.002 * i))
                fp.matrix_basis = Matrix.Translation(pos) @ Matrix((
                    (d.x, side.x, 0, 0), (d.y, side.y, 0, 0), (d.z, side.z, 1, 0), (0, 0, 0, 1))) @ \
                    Matrix.Diagonal((L * 0.5, 0.0145, 0.0042, 1))
            gear(f"{name}_wgear{sx}", teeth=12, r=0.014, depth=0.004, tooth=0.2, hole=0.25, mat=M["copper"],
                 loc=(sx * 0.006, 0.0, 0.0), rot=(0, math.pi / 2, 0), parent=wg)
            continue
        if cold:
            # wings hugging the chest: feather plates laid on the body surface, sweeping from the side to the
            # front and down, like arms wrapped around against the cold
            c0 = Vector((0, 0.006, 0.083))
            R3 = Euler((math.radians(-18), 0, 0)).to_matrix()
            for i, (th, ph, L) in enumerate(((78, 22, 0.085), (60, 6, 0.08), (42, -10, 0.07))):
                t_, f_ = math.radians(th) * sx, math.radians(ph)
                e = Vector((0.063 * math.sin(t_) * math.cos(f_), -0.078 * math.cos(t_) * math.cos(f_), 0.07 * math.sin(f_)))
                nrm = R3 @ Vector((e.x / 0.063 ** 2, e.y / 0.078 ** 2, e.z / 0.07 ** 2)).normalized()
                pos = c0 + R3 @ e + nrm * 0.006
                tang = R3 @ Vector((-math.cos(t_) * 0.063 * sx, -math.sin(t_) * 0.078 * sx, 0)).normalized()
                tang = (tang + Vector((0, 0, -0.55))).normalized()
                tang = (tang - nrm * tang.dot(nrm)).normalized()
                wid = nrm.cross(tang).normalized()
                fp = sphere(f"{name}_cw{sx}{i}", 1.0, (0, 0, 0), M["body"] if i != 1 else M["copper"], parent=body_g,
                            seg=32, rings=12)
                fp.matrix_basis = Matrix.Translation(pos) @ Matrix((
                    (nrm.x, tang.x, wid.x, 0), (nrm.y, tang.y, wid.y, 0), (nrm.z, tang.z, wid.z, 0), (0, 0, 0, 1))) @ \
                    Matrix.Diagonal((0.0045, L * 0.5, 0.013, 1))
            continue
        # three long feather plates fanned from the shoulder, pointing back and down
        for i, (ang, L) in enumerate(((28, 0.086), (44, 0.078), (60, 0.066))):
            fp = sphere(f"{name}_wf{sx}{i}", 1.0, (0, 0, 0), M["body"] if i != 1 else M["copper"], parent=wg,
                        seg=32, rings=12)
            fp.scale = (0.0042, L * 0.5, 0.0125)
            a_ = math.radians(ang)
            fp.location = (sx * 0.0035 * i, math.cos(a_) * L * 0.45, -math.sin(a_) * L * 0.45)
            fp.rotation_euler = (a_, 0, 0)
        gear(f"{name}_wgear{sx}", teeth=12, r=0.014, depth=0.004, tooth=0.2, hole=0.25, mat=M["copper"],
             loc=(sx * 0.006, 0.0, 0.0), rot=(0, math.pi / 2, 0), parent=wg)
        sphere(f"{name}_whub{sx}", 0.0055, (sx * 0.009, 0, 0), M["dark"], parent=wg, seg=16, rings=8)
    # the jingle bell hanging from the front of the collar
    jingle_bell(name + "_jbell", (0, -0.066, 0.127), M, body_g, s=1.35)
    # wind-up key on the back
    key_g = empty(name + "_key", (0, 0.07, 0.112), body_g)
    key_g.rotation_euler = (math.radians(-62), 0, 0)  # shaft leans back and up
    cyl(name + "_kshaft", 0.0048, 0.04, (0, 0, 0.015), M["dark"], verts=16, parent=key_g)
    cyl(name + "_kcollar", 0.009, 0.006, (0, 0, 0.004), M["copper"], verts=24, parent=key_g)
    for sx in (-1, 1):
        lobe = torus(f"{name}_klobe{sx}", 0.015, 0.0038, (sx * 0.016, 0, 0.044), M["body"], parent=key_g, seg=32,
                     mseg=10, rot=(math.pi / 2, 0, 0))
        lobe.rotation_euler = (math.pi / 2, 0, 0)
        disc = cyl(f"{name}_kfill{sx}", 0.0125, 0.0028, (sx * 0.016, 0, 0.044), M["dark"], rot=(math.pi / 2, 0, 0),
                   verts=24, parent=key_g)
    cyl(name + "_khub", 0.0065, 0.012, (0, 0, 0.036), M["body"], rot=(math.pi / 2, 0, 0), verts=20, parent=key_g)
    # ---- head group pivots at the neck
    head_g = empty(name + "_headg", (0, -0.024, 0.13), body_g)
    hc = Vector((0, -0.01, 0.03))
    head = sphere(name + "_head", 0.047, tuple(hc), M["body"], parent=head_g, seg=64, rings=32)
    head.scale = (1.0, 1.02, 0.97)
    bpy.context.view_layer.update()
    hw = head_g.matrix_world
    _shell(name + "_face", head, tuple(hw @ (hc + Vector((0, -0.048, -0.03)))), 0.042, M["enamel_face"], head_g)
    # copper crown cap
    # little copper crest of three feathers on top of the head
    for i, (a, L) in enumerate(((-20, 0.026), (0, 0.032), (20, 0.024))):
        cr = sphere(f"{name}_crest{i}", 1.0, (0, 0, 0), M["copper"], parent=head_g, seg=24, rings=10)
        cr.scale = (0.004, 0.006, L * 0.5)
        cr.location = tuple(hc + Vector((math.sin(math.radians(a)) * 0.01, 0.012, 0.047 + L * 0.3)))
        cr.rotation_euler = (math.radians(-35), math.radians(a), 0)
    # beak
    bk = cyl(name + "_beak", 0.0105, 0.03, tuple(hc + Vector((0, -0.055, -0.006))), M["dark"], verts=24, r2=0.0008,
             parent=head_g, rot=(math.radians(97), 0, 0))
    # eyes
    for sx in (-1, 1):
        d = Vector((sx * 0.5, -0.82, 0.24)).normalized()
        ec = hc + d * 0.043
        rot = Vector((0, 0, 1)).rotation_difference(d).to_euler()
        bez = torus(f"{name}_bezel{sx}", 0.0158, 0.0028, tuple(ec + d * 0.0015), M["dark"], parent=head_g, seg=40,
                    mseg=10)
        bez.rotation_euler = rot
        eye = sphere(f"{name}_eye{sx}", 0.0145, tuple(ec), M["eye"], parent=head_g, seg=40, rings=20)
        if cold:
            # heavy lids: half closed against the cold
            lid = sphere(f"{name}_lid{sx}", 0.0154, tuple(ec - d * 0.002), M["body"], parent=head_g, seg=40, rings=20)
            cut = box("lidcut", (0.06, 0.06, 0.06), tuple(head_g.matrix_world @ (ec + Vector((0, -0.004, -0.0335)))), None)
            bpy.context.view_layer.update()
            boolean(lid, cut)
        elif sleep:
            lid = sphere(f"{name}_lid{sx}", 0.0152, tuple(ec + d * 0.0008), M["body"], parent=head_g, seg=40,
                         rings=20)
            # a sleepy closed-eye crease: a downward smile arc on the lid
            up = Vector((0, 0, 1))
            side = d.cross(up).normalized()
            upv = side.cross(d).normalized()
            pts = []
            for k in range(9):
                a = math.radians(-60 + 120 * k / 8)
                v = (side * math.sin(a) * 0.012 - upv * (0.0035 + math.cos(a) * -0.004) * 1.0)
                p = ec + (d * 0.0158) + v * 0.95
                # push back onto the lid sphere
                p = ec + (p - ec).normalized() * 0.0158
                pts.append(tuple(p))
            curve_tube(f"{name}_crease{sx}", pts, 0.0026, M["lid_line"], parent=head_g)
        else:
            # upper lid barely showing: a thin brass crescent above the eye
            lid = sphere(f"{name}_lid{sx}", 0.0154, tuple(ec - d * 0.002), M["body"], parent=head_g, seg=40, rings=20)
            cut = box("lidcut", (0.06, 0.06, 0.06), tuple(head_g.matrix_world @ (ec + Vector((0, -0.004, -0.0215)))), None)
            bpy.context.view_layer.update()
            boolean(lid, cut)
    # cheek gears (tiny clockwork details on the head sides)
    for sx in (-1, 1):
        d = Vector((sx * 0.95, 0.15, -0.1)).normalized()
        gear(f"{name}_cgear{sx}", teeth=10, r=0.009, depth=0.003, tooth=0.22, hole=0.3, mat=M["copper"],
             loc=tuple(hc + d * 0.046), rot=Vector((0, 0, 1)).rotation_difference(d).to_euler(), parent=head_g)
    if cold:
        # frost on the head and on the tail tips
        _shell(name + "_frosthead", head, tuple(hw @ (hc + Vector((0, 0.012, 0.05)))), 0.034, M["frost"], head_g,
               grow=1.03)
        import random as _r
        rng = _r.Random(5)
        for i in range(14):
            a = rng.uniform(0, 6.283)
            rr = rng.uniform(0, 0.022)
            p = hc + Vector((rr * math.cos(a), 0.012 + rr * math.sin(a), 0.0))
            p.z = hc.z + math.sqrt(max(0.0, 0.047 ** 2 - (p.x - hc.x) ** 2 - (p.y - hc.y) ** 2)) * 0.97 + 0.002
            sphere(f"{name}_frostc{i}", rng.uniform(0.0015, 0.003), tuple(p), M["frost"], parent=head_g, seg=8, rings=4)
        for i, a in enumerate((-26, -13, 0, 13, 26)):
            for j in range(3):
                p = (math.sin(math.radians(a)) * 0.06 + rng.uniform(-0.004, 0.004),
                     math.cos(math.radians(a)) * 0.06 + rng.uniform(-0.004, 0.004), 0.004 + 0.0015 * abs(i - 2))
                sphere(f"{name}_frostt{i}{j}", rng.uniform(0.002, 0.0038), p, M["frost"], parent=tail_g, seg=8, rings=4)
    # pose the head and the whole body, then place
    if sleep:
        head_g.rotation_euler = (math.radians(26), math.radians(-18), math.radians(10))
    elif cold:
        head_g.location = (0, -0.02, 0.118)  # pulled down into the shoulders
        head_g.rotation_euler = (math.radians(10), math.radians(-6), math.radians(-8))
    elif fly:
        head_g.rotation_euler = (math.radians(-14), 0, 0)
    else:
        head_g.rotation_euler = (math.radians(-10), math.radians(6), math.radians(-6))
    if sleep:
        body_g.rotation_euler = (math.radians(20), math.radians(-5), math.radians(4))
        body_g.location = (0, -0.006, -0.009)
    elif cold:
        body_g.rotation_euler = (math.radians(8), 0, 0)
        body_g.location = (0, 0, -0.004)
        body_g.scale = (1.04, 1.0, 0.95)  # hunched and puffed up
    elif fly:
        body_g.rotation_euler = (math.radians(14), 0, 0)  # tilted forward into the flight
    else:
        body_g.rotation_euler = (math.radians(-9), 0, 0)
    root.location = loc
    root.rotation_euler = (0, 0, rot_z)
    bpy.context.view_layer.update()
    return root


def pip_meshes(root):
    return [o for o in [root, *root.children_recursive] if o.type in ("MESH", "CURVE") and not o.hide_render]


jingle = pip

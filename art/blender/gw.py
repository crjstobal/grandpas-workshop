"""Grandpa's Workshop: shared Blender helpers (materials, procedural props, trees, snow).

Run scene scripts with:
  B=/Applications/Blender.app/Contents/MacOS/Blender
  $B -b --factory-startup --python-exit-code 1 --python <scene>.py -- --out <dir> [--fast]
Units: metres, Z up.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.expanduser("~/.claude/skills/3d-studio/scripts"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bl_kit as K  # noqa: E402
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Euler, Matrix, Vector  # noqa: E402

LIB = K.ASSETS
PH = f"{LIB}/polyhaven"
TEX = f"{PH}/textures"
MOD = f"{PH}/models"
HDR = f"{PH}/hdris"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCENES = f"{ROOT}/web/public/scenes"
MODELS = f"{ROOT}/web/public/models"


# ------------------------------------------------------------------ basic objects
def link(o, parent=None):
    bpy.context.scene.collection.objects.link(o)
    if parent is not None:
        o.parent = parent
    return o


def empty(name, loc=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    return link(e, parent)


def mesh_obj(name, verts, faces, parent=None, smooth=False, mat=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate()
    me.update()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    link(o, parent)
    if mat:
        o.data.materials.append(mat)
    return o


def instance(src, name, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), parent=None):
    """Linked duplicate (shares mesh data: Cycles instances it)."""
    o = bpy.data.objects.new(name, src.data)
    o.location, o.rotation_euler = Vector(loc), Euler(rot)
    o.scale = scale if not isinstance(scale, (int, float)) else (scale,) * 3
    return link(o, parent)


def _ops_obj(name, mat, parent, smooth):
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    if parent is not None:
        o.parent = parent
    if mat:
        o.data.materials.clear()
        o.data.materials.append(mat)
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    return o


def box(name, size, loc, mat=None, bevel=0.0, parent=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = _ops_obj(name, mat, None, False)
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        m = o.modifiers.new("bevel", "BEVEL")
        m.width, m.segments, m.limit_method = bevel, 3, "ANGLE"
        m.harden_normals = True
        for p in o.data.polygons:
            p.use_smooth = True
    if parent is not None:
        o.parent = parent
    return o


def cyl(name, r, depth, loc, mat=None, rot=(0, 0, 0), verts=48, bevel=0.0, parent=None, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc,
                                        rotation=rot)
    o = _ops_obj(name, mat, parent, False)
    if bevel:
        m = o.modifiers.new("bevel", "BEVEL")
        m.width, m.segments, m.limit_method = bevel, 2, "ANGLE"
        m.harden_normals = True
    smooth_angle(o)
    return o


def sphere(name, r, loc, mat=None, scale=(1, 1, 1), parent=None, seg=48, rings=24, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc, rotation=rot)
    o = _ops_obj(name, mat, parent, True)
    o.scale = scale
    return o


def torus(name, R, r, loc, mat=None, rot=(0, 0, 0), parent=None, seg=64, mseg=16):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg, minor_segments=mseg,
                                     location=loc, rotation=rot)
    return _ops_obj(name, mat, parent, True)


def smooth_angle(o, deg=40):
    for p in o.data.polygons:
        p.use_smooth = True
    try:
        o.data.set_sharp_from_angle(angle=math.radians(deg))
    except Exception:
        pass
    return o


def subsurf(o, levels=2):
    m = o.modifiers.new("subsurf", "SUBSURF")
    m.levels = m.render_levels = levels
    return m


def lathe(name, prof, seg=64, mat=None, parent=None, loc=(0, 0, 0), cap_top=False, cap_bottom=False,
          rot=(0, 0, 0)):
    """Surface of revolution around Z from a profile [(r, z), ...] (bottom to top). Smooth shaded.
    UVs: u around, v along the profile (0..1)."""
    n = len(prof)
    verts, faces = [], []
    for j in range(seg):
        a = 2 * math.pi * j / seg
        ca, sa = math.cos(a), math.sin(a)
        for r, z in prof:
            verts.append((r * ca, r * sa, z))
    for j in range(seg):
        j2 = (j + 1) % seg
        for i in range(n - 1):
            faces.append((j * n + i, j2 * n + i, j2 * n + i + 1, j * n + i + 1))
    if cap_bottom:
        faces.append(tuple(j * n for j in reversed(range(seg))))
    if cap_top:
        faces.append(tuple(j * n + n - 1 for j in range(seg)))
    o = mesh_obj(name, verts, faces, parent, smooth=True, mat=mat)
    # UVs
    uv = o.data.uv_layers.new(name="UVMap")
    L = [0.0]
    for i in range(1, n):
        L.append(L[-1] + math.dist(prof[i], prof[i - 1]))
    tot = L[-1] or 1
    for p in o.data.polygons:
        for li in p.loop_indices:
            vi = o.data.loops[li].vertex_index
            j, i = divmod(vi, n)
            uv.data[li].uv = (j / seg, L[i] / tot)
    o.location, o.rotation_euler = loc, rot
    return o


def gear(name, teeth=16, r=0.05, depth=0.008, tooth=0.18, hole=0.25, spokes=0, mat=None, parent=None,
         loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0008):
    """Spur gear in the XY plane, thickness along Z. r = outer radius. tooth = tooth height as a fraction of r.
    hole = axle hole radius fraction. spokes > 0 cuts round windows between hub and rim."""
    bm = bmesh.new()
    pts = []
    rin = r * (1 - tooth)
    steps = teeth * 4
    for k in range(steps):
        a = 2 * math.pi * k / steps
        phase = k % 4
        rr = r if phase in (1, 2) else rin
        da = (math.pi * 2 / steps) * (0.18 if phase == 1 else -0.18 if phase == 2 else 0)
        pts.append((rr * math.cos(a + da), rr * math.sin(a + da)))
    outer = [bm.verts.new((x, y, -depth / 2)) for x, y in pts]
    f = bm.faces.new(outer)
    ex = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in ex["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.z += depth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    link(o, parent)
    cutters = []
    if hole:
        cutters.append(_cut_cyl(r * hole, depth * 4))
    if spokes:
        rr = (rin * 0.78 + r * hole * 1.6) / 2
        wr = (rin * 0.78 - r * hole * 1.6) / 2 * 0.95
        for s in range(spokes):
            a = 2 * math.pi * s / spokes
            cutters.append(_cut_cyl(wr, depth * 4, (rr * math.cos(a), rr * math.sin(a), 0)))
    for c in cutters:
        m = o.modifiers.new("cut", "BOOLEAN")
        m.object, m.operation, m.solver = c, "DIFFERENCE", "EXACT"
    _apply_all(o)
    for c in cutters:
        bpy.data.objects.remove(c)
    if bevel:
        m = o.modifiers.new("bevel", "BEVEL")
        m.width, m.segments, m.limit_method = bevel, 2, "ANGLE"
        m.harden_normals = True
    smooth_angle(o, 30)
    if mat:
        o.data.materials.append(mat)
    o.location, o.rotation_euler = loc, rot
    return o


def _cut_cyl(r, d, loc=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=r, depth=d, location=loc)
    c = bpy.context.active_object
    c.hide_render = True
    return c


def _apply_all(o):
    K.sel(o)
    for m in list(o.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception as e:
            print("apply fail", m.name, e)


def boolean(o, cutter, op="DIFFERENCE", apply=True, keep=False):
    m = o.modifiers.new("bool", "BOOLEAN")
    m.object, m.operation, m.solver = cutter, op, "EXACT"
    if apply:
        K.sel(o)
        bpy.ops.object.modifier_apply(modifier=m.name)
        if not keep:
            bpy.data.objects.remove(cutter)
    return o


def curve_tube(name, pts, r, mat=None, parent=None, res=12, closed=False, smooth=True, taper=None):
    """Tube along a poly-bezier through pts (list of xyz). Auto handles -> smooth pipe."""
    cd = bpy.data.curves.new(name, "CURVE")
    cd.dimensions = "3D"
    cd.bevel_depth = r
    cd.bevel_resolution = 4
    cd.resolution_u = res
    cd.use_fill_caps = True
    sp = cd.splines.new("BEZIER" if smooth else "POLY")
    if smooth:
        sp.bezier_points.add(len(pts) - 1)
        for bp, p in zip(sp.bezier_points, pts):
            bp.co = p
            bp.handle_left_type = bp.handle_right_type = "AUTO"
    else:
        sp.points.add(len(pts) - 1)
        for bp, p in zip(sp.points, pts):
            bp.co = (*p, 1)
    sp.use_cyclic_u = closed
    o = bpy.data.objects.new(name, cd)
    link(o, parent)
    if mat:
        o.data.materials.append(mat)
    return o


def to_mesh(o):
    K.sel(o)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.active_object


def helix(name, r, wire, turns, length, mat=None, parent=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    n = int(turns * 24)
    pts = [(r * math.cos(2 * math.pi * turns * i / n), r * math.sin(2 * math.pi * turns * i / n),
            length * i / n) for i in range(n + 1)]
    o = curve_tube(name, pts, wire, mat, parent, res=4)
    o.location, o.rotation_euler = loc, rot
    return o


# ------------------------------------------------------------------ materials
def _nodes(m):
    m.use_nodes = True
    return m.node_tree, K._bsdf(m)


def _noise(nt, scale=8.0, detail=4.0, coord="Object", rough=0.55):
    tc = nt.nodes.new("ShaderNodeTexCoord")
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = rough
    nt.links.new(tc.outputs[coord], n.inputs["Vector"])
    return n


def _ramp(nt, src, a, b, lo=0.35, hi=0.65):
    r = nt.nodes.new("ShaderNodeValToRGB")
    r.color_ramp.elements[0].position, r.color_ramp.elements[1].position = lo, hi
    r.color_ramp.elements[0].color = (*a, 1) if len(a) == 3 else a
    r.color_ramp.elements[1].color = (*b, 1) if len(b) == 3 else b
    nt.links.new(src, r.inputs["Fac"])
    return r


def _maprange(nt, src, a, b, lo=0.3, hi=0.7):
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = lo, hi
    mr.inputs["To Min"].default_value, mr.inputs["To Max"].default_value = a, b
    nt.links.new(src, mr.inputs["Value"])
    return mr


def metal(name, color, rough=0.3, var=0.14, rough_var=0.12, scale=45.0, cavity=0.5, coat=0.0):
    """Worn metal: colour/roughness variation from noise + darker tarnish in cavities (AO, Cycles)."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    nt, b = _nodes(m)
    n = _noise(nt, scale)
    dark = tuple(c * (1 - var) for c in color)
    light = tuple(min(1, c * (1 + var * 0.4)) for c in color)
    ramp = _ramp(nt, n.outputs["Fac"], dark, light)
    if cavity > 0:
        ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
        ao.inputs["Distance"].default_value = 0.01
        ao.only_local = True
        mx = nt.nodes.new("ShaderNodeMix")
        mx.data_type, mx.blend_type = "RGBA", "MIX"
        nt.links.new(ao.outputs["AO"], mx.inputs["Factor"])
        mx.inputs["A"].default_value = (*[c * (1 - cavity) * 0.6 for c in color], 1)
        nt.links.new(ramp.outputs["Color"], mx.inputs["B"])
        nt.links.new(mx.outputs["Result"], b.inputs["Base Color"])
    else:
        nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    n2 = _noise(nt, scale * 3.1, 6)
    rr = _maprange(nt, n2.outputs["Fac"], rough - rough_var, rough + rough_var)
    nt.links.new(rr.outputs["Result"], b.inputs["Roughness"])
    b.inputs["Metallic"].default_value = 1.0
    b.inputs["Coat Weight"].default_value = coat
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.06
    bump.inputs["Distance"].default_value = 0.0005
    nt.links.new(n2.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def brass(name="brass", rough=0.32):
    return metal(name, (0.86, 0.62, 0.30), rough=rough)


def old_brass(name="brass_old"):
    return metal(name, (0.72, 0.52, 0.25), rough=0.42, var=0.22, cavity=0.7)


def copper(name="copper"):
    return metal(name, (0.90, 0.52, 0.36), rough=0.33)


def iron(name="iron"):
    return metal(name, (0.30, 0.29, 0.28), rough=0.5, var=0.3)


def paint(name, color, rough=0.45, coat=0.25, var=0.08, sss=0.0, sheen=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    nt, b = _nodes(m)
    n = _noise(nt, 6.0)
    dark = tuple(c * (1 - var) for c in color)
    light = tuple(min(1, c * (1 + var)) for c in color)
    ramp = _ramp(nt, n.outputs["Fac"], dark, light)
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    n2 = _noise(nt, 22.0, 5)
    rr = _maprange(nt, n2.outputs["Fac"], rough - 0.08, rough + 0.08)
    nt.links.new(rr.outputs["Result"], b.inputs["Roughness"])
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = 0.15
    b.inputs["Subsurface Weight"].default_value = sss
    b.inputs["Sheen Weight"].default_value = sheen
    return m


def enamel(name="enamel_red", color=(0.80, 0.16, 0.04)):
    return paint(name, color, rough=0.28, coat=0.7, var=0.06)


def felt(name, color):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    nt, b = _nodes(m)
    n = _noise(nt, 60.0, 8)
    ramp = _ramp(nt, n.outputs["Fac"], tuple(c * 0.85 for c in color), color)
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.95
    b.inputs["Sheen Weight"].default_value = 0.6
    b.inputs["Sheen Tint"].default_value = (1, 1, 1, 1)
    b.inputs["Subsurface Weight"].default_value = 0.05
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    nt.links.new(n.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def glass(name="glass", tint=(1, 1, 1), rough=0.02):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = K.mat(name, tint, rough=rough, transmission=1.0, ior=1.45)
    return m


def emit(name, color, strength):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    nt, b = _nodes(m)
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Emission Color"].default_value = (*color, 1)
    b.inputs["Emission Strength"].default_value = strength
    return m


def wood(name, tex="wood_table_worn", tint=None, rough_add=0.0, bump=1.0):
    """PBR wood from Poly Haven with real-size UVs (call K.uv_real_size(obj) on the target)."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = K.pbr(name, f"{TEX}/{tex}", tint=tint, bump=bump)
    return m


def snow_mat(name="snow"):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    nt, b = _nodes(m)
    b.inputs["Base Color"].default_value = (0.86, 0.90, 0.96, 1)
    b.inputs["Roughness"].default_value = 0.55
    b.inputs["Subsurface Weight"].default_value = 0.35
    b.inputs["Subsurface Radius"].default_value = (0.5, 0.7, 1.0)
    b.inputs["Subsurface Scale"].default_value = 0.03
    b.inputs["Specular IOR Level"].default_value = 0.35
    n = _noise(nt, 80.0, 6)
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    bump.inputs["Distance"].default_value = 0.002
    nt.links.new(n.outputs["Fac"], bump.inputs["Height"])
    # sparkle: tiny voronoi glints
    v = nt.nodes.new("ShaderNodeTexVoronoi")
    v.inputs["Scale"].default_value = 900.0
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(tc.outputs["Object"], v.inputs["Vector"])
    mr = _maprange(nt, v.outputs["Distance"], 1.0, 0.0, 0.0, 0.06)
    b2 = nt.nodes.new("ShaderNodeBump")
    b2.inputs["Strength"].default_value = 0.4
    nt.links.new(mr.outputs["Result"], b2.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b2.inputs["Normal"])
    nt.links.new(b2.outputs["Normal"], b.inputs["Normal"])
    return m


def needles_mat(name="needles", snow=0.0):
    """Fir needles: dark green with translucency and per-object variation. snow > 0 frosts upward faces."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    nt, b = _nodes(m)
    oi = nt.nodes.new("ShaderNodeObjectInfo")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.022, 0.075, 0.035, 1)
    ramp.color_ramp.elements[1].color = (0.060, 0.135, 0.045, 1)
    nt.links.new(oi.outputs["Random"], ramp.inputs["Fac"])
    col = ramp.outputs["Color"]
    b.inputs["Roughness"].default_value = 0.5
    b.inputs["Subsurface Weight"].default_value = 0.15
    b.inputs["Subsurface Radius"].default_value = (0.2, 0.5, 0.1)
    b.inputs["Subsurface Scale"].default_value = 0.005
    b.inputs["Specular IOR Level"].default_value = 0.4
    if snow > 0:
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(geo.outputs["Normal"], sep.inputs["Vector"])
        n = _noise(nt, 30.0, 3)
        add = nt.nodes.new("ShaderNodeMath")
        add.operation = "ADD"
        nt.links.new(sep.outputs["Z"], add.inputs[0])
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = 0.5
        nt.links.new(n.outputs["Fac"], mul.inputs[0])
        nt.links.new(mul.outputs[0], add.inputs[1])
        mr = _maprange(nt, add.outputs[0], 0.0, 1.0, 1.25 - snow * 0.3, 1.35 - snow * 0.3)
        mx = nt.nodes.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        nt.links.new(mr.outputs["Result"], mx.inputs["Factor"])
        nt.links.new(col, mx.inputs["A"])
        mx.inputs["B"].default_value = (0.85, 0.89, 0.95, 1)
        col = mx.outputs["Result"]
    nt.links.new(col, b.inputs["Base Color"])
    return m


# ------------------------------------------------------------------ fir tree
def _sprig_mesh(name, needle_len=0.09, stations=60, per=5, rng=None):
    """One unit-length sprig along +X: twig + needles. Returned as a mesh datablock-bearing object
    (not linked to the scene)."""
    rng = rng or random.Random(1)
    verts, faces = [], []
    # twig: thin square tube
    tw = 0.006
    for i, x in enumerate((0.0, 1.0)):
        s = tw * (1 - 0.7 * x)
        verts += [(x, -s, -s), (x, s, -s), (x, s, s), (x, -s, s)]
    faces += [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    for k in range(stations):
        t = (k + 0.5) / stations
        for j in range(per):
            ang = 2 * math.pi * j / per + rng.uniform(-0.4, 0.4) + k * 0.9
            L = needle_len * (1.0 - 0.55 * t) * rng.uniform(0.8, 1.15)
            fwd = math.radians(rng.uniform(35, 60))
            d = Vector((math.cos(fwd), math.sin(fwd) * math.cos(ang), math.sin(fwd) * math.sin(ang)))
            # flatten the sprig a bit (firs are flat-ish sprays), more needles sideways
            d.z *= 0.6
            d.normalize()
            base = Vector((t, 0, 0))
            tip = base + d * L
            side = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((0, 1, 0))).normalized()
            up = d.cross(side).normalized()
            w = 0.0045
            i0 = len(verts)
            verts += [tuple(base + side * w), tuple(base - side * w * 0.5 + up * w * 0.87),
                      tuple(base - side * w * 0.5 - up * w * 0.87), tuple(tip)]
            faces += [(i0, i0 + 1, i0 + 3), (i0 + 1, i0 + 2, i0 + 3), (i0 + 2, i0, i0 + 3)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    return me


def _branch_mesh(name, seed=0):
    """Unit-length fir branch along +X: a main sprig plus a fishbone of side sprigs (one merged mesh)."""
    rng = random.Random(seed)
    sp = _sprig_mesh(name + "_sp", needle_len=0.16, stations=34, per=5, rng=random.Random(seed + 11))
    bm = bmesh.new()

    def put(p, d, length, roll=0.0):
        q = Vector((1, 0, 0)).rotation_difference(d.normalized())
        M = Matrix.Translation(p) @ q.to_matrix().to_4x4() @ Matrix.Rotation(roll, 4, "X") @ \
            Matrix.Diagonal((length, length, length, 1))
        tmp = sp.copy()
        tmp.transform(M)
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)

    put(Vector((0, 0, 0)), Vector((1, 0, 0)), 1.0)
    st = 11
    for i in range(st):
        f = 0.06 + 0.86 * i / (st - 1)
        for sgn in (-1, 1):
            ang = math.radians(rng.uniform(40, 62))
            d = Vector((math.cos(ang), sgn * math.sin(ang), rng.uniform(-0.25, 0.4)))
            L = 0.42 * (1 - 0.75 * f) * rng.uniform(0.8, 1.1)
            put(Vector((f, 0, 0)), d, L, rng.uniform(-0.3, 0.3))
        # sprigs pointing up and down fill the volume so the branch is not a flat fishbone
        put(Vector((f, 0, 0)), Vector((0.8, rng.uniform(-0.4, 0.4), rng.uniform(0.5, 0.9))), 0.26 * (1 - 0.6 * f),
            rng.uniform(-1, 1))
        if i % 2 == 0:
            put(Vector((f, 0, 0)), Vector((0.8, rng.uniform(-0.4, 0.4), -rng.uniform(0.3, 0.6))),
                0.22 * (1 - 0.6 * f), rng.uniform(-1, 1))
    bpy.data.meshes.remove(sp)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def _blob(name, size, m, rng):
    """Irregular lump (snow clump, cotton): a low-res sphere with scale baked, then noise-displaced."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    ox, oy, oz = rng.uniform(0, 50), rng.uniform(0, 50), rng.uniform(0, 50)
    from mathutils import noise
    for v in bm.verts:
        c = v.co.copy()
        n = noise.noise(Vector((c.x * 1.7 + ox, c.y * 1.7 + oy, c.z * 1.7 + oz)))
        v.co = Vector((c.x * size[0], c.y * size[1], max(c.z, -0.35) * size[2])) * (1 + 0.28 * n)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    link(o)
    o.data.materials.append(m)
    return o


def fir_tree(name, height=2.0, radius=0.8, loc=(0, 0, 0), seed=1, snow=0.0, needle_mat=None, trunk_mat=None,
             whorl_gap=0.065, droop=14.0, parent=None, density=1.0, return_tips=False, snow_pads=True):
    """Stylised but natural fir: trunk + whorls of instanced branch meshes (fishbone of needle sprigs).
    snow > 0 adds snow clumps along the branch tops and frosts the needles a little. Returns the root
    empty (and branch tips [(world pos, azimuth, height fraction)] when return_tips=True)."""
    rng = random.Random(seed)
    root = empty(name, loc, parent)
    nm = needle_mat or needles_mat("needles_snow" if snow else "needles", snow=snow)
    tm = trunk_mat or paint("bark", (0.045, 0.028, 0.018), rough=0.85, coat=0, var=0.3)
    variants = []
    for v in range(3):
        key = f"firbranch_{v}_{nm.name}"
        me = bpy.data.meshes.get(key)
        if me is None:
            me = _branch_mesh(key, seed=v)
            me.materials.append(nm)
        variants.append(me)
    tr = cyl(name + "_trunk", height * 0.016 + 0.008, height * 0.97, (0, 0, height * 0.485), tm, verts=12,
             r2=0.003, parent=root)
    snow_m = snow_mat()
    tips = []
    h0 = max(0.10, height * 0.10)
    n_whorls = int((height * 0.93 - h0) / whorl_gap * density)
    count = 0
    for w in range(n_whorls + 1):
        t = w / max(n_whorls, 1)
        z = h0 + (height * 0.93 - h0) * t
        L = radius * (1 - t) ** 0.92 + 0.05
        nb = max(4, int(round(8.5 - 3.5 * t + rng.uniform(-0.8, 0.8))))
        a0 = rng.uniform(0, 2 * math.pi)
        for k in range(nb):
            a = a0 + 2 * math.pi * k / nb + rng.uniform(-0.35, 0.35)
            dr = math.radians(droop * (1 - t) + rng.uniform(-6, 6) - 10 * t)
            Lb = L * rng.uniform(0.85, 1.08)
            M = (Matrix.Translation((0, 0, z)) @ Matrix.Rotation(a, 4, "Z") @ Matrix.Rotation(dr, 4, "Y")
                 @ Matrix.Rotation(rng.uniform(-0.6, 0.6), 4, "X") @ Matrix.Diagonal((Lb, Lb, Lb, 1)))
            o = bpy.data.objects.new(f"{name}_b{count}", variants[count % 3])
            count += 1
            link(o, root)
            o.matrix_basis = M
            d = Vector((math.cos(a) * math.cos(dr), math.sin(a) * math.cos(dr), -math.sin(dr)))
            tips.append((Vector(loc) + Vector((0, 0, z)) + d * Lb * 0.93, a, t))
            if snow and snow_pads and Lb > 0.1:
                for f, sz in ((0.3, 1.0), (0.58, 0.8), (0.82, 0.55)):
                    if rng.random() < 0.15:
                        continue
                    pc = Vector((0, 0, z)) + d * Lb * f + Vector((0, 0, 0.02 + Lb * 0.03 * sz))
                    sx, sy, sz_ = Lb * 0.24 * sz, Lb * 0.15 * sz, 0.014 + Lb * 0.024 * sz
                    pad = _blob(f"{name}_pad{count}_{f}", (sx, sy, sz_), snow_m, rng)
                    pad.parent = root
                    pad.location = pc
                    pad.rotation_euler = (0, dr, a)
    # leader
    o = bpy.data.objects.new(f"{name}_leader", variants[0])
    link(o, root)
    s = height * 0.12
    o.matrix_basis = Matrix.Translation((0, 0, height * 0.9)) @ Matrix.Rotation(-math.pi / 2, 4, "Y") @ \
        Matrix.Diagonal((s, s, s, 1))
    if return_tips:
        return root, tips
    return root


# ------------------------------------------------------------------ snowfall
def snowfall(name, count, lo, hi, rmin=0.004, rmax=0.012, seed=3, mat=None):
    """Falling snow: a point cloud (Cycles renders points as spheres) filling the box lo..hi."""
    rng = random.Random(seed)
    verts = [(rng.uniform(lo[0], hi[0]), rng.uniform(lo[1], hi[1]), rng.uniform(lo[2], hi[2])) for _ in range(count)]
    o = mesh_obj(name, verts, [])
    radius = o.data.attributes.new("rad", "FLOAT", "POINT")
    for i in range(count):
        radius.data[i].value = rng.uniform(rmin, rmax)
    ng = bpy.data.node_groups.new(name + "_gn", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    gi = ng.nodes.new("NodeGroupInput")
    go = ng.nodes.new("NodeGroupOutput")
    m2p = ng.nodes.new("GeometryNodeMeshToPoints")
    attr = ng.nodes.new("GeometryNodeInputNamedAttribute")
    attr.data_type = "FLOAT"
    attr.inputs["Name"].default_value = "rad"
    sm = ng.nodes.new("GeometryNodeSetMaterial")
    sm.inputs["Material"].default_value = mat or K.mat("snowflake", (0.95, 0.97, 1.0), rough=0.6, sss=0.4)
    ng.links.new(gi.outputs[0], m2p.inputs["Mesh"])
    ng.links.new(attr.outputs[0], m2p.inputs["Radius"])
    ng.links.new(m2p.outputs[0], sm.inputs["Geometry"])
    ng.links.new(sm.outputs[0], go.inputs[0])
    md = o.modifiers.new("gn", "NODES")
    md.node_group = ng
    return o


# ------------------------------------------------------------------ scene helpers
def setup(w=1920, h=1080, fast=False, samples=256, exposure=0.0, look="AgX - Medium High Contrast"):
    K.reset()
    sc = K.render_setup(w, h, engine="CYCLES", samples=48 if fast else samples, exposure=exposure, look=look)
    sc.cycles.adaptive_threshold = 0.05 if fast else 0.015
    sc.cycles.max_bounces = 6
    sc.cycles.transparent_max_bounces = 16
    sc.cycles.transmission_bounces = 8
    sc.render.resolution_percentage = 50 if fast else 100
    sc.cycles.sample_clamp_indirect = 8.0
    return sc


def save_jpg(png, jpg, quality=88, w=1920, h=1080):
    from subprocess import run
    py = "/Users/javi/PythonEnv/bin/python"
    code = ("from PIL import Image;import sys;im=Image.open(sys.argv[1]).convert('RGB');"
            f"im=im.resize(({w},{h}),Image.LANCZOS) if im.size!=({w},{h}) else im;"
            f"im.save(sys.argv[2],quality={quality},optimize=True,progressive=True)")
    os.makedirs(os.path.dirname(jpg), exist_ok=True)
    run([py, "-c", code, png, jpg], check=True)
    print("JPG", jpg, flush=True)


def import_ph(asset, name=None, parent=None, drop=()):
    """Import a Poly Haven glTF from the shared library. drop: substrings of mesh names to delete."""
    import glob
    path = glob.glob(f"{MOD}/{asset}/*.gltf")[0]
    r = K.import_model(path, name=name or asset)
    for o in list(K.meshes(r)):
        if any(s in o.name for s in drop):
            bpy.data.objects.remove(o)
    if parent is not None:
        r.parent = parent
    return r


def make_holdout_others(keep):
    """For sprite renders: everything except `keep` is invisible to camera but still lights/shadows."""
    keep = set(keep)
    for o in bpy.context.scene.objects:
        if o.type in ("MESH", "CURVE") and o not in keep:
            o.visible_camera = False


def bloom(strength=0.35, threshold=1.0, size=7, kind="FOG_GLOW"):
    """Soft glow around bright lights (compositor Glare). Works in background renders."""
    sc = bpy.context.scene
    sc.use_nodes = True
    nt = sc.node_tree
    nt.nodes.clear()
    rl = nt.nodes.new("CompositorNodeRLayers")
    gl = nt.nodes.new("CompositorNodeGlare")
    out = nt.nodes.new("CompositorNodeComposite")
    gl.glare_type = kind
    for k, v in (("Threshold", threshold), ("Strength", strength), ("Size", size / 9.0)):
        if k in gl.inputs:
            gl.inputs[k].default_value = v
    for k, v in (("threshold", threshold), ("size", size), ("quality", "HIGH")):
        try:
            setattr(gl, k, v)
        except Exception:
            pass
    if "Strength" not in gl.inputs:
        try:
            gl.mix = strength * 2 - 1
        except Exception:
            pass
    nt.links.new(rl.outputs["Image"], gl.inputs["Image"])
    nt.links.new(gl.outputs["Image"], out.inputs["Image"])
    if "Alpha" in rl.outputs and "Alpha" in out.inputs:
        nt.links.new(rl.outputs["Alpha"], out.inputs["Alpha"])
    print("BLOOM inputs", [i.name for i in gl.inputs], flush=True)
    return gl


def glow_glass(name, k=2000, strength=3.0, rough=0.35):
    """Lantern glass lit from inside: frosted transmission + warm emission (reads as a glowing pane)."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = K.mat(name, K.kelvin(k), rough=rough, transmission=1.0, ior=1.45, emit=K.kelvin(k), emit_strength=strength)
    return m


def swap_glass(root, m):
    for o in K.meshes(root):
        for s in o.material_slots:
            if s.material and "glass" in s.material.name.lower():
                s.material = m
        o.visible_shadow = False

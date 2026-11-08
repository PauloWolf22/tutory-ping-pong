"""Personagens do app (GLBs de app/assets/humans) montados no Blender para o vídeo da home."""
import bpy, os
from mathutils import Vector, Matrix, Quaternion

HUMANS = None
BRAND = None


def setup(app_dir):
    global HUMANS, BRAND
    HUMANS = os.path.join(app_dir, 'assets', 'humans')
    BRAND = os.path.join(app_dir, 'assets', 'brand')


def _import(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def _srgb_to_lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_color(h):
    h = h.lstrip('#')
    return (*[_srgb_to_lin(int(h[i:i + 2], 16)) for i in (0, 2, 4)], 1.0)


BELT = {'Branca': '#eeeeea', 'Azul': '#1f4fd1', 'Roxa': '#6b2fa3', 'Marrom': '#6b3e1f', 'Preta': '#141414'}


def tutory_material(name, color, belt='Branca', logo=True):
    """Mesma lógica do shader do app: faixa por UV e logo no peito e nas costas."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    bsdf = N['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.85
    uv = N.new('ShaderNodeUVMap')
    sep = N.new('ShaderNodeSeparateXYZ')
    L.new(uv.outputs['UV'], sep.inputs[0])
    base = N.new('ShaderNodeRGB')
    base.outputs[0].default_value = hex_color(color)
    beltc = N.new('ShaderNodeRGB')
    beltc.outputs[0].default_value = hex_color(BELT.get(belt, BELT['Branca']))
    is_belt = N.new('ShaderNodeMath')
    is_belt.operation = 'GREATER_THAN'
    is_belt.inputs[1].default_value = 0.85
    L.new(sep.outputs['X'], is_belt.inputs[0])
    mix = N.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    L.new(is_belt.outputs[0], mix.inputs['Factor'])
    L.new(base.outputs[0], mix.inputs['A'])
    L.new(beltc.outputs[0], mix.inputs['B'])
    out_col = mix.outputs['Result']
    if logo:
        img = bpy.data.images.load(os.path.join(BRAND, 'logo-branco.png'), check_existing=True)
        lum = sum(hex_color(color)[:3]) / 3
        tint = (0.012, 0.1, 0.75, 1) if lum > 0.4 else (1, 1, 1, 1)
        for (cu, cv, hw, hh) in ((0.15, 0.69, 0.054, 0.0105), (0.45, 0.70, 0.082, 0.016)):
            mp = N.new('ShaderNodeMapping')
            mp.inputs['Location'].default_value = (0.5 - cu / (2 * hw), 0.5 - cv / (2 * hh), 0)
            mp.inputs['Scale'].default_value = (1 / (2 * hw), 1 / (2 * hh), 1)
            L.new(uv.outputs['UV'], mp.inputs['Vector'])
            tex = N.new('ShaderNodeTexImage')
            tex.image = img
            tex.extension = 'CLIP'
            L.new(mp.outputs['Vector'], tex.inputs['Vector'])
            m2 = N.new('ShaderNodeMix')
            m2.data_type = 'RGBA'
            m2.inputs['B'].default_value = tint
            L.new(tex.outputs['Alpha'], m2.inputs['Factor'])
            L.new(out_col, m2.inputs['A'])
            out_col = m2.outputs['Result']
    L.new(out_col, bsdf.inputs['Base Color'])
    return m


def _tint(mat, color):
    nt = mat.node_tree
    b = nt.nodes.get('Principled BSDF')
    if not b:
        return
    tex = next((n for n in nt.nodes if n.type == 'TEX_IMAGE'), None)
    if tex:
        mixn = nt.nodes.new('ShaderNodeMix')
        mixn.data_type = 'RGBA'
        mixn.blend_type = 'MULTIPLY'
        mixn.inputs['Factor'].default_value = 1.0
        nt.links.new(tex.outputs['Color'], mixn.inputs['A'])
        mixn.inputs['B'].default_value = hex_color(color)
        nt.links.new(mixn.outputs['Result'], b.inputs['Base Color'])
    else:
        b.inputs['Base Color'].default_value = hex_color(color)


def hide_covered_skin(body, gender, parts):
    """Como o app: apaga as faces da pele que as roupas vestidas cobrem (bits em _MASKA/_MASKB)."""
    import json, bmesh
    meta = json.load(open(os.path.join(HUMANS, f'human_{gender}.json'), encoding='utf8'))
    a = b = 0
    for cat in ('full', 'top', 'bottom', 'shoes'):
        e = next((x for x in meta['catalog'].get(cat, []) if x['name'] == parts.get(cat)), None)
        if e and 'bitA' in e:
            a |= 1 << e['bitA']
        if e and 'bitB' in e:
            b |= 1 << e['bitB']
    attrs = body.data.attributes
    ma = [int(d.value) for d in attrs['_MASKA'].data] if '_MASKA' in attrs else None
    mb = [int(d.value) for d in attrs['_MASKB'].data] if '_MASKB' in attrs else None
    hidden = lambda i: (ma and ma[i] & a) or (mb and mb[i] & b)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    gone = [f for f in bm.faces if any(hidden(v.index) for v in f.verts)]
    bmesh.ops.delete(bm, geom=gone, context='FACES_ONLY')
    bm.to_mesh(body.data)
    bm.free()


def character(name, gender='male', parts=None, colors=None, morph=None, skin='clara', belt='Branca', hair_color='#2a1a10', location=(0, 0, 0), rot_z=0.0):
    """Monta corpo e peças num esqueleto só. Devolve (armature, malhas)."""
    parts = parts or {}
    colors = colors or {}
    objs = _import(os.path.join(HUMANS, gender, 'base.glb'))
    arm = next(o for o in objs if o.type == 'ARMATURE')
    arm.name = name
    meshes = [o for o in objs if o.type == 'MESH']
    body = max(meshes, key=lambda o: len(o.data.vertices))
    skin_img = bpy.data.images.load(os.path.join(HUMANS, f'skin_{gender}_{skin}.jpg'), check_existing=True)
    for slot in body.material_slots:
        for n in slot.material.node_tree.nodes:
            if n.type == 'TEX_IMAGE':
                n.image = skin_img
        bsdf = slot.material.node_tree.nodes.get('Principled BSDF')
        if bsdf:
            bsdf.inputs['Roughness'].default_value = 0.55
            if 'Subsurface Weight' in bsdf.inputs:
                bsdf.inputs['Subsurface Weight'].default_value = 0.12
    for cat, piece in parts.items():
        if not piece:
            continue
        new = _import(os.path.join(HUMANS, gender, piece + '.glb'))
        for o in new:
            if o.type == 'MESH':
                o.parent = arm
                o.matrix_parent_inverse = Matrix.Identity(4)
                for md in o.modifiers:
                    if md.type == 'ARMATURE':
                        md.object = arm
                if piece.startswith('tutory_'):
                    o.data.materials.clear()
                    o.data.materials.append(tutory_material(f'{name}_{piece}', colors.get(cat, '#f2f2f2'), belt))
                elif cat in ('hair', 'beard'):
                    for slot in o.material_slots:
                        _tint(slot.material, hair_color)
                elif colors.get(cat):
                    for slot in o.material_slots:
                        _tint(slot.material, colors[cat])
                meshes.append(o)
        for o in new:
            if o.type != 'MESH':
                bpy.data.objects.remove(o)
    # esferas de exibição dos ossos que o importador cria: não entram no render
    icos = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Icosphere')]
    meshes = [o for o in meshes if o not in icos]
    for o in icos:
        bpy.data.objects.remove(o)
    for o in meshes:
        keys = o.data.shape_keys
        if keys:
            for kb in keys.key_blocks[1:]:
                kb.value = (morph or {}).get(kb.name, 0.0)
    hide_covered_skin(body, gender, parts)
    # o glTF traz tudo como transparente (BLENDED): no render isso cria manchas escuras de ordenação.
    # Pele opaca; peças com recorte (cabelo, sobrancelha, cílios) em modo pontilhado.
    for o in meshes:
        for slot in o.material_slots:
            m = slot.material
            if not m:
                continue
            b = m.node_tree.nodes.get('Principled BSDF')
            if o is body and b:
                for l in list(b.inputs['Alpha'].links):
                    m.node_tree.links.remove(l)
                b.inputs['Alpha'].default_value = 1.0
            if hasattr(m, 'surface_render_method'):
                m.surface_render_method = 'DITHERED'
            if o is body and hasattr(m, 'blend_method'):
                m.blend_method = 'OPAQUE'
    arm.location = location
    arm.rotation_mode = 'XYZ'
    arm.rotation_euler[2] += rot_z
    bpy.context.view_layer.update()
    return arm, meshes


# ---------------------------------------------------------------- pose (direções no mundo)
def _bone_dir(arm, pb):
    m = arm.matrix_world @ pb.matrix
    return (m.to_3x3() @ Vector((0, 1, 0))).normalized()


def aim(arm, bone, direction):
    """Gira o osso para apontar na direção dada (mundo), com a cabeça do osso parada."""
    pb = arm.pose.bones[bone]
    bpy.context.view_layer.update()
    cur = _bone_dir(arm, pb)
    q = cur.rotation_difference(Vector(direction).normalized())
    world = arm.matrix_world @ pb.matrix
    head = world.to_translation()
    new_world = Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head) @ world
    pb.matrix = arm.matrix_world.inverted() @ new_world
    bpy.context.view_layer.update()


def turn(arm, bone, axis, angle):
    pb = arm.pose.bones[bone]
    bpy.context.view_layer.update()
    world = arm.matrix_world @ pb.matrix
    head = world.to_translation()
    q = Quaternion(Vector(axis).normalized(), angle)
    new_world = Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head) @ world
    pb.matrix = arm.matrix_world.inverted() @ new_world
    bpy.context.view_layer.update()


def reset(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    bpy.context.view_layer.update()


def key(arm, frame):
    for pb in arm.pose.bones:
        pb.keyframe_insert('rotation_quaternion', frame=frame)
        pb.keyframe_insert('location', frame=frame)


def local_dir(arm, v):
    """Direção no espaço do personagem para o mundo. v = (direita, frente, cima); o personagem olha para -Y e a esquerda dele é +X."""
    v = Vector((-v[0], -v[1], v[2]))
    return (arm.matrix_world.to_3x3().normalized() @ Vector(v)).normalized()

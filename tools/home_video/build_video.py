"""
Vídeo de abertura da home do Tutory Sports, renderizado no Blender com os avatares do próprio app.

  blender -b --factory-startup --python tools/home_video/build_video.py -- <saida_frames> [--preview] [--still N ...] [--save arquivo.blend]

Seis cenas em sequência, 24 fps, cerca de 19 s, feito para tocar em loop sem som:
  1 abertura com a logo   2 ping pong   3 jiu-jitsu   4 futebol   5 TUTORY Gaming   6 pódio e comemoração
Cada cena fica num canto do mundo, com câmera própria; marcadores trocam a câmera no corte.
"""
import bpy, sys, os, math, random
from mathutils import Vector, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(HERE)
import chars as C

APP = os.path.abspath(os.path.join(HERE, '..', '..', 'app'))
C.setup(APP)
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.join(HERE, 'frames')
PREVIEW = '--preview' in argv
STILLS = [int(argv[i + 1]) for i, a in enumerate(argv) if a == '--still']
SAVE = argv[argv.index('--save') + 1] if '--save' in argv else None

FPS = 24
SHOTS = [  # nome, início, fim (inclusive)
    ('logo', 1, 72), ('pingpong', 73, 156), ('jiujitsu', 157, 240), ('futebol', 241, 312), ('gaming', 313, 372), ('podio', 373, 456),
]
END = SHOTS[-1][2]
random.seed(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = FPS
sc.frame_start, sc.frame_end = 1, END
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x, sc.render.resolution_y = (640, 360) if '--small' in argv else (960, 540) if PREVIEW else (1920, 1080)
sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'AgX'
try:
    sc.view_settings.look = 'AgX - Medium High Contrast'
except TypeError:
    pass
ee = sc.eevee
ee.taa_render_samples = 16 if PREVIEW else 48
for attr, val in (('use_shadows', True), ('use_raytracing', not PREVIEW), ('volumetric_tile_size', '8'), ('volumetric_samples', 48)):
    if hasattr(ee, attr):
        try:
            setattr(ee, attr, val)
        except Exception:
            pass

# mundo escuro com névoa leve (dá volume às luzes)
world = bpy.data.worlds.new('arena')
sc.world = world
world.use_nodes = True
wn = world.node_tree
wn.nodes['Background'].inputs[0].default_value = (0.004, 0.007, 0.018, 1)
wn.nodes['Background'].inputs[1].default_value = 1.0
vol = wn.nodes.new('ShaderNodeVolumePrincipled')
vol.inputs['Density'].default_value = 0.012
vol.inputs['Color'].default_value = (0.55, 0.65, 1.0, 1)
wn.links.new(vol.outputs[0], wn.nodes['World Output'].inputs['Volume'])

col = C.hex_color


def mat(name, color, rough=0.5, metal=0.0, emit=None, strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = col(color)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = col(emit)
        b.inputs['Emission Strength'].default_value = strength
    return m


def box(name, size, loc, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    o.data.materials.append(material)
    return o


def cyl(name, r, h, loc, material, rot=(0, 0, 0), verts=32):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material)
    return o


def sphere(name, r, loc, material):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=24, ring_count=12)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return o


def light(name, kind, loc, energy, color='#ffffff', rot=None, size=None, spot=None, target=None):
    d = bpy.data.lights.new(name, kind)
    d.energy = energy
    d.color = col(color)[:3]
    if size is not None:
        if kind == 'AREA':
            d.size = size
        else:
            d.shadow_soft_size = size
    if spot is not None and kind == 'SPOT':
        d.spot_size = spot
        d.spot_blend = 0.4
    o = bpy.data.objects.new(name, d)
    sc.collection.objects.link(o)
    o.location = loc
    if target is not None:
        o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    elif rot:
        o.rotation_euler = rot
    return o


def camera(name, lens=35, dof=None):
    c = bpy.data.objects.new(name, bpy.data.cameras.new(name))
    sc.collection.objects.link(c)
    c.data.lens = lens
    c.data.clip_start, c.data.clip_end = 0.05, 200
    if dof:
        c.data.dof.use_dof = True
        c.data.dof.aperture_fstop = dof
    return c


def look(c, loc, target, frame=None):
    c.location = loc
    c.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    if frame is not None:
        c.keyframe_insert('location', frame=frame)
        c.keyframe_insert('rotation_euler', frame=frame)


def ease_all(obj):
    ad = obj.animation_data
    if ad and ad.action:
        for fc in getattr(ad.action, 'fcurves', []):
            for k in fc.keyframe_points:
                k.interpolation = 'BEZIER'
                k.easing = 'AUTO'


def bind(c, frame, name):
    m = sc.timeline_markers.new(name, frame=frame)
    m.camera = c


def attach(obj, arm, bone):
    """Prende um objeto ao osso mantendo a posição atual no mundo."""
    bpy.context.view_layer.update()
    mw = obj.matrix_world.copy()
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = bone
    bpy.context.view_layer.update()
    obj.matrix_world = mw


def hand_pos(arm, side='r'):
    bpy.context.view_layer.update()
    pb = arm.pose.bones['middle_01_' + side]
    return arm.matrix_world @ pb.head


D = C.local_dir


def stance(arm, crouch=0.0):
    """Base atlética: joelhos levemente flexionados."""
    for s in 'lr':
        C.aim(arm, 'thigh_' + s, D(arm, (0.08 if s == 'r' else -0.08, 0.35 * crouch + 0.02, -1)))
        C.aim(arm, 'calf_' + s, D(arm, (0.04 if s == 'r' else -0.04, -0.25 * crouch, -1)))
        C.aim(arm, 'foot_' + s, D(arm, (0, 1, -0.35)))


def arms(arm, side, upper, lower):
    C.aim(arm, 'upperarm_' + side, D(arm, upper))
    C.aim(arm, 'lowerarm_' + side, D(arm, lower))


def torso(arm, twist=0.0, lean=0.0):
    up = Vector((0, 0, 1))
    C.turn(arm, 'spine_01', D(arm, (1, 0, 0)), lean)
    C.turn(arm, 'spine_02', up, twist * 0.5)
    C.turn(arm, 'spine_03', up, twist * 0.5)


# ---------------------------------------------------------------- cena 1: abertura com a logo
def shot_logo(x0, f0, f1):
    floor = mat('piso_logo', '#05070d', rough=0.15, metal=0.6)
    box('chao_logo', (14, 14, 0.1), (x0, 0, -0.05), floor)
    logo_img = bpy.data.images.load(os.path.join(C.BRAND, 'logo-branco.png'), check_existing=True)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(x0, 0, 1.6), rotation=(math.pi / 2, 0, 0))
    plane = bpy.context.object
    plane.name = 'logo'
    plane.scale = (4.2, 4.2 / (1920 / 452), 1)
    m = bpy.data.materials.new('logo_mat')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes['Principled BSDF'])
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = logo_img
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (0.75, 0.85, 1.0, 1)
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(tex.outputs['Alpha'], mix.inputs['Fac'])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
    plane.data.materials.append(m)
    # a logo acende: 0 -> 6 entre f0+10 e f0+40
    s = em.inputs['Strength']
    s.default_value = 0.0
    s.keyframe_insert('default_value', frame=f0 + 8)
    s.default_value = 7.0
    s.keyframe_insert('default_value', frame=f0 + 40)
    # duas luzes varrendo a névoa
    for i, (c, sx) in enumerate((('#3b7bf5', -1), ('#9ebcff', 1))):
        L = light(f'varredura{i}', 'SPOT', (x0 + sx * 3.5, 3.5, 5.5), 4000, c, spot=math.radians(18), size=0.2)
        L.rotation_euler = (Vector((x0 - sx * 2.5, -1, 0)) - L.location).to_track_quat('-Z', 'Y').to_euler()
        L.keyframe_insert('rotation_euler', frame=f0)
        L.rotation_euler = (Vector((x0 + sx * 1.5, -1, 0.5)) - L.location).to_track_quat('-Z', 'Y').to_euler()
        L.keyframe_insert('rotation_euler', frame=f1)
    light('contra_logo', 'POINT', (x0, 1.2, 1.6), 300, '#3b7bf5', size=0.5)
    bpy.ops.object.text_add(location=(x0, 0, 0.85), rotation=(math.pi / 2, 0, 0))
    sp = bpy.context.object
    sp.data.body = 'S  P  O  R  T  S'
    sp.data.align_x = 'CENTER'
    sp.data.size = 0.36
    sp_m = mat('sports_txt', '#ffffff', emit='#9ebcff', strength=0.0)
    sp.data.materials.append(sp_m)
    st = sp_m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
    st.keyframe_insert('default_value', frame=f0 + 26)
    st.default_value = 5.0
    st.keyframe_insert('default_value', frame=f0 + 50)
    cam = camera('cam_logo', 40)
    look(cam, (x0, -9.5, 1.7), (x0, 0, 1.6), f0)
    look(cam, (x0, -6.4, 1.62), (x0, 0, 1.6), f1)
    ease_all(cam)
    bind(cam, f0, 'logo')


# ---------------------------------------------------------------- cena 2: ping pong
def shot_pingpong(x0, f0, f1):
    floor = mat('piso_pp', '#0b1530', rough=0.35)
    box('chao_pp', (12, 12, 0.1), (x0, 0, -0.05), floor)
    blue = mat('mesa', '#0d3fa8', rough=0.35)
    white = mat('linha', '#f2f2f2', rough=0.5)
    black = mat('preto', '#111318', rough=0.6)
    box('mesa', (1.525, 2.74, 0.04), (x0, 0, 0.74), blue)
    box('linha_meio', (0.006, 2.74, 0.042), (x0, 0, 0.741), white)
    box('rede', (1.83, 0.01, 0.15), (x0, 0, 0.835), mat('rede', '#e9edf5', rough=0.8))
    for sx in (-0.6, 0.6):
        for sy in (-1.1, 1.1):
            box('pe', (0.06, 0.06, 0.72), (x0 + sx, sy, 0.36), black)
    a, _ = C.character('pp_a', 'male', {'top': 'tutory_jersey', 'bottom': 'tutory_shorts', 'hair': 'short02', 'shoes': 'shoes01'},
                       {'top': '#0040c8', 'bottom': '#15171c'}, skin='oriental', location=(x0 - 0.15, -2.15, 0), rot_z=math.pi)
    b, _ = C.character('pp_b', 'female', {'top': 'tutory_jersey_f', 'bottom': 'tutory_shorts_f', 'hair': 'ponytail01', 'shoes': 'shoes03'},
                       {'top': '#c0262d', 'bottom': '#15171c'}, skin='negra', hair_color='#141010', location=(x0 + 0.1, 2.15, 0))
    rk_mat = mat('borracha', '#c0262d', rough=0.7)
    paddles = []
    for arm in (a, b):
        C.reset(arm)
        # raquete na mão direita
        p = cyl('raquete_' + arm.name, 0.075, 0.012, (0, 0, 0), rk_mat, verts=32)
        paddles.append(p)
    # golpes: forehand alternado, 1 troca a cada 14 quadros
    T = 14
    ball = sphere('bola', 0.02, (x0, 0, 1.0), mat('bola', '#ffffff', rough=0.3, emit='#fff6e0', strength=0.6))
    frames = list(range(f0, f1 + 1, T))
    for i, f in enumerate(frames):
        for j, arm in enumerate((a, b)):
            hitting = (i + j) % 2 == 0
            C.reset(arm)
            stance(arm, 0.55)
            torso(arm, twist=(0.35 if hitting else -0.15), lean=0.25)
            if hitting:
                arms(arm, 'r', (0.55, 0.65, -0.2), (0.25, 1.0, 0.25))
            else:
                arms(arm, 'r', (0.75, 0.2, -0.45), (0.35, 0.75, 0.1))
            arms(arm, 'l', (-0.5, 0.45, -0.75), (-0.3, 0.9, -0.1))
            C.aim(arm, 'head', D(arm, (0, 0.15, 1)))
            C.key(arm, f)
        # bola: sai da raquete de quem bate e quica do outro lado
        src_y = -1.55 if i % 2 == 0 else 1.55
        ball.location = (x0 + random.uniform(-0.25, 0.25), src_y, 0.98)
        ball.keyframe_insert('location', frame=f)
        ball.location = (x0 + random.uniform(-0.3, 0.3), -src_y * 0.45, 0.76)
        ball.keyframe_insert('location', frame=f + T * 0.6)
    for arm, p in zip((a, b), paddles):
        bpy.context.scene.frame_set(f0)
        p.location = hand_pos(arm)
        p.rotation_euler = (math.pi / 2, 0, 0)
        attach(p, arm, 'hand_r')
    light('key_pp', 'AREA', (x0 + 2.5, -1.5, 4.2), 900, '#fff1e2', size=2.5, target=(x0, 0, 0.8))
    light('rim_pp', 'SPOT', (x0 - 3, 3.5, 3.5), 2500, '#3b7bf5', spot=math.radians(40), size=0.3, target=(x0, 0, 1.0))
    light('top_pp', 'SPOT', (x0, 0, 5.5), 1800, '#ffffff', spot=math.radians(55), size=0.5, target=(x0, 0, 0.7))
    cam = camera('cam_pp', 32, dof=4.0)
    cam.data.dof.focus_distance = 4.6
    look(cam, (x0 + 1.25, -4.6, 1.6), (x0 - 0.2, 0.4, 0.95), f0)
    look(cam, (x0 + 2.1, -4.0, 1.35), (x0 - 0.2, 0.6, 1.0), f1)
    ease_all(cam)
    bind(cam, f0, 'pingpong')


# ---------------------------------------------------------------- cena 3: jiu-jitsu
def shot_jiujitsu(x0, f0, f1):
    box('tatame', (6, 6, 0.06), (x0, 0, 0.0), mat('tatame', '#123a8a', rough=0.8))
    box('tatame_borda', (6.6, 6.6, 0.04), (x0, 0, -0.01), mat('tatame_borda', '#0a1530', rough=0.8))
    box('chao_jj', (14, 14, 0.1), (x0, 0, -0.08), mat('piso_jj', '#05070d', rough=0.4))
    a, _ = C.character('jj_a', 'male', {'full': 'tutory_gi', 'hair': 'short02'}, {'full': '#f2f2f2'}, belt='Roxa', skin='clara', hair_color='#3a2416', location=(x0, -0.75, 0.03), rot_z=math.pi)
    b, _ = C.character('jj_b', 'male', {'full': 'tutory_gi', 'hair': 'short01', 'beard': 'elvs_scruffy_beard1'}, {'full': '#1f4fd1'}, belt='Preta', skin='negra', hair_color='#141010', location=(x0, 0.75, 0.03))
    keys = list(range(f0, f1 + 1, 21))
    for i, f in enumerate(keys):
        for j, arm in enumerate((a, b)):
            C.reset(arm)
            phase = (i + j) % 2
            stance(arm, 0.95)
            torso(arm, twist=0.12 if phase else -0.12, lean=0.42)
            # pegada: cotovelos dobrados, mãos na altura do peito do adversário, alternando
            arms(arm, 'r', (0.35, 0.55 if phase else 0.35, -0.75), (-0.15, 1.0, 0.55 if phase else 0.85))
            arms(arm, 'l', (-0.35, 0.35 if phase else 0.55, -0.75), (0.15, 1.0, 0.85 if phase else 0.55))
            C.aim(arm, 'head', D(arm, (0, 0.35, 1)))
            C.key(arm, f)
        # circulam devagar um em volta do outro
        for arm, base in ((a, -0.75), (b, 0.75)):
            ang = (f - f0) / (f1 - f0) * 0.6
            arm.location = (x0 + math.sin(ang) * base, math.cos(ang) * base, 0.03)
            arm.rotation_euler[2] = (math.pi if base < 0 else 0) - ang
            arm.keyframe_insert('location', frame=f)
            arm.keyframe_insert('rotation_euler', frame=f)
    light('key_jj', 'SPOT', (x0 + 2.5, -2.5, 4.5), 3000, '#fff1e2', spot=math.radians(45), size=0.4, target=(x0, 0, 0.8))
    light('rim_jj', 'SPOT', (x0 - 3, 2.5, 3.0), 2500, '#3b7bf5', spot=math.radians(45), size=0.3, target=(x0, 0, 1.0))
    light('top_jj', 'AREA', (x0, 0, 4.0), 600, '#dfe8ff', size=3, target=(x0, 0, 0))
    cam = camera('cam_jj', 30, dof=3.5)
    cam.data.dof.focus_distance = 3.3
    look(cam, (x0 + 3.0, -1.4, 0.75), (x0, 0, 1.0), f0)
    look(cam, (x0 + 2.4, 2.0, 0.85), (x0, 0, 1.0), f1)
    ease_all(cam)
    bind(cam, f0, 'jiujitsu')


# ---------------------------------------------------------------- cena 4: futebol
def shot_futebol(x0, f0, f1):
    grass = mat('grama', '#1d6b34', rough=0.9)
    box('campo', (16, 16, 0.1), (x0, 0, -0.05), grass)
    for i in range(-7, 8, 2):
        box(f'faixa{i}', (16, 1, 0.101), (x0, i, -0.049), mat(f'grama2_{i}', '#1a5f2e', rough=0.9))
    white = mat('trave', '#f5f5f5', rough=0.4)
    gx, gy = x0, 5.0
    for sx in (-1.83, 1.83):
        cyl('poste', 0.06, 2.44, (gx + sx, gy, 1.22), white)
    cyl('travessao', 0.06, 3.78, (gx, gy, 2.44), white, rot=(0, math.pi / 2, 0))
    net = mat('rede_gol', '#dfe6f0', rough=0.9)
    net.blend_method = 'BLEND' if hasattr(net, 'blend_method') else None
    box('rede_fundo', (3.7, 0.02, 2.4), (gx, gy + 1.2, 1.2), net)
    p, _ = C.character('fb', 'male', {'top': 'tutory_jersey', 'bottom': 'tutory_shorts', 'hair': 'afro01', 'shoes': 'shoes02'},
                       {'top': '#f2f2f2', 'bottom': '#0040c8'}, skin='negra', hair_color='#141010', location=(x0 - 0.35, -1.4, 0), rot_z=math.pi)
    ball = sphere('bola_fut', 0.11, (x0, -0.75, 0.11), mat('bola_fut', '#f4f4f4', rough=0.4))
    # corrida, preparação e chute
    t_run, t_back, t_kick, t_follow = f0, f0 + 22, f0 + 32, f0 + 44
    seq = ((t_run, 'run'), (f0 + 11, 'run2'), (t_back, 'back'), (t_kick, 'kick'), (t_follow, 'follow'), (f1, 'follow'))
    for f, pose in seq:
        C.reset(p)
        stance(p, 0.4)
        if pose in ('run', 'run2'):
            s = 'r' if pose == 'run' else 'l'
            o = 'l' if s == 'r' else 'r'
            C.aim(p, 'thigh_' + s, D(p, (0, 0.8, -0.6)))
            C.aim(p, 'calf_' + s, D(p, (0, -0.2, -1)))
            C.aim(p, 'thigh_' + o, D(p, (0, -0.45, -1)))
            C.aim(p, 'calf_' + o, D(p, (0, -0.8, -0.6)))
            arms(p, o, (0.3 if o == 'r' else -0.3, 0.6, -0.8), (0, 1, 0.3))
            arms(p, s, (0.3 if s == 'r' else -0.3, -0.5, -0.8), (0, 0.4, -0.6))
            torso(p, lean=0.25)
        elif pose == 'back':
            C.aim(p, 'thigh_r', D(p, (0.05, -0.55, -1)))
            C.aim(p, 'calf_r', D(p, (0, -1, -0.4)))
            arms(p, 'l', (-0.9, 0.3, -0.2), (-0.6, 0.6, 0.2))
            arms(p, 'r', (0.6, -0.3, -0.6), (0.3, 0.2, -0.8))
            torso(p, twist=0.3, lean=0.2)
        else:
            C.aim(p, 'thigh_r', D(p, (0.05, 1.0, -0.35 if pose == 'kick' else 0.05)))
            C.aim(p, 'calf_r', D(p, (0, 1.0, -0.6 if pose == 'kick' else -0.1)))
            arms(p, 'l', (-0.9, -0.1, 0.0), (-0.7, 0.4, 0.4))
            arms(p, 'r', (0.6, 0.5, -0.5), (0.3, 0.8, -0.2))
            torso(p, twist=-0.3, lean=-0.1)
        C.key(p, f)
    p.location = (x0 - 0.35, -2.6, 0)
    p.keyframe_insert('location', frame=t_run)
    p.location = (x0 - 0.3, -1.05, 0)
    p.keyframe_insert('location', frame=t_kick)
    ball.keyframe_insert('location', frame=t_kick)
    ball.location = (x0 + 0.9, gy + 0.9, 1.7)
    ball.keyframe_insert('location', frame=t_kick + 20)
    ball.location = (x0 + 0.95, gy + 1.05, 0.4)
    ball.keyframe_insert('location', frame=f1)
    ball.rotation_euler = (0, 0, 0)
    ball.keyframe_insert('rotation_euler', frame=t_kick)
    ball.rotation_euler = (12, 3, 0)
    ball.keyframe_insert('rotation_euler', frame=f1)
    light('sol_fb', 'SUN', (x0, 0, 10), 5.5, '#fff4e5', rot=(math.radians(55), 0, math.radians(-30)))
    light('fill_fb', 'AREA', (x0 + 3, -3, 2.5), 600, '#cfe0ff', size=4, target=(x0, -1, 1))
    light('rim_fb', 'SPOT', (x0 + 4, 4, 4), 2500, '#9ebcff', spot=math.radians(45), size=0.4, target=(x0, -1, 1))
    cam = camera('cam_fb', 28, dof=5.6)
    cam.data.dof.focus_distance = 3.2
    look(cam, (x0 + 3.3, -1.6, 0.75), (x0 - 0.3, -1.7, 0.85), f0)
    look(cam, (x0 + 3.1, -0.4, 0.95), (x0 + 0.2, 2.2, 1.1), f1)
    ease_all(cam)
    bind(cam, f0, 'futebol')


# ---------------------------------------------------------------- cena 5: TUTORY Gaming
def shot_gaming(x0, f0, f1):
    box('chao_gm', (12, 12, 0.1), (x0, 0, -0.05), mat('piso_gm', '#06080f', rough=0.2, metal=0.4))
    screen = box('telao', (4.2, 0.05, 2.36), (x0, 2.4, 1.7), mat('tela', '#0b1530', emit='#2a6bff', strength=3.5))
    bpy.ops.object.text_add(location=(x0, 2.36, 1.85), rotation=(math.pi / 2, 0, 0))
    t = bpy.context.object
    t.data.body = 'TUTORY GAMING'
    t.data.align_x = 'CENTER'
    t.data.size = 0.42
    t.data.extrude = 0.005
    t.data.materials.append(mat('texto_gm', '#ffffff', emit='#ffffff', strength=6))
    bpy.ops.object.text_add(location=(x0, 2.36, 1.3), rotation=(math.pi / 2, 0, 0))
    t2 = bpy.context.object
    t2.data.body = 'eSports  ·  EA FC  ·  Counter-Strike'
    t2.data.align_x = 'CENTER'
    t2.data.size = 0.16
    t2.data.materials.append(mat('texto_gm2', '#9ebcff', emit='#9ebcff', strength=4))
    pad = mat('controle', '#15171c', rough=0.5)
    players = []
    for i, (gender, parts, colors, skin, hc, dx) in enumerate((
        ('male', {'top': 'tutory_jersey', 'bottom': 'cortu_cargo_pants', 'hair': 'short04', 'shoes': 'shoes02'}, {'top': '#15171c', 'bottom': '#1c2230'}, 'clara', '#3a2416', -0.55),
        ('female', {'top': 'tutory_jersey_f', 'bottom': 'cortu_cargo_pants', 'hair': 'bob01', 'shoes': 'shoes01'}, {'top': '#0040c8', 'bottom': '#1c2230'}, 'oriental', '#141010', 0.55),
    )):
        arm, _ = C.character(f'gm{i}', gender, parts, colors, skin=skin, hair_color=hc, location=(x0 + dx, -0.6, 0), rot_z=math.pi)
        players.append(arm)
    for f in range(f0, f1 + 1, 12):
        for k, arm in enumerate(players):
            C.reset(arm)
            stance(arm, 0.15)
            jig = math.sin((f + k * 7) * 0.9) * 0.08
            arms(arm, 'r', (0.15, 0.55, -1), (-0.35, 1.0, 0.25 + jig))
            arms(arm, 'l', (-0.15, 0.55, -1), (0.35, 1.0, 0.25 - jig))
            C.aim(arm, 'head', D(arm, (0, 0.2 + jig, 1)))
            C.key(arm, f)
    bpy.context.scene.frame_set(f0)
    for arm in players:
        mid = (hand_pos(arm, 'r') + hand_pos(arm, 'l')) / 2
        c = box('controle_' + arm.name, (0.16, 0.06, 0.035), mid, pad)
        attach(c, arm, 'hand_r')
    light('tela_luz', 'AREA', (x0, 2.2, 1.7), 900, '#2a6bff', size=4, target=(x0, -1, 1.3))
    light('rim_gm', 'SPOT', (x0 - 3, -3, 3.5), 1800, '#a23f96', spot=math.radians(50), size=0.3, target=(x0, 0, 1.2))
    cam = camera('cam_gm', 35, dof=2.8)
    cam.data.dof.focus_distance = 2.8
    # do lado da tela: rostos iluminados pelo telão, a tela entra no fim do movimento
    look(cam, (x0 + 1.9, 1.6, 1.5), (x0 - 0.1, -0.6, 1.45), f0)
    look(cam, (x0 + 2.6, -1.6, 1.55), (x0 - 0.2, 0.9, 1.6), f1)
    ease_all(cam)
    bind(cam, f0, 'gaming')


# ---------------------------------------------------------------- cena 6: pódio e comemoração
def shot_podio(x0, f0, f1):
    box('chao_pd', (14, 14, 0.1), (x0, 0, -0.05), mat('piso_pd', '#05070d', rough=0.25, metal=0.4))
    pd = mat('podio', '#101a33', rough=0.4)
    gold = mat('ouro', '#e0bf72', rough=0.3, metal=1.0, emit='#c9a96e', strength=0.25)
    for dx, h, n in ((0, 0.6, '1'), (-1.1, 0.4, '2'), (1.1, 0.25, '3')):
        box('podio' + n, (1.0, 1.0, h), (x0 + dx, 0, h / 2), pd)
        box('faixa' + n, (1.0, 0.01, 0.06), (x0 + dx, -0.5, h - 0.06), gold)
    champ, _ = C.character('pd1', 'male', {'top': 'tutory_jersey', 'bottom': 'tutory_shorts', 'hair': 'short02', 'shoes': 'shoes01'},
                           {'top': '#0040c8', 'bottom': '#15171c'}, skin='oriental', location=(x0, 0, 0.6))
    vice, _ = C.character('pd2', 'female', {'full': 'tutory_gi_f', 'hair': 'ponytail01'}, {'full': '#f2f2f2'}, belt='Azul', skin='negra', hair_color='#141010', location=(x0 - 1.1, 0, 0.4))
    third, _ = C.character('pd3', 'male', {'top': 'tutory_jersey', 'bottom': 'tutory_shorts', 'hair': 'afro01', 'shoes': 'shoes02'},
                           {'top': '#c0262d', 'bottom': '#15171c'}, skin='negra', hair_color='#141010', location=(x0 + 1.1, 0, 0.25))
    for f in (f0, f0 + 16, f0 + 34, f1):
        up = f >= f0 + 16
        C.reset(champ)
        arms(champ, 'r', (0.3, 0.1, 1 if up else -0.4), (0.1, 0.0, 1 if up else 0.3))
        arms(champ, 'l', (-0.3, 0.1, 1 if up else -0.4), (-0.1, 0.0, 1 if up else 0.3))
        C.aim(champ, 'head', D(champ, (0, 0.1, 1)))
        C.key(champ, f)
        for k, arm in enumerate((vice, third)):
            C.reset(arm)
            clap = (f // 8 + k) % 2
            arms(arm, 'r', (0.2, 0.7, -0.4), (-0.6 if clap else -0.3, 0.8, 0.4))
            arms(arm, 'l', (-0.2, 0.7, -0.4), (0.6 if clap else 0.3, 0.8, 0.4))
            C.key(arm, f)
    bpy.context.scene.frame_set(f0 + 20)
    # troféu entre as mãos do campeão
    tr = bpy.data.objects.new('trofeu', None)
    sc.collection.objects.link(tr)
    cup = cyl('taca', 0.09, 0.16, (0, 0, 0.12), gold, verts=32)
    base = cyl('taca_base', 0.06, 0.08, (0, 0, -0.02), gold, verts=24)
    for o in (cup, base):
        o.parent = tr
    # depois que os braços sobem a pose fica parada: o troféu fica entre as mãos, aparecendo junto com o gesto
    mid = (hand_pos(champ, 'r') + hand_pos(champ, 'l')) / 2
    tr.location = mid + Vector((0, -0.02, -0.02))
    tr.scale = (0.001, 0.001, 0.001)
    tr.keyframe_insert('scale', frame=f0 + 12)
    tr.scale = (1, 1, 1)
    tr.keyframe_insert('scale', frame=f0 + 18)
    light('brilho_taca', 'POINT', (mid.x, mid.y - 0.6, mid.z + 0.2), 60, '#fff1d0', size=0.1)
    # confete
    conf_mats = [mat(f'confete{i}', c, rough=0.4, metal=0.3) for i, c in enumerate(('#c9a96e', '#3b7bf5', '#ffffff', '#c0262d'))]
    for i in range(160):
        o = box(f'confete{i}', (0.03, 0.018, 0.002), (0, 0, 0), conf_mats[i % 4])
        sx, sy = x0 + random.uniform(-2.6, 2.6), random.uniform(-1.6, 1.4)
        start = f0 + random.randint(0, 25)
        o.location = (sx, sy, 4.6 + random.uniform(0, 1.5))
        o.rotation_euler = (random.uniform(0, 6), random.uniform(0, 6), 0)
        o.keyframe_insert('location', frame=start)
        o.keyframe_insert('rotation_euler', frame=start)
        o.location = (sx + random.uniform(-0.6, 0.6), sy + random.uniform(-0.4, 0.4), random.uniform(0.05, 1.2))
        o.rotation_euler = (random.uniform(6, 20), random.uniform(6, 20), random.uniform(0, 6))
        o.keyframe_insert('location', frame=f1 + 30)
        o.keyframe_insert('rotation_euler', frame=f1 + 30)
        for fc in getattr(o.animation_data.action, 'fcurves', []):
            for k in fc.keyframe_points:
                k.interpolation = 'LINEAR'
    light('spot_pd', 'SPOT', (x0, -1.5, 6), 6000, '#fff4e0', spot=math.radians(35), size=0.3, target=(x0, 0, 1.2))
    light('rim_pd', 'SPOT', (x0, 3, 4), 3000, '#3b7bf5', spot=math.radians(60), size=0.4, target=(x0, 0, 1.4))
    light('fill_pd', 'AREA', (x0 + 3, -4, 2), 300, '#9ebcff', size=3, target=(x0, 0, 1))
    cam = camera('cam_pd', 35, dof=4.0)
    cam.data.dof.focus_distance = 5.2
    look(cam, (x0 + 0.2, -6.5, 1.0), (x0, 0, 1.55), f0)
    look(cam, (x0, -4.6, 1.25), (x0, 0, 1.65), f1)
    ease_all(cam)
    bind(cam, f0, 'podio')


BUILDERS = {'logo': shot_logo, 'pingpong': shot_pingpong, 'jiujitsu': shot_jiujitsu, 'futebol': shot_futebol, 'gaming': shot_gaming, 'podio': shot_podio}
for i, (name, f0, f1) in enumerate(SHOTS):
    sc.frame_set(f0)
    BUILDERS[name](i * 40.0, f0, f1)
    print('[video] cena', name, flush=True)

# brilho suave nas luzes fortes (Glare no compositor)
try:
    # Blender 5.x: o compositor é um grupo de nós ligado à cena
    tree = bpy.data.node_groups.new('Composicao', 'CompositorNodeTree')
    sc.compositing_node_group = tree
    tree.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    rl = tree.nodes.new('CompositorNodeRLayers')
    g = tree.nodes.new('CompositorNodeGlare')
    out = tree.nodes.new('NodeGroupOutput')
    for name, val in (('Type', 'Bloom'), ('Threshold', 1.2), ('Strength', 0.6), ('Size', 0.6)):
        if name in g.inputs:
            try:
                g.inputs[name].default_value = val
            except Exception:
                pass
    if hasattr(g, 'glare_type'):
        g.glare_type = 'BLOOM'
    tree.links.new(rl.outputs['Image'], g.inputs['Image'])
    tree.links.new(g.outputs['Image'], out.inputs[0])
    print('[video] glare ok', [i.name for i in g.inputs])
except Exception as e:
    print('[video] sem glare:', e)

if SAVE:
    bpy.ops.wm.save_as_mainfile(filepath=SAVE)
os.makedirs(OUT, exist_ok=True)
sc.render.image_settings.file_format = 'PNG'
if STILLS:
    for f in STILLS:
        sc.frame_set(f)
        sc.render.filepath = os.path.join(OUT, f'still_{f:04d}.png')
        bpy.ops.render.render(write_still=True)
        print('[video] still', f, flush=True)
elif '--no-render' not in argv:
    sc.render.filepath = os.path.join(OUT, 'f_')
    bpy.ops.render.render(animation=True)
print('[video] fim', flush=True)

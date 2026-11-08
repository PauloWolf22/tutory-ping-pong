"""
Peças próprias do Tutory Sports, modeladas a partir do corpo do MakeHuman e gravadas como roupas do MPFB (.mhclo).

  blender -b --python tools/build_custom_clothes.py -- male|female

Depois de rodar, tools/poc_mpfb/build_human.py encontra as peças (pasta de dados do MPFB) e as ajusta a cada medida
do corpo como qualquer outra roupa: acompanham peso, músculo, ombros, pernas e o esqueleto.

Peças:
  tutory_gi      kimono de jiu-jitsu: casaco com lapela e saia, calça e faixa (uma malha, regiões por UV)
  tutory_jersey  camisa esportiva justa de manga curta
  tutory_shorts  bermuda esportiva

UV como atlas de regiões (o app pinta e aplica a logo por região):
  u 0.00-0.60  tronco, saia do casaco, calça e bermuda (cilindro em volta do corpo; frente = 0.15, costas = 0.45)
  u 0.60-0.70  manga direita (cilindro em volta do braço; lado de fora = 0.65)
  u 0.70-0.80  manga esquerda
  u 0.80-0.85  lapela
  u 0.85-1.00  faixa
v: altura (tronco) ou posição ao longo do braço (manga, 0 = ombro).
"""
import json, math, os, sys, uuid as uuidlib
import bmesh
import bpy
from mathutils import Vector
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.clothesservice import ClothesService
from bl_ext.user_default.mpfb.services.locationservice import LocationService
from bl_ext.user_default.mpfb.entities.objectproperties import GeneralObjectProperties

GENDER = sys.argv[sys.argv.index('--') + 1]
MALE = GENDER == 'male'
BASE_MACRO = {'gender': 1.0 if MALE else 0.0, 'age': 0.5, 'muscle': 0.5, 'weight': 0.5, 'proportions': 0.6, 'height': 0.5, 'cupsize': 0.5, 'firmness': 0.5,
              'race': {'asian': 0.33, 'caucasian': 0.33, 'african': 0.33}}
OUT = os.path.join(LocationService.get_user_data(), 'clothes')
SUFFIX = '' if MALE else '_f'


def log(*a): print('[custom]', *a, flush=True)


for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
human = HumanService.create_human(mask_helpers=False, detailed_helpers=True, extra_vertex_groups=True, feet_on_ground=True, scale=0.1,
                                  macro_detail_dict=json.loads(json.dumps(BASE_MACRO)))
rig = HumanService.add_builtin_rig(human, 'game_engine', import_weights=True)
bpy.context.view_layer.update()
MW = human.matrix_world
INV = MW.inverted()
groups = {g.index: g.name for g in human.vertex_groups}
gidx = {g.name: g.index for g in human.vertex_groups}
mesh = human.data
# Corpo com as formas aplicadas (gênero, proporções). O MPFB casa a roupa com este corpo (after_modifiers=True); usar a
# malha neutra (sem as formas) deslocava as peças em até 10 cm no corpo feminino (ombros altos, buracos nas costas).
EVAL = bpy.data.meshes.new_from_object(human.evaluated_get(bpy.context.evaluated_depsgraph_get()))  # cópia própria: sobrevive a novas atualizações da cena
assert len(EVAL.vertices) == len(mesh.vertices)
W = [MW @ v.co for v in EVAL.vertices]  # coordenadas do mundo (metros, Z para cima, frente em -Y)


def dominant(v):
    best, w = None, 0.0
    for g in v.groups:
        n = groups.get(g.group, "")
        if n in ('body', 'Left', 'Right', 'Mid', 'HelperGeometry', 'JointCubes') or n.startswith(('helper', 'joint', 'Delete', 'delete')):
            continue
        if g.weight > w:
            best, w = n, g.weight
    return best


def in_group(v, name):
    return any(groups.get(g.group) == name and g.weight > 0.5 for g in v.groups)


dom = [dominant(v) for v in mesh.vertices]
from collections import Counter
log('ossos dominantes', Counter(dom).most_common(40))
bone_head = {b.name: rig.matrix_world @ b.head_local for b in rig.data.bones}
waist_z = (bone_head['spine_01'].z + bone_head['spine_02'].z) / 2
hip_z = bone_head['pelvis'].z
knee_z = (bone_head['calf_l'].z + bone_head['calf_r'].z) / 2
ankle_z = (bone_head['foot_l'].z + bone_head['foot_r'].z) / 2
neck_z = bone_head['neck_01'].z
chest_z = bone_head['spine_03'].z
log('alturas', {k: round(v, 3) for k, v in dict(waist=waist_z, hip=hip_z, knee=knee_z, ankle=ankle_z, neck=neck_z, chest=chest_z).items()})

TORSO = {'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r', 'pelvis'}


def arm_t(p, side):
    """0 no ombro, 1 no punho."""
    a, b = bone_head['upperarm_' + side], bone_head['hand_' + side]
    ab = b - a
    return max(0.0, min(1.2, (p - a).dot(ab) / ab.length_squared))


def faces_where(group, pred):
    out = []
    for f in mesh.polygons:
        vs = [mesh.vertices[i] for i in f.vertices]
        if all(in_group(v, group) for v in vs) and all(pred(i) for i in f.vertices):
            out.append(f.index)
    return out


def side_of(i):
    return 'l' if W[i].x > 0 else 'r'


LEG = ("thigh", "calf", "foot", "ball", "toe")
HAND = ("hand", "thumb", "index", "middle", "ring", "pinky")


def jacket_vertex(i, sleeve_len):
    """Tronco inteiro (menos cabeça, mãos e pernas) e mangas até sleeve_len do caminho ombro-punho."""
    d = dom[i] or ""
    p = W[i]
    if d == "head" or d.startswith(HAND) or d.startswith(LEG):
        return False
    if d.startswith(("upperarm", "lowerarm")):
        return arm_t(p, d[-1]) < sleeve_len
    # só a coluna do pescoço fica de fora; o trapézio (do pescoço ao ombro) é tronco, mesmo acima da base do pescoço
    nb = bone_head["neck_01"]
    if math.hypot(p.x - nb.x, p.y - nb.y) < 0.068 and p.z > neck_z - 0.035:
        return False
    return hip_z - 0.02 < p.z < neck_z + 0.07


def new_object(name, parts):
    """parts: lista de (lista de faces do corpo, deslocamento em metros, região). Cria uma malha só, com as faces copiadas
    e empurradas pela normal do corpo. Devolve o objeto e, por face nova, a região."""
    bm = bmesh.new()
    regions = []
    vgroup = []
    src = bmesh.new()
    src.from_mesh(EVAL)
    src.verts.ensure_lookup_table()
    src.faces.ensure_lookup_table()
    src.normal_update()
    for part in parts:
        faces, offset, region = part[:3]
        group = part[3] if len(part) > 3 else "body"
        remap = {}
        for fi in faces:
            sf = src.faces[fi]
            vs = []
            for sv in sf.verts:
                if sv.index not in remap:
                    p = MW @ sv.co
                    n = (MW.to_3x3() @ sv.normal).normalized()
                    remap[sv.index] = bm.verts.new(p + n * offset)
                    vgroup.append(group)
                vs.append(remap[sv.index])
            try:
                bm.faces.new(vs)
                regions.append(region)
            except ValueError:
                pass
    src.free()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    obj["vgroup"] = vgroup
    return obj, regions


def cylinder_uv(p):
    th = math.atan2(p.x, -p.y)  # 0 = frente
    phi = (th + math.pi / 2) % (2 * math.pi)  # costura do lado esquerdo
    return phi / (2 * math.pi) * 0.6, p.z / 1.9


def sleeve_uv(p, side):
    a, b = bone_head['upperarm_' + side], bone_head['hand_' + side]
    axis = (b - a).normalized()
    t = arm_t(p, side)
    r = p - (a + axis * (t * (b - a).length))
    up = Vector((0, 0, 1))
    up = (up - axis * up.dot(axis)).normalized()
    fwd = axis.cross(up)
    ang = math.atan2(r.dot(fwd), r.dot(up))  # 0 = lado de cima/fora do braço
    base = 0.6 if side == 'r' else 0.7
    return base + (ang / (2 * math.pi) + 0.5) * 0.1, 1.0 - t * 0.5


def set_uv(obj, regions):
    me = obj.data
    uvl = me.uv_layers.new(name='UVMap')
    for poly, region in zip(me.polygons, regions):
        for li in poly.loop_indices:
            p = me.vertices[me.loops[li].vertex_index].co
            if region == 'sleeve':
                u, v = sleeve_uv(p, 'l' if p.x > 0 else 'r')
            elif region == 'lapel':
                u, v = 0.8 + (cylinder_uv(p)[0] / 0.6) * 0.05, p.z / 1.9
            elif region == 'belt':
                u, v = 0.85 + (cylinder_uv(p)[0] / 0.6) * 0.15, p.z / 1.9
            else:
                u, v = cylinder_uv(p)
            uvl.data[li].uv = (u, v)


def finish(obj):
    """Uma malha válida para o MakeClothes: só quads, todo vértice em um grupo que existe no corpo, mesma escala."""
    obj.matrix_world = MW.copy()
    me = obj.data
    me.transform(INV)
    by = {}
    for i, g in enumerate(obj["vgroup"]):
        by.setdefault(g, []).append(i)
    for g, idx in by.items():
        obj.vertex_groups.new(name=g).add(idx, 1.0, "REPLACE")
    del obj["vgroup"]
    for poly in me.polygons:
        poly.use_smooth = True
    bpy.context.view_layer.update()


def hidden_group(name, faces, extra_verts=()):
    """Pele que a peça esconde: os vértices do corpo de onde ela foi tirada, menos a borda (para não abrir fresta)."""
    inside = set()
    for fi in faces:
        inside.update(mesh.polygons[fi].vertices)
    inside.update(extra_verts)
    # o app tira o triângulo inteiro se um vértice estiver escondido: recua duas camadas da borda para não abrir fresta
    for _ in range(2):
        border = set()
        for poly in mesh.polygons:
            vs = set(poly.vertices)
            if vs & inside and not vs <= inside:
                border |= vs & inside
        inside -= border
    keep = sorted(i for i in inside if in_group(mesh.vertices[i], "body"))
    g = human.vertex_groups.new(name="delete." + name)
    g.add(keep, 1.0, "REPLACE")
    log("pele escondida", name, len(keep))
    return g.name


def write(obj, name, label, color, delete_group=None):
    report = ClothesService.mesh_is_valid_as_clothes(obj, human)
    if not report['all_checks_ok']:
        raise RuntimeError(f'{name} inválida: {report}')
    folder = os.path.join(OUT, name)
    os.makedirs(folder, exist_ok=True)
    GeneralObjectProperties.set_value('uuid', str(uuidlib.uuid5(uuidlib.NAMESPACE_URL, 'tutory-sports/' + name)), entity_reference=obj)
    props = {'name': name, 'author': 'Tutory Sports', 'license': 'CC0', 'description': label, 'homepage': '',
             'uuid': str(uuidlib.uuid5(uuidlib.NAMESPACE_URL, 'tutory-sports/' + name))}
    mhclo = ClothesService.create_mhclo_from_clothes_matching(human, obj, properties_dict=props, delete_group=delete_group)
    mhclo.material = name + '.mhmat'
    with open(os.path.join(folder, name + '.mhmat'), 'w', encoding='utf8') as f:
        f.write(f'# Tutory Sports\nname {name}\ndiffuseColor {color[0]} {color[1]} {color[2]}\nspecularColor 0.08 0.08 0.08\nshininess 0.15\nopacity 1.0\nbackfaceCull False\ncastShadows True\nreceiveShadows True\n')
    mhclo.write_mhclo(os.path.join(folder, name + '.mhclo'), reference_scale=ClothesService.get_reference_scale(human))
    log('gravada', name, len(obj.data.vertices), 'vértices')


# cache que o MakeClothes usa para casar vértices
from bl_ext.user_default.mpfb.entities.meshcrossref import MeshCrossRef
cache_dir = LocationService.get_user_cache('basemesh_xref')
os.makedirs(cache_dir, exist_ok=True)
MeshCrossRef(human, after_modifiers=False, build_faces_by_group_reference=True, cache_dir=cache_dir, write_cache=True, read_cache=False)

# ---------------------------------------------------------------- kimono (gi)
def above_ok(i):
    """Acima da base do pescoço só entra o ombro: longe do eixo do pescoço (nada de aba perto da orelha)."""
    p, nb = W[i], bone_head["neck_01"]
    return p.z <= neck_z or ((dom[i] or "") not in ("neck_01", "head") and math.hypot(p.x - nb.x, p.y - nb.y) > 0.09)

sternum_z = chest_z + 0.08


def v_neck(i):
    """Abertura em V na frente, do esterno até o pescoço."""
    p = W[i]
    return p.y < 0 and p.z > sternum_z and abs(p.x) < 0.015 + (p.z - sternum_z) * 0.32


jacket = faces_where("body", lambda i: jacket_vertex(i, 0.92) and not v_neck(i) and W[i].z < neck_z + 0.04 and above_ok(i))
# lapela: faixa de 4 cm em volta do V
def near_v(i):
    p = W[i]
    if p.y >= 0.02 or p.z < sternum_z - 0.04:
        return False
    edge = 0.015 + max(0.0, p.z - sternum_z) * 0.32
    return abs(p.x) < edge + 0.04
lapel = [f for f in jacket if all(near_v(i) for i in mesh.polygons[f].vertices)]
jacket_rest = [f for f in jacket if f not in set(lapel)]
is_arm = lambda i: (dom[i] or "").startswith(("upperarm", "lowerarm"))
torso_jacket = [f for f in jacket_rest if not any(is_arm(i) for i in mesh.polygons[f].vertices)]
sleeves = [f for f in jacket_rest if f not in set(torso_jacket)]
# saia do casaco: ajudante "skirt" do MakeHuman, da cintura até o meio da coxa
skirt = faces_where('helper-skirt', lambda i: hip_z + 0.06 > W[i].z > hip_z - 0.24)
# calça: ajudante "tights", da cintura ao tornozelo
pants = faces_where('helper-tights', lambda i: waist_z > W[i].z > ankle_z + 0.035)
# faixa: anel na altura da cintura
belt_band = faces_where("body", lambda i: not is_arm(i) and not (dom[i] or "").startswith(LEG + HAND) and abs(W[i].x) < 0.25 and waist_z + 0.02 > W[i].z > waist_z - 0.035)
log('gi', dict(torso=len(torso_jacket), mangas=len(sleeves), lapela=len(lapel), saia=len(skirt), calca=len(pants), faixa=len(belt_band)))
gi, regions = new_object('tutory_gi' + SUFFIX, [
    (torso_jacket, 0.02, 'body'), (sleeves, 0.022, 'sleeve'), (lapel, 0.026, 'lapel'),
    (skirt, 0.012, "body", "helper-skirt"), (pants, 0.02, "body", "helper-tights"), (belt_band, 0.034, 'belt'),
])
set_uv(gi, regions)
finish(gi)
legs = [i for i, v in enumerate(mesh.vertices) if in_group(v, "body") and not is_arm(i) and not (dom[i] or "").startswith(HAND) and waist_z > W[i].z > ankle_z + 0.05]
write(gi, "tutory_gi" + SUFFIX, "Kimono de jiu-jitsu Tutory Sports", (0.95, 0.95, 0.95), hidden_group("tutory_gi" + SUFFIX, torso_jacket + sleeves + lapel, legs))

# ---------------------------------------------------------------- camisa esportiva e bermuda
def crew_ok(i):
    """Gola careca: na frente a borda desce numa curva suave (U), sem o recorte em degrau que abria fresta."""
    p = W[i]
    if p.y >= 0 or abs(p.x) >= 0.085:
        return True
    return p.z < neck_z - 0.035 * (1 - (p.x / 0.085) ** 2)


jersey = faces_where("body", lambda i: jacket_vertex(i, 0.38) and above_ok(i) and W[i].z < neck_z + 0.04 and crew_ok(i))
jsleeve = [f for f in jersey if any(is_arm(i) for i in mesh.polygons[f].vertices)]
jbody = [f for f in jersey if f not in set(jsleeve)]
j, regions = new_object('tutory_jersey' + SUFFIX, [(jbody, 0.011, 'body'), (jsleeve, 0.013, 'sleeve')])
set_uv(j, regions)
finish(j)
write(j, "tutory_jersey" + SUFFIX, "Camisa esportiva Tutory Sports", (0.95, 0.95, 0.95), hidden_group("tutory_jersey" + SUFFIX, jbody + jsleeve))

shorts = faces_where('helper-tights', lambda i: waist_z + 0.01 > W[i].z > knee_z + 0.11)
s, regions = new_object('tutory_shorts' + SUFFIX, [(shorts, 0.016, "body", "helper-tights")])
set_uv(s, regions)
finish(s)
hips = [i for i, v in enumerate(mesh.vertices) if in_group(v, "body") and not is_arm(i) and not (dom[i] or "").startswith(HAND) and waist_z > W[i].z > knee_z + 0.13]
write(s, "tutory_shorts" + SUFFIX, "Bermuda esportiva Tutory Sports", (0.95, 0.95, 0.95), hidden_group("tutory_shorts" + SUFFIX, [], hips))
log('fim')

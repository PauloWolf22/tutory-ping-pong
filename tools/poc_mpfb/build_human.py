"""
Prova de conceito dos avatares realistas (MPFB/MakeHuman).

blender -b --python tools/poc_mpfb/build_human.py -- <saida> male|female

Gera um corpo base e um GLB por peça, todos no mesmo esqueleto, com morphs de rosto e corpo.
Cada vértice do corpo guarda quais peças o cobrem, para esconder a pele certa em cada troca de roupa.
"""
import json, os, sys, time
import bmesh
import bpy
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService
from bl_ext.user_default.mpfb.services.clothesservice import ClothesService
from bl_ext.user_default.mpfb.services.locationservice import LocationService
from bl_ext.user_default.mpfb.entities.objectproperties import HumanObjectProperties
from bl_ext.user_default.mpfb.entities.clothes.mhclo import Mhclo

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, GENDER = argv[0], argv[1]
MALE = GENDER == 'male'
TEX_SIZE = 1024
started = time.time()
def log(*a): print(f'[{time.time() - started:6.1f}s]', *a, flush=True)

DATA = LocationService.get_mpfb_data('targets')
USER = LocationService.get_user_data()

def both(group, name):
    return [f'{group}/l-{name}', f'{group}/r-{name}']

FACE = {
    'face_round': ['head/head-round'], 'face_square': ['head/head-square'], 'face_oval': ['head/head-oval'], 'face_tri': ['head/head-invertedtriangular'],
    'jaw_narrow': ['chin/chin-width-decr'], 'jaw_wide': ['chin/chin-width-incr'], 'chin_out': ['chin/chin-prominent-incr'], 'chin_in': ['chin/chin-prominent-decr'],
    'cheek_low': both('cheek', 'cheek-bones-decr'), 'cheek_high': both('cheek', 'cheek-bones-incr'),
    'cheek_thin': both('cheek', 'cheek-volume-decr'), 'cheek_full': both('cheek', 'cheek-volume-incr'),
    'eye_small': both('eyes', 'eye-scale-decr'), 'eye_big': both('eyes', 'eye-scale-incr'),
    'eye_fold': both('eyes', 'eye-epicanthus-in'), 'eye_down': both('eyes', 'eye-corner2-down'), 'eye_up': both('eyes', 'eye-corner2-up'),
    'nose_thin': ['nose/nose-scale-horiz-decr'], 'nose_wide': ['nose/nose-scale-horiz-incr'],
    'nose_short': ['nose/nose-scale-vert-decr'], 'nose_long': ['nose/nose-scale-vert-incr'],
    'nose_flat': ['nose/nose-hump-decr'], 'nose_hump': ['nose/nose-hump-incr'],
    'nostril_narrow': ['nose/nose-flaring-decr'], 'nostril_wide': ['nose/nose-flaring-incr'],
    'mouth_narrow': ['mouth/mouth-scale-horiz-decr'], 'mouth_wide': ['mouth/mouth-scale-horiz-incr'],
    'lips_thin': ['mouth/mouth-upperlip-volume-decr', 'mouth/mouth-lowerlip-volume-decr'], 'lips_full': ['mouth/mouth-upperlip-volume-incr', 'mouth/mouth-lowerlip-volume-incr'],
    'brow_down': ['eyebrows/eyebrows-trans-down'], 'brow_up': ['eyebrows/eyebrows-trans-up'],
    'brow_angle_down': ['eyebrows/eyebrows-angle-down'], 'brow_angle_up': ['eyebrows/eyebrows-angle-up'],
    'neck_thin': ['neck/neck-scale-horiz-decr'], 'neck_wide': ['neck/neck-scale-horiz-incr'],
}
EXPRESSION_UNITS = {'smile': ('mouth-corner-puller', 0.8), 'brows_raised': ('eyebrows-left-up', 1.0), 'brows_angry': ('eyebrows-left-down', 1.0)}
MACROS = {
    'body_heavy': {'weight': 0.99}, 'body_thin': {'weight': 0.01}, 'body_muscle': {'muscle': 0.99}, 'body_soft': {'muscle': 0.01},
    'race_african': {'race': {'african': 1.0, 'asian': 0.0, 'caucasian': 0.0}}, 'race_asian': {'race': {'african': 0.0, 'asian': 1.0, 'caucasian': 0.0}},
    'race_caucasian': {'race': {'african': 0.0, 'asian': 0.0, 'caucasian': 1.0}}, 'age_older': {'age': 0.85},
}
BASE_MACRO = {'gender': 1.0 if MALE else 0.0, 'age': 0.5, 'muscle': 0.5, 'weight': 0.5, 'proportions': 0.6, 'height': 0.5, 'cupsize': 0.5, 'firmness': 0.5,
              'race': {'asian': 0.33, 'caucasian': 0.33, 'african': 0.33}}

# Catálogo: (nome do asset, rótulo). Licença de cada pacote em docs/PROVA-AVATARES.md.
HAIR = [('short01', 'Curto 1'), ('short02', 'Curto 2'), ('short03', 'Curto 3'), ('short04', 'Curto 4'), ('elvs_grump_hair', 'Bagunçado'),
        ('afro01', 'Black'), ('elvs_micky_afro', 'Black curto'), ('elvs_braided_rows', 'Nagô'), ('punkduck_alpha7_curly', 'Cachos longos'),
        ('long01', 'Longo'), ('punkduck_alpha7_long', 'Longo liso'), ('elvs_wavy_bob', 'Chanel ondulado'), ('bob01', 'Chanel 1'), ('bob02', 'Chanel 2'), ('ponytail01', 'Rabo de cavalo'), ('braid01', 'Trança')]
if MALE:
    FULL = [('male_casualsuit04', 'Camiseta e jeans'), ('male_casualsuit01', 'Casual 1'), ('male_casualsuit02', 'Casual 2'), ('male_casualsuit03', 'Casual 3'), ('male_casualsuit05', 'Casual 4'), ('male_casualsuit06', 'Casual 5'),
            ('male_elegantsuit01', 'Elegante'), ('male_worksuit01', 'Trabalho'), ('toigo_male_suit_3', 'Terno'), ('toigo_male_double-breasted_suit', 'Terno trespassado'), ('toigo_male_suit_tie_and_jacket', 'Terno e gravata')]
    TOPS = [('elvs_crude_t-shirt_male', 'Camiseta'), ('namuhekam_male_polo_shirt', 'Polo'), ('toigo_basic_tucked_t-shirt', 'Camiseta justa'), ('toigo_fisherman_sweater', 'Suéter')]
    BOTTOMS = [('cortu_cargo_pants', 'Calça cargo'), ('cortu_jeans_shorts', 'Bermuda jeans'), ('toigo_wool_pants', 'Calça social')]
    SHOES = [('shoes01', 'Tênis 1'), ('shoes02', 'Tênis 2'), ('shoes03', 'Calçado 3'), ('shoes04', 'Calçado 4'), ('shoes05', 'Calçado 5'), ('shoes06', 'Calçado 6'), ('toigo_ankle_boots_male', 'Bota curta')]
    BEARDS = [('wdg_scruffy_beard', 'Barba rala'), ('elvs_scruffy_beard1', 'Barba por fazer'), ('grinsegold_full_beard', 'Barba cheia'), ('rehmanpolanski_beard_viking', 'Barba longa'), ('grinsegold_moustache', 'Bigode'), ('rehmanpolanski_moustache_viking', 'Bigode longo')]
else:
    FULL = [('female_sportsuit01', 'Esportivo'), ('female_casualsuit01', 'Casual 1'), ('female_casualsuit02', 'Casual 2'), ('female_elegantsuit01', 'Elegante'), ('toigo_female_suit', 'Terninho'), ('toigo_female_double-breasted_suit', 'Terninho trespassado'),
            ('toigo_halter_dress_knee_length', 'Vestido frente única'), ('toigo_shift_dress', 'Vestido reto'), ('toigo_cut_out_dress', 'Vestido recortado'), ('toigo_dress_with_tiered_skirt', 'Vestido em camadas'), ('aethelraed_flapper_dress', 'Vestido melindrosa'), ('mindfront_kimono', 'Quimono')]
    TOPS = [('joepal_crude_t-shirt_female', 'Camiseta'), ('namuhekam_male_polo_shirt', 'Polo'), ('toigo_camisole_top', 'Regata'), ('toigo_fisherman_sweater', 'Suéter')]
    BOTTOMS = [('cortu_cargo_pants', 'Calça cargo'), ('cortu_jeans_shorts', 'Bermuda jeans'), ('toigo_wool_pants', 'Calça social'), ('frankyaye_mini_skirt_01', 'Minissaia'), ('toigo_long_full_skirt', 'Saia longa')]
    SHOES = [('shoes03', 'Calçado 1'), ('shoes01', 'Tênis 1'), ('shoes02', 'Tênis 2'), ('shoes04', 'Calçado 2'), ('shoes05', 'Calçado 3'), ('shoes06', 'Calçado 4'), ('toigo_ankle_boots_female', 'Bota curta'), ('toigo_ballet_flats', 'Sapatilha de balé')]
    BEARDS = []
GLASSES = [('kwnet_at_optical_glasses', 'Grau'), ('frankyaye_glasses_library_male', 'Redondo'), ('spamrakuen_sagerfrogs_glasses_01', 'Armação fina')]
HATS = [('jujube_newsboy_cap', 'Boina'), ('fedora01', 'Fedora'), ('aethelraed_unraed_cloche_hat', 'Chapéu cloche')]
CATALOG = {'hair': HAIR, 'full': FULL, 'top': TOPS, 'bottom': BOTTOMS, 'shoes': SHOES, 'beard': BEARDS, 'glasses': GLASSES, 'hat': HATS}
SKINS = {'clara': 'young_caucasian_' + GENDER, 'oriental': 'young_asian_' + GENDER, 'negra': 'young_african_' + GENDER}
BROW = 'eyebrow006' if MALE else 'eyebrow001'
DEFAULTS = {'hair': 'short02' if MALE else 'long01', 'full': FULL[0][0], 'shoes': SHOES[0][0]}

# Índice de todas as peças instaladas, onde quer que o pacote as tenha colocado
INDEX = {}
for root, _, files in os.walk(USER):
    for f in files:
        if f.endswith('.mhclo'):
            INDEX.setdefault(f[:-6], os.path.join(root, f))


def mix_coords(obj):
    tmp = obj.shape_key_add(name='__mix', from_mix=True)
    co = [0.0] * (len(tmp.data) * 3)
    tmp.data.foreach_get('co', co)
    obj.shape_key_remove(tmp)
    return co


def add_key(obj, name, coords):
    if not obj.data.shape_keys:
        obj.shape_key_add(name='Basis', from_mix=False)
    k = obj.shape_key_add(name=name, from_mix=False)
    k.data.foreach_set('co', coords)
    k.value = 0.0
    return k


def set_macro(human, macro):
    for key, value in macro.items():
        if key != 'race':
            HumanObjectProperties.set_value(key, value, entity_reference=human)
    for key, value in macro.get('race', {}).items():
        HumanObjectProperties.set_value(key, value, entity_reference=human)
    TargetService.reapply_macro_details(human)


for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)

log('criando humano', GENDER, '-', len(INDEX), 'peças instaladas')
human = HumanService.create_human(mask_helpers=False, detailed_helpers=True, extra_vertex_groups=True, feet_on_ground=True, scale=0.1, macro_detail_dict=json.loads(json.dumps(BASE_MACRO)))

# 1) morphs de corpo e origem
macro_coords = {}
for name, change in MACROS.items():
    merged = json.loads(json.dumps(BASE_MACRO))
    merged.update(change)
    set_macro(human, merged)
    macro_coords[name] = mix_coords(human)
set_macro(human, BASE_MACRO)
base_coords = mix_coords(human)
# Altura tem controle próprio: cada morph de macro volta à altura da base, para o corpo não sair do esqueleto.
base_top = max(base_coords[2::3])
for name, co in macro_coords.items():
    factor = base_top / max(co[2::3])
    co[2::3] = [z * factor for z in co[2::3]]
TargetService.bake_targets(human)
log('base pronta', len(human.data.vertices), 'vértices')

# 2) esqueleto
rig = HumanService.add_builtin_rig(human, 'game_engine', import_weights=True)


# 3) peças
def add_part(name):
    path = INDEX.get(name)
    if not path:
        return None
    try:
        obj = HumanService.add_mhclo_asset(path, human, asset_type='Clothes', subdiv_levels=0, material_type='GAMEENGINE')
    except Exception as e:
        log('FALHOU', name, e)
        return None
    obj.name = 'part_' + name
    m = Mhclo()
    m.load(path)
    m.clothes = obj
    return obj, m


base_parts = {}
for key, name in {'eyes': 'low-poly', 'brows': BROW, 'lashes': 'eyelashes01', 'teeth': 'teeth_base'}.items():
    made = add_part(name)
    if made is None:
        raise RuntimeError('parte essencial ausente: ' + name)
    base_parts[key] = made

catalog = {}
skipped = []
for cat, items in CATALOG.items():
    catalog[cat] = []
    for name, label in items:
        made = add_part(name)
        if made is None:
            skipped.append(name)
            continue
        catalog[cat].append({'name': name, 'label': label, 'obj': made[0], 'mhclo': made[1]})
log('catálogo', {k: len(v) for k, v in catalog.items()}, 'ausentes:', skipped)

skin = os.path.join(USER, 'skins', SKINS['clara'], SKINS['clara'] + '.mhmat')
HumanService.set_character_skin(skin, human, skin_type='GAMEENGINE', material_instances=False)

# 4) morphs de rosto
morph_coords = dict(macro_coords)
for name, targets in FACE.items():
    for i, t in enumerate(targets):
        TargetService.load_target(human, os.path.join(DATA, t + '.target.gz'), weight=1.0, name=f'__{name}{i}')
    morph_coords[name] = mix_coords(human)
    for i in range(len(targets)):
        human.shape_key_remove(human.data.shape_keys.key_blocks[f'__{name}{i}'])

expr_dir = None
for root, _, files in os.walk(os.path.join(DATA, 'expression')):
    if 'mouth-corner-puller.target.gz' in files:
        expr_dir = root
for name, (unit, weight) in EXPRESSION_UNITS.items():
    units = [unit, unit.replace('left', 'right')] if 'left' in unit else [unit]
    for i, u in enumerate(units):
        TargetService.load_target(human, os.path.join(expr_dir, u + '.target.gz'), weight=weight, name=f'__{name}{i}')
    morph_coords[name] = mix_coords(human)
    for i in range(len(units)):
        human.shape_key_remove(human.data.shape_keys.key_blocks[f'__{name}{i}'])
log('morphs', len(morph_coords))

# 5) cada peça reajustada em cada morph; só guarda o morph que mexe nela
EPS = 0.0008
fit_keys = {}
def coords_of(obj):
    co = [0.0] * (len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get('co', co)
    return co

everything = [v for v in base_parts.values()] + [(i['obj'], i['mhclo']) for items in catalog.values() for i in items]
rest = {obj.name: coords_of(obj) for obj, _ in everything}
fitted = {obj.name: {} for obj, _ in everything}
for mname, co in morph_coords.items():
    k = add_key(human, '__fit', co)
    k.value = 1.0
    for obj, m in everything:
        ClothesService.fit_clothes_to_human(obj, human, mhclo=m, set_parent=False)
        now = coords_of(obj)
        if max(abs(a - b) for a, b in zip(rest[obj.name], now)) > EPS:
            fitted[obj.name][mname] = now
    human.shape_key_remove(k)
for obj, m in everything:
    obj.data.vertices.foreach_set('co', rest[obj.name])
    obj.data.update()
    for mname, co in fitted[obj.name].items():
        add_key(obj, mname, co)
log('peças ajustadas', len(everything))

for mname, co in morph_coords.items():
    add_key(human, mname, co)
for k in human.data.shape_keys.key_blocks[1:]:
    k.value = 0.0

# 6) máscara: cada bit diz que aquela peça cobre o vértice. Vale para a troca no navegador.
mask_for = {m.vertex_group: m.vertex_group.split('.', 1)[-1] for m in human.modifiers if m.type == 'MASK' and m.invert_vertex_group}
bits_a, bits_b = {}, {}
for cat in ('full', 'top', 'bottom'):
    for item in catalog[cat]:
        bits_a[item['name']] = len(bits_a)
for item in catalog['shoes']:
    bits_b[item['name']] = len(bits_b)
assert len(bits_a) <= 24 and len(bits_b) <= 24

group_bits = {}
for group, asset_name in mask_for.items():
    if group in human.vertex_groups:
        index = human.vertex_groups[group].index
        if asset_name in bits_a:
            group_bits[index] = ('a', 1 << bits_a[asset_name])
        elif asset_name in bits_b:
            group_bits[index] = ('b', 1 << bits_b[asset_name])

body_idx = human.vertex_groups['body'].index
bm = bmesh.new()
bm.from_mesh(human.data)
dl = bm.verts.layers.deform.verify()
gone = [v for v in bm.verts if body_idx not in v[dl]]
bmesh.ops.delete(bm, geom=gone, context='VERTS')
bm.to_mesh(human.data)
bm.free()
human.data.update()
for m in list(human.modifiers):
    if m.type == 'MASK':
        human.modifiers.remove(m)

attr_a = human.data.attributes.new('_MASKA', 'FLOAT', 'POINT')
attr_b = human.data.attributes.new('_MASKB', 'FLOAT', 'POINT')
for v in human.data.vertices:
    a = b = 0
    for g in v.groups:
        hit = group_bits.get(g.group)
        if hit:
            if hit[0] == 'a':
                a |= hit[1]
            else:
                b |= hit[1]
    attr_a.data[v.index].value = float(a)
    attr_b.data[v.index].value = float(b)
log('corpo final', len(human.data.vertices), 'vértices')

# 7) texturas
os.makedirs(OUT, exist_ok=True)
parts_dir = os.path.join(OUT, GENDER)
os.makedirs(parts_dir, exist_ok=True)
for img in bpy.data.images:
    if img.size[0] > TEX_SIZE:
        img.scale(TEX_SIZE, TEX_SIZE)

skin_index = {}
scene = bpy.context.scene
scene.render.image_settings.file_format = 'JPEG'
scene.render.image_settings.quality = 93
scene.render.image_settings.color_mode = 'RGB'
for label, sname in SKINS.items():
    sdir = os.path.join(USER, 'skins', sname)
    diffuse = next((f for f in os.listdir(sdir) if f.lower().endswith(('.png', '.jpg')) and 'diffuse' in f.lower()), None) or next(f for f in os.listdir(sdir) if f.lower().endswith(('.png', '.jpg')))
    img = bpy.data.images.load(os.path.join(sdir, diffuse))
    target = os.path.join(OUT, f'skin_{GENDER}_{label}.jpg')
    img.save_render(target)
    skin_index[label] = os.path.basename(target)
    bpy.data.images.remove(img)

# 8) um GLB para o corpo, outro para cada peça
def export(path, objs):
    for o in bpy.data.objects:
        o.hide_set(False)
        o.select_set(False)
    rig.select_set(True)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=False, export_yup=True,
        export_morph=True, export_morph_normal=True, export_try_sparse_sk=True, export_skins=True, export_def_bones=True,
        export_animations=False, export_image_format='WEBP', export_image_quality=80, export_materials='EXPORT', export_extras=False,
        export_attributes=True,
    )
    return os.path.getsize(path)

sizes = {}
sizes['base'] = export(os.path.join(parts_dir, 'base.glb'), [human] + [v[0] for v in base_parts.values()])
out_catalog = {}
for cat, items in catalog.items():
    out_catalog[cat] = []
    for item in items:
        size = export(os.path.join(parts_dir, item['name'] + '.glb'), [item['obj']])
        entry = {'name': item['name'], 'label': item['label'], 'size': size}
        if item['name'] in bits_a:
            entry['bitA'] = bits_a[item['name']]
        if item['name'] in bits_b:
            entry['bitB'] = bits_b[item['name']]
        out_catalog[cat].append(entry)
    log(cat, 'exportado')
log('base', round(sizes['base'] / 1e6, 1), 'MB')
json.dump({
    'gender': GENDER, 'morphs': list(morph_coords), 'catalog': out_catalog, 'skins': skin_index, 'defaults': DEFAULTS,
    'baseSize': sizes['base'], 'skipped': skipped, 'vertices': len(human.data.vertices),
}, open(os.path.join(OUT, f'human_{GENDER}.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
log('fim')

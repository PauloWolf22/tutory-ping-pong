"""
Prova de conceito dos avatares realistas (MPFB/MakeHuman, CC0).

blender -b --python tools/poc_mpfb/build_human.py -- <saida> male|female

Gera um GLB com malha, esqueleto, morphs de rosto e corpo e peças que acompanham os morphs.
"""
import json, os, sys, time
import bpy
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService
from bl_ext.user_default.mpfb.services.clothesservice import ClothesService

from bl_ext.user_default.mpfb.services.locationservice import LocationService
from bl_ext.user_default.mpfb.entities.objectproperties import HumanObjectProperties

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, GENDER = argv[0], argv[1]
MALE = GENDER == 'male'
TEX_SIZE = 1024
started = time.time()
def log(*a): print(f'[{time.time() - started:6.1f}s]', *a, flush=True)

DATA = LocationService.get_mpfb_data('targets')
USER = LocationService.get_user_data()

# Sliders: rótulo -> (morph negativo, morph positivo). Cada morph junta os alvos do MakeHuman, com lado L e R.
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

HAIRS = ['short01', 'short02', 'short03', 'short04', 'afro01', 'long01', 'bob01', 'bob02', 'ponytail01', 'braid01']
OUTFIT = ['male_casualsuit04', 'shoes01'] if MALE else ['female_sportsuit01', 'shoes03']
SKINS = {'clara': 'young_caucasian_' + GENDER, 'oriental': 'young_asian_' + GENDER, 'negra': 'young_african_' + GENDER}
BROW = 'eyebrow006' if MALE else 'eyebrow001'


def mix_coords(obj):
    tmp = obj.shape_key_add(name='__mix', from_mix=True)
    co = [0.0] * (len(tmp.data) * 3)
    tmp.data.foreach_get('co', co)
    obj.shape_key_remove(tmp)
    return co


def clear_keys_values(obj):
    for k in obj.data.shape_keys.key_blocks[1:]:
        k.value = 0.0


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


bpy.ops.wm.read_factory_settings(use_empty=True) if False else None
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)

log('criando humano', GENDER)
human = HumanService.create_human(mask_helpers=False, detailed_helpers=True, extra_vertex_groups=True, feet_on_ground=True, scale=0.1, macro_detail_dict=json.loads(json.dumps(BASE_MACRO)))

# 1) morphs de corpo e etnia: diferença de pose de repouso entre o macro base e o macro alterado
macro_coords = {}
for name, change in MACROS.items():
    merged = json.loads(json.dumps(BASE_MACRO))
    merged.update(change)
    set_macro(human, merged)
    macro_coords[name] = mix_coords(human)
    log('macro', name)
set_macro(human, BASE_MACRO)
base_coords = mix_coords(human)
# Altura tem controle próprio: cada morph de macro volta à altura da base, para o corpo não sair do esqueleto.
def top_z(co):
    return max(co[2::3])
base_top = top_z(base_coords)
for name, co in macro_coords.items():
    factor = base_top / top_z(co)
    co[2::3] = [z * factor for z in co[2::3]]
TargetService.bake_targets(human)
# depois do bake a base é a mistura: confirma que a referência não mudou de lugar
assert not human.data.shape_keys or len(human.data.shape_keys.key_blocks) <= 1, 'bake deixou alvos'
log('base pronta', len(human.data.vertices), 'vértices')

# 2) esqueleto em cima da forma base
rig = HumanService.add_builtin_rig(human, 'game_engine', import_weights=True)
log('rig', rig.name if rig else None, len(rig.data.bones) if rig else 0)

# 3) peças
def asset(subdir, name, kind):
    path = os.path.join(USER, subdir, name, name + '.mhclo')
    obj = HumanService.add_mhclo_asset(path, human, asset_type=kind, subdiv_levels=0, material_type='GAMEENGINE')
    obj.name = f'{subdir}_{name}'
    return obj

parts = {}
parts['eyes'] = asset('eyes', 'low-poly', 'Eyes')
parts['brows'] = asset('eyebrows', BROW, 'Eyebrows')
parts['lashes'] = asset('eyelashes', 'eyelashes01', 'Eyelashes')
parts['teeth'] = asset('teeth', 'teeth_base', 'Teeth')
for h in HAIRS:
    parts['hair_' + h] = asset('hair', h, 'Hair')
for c in OUTFIT:
    parts['cloth_' + c] = asset('clothes', c, 'Clothes')
log('peças', list(parts))

skin = os.path.join(USER, 'skins', SKINS['clara'], SKINS['clara'] + '.mhmat')
HumanService.set_character_skin(skin, human, skin_type='GAMEENGINE', material_instances=False)

# 4) morphs de rosto (alvos do MakeHuman)
def target_path(rel):
    return os.path.join(DATA, rel + '.target.gz')

morph_coords = dict(macro_coords)
for name, targets in FACE.items():
    keys = [TargetService.load_target(human, target_path(t), weight=1.0, name=f'__{name}{i}') for i, t in enumerate(targets)]
    morph_coords[name] = mix_coords(human)
    for i in range(len(targets)):
        human.shape_key_remove(human.data.shape_keys.key_blocks[f'__{name}{i}'])

expr_dir = None
for root, _, files in os.walk(os.path.join(DATA, 'expression')):
    if 'mouth-corner-puller.target.gz' in files:
        expr_dir = root
log('expressões em', expr_dir)
for name, (unit, weight) in EXPRESSION_UNITS.items():
    units = [unit]
    if 'left' in unit:
        units.append(unit.replace('left', 'right'))
    for i, u in enumerate(units):
        TargetService.load_target(human, os.path.join(expr_dir, u + '.target.gz'), weight=weight, name=f'__{name}{i}')
    morph_coords[name] = mix_coords(human)
    for i in range(len(units)):
        human.shape_key_remove(human.data.shape_keys.key_blocks[f'__{name}{i}'])
log('morphs capturados', len(morph_coords))

# 5) cada peça reajustada em cada morph, para acompanhar o corpo. Só guarda o morph que mexe na peça.
EPS = 0.0008
def coords_of(obj):
    co = [0.0] * (len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get('co', co)
    return co

part_keys = {}
for pname, obj in parts.items():
    rest = coords_of(obj)
    part_keys[pname] = {}
    for mname, co in morph_coords.items():
        k = add_key(human, '__fit', co)
        k.value = 1.0
        ClothesService.fit_clothes_to_human(obj, human, set_parent=False)
        fitted = coords_of(obj)
        human.shape_key_remove(k)
        if max(abs(a - b) for a, b in zip(rest, fitted)) > EPS:
            part_keys[pname][mname] = fitted
    ClothesService.fit_clothes_to_human(obj, human, set_parent=False)
    log('peça', pname, 'morphs', len(part_keys[pname]))

for pname, obj in parts.items():
    for mname, co in part_keys[pname].items():
        add_key(obj, mname, co)

# morphs definitivos no corpo
for mname, co in morph_coords.items():
    add_key(human, mname, co)
clear_keys_values(human)

# 6) remove o que fica escondido e os ajudantes. Máscara por roupa só existe nesta peça fixa da prova.
import bmesh
print('mods', [(m.name, m.type, getattr(m, 'vertex_group', ''), getattr(m, 'invert_vertex_group', None)) for m in human.modifiers], flush=True)
hide = {m.vertex_group for m in human.modifiers if m.type == 'MASK' and m.invert_vertex_group and m.vertex_group}
hide_idx = {human.vertex_groups[n].index for n in hide if n in human.vertex_groups}
body_idx = human.vertex_groups['body'].index
bm = bmesh.new()
bm.from_mesh(human.data)
dl = bm.verts.layers.deform.verify()
gone = [v for v in bm.verts if body_idx not in v[dl] or hide_idx.intersection(v[dl].keys())]
bmesh.ops.delete(bm, geom=gone, context='VERTS')
bm.to_mesh(human.data)
bm.free()
human.data.update()
for m in list(human.modifiers):
    if m.type == 'MASK':
        human.modifiers.remove(m)
log('corpo final', len(human.data.vertices), 'vértices', len(human.data.polygons), 'faces')

# 7) texturas menores e as outras peles como arquivos à parte
os.makedirs(OUT, exist_ok=True)
for img in bpy.data.images:
    if img.size[0] > TEX_SIZE:
        img.scale(TEX_SIZE, TEX_SIZE)

skin_index = {}
for label, sname in SKINS.items():
    sdir = os.path.join(USER, 'skins', sname)
    diffuse = next((f for f in os.listdir(sdir) if f.lower().endswith(('.png', '.jpg')) and 'diffuse' in f.lower()), None) or next(f for f in os.listdir(sdir) if f.lower().endswith(('.png', '.jpg')))
    img = bpy.data.images.load(os.path.join(sdir, diffuse))
    img.scale(TEX_SIZE, TEX_SIZE)
    target = os.path.join(OUT, f'skin_{GENDER}_{label}.jpg')
    scene = bpy.context.scene
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 82
    img.save_render(target)
    skin_index[label] = os.path.basename(target)
    bpy.data.images.remove(img)
log('peles', skin_index)

for o in bpy.data.objects:
    o.hide_set(False)
    o.hide_viewport = False
    o.hide_render = False

path = os.path.join(OUT, f'human_{GENDER}.glb')
bpy.ops.export_scene.gltf(
    filepath=path, export_format='GLB', use_selection=False, export_apply=False, export_yup=True,
    export_morph=True, export_morph_normal=True, export_try_sparse_sk=True, export_skins=True, export_def_bones=True,
    export_animations=False, export_image_format='WEBP', export_image_quality=80, export_materials='EXPORT', export_extras=False,
)
log('GLB', os.path.getsize(path) / 1e6, 'MB')
bones = [b.name for b in rig.data.bones]
json.dump({
    'gender': GENDER, 'morphs': list(morph_coords), 'hairs': HAIRS, 'outfit': OUTFIT, 'skins': skin_index, 'bones': bones,
    'parts': {k: {'object': v.name, 'morphs': len(part_keys[k])} for k, v in parts.items()},
    'vertices': len(human.data.vertices),
}, open(os.path.join(OUT, f'human_{GENDER}.json'), 'w'), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.environ.get('TEMP', OUT), f'poc_{GENDER}.blend'))
log('fim')

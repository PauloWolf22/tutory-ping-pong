"""
Auditoria dos avatares: mede roupa atravessando o corpo em combinações de morphs, como o app aplica.

  blender -b --factory-startup --python tools/avatar_audit.py -- <app/assets/humans> <male|female> <saida.json> [peças...]

Para cada combinação: aplica os mesmos valores de morph no corpo e nas peças (shape keys com o mesmo nome,
como o three.js faz), avalia as malhas em repouso e conta:
  - pele visível atravessando a roupa: vértice do corpo NÃO escondido pela máscara da peça, que fica do lado de fora
    da roupa quando deveria estar por baixo (perto da roupa e fora dela);
  - roupa dentro do corpo: vértice da peça que entrou no corpo (distância assinada negativa), onde a pele está visível.
Também mede o deslocamento das articulações implícito em cada morph (centro da malha em volta do osso).
"""
import bpy, bmesh, json, os, sys
from mathutils.bvhtree import BVHTree
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
ROOT, GENDER, OUT = argv[0], argv[1], argv[2]
cat = json.load(open(os.path.join(ROOT, f'human_{GENDER}.json'), encoding='utf8'))
PIECES = argv[3:] or [cat['defaults'].get('full') or cat['catalog']['full'][0]['name'], cat['catalog']['top'][0]['name'], cat['catalog']['bottom'][0]['name']]

bpy.ops.wm.read_factory_settings(use_empty=True)


def load(name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, GENDER, name + '.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    return [o for o in new if o.type == 'MESH']


body_objs = load('base')
body = max(body_objs, key=lambda o: len(o.data.vertices))
pieces = {p: load(p) for p in PIECES}

# bits da máscara: mesma ordem do build_human.py (full, top, bottom em A; shoes em B)
bits_a = {}
for c in ('full', 'top', 'bottom'):
    for it in cat['catalog'][c]:
        bits_a[it['name']] = len(bits_a)
mask_attr = body.data.attributes.get('_MASKA') or body.data.attributes.get('_maska')
mask = [int(d.value) for d in mask_attr.data] if mask_attr else None


def set_morphs(objs, values):
    for o in objs:
        keys = o.data.shape_keys
        if not keys:
            continue
        for kb in keys.key_blocks[1:]:
            kb.value = 0.0
            kb.slider_min, kb.slider_max = -10, 10
        for n, v in values.items():
            kb = keys.key_blocks.get(n)
            if kb:
                kb.value = v


def evaluated(o):
    dg = bpy.context.evaluated_depsgraph_get()
    eo = o.evaluated_get(dg)
    me = eo.to_mesh()
    co = [o.matrix_world @ v.co for v in me.vertices]
    faces = [tuple(p.vertices) for p in me.polygons]
    eo.to_mesh_clear()
    return co, faces


COMBOS = {
    'base': {},
    'pesado 1.0': {'body_heavy': 1.0},
    'pesado 1.6 (máximo do editor)': {'body_heavy': 1.6},
    'magro 1.6': {'body_thin': 1.6},
    'musculoso 1.6': {'body_muscle': 1.6},
    'pesado 1 + musculoso 1': {'body_heavy': 1.0, 'body_muscle': 1.0},
    'pesado 1.6 + musculoso 1.6': {'body_heavy': 1.6, 'body_muscle': 1.6},
    'magro 1 + musculoso 1': {'body_thin': 1.0, 'body_muscle': 1.0},
    'pesado 1 + idade': {'body_heavy': 1.0, 'age_older': 1.0},
    'pescoço largo 1.6': {'neck_wide': 1.6},
}

report = {'gender': GENDER, 'pieces': PIECES, 'body_vertices': len(body.data.vertices), 'combos': {}}
for label, values in COMBOS.items():
    set_morphs([body] + [o for objs in pieces.values() for o in objs], values)
    bco, bfaces = evaluated(body)
    bvh_body = BVHTree.FromPolygons(bco, bfaces)
    row = {}
    for pname, objs in pieces.items():
        bit = bits_a.get(pname)
        hidden = set(i for i, m in enumerate(mask) if bit is not None and m >> bit & 1) if mask else set()
        inside = 0
        worst = 0.0
        total = 0
        cloth_bvh = []
        for o in objs:
            co, faces = evaluated(o)
            cloth_bvh.append(BVHTree.FromPolygons(co, faces))
            for v in co:
                total += 1
                hit = bvh_body.find_nearest(v)
                if hit[0] is None:
                    continue
                loc, nor, fi, dist = hit
                d = (v - loc).dot(nor)
                if d < -0.002:
                    # só conta se a pele naquele ponto está visível
                    if not all(vi in hidden for vi in bfaces[fi]):
                        inside += 1
                        worst = min(worst, d)
        # pele visível que fura a roupa: vértice do corpo visível, a menos de 3 cm da roupa e do lado de fora dela
        poke = 0
        for i, v in enumerate(bco):
            if i in hidden:
                continue
            for bvh in cloth_bvh:
                hit = bvh.find_nearest(v, 0.03)
                if hit[0] is not None and (v - hit[0]).dot(hit[1]) > 0.001:
                    poke += 1
                    break
        row[pname] = {'roupa_dentro_da_pele_visivel': inside, 'pior_mm': round(worst * 1000, 1), 'pele_furando_roupa': poke, 'vertices_peca': total}
    report['combos'][label] = row
    print(label, json.dumps(row, ensure_ascii=False), flush=True)

# articulações: quanto cada morph de corpo desloca a malha em volta de ombro, cotovelo, quadril e joelho
arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
if arm:
    groups = {g.index: g.name for g in body.vertex_groups}
    want = [b.name for b in arm.data.bones if any(k in b.name.lower() for k in ('upperarm', 'lowerarm', 'thigh', 'calf', 'clavicle', 'spine', 'neck'))]
    def centers(co):
        acc = {}
        for v in body.data.vertices:
            for g in v.groups:
                n = groups.get(g.group)
                if n in want and g.weight > 0.5:
                    s = acc.setdefault(n, [Vector(), 0])
                    s[0] += co[v.index]
                    s[1] += 1
        return {n: s[0] / s[1] for n, s in acc.items() if s[1]}
    set_morphs([body], {})
    c0 = centers(evaluated(body)[0])
    shifts = {}
    for m in ('body_heavy', 'body_thin', 'body_muscle', 'body_soft'):
        set_morphs([body], {m: 1.0})
        c1 = centers(evaluated(body)[0])
        shifts[m] = {n: round((c1[n] - c0[n]).length * 1000, 1) for n in c0 if n in c1}
    report['deslocamento_mm_por_morph'] = shifts
    report['bones'] = [b.name for b in arm.data.bones]

json.dump(report, open(OUT, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('ok', OUT)

"""
Tutory Ping Pong - avatar library builder.

Reads the glTF characters of "Ultimate Animated Character Pack" (Quaternius, CC0) and writes one optimised
library.glb + catalog.json. Runs on the Python embedded in Blender (no system Python required):

  blender -b --factory-startup --python tools/build_avatar_library.py -- <pack glTF dir> <app/assets/avatars> [--raw]

Why this works: all 52 characters share one skeleton (same 23 joints, identical inverse bind matrices) and the same
clips, so any primitive of any character can be bound to a single rig at runtime. Geometry is never altered: pieces
are only separated (head / body / feet / face islands) and deduplicated by content hash.
"""
import base64, hashlib, json, os, struct, sys

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
RAW = '--raw' in argv
COMP = {5121: ('B', 1), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
NUM = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def linear_to_hex(col):
    def enc(c):
        c = max(0.0, min(1.0, c))
        s = c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
        return int(round(s * 255))
    return '#%02x%02x%02x' % (enc(col[0]), enc(col[1]), enc(col[2]))


class Char:
    def __init__(self, path):
        self.name = os.path.basename(path)[:-5]
        self.g = json.load(open(path, encoding='utf8'))
        self.data = base64.b64decode(self.g['buffers'][0]['uri'].split(',')[1])
        skin = self.g['skins'][0]
        self.joints = [self.g['nodes'][j]['name'] for j in skin['joints']]

    def acc(self, i):
        a = self.g['accessors'][i]
        bv = self.g['bufferViews'][a['bufferView']]
        c, s = COMP[a['componentType']]
        n = NUM[a['type']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        st = bv.get('byteStride', s * n)
        fmt = '<%d%s' % (n, c)
        out = [struct.unpack_from(fmt, self.data, off + k * st) for k in range(a['count'])]
        return out

    def prims(self):
        node = next(n for n in self.g['nodes'] if 'mesh' in n)
        for p in self.g['meshes'][node['mesh']]['primitives']:
            mat = self.g['materials'][p['material']]
            pos = self.acc(p['attributes']['POSITION'])
            nor = self.acc(p['attributes']['NORMAL'])
            jnt = self.acc(p['attributes']['JOINTS_0'])
            wgt = self.acc(p['attributes']['WEIGHTS_0'])
            idx = [v[0] for v in self.acc(p['indices'])]
            yield mat['name'], mat['pbrMetallicRoughness'].get('baseColorFactor', [1, 1, 1, 1]), pos, nor, jnt, wgt, idx


def dominant(jnt, wgt, names):
    return [names[j[max(range(4), key=lambda k: w[k])]] for j, w in zip(jnt, wgt)]


def subset(tris, pos, nor, jnt, wgt):
    """Compact vertex buffers for a list of triangles (vertex indices)."""
    remap, p, n, j, w, ix = {}, [], [], [], [], []
    for v in tris:
        if v not in remap:
            remap[v] = len(p)
            p.append(pos[v]); n.append(nor[v]); j.append(jnt[v]); w.append(wgt[v])
        ix.append(remap[v])
    return p, n, j, w, ix


def islands(idx, nverts, pos):
    """Connected components of a triangle list (welding vertices by position, since normals split them)."""
    parent = {}
    def find(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    key = lambda v: tuple(round(c, 4) for c in pos[v])
    for t in range(0, len(idx), 3):
        a, b, c = key(idx[t]), key(idx[t + 1]), key(idx[t + 2])
        parent[find(b)] = find(a)
        parent[find(c)] = find(a)
    groups = {}
    for t in range(0, len(idx), 3):
        groups.setdefault(find(key(idx[t])), []).extend(idx[t:t + 3])
    return list(groups.values())


class Library:
    def __init__(self):
        self.parts = {}

    def add(self, char, mat, kind, col, buffers):
        p, n, j, w, ix = buffers
        if not ix:
            return None
        h = hashlib.md5((str([tuple(round(c, 4) for c in q) for q in p]) + str(ix)).encode()).hexdigest()[:10]
        if h not in self.parts:
            self.parts[h] = dict(id=h, char=char, mat=mat, kind=kind, color=linear_to_hex(col), p=p, n=n, j=j, w=w, ix=ix, seen=[])
        self.parts[h]['seen'].append('%s/%s' % (char, mat))
        return h


chars = [Char(os.path.join(SRC, f)) for f in sorted(os.listdir(SRC)) if f.endswith('.gltf')]
names = chars[0].joints
lib = Library()
index = {}  # "Char/Mat[.kind]" -> part id
colors = {}  # "Char/Mat[.kind]" -> original colour in that character (same geometry may be recoloured elsewhere)
SHOE_Y = 0.42  # bare feet live inside the Skin primitive; below this height they become a colourable shoe slot

for ch in chars:
    assert ch.joints == names, ch.name
    for mat, col, pos, nor, jnt, wgt, idx in ch.prims():
        dom = dominant(jnt, wgt, names)

        def reg(key, kind, tris):
            index[key] = lib.add(ch.name, mat, kind, col, subset(tris, pos, nor, jnt, wgt))
            colors[key] = linear_to_hex(col)

        if mat == 'Face':
            # eyes and brows are separate islands: brows sit above the mid height of the island centroids
            groups = islands(idx, len(pos), pos)
            cy = [sum(pos[v][1] for v in g) / len(g) for g in groups]
            mid = (min(cy) + max(cy)) / 2
            brows, eyes = [], []
            for g, y in zip(groups, cy):
                (brows if (max(cy) - min(cy) > 0.02 and y > mid) else eyes).extend(g)
            reg('%s/Face.eyes' % ch.name, 'eyes', eyes)
            if brows:
                reg('%s/Face.brows' % ch.name, 'brows', brows)
            continue
        head, feet, rest = [], [], []
        for t in range(0, len(idx), 3):
            tri = idx[t:t + 3]
            nh = sum(dom[v] == 'Head' for v in tri)
            if nh >= 2:
                head.extend(tri)
            elif mat == 'Skin' and all(pos[v][1] < SHOE_Y for v in tri):
                feet.extend(tri)
            else:
                rest.extend(tri)
        if head:
            reg('%s/%s.head' % (ch.name, mat), 'head', head)
        if feet:
            reg('%s/%s.feet' % (ch.name, mat), 'feet', feet)
        if rest:
            reg('%s/%s' % (ch.name, mat), 'body', rest)

# ----------------------------------------------------------------------------- catalog
catalog_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'avatar_catalog.json')
curated = None
if not RAW and os.path.exists(catalog_path):
    curated = json.load(open(catalog_path, encoding='utf8'))

used = None
if curated:
    def ref(name):
        if name not in index or index[name] is None:
            raise KeyError('catalog references unknown part: ' + name)
        return index[name]
    used = set()
    def resolve(part):
        out = dict(part)
        out['part'] = ref(part['ref'])
        out.pop('ref')
        if 'color' not in out:
            out['color'] = colors[part['ref']]
        used.add(out['part'])
        return out
    final = {'source': 'Ultimate Animated Character Pack - Quaternius (CC0 1.0)', 'joints': names}
    for group, items in curated.items():
        if group.startswith('_'):
            continue
        final[group] = []
        for item in items:
            it = dict(item)
            it['parts'] = [resolve(p) for p in item.get('parts', [])]
            final[group].append(it)
else:
    final = {'source': 'raw', 'joints': names,
             'index': index,
             'parts': [{k: v for k, v in p.items() if k in ('id', 'char', 'mat', 'kind', 'color', 'seen')} | {'verts': len(p['p']), 'tris': len(p['ix']) // 3}
                       for p in lib.parts.values()]}

selected = [p for p in lib.parts.values() if used is None or p['id'] in used]

# ----------------------------------------------------------------------------- GLB
base = next(c for c in chars if c.name == 'Casual_Male')  # has all 17 clips
bin_ = bytearray()
views, accessors = [], []


def push(raw, target=None, align=4):
    while len(bin_) % align:
        bin_.append(0)
    v = {'buffer': 0, 'byteOffset': len(bin_), 'byteLength': len(raw)}
    if target:
        v['target'] = target
    bin_.extend(raw)
    views.append(v)
    return len(views) - 1


def accessor(view, ctype, count, type_, **extra):
    a = dict(bufferView=view, componentType=ctype, count=count, type=type_)
    a.update(extra)
    accessors.append(a)
    return len(accessors) - 1


src_nodes = base.g['nodes']
skin = base.g['skins'][0]
body_index = next(i for i, n in enumerate(src_nodes) if 'mesh' in n)
arm_index = next(i for i, n in enumerate(src_nodes) if n.get('name') == 'CharacterArmature')
nodes = []
remap = {}
for i, n in enumerate(src_nodes):
    if i == body_index:
        continue
    remap[i] = len(nodes)
    nodes.append({k: v for k, v in n.items() if k in ('name', 'translation', 'rotation', 'scale')})
for i, n in enumerate(src_nodes):
    if i != body_index and 'children' in n:
        kids = [remap[c] for c in n['children'] if c != body_index]
        if kids:
            nodes[remap[i]]['children'] = kids

ibm_raw = b''.join(struct.pack('<16f', *m) for m in base.acc(skin['inverseBindMatrices']))
ibm = accessor(push(ibm_raw), 5126, len(skin['joints']), 'MAT4')
skins = [{'inverseBindMatrices': ibm, 'joints': [remap[j] for j in skin['joints']], 'name': 'Rig'}]

meshes = []
mesh_nodes = []
materials = [{'name': 'Part', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': 0.8}}]
for part in selected:
    p, n, j, w, ix = part['p'], part['n'], part['j'], part['w'], part['ix']
    count = len(p)
    pos_raw = b''.join(struct.pack('<3f', *q) for q in p)
    mn = [min(q[k] for q in p) for k in range(3)]
    mx = [max(q[k] for q in p) for k in range(3)]
    a_pos = accessor(push(pos_raw, 34962), 5126, count, 'VEC3', min=mn, max=mx)
    nor_raw = b''.join(struct.pack('<3bx', *[max(-127, min(127, int(round(c * 127)))) for c in q]) for q in n)
    nv = push(nor_raw, 34962); views[nv]['byteStride'] = 4; a_nor = accessor(nv, 5120, count, 'VEC3', normalized=True)
    jnt_raw = b''.join(struct.pack('<4B', *q) for q in j)
    a_jnt = accessor(push(jnt_raw, 34962), 5121, count, 'VEC4')
    wr = bytearray()
    for q in w:
        b = [int(round(max(0, c) * 255)) for c in q]
        b[b.index(max(b))] += 255 - sum(b)
        wr.extend(bytes(b))
    a_wgt = accessor(push(bytes(wr), 34962), 5121, count, 'VEC4', normalized=True)
    if count < 65536:
        a_idx = accessor(push(struct.pack('<%dH' % len(ix), *ix), 34963), 5123, len(ix), 'SCALAR')
    else:
        a_idx = accessor(push(struct.pack('<%dI' % len(ix), *ix), 34963), 5125, len(ix), 'SCALAR')
    meshes.append({'name': part['id'], 'primitives': [{'attributes': {'POSITION': a_pos, 'NORMAL': a_nor, 'JOINTS_0': a_jnt, 'WEIGHTS_0': a_wgt}, 'indices': a_idx, 'material': 0}]})
    nodes.append({'name': part['id'], 'mesh': len(meshes) - 1, 'skin': 0})
    mesh_nodes.append(len(nodes) - 1)
nodes[remap[arm_index]]['children'] = nodes[remap[arm_index]].get('children', []) + mesh_nodes

animations = []
for clip in base.g['animations']:
    samplers, channels = [], []
    input_cache = {}
    for c in clip['channels']:
        path = c['target']['path']
        if path == 'scale':  # the rig never animates scale; dropping it keeps head-shape scaling simple at runtime
            continue
        s = clip['samplers'][c['sampler']]
        ia, oa = s['input'], s['output']
        if ia not in input_cache:
            times = base.acc(ia)
            raw = b''.join(struct.pack('<f', t[0]) for t in times)
            input_cache[ia] = accessor(push(raw), 5126, len(times), 'SCALAR', min=[times[0][0]], max=[times[-1][0]])
        vals = base.acc(oa)
        n_ = len(vals[0])
        raw = b''.join(struct.pack('<%df' % n_, *v) for v in vals)
        a_out = accessor(push(raw), 5126, len(vals), 'VEC3' if n_ == 3 else 'VEC4')
        samplers.append({'input': input_cache[ia], 'output': a_out, 'interpolation': s.get('interpolation', 'LINEAR')})
        channels.append({'sampler': len(samplers) - 1, 'target': {'node': remap[c['target']['node']], 'path': path}})
    animations.append({'name': clip['name'], 'samplers': samplers, 'channels': channels})

gltf = {
    'asset': {'version': '2.0', 'generator': 'tutory-ping-pong/build_avatar_library.py'},
    'extensionsUsed': ['KHR_mesh_quantization'], 'extensionsRequired': ['KHR_mesh_quantization'],
    'scene': 0, 'scenes': [{'nodes': [remap[arm_index]]}],
    'nodes': nodes, 'meshes': meshes, 'skins': skins, 'materials': materials, 'animations': animations,
    'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': 0}],
}
while len(bin_) % 4:
    bin_.append(0)
gltf['buffers'][0]['byteLength'] = len(bin_)
js = json.dumps(gltf, separators=(',', ':')).encode()
js += b' ' * ((4 - len(js) % 4) % 4)
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, 'library.glb'), 'wb') as f:
    f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(bin_)))
    f.write(struct.pack('<I4s', len(js), b'JSON') + js)
    f.write(struct.pack('<I4s', len(bin_), b'BIN\0') + bin_)
with open(os.path.join(OUT, 'catalog.json'), 'w', encoding='utf8') as f:
    json.dump(final, f, ensure_ascii=False, indent=1)
print('parts', len(selected), 'of', len(lib.parts), 'bytes', len(bin_), 'anims', len(animations))

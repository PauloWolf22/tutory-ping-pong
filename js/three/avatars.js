// Monta avatares a partir das peças reais do pack (library.glb + catalog.json).
// Uma só definição de esqueleto: cada avatar clona os ossos e liga as geometrias compartilhadas a eles.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';

const ASSET_BASE = new URL('../../assets/avatars/', import.meta.url).href;

export const SKIN_TONES = ['#f7d7c4', '#eebb99', '#d9a07a', '#b97a52', '#8d5a3a', '#5e3b26', '#3b2519', '#1f1f1f', '#7f9a3f', '#6f8f6a'];
export const HAIR_COLORS = ['#1d1612', '#3b2518', '#6b4226', '#a56b35', '#d9a84e', '#e8d9a0', '#9a9a9a', '#f1f1f1', '#b5392c', '#3b7bf5', '#0040c8', '#2fa39a', '#c04f9b'];
export const FABRIC_COLORS = ['#ffffff', '#d0ddef', '#7c8798', '#1c2230', '#020308', '#0a1a3a', '#0040c8', '#3b7bf5', '#28a0a0', '#3f9b5d', '#d8b13a', '#d9772c', '#c0262d', '#a23f96'];
export const HEAD_SHAPES = {
  normal: { label: 'Padrão', s: [1, 1, 1] }, round: { label: 'Redondo', s: [1.09, 0.95, 1.05] },
  long: { label: 'Alongado', s: [0.93, 1.1, 0.95] }, big: { label: 'Cabeção', s: [1.18, 1.18, 1.18] }, small: { label: 'Pequeno', s: [0.88, 0.88, 0.88] },
};
export const EXPRESSIONS = {
  neutral: { label: 'Neutro' }, focused: { label: 'Concentrado', brow: [-0.32, -0.03], eye: 0.86 },
  happy: { label: 'Animado', brow: [0.26, 0.05], eye: 1 }, surprised: { label: 'Surpreso', brow: [0.05, 0.1], eye: 1.28 },
  sleepy: { label: 'Sonolento', brow: [0.1, -0.03], eye: 0.42 },
};
export const POSES = {
  Idle: 'Em guarda', SwordSlash: 'Rebatida', Punch: 'Saque', Victory: 'Vitória', Jump: 'Pulo', Defeat: 'Derrota',
  PickUp: 'Pegar bola', Walk: 'Andar', Run: 'Correr', Roll: 'Rolamento', SitDown: 'Sentar',
};
export const RACKETS = {
  none: { label: 'Sem raquete' }, classic: { label: 'Clássica', blade: 0.42, handle: 0.26 },
  pro: { label: 'Pro', blade: 0.46, handle: 0.3 }, short: { label: 'Compacta', blade: 0.36, handle: 0.2 },
  round: { label: 'Redonda larga', blade: 0.5, handle: 0.22 },
};
export const ACCESSORIES = {
  glasses: { label: 'Óculos', options: { round: 'Redondos', square: 'Quadrados', sport: 'Esportivos' } },
  wrist: { label: 'Munhequeira', options: { left: 'Esquerda', right: 'Direita', both: 'Nas duas' } },
  medal: { label: 'Medalha', options: { gold: 'Ouro', silver: 'Prata' } },
  badge: { label: 'Escudo no peito', options: { tutory: 'Logo Tutory', ball: 'Bola' } },
};

// Personagens originais do pack, recompostos a partir das peças com as cores originais.
export const PRESETS = [
  { id: 'atleta', label: 'Atleta Tutory', outfit: 'casual', head: 'human', hair: 'short', skin: '#d9a07a', hairColor: '#3b2518', colors: { 'casual:Camiseta': '#0040c8', 'casual:Calça': '#0a1a3a', 'casual:Cinto': '#3b7bf5' }, shoes: '#ffffff', badge: 'tutory' },
  { id: 'casual', label: 'Casual', outfit: 'casual', hair: 'short' },
  { id: 'casual2', label: 'Moletom', outfit: 'casual2', hair: 'long' },
  { id: 'casual3', label: 'Regata', outfit: 'casual3', hair: 'waves' },
  { id: 'suit', label: 'Executivo', outfit: 'suit', hair: 'short' },
  { id: 'doctor', label: 'Médica', outfit: 'doctor', hair: 'curly', face: 'doctor' },
  { id: 'chef', label: 'Chef', outfit: 'chef', hat: 'chef', facial: 'chef', face: 'classic' },
  { id: 'worker', label: 'Obra', outfit: 'worker', hat: 'hardhat', face: 'classic' },
  { id: 'cowboy', label: 'Cowboy', outfit: 'cowboy', hat: 'cowboy', facial: 'cowboy' },
  { id: 'soldier', label: 'Soldado', outfit: 'soldier', hat: 'helmet', face: 'classic' },
  { id: 'kimono', label: 'Karateca', outfit: 'kimono', hat: 'headband', face: 'classic' },
  { id: 'viking', label: 'Viking', outfit: 'viking', hair: 'viking', hat: 'viking' },
  { id: 'pirate', label: 'Pirata', outfit: 'pirate', hat: 'pirate', face: 'pirate' },
  { id: 'classy', label: 'Clássico', outfit: 'classy', hair: 'classy', hat: 'tophat' },
  { id: 'wizard', label: 'Mago', outfit: 'wizard', hair: 'wizard', hat: 'wizard', face: 'dot' },
  { id: 'witch', label: 'Bruxa', outfit: 'witch', hair: 'long', hat: 'witch', face: 'dot' },
  { id: 'elf', label: 'Elfo', outfit: 'elf', hat: 'elf', face: 'dot' },
  { id: 'ninja', label: 'Ninja', outfit: 'ninja', head: 'ninja' },
  { id: 'ninja_hair', label: 'Ninja sem capuz', outfit: 'ninja', hair: 'ninja' },
  { id: 'knight', label: 'Cavaleiro', outfit: 'knight', head: 'knight' },
  { id: 'knight_gold', label: 'Cavaleiro dourado', outfit: 'knight_gold', head: 'knight_gold' },
  { id: 'goblin', label: 'Goblin', outfit: 'goblin_bare', head: 'goblin', facial: 'fangs', skin: '#6f8f3a' },
  { id: 'zombie', label: 'Zumbi', outfit: 'zombie', head: 'zombie_brain', skin: '#5e8a55' },
  { id: 'cow', label: 'Vaca', outfit: 'suit', head: 'cow' },
  { id: 'pug', label: 'Pug', outfit: 'suit', head: 'pug' },
];

export function presetToAvatar(preset) {
  const { id, label, ...rest } = preset;
  return normalizeAvatar({ skin: '#1f1f1f', hair: null, hat: null, facial: null, ...rest, preset: id, colors: rest.colors || {} });
}

const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// Avatar inicial variado e estável por nome, para listas importadas não virarem clones.
export function avatarFromName(name) {
  const r = hash(name);
  const pick = (arr, salt) => arr[hash(r + salt) % arr.length];
  const outfit = pick(['casual', 'casual2', 'casual3', 'suit', 'doctor', 'worker', 'cowboy', 'kimono'], 'o');
  return normalizeAvatar({
    outfit, skin: pick(SKIN_TONES.slice(0, 7), 's'),
    hair: pick(['short', 'quiff', 'waves', 'mid', 'long', 'curly', 'bob', 'chef', 'ninja', 'kimono', 'knight', 'worker'], 'h'),
    hairColor: pick(HAIR_COLORS.slice(0, 7), 'c'), face: pick(['classic', 'lashes', 'chef', 'doctor'], 'f'),
    shoes: pick(['#ffffff', '#1c2230', '#0040c8', '#c0262d'], 'p'),
    colors: { [`${outfit}:${{ casual: 'Camiseta', casual2: 'Blusa', casual3: 'Regata', suit: 'Terno', doctor: 'Jaleco', worker: 'Camiseta', cowboy: 'Jaqueta', kimono: 'Kimono' }[outfit]}`]: pick(FABRIC_COLORS, 't') },
    racket: { style: 'classic', color: pick(['#c0262d', '#0040c8', '#1c2230'], 'r') },
  });
}

export function normalizeAvatar(a = {}) {
  return {
    v: 1, outfit: 'casual', head: 'human', headShape: 'normal', hair: 'short', hairColor: null, hat: null, facial: null,
    face: 'lashes', expression: 'neutral', skin: '#d9a07a', eyeColor: null, browColor: null, shoes: null, colors: {},
    glasses: null, wrist: null, medal: null, badge: null, racket: { style: 'classic', color: '#c0262d' }, pose: 'Idle', preset: null,
    ...a,
  };
}

const luminance = (hex) => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
export const autoEyeColor = (a) => (luminance(a.skin) > 0.04 ? '#141414' : '#fffff0');

let libraryPromise = null;
export function loadLibrary() {
  if (!libraryPromise) {
    libraryPromise = Promise.all([
      new GLTFLoader().loadAsync(ASSET_BASE + 'library.glb'),
      fetch(ASSET_BASE + 'catalog.json').then((r) => r.json()),
      loadBrandTexture(),
    ]).then(([gltf, catalog]) => {
      const geoms = new Map();
      let inverses = null;
      const remove = [];
      gltf.scene.traverse((o) => {
        if (o.isSkinnedMesh) {
          geoms.set(o.name, o.geometry);
          o.geometry.computeBoundingBox();
          inverses = inverses || o.skeleton.boneInverses;
          remove.push(o);
        }
      });
      remove.forEach((o) => o.removeFromParent());
      const index = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
      return {
        rig: gltf.scene, geoms, inverses, catalog,
        clips: Object.fromEntries(gltf.animations.map((c) => [c.name, c])),
        outfits: index(catalog.outfits), heads: index(catalog.heads), faces: index(catalog.faces),
        hairs: index(catalog.hairs), hats: index(catalog.hats), facials: index(catalog.facials),
      };
    });
  }
  return libraryPromise;
}

// ---------------------------------------------------------------- face (expressões)
const exprCache = new Map();
function expressionGeometry(geom, partKind, exprId) {
  const expr = EXPRESSIONS[exprId];
  if (!expr || (!expr.brow && !expr.eye)) return geom;
  const key = geom.uuid + exprId;
  if (exprCache.has(key)) return exprCache.get(key);
  const g = geom.clone();
  const pos = g.attributes.position;
  const sides = { L: { sx: 0, sy: 0, n: 0, ids: [] }, R: { sx: 0, sy: 0, n: 0, ids: [] } };
  for (let i = 0; i < pos.count; i++) {
    const s = sides[pos.getX(i) > 0 ? 'L' : 'R'];
    s.sx += pos.getX(i); s.sy += pos.getY(i); s.n++; s.ids.push(i);
  }
  for (const [name, s] of Object.entries(sides)) {
    if (!s.n) continue;
    const cx = s.sx / s.n, cy = s.sy / s.n;
    const angle = partKind === 'brows' && expr.brow ? expr.brow[0] * (name === 'L' ? 1 : -1) : 0;
    const dy = partKind === 'brows' && expr.brow ? expr.brow[1] : 0;
    const sy = partKind === 'eyes' && expr.eye ? expr.eye : 1;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    for (const i of s.ids) {
      const x = pos.getX(i) - cx, y = (pos.getY(i) - cy) * sy;
      pos.setXY(i, cx + x * cos - y * sin, cy + x * sin + y * cos + dy);
    }
  }
  g.computeBoundingBox();
  exprCache.set(key, g);
  return g;
}

// ---------------------------------------------------------------- acessórios próprios (a raquete não existe no pack)
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0, ...extra });

function makeRacket(cfg) {
  const def = RACKETS[cfg.style] || RACKETS.classic;
  const g = new THREE.Group();
  const r = def.blade;
  const wood = std('#b98a55', { roughness: 0.55 });
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.035, 28), wood);
  blade.rotation.x = Math.PI / 2;
  const redSide = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.97, r * 0.97, 0.018, 28), std(cfg.color || '#c0262d', { roughness: 0.85 }));
  redSide.rotation.x = Math.PI / 2;
  redSide.position.z = 0.026;
  const blackSide = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.97, r * 0.97, 0.018, 28), std('#15171c', { roughness: 0.9 }));
  blackSide.rotation.x = Math.PI / 2;
  blackSide.position.z = -0.026;
  const head = new THREE.Group();
  head.add(blade, redSide, blackSide);
  head.scale.x = cfg.style === 'round' ? 1 : 0.94;
  head.position.x = -(def.handle + r * 0.86);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(def.handle + 0.12, 0.11, 0.075), std(cfg.handle || '#7a4f2a', { roughness: 0.55 }));
  handle.position.x = -def.handle / 2 + 0.02;
  g.add(head, handle);
  g.scale.setScalar(0.8);
  return g;
}

function makeGlasses(style, faceBox) {
  const g = new THREE.Group();
  const y = (faceBox.min.y + faceBox.max.y) / 2 - 0.02;
  const z = faceBox.max.z + 0.04;
  const dx = Math.max(0.14, (faceBox.max.x - faceBox.min.x) / 2);
  const frame = std(style === 'sport' ? '#0040c8' : '#14161c', { metalness: 0.3, roughness: 0.4 });
  const lensMat = new THREE.MeshStandardMaterial({ color: style === 'sport' ? '#5ea0ff' : '#b8d4ff', transparent: true, opacity: 0.28, roughness: 0.1, metalness: 0.5 });
  for (const sx of [-1, 1]) {
    if (style === 'round') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.02, 8, 20), frame);
      ring.position.set(sx * dx, y, z);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), lensMat);
      lens.position.set(sx * dx, y, z);
      g.add(ring, lens);
    } else {
      const w = style === 'sport' ? 0.36 : 0.3, h = style === 'sport' ? 0.17 : 0.22;
      const shape = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, h + 0.05, 0.02), frame);
      shape.position.set(sx * dx, y, z - 0.012);
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lensMat);
      lens.position.set(sx * dx, y, z + 0.001);
      g.add(shape, lens);
    }
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(dx * 0.7, 0.025, 0.025), frame);
  bridge.position.set(0, y + 0.02, z);
  g.add(bridge);
  return g;
}

let logoTexture = null;
function brandTexture() { return logoTexture; }
const loadBrandTexture = () => new THREE.TextureLoader().loadAsync(new URL('../../assets/brand/logo-branco.png', import.meta.url).href)
  .then((t) => { t.colorSpace = THREE.SRGBColorSpace; logoTexture = t; })
  .catch(() => { logoTexture = null; });

function chestSurfaceZ(lib, outfit) {
  // frente do tronco na altura do peito, medida nas peças da roupa
  let z = 0;
  for (const p of outfit.parts) {
    const pos = lib.geoms.get(p.part)?.attributes.position;
    if (!pos) continue;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 1.45 && y < 1.8 && Math.abs(pos.getX(i)) < 0.3 && pos.getZ(i) > z) z = pos.getZ(i);
    }
  }
  return z;
}

// ---------------------------------------------------------------- rig
export class Avatar {
  constructor(lib, rawConfig) {
    this.lib = lib;
    this.config = normalizeAvatar(rawConfig);
    const a = this.config;
    this.group = new THREE.Group();
    this.rig = lib.rig.clone(true);
    this.group.add(this.rig);
    const bones = new Map();
    this.rig.traverse((o) => { if (o.isBone) bones.set(o.name, o); });
    // GLTFLoader remove o ponto dos nomes (Fist.R vira FistR)
    const bone = (n) => bones.get(THREE.PropertyBinding.sanitizeNodeName(n));
    this.bone = bone;
    this.bones = bones;
    this.skeleton = new THREE.Skeleton(lib.catalog.joints.map(bone), lib.inverses);
    this.materials = [];
    this.disposables = [];

    const outfit = lib.outfits[a.outfit] || lib.outfits.casual;
    const head = lib.heads[a.head] || lib.heads.human;
    this.addEntry(outfit, a.outfit);
    this.addEntry(head, 'head:' + head.id);
    if (!head.noHair && a.hair && lib.hairs[a.hair]) this.addEntry(lib.hairs[a.hair], 'hair');
    if (!head.noHat && a.hat && lib.hats[a.hat]) this.addEntry(lib.hats[a.hat], 'hat:' + a.hat);
    if (!head.noHair && a.facial && lib.facials[a.facial]) this.addEntry(lib.facials[a.facial], 'facial:' + a.facial);
    let faceBox = null;
    const face = head.noFace ? null : lib.faces[head.lockFace || a.face] || lib.faces.classic;
    if (face) {
      this.addEntry(face, 'face');
      const eyes = face.parts.find((p) => p.slot === 'eyes');
      if (eyes) faceBox = lib.geoms.get(eyes.part).boundingBox;
    }
    const shape = HEAD_SHAPES[a.headShape] || HEAD_SHAPES.normal;
    bone('Head').scale.set(...shape.s);

    if (a.racket?.style && a.racket.style !== 'none') this.attachToBone('Fist.R', makeRacket(a.racket), 'hand');
    if (a.glasses && faceBox) this.attachModel('Head', makeGlasses(a.glasses, faceBox));
    if (a.wrist) {
      const mat = a.colors['wrist'] || '#ffffff';
      if (a.wrist !== 'right') this.attachRing('LowerArm.L', 'Fist.L', mat);
      if (a.wrist !== 'left') this.attachRing('LowerArm.R', 'Fist.R', mat);
    }
    if (a.medal) this.attachMedal(a.medal, outfit);
    if (a.badge) this.attachBadge(a.badge, outfit);

    this.mixer = new THREE.AnimationMixer(this.rig);
    this.current = null;
    this.play(a.pose || 'Idle', { fade: 0 });
    this.mixer.update(0);
  }

  slotColor(part, entryKey) {
    const a = this.config;
    if (part.slot === 'skin') return a.skin;
    if (part.slot === 'shoes') return a.shoes || (a.skin === '#1f1f1f' ? part.color : '#1c2230');
    if (part.slot === 'hair') return a.hairColor || part.color;
    if (part.slot === 'eyes') return a.eyeColor || autoEyeColor(a);
    if (part.slot === 'brows') return a.browColor || a.hairColor || (a.eyeColor || autoEyeColor(a));
    return a.colors[`${entryKey}:${part.slot}`] || part.color;
  }

  addEntry(entry, key) {
    for (const part of entry.parts) {
      let geom = this.lib.geoms.get(part.part);
      if (!geom) continue;
      if (part.slot === 'eyes' || part.slot === 'brows') geom = expressionGeometry(geom, part.slot, this.config.expression);
      const material = std(this.slotColor(part, key), { roughness: part.slot === 'skin' ? 0.62 : 0.74, metalness: /Ouro|Dourado|Armadura|Elmo|Barras/.test(part.slot) ? 0.35 : 0 });
      const mesh = new THREE.SkinnedMesh(geom, material);
      mesh.name = part.slot;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.bind(this.skeleton, new THREE.Matrix4());
      this.rig.add(mesh);
      this.materials.push(material);
    }
  }

  boneIndex(name) { return this.lib.catalog.joints.indexOf(name); }

  bindMatrix(name) { return this.lib.inverses[this.boneIndex(name)].clone().invert(); }

  // Prende um objeto escrito em coordenadas do modelo em pose de repouso ao osso, respeitando a pose atual.
  attachModel(boneName, object, modelMatrix = new THREE.Matrix4()) {
    const local = this.lib.inverses[this.boneIndex(boneName)].clone().multiply(modelMatrix);
    local.decompose(object.position, object.quaternion, object.scale);
    this.bone(boneName).add(object);
    this.track(object);
  }

  attachToBone(boneName, object) {
    const pos = new THREE.Vector3().setFromMatrixPosition(this.bindMatrix(boneName));
    this.attachModel(boneName, object, new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z));
  }

  attachRing(from, to, color) {
    const a = new THREE.Vector3().setFromMatrixPosition(this.bindMatrix(from));
    const b = new THREE.Vector3().setFromMatrixPosition(this.bindMatrix(to));
    const center = a.clone().lerp(b, 0.72);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.15, 14), std(color));
    const dir = b.clone().sub(a).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.attachModel(from, ring, new THREE.Matrix4().compose(center, q, new THREE.Vector3(1, 1, 1)));
  }

  attachMedal(kind, outfit) {
    const color = kind === 'gold' ? '#c9a96e' : '#c8ced8';
    const g = new THREE.Group();
    const z = chestSurfaceZ(this.lib, outfit) + 0.025;
    const y = 1.5;
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.03, 20), std(color, { metalness: 0.4, roughness: 0.3, emissive: color, emissiveIntensity: 0.12 }));
    disk.rotation.x = Math.PI / 2;
    disk.position.set(0, y, z);
    g.add(disk);
    // fita: duas tiras do pescoço até o disco
    for (const s of [-1, 1]) {
      const from = new THREE.Vector3(s * 0.22, 2.03, 0.1);
      const to = new THREE.Vector3(0, y + 0.08, z);
      const len = from.distanceTo(to);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.07, len, 0.012), std('#0040c8'));
      strip.position.copy(from).lerp(to, 0.5);
      strip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(to).normalize());
      g.add(strip);
    }
    this.attachModel('Torso', g);
  }

  attachBadge(kind, outfit) {
    const z = chestSurfaceZ(this.lib, outfit) + 0.03;
    const m = new THREE.Mesh(
      kind === 'tutory' ? new THREE.PlaneGeometry(0.36, 0.085) : new THREE.CircleGeometry(0.07, 20),
      kind === 'tutory' ? new THREE.MeshBasicMaterial({ map: brandTexture(), transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }) : std('#ffffff', { side: THREE.DoubleSide }),
    );
    m.position.set(kind === 'tutory' ? 0 : 0.2, 1.72, z);
    const holder = new THREE.Group();
    holder.add(m);
    this.attachModel('Torso', holder);
  }

  track(object) {
    object.traverse((o) => {
      if (o.geometry) this.disposables.push(o.geometry);
      if (o.material) this.disposables.push(o.material);
    });
  }

  // loop=false mantém o último quadro e volta para `then`, quando informado.
  play(name, { loop = true, fade = 0.25, then = null, speed = 1 } = {}) {
    const clip = this.lib.clips[name] || this.lib.clips.Idle;
    const next = this.mixer.clipAction(clip);
    if (this.current === next && next.isRunning()) return next;
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !loop;
    next.timeScale = speed;
    next.enabled = true;
    if (this.current && fade) this.current.crossFadeTo(next, fade, false);
    else if (this.current) this.current.stop();
    next.play();
    this.current = next;
    if (this._then) this.mixer.removeEventListener('finished', this._then);
    this._then = null;
    if (!loop && then) {
      this._then = (e) => { if (e.action === next) this.play(then); };
      this.mixer.addEventListener('finished', this._then);
    }
    return next;
  }

  update(dt) { this.mixer.update(dt); }

  dispose() {
    this.mixer.stopAllAction();
    this.materials.forEach((m) => m.dispose());
    this.disposables.forEach((d) => d.dispose());
    this.group.removeFromParent();
  }
}

// Escala que leva o personagem (~4,2 unidades) a um humano de 1,75 m nas cenas.
export const WORLD_SCALE = 0.42;

// ---------------------------------------------------------------- retratos (um renderer offscreen para todos os cards)
let webgl = null;
export function webglAvailable() {
  if (webgl === null) {
    try {
      const c = document.createElement('canvas');
      webgl = !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { webgl = false; }
  }
  return webgl;
}

const portraits = new Map();
const readyPortraits = new Map();
const portraitKey = (config, kind, size) => [kind, size, JSON.stringify(config)].join("|");
// Retrato jÃ¡ renderizado, para o card nascer com a imagem em vez de piscar.
export const portraitReady = (raw, { kind = 'bust', size = 256 } = {}) => readyPortraits.get(portraitKey(normalizeAvatar(raw), kind, size)) || null;
let portraitQueue = Promise.resolve();
let shot = null;

function portraitRig() {
  if (shot) return shot;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x46557a, 1.75));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(2, 5, 6);
  const rim = new THREE.DirectionalLight(0x3b7bf5, 3.2);
  rim.position.set(-4, 3, -4);
  const fill = new THREE.DirectionalLight(0x7fa8ff, 0.8);
  fill.position.set(4, 1, 2);
  scene.add(key, rim, fill);
  shot = { renderer, scene, camera: new THREE.PerspectiveCamera(24, 1, 0.1, 100) };
  return shot;
}

// kind: 'bust' (cards) ou 'full' (corpo inteiro). Sempre devolve uma dataURL em cache por configuração.
export function portrait(rawConfig, { kind = 'bust', size = 256 } = {}) {
  const config = normalizeAvatar(rawConfig);
  const key = portraitKey(config, kind, size);
  if (portraits.has(key)) return portraits.get(key);
  const task = portraitQueue.then(async () => {
    if (!webglAvailable()) return null;
    const lib = await loadLibrary();
    const { renderer, scene, camera } = portraitRig();
    renderer.setSize(size, size, false);
    const avatar = new Avatar(lib, { ...config, pose: 'Idle' });
    avatar.group.rotation.y = kind === 'bust' ? -0.22 : -0.35;
    scene.add(avatar.group);
    avatar.update(0.25);
    avatar.group.updateMatrixWorld(true);
    const headY = new THREE.Vector3().setFromMatrixPosition(avatar.bone('Head').matrixWorld).y;
    if (kind === 'bust') {
      const tall = ['wizard', 'elf', 'witch', 'tophat', 'chef', 'viking'].includes(config.hat) ? 0.35 : 0;
      camera.position.set(0, headY + 0.22 + tall / 2, 5.6 + tall * 2.4);
      camera.lookAt(0, headY + 0.06 + tall / 2, 0);
    } else {
      camera.position.set(0, 2.3, 11);
      camera.lookAt(0, 2, 0);
    }
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    avatar.dispose();
    readyPortraits.set(key, url);
    return url;
  });
  portraits.set(key, task);
  portraitQueue = task.catch(() => null);
  return task;
}

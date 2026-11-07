// Avatares realistas (MPFB/MakeHuman, gerados por tools/poc_mpfb/build_human.py).
// Um corpo base por gênero e uma peça por arquivo, todos no mesmo esqueleto. Cada avatar clona o esqueleto
// e reaproveita a geometria; só materiais, máscara do corpo e morphs são dele.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';
import * as SkeletonUtils from '../vendor/three/SkeletonUtils.js';
import { skinMaterial, eyeMaterial, hairMaterial } from './realism.js';
import { buildClips } from './motion.js';

const BASE = new URL('../../assets/humans/', import.meta.url).href;
export const WORLD_SCALE = 1;

export const GENDERS = { male: 'Masculino', female: 'Feminino' };
export const SKINS = { clara: 'Clara', oriental: 'Média', negra: 'Negra' };
export const HAIR_COLORS = ['#141010', '#3a2416', '#6b4226', '#a56b35', '#d9b36a', '#c9c9c9', '#a33', '#2f5fd0'];
export const CLOTH_COLORS = ['#ffffff', '#1c2230', '#0040c8', '#3b7bf5', '#c0262d', '#3f9b5d', '#d8b13a', '#a23f96'];
export const CATEGORIES = [['full', 'Conjuntos e vestidos'], ['top', 'Parte de cima'], ['bottom', 'Parte de baixo'], ['shoes', 'Calçados'], ['hair', 'Cabelo'], ['beard', 'Barba e bigode'], ['glasses', 'Óculos'], ['hat', 'Chapéus']];
export const OPTIONAL = new Set(['full', 'top', 'bottom', 'beard', 'glasses', 'hat', 'hair']);
export const SLIDERS = {
  'Rosto': [['Redondo', null, 'face_round'], ['Quadrado', null, 'face_square'], ['Oval', null, 'face_oval'], ['Triangular', null, 'face_tri'], ['Largura do queixo', 'jaw_narrow', 'jaw_wide'], ['Queixo saliente', 'chin_in', 'chin_out'], ['Maçã do rosto', 'cheek_low', 'cheek_high'], ['Bochecha', 'cheek_thin', 'cheek_full']],
  'Olhos e sobrancelhas': [['Tamanho do olho', 'eye_small', 'eye_big'], ['Canto do olho', 'eye_down', 'eye_up'], ['Prega do olho', null, 'eye_fold'], ['Altura da sobrancelha', 'brow_down', 'brow_up'], ['Ângulo da sobrancelha', 'brow_angle_down', 'brow_angle_up']],
  'Nariz e boca': [['Largura do nariz', 'nose_thin', 'nose_wide'], ['Comprimento do nariz', 'nose_short', 'nose_long'], ['Dorso do nariz', 'nose_flat', 'nose_hump'], ['Narinas', 'nostril_narrow', 'nostril_wide'], ['Largura da boca', 'mouth_narrow', 'mouth_wide'], ['Lábios', 'lips_thin', 'lips_full']],
  'Corpo': [['Peso', 'body_thin', 'body_heavy'], ['Músculo', 'body_soft', 'body_muscle'], ['Pescoço', 'neck_thin', 'neck_wide'], ['Idade', null, 'age_older']],
  'Traços de origem': [['Africana', null, 'race_african'], ['Asiática', null, 'race_asian'], ['Europeia', null, 'race_caucasian']],
  'Expressão': [['Sorriso', null, 'smile'], ['Sobrancelha erguida', null, 'brows_raised'], ['Sobrancelha franzida', null, 'brows_angry']],
};
export const RACKETS = { none: 'Sem raquete', classic: 'Clássica', pro: 'Pro', round: 'Redonda' };
export const POSES = { Idle: 'Em pé', Ready: 'Em guarda', SwordSlash: 'Rebatida', Victory: 'Vitória', Jump: 'Pulo', Defeat: 'Derrota' };

// Avatar inicial de quem ainda não montou o seu: variado e estável pelo nome.
const DEFAULT_PARTS = {
  male: { full: ['male_casualsuit04', 'male_casualsuit02', 'male_casualsuit03', 'male_casualsuit05'], hair: ['short02', 'short01', 'short03', 'afro01', 'short04', 'elvs_micky_afro'], shoes: ['shoes01', 'shoes02'] },
  female: { full: ['female_sportsuit01', 'female_casualsuit01', 'female_casualsuit02'], hair: ['long01', 'bob01', 'ponytail01', 'afro01', 'braid01', 'elvs_wavy_bob'], shoes: ['shoes03', 'shoes01'] },
};
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

export function avatarFromName(name, forceGender) {
  const r = hash(name || '?');
  const pick = (arr, salt) => arr[hash(r + salt) % arr.length];
  const gender = forceGender || (r % 2 ? 'male' : 'female');
  const d = DEFAULT_PARTS[gender];
  return normalizeAvatar({
    v: 2, gender, skin: pick(Object.keys(SKINS), 's'),
    parts: { full: pick(d.full, 'f'), hair: pick(d.hair, 'h'), shoes: pick(d.shoes, 'p') },
    colors: { hair: pick(HAIR_COLORS.slice(0, 5), 'c') }, provisional: true,
  });
}

export function normalizeAvatar(a = {}) {
  if (!a || a.v !== 2) a = { gender: 'male' };
  return {
    v: 2, gender: a.gender === 'female' ? 'female' : 'male', skin: SKINS[a.skin] ? a.skin : 'clara',
    morph: { ...(a.morph || {}) }, parts: { ...(a.parts || {}) }, colors: { ...(a.colors || {}) },
    height: a.height || 1, racket: { style: 'classic', color: '#c0262d', ...(a.racket || {}) }, pose: a.pose || 'Idle',
    medal: a.medal || null, thumb: a.thumb || null, provisional: !!a.provisional,
  };
}


// ---------------------------------------------------------------- carregamento compartilhado
const loader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const genders = new Map();
const partFiles = new Map();
const skinTextures = new Map();

export function loadGender(gender) {
  if (!genders.has(gender)) {
    genders.set(gender, (async () => {
      const [meta, gltf] = await Promise.all([
        fetch(`${BASE}human_${gender}.json`).then((r) => r.json()),
        loader.loadAsync(`${BASE}${gender}/base.glb`),
      ]);
      const template = gltf.scene;
      const clips = buildClips(template);
      return { gender, meta, template, clips };
    })());
  }
  return genders.get(gender);
}

// Mantido para o editor saber o catálogo sem montar um avatar.
export const loadLibrary = () => loadGender('male');

function loadPartFile(gender, name) {
  const key = gender + '/' + name;
  if (!partFiles.has(key)) partFiles.set(key, loader.loadAsync(`${BASE}${gender}/${name}.glb`));
  return partFiles.get(key);
}

function skinTexture(meta, label) {
  const file = meta.skins[label] || Object.values(meta.skins)[0];
  if (!skinTextures.has(file)) {
    skinTextures.set(file, texLoader.loadAsync(BASE + file).then((t) => {
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    }));
  }
  return skinTextures.get(file);
}

// Geometria com índice próprio sobre atributos compartilhados: cada avatar esconde a pele das próprias roupas.
function shareGeometry(src) {
  const g = new THREE.BufferGeometry();
  for (const [k, v] of Object.entries(src.attributes)) g.setAttribute(k, v);
  g.morphAttributes = src.morphAttributes;
  g.morphTargetsRelative = src.morphTargetsRelative;
  g.setIndex(new THREE.BufferAttribute(src.index.array.slice(), 1));
  g.boundingSphere = src.boundingSphere;
  g.boundingBox = src.boundingBox;
  return g;
}

function partMaterial(std, cat, avatar) {
  const m = std.clone();
  if (cat === 'hair' || cat === 'beard') return hairMaterial(std, avatar.config.colors.hair || '#3a2416');
  if (cat === 'glasses') { m.transparent = true; m.depthWrite = false; return m; }
  m.transparent = false;
  m.depthWrite = true;
  m.alphaTest = 0.3;
  m.side = THREE.DoubleSide;
  m.roughness = Math.max(m.roughness ?? 0.8, 0.8);
  const tint = avatar.config.colors[cat];
  if (tint) m.color.set(tint);
  return m;
}

function makeRacket(cfg) {
  const g = new THREE.Group();
  const r = cfg.style === 'round' ? 0.082 : cfg.style === 'pro' ? 0.078 : 0.074;
  const mat = (c, rough = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.006, 32), mat('#b98a55', 0.5));
  const red = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.97, r * 0.97, 0.003, 32), mat(cfg.color || '#c0262d', 0.85));
  const black = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.97, r * 0.97, 0.003, 32), mat('#15171c', 0.9));
  red.position.y = 0.0045;
  black.position.y = -0.0045;
  const head = new THREE.Group();
  head.add(blade, red, black);
  head.scale.z = cfg.style === 'round' ? 1 : 1.08;
  head.position.z = 0.1 + r * 0.9;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.02, 0.1), mat(cfg.handle || '#7a4f2a', 0.55));
  handle.position.z = 0.05;
  g.add(head, handle);
  return g;
}

export class Avatar {
  constructor(lib, config) {
    this.lib = lib;
    this.config = normalizeAvatar(config);
    this.group = new THREE.Group();
    this.root = SkeletonUtils.clone(lib.template);
    this.group.add(this.root);
    this.bones = new Map();
    this.root.traverse((o) => { if (o.isBone) this.bones.set(o.name.toLowerCase(), o); });
    this.meshes = [];
    this.parts = new Map();
    this.owned = [];
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.name === 'Human') {
        this.body = o;
        o.geometry = shareGeometry(o.geometry);
        this.baseIndex = o.geometry.index.array.slice();
        o.material = skinMaterial(o.material);
      } else if (/low-poly/.test(o.name)) {
        o.material = eyeMaterial(o.material);
      } else {
        o.material = o.material.clone();
        if (/brow|lash/.test(o.name)) { o.material.transparent = true; o.material.depthWrite = false; o.material.alphaTest = 0.05; }
      }
      this.owned.push(o.material);
      this.meshes.push(o);
    });
    this.armature = this.body.parent;
    this.mixer = new THREE.AnimationMixer(this.root);
    this.current = null;
    this.group.scale.setScalar(this.config.height);
    this.ready = this.apply(this.config, true);
  }

  bone(name) { return this.bones.get(name.toLowerCase()); }

  setMorph(name, value) {
    for (const m of this.meshes) {
      const i = m.morphTargetDictionary?.[name];
      if (i !== undefined) m.morphTargetInfluences[i] = value;
    }
  }

  // Aplica uma configuração nova sem recriar o avatar: o editor chama a cada mudança.
  async apply(raw, first = false) {
    const prev = first ? null : this.config;
    const cfg = normalizeAvatar(raw);
    this.config = cfg;
    const meta = this.lib.meta;
    const names = new Set([...Object.keys(prev?.morph || {}), ...Object.keys(cfg.morph)]);
    names.forEach((n) => this.setMorph(n, cfg.morph[n] || 0));
    this.group.scale.setScalar(cfg.height);
    if (first || prev.skin !== cfg.skin) {
      const tex = await skinTexture(meta, cfg.skin);
      this.body.material.map = tex;
      this.body.material.needsUpdate = true;
    }
    const brows = this.meshes.find((m) => /brow/.test(m.name));
    if (brows && cfg.colors.hair) brows.material.color.set(cfg.colors.hair).multiplyScalar(0.8);
    for (const [cat] of CATEGORIES) {
      const want = cfg.parts[cat] || null;
      const has = this.parts.get(cat);
      if (has && has.name !== want) {
        has.meshes.forEach((m) => { m.removeFromParent(); m.geometry && this.disposeLater(m); });
        this.parts.delete(cat);
      }
      if (want && (!this.parts.has(cat) || this.parts.get(cat).name !== want) && meta.catalog[cat]?.some((x) => x.name === want)) {
        await this.attachPart(cat, want);
      }
      const part = this.parts.get(cat);
      if (part) {
        for (const m of part.meshes) {
          if (cat === 'hair' || cat === 'beard') m.material.color.set(cfg.colors.hair || '#3a2416');
          else if (cfg.colors[cat]) m.material.color.set(cfg.colors[cat]);
        }
      }
    }
    this.updateMask();
    if (first || JSON.stringify(prev.racket) !== JSON.stringify(cfg.racket)) this.attachRacket();
    if (first || prev.medal !== cfg.medal) this.attachMedal();
    if (first) this.play(cfg.pose || 'Idle', { fade: 0 });
    this.mixer.update(0);
    return this;
  }

  async attachPart(cat, name) {
    const gltf = await loadPartFile(this.lib.gender, name);
    if (this.config.parts[cat] !== name) return;
    const meshes = [];
    gltf.scene.traverse((src) => {
      if (!src.isSkinnedMesh) return;
      const m = new THREE.SkinnedMesh(src.geometry, partMaterial(src.material, cat, this));
      m.name = src.name;
      m.frustumCulled = false;
      m.castShadow = cat !== 'glasses';
      m.receiveShadow = cat !== 'hair' && cat !== 'beard';
      const skel = new THREE.Skeleton(src.skeleton.bones.map((b) => this.bone(b.name)), src.skeleton.boneInverses);
      this.armature.add(m);
      m.bind(skel, src.bindMatrix);
      for (const [k, v] of Object.entries(this.config.morph)) {
        const i = m.morphTargetDictionary?.[k];
        if (i !== undefined) m.morphTargetInfluences[i] = v;
      }
      this.owned.push(m.material);
      meshes.push(m);
    });
    this.meshes.push(...meshes);
    this.parts.set(cat, { name, meshes });
  }

  disposeLater(m) {
    this.meshes = this.meshes.filter((x) => x !== m);
    m.material?.dispose?.();
  }

  updateMask() {
    const meta = this.lib.meta;
    let a = 0, b = 0;
    for (const cat of ['full', 'top', 'bottom', 'shoes']) {
      const e = meta.catalog[cat]?.find((x) => x.name === this.config.parts[cat]);
      if (!e || !this.parts.has(cat)) continue;
      if (e.bitA !== undefined) a |= 2 ** e.bitA;
      if (e.bitB !== undefined) b |= 2 ** e.bitB;
    }
    const ma = this.body.geometry.attributes._maska, mb = this.body.geometry.attributes._maskb;
    const src = this.baseIndex;
    const hidden = (i) => (a && ma && (ma.getX(i) & a)) || (b && mb && (mb.getX(i) & b));
    const out = new src.constructor(src.length);
    let n = 0;
    for (let t = 0; t < src.length; t += 3) {
      if (!(hidden(src[t]) || hidden(src[t + 1]) || hidden(src[t + 2]))) { out[n++] = src[t]; out[n++] = src[t + 1]; out[n++] = src[t + 2]; }
    }
    this.body.geometry.setIndex(new THREE.BufferAttribute(out.slice(0, n), 1));
  }

  // Objetos rígidos (raquete, medalha) entram na pose de repouso e depois seguem o osso.
  atRest(fn) {
    const saved = [...this.bones.values()].map((b) => [b, b.quaternion.clone(), b.position.clone()]);
    this.mixer.stopAllAction();
    this.lib.template.updateMatrixWorld(true);
    for (const [b] of saved) {
      const src = this.lib.template.getObjectByName(b.name);
      if (src) { b.quaternion.copy(src.quaternion); b.position.copy(src.position); }
    }
    const gs = this.group.scale.clone(), gp = this.group.position.clone(), gq = this.group.quaternion.clone();
    this.group.scale.setScalar(1); this.group.position.set(0, 0, 0); this.group.quaternion.identity();
    this.group.updateMatrixWorld(true);
    fn();
    this.group.scale.copy(gs); this.group.position.copy(gp); this.group.quaternion.copy(gq);
    this.group.updateMatrixWorld(true);
    if (this.current) { this.current.reset().play(); }
  }

  attachRacket() {
    this.racket?.removeFromParent();
    this.racket = null;
    if (!this.config.racket || this.config.racket.style === 'none') return;
    const hand = this.bone('hand_r'), middle = this.bone('middle_01_r');
    if (!hand || !middle) return;
    this.atRest(() => {
      const racket = makeRacket(this.config.racket);
      const p = hand.getWorldPosition(new THREE.Vector3());
      const tip = middle.getWorldPosition(new THREE.Vector3());
      const along = tip.clone().sub(p).normalize();
      racket.position.copy(p.clone().lerp(tip, 0.75)).add(new THREE.Vector3(0, -0.025, 0));
      racket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), along);
      racket.rotateZ(Math.PI / 2);
      this.group.add(racket);
      hand.attach(racket);
      this.racket = racket;
    });
  }

  attachMedal() {
    this.medalObj?.removeFromParent();
    this.medalObj = null;
    if (!this.config.medal) return;
    const neck = this.bone('neck_01'), chest = this.bone('spine_03');
    if (!neck || !chest) return;
    this.atRest(() => {
      const color = this.config.medal === 'gold' ? '#c9a96e' : '#c8ced8';
      const g = new THREE.Group();
      const n = neck.getWorldPosition(new THREE.Vector3());
      const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.006, 24), new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness: 0.3 }));
      disk.rotation.x = Math.PI / 2;
      disk.position.set(n.x, n.y - 0.2, n.z + 0.13);
      const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.006, 6, 24, Math.PI), new THREE.MeshStandardMaterial({ color: '#0040c8', roughness: 0.8 }));
      ribbon.position.set(n.x, n.y - 0.11, n.z + 0.07);
      ribbon.rotation.set(1.2, 0, Math.PI);
      g.add(disk, ribbon);
      this.group.add(g);
      chest.attach(g);
      this.medalObj = g;
    });
  }

  // Animações próprias do esqueleto novo (motion.js). Nomes antigos continuam válidos.
  play(name, { loop = true, fade = 0.25, then = null, speed = 1 } = {}) {
    const clips = this.lib.clips;
    const alias = { PickUp: 'Idle', Walk: 'Idle', Run: 'Idle', Roll: 'Jump', SitDown: 'Defeat', Punch: 'SwordSlash' };
    const clip = clips[name] || clips[alias[name]] || clips.Idle;
    const next = this.mixer.clipAction(clip);
    if (this.current === next && next.isRunning() && loop) return next;
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !loop;
    next.timeScale = speed;
    next.enabled = true;
    if (this.current && this.current !== next && fade) this.current.crossFadeTo(next, fade, false);
    else if (this.current && this.current !== next) this.current.stop();
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
    this.owned.forEach((m) => m.dispose?.());
    this.body.geometry.index = null;
    this.group.removeFromParent();
  }
}

export async function createAvatar(config) {
  const cfg = normalizeAvatar(config);
  const lib = await loadGender(cfg.gender);
  const a = new Avatar(lib, cfg);
  await a.ready;
  return a;
}

// ---------------------------------------------------------------- retratos
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
let queue = Promise.resolve();
let shot = null;
const keyOf = (cfg, kind, size) => [kind, size, JSON.stringify({ ...cfg, thumb: null, pose: null })].join('|');

export const portraitReady = (raw, { kind = 'bust', size = 256 } = {}) => {
  const cfg = normalizeAvatar(raw);
  if (cfg.thumb && kind === 'bust') return cfg.thumb;
  return readyPortraits.get(keyOf(cfg, kind, size)) || null;
};

function portraitRig() {
  if (shot) return shot;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  const key = new THREE.DirectionalLight(0xfff0e2, 2.6);
  key.position.set(1.4, 2.6, 3.4);
  const fill = new THREE.DirectionalLight(0xdfe7ff, 0.8);
  fill.position.set(-2.5, 1.4, 2.4);
  const rim = new THREE.DirectionalLight(0x9ebcff, 1.8);
  rim.position.set(-1.6, 2.4, -3);
  scene.add(key, fill, rim, new THREE.HemisphereLight(0xf0f4ff, 0x4a4238, 0.6));
  shot = { renderer, scene, camera: new THREE.PerspectiveCamera(22, 1, 0.05, 50) };
  return shot;
}

// Bust: rosto e ombros para cards. Full: corpo inteiro. Usa a foto salva quando existe.
export function portrait(raw, { kind = 'bust', size = 256, fresh = false } = {}) {
  const cfg = normalizeAvatar(raw);
  if (!fresh && cfg.thumb && kind === 'bust') return Promise.resolve(cfg.thumb);
  const key = keyOf(cfg, kind, size);
  if (!fresh && portraits.has(key)) return portraits.get(key);
  const task = queue.then(async () => {
    if (!webglAvailable()) return null;
    const { renderer, scene, camera } = portraitRig();
    renderer.setSize(size, size, false);
    const avatar = await createAvatar({ ...cfg, pose: 'Idle', racket: { style: 'none' } });
    avatar.group.rotation.y = kind === 'bust' ? -0.18 : -0.3;
    scene.add(avatar.group);
    avatar.update(0.4);
    avatar.group.updateMatrixWorld(true);
    const head = avatar.bone('head').getWorldPosition(new THREE.Vector3());
    if (kind === 'bust') {
      camera.position.set(0, head.y + 0.02, 1.25);
      camera.lookAt(0, head.y - 0.06, 0);
    } else {
      camera.position.set(0, 1.0, 5.2);
      camera.lookAt(0, 0.9, 0);
    }
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/webp', 0.86);
    avatar.dispose();
    readyPortraits.set(key, url);
    return url;
  });
  if (!fresh) portraits.set(key, task);
  queue = task.catch(() => null);
  return task;
}

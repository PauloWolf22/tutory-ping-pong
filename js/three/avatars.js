// Avatares realistas (MPFB/MakeHuman, gerados por tools/poc_mpfb/build_human.py).
// Um corpo base por gênero e uma peça por arquivo, todos no mesmo esqueleto. Cada avatar clona o esqueleto
// e reaproveita a geometria; só materiais, máscara do corpo e morphs são dele.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';
import * as SkeletonUtils from '../vendor/three/SkeletonUtils.js';
import { skinMaterial, eyeMaterial, hairMaterial } from './realism.js';
import { buildClips } from './motion.js';
import { buildAccessories, normalizeAcc } from './accessories.js';

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
  'Proporções': [['Ombros', 'shoulders_narrow', 'shoulders_wide'], ['Tórax', 'chest_small', 'chest_big'], ['Cintura', 'waist_narrow', 'waist_wide'], ['Quadril', 'hips_narrow', 'hips_wide'], ['Barriga', 'belly_flat', 'belly_big'], ['Tronco', 'torso_short', 'torso_long', 0.6]],
  'Braços e pernas': [['Espessura dos braços', 'arms_thin', 'arms_thick'], ['Comprimento dos braços', 'arms_short', 'arms_long', 0.6], ['Espessura das pernas', 'legs_thin', 'legs_thick'], ['Comprimento das pernas', 'legs_short', 'legs_long', 0.5]],
  'Testa': [['Altura da testa', 'forehead_low', 'forehead_high']],
  'Traços de origem': [['Africana', null, 'race_african'], ['Asiática', null, 'race_asian'], ['Europeia', null, 'race_caucasian']],
  'Expressão': [['Sorriso', null, 'smile'], ['Sobrancelha erguida', null, 'brows_raised'], ['Sobrancelha franzida', null, 'brows_angry']],
};
// Tipos de corpo: ponto de partida, ajustável depois nos controles.
export const BODY_TYPES = {
  padrao: { label: 'Padrão', morph: {} },
  magro: { label: 'Magro', morph: { body_thin: 0.75, body_soft: 0.2, shoulders_narrow: 0.25, arms_thin: 0.35, legs_thin: 0.3 } },
  atletico: { label: 'Atlético', morph: { body_muscle: 0.6, body_thin: 0.2, shoulders_wide: 0.35, waist_narrow: 0.3, belly_flat: 0.4 } },
  musculoso: { label: 'Musculoso', morph: { body_muscle: 1, body_heavy: 0.25, shoulders_wide: 0.6, chest_big: 0.4, arms_thick: 0.6, legs_thick: 0.4 } },
  maior: { label: 'Maior', morph: { body_heavy: 0.9, belly_big: 0.5, waist_wide: 0.5, hips_wide: 0.3, arms_thick: 0.4, legs_thick: 0.35 } },
};
export const BODY_TYPE_KEYS = new Set(['body_thin', 'body_heavy', 'body_muscle', 'body_soft', 'shoulders_narrow', 'shoulders_wide', 'chest_small', 'chest_big', 'waist_narrow', 'waist_wide', 'hips_narrow', 'hips_wide', 'belly_flat', 'belly_big', 'arms_thin', 'arms_thick', 'legs_thin', 'legs_thick']);

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

// Roupa básica de cada gênero: entra sempre que faltar alguma parte (o avatar nunca fica sem roupa).
export const BASIC_OUTFIT = {
  male: { full: 'male_casualsuit04', top: 'elvs_crude_t-shirt_male', bottom: 'cortu_cargo_pants', shoes: 'shoes01' },
  female: { full: 'female_sportsuit01', top: 'joepal_crude_t-shirt_female', bottom: 'cortu_cargo_pants', shoes: 'shoes03' },
};
// Vestimenta obrigatória: conjunto inteiro, ou parte de cima E parte de baixo.
export function dressed(parts, gender) {
  const p = { ...parts };
  const basic = BASIC_OUTFIT[gender] || BASIC_OUTFIT.male;
  if (!p.shoes) p.shoes = basic.shoes;
  if (p.full) { delete p.top; delete p.bottom; return p; }
  if (p.top && !p.bottom) p.bottom = basic.bottom;
  else if (p.bottom && !p.top) p.top = basic.top;
  else if (!p.top && !p.bottom) p.full = basic.full;
  return p;
}
// Morphs só dentro do intervalo do modelo (0 a 1): além disso o MakeHuman extrapola e o corpo deforma.
const clampMorphs = (m) => Object.fromEntries(Object.entries(m || {}).filter(([, v]) => Number.isFinite(+v) && +v > 0).map(([k, v]) => [k, Math.min(1, +v)]));

export function normalizeAvatar(a = {}) {
  if (!a || a.v !== 2) a = { gender: 'male' };
  const gender = a.gender === 'female' ? 'female' : 'male';
  // boné e óculos escuros ocupam o lugar do chapéu e dos óculos do catálogo
  const parts = { ...(a.parts || {}) };
  if (a.acc?.cap) delete parts.hat;
  if (a.acc?.sunglasses) delete parts.glasses;
  return {
    v: 2, gender, skin: SKINS[a.skin] ? a.skin : 'clara',
    morph: clampMorphs(a.morph), parts: dressed(parts, gender), colors: { ...(a.colors || {}) },
    height: a.height || 1, racket: { style: 'classic', color: '#c0262d', ...(a.racket || {}) }, pose: a.pose || 'Idle',
    medal: a.medal || null, thumb: a.thumb || null, provisional: !!a.provisional,
    logo: normalizeLogo(a.logo), belt: BELT_COLORS[a.belt] ? a.belt : "Branca", acc: normalizeAcc(a.acc),
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
        preloadLogo(),
      ]);
      const template = gltf.scene;
      const clips = buildClips(template);
      const lib = { gender, meta, template, clips };
      markBaseLayer(lib);
      lib.rig = restRig(template);
      return lib;
    })());
  }
  return genders.get(gender);
}

// Camada básica (bermuda e, por cima, a área que toda peça de cima cobre): é a pele que TODA roupa esconde.
// Pintada como tecido, ela só aparece se nenhuma roupa estiver no lugar: carregando, falha de rede ou peça inválida.
function markBaseLayer(lib) {
  let body = null;
  lib.template.traverse((o) => { if (o.isMesh && o.name === 'Human') body = o; });
  const ma = body?.geometry.attributes._maska;
  if (!ma) return;
  const bits = (cats) => cats.flatMap((c) => lib.meta.catalog[c] || []).filter((e) => e.bitA !== undefined).map((e) => 2 ** e.bitA);
  const all = (list) => list.reduce((a, b) => a + b, 0);
  const upper = all(bits(['top', 'full'])), lower = all(bits(['bottom', 'full']));
  const layer = new Float32Array(ma.count);
  for (let i = 0; i < ma.count; i++) {
    const m = ma.getX(i);
    // cada bit é uma peça; o vértice entra se TODAS as peças do grupo o cobrem
    const covers = (mask) => mask > 0 && (m & mask) === mask;
    layer[i] = covers(lower) || covers(upper) ? 1 : 0;
  }
  body.geometry.setAttribute('baseLayer', new THREE.BufferAttribute(layer, 1));
}

// Pose de repouso do esqueleto, em coordenadas da cena do modelo: base para reposicionar articulações por morph.
function restRig(template) {
  template.updateMatrixWorld(true);
  const bones = [];
  template.traverse((o) => { if (o.isBone) bones.push(o); });
  const world = new Map(bones.map((b) => [b.name, b.matrixWorld.clone()]));
  const parentWorld = new Map(bones.map((b) => [b.name, b.parent.matrixWorld.clone()]));
  return { names: bones.map((b) => b.name), parent: new Map(bones.map((b) => [b.name, b.parent.isBone ? b.parent.name : null])), world, parentWorld };
}

// Bones movidos por trilhas de posição nas animações: o deslocamento deles vai para a raiz (chão), não para o osso.
const POSITION_DRIVEN = new Set(['pelvis', 'root']);
const METAL_KEYS = new Set(['gold', 'silver', 'black']);

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

// ---------------------------------------------------------------- peças TUTORY (kimono, camisa, bermuda)
// Malhas próprias (tools/build_custom_clothes.py) com UV em regiões: tronco 0-0.6, manga direita 0.6-0.7,
// manga esquerda 0.7-0.8, lapela 0.8-0.85, faixa 0.85-1. A logo oficial é aplicada pelo shader na região certa,
// sem distorcer (proporção do arquivo original), com tamanho e altura ajustáveis.
export const BELT_COLORS = { Branca: '#eeeeea', Cinza: '#8a8f96', Amarela: '#e3be2a', Laranja: '#e5822c', Verde: '#2f9e54', Azul: '#1f4fd1', Roxa: '#6b2fa3', Marrom: '#6b3e1f', Preta: '#141414' };
export const LOGO_SPOTS = { chest: 'Peito', back: 'Costas', sleeve: 'Manga' };
export function normalizeLogo(l = {}) {
  const spot = (k, on) => {
    const s = l?.[k] || {};
    return { on: s.on ?? on, size: Math.min(1.6, Math.max(0.5, +s.size || 1)), y: Math.min(1, Math.max(-1, +s.y || 0)) };
  };
  return { chest: spot('chest', true), back: spot('back', true), sleeve: spot('sleeve', false), tone: ['auto', 'white', 'blue'].includes(l?.tone) ? l.tone : 'auto' };
}
const LOGO_RATIO = 1920 / 452; // logo-branco.png
let logoTexture = null;
// carregada junto com o corpo: fotos e miniaturas tiradas logo em seguida já saem com a logo
let logoLoading = null;
function preloadLogo() {
  logoLoading ||= texLoader.loadAsync(new URL("../../assets/brand/logo-branco.png", import.meta.url).href).then((t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    logoTexture = t;
    return t;
  }).catch(() => null);
  return logoLoading;
}
function logoMap() {
  if (!logoTexture) {
    logoTexture = texLoader.load(new URL('../../assets/brand/logo-branco.png', import.meta.url).href);
    logoTexture.colorSpace = THREE.SRGBColorSpace;
    logoTexture.anisotropy = 8;
  }
  return logoTexture;
}
// Largura padrão da logo (metros) e onde fica, em UV. u por metro: tronco 0.63, manga 0.33; v por metro: tronco 0.526, manga 0.91.
const SPOTS = {
  chest: { u: 0.15, v: 0.69, width: 0.17, uPerM: 0.63, vPerM: 0.526, flip: false },
  back: { u: 0.45, v: 0.70, width: 0.26, uPerM: 0.63, vPerM: 0.526, flip: false },
  sleeve: { u: 0.65, v: 0.86, width: 0.085, uPerM: 0.33, vPerM: 0.91, flip: false },
};
// No kimono o peito tem o decote em V: a logo do peito vai para o lado esquerdo, como um patch.
const GI_CHEST = { u: 0.197, v: 0.655, width: 0.1, uPerM: 0.63, vPerM: 0.526, flip: false };
function logoUniforms(cfg, color, name = "") {
  const out = { centers: [], halves: [], on: [], flips: [] };
  for (const k of ["chest", "back", "sleeve"]) {
    const s = k === "chest" && /gi/.test(name) ? GI_CHEST : SPOTS[k], l = cfg.logo[k];
    const w = s.width * l.size;
    out.centers.push(new THREE.Vector2(s.u, s.v + l.y * 0.05));
    out.halves.push(new THREE.Vector2((w * s.uPerM) / 2, ((w / LOGO_RATIO) * s.vPerM) / 2));
    out.on.push(l.on ? 1 : 0);
    out.flips.push(s.flip ? 1 : 0);
  }
  const c = new THREE.Color(color);
  const light = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b > 0.55;
  const tone = cfg.logo.tone === 'auto' ? (light ? 'blue' : 'white') : cfg.logo.tone;
  out.tint = new THREE.Color(tone === 'blue' ? '#1f5ae0' : '#ffffff');
  return out;
}

function uniformMaterial(name, cat, avatar) {
  const cfg = avatar.config;
  const color = cfg.colors[cat] || '#f2f2f2';
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0, side: THREE.DoubleSide });
  m.defines = { USE_UV: '' };
  const lu = logoUniforms(cfg, color, name);
  const u = {
    logoMap: { value: logoMap() }, logoC: { value: lu.centers }, logoH: { value: lu.halves }, logoOn: { value: lu.on }, logoFlip: { value: lu.flips },
    logoTint: { value: lu.tint }, beltColor: { value: new THREE.Color(BELT_COLORS[cfg.belt] || BELT_COLORS.Branca) }, weave: { value: /gi/.test(name) ? 1 : 0.4 },
  };
  m.userData.uniform = u;
  m.userData.piece = name;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D logoMap; uniform vec2 logoC[3]; uniform vec2 logoH[3]; uniform float logoOn[3]; uniform float logoFlip[3];
        uniform vec3 logoTint; uniform vec3 beltColor; uniform float weave;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        // o glTF inverte o V do Blender: aqui v volta a crescer para cima (altura)
        vec2 tuv = vec2(vUv.x, 1.0 - vUv.y);
        vec3 tc = diffuseColor.rgb;
        if (tuv.x > 0.85) tc = beltColor;
        else if (tuv.x > 0.8) tc *= 0.86;
        // trama do tecido (kimono mais marcada)
        float tw = sin(tuv.x * 2600.0) * sin(tuv.y * 2200.0);
        tc *= 1.0 + tw * 0.035 * weave;
        for (int i = 0; i < 3; i++) {
          if (logoOn[i] < 0.5) continue;
          vec2 d = (tuv - logoC[i]) / (2.0 * logoH[i]) + 0.5;
          if (d.x < 0.0 || d.x > 1.0 || d.y < 0.0 || d.y > 1.0) continue;
          if (logoFlip[i] > 0.5) d.x = 1.0 - d.x;
          float a = texture2D(logoMap, vec2(d.x, d.y)).a;
          tc = mix(tc, logoTint, a);
        }
        diffuseColor.rgb = tc;`);
  };
  m.customProgramCacheKey = () => 'tutory-uniform';
  return m;
}

// Atualiza cor, faixa e logo de uma peça TUTORY já vestida, sem recriar.
function refreshUniform(mesh, cat, cfg) {
  const u = mesh.material.userData.uniform;
  if (!u) return;
  const color = cfg.colors[cat] || '#f2f2f2';
  mesh.material.color.set(color);
  const lu = logoUniforms(cfg, color, mesh.material.userData.piece);
  u.logoC.value = lu.centers; u.logoH.value = lu.halves; u.logoOn.value = lu.on; u.logoTint.value = lu.tint;
  u.beltColor.value.set(BELT_COLORS[cfg.belt] || BELT_COLORS.Branca);
}

function partMaterial(std, cat, avatar, name = "") {
  if (/^tutory_/.test(name)) return uniformMaterial(name, cat, avatar);
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
    // invisível até a roupa estar no lugar: o avatar nunca aparece sem roupa, nem durante o carregamento
    this.group.visible = false;
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
    if (first || JSON.stringify(prev.morph) !== JSON.stringify(cfg.morph)) this.applyJoints();
    const drop = (cat) => {
      const has = this.parts.get(cat);
      if (!has) return;
      has.meshes.forEach((m) => { m.removeFromParent(); m.geometry && this.disposeLater(m); });
      this.parts.delete(cat);
    };
    for (const [cat] of CATEGORIES) {
      const want = cfg.parts[cat] || null;
      const valid = want && meta.catalog[cat]?.some((x) => x.name === want);
      if (!valid) { drop(cat); continue; }
      if (this.parts.get(cat)?.name !== want) {
        // a peça nova carrega antes de a antiga sair: troca sem deixar o corpo descoberto
        const old = this.parts.get(cat);
        try {
          await this.attachPart(cat, want);
        } catch (e) {
          console.warn('peça não carregou', cat, want, e);
        }
        if (old && this.parts.get(cat) !== old) old.meshes.forEach((m) => { m.removeFromParent(); m.geometry && this.disposeLater(m); });
      }
      const part = this.parts.get(cat);
      if (part) {
        for (const m of part.meshes) {
          if (m.material.userData.uniform) refreshUniform(m, cat, cfg);
          else if (cat === 'hair' || cat === 'beard') m.material.color.set(cfg.colors.hair || '#3a2416');
          else if (cfg.colors[cat]) m.material.color.set(cfg.colors[cat]);
        }
      }
    }
    // conjunto inválido ou que falhou ao carregar: veste a roupa básica (a camada básica da pele cobre até lá)
    const has = (c) => this.parts.has(c);
    if (!has('full') && !(has('top') && has('bottom'))) {
      const basic = BASIC_OUTFIT[cfg.gender].full;
      if (this.parts.get('full')?.name !== basic) {
        this.config.parts = { ...cfg.parts, full: basic };
        try { await this.attachPart('full', basic); } catch (e) { console.warn('roupa básica não carregou', e); }
        if (has('full')) { drop('top'); drop('bottom'); }
      }
    }
    this.updateMask();
    this.group.visible = true;
    if (first || JSON.stringify(prev.acc) !== JSON.stringify(cfg.acc) || (this.accObjs?.length && JSON.stringify(prev.morph) !== JSON.stringify(cfg.morph))) this.attachAccessories();
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
      const m = new THREE.SkinnedMesh(src.geometry, partMaterial(src.material, cat, this, name));
      m.name = src.name;
      // a malha nova não herda os nomes dos morphs (o GLTFLoader os põe na malha original): sem isso a roupa
      // e o cabelo ignoravam peso, músculo e medidas, e o corpo atravessava o tecido
      if (src.morphTargetDictionary) {
        m.morphTargetDictionary = { ...src.morphTargetDictionary };
        m.morphTargetInfluences = new Array(src.morphTargetInfluences.length).fill(0);
      }
      m.frustumCulled = false;
      m.castShadow = cat !== 'glasses';
      m.receiveShadow = cat !== 'hair' && cat !== 'beard';
      const skel = new THREE.Skeleton(src.skeleton.bones.map((b) => this.bone(b.name)), src.skeleton.boneInverses.map((x) => x.clone()));
      this.armature.add(m);
      m.bind(skel, src.bindMatrix);
      this.rebind(m);
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

  // Articulações acompanham o corpo: soma os deslocamentos de cada morph (medidos no Blender ao reajustar o
  // esqueleto) e recalcula a pose de repouso e o "bind" de cada malha. Sem isso, ombro largo ou perna longa
  // dobram no lugar errado ao animar.
  applyJoints() {
    const J = this.lib.meta.joints, rig = this.lib.rig;
    if (!J || !rig) return;
    const morph = this.config.morph;
    const off = new Map();
    let ground = 0;
    for (const [name, v] of Object.entries(morph)) {
      if (!v) continue;
      ground += (this.lib.meta.ground?.[name] || 0) * v;
      for (const [b, d] of Object.entries(J[name] || {})) {
        const o = off.get(b) || [0, 0, 0];
        o[0] += d[0] * v; o[1] += d[1] * v; o[2] += d[2] * v;
        off.set(b, o);
      }
    }
    this.root.position.y = -ground;
    const world = new Map();
    const inv = new THREE.Matrix4(), local = new THREE.Matrix4();
    for (const name of rig.names) {
      const w = rig.world.get(name).clone();
      const o = POSITION_DRIVEN.has(name.toLowerCase()) ? null : off.get(name);
      if (o) { w.elements[12] += o[0]; w.elements[13] += o[1]; w.elements[14] += o[2]; }
      world.set(name, w);
      const p = rig.parent.get(name);
      local.copy(inv.copy(p ? world.get(p) : rig.parentWorld.get(name)).invert()).multiply(w);
      this.bone(name)?.position.setFromMatrixPosition(local);
    }
    this.jointWorld = world;
    for (const m of this.meshes) if (m.isSkinnedMesh) this.rebind(m);
  }

  // boneInverse novo = inverso da articulação nova × (articulação original × inverso original).
  rebind(m) {
    const rig = this.lib.rig, sk = m.skeleton;
    if (!rig || !this.jointWorld || !sk) return;
    // o SkeletonUtils.clone compartilha as matrizes com o modelo e com os outros avatares: cada um ganha as suas
    if (!m.userData.origInv) {
      m.userData.origInv = sk.boneInverses.map((x) => x.clone());
      sk.boneInverses = sk.boneInverses.map((x) => x.clone());
    }
    const tmp = new THREE.Matrix4();
    sk.bones.forEach((b, i) => {
      const rest = rig.world.get(b.name), now = this.jointWorld.get(b.name);
      if (!rest || !now) return;
      sk.boneInverses[i].copy(tmp.copy(now).invert().multiply(rest).multiply(m.userData.origInv[i]));
    });
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
    this.applyJoints();
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

  // Acessórios montados na pose de repouso, com os morphs aplicados, e presos ao osso (seguem a animação).
  attachAccessories() {
    (this.accObjs || []).forEach((o) => { o.removeFromParent(); o.traverse((x) => { x.geometry?.dispose(); x.material?.dispose?.(); }); });
    this.accObjs = [];
    if (!Object.values(this.config.acc).some((v) => v && !METAL_KEYS.has(v))) return;
    this.atRest(() => {
      for (const [o, boneName] of buildAccessories(this, this.config.acc, logoMap())) {
        const bone = this.bone(boneName);
        if (!bone) continue;
        this.group.add(o);
        o.updateMatrixWorld(true);
        bone.attach(o);
        this.accObjs.push(o);
      }
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
    const url = encodePortrait(renderer.domElement, fresh);
    avatar.dispose();
    readyPortraits.set(key, url);
    return url;
  });
  if (!fresh) portraits.set(key, task);
  queue = task.catch(() => null);
  return task;
}

// Foto compacta para salvar no banco. Safari antigo e alguns iPhones não geram WEBP e
// devolvem PNG, até 10 vezes maior: aí vai JPEG sobre o fundo dos cards, reduzindo até caber.
const THUMB_LIMIT = 12000;
export function encodePortrait(canvas, compact) {
  const webp = canvas.toDataURL('image/webp', 0.86);
  if (webp.startsWith('data:image/webp') && (!compact || webp.length <= THUMB_LIMIT)) return webp;
  let size = canvas.width;
  for (const q of [0.82, 0.7, 0.6, 0.5]) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = '#0b1530';
    g.fillRect(0, 0, size, size);
    g.drawImage(canvas, 0, 0, size, size);
    const url = c.toDataURL('image/jpeg', q);
    if (!compact || url.length <= THUMB_LIMIT) return url;
    size = Math.max(128, Math.round(size * 0.8));
  }
  return null;
}

// Acessórios do avatar: brincos, piercings, correntes, pulseiras, relógio, boné TUTORY e óculos escuros.
// Feitos no app (geometria leve) e presos ao osso certo. A posição vem do próprio corpo do avatar, já com os morphs:
// orelha, nariz, boca, olhos, pescoço, punho e topo da cabeça são achados na malha, então acompanham o rosto e o corpo.
import * as THREE from 'three';

export const ACCESSORIES = {
  earrings: { label: 'Brincos', items: { stud: 'Ponto de luz', hoop: 'Argola', hoop_big: 'Argola grande' } },
  piercing: { label: 'Piercing', items: { nose: 'Nariz (argola)', nose_stud: 'Nariz (ponto)', lip: 'Lábio', brow: 'Sobrancelha' } },
  necklace: { label: 'Colar e corrente', items: { chain: 'Corrente fina', chain_thick: 'Corrente grossa', pendant: 'Colar com pingente' } },
  bracelet: { label: 'Pulseira', items: { single: 'Pulseira', double: 'Pulseira dupla', band: 'Pulseira de tecido' } },
  watch: { label: 'Relógio', items: { sport: 'Esportivo', classic: 'Clássico' } },
  cap: { label: 'Boné', items: { tutory: 'Boné TUTORY', flat: 'Aba reta', back: 'Aba para trás' } },
  sunglasses: { label: 'Óculos escuros', items: { aviator: 'Aviador', sport: 'Esportivo', round: 'Redondo' } },
};
export const METALS = { gold: 'Dourado', silver: 'Prateado', black: 'Preto' };
const METAL_COLOR = { gold: '#d4af55', silver: '#cfd3d8', black: '#1b1c1f' };

export function normalizeAcc(a = {}) {
  const out = { metal: METALS[a?.metal] ? a.metal : 'silver' };
  for (const [k, def] of Object.entries(ACCESSORIES)) out[k] = def.items[a?.[k]] ? a[k] : null;
  return out;
}

const metal = (cfg) => new THREE.MeshStandardMaterial({ color: METAL_COLOR[cfg.metal], metalness: 1, roughness: cfg.metal === 'black' ? 0.45 : 0.22, envMapIntensity: 1.2 });

// ---------------------------------------------------------------- pontos de referência na malha
const bonesOf = (mesh) => mesh.skeleton.bones.map((b) => b.name.toLowerCase());

function landmarks(avatar) {
  const body = avatar.body;
  const g = body.geometry;
  const n = g.attributes.position.count;
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const names = bonesOf(body);
  const dom = (i) => {
    let best = 0, w = -1;
    for (let k = 0; k < 4; k++) { const x = sw.getComponent(i, k); if (x > w) { w = x; best = si.getComponent(i, k); } }
    return names[best];
  };
  const P = new Array(n);
  const v = new THREE.Vector3();
  body.updateMatrixWorld(true);
  for (let i = 0; i < n; i++) { body.getVertexPosition(i, v); P[i] = v.clone().applyMatrix4(body.matrixWorld); }
  const D = new Array(n);
  for (let i = 0; i < n; i++) D[i] = dom(i);
  const head = [], neck = [], torso = [];
  for (let i = 0; i < n; i++) {
    if (D[i] === 'head') head.push(i);
    else if (D[i] === 'neck_01') neck.push(i);
    else if (D[i] === 'spine_03' || D[i]?.startsWith('clavicle')) torso.push(i);
  }
  const L = {};
  // topo, largura e frente da cabeça
  let top = head[0];
  for (const i of head) if (P[i].y > P[top].y) top = i;
  L.top = P[top].clone();
  const cx = L.top.x;
  // nariz: ponto mais à frente perto do centro
  let nose = null;
  for (const i of head) if (Math.abs(P[i].x - cx) < 0.006 && P[i].y < L.top.y - 0.07 && (!nose || P[i].z > P[nose].z)) nose = i;
  L.nose = P[nose].clone();
  // lábio inferior: mais à frente entre 3 e 6 cm abaixo do nariz
  let lip = null;
  for (const i of head) if (Math.abs(P[i].x - cx) < 0.005 && P[i].y < L.nose.y - 0.035 && P[i].y > L.nose.y - 0.06 && (!lip || P[i].z > P[lip].z)) lip = i;
  L.lip = P[lip ?? nose].clone();
  // orelhas: pontos mais afastados do centro na altura do nariz; lóbulo = o mais baixo dessa região
  for (const s of [1, -1]) {
    let far = null;
    for (const i of head) if (Math.abs(P[i].y - L.nose.y) < 0.03 && (P[i].x - cx) * s > 0 && (!far || (P[i].x - cx) * s > (P[far].x - cx) * s)) far = i;
    let lobe = far;
    for (const i of head) {
      const p = P[i];
      if ((p.x - cx) * s > (P[far].x - cx) * s - 0.012 && Math.abs(p.z - P[far].z) < 0.025 && p.y < P[lobe].y) lobe = i;
    }
    L[s > 0 ? 'earL' : 'earR'] = P[lobe].clone();
  }
  // largura da cabeça na testa
  let half = 0, front = -1e9;
  for (const i of head) {
    const p = P[i];
    if (p.y > L.top.y - 0.085 && p.y < L.top.y - 0.04) { half = Math.max(half, Math.abs(p.x - cx)); front = Math.max(front, p.z); }
  }
  L.headHalf = half; L.headFront = front;
  // olhos: malha dos olhos
  const eyes = avatar.meshes.find((m) => /low-poly/.test(m.name));
  if (eyes) {
    const ep = eyes.geometry.attributes.position, sums = { 1: [new THREE.Vector3(), 0], [-1]: [new THREE.Vector3(), 0] };
    eyes.updateMatrixWorld(true);
    for (let i = 0; i < ep.count; i++) {
      eyes.getVertexPosition(i, v); v.applyMatrix4(eyes.matrixWorld);
      const s = v.x - cx > 0 ? 1 : -1;
      sums[s][0].add(v); sums[s][1]++;
    }
    L.eyeL = sums[1][0].divideScalar(sums[1][1] || 1);
    L.eyeR = sums[-1][0].divideScalar(sums[-1][1] || 1);
  } else {
    L.eyeL = L.nose.clone().add(new THREE.Vector3(0.032, 0.035, -0.02));
    L.eyeR = L.nose.clone().add(new THREE.Vector3(-0.032, 0.035, -0.02));
  }
  // pescoço: anel na base
  const nb = avatar.bone('neck_01').getWorldPosition(new THREE.Vector3());
  const ring = [...neck, ...torso].filter((i) => Math.abs(P[i].y - (nb.y - 0.01)) < 0.012);
  const c = ring.reduce((a, i) => a.add(P[i]), new THREE.Vector3()).divideScalar(ring.length || 1);
  let rx = 0.06, rz = 0.055;
  if (ring.length) { rx = Math.max(...ring.map((i) => Math.abs(P[i].x - c.x))); rz = Math.max(...ring.map((i) => Math.abs(P[i].z - c.z))); }
  L.neck = { c, rx, rz };
  // punhos: raio da malha perto da cabeça do osso da mão, em volta do eixo do antebraço
  for (const s of ['l', 'r']) {
    const hand = avatar.bone('hand_' + s).getWorldPosition(new THREE.Vector3());
    const elbow = avatar.bone('lowerarm_' + s).getWorldPosition(new THREE.Vector3());
    const axis = hand.clone().sub(elbow).normalize();
    const at = hand.clone().addScaledVector(axis, -0.035);
    let r = 0;
    for (let i = 0; i < n; i++) {
      if (!D[i]?.startsWith('lowerarm_' + s) && D[i] !== 'hand_' + s) continue;
      const d = P[i].clone().sub(at);
      if (Math.abs(d.dot(axis)) < 0.01) r = Math.max(r, d.clone().addScaledVector(axis, -d.dot(axis)).length());
    }
    L['wrist' + s.toUpperCase()] = { at, axis, r: r || 0.03 };
  }
  return L;
}

// ---------------------------------------------------------------- peças
function hoop(radius, tube, mat) { return new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 32), mat); }
function bead(r, mat) { return new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat); }

function chainCurve(neck, drop, segments = 64) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const front = Math.max(0, Math.cos(a)); // 1 na frente
    pts.push(new THREE.Vector3(neck.c.x + Math.sin(a) * (neck.rx + 0.012), neck.c.y - 0.012 - front * front * drop, neck.c.z + Math.cos(a) * (neck.rz + 0.014 + front * 0.02)));
  }
  return new THREE.CatmullRomCurve3(pts, true);
}

function lensShape(kind) {
  const s = new THREE.Shape();
  if (kind === 'round') { s.absarc(0, 0, 0.022, 0, Math.PI * 2, false); return s; }
  const w = kind === 'sport' ? 0.031 : 0.027, h = kind === 'sport' ? 0.017 : 0.022;
  s.moveTo(-w, h * 0.6); s.quadraticCurveTo(-w, h, -w * 0.4, h); s.lineTo(w * 0.6, h); s.quadraticCurveTo(w, h, w, h * 0.3);
  s.quadraticCurveTo(w * 0.9, -h, 0, -h); s.quadraticCurveTo(-w * 0.95, -h * 0.95, -w, h * 0.6);
  return s;
}

function logoDecal(texture, width) {
  const geo = new THREE.PlaneGeometry(width, width / (1920 / 452));
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, color: '#ffffff' });
  return new THREE.Mesh(geo, mat);
}

// Devolve [objeto, osso] para cada acessório pedido. Chamado com o avatar em pose de repouso.
export function buildAccessories(avatar, cfg, logoTexture) {
  const out = [];
  const want = Object.entries(ACCESSORIES).some(([k]) => cfg[k]);
  if (!want) return out;
  const L = landmarks(avatar);
  const m = metal(cfg);
  const fwd = new THREE.Vector3(0, 0, 1);

  if (cfg.earrings) {
    for (const k of ['earL', 'earR']) {
      const p = L[k].clone();
      let o;
      if (cfg.earrings === 'stud') { o = bead(0.0032, m); o.position.copy(p).add(new THREE.Vector3(0, 0.002, 0.003)); }
      else {
        const r = cfg.earrings === 'hoop_big' ? 0.016 : 0.009;
        o = hoop(r, 0.0011, m);
        o.position.copy(p).add(new THREE.Vector3(0, -r + 0.002, 0.002));
        o.rotation.y = Math.PI / 2;
      }
      out.push([o, 'head']);
    }
  }
  if (cfg.piercing) {
    let o;
    const side = new THREE.Vector3(0.008, 0, 0);
    if (cfg.piercing === 'nose') { o = hoop(0.0045, 0.0007, m); o.position.copy(L.nose).add(new THREE.Vector3(0.009, -0.012, -0.004)); o.rotation.y = Math.PI / 2.4; }
    else if (cfg.piercing === 'nose_stud') { o = bead(0.0018, m); o.position.copy(L.nose).add(new THREE.Vector3(0.011, -0.01, -0.006)); }
    else if (cfg.piercing === 'lip') { o = hoop(0.0045, 0.0008, m); o.position.copy(L.lip).add(side).add(new THREE.Vector3(0, -0.004, 0.001)); o.rotation.y = Math.PI / 2; }
    else { o = hoop(0.004, 0.0007, m); o.position.copy(L.eyeL).add(new THREE.Vector3(0.024, 0.02, 0.006)); o.rotation.z = Math.PI / 2; }
    out.push([o, 'head']);
  }
  if (cfg.necklace) {
    const thick = cfg.necklace === 'chain_thick' ? 0.0026 : 0.0013;
    const curve = chainCurve(L.neck, cfg.necklace === 'pendant' ? 0.085 : 0.05);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 160, thick, 6, true), m));
    if (cfg.necklace === 'pendant') {
      const low = curve.getPoints(160).reduce((a, p) => (p.y < a.y ? p : a));
      const pend = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.003, 24), m);
      pend.rotation.x = Math.PI / 2;
      pend.position.copy(low).add(new THREE.Vector3(0, -0.013, 0.004));
      g.add(pend);
    }
    out.push([g, 'spine_03']);
  }
  const wristRing = (s, offset, tube, mat) => {
    const w = L['wrist' + s];
    const o = hoop(w.r + tube + 0.002, tube, mat);
    o.position.copy(w.at).addScaledVector(w.axis, offset);
    o.quaternion.setFromUnitVectors(fwd, w.axis);
    return o;
  };
  if (cfg.bracelet) {
    const s = cfg.watch ? 'R' : 'L';
    const mat = cfg.bracelet === 'band' ? new THREE.MeshStandardMaterial({ color: '#1f4fd1', roughness: 0.9 }) : m;
    out.push([wristRing(s, 0, cfg.bracelet === 'band' ? 0.003 : 0.0018, mat), 'lowerarm_' + s.toLowerCase()]);
    if (cfg.bracelet === 'double') out.push([wristRing(s, -0.012, 0.0018, m), 'lowerarm_' + s.toLowerCase()]);
  }
  if (cfg.watch) {
    const w = L.wristL;
    const g = new THREE.Group();
    const band = hoop(w.r + 0.004, 0.0035, new THREE.MeshStandardMaterial({ color: cfg.watch === 'sport' ? '#15171c' : '#5a3a22', roughness: 0.8 }));
    band.scale.set(1, 1, 2.2);
    g.add(band);
    const caseMat = cfg.watch === 'sport' ? new THREE.MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.5 }) : m;
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.007, 32), caseMat);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.0012, 32), new THREE.MeshStandardMaterial({ color: cfg.watch === 'sport' ? '#0b2a6b' : '#f3efe6', roughness: 0.15, metalness: 0.1 }));
    glass.position.y = 0.004;
    const dial = new THREE.Group();
    dial.add(face, glass);
    dial.position.set(0, w.r + 0.006, 0);
    g.add(dial);
    // em cima do punho: "para cima" do relógio aponta para fora do braço esquerdo
    g.position.copy(w.at);
    g.quaternion.setFromUnitVectors(fwd, w.axis);
    out.push([g, 'lowerarm_l']);
  }
  if (cfg.cap) {
    const g = new THREE.Group();
    const r = L.headHalf + 0.012;
    const capMat = new THREE.MeshStandardMaterial({ color: cfg.cap === 'tutory' ? '#0b1530' : '#15171c', roughness: 0.85 });
    const crown = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    crown.scale.set(1, 0.78, 1.12);
    g.add(crown);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.004, 32, 1, false, -Math.PI / 2.6, Math.PI / 1.3), capMat);
    brim.scale.set(1, 1, 1.25);
    brim.position.set(0, 0.002, r * (cfg.cap === 'flat' ? 0.55 : 0.45));
    if (cfg.cap !== 'flat') brim.rotation.x = 0.12;
    g.add(brim);
    if (cfg.cap === 'tutory' && logoTexture) {
      const logo = logoDecal(logoTexture, r * 0.95);
      logo.position.set(0, r * 0.38, r * 1.08 + 0.001);
      logo.rotation.x = -0.32;
      g.add(logo);
    }
    g.position.set(L.top.x, L.top.y - r * 0.62, (L.top.z + L.headFront) / 2 - 0.006);
    if (cfg.cap === 'back') g.rotation.y = Math.PI;
    out.push([g, 'head']);
  }
  if (cfg.sunglasses) {
    const g = new THREE.Group();
    const lensMat = new THREE.MeshPhysicalMaterial({ color: '#0d0f14', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.88, clearcoat: 1 });
    const frame = metal({ metal: cfg.metal === 'gold' ? 'gold' : 'black' });
    const eyeL = L.eyeL, eyeR = L.eyeR;
    const mid = eyeL.clone().add(eyeR).multiplyScalar(0.5);
    for (const e of [eyeL, eyeR]) {
      const lens = new THREE.Mesh(new THREE.ShapeGeometry(lensShape(cfg.sunglasses), 16), lensMat);
      lens.position.set(e.x, e.y - 0.004, mid.z + 0.032);
      if (e === eyeR) lens.scale.x = -1;
      g.add(lens);
      const rim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lensShape(cfg.sunglasses).getPoints(24).map((p) => new THREE.Vector3(p.x * (e === eyeR ? -1 : 1) + e.x, p.y + e.y - 0.004, mid.z + 0.032)), true), 48, 0.0011, 5, true), frame);
      g.add(rim);
    }
    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, Math.abs(eyeL.x - eyeR.x) - 0.05, 6), frame);
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(mid.x, mid.y + 0.006, mid.z + 0.033);
    g.add(bridge);
    for (const s of [1, -1]) {
      const ear = s > 0 ? L.earL : L.earR;
      const startX = (s > 0 ? eyeL.x : eyeR.x) + s * 0.03;
      const temple = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(startX, mid.y, mid.z + 0.028), new THREE.Vector3(ear.x - s * 0.004, mid.y + 0.002, (mid.z + ear.z) / 2), new THREE.Vector3(ear.x - s * 0.006, ear.y + 0.02, ear.z - 0.008),
      ]), 16, 0.0012, 5, false), frame);
      g.add(temple);
    }
    out.push([g, 'head']);
  }
  return out;
}

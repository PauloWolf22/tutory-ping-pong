// Animações do avatar realista, geradas a partir de poses-chave no próprio esqueleto (padrão game engine).
// Cada pose diz para onde apontam braços e pernas no mundo; o código calcula a rotação de cada osso.
// O personagem olha para +Z; o lado esquerdo dele é +X.
import * as THREE from 'three';
import * as SkeletonUtils from '../vendor/three/SkeletonUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CHILD = { upperarm_l: 'lowerarm_l', lowerarm_l: 'hand_l', upperarm_r: 'lowerarm_r', lowerarm_r: 'hand_r', thigh_l: 'calf_l', calf_l: 'foot_l', thigh_r: 'calf_r', calf_r: 'foot_r' };
const ORDER = ['upperarm_l', 'lowerarm_l', 'upperarm_r', 'lowerarm_r', 'thigh_l', 'calf_l', 'thigh_r', 'calf_r'];
const ANIMATED = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r', 'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r'];

const mirror = (aims) => Object.fromEntries(Object.entries(aims).map(([k, v]) => [k.endsWith('_l') ? k.replace(/_l$/, '_r') : k.replace(/_r$/, '_l'), V(-v.x, v.y, v.z)]));
const ARMS_DOWN = { upperarm_l: V(0.2, -1, -0.02), lowerarm_l: V(0.1, -1, 0.22), upperarm_r: V(-0.2, -1, -0.02), lowerarm_r: V(-0.1, -1, 0.22) };
const LEGS_BENT = { thigh_l: V(0.12, -1, 0.24), calf_l: V(0.05, -1, -0.16), thigh_r: V(-0.12, -1, 0.24), calf_r: V(-0.05, -1, -0.16) };
const READY_ARMS = { upperarm_r: V(-0.3, -0.75, 0.5), lowerarm_r: V(-0.05, -0.1, 1), upperarm_l: V(0.3, -0.8, 0.35), lowerarm_l: V(0.05, -0.25, 1) };

const P = {
  idleA: { aims: ARMS_DOWN },
  idleB: { aims: { ...ARMS_DOWN, upperarm_l: V(0.22, -1, 0), upperarm_r: V(-0.22, -1, 0) }, lean: 0.02, chest: 0.025 },
  ready: { aims: { ...READY_ARMS, ...LEGS_BENT }, lean: 0.2, pelvis: -0.06 },
  readyB: { aims: { ...READY_ARMS, ...LEGS_BENT, upperarm_r: V(-0.32, -0.72, 0.52) }, lean: 0.22, pelvis: -0.075 },
  back: { aims: { ...READY_ARMS, ...LEGS_BENT, upperarm_r: V(-0.85, -0.35, -0.35), lowerarm_r: V(-0.6, 0.05, -0.7) }, lean: 0.2, twist: -0.45, pelvis: -0.07 },
  contact: { aims: { ...READY_ARMS, ...LEGS_BENT, upperarm_r: V(-0.5, -0.35, 0.8), lowerarm_r: V(-0.1, 0.15, 1) }, lean: 0.22, twist: 0.1, pelvis: -0.07 },
  follow: { aims: { ...READY_ARMS, ...LEGS_BENT, upperarm_r: V(0.3, 0.05, 0.95), lowerarm_r: V(0.85, 0.4, 0.3) }, lean: 0.2, twist: 0.45, pelvis: -0.06 },
  win1: { aims: { upperarm_l: V(0.45, 1, 0.05), lowerarm_l: V(0.3, 1, 0), ...mirror({ upperarm_l: V(0.45, 1, 0.05), lowerarm_l: V(0.3, 1, 0) }) }, head: -0.15, lean: -0.05 },
  win2: { aims: { upperarm_l: V(0.6, 1, 0.1), lowerarm_l: V(0.45, 1, 0.05), ...mirror({ upperarm_l: V(0.6, 1, 0.1), lowerarm_l: V(0.45, 1, 0.05) }) }, head: -0.2, lean: -0.08, pelvis: 0.09 },
  crouch: { aims: { thigh_l: V(0.1, -0.7, 0.7), calf_l: V(0.05, -1, -0.6), thigh_r: V(-0.1, -0.7, 0.7), calf_r: V(-0.05, -1, -0.6), upperarm_l: V(0.2, -0.9, -0.4), lowerarm_l: V(0.1, -1, -0.2), upperarm_r: V(-0.2, -0.9, -0.4), lowerarm_r: V(-0.1, -1, -0.2) }, lean: 0.32, pelvis: -0.16 },
  air: { aims: { upperarm_l: V(0.35, 1, 0.15), lowerarm_l: V(0.2, 1, 0.1), upperarm_r: V(-0.35, 1, 0.15), lowerarm_r: V(-0.2, 1, 0.1), thigh_l: V(0.08, -1, 0.15), calf_l: V(0.03, -1, -0.3), thigh_r: V(-0.08, -1, 0.15), calf_r: V(-0.03, -1, -0.3) }, lean: -0.05, pelvis: 0.26 },
  land: { aims: { ...ARMS_DOWN, ...LEGS_BENT }, lean: 0.15, pelvis: -0.08 },
  defeat: { aims: { upperarm_l: V(0.1, -1, 0.25), lowerarm_l: V(0.05, -1, 0.3), upperarm_r: V(-0.1, -1, 0.25), lowerarm_r: V(-0.05, -1, 0.3) }, head: 0.5, lean: 0.25, pelvis: -0.02 },
  hit: { aims: { ...LEGS_BENT, upperarm_l: V(0.4, -0.9, -0.1), lowerarm_l: V(0.3, -0.6, 0.6), upperarm_r: V(-0.4, -0.9, -0.1), lowerarm_r: V(-0.3, -0.6, 0.6) }, lean: -0.15, head: -0.1, pelvis: -0.05 },
};

const CLIPS = {
  Idle: { loop: true, keys: [[0, 'idleA'], [1.8, 'idleB'], [3.6, 'idleA']] },
  Ready: { loop: true, keys: [[0, 'ready'], [0.9, 'readyB'], [1.8, 'ready']] },
  SwordSlash: { keys: [[0, 'ready'], [0.22, 'back'], [0.36, 'contact'], [0.52, 'follow'], [0.95, 'ready']] },
  Victory: { loop: true, keys: [[0, 'win1'], [0.35, 'win2'], [0.7, 'win1']] },
  Jump: { keys: [[0, 'idleA'], [0.18, 'crouch'], [0.42, 'air'], [0.66, 'land'], [0.95, 'idleA']] },
  Defeat: { keys: [[0, 'idleA'], [0.6, 'defeat']] },
  RecieveHit: { keys: [[0, 'ready'], [0.15, 'hit'], [0.55, 'ready']] },
};

export function buildClips(template) {
  const rig = SkeletonUtils.clone(template);
  const bones = new Map();
  rig.traverse((o) => { if (o.isBone) bones.set(o.name.toLowerCase(), o); });
  const rest = new Map([...bones].map(([n, b]) => [n, { q: b.quaternion.clone(), p: b.position.clone() }]));
  const get = (n) => bones.get(n);

  const rotateWorld = (b, axis, angle) => {
    if (!b || !angle) return;
    rig.updateMatrixWorld(true);
    const pq = b.parent.getWorldQuaternion(new THREE.Quaternion());
    const delta = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    b.quaternion.premultiply(pq.clone().invert().multiply(delta).multiply(pq));
  };
  const aim = (name, dir) => {
    const b = get(name), c = get(CHILD[name]);
    if (!b || !c) return;
    rig.updateMatrixWorld(true);
    const from = c.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize();
    const delta = new THREE.Quaternion().setFromUnitVectors(from, dir.clone().normalize());
    const pq = b.parent.getWorldQuaternion(new THREE.Quaternion());
    b.quaternion.premultiply(pq.clone().invert().multiply(delta).multiply(pq));
  };

  const solve = (pose) => {
    for (const [n, r] of rest) { bones.get(n).quaternion.copy(r.q); bones.get(n).position.copy(r.p); }
    const X = V(1, 0, 0), Y = V(0, 1, 0);
    rotateWorld(get('spine_01'), X, pose.lean || 0);
    rotateWorld(get('spine_02'), Y, pose.twist || 0);
    rotateWorld(get('spine_03'), X, -(pose.chest || 0));
    rotateWorld(get('head'), X, pose.head || 0);
    for (const n of ORDER) if (pose.aims?.[n]) aim(n, pose.aims[n]);
    const out = new Map(ANIMATED.filter((n) => bones.has(n)).map((n) => [n, bones.get(n).quaternion.clone()]));
    let pelvisPos = null;
    const pelvis = get('pelvis');
    if (pelvis) {
      rig.updateMatrixWorld(true);
      const world = pelvis.getWorldPosition(new THREE.Vector3()).add(V(0, pose.pelvis || 0, 0));
      pelvisPos = pelvis.parent.worldToLocal(world);
    }
    return { q: out, pelvis: pelvisPos };
  };

  const cache = {};
  const solved = (name) => (cache[name] = cache[name] || solve(P[name]));
  const clips = {};
  for (const [clipName, def] of Object.entries(CLIPS)) {
    const times = def.keys.map((k) => k[0]);
    const frames = def.keys.map((k) => solved(k[1]));
    const tracks = [];
    for (const n of ANIMATED) {
      if (!bones.has(n)) continue;
      const values = frames.flatMap((f) => f.q.get(n).toArray());
      tracks.push(new THREE.QuaternionKeyframeTrack(`${bones.get(n).name}.quaternion`, times, values));
    }
    if (frames[0].pelvis) {
      tracks.push(new THREE.VectorKeyframeTrack(`${get('pelvis').name}.position`, times, frames.flatMap((f) => f.pelvis.toArray())));
    }
    clips[clipName] = new THREE.AnimationClip(clipName, times[times.length - 1], tracks);
  }
  return clips;
}

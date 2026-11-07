// Cenas 3D do campeonato. Cada tela monta um Stage e o descarta ao sair; a geometria dos avatares é compartilhada.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';
import { createAvatar, portrait, webglAvailable } from './avatars.js';

const COLORS = { abyss: 0x020308, deep: 0x0a1a3a, electric: 0x0040c8, beam: 0x3b7bf5, ice: 0xd0ddef, gold: 0xc9a96e };
const ease = { out: (t) => 1 - (1 - t) ** 3, inOut: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2), back: (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2 };

function radialTexture(stops, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Stage {
  constructor(host, { fov = 30, exposure = 1.1, env = false, shadows = true } = {}) {
    this.host = host;
    this.ok = webglAvailable();
    this.disposed = false;
    this.updaters = new Set();
    this.avatars = new Set();
    if (!this.ok) return;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = exposure;
    this.renderer.shadowMap.enabled = shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'stage-canvas';
    host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 200);
    if (env) {
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = 0.55;
      pm.dispose();
    }
    this.clock = new THREE.Clock();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
    this.lights();
  }

  lights() {
    this.scene.add(new THREE.HemisphereLight(0xcfdcff, 0x2c3854, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(2.5, 6, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 24 });
    key.shadow.bias = -0.0006;
    key.shadow.radius = 5;
    const rimL = new THREE.DirectionalLight(COLORS.beam, 3.6);
    rimL.position.set(-5, 3, -4);
    const rimR = new THREE.DirectionalLight(COLORS.electric, 3.2);
    rimR.position.set(5, 2.5, -3.5);
    this.scene.add(key, rimL, rimR);
    this.key = key;
  }

  floor(radius = 7, y = 0) {
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), new THREE.ShadowMaterial({ opacity: 0.55 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = y + 0.002;
    shadow.receiveShadow = true;
    const glow = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), new THREE.MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(59,123,245,.34)'], [0.42, 'rgba(0,64,200,.13)'], [1, 'rgba(2,3,8,0)']]), transparent: true, depthWrite: false,
    }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = y;
    this.scene.add(glow, shadow);
    return glow;
  }

  ring(x, z, radius = 0.72, color = COLORS.beam, y = 0.01) {
    const m = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.022, 72), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, toneMapped: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    this.scene.add(m);
    return m;
  }

  resize() {
    if (!this.ok || this.disposed) return;
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.onResize?.(w / h);
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.avatars.forEach((a) => a.update(dt));
    this.updaters.forEach((fn) => fn(dt));
    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
  }

  tween(duration, fn, curve = ease.out) {
    return new Promise((resolve) => {
      if (document.hidden || !this.ok) { fn(1); resolve(); return; }
      let t = 0;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.updaters.delete(step);
        fn(1);
        resolve();
      };
      const step = (dt) => {
        t += dt;
        const k = Math.min(t / duration, 1);
        if (k >= 1) { finish(); return; }
        fn(curve(k));
      };
      this.updaters.add(step);
      // aba em segundo plano pausa o requestAnimationFrame: o relógio garante que a sequência não trava
      setTimeout(finish, duration * 1000 + 400);
    });
  }

  async createAvatar(config, { x = 0, z = 0, ry = 0, anim = 'Idle', y = 0 } = {}) {
    if (!this.ok) return null;
    const a = await createAvatar({ ...config, pose: anim });
    if (this.disposed) { a.dispose(); return null; }
    a.group.position.set(x, y, z);
    a.group.rotation.y = ry;
    this.scene.add(a.group);
    this.avatars.add(a);
    return a;
  }
  removeAvatar(a) {
    if (!a) return;
    this.avatars.delete(a);
    a.dispose();
  }

  dispose() {
    this.disposed = true;
    if (!this.ok) return;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls?.dispose();
    this.avatars.forEach((a) => a.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
  }
}

// ---------------------------------------------------------------- editor
export class EditorStage extends Stage {
  constructor(host) {
    super(host, { fov: 28 });
    if (!this.ok) return;
    this.floor(5);
    this.ring(0, 0, 0.72);
    this.camera.position.set(0.8, 1.45, 5.6);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.95, 0);
    Object.assign(this.controls, { enablePan: false, enableDamping: true, dampingFactor: 0.08, minDistance: 1.5, maxDistance: 9, maxPolarAngle: Math.PI * 0.56 });
    this.token = 0;
  }

  async setAvatar(config, pose) {
    if (!this.ok) return;
    const token = ++this.token;
    const cfg = { ...config, pose: pose || config.pose || 'Idle' };
    // mesma base: troca no lugar, sem recarregar o corpo
    if (this.avatar && this.avatar.config.gender === cfg.gender) {
      await this.avatar.apply(cfg);
      return;
    }
    const next = await createAvatar(cfg);
    if (this.disposed || token !== this.token) { next.dispose(); return; }
    this.removeAvatar(this.avatar);
    this.scene.add(next.group);
    this.avatars.add(next);
    this.avatar = next;
  }

  focus(kind) {
    if (!this.ok) return;
    const views = { face: [[0.28, 1.66, 1.15], [0, 1.6, 0]], bust: [[0.5, 1.5, 2.4], [0, 1.32, 0]], body: [[0.8, 1.3, 5.6], [0, 0.95, 0]] };
    const [p, t] = views[kind] || views.bust;
    const fromP = this.camera.position.clone(), fromT = this.controls.target.clone();
    this.tween(0.6, (k) => {
      this.camera.position.lerpVectors(fromP, new THREE.Vector3(...p), k);
      this.controls.target.lerpVectors(fromT, new THREE.Vector3(...t), k);
    });
  }

  setPose(name) {
    const once = ['SwordSlash', 'Punch', 'Jump', 'PickUp', 'Roll', 'Victory', 'Defeat', 'SitDown'];
    if (!this.avatar) return;
    if (name === 'Defeat' || name === 'SitDown') this.avatar.play(name, { loop: false });
    else if (once.includes(name)) this.avatar.play(name, { loop: false, then: name === 'Victory' ? 'Victory' : this.avatar.config.pose === name ? 'Idle' : this.avatar.config.pose || 'Idle' });
    else this.avatar.play(name);
  }
}

// ---------------------------------------------------------------- mesa de ping pong
export function makeTable() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.74, 0.04, 1.525), new THREE.MeshStandardMaterial({ color: 0x0a2c78, roughness: 0.42 }));
  top.position.y = 0.74;
  top.castShadow = top.receiveShadow = true;
  g.add(top);
  const line = new THREE.MeshBasicMaterial({ color: 0xe9eefb, toneMapped: false });
  const addLine = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.002, d), line);
    m.position.set(x, 0.761, z);
    g.add(m);
  };
  addLine(2.74, 0.02, 0, 0.752);
  addLine(2.74, 0.02, 0, -0.752);
  addLine(0.02, 1.525, 1.36, 0);
  addLine(0.02, 1.525, -1.36, 0);
  addLine(2.74, 0.006, 0, 0);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.5, metalness: 0.5 });
  for (const x of [-1.15, 1.15]) for (const z of [-0.62, 0.62]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 0.06), legMat);
    leg.position.set(x, 0.36, z);
    leg.castShadow = true;
    g.add(leg);
  }
  const net = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.15, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, roughness: 1 }));
  net.rotation.y = Math.PI / 2;
  net.position.set(0, 0.835, 0);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.016, 1.6), line);
  tape.position.set(0, 0.912, 0);
  g.add(net, tape);
  for (const z of [-0.8, 0.8]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.17), legMat);
    post.position.set(0, 0.835, z);
    g.add(post);
  }
  return g;
}

export class TableStage extends Stage {
  constructor(host, { wide = true, rally = true } = {}) {
    super(host, { fov: 26 });
    if (!this.ok) return;
    this.floor(9);
    this.table = makeTable();
    this.scene.add(this.table);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.036, 18, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.3 }));
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.rallyOn = rally;
    this.phase = 0;
    this.direction = 1;
    this.players = [null, null];
    this.token = 0;
    this.onResize = (aspect) => this.frameCamera(aspect);
    this.frameCamera(this.camera.aspect);
    this.updaters.add((dt) => this.rally(dt));
    this.time = 0;
    this.updaters.add((dt) => {
      this.time += dt;
      if (this.orbit !== false) {
        const a = Math.sin(this.time * 0.14) * 0.11;
        const d = this.cameraDistance;
        this.camera.position.set(Math.sin(a) * d, this.cameraHeight, Math.cos(a) * d);
        this.camera.lookAt(0, 0.82, 0);
      }
    });
  }

  frameCamera(aspect) {
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.cameraDistance = Math.max(7, 3.15 / (tan * aspect));
    this.cameraHeight = 1.8;
    this.camera.position.set(0, this.cameraHeight, this.cameraDistance);
    this.camera.lookAt(0, 0.82, 0);
  }

  async setPlayers(a, b) {
    if (!this.ok) return;
    const token = ++this.token;
    const key = JSON.stringify([a, b]);
    if (key === this.playersKey) return;
    this.playersKey = key;
    const [pa, pb] = await Promise.all([
      a ? this.createAvatar(a, { x: -1.95, z: 0.05, ry: Math.PI / 2 - 0.5, anim: 'Ready' }) : null,
      b ? this.createAvatar(b, { x: 1.95, z: 0.05, ry: -Math.PI / 2 + 0.5, anim: 'Ready' }) : null,
    ]);
    if (this.disposed || token !== this.token) { this.removeAvatar(pa); this.removeAvatar(pb); return; }
    this.players.forEach((p) => this.removeAvatar(p));
    this.players = [pa, pb];
  }

  rally(dt) {
    if (!this.rallyOn || !this.players[0] || !this.players[1]) {
      this.ball.visible = false;
      return;
    }
    this.ball.visible = true;
    const speed = 1.05;
    const before = this.phase;
    this.phase += dt * speed;
    const hitter = this.direction > 0 ? 0 : 1;
    const receiver = 1 - hitter;
    // resposta: o receptor começa a rebater um pouco antes da bola chegar
    if (before < 0.68 && this.phase >= 0.68) this.players[receiver]?.play('SwordSlash', { loop: false, then: 'Ready', fade: 0.12, speed: 1.2 });
    if (this.phase >= 1) {
      this.phase = 0;
      this.direction *= -1;
    }
    const p = this.phase, from = -1.5 * this.direction, to = 1.5 * this.direction;
    const x = from + (to - from) * p;
    const bounce = 0.52;
    const y = p < bounce
      ? 0.78 + 0.34 * (1 - ((p / bounce) * 2 - 1) ** 2) + (1 - p / bounce) * 0.1
      : 0.78 + 0.42 * (1 - (((p - bounce) / (1 - bounce)) * 1.5 - 1) ** 2);
    this.ball.position.set(x, y, Math.sin(p * Math.PI) * 0.1 * this.direction);
  }

  // Reação visual a um ponto marcado: vencedor comemora, adversário sente.
  celebrate(side) {
    const w = this.players[side], l = this.players[1 - side];
    w?.play('Jump', { loop: false, then: 'Ready', fade: 0.12 });
    l?.play('RecieveHit', { loop: false, then: 'Ready', fade: 0.12 });
  }

  finish(side) {
    this.rallyOn = false;
    this.players[side]?.play('Victory', { fade: 0.25 });
    this.players[1 - side]?.play('Defeat', { loop: false, fade: 0.25 });
  }
}

// ---------------------------------------------------------------- confronto
export class VersusStage extends Stage {
  constructor(host) {
    super(host, { fov: 24 });
    if (!this.ok) return;
    this.floor(8);
    this.ring(-1.3, 0, 0.74);
    this.ring(1.3, 0, 0.74);
    this.onResize = (aspect) => {
      const d = aspect > 1.2 ? 7.2 : 11;
      this.camera.position.set(0, 1.35, d);
      this.camera.lookAt(0, 0.92, 0);
    };
    this.onResize(this.camera.aspect);
    this.players = [null, null];
    this.token = 0;
  }

  async setPlayers(a, b) {
    if (!this.ok) return;
    const key = JSON.stringify([a, b]);
    if (key === this.key) return;
    this.key = key;
    const token = ++this.token;
    const [pa, pb] = await Promise.all([
      a ? this.createAvatar(a, { x: -1.3, ry: 0.55 }) : null,
      b ? this.createAvatar(b, { x: 1.3, ry: -0.55 }) : null,
    ]);
    if (this.disposed || token !== this.token) { this.removeAvatar(pa); this.removeAvatar(pb); return; }
    this.players.forEach((p) => this.removeAvatar(p));
    this.players = [pa, pb];
  }

  setOutcome(side) {
    if (side === null || side === undefined) return;
    this.players[side]?.play('Victory', { fade: 0.3 });
    this.players[1 - side]?.play('Defeat', { loop: false, fade: 0.3 });
  }
}

// ---------------------------------------------------------------- troféu e confete
export function makeTrophy(color = COLORS.gold) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: 0.24 });
  const profile = [[0, 0], [0.34, 0], [0.34, 0.07], [0.22, 0.1], [0.2, 0.2], [0.12, 0.24], [0.055, 0.3], [0.05, 0.58], [0.09, 0.64], [0.2, 0.72], [0.31, 0.96], [0.36, 1.25], [0.345, 1.25], [0.29, 0.97], [0.18, 0.76], [0, 0.68]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const cup = new THREE.Mesh(new THREE.LatheGeometry(profile, 56), metal);
  cup.castShadow = true;
  g.add(cup);
  for (const s of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.3, 1.14, 0), new THREE.Vector3(s * 0.52, 1.14, 0), new THREE.Vector3(s * 0.56, 0.96, 0),
      new THREE.Vector3(s * 0.42, 0.8, 0), new THREE.Vector3(s * 0.22, 0.76, 0),
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.026, 10), metal));
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 28, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.05 }));
  ball.position.y = 1.34;
  g.add(ball);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 0.12, 48), new THREE.MeshStandardMaterial({ color: 0x0a0d14, roughness: 0.35, metalness: 0.6 }));
  plinth.position.y = -0.06;
  g.add(plinth);
  return g;
}

export class Confetti {
  constructor(stage, { count = 360, colors = [COLORS.gold, COLORS.ice, COLORS.beam, 0xffffff], area = 9, height = 7 } = {}) {
    this.stage = stage;
    const geo = new THREE.PlaneGeometry(0.05, 0.085);
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5, metalness: 0.3 });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.height = height;
    this.area = area;
    this.items = [];
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      this.items.push({
        p: new THREE.Vector3((Math.random() - 0.5) * area, Math.random() * height + 1, (Math.random() - 0.5) * 6),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        v: 0.5 + Math.random() * 0.8, s: 1 + Math.random() * 3, phase: Math.random() * 6,
      });
      this.mesh.setColorAt(i, color.set(colors[i % colors.length]));
    }
    stage.scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.fn = (dt) => this.update(dt);
    stage.updaters.add(this.fn);
  }

  update(dt) {
    this.items.forEach((it, i) => {
      it.p.y -= it.v * dt;
      it.phase += dt * it.s;
      it.p.x += Math.sin(it.phase) * dt * 0.28;
      it.r.x += dt * it.s;
      it.r.y += dt * it.s * 0.7;
      if (it.p.y < 0) {
        it.p.y = this.height + Math.random();
        it.p.x = (Math.random() - 0.5) * this.area;
      }
      this.dummy.position.copy(it.p);
      this.dummy.rotation.copy(it.r);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class ChampionStage extends Stage {
  constructor(host) {
    super(host, { fov: 28, env: true, exposure: 1.15 });
    if (!this.ok) return;
    this.floor(9);
    this.spot = new THREE.SpotLight(0xffe2ae, 90, 18, 0.34, 0.5, 1.2);
    this.spot.position.set(0, 7.5, 2.5);
    this.spot.target.position.set(0, 0.8, 0);
    this.spot.castShadow = true;
    this.scene.add(this.spot, this.spot.target);
    const pedestal = (x, h, r) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.03, h, 64), new THREE.MeshStandardMaterial({ color: 0x0b0f1a, roughness: 0.3, metalness: 0.7 }));
      m.position.set(x, h / 2, 0);
      m.receiveShadow = true;
      this.scene.add(m);
      this.ring(x, 0, r + 0.03, x === 0 ? COLORS.gold : COLORS.beam, h + 0.004);
      return m;
    };
    pedestal(0, 0.5, 0.82);
    pedestal(-2.1, 0.22, 0.68);
    this.trophy = makeTrophy();
    this.trophy.scale.setScalar(0.92);
    this.trophy.position.set(1.95, 0.62, 0.15);
    this.scene.add(this.trophy);
    const tp = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.56, 48), new THREE.MeshStandardMaterial({ color: 0x0b0f1a, roughness: 0.3, metalness: 0.7 }));
    tp.position.set(1.95, 0.28, 0.15);
    this.scene.add(tp);
    this.ring(1.95, 0.15, 0.5, COLORS.gold, 0.565);
    this.confetti = new Confetti(this);
    this.time = 0;
    this.onResize = (aspect) => { this.distance = aspect > 1.3 ? 8.6 : aspect > 0.9 ? 11 : 16.5; };
    this.onResize(this.camera.aspect);
    this.updaters.add((dt) => {
      this.time += dt;
      const a = Math.sin(this.time * 0.18) * 0.16;
      const zoom = Math.max(0, 1 - this.time / 3.2);
      const d = this.distance + ease.inOut(zoom) * 3;
      this.camera.position.set(Math.sin(a) * d, 1.9, Math.cos(a) * d);
      this.camera.lookAt(0, 1.24, 0);
      this.trophy.rotation.y += dt * 0.6;
      this.spot.intensity = 80 + Math.sin(this.time * 1.6) * 10;
    });
  }

  async setPlayers(champion, vice) {
    if (!this.ok) return;
    const key = JSON.stringify([champion, vice]);
    if (key === this.key) return;
    this.key = key;
    this.removeAvatar(this.champion);
    this.removeAvatar(this.vice);
    this.champion = champion ? await this.createAvatar(champion, { x: 0, y: 0.5, anim: 'Victory' }) : null;
    this.vice = vice ? await this.createAvatar({ ...vice, medal: 'silver' }, { x: -2.1, y: 0.22, ry: 0.3, anim: 'Idle' }) : null;
  }
}

// ---------------------------------------------------------------- sorteio
const fresnelMaterial = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.FrontSide,
  uniforms: { boost: { value: 1 } },
  vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
  fragmentShader: 'varying vec3 vN; varying vec3 vV; uniform float boost; void main(){ float f = pow(1.-abs(dot(normalize(vN),normalize(vV))),2.6); vec3 c = mix(vec3(.12,.32,.85), vec3(.75,.88,1.), f); float h = pow(max(dot(normalize(vN),normalize(vec3(-.5,.7,.5))),0.),30.)*.8; gl_FragColor = vec4(c, (f*.92+.035)*boost + h); }',
});

function ballCanvas(img, number) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f6fb';
  g.fillRect(0, 0, 512, 256);
  const draw = (cx) => {
    g.save();
    g.beginPath();
    g.arc(cx, 128, 92, 0, Math.PI * 2);
    g.fillStyle = '#0a1a3a';
    g.fill();
    g.clip();
    if (img) g.drawImage(img, cx - 92, 36, 184, 184);
    g.restore();
    g.fillStyle = '#0040c8';
    g.font = '800 26px Gilroy, sans-serif';
    g.textAlign = 'center';
    g.fillText(String(number).padStart(2, '0'), cx, 250);
  };
  draw(128);
  draw(384);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const loadImage = (url) => new Promise((resolve) => {
  if (!url) { resolve(null); return; }
  const i = new Image();
  i.onload = () => resolve(i);
  i.onerror = () => resolve(null);
  i.src = url;
});

export class DrawStage extends Stage {
  constructor(host) {
    super(host, { fov: 27, env: true });
    if (!this.ok) return;
    this.floor(11);
    this.pot = new THREE.Group();
    this.potRadius = 1.28;
    const glass = new THREE.Mesh(new THREE.SphereGeometry(this.potRadius, 64, 48), fresnelMaterial());
    glass.renderOrder = 5;
    this.pot.add(glass);
    this.scene.add(this.pot);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.7, 0.5, 48), new THREE.MeshStandardMaterial({ color: 0x0b0f1a, metalness: 0.75, roughness: 0.3 }));
    this.stand = stand;
    this.scene.add(stand);
    this.standRing = this.ring(0, 0, 0.9);
    this.balls = new Map();
    this.agitation = 0.35;
    this.pedestals = [this.ring(0, 0, 0.72), this.ring(0, 0, 0.72)];
    this.slots = [null, null];
    this.slotKeys = [null, null];
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 16), new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.scene.add(this.flash);
    this.onResize = (aspect) => this.layout(aspect);
    this.layout(this.camera.aspect);
    this.updaters.add((dt) => this.simulate(dt));
  }

  layout(aspect) {
    const wide = aspect > 1.05;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const d = wide ? Math.max(12.5, 4 / (tan * aspect)) : 14.5;
    const halfW = tan * d * aspect;
    this.potPos = wide ? new THREE.Vector3(-halfW + 1.55, 1.82, 0) : new THREE.Vector3(0, 3.3, -0.4);
    this.slotX = wide ? [halfW - 3.7, halfW - 1.1] : [-1.15, 1.15];
    this.pot.position.copy(this.potPos);
    this.stand.position.set(this.potPos.x, 0.25, this.potPos.z);
    this.standRing.position.set(this.potPos.x, 0.01, this.potPos.z);
    this.pedestals.forEach((p, i) => p.position.set(this.slotX[i], 0.01, 0));
    this.camera.position.set(0, 1.9, d);
    this.camera.lookAt(0, wide ? 1.35 : 1.95, 0);
    this.slots.forEach((a, i) => { if (a) a.group.position.x = this.slotX[i]; });
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  // Bolas com o retrato de cada jogador ainda no pote.
  async setPool(players) {
    if (!this.ok) return;
    const ids = new Set(players.map((p) => p.id));
    for (const [id, b] of this.balls) {
      if (!ids.has(id) && !b.flying) {
        this.pot.remove(b.mesh);
        this.balls.delete(id);
      }
    }
    for (const p of players) {
      if (this.balls.has(p.id)) continue;
      const a = Math.random() * 6.28, r = Math.random() * 0.8, y = (Math.random() - 0.5) * 1.1;
      const entry = {
        pos: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r),
        vel: new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2),
        spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(4),
      };
      const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.02 });
      entry.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.235, 32, 22), material);
      entry.mesh.position.copy(entry.pos);
      this.pot.add(entry.mesh);
      this.balls.set(p.id, entry);
      portrait(p.avatar, { size: 192 }).then(loadImage).then((img) => {
        if (this.disposed) return;
        material.map = ballCanvas(img, p.number);
        material.needsUpdate = true;
      });
    }
  }

  simulate(dt) {
    this.pot.rotation.y += dt * 0.1;
    const wall = this.potRadius - 0.26;
    const list = [...this.balls.values()].filter((b) => !b.flying);
    for (const b of list) {
      b.vel.y -= 2.4 * dt;
      b.vel.x += (Math.random() - 0.5) * 22 * this.agitation * dt;
      b.vel.y += (Math.random() - 0.32) * 26 * this.agitation * dt;
      b.vel.z += (Math.random() - 0.5) * 22 * this.agitation * dt;
      b.vel.multiplyScalar(1 - 0.5 * dt);
      b.pos.addScaledVector(b.vel, dt);
      const len = b.pos.length();
      if (len > wall) {
        const n = b.pos.clone().divideScalar(len);
        b.pos.copy(n).multiplyScalar(wall);
        b.vel.addScaledVector(n, -1.65 * b.vel.dot(n));
      }
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const d = list[i].pos.clone().sub(list[j].pos);
        const l = d.length();
        if (l > 0.001 && l < 0.46) {
          d.divideScalar(l);
          const push = (0.46 - l) * 0.5;
          list[i].pos.addScaledVector(d, push);
          list[j].pos.addScaledVector(d, -push);
          const rel = list[i].vel.clone().sub(list[j].vel).dot(d);
          if (rel < 0) {
            list[i].vel.addScaledVector(d, -rel * 0.85);
            list[j].vel.addScaledVector(d, rel * 0.85);
          }
        }
      }
    }
    for (const b of list) {
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.x += b.spin.x * dt * (0.4 + this.agitation);
      b.mesh.rotation.y += b.spin.y * dt * (0.4 + this.agitation);
    }
  }

  // Anima a saída da bola do pote até o pedestal do lado sorteado.
  async pickBall(playerId, side) {
    if (!this.ok || document.hidden) return;
    const b = this.balls.get(playerId);
    if (!b) return;
    this.agitation = 2.4;
    await this.tween(1.1, () => {}, (t) => t);
    this.agitation = 0.35;
    b.flying = true;
    const start = new THREE.Vector3();
    b.mesh.getWorldPosition(start);
    this.pot.remove(b.mesh);
    this.scene.add(b.mesh);
    b.mesh.position.copy(start);
    b.mesh.rotation.set(0, -Math.PI / 2, 0);
    const end = new THREE.Vector3(this.slotX[side], 1.1, 0.4);
    const mid = start.clone().lerp(end, 0.5);
    mid.y += 1.2;
    mid.z += 1.3;
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    await this.tween(0.85, (k) => {
      b.mesh.position.copy(curve.getPoint(k));
      b.mesh.scale.setScalar(1 + k * 1.7);
    }, ease.inOut);
    this.flash.position.copy(end);
    await this.tween(0.32, (k) => {
      b.mesh.scale.setScalar((1 - k) * 2.7);
      this.flash.scale.setScalar(1 + k * 5);
      this.flash.material.opacity = 0.9 * (1 - k);
    });
    this.scene.remove(b.mesh);
    b.mesh.material.map?.dispose();
    b.mesh.material.dispose();
    b.mesh.geometry.dispose();
    this.balls.delete(playerId);
  }

  // Mostra o par atual. `reveal` indica o lado que acabou de sair (entra com animação).
  async setPair(a, b, reveal = null) {
    if (!this.ok) return;
    const wanted = [a, b];
    const token = (this.pairToken = (this.pairToken || 0) + 1);
    for (let side = 0; side < 2; side++) {
      const key = wanted[side] ? JSON.stringify(wanted[side]) : null;
      if (key === this.slotKeys[side]) continue;
      this.removeAvatar(this.slots[side]);
      this.slots[side] = null;
      this.slotKeys[side] = key;
      if (!wanted[side]) continue;
      const avatar = await this.createAvatar(wanted[side], { x: this.slotX[side], ry: side === 0 ? 0.5 : -0.5 });
      if (!avatar) continue;
      if (this.disposed || token !== this.pairToken) { this.removeAvatar(avatar); this.slotKeys[side] = null; continue; }
      this.slots[side] = avatar;
      if (reveal === side) {
        avatar.play('Jump', { loop: false, then: 'Idle', fade: 0.05 });
        await this.tween(0.45, (k) => avatar.group.scale.setScalar(avatar.config.height * Math.max(0.01, k)), ease.back);
      }
    }
  }

  faceOff() {
    this.slots.forEach((a) => a?.play('Punch', { loop: false, then: 'Idle', fade: 0.15 }));
  }
}

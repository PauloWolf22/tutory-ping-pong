// Materiais para aproximar o avatar de uma pessoa real: pele com poros e dispersão de luz, olhos úmidos, cabelo suave.
// O pacote CC0 não traz mapas de normal de pele, então os poros são gerados no shader, nas coordenadas da textura.
import * as THREE from 'three';

const PORES = /* glsl */`
  float ppHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float ppNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(ppHash(i), ppHash(i + vec2(1, 0)), f.x), mix(ppHash(i + vec2(0, 1)), ppHash(i + vec2(1, 1)), f.x), f.y);
  }
  float ppPores(vec2 p) { return ppNoise(p) * 0.6 + ppNoise(p * 2.3 + 7.1) * 0.3 + ppNoise(p * 0.37) * 0.25; }
  vec3 ppBump(vec3 surf, vec3 n, vec2 dH, float side) {
    vec3 sx = dFdx(surf), sy = dFdy(surf);
    vec3 r1 = cross(sy, n), r2 = cross(n, sx);
    float det = dot(sx, r1) * side;
    vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
    return normalize(abs(det) * n - grad);
  }
`;

const SCALE = '950.0';

export function skinMaterial(base) {
  const m = new THREE.MeshPhysicalMaterial({
    map: base.map, color: 0xffffff, roughness: 0.56, metalness: 0, specularIntensity: 0.62, specularColor: new THREE.Color(0xfff1e6),
    sheen: 0.12, sheenRoughness: 0.75, sheenColor: new THREE.Color(0xffc9b0), envMapIntensity: 0.75,
  });
  m.onBeforeCompile = (s) => {
    // camada básica: a área que toda roupa cobre vira tecido escuro (só aparece se nenhuma roupa estiver no lugar)
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float baseLayer;\nvarying float vBaseLayer;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBaseLayer = baseLayer;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vBaseLayer;\n${PORES}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float ppCloth = smoothstep(0.35, 0.65, vBaseLayer);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.05, 0.09), ppCloth);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        #ifdef USE_MAP
          roughnessFactor = clamp(roughnessFactor + (ppPores(vMapUv * ${SCALE}) - 0.55) * 0.12, 0.3, 0.85);
        #endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #ifdef USE_MAP
          vec2 ppUv = vMapUv * ${SCALE};
          vec2 ppDx = dFdx(ppUv), ppDy = dFdy(ppUv);
          float ppFade = 1.0 - smoothstep(0.25, 0.95, max(length(ppDx), length(ppDy)));
          float ppH = ppPores(ppUv);
          vec2 ppD = vec2(ppPores(ppUv + ppDx) - ppH, ppPores(ppUv + ppDy) - ppH) * 0.0016 * ppFade;
          normal = ppBump(-vViewPosition, normal, ppD, faceDirection);
        #endif`)
      // dispersão aproximada: a luz atravessa a pele e volta avermelhada nas bordas e nas sombras
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        float ppNdV = saturate(dot(normal, normalize(vViewPosition)));
        vec3 ppScatter = diffuseColor.rgb * vec3(1.0, 0.36, 0.24);
        reflectedLight.indirectDiffuse += ppScatter * pow(1.0 - ppNdV, 2.4) * 0.42;
        reflectedLight.directDiffuse += ppScatter * 0.05;`);
  };
  m.customProgramCacheKey = () => 'pp-skin';
  return m;
}

export function eyeMaterial(base) {
  return new THREE.MeshPhysicalMaterial({
    map: base.map, color: base.color, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.38, envMapIntensity: 1.3, specularIntensity: 1,
  });
}

export function hairMaterial(base, color = '#3a2416') {
  const m = new THREE.MeshPhysicalMaterial({
    map: base.map, normalMap: base.normalMap || null, color, roughness: 0.46, specularIntensity: 0.75, sheen: 0.3, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xffffff),
    side: THREE.DoubleSide, alphaTest: 0.32, alphaToCoverage: true, transparent: false, envMapIntensity: 0.8,
  });
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float hairLuma = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      diffuseColor.rgb = diffuse * clamp(hairLuma * 3.0, 0.14, 1.45);`);
  };
  m.customProgramCacheKey = () => 'pp-hair';
  return m;
}

// Luz de estúdio: uma principal grande e suave, preenchimento neutro e contorno discreto.
export function studioLights(scene) {
  const g = new THREE.Group();
  const key = new THREE.DirectionalLight(0xfff0e2, 2.5);
  key.position.set(1.6, 2.9, 3.3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.012;
  key.shadow.radius = 6;
  Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 2.2, bottom: -0.2, near: 0.5, far: 8 });
  const fill = new THREE.DirectionalLight(0xdfe7ff, 0.7);
  fill.position.set(-2.8, 1.2, 2.2);
  const rim = new THREE.DirectionalLight(0xbcd2ff, 1.5);
  rim.position.set(-1.6, 2.6, -3);
  g.add(key, fill, rim, new THREE.HemisphereLight(0xf0f4ff, 0x4a4238, 0.5));
  scene.add(g);
  return g;
}

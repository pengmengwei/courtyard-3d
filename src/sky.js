import * as THREE from 'three';

/*
 * A hand-tuned physical-ish sky: vertical gradient, horizon haze, sun disc with
 * glare, and a sparse star field at night. The same shader is rendered into a
 * PMREM probe so every material reflects the actual courtyard sky.
 */

const vertexShader = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */`
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uHaze;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uSunBoost;
  uniform float uNight;
  uniform float uEncode;
  varying vec3 vDir;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y;
    float up = clamp(h, 0.0, 1.0);

    vec3 col = mix(uHorizon, uTop, pow(up, 0.38));
    col = mix(col, uHaze, pow(1.0 - up, 13.0) * 0.42);
    col = mix(col, uGround, smoothstep(0.0, -0.06, h) * 0.9);

    float cd = max(dot(dir, normalize(uSunDir)), 0.0);
    float disk = smoothstep(0.99965, 0.99985, cd);
    float glow = pow(cd, 300.0) * 0.6 + pow(cd, 26.0) * 0.14 + pow(cd, 6.0) * 0.045;
    col += uSunColor * (disk * uSunBoost + glow) * (1.0 - smoothstep(0.35, 0.95, uNight));

    if (uNight > 0.01) {
      float azimuth = atan(dir.z, dir.x);
      float altitude = asin(clamp(h, -1.0, 1.0));
      vec2 cell = floor(vec2(azimuth, altitude) * vec2(560.0, 460.0));
      float star = step(0.9975, hash21(cell));
      float twinkle = 0.55 + 0.45 * hash21(cell + 7.0);
      col += vec3(0.72, 0.8, 1.0) * star * twinkle * uNight * smoothstep(0.02, 0.22, h) * 0.9;
      float moon = pow(max(dot(dir, normalize(vec3(-0.35, 0.55, -0.75))), 0.0), 3200.0);
      col += vec3(0.9, 0.94, 1.0) * moon * uNight * 2.2;
    }

    if (uEncode > 0.5) {
      col = aces(col);
      col = pow(col, vec3(1.0 / 2.2));
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeUniforms() {
  return {
    uTop: { value: new THREE.Color('#2f6cb8') },
    uHorizon: { value: new THREE.Color('#cfe0e8') },
    uGround: { value: new THREE.Color('#6d7458') },
    uHaze: { value: new THREE.Color('#e3e9e8') },
    uSunColor: { value: new THREE.Color('#ffd9a0') },
    uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.5) },
    uSunBoost: { value: 6 },
    uNight: { value: 0 },
    uEncode: { value: 1 },
  };
}

export function createSky(renderer, scene) {
  const uniforms = makeUniforms();
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(180, 48, 24), material);
  dome.frustumCulled = false;
  dome.name = '天空';
  scene.add(dome);

  // Environment probe scene
  const envUniforms = makeUniforms();
  envUniforms.uEncode.value = 0;
  const envMaterial = new THREE.ShaderMaterial({
    uniforms: envUniforms, vertexShader, fragmentShader,
    side: THREE.BackSide, depthWrite: false, toneMapped: false,
  });
  const envScene = new THREE.Scene();
  const envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), envMaterial);
  envScene.add(envDome);
  const envGround = new THREE.Mesh(
    new THREE.CircleGeometry(48, 32),
    new THREE.MeshBasicMaterial({ color: '#6d7458', toneMapped: false, side: THREE.DoubleSide }),
  );
  envGround.rotation.x = -Math.PI / 2;
  envGround.position.y = -0.6;
  envScene.add(envGround);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  let envTexture = null;
  let lastSignature = '';

  function apply(uniformsSet, state) {
    uniformsSet.uTop.value.copy(state.top);
    uniformsSet.uHorizon.value.copy(state.horizon);
    uniformsSet.uGround.value.copy(state.ground);
    uniformsSet.uHaze.value.copy(state.haze);
    uniformsSet.uSunColor.value.copy(state.sunColor);
    uniformsSet.uSunDir.value.copy(state.sunDir);
    uniformsSet.uSunBoost.value = state.sunBoost;
    uniformsSet.uNight.value = state.night;
  }

  function rebuildEnvironment(state) {
    const signature = [state.top.getHexString(), state.horizon.getHexString(), state.sunDir.toArray().map(n => n.toFixed(3)).join(','), state.night.toFixed(2)].join('|');
    if (signature === lastSignature && envTexture) return envTexture;
    lastSignature = signature;
    const previous = envTexture;
    envTexture = pmrem.fromScene(envScene, 0.03, 0.1, 120).texture;
    if (previous) previous.dispose();
    scene.environment = envTexture;
    return envTexture;
  }

  return {
    dome,
    uniforms,
    update(state, { rebuild = false } = {}) {
      apply(uniforms, state);
      apply(envUniforms, state);
      envGround.material.color.copy(state.ground);
      dome.position.set(0, 0, 0);
      if (rebuild) rebuildEnvironment(state);
    },
    rebuildEnvironment,
    get environment() { return envTexture; },
  };
}

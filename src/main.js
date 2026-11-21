import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createMaterials } from './textures.js';
import { createSky } from './sky.js';
import { buildArchitecture, buildFence } from './architecture.js';
import { buildFurniture } from './furniture.js';
import { buildGarden } from './garden.js';
import { mergeStaticGroup } from './optimize.js';
import './style.css';

const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.9));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.94;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2('#dbe4e4', 0.0092);
const camera = new THREE.PerspectiveCamera(window.innerWidth / window.innerHeight < 0.8 ? 58 : 38, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(17.5, 9.6, 22);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0.4, 2.0, 1.2);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 3.5;
controls.maxDistance = 58;
controls.maxPolarAngle = Math.PI * 0.485;
controls.minPolarAngle = 0.12;
controls.autoRotateSpeed = 0.45;
controls.zoomToCursor = true;
controls.update();

const sky = createSky(renderer, scene);

/* ------------------------------------------------------------------ *
 *  Daylight model — a low autumn sun rakes across the veranda, the
 *  great tree line throws long shadows over the lawn, and after six the
 *  courtyard falls into blue hour with lanterns and warm windows.
 * ------------------------------------------------------------------ */

const sunlight = new THREE.DirectionalLight('#fff0d6', 3.2);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(4096, 4096);
sunlight.shadow.camera.left = -19;
sunlight.shadow.camera.right = 19;
sunlight.shadow.camera.top = 20;
sunlight.shadow.camera.bottom = -12;
sunlight.shadow.camera.near = 1;
sunlight.shadow.camera.far = 100;
sunlight.shadow.bias = -0.00022;
sunlight.shadow.normalBias = 0.028;
sunlight.shadow.radius = 1.6;
sunlight.shadow.camera.updateProjectionMatrix();
scene.add(sunlight, sunlight.target);
sunlight.target.position.set(0, 0, 0.8);

const hemisphere = new THREE.HemisphereLight('#bed8f4', '#6c6847', 0.85);
scene.add(hemisphere);

const skyFill = new THREE.DirectionalLight('#dce9ec', 0.4);
skyFill.position.set(11, 8, -7);
scene.add(skyFill);

const bounce = new THREE.DirectionalLight('#eedcb8', 0.34);
bounce.position.set(3, 1.6, 12);
scene.add(bounce);

const verandaFill = new THREE.RectAreaLight('#e6e2d2', 1.2, 11, 2.6);
verandaFill.position.set(-0.4, 3.3, 6.2);
verandaFill.lookAt(-0.4, 2.4, 0);
scene.add(verandaFill);

const materials = createMaterials();
const { house, lanterns, lanternLights, windowGlows } = buildArchitecture(scene, materials);
const { fence } = buildFence(scene, materials);
const { group: furniture } = buildFurniture(scene, materials);
const garden = buildGarden(scene, materials);
[house, fence, furniture, garden].forEach(group => mergeStaticGroup(scene, group));

const dayTop = new THREE.Color('#1f5cae');
const dayHorizon = new THREE.Color('#8fbbe0');
const dayHaze = new THREE.Color('#d3e2e6');
const dayGround = new THREE.Color('#6d7458');
const goldenTop = new THREE.Color('#39649f');
const goldenHorizon = new THREE.Color('#e8c48f');
const goldenHaze = new THREE.Color('#eed6ae');
const goldenGround = new THREE.Color('#6a6749');
const nightTop = new THREE.Color('#050b16');
const nightHorizon = new THREE.Color('#152539');
const nightHaze = new THREE.Color('#233346');
const nightGround = new THREE.Color('#0a1015');

const sunColorHigh = new THREE.Color('#ffefd2');
const sunColorLow = new THREE.Color('#ff9846');
const skyState = {
  top: new THREE.Color(), horizon: new THREE.Color(), ground: new THREE.Color(), haze: new THREE.Color(),
  sunColor: new THREE.Color(), sunDir: new THREE.Vector3(0.5, 0.7, 0.5), night: 0, sunBoost: 6,
};

const views = {
  overview: { position: [17.5, 9.6, 22], target: [0.4, 2.0, 1.2], index: '01', title: '庭院全景', subtitle: 'COURTYARD OVERVIEW' },
  facade: { position: [0.4, 4.4, 21], target: [0.2, 3.1, 0.2], index: '02', title: '建筑立面', subtitle: 'TILE, PLASTER & TIMBER' },
  tea: { position: [7.9, 3.2, 9.7], target: [3.2, 0.9, 4.7], index: '03', title: '户外茶歇', subtitle: 'AN AFTERNOON OUTSIDE' },
  gate: { position: [-2.0, 2.7, 14.0], target: [-11.4, 1.9, 6.4], index: '04', title: '竹篱木门', subtitle: 'THE GARDEN THRESHOLD' },
};
let currentView = 'overview';
let transition = null;
let tourActive = false;
let tourTimer = null;
let currentHour = 14.5;
let needsRender = true;
let envTimer = null;
controls.addEventListener('change', () => { needsRender = true; });
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function setView(key, immediate = false) {
  const view = views[key];
  if (!view) return;
  currentView = key;
  document.body.classList.toggle('detail-view', key !== 'overview');
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === key));
  document.querySelector('#view-index').textContent = view.index;
  document.querySelector('#view-title').textContent = view.title;
  document.querySelector('#view-subtitle').textContent = view.subtitle;
  if (immediate || reduceMotion) {
    camera.position.set(...view.position);
    controls.target.set(...view.target);
    controls.update();
    transition = null;
  } else {
    transition = {
      started: performance.now(), duration: 1600,
      fromPosition: camera.position.clone(), toPosition: new THREE.Vector3(...view.position),
      fromTarget: controls.target.clone(), toTarget: new THREE.Vector3(...view.target),
    };
  }
}

function updateTime(hour) {
  currentHour = hour;
  needsRender = true;
  renderer.shadowMap.needsUpdate = true;
  const hours = Math.floor(hour);
  const minutes = Math.round((hour - hours) * 60);
  document.querySelector('#time-label').textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  document.querySelector('#time-slider').value = hour;
  document.querySelectorAll('[data-time]').forEach(button => button.classList.toggle('active', Math.abs(Number(button.dataset.time) - hour) < 0.06));

  const elevation = Math.max(-6, Math.sin((hour - 6.3) / 12 * Math.PI) * 50);
  const azimuth = -48 + (hour - 14.5) * -14;
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta).normalize();
  const night = THREE.MathUtils.smoothstep(hour, 18.0, 19.5);
  const daylight = THREE.MathUtils.clamp(elevation / 45, 0, 1);
  const low = 1 - THREE.MathUtils.smoothstep(elevation, 4, 34);
  const golden = low * (1 - night);

  sunlight.position.copy(sunDir).multiplyScalar(46);
  sunlight.intensity = 5.1 * THREE.MathUtils.smoothstep(elevation, -1.5, 7) * (0.72 + 0.28 * daylight) * (1 - night * 0.94);
  sunlight.color.copy(sunColorHigh).lerp(sunColorLow, low * 0.85);

  hemisphere.intensity = (0.2 + daylight * 0.36) * (1 - night * 0.72) + night * 0.13;
  hemisphere.color.set('#bed8f4').lerp(nightHorizon, night);
  hemisphere.groundColor.set('#6c6847').lerp(new THREE.Color('#0d1215'), night);

  skyFill.intensity = 0.16 + daylight * 0.3 * (1 - night);
  skyFill.color.set('#dce9ec').lerp(new THREE.Color('#54709a'), night);
  bounce.intensity = (0.08 + daylight * 0.14) * (1 - night);
  verandaFill.intensity = (0.7 + daylight * 0.7) * (1 - night * 0.6) + night * 0.3;
  scene.environmentIntensity = 0.11 + daylight * 0.42 * (1 - night * 0.65) + night * 0.06;
  renderer.toneMappingExposure = 0.94 + night * 0.3;

  scene.fog.color.set('#dbe4e4').lerp(goldenHaze, golden * 0.55).lerp(nightHaze, night);
  scene.fog.density = 0.0092 + night * 0.0035;

  skyState.sunDir.copy(sunDir);
  skyState.night = night;
  skyState.sunBoost = 7;
  skyState.top.copy(dayTop).lerp(goldenTop, golden * 0.5).lerp(nightTop, night);
  skyState.horizon.copy(dayHorizon).lerp(goldenHorizon, golden * 0.8).lerp(nightHorizon, night);
  skyState.haze.copy(dayHaze).lerp(goldenHaze, golden * 0.9).lerp(nightHaze, night);
  skyState.ground.copy(dayGround).lerp(goldenGround, golden * 0.5).lerp(nightGround, night);
  skyState.sunColor.copy(sunColorHigh).lerp(sunColorLow, low).lerp(new THREE.Color('#ff8a3c'), golden * 0.4);
  sky.update(skyState);

  clearTimeout(envTimer);
  envTimer = setTimeout(() => {
    sky.rebuildEnvironment(skyState);
    scene.environment = sky.environment;
    scene.environmentIntensity = 0.11 + daylight * 0.42 * (1 - night * 0.65) + night * 0.06;
    needsRender = true;
  }, 120);

  lanterns.forEach(material => { material.emissiveIntensity = 0.05 + night * 2.6; });
  lanternLights.forEach(light => { light.intensity = night * 6.5; });
  windowGlows.forEach(material => {
    material.color.set('#ffd7a2').multiplyScalar(0.055 + night * 1.55);
    material.opacity = 0.95;
  });
  document.body.classList.toggle('night', night > 0.55);
}
updateTime(14.5);

const labelData = [
  { name: '双层小青瓦', position: new THREE.Vector3(0, 6.7, -2.4) },
  { name: '门廊圆柱', position: new THREE.Vector3(1.5, 3.2, 2.2) },
  { name: '藤编茶桌椅', position: new THREE.Vector3(2.8, 1.55, 5.7) },
  { name: '茅草木门', position: new THREE.Vector3(-11.8, 3.4, 6.5) },
  { name: '白兔与太阳能灯', position: new THREE.Vector3(10.3, 1.1, 1.0) },
  { name: '石板小径', position: new THREE.Vector3(-0.6, 0.3, 10.4) },
];
const labelsRoot = document.querySelector('#labels');
labelData.forEach(item => {
  const element = document.createElement('div');
  element.className = 'scene-label';
  element.innerHTML = `<i></i><span>${item.name}</span>`;
  labelsRoot.appendChild(element);
  item.element = element;
});
let labelsVisible = false;
function updateLabels() {
  if (!labelsVisible) return;
  for (const item of labelData) {
    const p = item.position.clone().project(camera);
    const visible = p.z < 1 && p.z > -1 && Math.abs(p.x) < 0.96 && Math.abs(p.y) < 0.9;
    item.element.style.display = visible ? 'flex' : 'none';
    if (visible) item.element.style.transform = `translate(${(p.x * 0.5 + 0.5) * window.innerWidth}px, ${(-p.y * 0.5 + 0.5) * window.innerHeight}px)`;
  }
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('visible'), 2400);
}

function stopTour() {
  tourActive = false;
  clearInterval(tourTimer);
  document.querySelector('#tour-button span').textContent = '开始院落导览';
  document.querySelector('#tour-button').classList.remove('active');
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  stopTour();
  setView(button.dataset.view);
}));
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); stopTour(); setView('overview'); });
document.querySelector('#reset-button').addEventListener('click', () => { stopTour(); setView('overview'); showToast('已回到庭院全景'); });
document.querySelector('#rotate-button').addEventListener('click', event => {
  stopTour();
  controls.autoRotate = !controls.autoRotate;
  event.currentTarget.classList.toggle('active', controls.autoRotate);
  event.currentTarget.setAttribute('aria-pressed', String(controls.autoRotate));
  showToast(controls.autoRotate ? '自动环绕已开启' : '自动环绕已暂停');
});
document.querySelector('#labels-button').addEventListener('click', event => {
  labelsVisible = !labelsVisible;
  labelsRoot.classList.toggle('visible', labelsVisible);
  labelsRoot.setAttribute('aria-hidden', String(!labelsVisible));
  event.currentTarget.classList.toggle('active', labelsVisible);
  event.currentTarget.setAttribute('aria-pressed', String(labelsVisible));
  updateLabels();
});
document.querySelector('#time-slider').addEventListener('input', event => updateTime(Number(event.target.value)));
document.querySelectorAll('[data-time]').forEach(button => button.addEventListener('click', () => updateTime(Number(button.dataset.time))));

document.querySelector('#tour-button').addEventListener('click', () => {
  if (tourActive) { stopTour(); return; }
  tourActive = true;
  controls.autoRotate = false;
  document.querySelector('#rotate-button').classList.remove('active');
  document.querySelector('#tour-button span').textContent = '结束院落导览';
  document.querySelector('#tour-button').classList.add('active');
  const sequence = ['facade', 'tea', 'gate', 'overview'];
  let index = 0;
  setView(sequence[index]);
  tourTimer = setInterval(() => {
    index = (index + 1) % sequence.length;
    setView(sequence[index]);
  }, 6200);
});
controls.addEventListener('start', () => { transition = null; if (tourActive) stopTour(); });

const referenceDialog = document.querySelector('#reference-dialog');
const referenceNotes = [
  '正立面 · 小青瓦、白色圆柱与深色门窗',
  '户外茶歇 · 藤编椅、木桌、折叠椅与烧烤炉',
  '院落边界 · 竹篱、木门、茅草顶与石板小径',
  '花园一角 · 乔木、修剪灌木、白兔与太阳能灯',
];
function setReference(index) {
  document.querySelector('#reference-image').src = `/references/${index + 1}.jpeg`;
  document.querySelector('#reference-count').textContent = `0${index + 1} / 04`;
  document.querySelector('#reference-note').textContent = referenceNotes[index];
  document.querySelectorAll('[data-photo]').forEach(button => button.classList.toggle('active', Number(button.dataset.photo) === index));
}
document.querySelector('#references-button').addEventListener('click', () => referenceDialog.showModal());
document.querySelector('#close-references').addEventListener('click', () => referenceDialog.close());
document.querySelectorAll('[data-photo]').forEach(button => button.addEventListener('click', () => setReference(Number(button.dataset.photo))));
referenceDialog.addEventListener('click', event => {
  const bounds = referenceDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) referenceDialog.close();
});

document.querySelector('#capture-button').addEventListener('click', () => {
  canvas.toBlob(blob => {
    if (!blob) { showToast('保存失败，请重试'); return; }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `山院-${views[currentView].title}.png`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('当前视角已保存为 PNG');
  }, 'image/png');
});

window.addEventListener('keydown', event => {
  if (event.target.matches('input') || referenceDialog.open) return;
  const keys = { '1': 'overview', '2': 'facade', '3': 'tea', '4': 'gate' };
  if (keys[event.key]) setView(keys[event.key]);
  if (event.key.toLowerCase() === 'r') setView('overview');
  if (event.key.toLowerCase() === 'l') document.querySelector('#labels-button').click();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = camera.aspect < 0.8 ? 58 : 38;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.9));
  renderer.setSize(window.innerWidth, window.innerHeight);
  needsRender = true;
});

const clock = new THREE.Clock();
function animate(now) {
  requestAnimationFrame(animate);
  clock.getDelta();
  if (transition) {
    const t = Math.min(1, (now - transition.started) / transition.duration);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    camera.position.lerpVectors(transition.fromPosition, transition.toPosition, eased);
    controls.target.lerpVectors(transition.fromTarget, transition.toTarget, eased);
    if (t === 1) transition = null;
  }
  const controlsChanged = controls.update();
  if (needsRender || controlsChanged || transition || controls.autoRotate) {
    updateLabels();
    renderer.render(scene, camera);
    needsRender = false;
  }
}
requestAnimationFrame(animate);

requestAnimationFrame(() => {
  setTimeout(() => {
    document.querySelector('#loading').classList.add('done');
    document.body.classList.add('ready');
  }, 450);
});

// Exposed only for local visual checks and deterministic camera/time verification.
window.__courtyard = { scene, camera, controls, renderer, setView, updateTime, views, sky };

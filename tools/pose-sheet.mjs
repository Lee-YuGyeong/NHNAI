// 총 든 로봇 자세 시트 — dev 서버(5173)에서 enforcerPose.ts 를 Vite 로 import 해 모드별 순간을 여러 시점(side·q34·front·top·back)으로 찍는다.
//   node tools/pose-sheet.mjs [--modes walk,run,aim,idle] [--phases 6] [--mps 0.85] [--close] [--out sheet.jpg]   (--close 는 두 손 확대 3장 추가, 결과는 현재 폴더)
import { chromium } from '/Users/nowonsang/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { createRequire } from 'node:module';
const sharp = createRequire('/Users/nowonsang/Who-is-human/package.json')('sharp');
const argv = process.argv.slice(2);
const flag = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const modes = (flag('--modes') ?? 'walk,run,aim,idle').split(',');
const out = flag('--out') ?? 'sheet.jpg';
const close = argv.includes('--close');
const nPh = Number(flag('--phases') ?? 6);
const mps = Number(flag('--mps') ?? 0); // 걷기/달리기 속도(m/s) — 주면 걸음 빠르기가 여기 맞춰진다 (경비 순찰은 0.85)
const W = 360, H = 480;

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--headless=new', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewportSize: { width: 1280, height: 720 } });
let threeUrl = null;
page.on('request', (r) => { const u = r.url(); if (!threeUrl && /\/node_modules\/\.vite\/deps\/three\.js/.test(u)) threeUrl = u; });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto('http://localhost:5173/central?code=7771&nick=ps');
await page.waitForSelector('canvas', { timeout: 30000 });
await page.waitForTimeout(4000);
console.log('three:', threeUrl);

const tiles = await page.evaluate(async ({ threeUrl, modes, W, H, close, nPh, mps }) => {
  const THREE = await import(threeUrl);
  const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const { clone } = await import('/node_modules/three/examples/jsm/utils/SkeletonUtils.js');
  const P = await import('/src/features/world/enforcerPose.ts');
  const { MeshoptDecoder } = await import('/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js');
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const load = (u) => new Promise((res, rej) => loader.load(u, res, undefined, rej));
  const body = await load('/world/enforcer.glb');
  const rifleG = await load('/world/enforcer_rifle.glb');
  document.body.innerHTML = '';
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1c2430');
  scene.add(new THREE.HemisphereLight('#dfe8ff', '#3a3028', 1.6));
  const sun = new THREE.DirectionalLight('#fff2e0', 2.2); sun.position.set(2, 4, 3); scene.add(sun);
  const fill = new THREE.DirectionalLight('#9fc4ff', 0.8); fill.position.set(-3, 2, -2); scene.add(fill);
  const grid = new THREE.GridHelper(4, 8, '#3d5166', '#2a3847'); scene.add(grid);

  const model = clone(body.scene);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const h = box.max.y - box.min.y;
  const HEIGHT = 2.05;
  const scale = HEIGHT / h;
  const lift = -box.min.y * scale;
  model.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; });
  const rig = P.buildRig(model);
  if (!rig) throw new Error('rig 없음');
  P.curlHands(rig, model); // 손가락 굽힘 — 게임과 같은 손 모양으로 본다
  const poser = new P.EnforcerPoser(rig);
  const rifle = rifleG.scene.clone(true);
  P.attachRifle(rig, rifle);
  const inner = new THREE.Group(); inner.scale.setScalar(scale); inner.position.y = lift; inner.rotation.y = -Math.PI / 2; inner.add(model);
  const outer = new THREE.Group(); outer.add(inner); scene.add(outer);

  const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 50);
  const views = {
    side: [3.6, 1.05, 0.0],      // 모델 오른쪽(+x)에서 — 다리·팔 흔들림
    q34: [2.5, 1.2, 2.7],        // 앞 3/4 — 총 파지
    front: [0.0, 1.1, 3.7],
    top: [0.3, 4.6, 0.6],
    back: [0.0, 1.2, -3.7],
  };
  const cad = { walk: P.POSE.walk.cadence, run: P.POSE.run.cadence };
  const plan = [];
  for (const m of modes) {
    if (m === 'walk' || m === 'run') for (let i = 0; i < nPh; i++) plan.push({ mode: m, phase: (i / nPh) * Math.PI * 2, label: `${m} ${Math.round((i / nPh) * 360)}°` });
    else if (m === 'aim') { plan.push({ mode: 'aim', label: 'aim' }); plan.push({ mode: 'aim', recoil: true, label: 'aim recoil' }); }
    else plan.push({ mode: 'idle', label: 'idle' });
  }
  const outTiles = [];
  const dt = 1 / 60;
  for (const p of plan) {
    for (let i = 0; i < 90; i++) {
      if (p.phase !== undefined) poser.phase = p.phase - dt * cad[p.mode] * Math.PI * 2;
      const now = 5000;
      poser.update(dt, { mode: p.mode, shotAt: p.recoil ? now - 45 : undefined, speed: mps > 0 ? mps / scale : undefined }, now);
    }
    model.updateMatrixWorld(true);
    // 손 확대 — 두 손의 가운데(월드)를 본다
    const hm = new THREE.Vector3();
    const hr = new THREE.Vector3(); rig.armR[2].getWorldPosition(hr);
    const hl = new THREE.Vector3(); rig.armL[2].getWorldPosition(hl);
    hm.addVectors(hr, hl).multiplyScalar(0.5);
    const closeViews = close ? { closeQ34: [hm.x + 0.75, hm.y + 0.3, hm.z + 0.75], closeFront: [hm.x, hm.y + 0.15, hm.z + 1.0], closeSide: [hm.x - 1.0, hm.y + 0.15, hm.z + 0.1] } : {};
    for (const [name, at] of Object.entries({ ...views, ...closeViews })) {
      camera.position.set(at[0], at[1], at[2]);
      if (name.startsWith('close')) camera.lookAt(hm); else if (name === 'top') camera.lookAt(0, 1.3, 0); else camera.lookAt(0, 1.0, 0);
      renderer.render(scene, camera);
      outTiles.push({ label: `${p.label} · ${name}`, data: renderer.domElement.toDataURL('image/png') });
    }
  }
  return outTiles;
}, { threeUrl, modes, W, H, close, nPh, mps });
await browser.close();

const cols = 6;
const rows = Math.ceil(tiles.length / cols);
const comps = [];
for (let i = 0; i < tiles.length; i++) {
  const buf = Buffer.from(tiles[i].data.split(',')[1], 'base64');
  const label = Buffer.from(`<svg width="${W}" height="24"><rect width="${W}" height="24" fill="#000a"/><text x="6" y="17" font-size="14" fill="#fff" font-family="Helvetica">${tiles[i].label}</text></svg>`);
  const tile = await sharp(buf).composite([{ input: label, top: 0, left: 0 }]).png().toBuffer();
  comps.push({ input: tile, left: (i % cols) * W, top: Math.floor(i / cols) * H });
}
await sharp({ create: { width: cols * W, height: rows * H, channels: 3, background: '#000' } }).composite(comps).jpeg({ quality: 85 }).toFile(out);
console.log('saved', out, tiles.length, 'tiles');

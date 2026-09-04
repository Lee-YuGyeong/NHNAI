// 군인 넷의 얼굴을 **정면 직교 투영**으로 찍는다 — 눈 중심을 자로 재기 위해서 (src/world/avatar/blink.ts 의 EYES 표).
//   node tools/soldier-eye-shot.mjs      (dev 서버 5173. 결과 soldier-eyes.jpg — 몸마다 480×480, 2×2)
// 프레임은 고정: x −0.12~0.12 · y 0.75~0.99 (모델 단위, 키 ≈0.979). 픽셀 → 모델: x = −0.12 + px/480·0.24, y = 0.99 − py/480·0.24.
import { chromium } from '/Users/nowonsang/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { createRequire } from 'node:module';
const sharp = createRequire('/Users/nowonsang/Who-is-human/package.json')('sharp');
const IDS = ['sol_heavy_m', 'sol_heavy_f', 'sol_fit_f', 'sol_fit_m'];
const W = 480;
// MARK=1 이면 blink.ts 의 EYES 자리에 빨간 점을 찍고 눈을 감긴다(모프 영향 1) — 표가 맞는지 같은 프레임에서 본다
const MARK = process.env.MARK === '1';
// ZOOM=1 이면 눈 언저리만 크게 (x −0.06~0.06 · y 0.85~0.92) — 감긴 정도를 본다. NOMARK=1 이면 점 없이 모프만
const ZOOM = process.env.ZOOM === '1';
const NOMARK = process.env.NOMARK === '1';
// BLINKSCALE=10 이면 델타를 열 배 — 모프가 적용되는지 확인용
const SCALE = Number(process.env.BLINKSCALE ?? 1);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--headless=new'] });
const page = await browser.newPage({ viewportSize: { width: W, height: ZOOM ? Math.round(W * 7 / 12) : W } });
page.on('console', (m) => { if (m.text().startsWith('sol_')) console.log(m.text()); });
await page.goto('http://localhost:5173/');
const out = await page.evaluate(async ([ids, W, MARK, ZOOM, NOMARK, SCALE]) => {
  const blinkMod = MARK ? await import('/src/world/avatar/blink.ts') : null;
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const { MeshoptDecoder } = await import('/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js');
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = ZOOM ? Math.round(W * 7 / 12) : W; document.body.appendChild(canvas);
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); r.setClearColor('#2b3040');
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const res = {};
  for (const id of ids) {
    const g = await loader.loadAsync(`/world/soldier/${id}.glb`);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff', '#889', 2.4));
    const d = new THREE.DirectionalLight('#fff', 1.2); d.position.set(0, 1, 3); scene.add(d);
    if (MARK) g.scene.traverse((o) => { if (!o.isSkinnedMesh) return; const pa = o.geometry.getAttribute('position'); const n = pa.count; const flat = new Float32Array(n * 3); for (let i = 0; i < n; i++) { flat[i * 3] = pa.getX(i); flat[i * 3 + 1] = pa.getY(i); flat[i * 3 + 2] = pa.getZ(i); } const bone = o.skeleton.bones[0]; const T = new THREE.Matrix4().multiplyMatrices(o.bindMatrixInverse, new THREE.Matrix4().multiplyMatrices(bone.matrixWorld, o.skeleton.boneInverses[0])).multiply(o.bindMatrix); const space = { scale: T.elements[0], offset: [T.elements[12], T.elements[13], T.elements[14]] }; const m = blinkMod.buildBlinkMorph(flat, n, blinkMod.EYES[id] ?? [], space); o.geometry.morphTargetsRelative = true; if (SCALE !== 1) for (let i = 0; i < m.delta.length; i++) m.delta[i] *= SCALE; o.geometry.morphAttributes.position = [new THREE.BufferAttribute(m.delta, 3)]; o.updateMorphTargets(); o.morphTargetInfluences[0] = 1; if (!NOMARK) for (const e of m.eyes) { const sp = new THREE.Mesh(new THREE.SphereGeometry(0.003, 8, 8), new THREE.MeshBasicMaterial({ color: '#ff2020' })); sp.position.set(e[0] * space.scale + space.offset[0], e[1] * space.scale + space.offset[1], e[2] * space.scale + space.offset[2] + 0.08); g.scene.add(sp); } console.log(id, JSON.stringify(m.eyes.map((e) => e.map((v) => +v.toFixed(3))))); });
    scene.add(g.scene);
    // 눈금: 0.02 마다 가는 선 (픽셀 40)
    const grid = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: '#ff4040', transparent: true, opacity: 0.35 });
    for (let x = -0.12; x <= 0.1201; x += 0.02) grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0.75, 0.5), new THREE.Vector3(x, 0.99, 0.5)]), mat));
    for (let y = 0.75; y <= 0.9901; y += 0.02) grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.12, y, 0.5), new THREE.Vector3(0.12, y, 0.5)]), mat));
    scene.add(grid);
    // 직교 프러스텀은 카메라 축 기준 오프셋이다 — lookAt 으로 기울이지 않고 -z 를 그대로 본다 (기울이면 프레임이 어긋나 빈 화면)
    const cam = ZOOM ? new THREE.OrthographicCamera(-0.06, 0.06, 0.92, 0.85, 0.01, 10) : new THREE.OrthographicCamera(-0.12, 0.12, 0.99, 0.75, 0.01, 10); cam.position.set(0, 0, 2);
    r.render(scene, cam);
    res[id] = canvas.toDataURL('image/jpeg', 0.9);
    scene.clear();
  }
  return res;
}, [IDS, W, MARK, ZOOM, NOMARK, SCALE]);
const TH = ZOOM ? Math.round(W * 7 / 12) : W;
const tiles = await Promise.all(IDS.map(async (id, i) => ({ input: await sharp(Buffer.from(out[id].split(',')[1], 'base64')).toBuffer(), left: (i % 2) * W, top: Math.floor(i / 2) * TH })));
await sharp({ create: { width: W * 2, height: TH * 2, channels: 3, background: '#2b3040' } }).composite(tiles).jpeg({ quality: 88 }).toFile('soldier-eyes.jpg');
console.log('saved soldier-eyes.jpg (order: heavy_m, heavy_f / fit_f, fit_m)');
await browser.close();

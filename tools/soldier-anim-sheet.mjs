// 군인 아바타 넷(public/world/soldier)의 클립을 눈으로 확인한다 — 몸마다 walk 2장 · run · jump · agree · angry 한 장씩 여섯 장을 한 줄로.
//   node tools/soldier-anim-sheet.mjs [id ...]      (dev 서버 5173 이 떠 있어야 한다. 결과는 soldier-anim.jpg)
// cast-walk-sheet.mjs 와 같은 방식. 발이 바닥 격자에 붙는지, 팔·다리가 다 움직이는지를 본다.
import { chromium } from '/Users/nowonsang/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { createRequire } from 'node:module';
const sharp = createRequire('/Users/nowonsang/Who-is-human/package.json')('sharp');
const ids = process.argv.slice(2);
const IDS = ids.length > 0 ? ids : ['sol_heavy_m', 'sol_heavy_f', 'sol_fit_f', 'sol_fit_m'];
const FACE = process.env.FACE === '1';
// NONORMAL=1 이면 노멀맵을 떼고 본다 — 눈이 뭉개지는 것이 노멀맵 탓인지 가려낼 때
const NONORMAL = process.env.NONORMAL === '1';
// FACE=1 이면 얼굴 클로즈업 — 눈·입이 경량화에서 살아남았는지 본다 (2026-09-04 사용자: "눈이 깨져서 나오는데")
const SHOTS = FACE ? [['agree', 0], ['walk', 0.3]] : [['walk', 0.3], ['walk', 0.9], ['run', 0.4], ['jump', 0.9], ['agree', 1.5], ['angry', 1.0]];
const W = 360, H = 480;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--headless=new'] });
const page = await browser.newPage({ viewportSize: { width: W, height: H } });
await page.goto('http://localhost:5173/');
const out = await page.evaluate(async ([ids, SHOTS, W, H, FACE, NONORMAL]) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const { MeshoptDecoder } = await import('/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js');
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; document.body.appendChild(canvas);
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); r.setClearColor('#2b3040');
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const res = {};
  for (const id of ids) {
    const g = await loader.loadAsync(`/world/soldier/${id}.glb`);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff', '#446', 2.2));
    const d = new THREE.DirectionalLight('#fff', 2); d.position.set(2, 3, 4); scene.add(d);
    if (NONORMAL) g.scene.traverse((o) => { if (o.material) { o.material.normalMap = null; o.material.needsUpdate = true; } });
    scene.add(g.scene);
    g.scene.updateMatrixWorld(true);
    const box = new THREE.Box3(); let skinned = false;
    g.scene.traverse((o) => { if (!o.isSkinnedMesh) return; o.computeBoundingBox(); skinned = true; box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); });
    if (!skinned) box.setFromObject(g.scene);
    const h = box.max.y - box.min.y; const s = 1.72 / h;
    g.scene.scale.setScalar(s); g.scene.position.y = -box.min.y * s;
    scene.add(new THREE.GridHelper(4, 8, '#8899bb', '#55607a'));
    const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 100); if (FACE) { cam.position.set(0.25, 1.62, 0.75); cam.lookAt(0, 1.58, 0); } else { cam.position.set(2.6, 1.5, 3.2); cam.lookAt(0, 0.85, 0); }
    res[id] = { views: [], anims: g.animations.map((a) => a.name), h, min: box.min.y, size: [box.max.x - box.min.x, h, box.max.z - box.min.z] };
    for (const [name, t] of SHOTS) {
      const clip = g.animations.find((c) => c.name.includes(`:${name}`));
      const mixer = new THREE.AnimationMixer(g.scene);
      if (clip) { mixer.clipAction(clip).play(); mixer.update(t); }
      r.render(scene, cam);
      res[id].views.push(canvas.toDataURL('image/jpeg', 0.86));
      mixer.stopAllAction();
    }
    scene.clear();
  }
  return res;
}, [IDS, SHOTS, W, H, FACE, NONORMAL]);
const rows = [];
for (const id of IDS) {
  const v = out[id];
  console.log(id, JSON.stringify({ anims: v.anims, h: +v.h.toFixed(3), min: +v.min.toFixed(3), size: v.size.map((x) => +x.toFixed(3)) }));
  const cols = await Promise.all(v.views.map((u) => sharp(Buffer.from(u.split(',')[1], 'base64')).toBuffer()));
  rows.push(await sharp({ create: { width: W * SHOTS.length, height: H, channels: 3, background: '#2b3040' } }).composite(cols.map((b, i) => ({ input: b, left: i * W, top: 0 }))).jpeg().toBuffer());
}
await sharp({ create: { width: W * SHOTS.length, height: H * rows.length, channels: 3, background: '#2b3040' } }).composite(rows.map((b, i) => ({ input: b, left: 0, top: i * H }))).jpeg({ quality: 80 }).toFile(FACE ? 'soldier-face.jpg' : 'soldier-anim.jpg');
console.log('saved', FACE ? 'soldier-face.jpg' : 'soldier-anim.jpg');
await browser.close();

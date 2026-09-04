// 시나리오 2 개체 열의 **걸음**을 확인한다 — 몸마다 walk 클립을 t 초 지점에서 넉 장 찍어 한 장으로 붙인다.
//   node tools/cast-walk-sheet.mjs [id ...]      (dev 서버 5173 이 떠 있어야 한다. 결과는 cast-walk.jpg)
// 뼈를 나중에 넣은 몸(tools/scenario2-cast-rig.sh)이 제대로 걷는지, 발이 바닥에 붙는지를 눈으로 본다.
import { chromium } from '/Users/nowonsang/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { createRequire } from 'node:module';
const sharp = createRequire('/Users/nowonsang/Who-is-human/package.json')('sharp');

const ids = process.argv.slice(2);
const IDS = ids.length > 0 ? ids : ['s2_u104', 's2_u089', 's2_u012', 's2_u201', 's2_u063', 's2_u118', 's2_u137', 's2_guard21', 's2_seer', 's2_leader'];

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=metal', '--headless=new'],
});
const page = await browser.newPage({ viewportSize: { width: 420, height: 520 } });
await page.goto('http://localhost:5173/');

const out = await page.evaluate(async (ids) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const { MeshoptDecoder } = await import('/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js');
  const canvas = document.createElement('canvas');
  canvas.width = 420;
  canvas.height = 520;
  document.body.appendChild(canvas);
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  r.setClearColor('#2b3040');
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const res = {};
  for (const id of ids) {
    const g = await loader.loadAsync(`/world/cast2/${id}.glb`);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff', '#446', 2.2));
    const d = new THREE.DirectionalLight('#fff', 2);
    d.position.set(2, 3, 4);
    scene.add(d);
    scene.add(g.scene);

    // 앱과 같은 방식으로 잰다 — 스키닝을 먹인 상자 (CastBody 의 fit)
    g.scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    let skinned = false;
    g.scene.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.computeBoundingBox();
      skinned = true;
      box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));
    });
    if (!skinned) box.setFromObject(g.scene);
    const h = box.max.y - box.min.y;
    const s = 1.72 / h;
    g.scene.scale.setScalar(s);
    g.scene.position.y = -box.min.y * s;

    const walk = g.animations.find((c) => c.name === 'preset:biped:walk');
    const mixer = new THREE.AnimationMixer(g.scene);
    if (walk) mixer.clipAction(walk).play();

    // 바닥 격자 — 발이 바닥에 붙었는지는 이것과 견줘야 보인다
    const grid = new THREE.GridHelper(4, 8, '#8899bb', '#55607a');
    scene.add(grid);

    const cam = new THREE.PerspectiveCamera(30, 420 / 520, 0.01, 100);
    cam.position.set(2.6, 1.5, 3.2);
    cam.lookAt(0, 0.85, 0);
    res[id] = { views: [], anims: g.animations.map((a) => a.name), h, min: box.min.y };
    let last = 0;
    for (const t of [0, 0.25, 0.5, 0.75]) {
      mixer.update(t - last);
      last = t;
      r.render(scene, cam);
      res[id].views.push(canvas.toDataURL('image/jpeg', 0.86));
    }
    scene.clear();
  }
  return res;
}, IDS);

const rows = [];
for (const id of IDS) {
  const v = out[id];
  console.log(id, JSON.stringify({ anims: v.anims, h: +v.h.toFixed(3), min: +v.min.toFixed(3) }));
  const cols = await Promise.all(v.views.map((u) => sharp(Buffer.from(u.split(',')[1], 'base64')).toBuffer()));
  rows.push(
    await sharp({ create: { width: 420 * 4, height: 520, channels: 3, background: '#2b3040' } })
      .composite(cols.map((b, i) => ({ input: b, left: i * 420, top: 0 })))
      .jpeg()
      .toBuffer(),
  );
}
await sharp({ create: { width: 420 * 4, height: 520 * rows.length, channels: 3, background: '#2b3040' } })
  .composite(rows.map((b, i) => ({ input: b, left: 0, top: i * 520 })))
  .jpeg({ quality: 82 })
  .toFile('cast-walk.jpg');
console.log('saved cast-walk.jpg');
await browser.close();

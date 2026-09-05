// 맵 GLB 부품을 dev 서버(5173)의 three 로 4방향 렌더해 한 장(glb-preview.jpg)으로 붙이고 치수·바닥 y 를 찍는다.
//   node tools/glb-preview.mjs [--dir world/corridor] <id> [id...]   (dev 서버가 떠 있어야 한다. 결과는 현재 폴더)
//   --dir 로 다른 폴더도 본다 — 예: --dir world/cast2 (시나리오 2 의 개체들)
// playwright·sharp 는 tools/local-deps.mjs 가 머신에 상관없이 찾아 준다 (playwright 는 프로젝트 의존성이 아니다).
import { CHROME, chromium, sharp } from './local-deps.mjs';
const S = process.cwd();
const argv = process.argv.slice(2);
const di = argv.indexOf('--dir');
const DIR = di >= 0 ? argv.splice(di, 2)[1] : 'world/corridor';
const ids = argv;
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=metal', '--headless=new'] });
const page = await browser.newPage({ viewportSize: { width: 512, height: 512 } });
await page.goto('http://localhost:5173/');
const shots = await page.evaluate(async ([ids, dir]) => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const { MeshoptDecoder } = await import('/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js');
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512; document.body.appendChild(canvas);
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); r.setClearColor('#334');
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const out = {};
  for (const id of ids) {
    const g = await loader.loadAsync(`/${dir}/${id}.glb`);
    const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight('#fff', '#446', 2)); const d = new THREE.DirectionalLight('#fff', 2); d.position.set(2, 3, 4); scene.add(d);
    scene.add(g.scene);
    const box = new THREE.Box3().setFromObject(g.scene); const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 100); const R = size.length() * 1.3;
    out[id] = { size: [size.x, size.y, size.z], min: [box.min.x, box.min.y, box.min.z], views: [] };
    for (const [ax, ay] of [[0, 0], [Math.PI / 2, 0], [Math.PI, 0], [0.7, 0.6]]) {
      cam.position.set(c.x + R * Math.sin(ax) * Math.cos(ay), c.y + R * Math.sin(ay), c.z + R * Math.cos(ax) * Math.cos(ay)); cam.lookAt(c); r.render(scene, cam);
      out[id].views.push(canvas.toDataURL('image/png'));
    }
  }
  return out;
}, [ids, DIR]);
await browser.close();
const tiles = []; let row = 0;
for (const id of ids) { console.log(id, JSON.stringify({ size: shots[id].size.map(v=>+v.toFixed(3)), min: shots[id].min.map(v=>+v.toFixed(3)) })); shots[id].views.forEach((d, i) => tiles.push({ input: Buffer.from(d.split(',')[1], 'base64'), left: i * 512, top: row * 512 })); row++; }
await sharp({ create: { width: 2048, height: 512 * ids.length, channels: 3, background: '#000' } }).composite(tiles).jpeg({ quality: 80 }).toFile(`${S}/glb-preview.jpg`);

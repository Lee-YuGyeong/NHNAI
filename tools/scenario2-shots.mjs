// 시나리오 2 의 방들을 헤드리스로 한 장씩 찍는다 (scenario2.jpg — 다섯 칸). dev 서버 5173 이 떠 있어야 한다.
//   node tools/scenario2-shots.mjs [--url http://localhost:5173] [--rooms corridor,rest,work,archive,window] [--pitch 0.05]
//                                  [--at x,z,yaw | --unit id [--dist 2] [--from deg]] [--out path.jpg] [--nohud]
// 방을 걸어서 옮길 수 없으므로 DEV 손잡이 window.__s2.jump(room) 로 갈아 끼운다 (features/world2/scenario2.ts).
// 카메라는 앱과 같은 three 인스턴스의 updateMatrixWorld 를 감싸 돌린다 — 포인터 잠금이 필요 없다.
// --at 은 근접 촬영: 카메라를 그 자리(눈높이 1.62)에 세우고 yaw(rad · 카메라 규약, 앞 = −z 라 yaw = atan2(−dx, −dz))로 돌린다 —
//   개체 하나를 2 m 에서 찍어 얼굴판·수선·자세를 확인하는 용도다. 방 입구 광각으로는 그게 안 보인다. --rooms 는 방 하나만 주면 된다.
// --unit 은 같은 근접 촬영을 **개체 이름으로**: Unit 의 그룹(name = id)을 씬에서 찾아 그것이 보는 쪽 --dist m 앞에 서서 마주 본다.
//   자리표가 바뀌어도 좌표를 다시 안 적는다. 걷는 것(guard21)은 그 순간의 자리라 다음 프레임엔 지나간다.
//   --from 은 정면에서 비껴 서는 각(도) — 벽을 보는 개체(u137 · leader · seer)는 정면 2 m 가 벽 속이라 60~90 도 옆에서 찍는다.
// --out 은 합성 파일 자리 — 기본은 cwd 의 scenario2.jpg (덮어쓴다).
// --open 은 나가는 문짝을 **열어 놓고** 찍는다 — 저장소(__s2.exitDoor)의 set 을 막고 true 로 고정한다. 이야기는 매 프레임 닫으려 들지만 손이 막혀 있다.
import { chromium } from '/Users/nowonsang/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { createRequire } from 'node:module';
const sharp = createRequire('/Users/nowonsang/Who-is-human/package.json')('sharp');

const S = process.cwd();
const argv = process.argv.slice(2);
const flag = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const rooms = (flag('--rooms') ?? 'corridor,rest,work,archive,window').split(',');
const pitch = Number(flag('--pitch') ?? 0.05);
const base = flag('--url') ?? 'http://localhost:5173';
const at = flag('--at')?.split(',').map(Number) ?? null;
const unit = flag('--unit') ?? null;
const dist = Number(flag('--dist') ?? 2);
const from = (Number(flag('--from') ?? 0) * Math.PI) / 180;
const out = flag('--out') ?? `${S}/scenario2.jpg`;
const openDoor = argv.includes('--open');
/** HUD·대화창·수첩을 숨긴다 — 몸(마모·수선·자세)을 볼 때는 판이 화면 절반을 가린다 */
const noHud = argv.includes('--nohud');

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=metal', '--headless=new', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewportSize: { width: 1280, height: 720 } });
let threeUrl = null;
page.on('request', (r) => {
  const u = r.url();
  if (!threeUrl && /\/node_modules\/\.vite\/deps\/three\.js/.test(u)) threeUrl = u;
});
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.text().slice(0, 200));
});
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));

await page.goto(`${base}/scenario2`);
await page.getByRole('button', { name: '들어간다' }).click();
await page.waitForSelector('canvas', { timeout: 30000 });
await page.waitForTimeout(9000);

await page.evaluate(async (u) => {
  const THREE = await import(u);
  window.__cam = null;
  const orig = THREE.Object3D.prototype.updateMatrixWorld;
  THREE.Object3D.prototype.updateMatrixWorld = function (f) {
    // 화면 카메라만 — 스포트라이트의 그림자 카메라도 PerspectiveCamera 라(aspect 1) 그걸 잡으면 자리 덮기가 빛으로 간다 (작업 구역에서 그랬다)
    if (this.isPerspectiveCamera && !this.__probe && Math.abs(this.aspect - 1280 / 720) < 0.05) window.__cam = this;
    if (this.isScene) window.__scene = this;
    if (window.__rot && this === window.__cam) {
      // yaw 를 먼저 돌리고 pitch — 순서가 XYZ 면 pitch 가 든 채로 yaw 를 돌려 수평이 기운다
      this.rotation.order = 'YXZ';
      this.rotation.set(window.__rot[0], window.__rot[1], 0);
    }
    // 근접 촬영 — LocalRig 이 프레임마다 쓰는 자리를 렌더 직전에 덮는다. 이야기(track)도 이 자리를 읽으니 곁 판정까지 그 자리 기준이다
    if (window.__pos && this === window.__cam) this.position.set(window.__pos[0], window.__pos[1], window.__pos[2]);
    return orig.call(this, f);
  };
}, threeUrl);

const bufs = [];
for (const room of rooms) {
  await page.evaluate((r) => window.__s2.jump(r), room);
  if (openDoor) {
    await page.evaluate(() => {
      const d = window.__s2.exitDoor;
      d.set(true);
      d.set = () => {};
      d.reset = () => {};
    });
  }
  await page.waitForTimeout(3500);
  const target = await page.evaluate(
    ({ p, a, u, d, f }) => {
      let at = a;
      if (u) {
        // 개체가 보는 방향 (sin h, cos h) 으로 d 앞 — 카메라의 앞은 (−sin yaw, −cos yaw) 라 마주 보려면 yaw = h
        const o = window.__scene?.getObjectByName(u);
        if (!o) return null;
        const h = o.rotation.y + f;
        at = [o.position.x + Math.sin(h) * d, o.position.z + Math.cos(h) * d, h];
      }
      window.__rot = [p, at ? at[2] : 0];
      window.__pos = at ? [at[0], 1.62, at[1]] : null;
      return at;
    },
    { p: pitch, a: at, u: unit, d: dist, f: from },
  );
  if (unit && !target) console.log('[shots] 개체를 못 찾았다:', unit);
  else if (unit) console.log('[shots]', unit, 'at', target.map((v) => v.toFixed(2)).join(','));
  await page.waitForTimeout(at || unit ? 1500 : 800);
  // 덮은 자리가 실제로 먹었나 — 안 먹으면(카메라를 못 잡았거나 다른 카메라) 여기서 드러난다
  if (at || unit)
    console.log(
      '[shots] cam',
      await page.evaluate(
        (u) => {
          const c = window.__cam;
          if (!c) return 'none';
          const o = u ? window.__scene?.getObjectByName(u) : null;
          const w = o ? o.getWorldPosition(o.position.clone()) : null;
          return `${[c.position.x, c.position.z].map((v) => v.toFixed(2)).join(',')} fov ${c.fov} zoom ${c.zoom}${w ? ` unit world ${[w.x, w.y, w.z].map((v) => v.toFixed(2)).join(',')} parents ${(() => { const ps = []; let q = o.parent; while (q) { ps.push(q.type + (q.name ? ':' + q.name : '')); q = q.parent; } return ps.join('>'); })()}` : ''}`;
        },
        unit,
      ),
    );
  if (noHud) await page.addStyleTag({ content: '.s2,[class^="s2-"],[class*=" s2-"],[class^="np"],[class*=" np"],[class*="dlg"],[class*="note"],[class*="Note"],.hud,[class*="hud"]{display:none!important}' });
  const b = await page.screenshot({ type: 'png' });
  bufs.push(b);
  const st = await sharp(b).stats();
  console.log(room, 'mean', st.channels.map((c) => c.mean.toFixed(1)).join(','));
}
await browser.close();

const tiles = await Promise.all(bufs.map((b) => sharp(b).resize(960, 540).toBuffer()));
await sharp({ create: { width: 1920, height: 540 * Math.ceil(bufs.length / 2), channels: 3, background: '#000' } })
  .composite(tiles.map((input, i) => ({ input, left: (i % 2) * 960, top: Math.floor(i / 2) * 540 })))
  .jpeg({ quality: 82 })
  .toFile(out);
console.log('saved', out);

// 3D 월드 맵을 헤드리스로 자동 입장해 정면·천장·왼쪽·오른쪽·뒤 다섯 방향을 찍는다 (shots.jpg 한 장 + front.jpg). 픽셀 평균도 찍는다.
//   node tools/world-shots.mjs [url] [--at x,y,z] [--views front,up,left,right,back] [--eval "js"] [--wait ms]
//   --eval 은 카메라를 잡은 뒤 페이지에서 실행한다 (예: window.__leader.play('aim')), --wait 만큼 기다렸다 찍는다
//   (dev 서버 5173 + 워커 8787 이 떠 있어야 한다. 결과는 현재 폴더. --at 은 카메라를 그 자리에 고정 — 부품을 가까이서 볼 때)
// 카메라는 앱과 같은 three 인스턴스(vite deps)의 updateMatrixWorld 를 감싸 돌린다 — 포인터 잠금이 필요 없다.
import { chromium } from '/Users/nowonsang/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { createRequire } from 'node:module';
const sharp = createRequire('/Users/nowonsang/Who-is-human/package.json')('sharp');
const S = process.cwd();
const argv = process.argv.slice(2);
const flag = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const url = argv.find((a) => a.startsWith('http')) || 'http://localhost:5173/world?code=123&nick=cl';
const at = flag('--at')?.split(',').map(Number) ?? null;
const only = flag('--views')?.split(',') ?? null;
const evalJs = flag('--eval') ?? null;
const waitMs = Number(flag('--wait') ?? 0);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--headless=new', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewportSize: { width: 1280, height: 720 } });
let threeUrl = null;
page.on('request', (r) => { const u = r.url(); if (!threeUrl && /\/node_modules\/\.vite\/deps\/three\.js/.test(u)) threeUrl = u; });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto(url);
await page.waitForSelector('canvas', { timeout: 30000 });
await page.waitForTimeout(9000);
console.log('three:', threeUrl);
await page.evaluate(async (threeUrl) => {
  const THREE = await import(threeUrl);
  window.__cam = null;
  const orig = THREE.Object3D.prototype.updateMatrixWorld;
  THREE.Object3D.prototype.updateMatrixWorld = function (f) { if (this.isPerspectiveCamera && !this.__probe) window.__cam = this; if (window.__rot && this === window.__cam) { this.rotation.set(window.__rot[0], window.__rot[1], 0); if (window.__at) this.position.set(window.__at[0], window.__at[1], window.__at[2]); } return orig.call(this, f); };
}, threeUrl);
if (at) await page.evaluate((a) => { window.__at = a; }, at);
if (evalJs) { await page.evaluate((js) => new Function(js)(), evalJs); }
if (waitMs) await page.waitForTimeout(waitMs);
const views0 = [['front', 0, 0], ['up', 0.95, 0], ['left', 0.1, Math.PI / 2], ['right', 0.1, -Math.PI / 2], ['back', 0, Math.PI]];
const views = only ? views0.filter((v) => only.includes(v[0])) : views0;
const bufs = [];
for (const [name, pitch, yaw] of views) {
  await page.evaluate(([p, y]) => { window.__rot = [p, y]; }, [pitch, yaw]);
  await page.waitForTimeout(700);
  const b = await page.screenshot({ type: 'png' });
  bufs.push(b);
  const st = await sharp(b).stats();
  console.log(name, 'mean', st.channels.map((c) => c.mean.toFixed(1)).join(','));
}
await browser.close();
const tiles = await Promise.all(bufs.map((b) => sharp(b).resize(960, 540).toBuffer()));
await sharp({ create: { width: 1920, height: 540 * Math.ceil(bufs.length / 2), channels: 3, background: '#000' } }).composite(tiles.map((input, i) => ({ input, left: (i % 2) * 960, top: Math.floor(i / 2) * 540 }))).jpeg({ quality: 82 }).toFile(`${S}/shots.jpg`);
await sharp(bufs[0]).jpeg({ quality: 88 }).toFile(`${S}/front.jpg`);
console.log('saved');

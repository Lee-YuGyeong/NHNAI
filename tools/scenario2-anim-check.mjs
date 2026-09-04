// 시나리오 2 의 개체가 **제자리에서 걷지 않는지** 헤드리스로 잰다. dev 서버 5173 이 떠 있어야 한다.
//   node tools/scenario2-anim-check.mjs [--url http://localhost:5173] [--rooms corridor,rest,central2,work,archive,window] [--sec 30]
// 방마다 __s2.jump 로 들어가 sec 초 동안 0.25 초마다 Unit 의 DEV 손잡이(window.__s2anim: id → {anim, speed, x, z})를 읽는다.
// 「걷기 클립이 0.5 초 내내 도는데 그 사이 **걸어간 거리**가 0.1 m 도 안 되는 표본」이 제자리걸음이다 — 0 이어야 한다.
// 끝점 거리가 아니라 경로 길이로 재고, 창 양 끝이 다 걷기 클립일 때만 센다 (아래 ★ — 다리 출발과 되돌아섬을 가짜로 잡던 자리).
import { chromium } from '/Users/nowonsang/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';

const argv = process.argv.slice(2);
const flag = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const rooms = (flag('--rooms') ?? 'corridor,rest,central2,work,archive,window').split(',');
const sec = Number(flag('--sec') ?? 30);
const base = flag('--url') ?? 'http://localhost:5173';

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=metal', '--headless=new', '--ignore-gpu-blocklist'],
});
let bad = 0;
for (const room of rooms) {
  // 방마다 새 페이지 — 한 페이지에서 jump 를 이어 가면 앞 방의 개체가 남거나 씬이 안 갈리는 일이 있었다 (shots 도구도 한 번에 한 방이다)
  const page = await browser.newPage({ viewportSize: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => {
    const t = String(e);
    if (!/pointer lock/i.test(t)) console.log('[pageerror]', t.slice(0, 200));
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !/pointer lock/i.test(m.text())) console.log('[console]', m.text().slice(0, 200));
  });
  await page.goto(`${base}/scenario2`);
  await page.getByRole('button', { name: '들어간다' }).click();
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForTimeout(8000);
  await page.evaluate((r) => window.__s2.jump(r), room);
  // 앞 방의 몸은 언마운트가 제 손잡이를 지운다(Unit.tsx) — 암전(700 ms) 뒤에 한 번 더 비워 그 사이 마지막 프레임이 남지 않게
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    window.__s2anim = {};
  });
  await page.waitForTimeout(2000);
  const seen = await page.evaluate(() => ({ room: window.__s2.get?.().room, ids: Object.keys(window.__s2anim ?? {}) }));
  console.log(`  ${room}: 방 ${seen.room} · 개체 ${seen.ids.length} (${seen.ids.join(' ')})`);
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < sec * 1000) {
    samples.push(await page.evaluate(() => ({ t: performance.now(), u: JSON.parse(JSON.stringify(window.__s2anim ?? {})) })));
    await page.waitForTimeout(250);
  }
  let walk = 0;
  let idle = 0;
  let inPlace = 0;
  const culprits = new Map();
  for (let i = 2; i < samples.length; i += 1) {
    for (const [id, u] of Object.entries(samples[i].u)) {
      if (u.anim === 'walk') walk += 1;
      else idle += 1;
      /*
       * 제자리걸음 — 걷기 클립이 도는데 **실제로 나아간 거리**가 0.1 m 도 안 되는 표본.
       *
       * ★ 2026-09-03: 세는 법을 두 군데 고쳤다. 예전에는 0.5 초 전 자리와 **끝점 거리**만 봤고,
       *   그러면 실제로 잘 걷는 몸이 두 가지 자리에서 가짜로 걸렸다 (헤드리스로 스물한 몸을 40 초 돌려 확인):
       *     ① **다리를 막 출발한 프레임** — 직전 0.5 초는 서 있던 시간이라 끝점 거리가 작을 수밖에 없다
       *        (u201 · bg-rest-13 · bg-rest-16 이 여기 걸렸다. 셋 다 prev.anim 이 idle 이었다).
       *     ② **짧은 다리의 되돌아서는 지점** — 1.2 m 를 오가는 검문 앞줄 둘(bg-c2-044 · 128)은 0.25 초 나갔다
       *        0.25 초 돌아오면 끝점이 제자리다. 걷기 클립은 내내 돌고 발도 내내 나갔는데 끝점 거리는 4 mm 였다.
       *   둘 다 몸이 화면에서 **잘 걷고 있는데** 잡힌 것이라 이 검사가 늘 빨간불이었고, 그러면 정말로 멎은 몸이
       *   생겨도 그 빨간불에 파묻힌다. 그래서:
       *     · 끝점 거리 대신 **경로 길이**(표본 사이 걸음의 합)를 잰다 — 되돌아선 몸은 길이가 그대로 남는다.
       *     · 창 **양 끝이 다 걷기 클립**일 때만 센다 — 출발 프레임은 애초에 안 든다.
       *   막혀서 발만 구르는 몸은 경로 길이가 0 이라 여전히 잡힌다: 느슨해진 게 아니라 **뜻대로 세는** 것이다.
       */
      const prev = samples[i - 2].u[id];
      const mid = samples[i - 1].u[id];
      if (u.anim === 'walk' && prev?.anim === 'walk' && mid) {
        const travel = Math.hypot(mid.x - prev.x, mid.z - prev.z) + Math.hypot(u.x - mid.x, u.z - mid.z);
        if (travel < 0.1) {
          inPlace += 1;
          culprits.set(id, (culprits.get(id) ?? 0) + 1);
        }
      }
    }
  }
  bad += inPlace;
  console.log(`${room}: walk ${walk} · idle ${idle} · 제자리걸음 ${inPlace}${culprits.size ? ' ' + JSON.stringify(Object.fromEntries(culprits)) : ''}`);
  await page.close();
}
await browser.close();
console.log(bad === 0 ? '✓ 제자리걸음 없음' : `✗ 제자리걸음 표본 ${bad}`);
process.exit(bad === 0 ? 0 : 1);

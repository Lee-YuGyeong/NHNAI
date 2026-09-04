// DIRECTOR 판(features/world/DirectorHud.tsx)을 헤드리스로 확인한다 — 문답을 열고, 답을 치고, 두 장면을 찍는다.
//   node tools/director-shot.mjs ["내가 칠 답"] ["미리 해 둔 말"]
// 두 번째 인자를 주면 그 말을 기록에 먼저 심는다 — **대질**(관련 기록 줄)이 나오는지 보려면 이게 있어야 한다.
//   → director-waiting.png (감독이 읽는 중) · director-verdict.png (판정)
// dev 서버 5173 이 떠 있어야 한다. 판정은 실제 /api/world/direct 를 탄다 (개발 서버는 구독이라 과금 없음).
import { chromium } from '/Users/nowonsang/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';

const answer = process.argv[2] ?? '아 그냥… 좀 긴장돼서요. 제가 뭘 잘못했나요?';
const prior = process.argv[3] ?? null;
const url = 'http://localhost:5173/recheck?code=123&nick=cl';

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-angle=metal', '--headless=new', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewportSize: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto(url);
await page.waitForSelector('canvas', { timeout: 30000 });
await page.waitForTimeout(9000);

// 표식까지 걸어가지 않고 문답을 연다 → 질문이 걸리면 답한다
await page.evaluate(({ text, prior }) => {
  if (prior) {
    window.__dossier.at('복도');
    window.__dossier.say(prior);
    window.__dossier.at('재검실');
  }
  const c = window.__chapter3;
  c.beginQuestioning();
  const t = setInterval(() => {
    if (c.get().pending) {
      clearInterval(t);
      c.answerText(text);
    }
  }, 250);
}, { text: answer, prior });

// 질문 → 답 → 감독이 읽는 중
await page.waitForFunction(() => document.querySelector('.dhud__wait'), null, { timeout: 30000 });
await page.waitForTimeout(400);
await page.screenshot({ path: 'director-waiting.png' });
console.log('· 감독이 읽는 중 → director-waiting.png');

// 판정
await page.waitForFunction(() => document.querySelector('.dhud__verdict'), null, { timeout: 30000 });
await page.waitForTimeout(300);
await page.screenshot({ path: 'director-verdict.png' });

const shown = await page.evaluate(() => {
  const q = (s) => document.querySelector(s)?.textContent?.trim() ?? null;
  return {
    질문: q('.dhud__q'),
    답: q('.dhud__a'),
    허용: [...document.querySelectorAll('.dhud__move.on')].map((e) => e.textContent),
    거른것: [...document.querySelectorAll('.dhud__move.off')].map((e) => e.textContent),
    선택: q('.dhud__verdict'),
    사유: q('.dhud__why'),
    관련기록: q('.dhud__cite'),
    바닥: q('.dhud__foot'),
  };
});
console.log('· 판정 → director-verdict.png');
console.log(shown);
await browser.close();

/**
 * 화면 한 판이 프레임을 얼마나 먹는지 잰다 — 「끊긴다」를 눈이 아니라 숫자로 본다.
 *
 *   node tools/frame-cost.mjs <url> [초] [--wait "화면에 뜰 글"]
 *
 * 재는 자리는 **GL 층**이다: 드로우콜·삼각형은 draw* 호출을 세고, 셰이더 링크와 텍스처 올리기는
 * linkProgram·texImage2D 를 세고, 그리기 버퍼를 다시 만드는 것은 canvas.width 에 값이 들어가는
 * 순간을 잡는다 (setSize 는 여기로 드러난다 — 한 번에 수백 ms 를 먹을 수 있다).
 * 프레임 간격은 수직동기를 풀고 잰다 — 60fps 로 묶여 있으면 **여유가 얼마나 남았는지** 안 보인다.
 *
 * 긴 프레임 줄이 이 도구의 핵심이다. 중앙값이 좋아도 그중 한 번이 0.5초면 사람은 그것만 기억한다.
 * (dev 서버 5173 + 워커 8787 이 떠 있어야 한다)
 */
import { CHROME, chromium } from './local-deps.mjs';

const argv = process.argv.slice(2);
const url = argv.find((a) => a.startsWith('http'));
if (!url) {
  console.error('쓰기: node tools/frame-cost.mjs <url> [초] [--wait "글"]');
  process.exit(2);
}
const seconds = Number(argv.find((a) => /^\d+$/.test(a)) ?? 20);
const waitText = argv[argv.indexOf('--wait') + 1] && argv.includes('--wait') ? argv[argv.indexOf('--wait') + 1] : null;

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=metal', '--headless=new', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const page = await browser.newPage({ viewportSize: { width: 1280, height: 720 } });
await page.addInitScript(() => {
  const gl = { calls: 0, tris: 0, progs: 0, texs: 0 };
  window.__m = { gl, frames: [], long: [], resize: [] };
  for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    for (const k of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const orig = P[k];
      if (!orig) continue;
      P[k] = function (mode, a, b) {
        gl.calls += 1;
        gl.tris += (k.startsWith('drawElements') ? a : b) / 3;
        return orig.apply(this, arguments);
      };
    }
    for (const k of ['linkProgram', 'texImage2D']) {
      const orig = P[k];
      if (!orig) continue;
      P[k] = function (...a) {
        gl[k === 'linkProgram' ? 'progs' : 'texs'] += 1;
        return orig.apply(this, a);
      };
    }
  }
  const w = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
    get() { return w.get.call(this); },
    set(v) {
      // 화면에 붙은 캔버스만 — 텍스처를 그리려고 만든 캔버스(문서 밖)는 버퍼 다시 만들기가 아니다
      if (this.isConnected) window.__m.resize.push({ t: Math.round(performance.now()), v });
      return w.set.call(this, v);
    },
    configurable: true,
  });
  let prev = 0;
  let mark = { ...gl };
  const tick = (t) => {
    if (prev) {
      const dt = t - prev;
      window.__m.frames.push({ dt, calls: gl.calls, tris: gl.tris });
      if (dt > 40) window.__m.long.push({ at: Math.round(t), ms: Math.round(dt), progs: gl.progs - mark.progs, texs: gl.texs - mark.texs });
    }
    mark = { ...gl };
    gl.calls = 0;
    gl.tris = 0;
    prev = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const t0 = Date.now();
await page.goto(url);
await page.waitForSelector('canvas', { timeout: 30000 });
const canvasAt = Date.now() - t0;
if (waitText) await page.waitForFunction((s) => document.body.innerText.includes(s), waitText, { timeout: 45000 });
await page.waitForTimeout(seconds * 1000);
const m = await page.evaluate(() => ({ ...window.__m, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0 }));
await browser.close();

// 마지막 4초를 「자리 잡은 뒤」로 본다 — 앞은 부품을 받고 세우는 동안이다
const settled = m.frames.slice(-240);
const dts = settled.map((f) => f.dt).sort((a, b) => a - b);
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;
const avg = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
console.log(`${url}\n  캔버스까지 ${canvasAt}ms · 모두 ${m.frames.length} 프레임 / ${seconds}초`);
console.log(`  자리 잡은 뒤 프레임 중앙 ${q(dts, 0.5).toFixed(2)}ms (${(1000 / q(dts, 0.5)).toFixed(0)}fps) · p95 ${q(dts, 0.95).toFixed(2)}ms`);
console.log(`  드로우콜 ${avg(settled.map((f) => f.calls)).toFixed(0)} · 삼각형 ${(avg(settled.map((f) => f.tris)) / 1000).toFixed(0)}k · 셰이더 링크 ${m.gl.progs} · 텍스처 ${m.gl.texs} · JS 힙 ${m.heap}MB`);
console.log(`  그리기 버퍼 다시 만들기 ${m.resize.length}회${m.resize.length ? ': ' + m.resize.map((r) => `${r.t}ms→${r.v}px`).join(', ') : ''}`);
console.log('  긴 프레임(40ms 초과):');
for (const l of m.long) console.log(`    ${String(l.at).padStart(6)}ms 에 ${String(l.ms).padStart(4)}ms — 셰이더 링크 ${l.progs} · 텍스처 ${l.texs}`);

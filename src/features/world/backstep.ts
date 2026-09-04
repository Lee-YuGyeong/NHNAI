/**
 * 뒷걸음 판정기 — 센서가 모은 **한 장면**을 AI 에게 보여 주고 의심도를 정한다 (2026-08-30 사용자 설계).
 *
 *   sensor.ts (프레임) ──장면──▶ 여기 ──상황을 붙여──▶ POST /api/world/backstep (src/lab/backstep.ts) ──delta──▶ suspicion
 *
 * 장면만으로는 판정이 안 된다. "3초 동안 2m 물러섰다"가 회피인지 길을 비킨 것인지는 **그때 무슨 일이 있었나**가 정한다.
 * 그래서 여기서 무대(챕터 단계·목표)와 방금 있었던 일(굉음·검문·질문·봉쇄·추궁)을 붙여 보낸다.
 *
 * 늦게 오는 판정이다 (구독 개발 서버 기준 2~3초, 배포 워커는 그보다 짧다). 그동안 판이 멈추지 않게 **한 번에 하나만** 날아가고,
 * 기다리는 사이 들어온 장면은 **앞 장면에 합쳐** 두었다가 답이 오면 이어서 묻는다 — 길게 물러서는 동안 판정이 폴백으로 새지 않게.
 * 같은 상황이 반복되면 캐시가 답한다. 호출이 실패하면 거친 폴백(judgeBackstep)으로 친다.
 */

import { judgeBackstep, type BackstepRequest, type BackstepResponse } from '@/lab/backstep';
import { suspicion } from '@/world/mp/suspicion';
import { setBackstepJudge, type BackstepEpisode } from '@/world/mp/sensor';
import { sync } from '@/world/mp/sync';

import { chapter1 } from './chapter1';
import { chapter2 } from './chapter2';
import { dossier } from './dossier';
import { interrogation } from './interrogation';

/** 굉음처럼 "방금"이라고 부를 수 있는 시간 */
const RECENT_MS = 8000;
/** 판정이 너무 오래 걸리면 폴백으로 — 걷는 도중이라 무한정 기다릴 수 없다 */
const TIMEOUT_MS = 6000;
/** 같은 상황·같은 크기의 물러섬은 다시 묻지 않는다 (판정이 흔들리면 판이 이상해진다) */
const CACHE_MS = 90_000;
const CACHE_MAX = 24;

const cache = new Map<string, { at: number; verdict: BackstepResponse }>();
let inFlight = false;
/** 판정을 기다리는 동안 이어진 물러섬 — 하나로 합쳐 뒀다가 답이 오면 이어서 묻는다 */
let pending: BackstepEpisode | null = null;

/** 두 장면을 한 장면으로 — 시간·거리는 더하고, 개체는 처음 거리와 마지막 거리를 잇는다 */
function merge(a: BackstepEpisode, b: BackstepEpisode): BackstepEpisode {
  const watchers = a.watchers.map((w) => {
    const later = b.watchers.find((x) => x.kind === w.kind);
    return later ? { ...w, to: later.to, approaching: later.to < w.from - 0.3 } : w;
  });
  for (const w of b.watchers) if (!watchers.some((x) => x.kind === w.kind)) watchers.push(w);
  return { seconds: +(a.seconds + b.seconds).toFixed(2), meters: +(a.meters + b.meters).toFixed(2), watchers };
}
/** 개발·확인용 — 마지막 판정 */
let last: { req: BackstepRequest; verdict: BackstepResponse; source: 'llm' | 'cache' | 'fallback' } | null = null;

/** 지금 무대 한 줄 — 챕터 단계와 목표 */
function scene(): string {
  const c1 = chapter1.get();
  const c2 = chapter2.get();
  const where = c2.phase !== 'idle' && c2.phase !== 'done' ? `챕터2 ${c2.phase}` : `챕터1 ${c1.phase}`;
  return c1.objective ? `${where} — 목표: ${c1.objective}` : where;
}

/** 방금 있었던 일들 — 판정이 상황을 읽는 근거다 */
function recent(now: number): string[] {
  const out: string[] = [];
  const c1 = chapter1.get();
  const c2 = chapter2.get();
  if (c2.hold) out.push('전 개체 정지 명령이 내려져 있다 (움직이면 안 된다)');
  if (c2.pending) out.push(`질문을 받고 답을 기다리는 중이다 — ${c2.pending.hint}`);
  if (c2.guardTarget === 'player') out.push('검문 경비가 내 앞으로 오고 있다');
  else if (c2.guardTarget) out.push('검문 경비가 다른 개체를 검문하러 가는 중이다');
  if (c2.bang && now - c2.bang.at < RECENT_MS) out.push('옆에서 굉음이 났다 (아무도 반응하지 않는다)');
  if (c2.queue) out.push('검증실 앞에 줄이 서 있다 — 내 차례를 기다린다');
  if (c2.march) out.push('바닥 유도등이 켜지고 모두 먼 문으로 이동하는 중이다');
  if (c1.frozen) out.push('시설이 멈췄다 — 조명이 죽고 개체들이 정지했다');
  if (c1.sealed) out.push('경비가 출입구를 봉쇄했다');
  if (c1.staring) out.push('주변 개체가 전부 나를 보고 있다');
  const ph = interrogation.get().phase;
  if (ph === 'approach') out.push('경비 하나가 나를 추궁하러 걸어오는 중이다');
  else if (ph === 'wait' || ph === 'judge') out.push('경비의 질문에 답하는 중이다');
  if (interrogation.get().watch !== null) out.push('감시가 붙어 뒤를 따라다니고 있다');
  return out;
}

function keyOf(req: BackstepRequest): string {
  const w = req.watchers.map((x) => `${x.kind}${x.approaching ? '+' : '-'}${Math.round(x.to)}`).join(',');
  return `${req.scene}|${w}|${Math.round(req.seconds)}|${Math.round(req.meters)}|${req.recent.join(';')}`;
}

function apply(verdict: BackstepResponse): void {
  if (verdict.delta <= 0) return;
  suspicion.bump(verdict.delta, '뒷걸음');
  // 이 구역은 몸이 한 일도 기억한다 — 안쪽 검문의 감독이 말과 함께 읽는다 (dossier.ts)
  dossier.note(`물러섰다 — ${verdict.why || '회피'}`);
}

async function ask(req: BackstepRequest): Promise<BackstepResponse | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch('/api/world/backstep', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    return (await r.json()) as BackstepResponse;
  } catch {
    return null; // 폴백으로
  } finally {
    window.clearTimeout(timer);
  }
}

function remember(key: string, verdict: BackstepResponse, now: number): void {
  cache.set(key, { at: now, verdict });
  if (cache.size > CACHE_MAX) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

async function judge(ep: BackstepEpisode): Promise<void> {
  const now = performance.now();
  const req: BackstepRequest = {
    kind: 'backstep',
    ...ep,
    suspicion: suspicion.get().value,
    sync: sync.get().value,
    scene: scene(),
    recent: recent(now),
  };
  const key = keyOf(req);
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) {
    last = { req, verdict: hit.verdict, source: 'cache' };
    apply(hit.verdict);
    return;
  }
  // 이미 하나가 날아가 있다 — 버리지 말고 합쳐 둔다. 답이 오면 이어서 묻는다 (계속 물러서는 중이다)
  if (inFlight) {
    pending = pending ? merge(pending, ep) : ep;
    return;
  }
  inFlight = true;
  try {
    const res = await ask(req);
    const verdict = res ?? judgeBackstep(req);
    last = { req, verdict, source: res ? 'llm' : 'fallback' };
    if (res) remember(key, verdict, performance.now());
    apply(verdict);
  } finally {
    inFlight = false;
  }
  const next = pending;
  pending = null;
  if (next) await judge(next);
}

export const backstepJudge = {
  /** 센서에 붙는다 (WorldFeature 가 화면을 열 때). 떼는 함수를 돌려준다 */
  bind(): () => void {
    setBackstepJudge((ep) => {
      void judge(ep);
    });
    return () => setBackstepJudge(null);
  },
  /** 개발 확인용 — 마지막 판정 (헤드리스 스크립트가 읽는다) */
  last(): typeof last {
    return last;
  },
  reset(): void {
    cache.clear();
    last = null;
    inFlight = false;
    pending = null;
  },
};

/**
 * 감독이 무엇을 보고 무엇을 골랐나 — **판정 한 건의 기록** (2026-08-31, 해커톤 시연용으로 열었다).
 *
 * 여태 이 게임의 가장 좋은 부분은 화면에 안 보였다. 경비가 "아까는 4 구역이라고 했다"고 말할 때
 * 그게 **아무도 써 두지 않은 문장**이라는 걸 보는 사람은 알 방법이 없다 — 잘 만든 분기표와 구분되지 않는다.
 * 그래서 판정을 하나 열어 둔다: 헌법이 무엇을 허락했고(코드), 모델이 그중 무엇을 골랐고, 어떤 기록을 읽었고,
 * 사실 대조는 누가 했고, 폴백으로 샜는지 아닌지. 화면(DirectorHud)이 이걸 그대로 그린다.
 *
 * 순수 저장소다 (three·DOM·React 없음). direct.ts 가 묻기 직전에 `begin`, 답이 오면 `finish` 를 부른다.
 * 예전에 direct.ts 안에 있던 `directorLog.last()`(개발 확인용)가 이 파일로 옮겨 오면서 **구독**이 붙었다.
 */

import type { DirectorRequest } from '@/lab/director';

import type { DirectVerdict } from './direct';

export interface DirectorEntry {
  /** 부른 순서 (1부터) */
  id: number;
  /** 물어본 것 — 헌법이 거른 무브 목록·기록·사실 대조가 전부 여기 들어 있다 */
  req: DirectorRequest;
  /** 답. 아직 기다리는 중이면 null */
  verdict: DirectVerdict | null;
  /** 물어본 시각 (performance.now) */
  at: number;
  /** 판정에 걸린 시간(ms). 기다리는 중이면 null */
  ms: number | null;
  /** 판정 뒤 의심도 — 게이지가 어디로 갔는지 */
  after: number | null;
}

/** 화면에 남기는 개수 — 앞의 판정 몇 개를 작은 칩으로 보여 준다 */
const KEEP = 6;

const entries: DirectorEntry[] = [];
const listeners = new Set<() => void>();
let seq = 0;
/** 구독자에게 넘길 불변 배열 — useSyncExternalStore 가 같은 참조를 요구한다 */
let snapshot: readonly DirectorEntry[] = [];

function notify() {
  snapshot = entries.slice();
  for (const fn of listeners) fn();
}

export const directorLog = {
  /** 오래된 것부터. 마지막이 지금 것이다 */
  all(): readonly DirectorEntry[] {
    return snapshot;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** 개발·헤드리스 확인용 — 마지막 한 건 */
  last(): DirectorEntry | null {
    return entries[entries.length - 1] ?? null;
  },
  /** 물어본다 — 돌아온 id 를 finish 에 그대로 넘긴다 */
  begin(req: DirectorRequest): number {
    seq += 1;
    entries.push({ id: seq, req, verdict: null, at: performance.now(), ms: null, after: null });
    if (entries.length > KEEP) entries.splice(0, entries.length - KEEP);
    notify();
    return seq;
  },
  /** 답이 왔다. 그 사이 판이 리셋돼 그 줄이 사라졌으면 조용히 넘어간다 */
  finish(id: number, verdict: DirectVerdict, after: number): void {
    const e = entries.find((x) => x.id === id);
    if (!e) return;
    e.verdict = verdict;
    e.ms = Math.round(performance.now() - e.at);
    e.after = after;
    notify();
  },
  reset(): void {
    entries.length = 0;
    seq = 0;
    notify();
  },
};

/**
 * 대질의 근거로 보이는 기록 한 줄 — **모델이 인용했다고 주장하지 않는다.**
 * 감독의 대답과 겹치는 낱말(숫자·구역·식별번호)이 든 기록을 최근 것부터 찾을 뿐이다.
 * 화면은 이걸 「관련 기록」으로 띄운다: 그 한 줄이 있어야 "왜 저 말을 했는지"가 보인다.
 */
export function relatedLine(reply: string, dossier: readonly string[]): string | null {
  const keys = claimKeys(reply);
  if (!keys.length) return null;
  for (let i = dossier.length - 1; i >= 0; i -= 1) {
    const line = dossier[i];
    // 통행자가 **한 말**이 대질의 재료다. 관측(뒷걸음·명판)은 인용해도 뜻이 통하지 않는다
    if (!line.includes('통행자')) continue;
    if (keys.some((k) => line.includes(k))) return line;
  }
  return null;
}

/**
 * 대질에 쓸 만한 낱말만 — 숫자와, 조사를 뗀 한글 두 글자.
 * 한국어는 "구역을 / 구역이라고 / 구역에서" 처럼 꼬리가 붙어서 통째로 비교하면 절대 안 맞는다. 앞 두 글자로 자른다.
 * 대신 아무 데나 붙는 말(다시·기록·통과…)은 뺀다 — 그게 걸리면 판정과 무관한 줄이 「관련 기록」으로 올라간다.
 */
const NOISE = new Set(['다시', '말해', '기록', '통과', '확인', '대답', '질문', '아까', '지금', '여기', '이상', '없다', '맞다', '그건', '너는', '네가']);

function claimKeys(reply: string): string[] {
  const out: string[] = [];
  for (const t of reply.match(/[0-9]+|[가-힣A-Za-z][가-힣A-Za-z0-9-]*/g) ?? []) {
    if (/[0-9]/.test(t)) {
      out.push(t);
      continue;
    }
    if (t.length < 2) continue;
    const key = /[가-힣]/.test(t) ? t.slice(0, 2) : t;
    if (!NOISE.has(key)) out.push(key);
  }
  return out;
}

/**
 * 방송 길이 캡 — 소리로 나가는 문장만 자른다. 화면에 뜬 전문은 건드리지 않는다.
 *
 * 왜 필요한가: 리더 프롬프트의 길이 제약은 강제가 없는 문구뿐이라("방송할 문장 2개 이내",
 * "두세 문장 안에서") LLM 이 예사로 넘긴다. 라운드가 6~12초 단위로 넘어가는 게임에서
 * 방송 하나가 30초를 먹으면 다음 라운드 방송과 겹친다 (PLANNING §1.2a 무브 제약 `announce`).
 *
 * 자르는 자리는 **문장 끝**이다. 소리는 항상 끝난 문장에서 멎어야 한다 —
 * 말이 중간에 잘리면 사람은 자기가 못 들은 줄 알고 화면 대신 소리를 다시 기다린다.
 */
import type { BroadcastKind } from '@/shared/broadcast';

/**
 * 한국어 안내 방송 속도 근사 — 초당 5.5자(공백·문장부호 포함).
 * 초당 5~6음절이 안내 방송의 통상 속도이고, 지금 엔진의 rate 0.95 가 그 대역이다.
 * 샘플 '전 노드는 중앙 라인에 정렬한다. 신호에 맞춰 도약을 반복한다.'(33자)가 약 6초로 읽힌다.
 */
export const CHARS_PER_SEC = 5.5;

/**
 * 종류별 방송 예산(초).
 *
 * 이 값은 **폭주를 막는 천장**이지 문장을 다듬는 가위가 아니다. 리더가 쓰는 실제
 * 방송은 통째로 읽혀야 한다 — 지시문이 곧 게임인 /arena 에서는 특히 그렇다.
 *
 * 처음엔 §1.2b 의 라운드 슬롯(② 검사 제시 10초, ④ 판독 12초)을 그대로 예산으로 썼는데
 * 그건 **화면 단계의 길이**지 발화 길이가 아니었다. 80자짜리 지시문이 23자만 읽히는
 * 일이 실제로 났다. 이제는 한 방송이 다음 페이즈를 잡아먹지 않을 선(§1.2b 응답 35초 ·
 * 통신 50초)에서 잡는다 — 그 안이면 문장은 몇 개든 다 읽는다.
 */
export const BUDGET: Record<BroadcastKind, number> = {
  announce: 30,
  readout: 20,
  alarm: 12,
};

/** 그 종류가 소리로 쓸 수 있는 글자 수 */
export function budgetChars(kind: BroadcastKind): number {
  return Math.round(BUDGET[kind] * CHARS_PER_SEC);
}

/**
 * 이 문장을 읽는 데 걸릴 시간(ms).
 *
 * 소리를 끈 채로 자막만 흐를 때 다음 방송으로 넘기는 시점이 된다. 위와 같은 속도를 쓰는
 * 이유는 **음소거해도 방송이 지나가는 박자가 같아야** 하기 때문이다 — 소리를 껐다고
 * 자막이 빨리 지나가면 같은 판을 보는 두 사람이 다른 속도로 게임을 하게 된다.
 *
 * 짧은 문장에도 바닥을 둔다. "경보." 같은 한 마디가 0.5초 만에 지나가면 읽을 새가 없다.
 */
export function speechMs(text: string): number {
  return Math.max(1200, Math.round((text.length / CHARS_PER_SEC) * 1000));
}

/**
 * 첫 문장부터 예산을 넘을 때 — 쉼표·중점, 없으면 낱말 경계에서 끊는다.
 * 예산의 3분의 1도 못 남길 만큼 앞에서만 끊긴다면 차라리 예산까지 그대로 쓴다.
 * 끊고 난 뒤 끝에 남은 쉼표는 떼어낸다 — 쉼표로 끝나는 방송은 말이 끊긴 것처럼 들린다.
 */
function clipClause(text: string, max: number): string {
  const head = text.slice(0, max);
  const cut = Math.max(head.lastIndexOf(','), head.lastIndexOf('·'), head.lastIndexOf(' '));
  const body = cut > max / 3 ? head.slice(0, cut) : head;
  return body.replace(/[\s,·]+$/, '').trim();
}

/** 소리로 내보낼 문장. 예산 안이면 공백만 정리해서 그대로 돌려준다 */
export function capForSpeech(text: string, kind: BroadcastKind): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const max = budgetChars(kind);
  if (clean.length <= max) return clean;

  let out = '';
  for (const sentence of clean.split(/(?<=[.!?])\s+/)) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > max) break;
    out = next;
  }
  return out || clipClause(clean, max);
}

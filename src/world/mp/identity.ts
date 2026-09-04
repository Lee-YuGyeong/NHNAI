/**
 * 내 몸의 식별 정보 — **조력자가 알려주지 않는다. 복도에서 내가 직접 읽어야 안다.**
 *
 * 2026-08-30 사용자 지적: "조력자가 시키는 대로 다 따라 하니까 정해진 느낌". 원인은 챕터 2 의 관문 둘(식별번호·정비 위치)의
 * 정답을 과학자가 그 자리에서 불러 준 것이다 — 플레이어는 판단하지 않고 받아쓰기만 했다. 그래서 정답을 **복도로 옮겼다**:
 *   복도(/world)의 정비 명판(Chapter1Scene.ServiceTag)을 들여다보면 이 몸의 식별번호와 마지막 정비 구역이 적혀 있다.
 *   읽었으면 known — 검문(roll)과 기억 검사(memory)를 통과할 수 있다. 안 읽고 지나쳤으면 **진짜로 모른다**.
 * 값은 방마다 무작위로 뽑는다 (한 번 외운 답을 다음 판에 그대로 쓰지 못하게).
 *
 * 2026-09-01 사용자 요구: **계열 번호(A-17 의 17)도 랜덤이다.** 다만 그건 이 몸의 사정이 아니라 **판 전체의 사정**이라
 * (첫 화면·복도·중앙 시설·아레나가 같은 계열이어야 한다) 값은 shared/series 가 판을 열 때 한 번 뽑는다.
 * 여기서는 그 계열에 뒤 세 자리를 붙여 이 몸의 번호를 만든다 — 방마다 다시 뽑히는 것은 그 뒤 세 자리와 정비 구역이다.
 *
 * 순수 저장소다 (three·DOM·React 없음). 서버로 가지 않는다 — 내 몸의 사정이다.
 */

import { withSeries } from '../../shared/series';

export interface Tag {
  /** 식별번호 — 검문의 답. 앞자리는 계열이 정하므로 `${series}` 로 비워 둔다 (A${series}-091) */
  unit: string;
  /** 마지막 정비 구역 — 기억 검사의 답 */
  sector: number;
}

export interface IdentityState {
  /** 식별번호 — 계열이 채워진 완성형 (계열이 38 인 판이면 A38-091) */
  unit: string;
  /** 마지막 정비 구역 */
  sector: number;
  /** 명판을 읽었나. 이걸 안 읽고 중앙 시설에 들어가면 두 관문의 답을 모른다 */
  known: boolean;
}

/** 이 몸이 될 수 있는 것들 — 방마다 하나를 뽑는다. 줄에 선 동료(-044·-128)와 겹치지 않는 번호 */
export const TAGS: readonly Tag[] = [
  { unit: 'A${series}-091', sector: 4 },
  { unit: 'A${series}-063', sector: 7 },
  { unit: 'A${series}-137', sector: 2 },
];

const SECTOR_WORDS: Record<number, RegExp> = {
  2: /\b2\b|둘|이\s*구역/,
  4: /\b4\b|넷|사\s*구역/,
  7: /\b7\b|일곱|칠\s*구역/,
};

const UNIT_SLOT = /\$\{unit\}/g;

const state: IdentityState = { unit: withSeries(TAGS[0].unit), sector: TAGS[0].sector, known: false };
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

export const identity = {
  get(): IdentityState {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** 새 방 — 몸을 다시 뽑고 아직 아무것도 모르는 상태로 */
  assign(tag = pick(TAGS)): void {
    Object.assign(state, { unit: withSeries(tag.unit), sector: tag.sector, known: false });
    emit();
  },
  /**
   * 대본·공지의 빈자리를 채운다 — `${series}` 는 이 판의 계열, `${unit}` 은 이 몸의 식별번호.
   * 치환은 **말이 나가기 직전 한 곳에서만** 한다: 대본 문자열이 그대로 음성 클립의 열쇠라(features/world/voice.ts),
   * 굽는 쪽(tools/voice-lines.mjs)과 트는 쪽이 같은 글자를 만들어야 소리가 붙는다.
   */
  fill(text: string): string {
    return withSeries(text).replace(UNIT_SLOT, state.unit);
  },
  /** 정비 명판을 읽었다 */
  reveal(): void {
    if (state.known) return;
    state.known = true;
    emit();
  },
  /**
   * 내 식별번호를 댔나. **부르는 모양은 가리지 않는다** — A38-091 이면 "A38-091" · "091" · "91" ·
   * "0 9 1" 이 전부 같은 답이다 (2026-09-01 사용자: 아무 모양으로나 불러도 되게). 앞의 0 은 있으나
   * 없으나 같은 값이라, 글자가 아니라 **수로** 견준다 — 그래야 "91" 도 맞고 "1091" 은 안 맞는다.
   */
  matchUnit(text: string): boolean {
    const keys = new Set([String(Number(state.unit.slice(-3))), String(Number(state.unit.replace(/\D/g, '')))]);
    for (const m of text.replace(/\s/g, '').matchAll(/\d+/g)) if (keys.has(String(Number(m[0])))) return true;
    return false;
  },
  /** 마지막 정비 구역을 댔나 */
  matchSector(text: string): boolean {
    return (SECTOR_WORDS[state.sector] ?? new RegExp(`\\b${state.sector}\\b`)).test(text);
  },
};

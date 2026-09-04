/**
 * 엿듣기 — **배회하는 둘이 스치며 주고받는 두 마디.** 대본 v7 OVERHEAR · D5.
 *
 * 벽의 그림을 안 본 판에도 어휘가 생기는 둘째 길이다: 복도를 오가는 이름 없는 것 둘이 스칠 때 「쉬었어?」 「…아직.」 하고
 * 지나가면, 그걸 들은 나에게 「쉼」이 말할 거리로 열린다(lexicon.open(kind,'overheard')). 그림은 들여다봐야 하지만 이건 지나가다 듣는다 —
 * 대신 **들리는 범위 안에 있어야** 한다: 방의 목격 반경(ROOM_RADIUS)이 그대로 듣는 반경이다. 기록 복도(0)에서는 아무것도 못 듣는다.
 *
 * ★ 순수 시계다. 누가 어디 있는지(positions)와 지금(now)을 받아 「스쳤다」를 판정하고, 말은 host 가 낸다 —
 *   렌더도 저장소도 모른다. 시험은 now 를 손으로 넘긴다 (performance.now 를 안 읽는다).
 * ★ 판당 OVERHEAR_RULE.perRun 번(3). 슬롯은 방마다 이야기(scenario2)가 짠다 — 언제(at) · 무슨 주제(kind) · 누가 둘(pair).
 *   주제는 아직 안 연 것을 먼저 (pickKind). 감독 살 붙임은 없다 — 골격 두 마디 그대로 (모델 0).
 * ★ 둘째 마디는 replyMs 뒤에 — 타이머가 아니라 다음 tick 이 낸다. 방을 나가면(schedule/reset) 그대로 사라진다.
 */

import type { ScrawlKind } from '@/features/world/scrawl';

import { OVERHEAR_RULE } from './corefield';
import type { Room } from './scenario2';
import { OVERHEAR } from './script';

export interface OverhearSlot {
  /** 이 시각(ms) 뒤에 스치면 낸다 */
  at: number;
  kind: ScrawlKind;
  /** 먼저 말하는 것 · 받는 것 */
  pair: readonly [string, string];
}

export interface OverhearHost {
  /** 그 개체의 줄로 한 마디 — DialogueBox 에 든다. 들리는 범위 안일 때만 불린다 */
  say(id: string, text: string): void;
  /** 두 마디를 다 들었다 — 주제를 연다 */
  heard(kind: ScrawlKind): void;
}

interface Pos {
  x: number;
  z: number;
}

/** 자리표 — scenario2 의 Map 이든 함수든 받는다 */
export type Positions = ReadonlyMap<string, Pos> | ((id: string) => Pos | null | undefined);

interface Slot extends OverhearSlot {
  fired: boolean;
}

let room: Room | null = null;
let slots: Slot[] = [];
let host: OverhearHost | null = null;
let count = 0;
/** 첫 마디는 냈고 둘째 마디를 기다리는 중 */
let pending: { b: string; text: string; kind: ScrawlKind; dueAt: number; heard: boolean } | null = null;

function posOf(positions: Positions, id: string): Pos | null {
  const p = typeof positions === 'function' ? positions(id) : positions.get(id);
  return p ?? null;
}

export const overhear = {
  bind(h: OverhearHost | null): void {
    host = h;
  },

  /** 방의 슬롯을 짠다 — 방이 바뀌면 앞 방의 것은 버린다. 판당 횟수(count)는 안 건드린다: 그건 reset 이 판 시작에서 지운다 */
  schedule(r: Room, list: readonly OverhearSlot[]): void {
    room = r;
    slots = list.map((s) => ({ ...s, fired: false }));
    pending = null;
  },

  /**
   * 프레임마다 — 둘이 서로 meetM 안에 들고 슬롯 시각이 지났으면 그 슬롯을 한 번 낸다.
   * 나–둘의 중점 거리가 radius 안이면 들린다(host.say 둘 + heard). 밖이면 둘은 말했고 나는 못 들은 것 — 슬롯은 그래도 쓴 것이다
   */
  tick(now: number, positions: Positions, me: Pos, radius: number): void {
    if (pending && now >= pending.dueAt) {
      const p = pending;
      pending = null;
      if (p.heard && host) {
        host.say(p.b, p.text);
        host.heard(p.kind);
      }
    }
    if (pending || count >= OVERHEAR_RULE.perRun) return;
    for (const s of slots) {
      if (s.fired || now < s.at) continue;
      const a = posOf(positions, s.pair[0]);
      const b = posOf(positions, s.pair[1]);
      if (!a || !b) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) > OVERHEAR_RULE.meetM) continue;
      s.fired = true;
      // 두 마디가 없는 주제(beating)는 스쳐도 말이 없다 — 슬롯만 지운다
      const lines = OVERHEAR[s.kind];
      if (!lines) continue;
      count += 1;
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      // 반경 0 인 방(기록 복도)은 붙어 있어도 안 들린다 — 아무도 안 듣는 방이다
      const heard = radius > 0 && Math.hypot(me.x - mid.x, me.z - mid.z) <= radius;
      if (heard && host) host.say(s.pair[0], lines[0]);
      pending = { b: s.pair[1], text: lines[1], kind: s.kind, dueAt: now + OVERHEAR_RULE.replyMs, heard };
      return;
    }
  },

  /** 이 판에서 낸 횟수 */
  count(): number {
    return count;
  },

  /** 아직 안 낸 슬롯이 남았나 — 이야기가 「더 짤까」를 물을 때 */
  remaining(): number {
    return Math.max(0, OVERHEAR_RULE.perRun - count);
  },

  /** 확인용 */
  room(): Room | null {
    return room;
  },

  /** 판 시작 — 횟수도 슬롯도 처음부터 */
  reset(): void {
    room = null;
    slots = [];
    pending = null;
    count = 0;
  },
};

/** 아직 안 연 주제를 먼저 — 전부 열렸으면 첫 후보. 이야기가 슬롯의 kind 를 고를 때 쓴다 (D5 「안 열린 주제 우선」) */
export function pickKind(candidates: readonly ScrawlKind[], opened: (kind: ScrawlKind) => boolean): ScrawlKind | null {
  if (candidates.length === 0) return null;
  return candidates.find((k) => !opened(k)) ?? candidates[0];
}

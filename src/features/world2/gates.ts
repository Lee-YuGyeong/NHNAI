/**
 * 판정 — **부작용이 없는 갈래들.** scenario2 가 「언제」를 정하고, 여기는 「어느 쪽인가」만 답한다.
 *
 * 중앙 시설의 검문 셋(roll · fear · memory)과 휴게 구역의 서성임, 재회·씨앗 슬롯 고르기, 소문 줄 고르기가 전부 여기 있다.
 * 값을 만지지 않는다(의심도 · 태도 · 경보 · 조각 어느 것도). 문자열과 수를 받아 갈래 이름을 돌려줄 뿐이라 시험이 숫자로 돌릴 수 있다 —
 * 사람이 죽는 판정(즉결 · bad)이 여기 있으므로 **모델을 안 부른다**: 재료(사실 대조 · 표지 · 조각)가 이미 다 있어서 모델이 할 일이 없다.
 *
 * ★ 문장 낱말 규칙은 read.ts 와 같은 정신이다 — 채점이 아니라 갈래 뽑기. 「아니」도 「없어」도 「모르겠는데」도 다 부정이어야 한다.
 */

import { CORE_CENTER, LOCKDOWN, type Vec2 } from './corefield';

/* ─────────────────────────────── 휴게 구역 — 서성임 ─────────────────────────────── */

/** 가만히 섰다고 볼 시간(ms)과, 그 자리에서 이만큼 벗어나면 서성인 것(m) — 락다운의 허용 이동(corefield.LOCKDOWN.holdM)과 **같은 값**이라 거기서 읽는다. 두 곳에 적지 않는다 */
export const STIR = { stillMs: 2000, driftM: LOCKDOWN.holdM } as const;

/**
 * 서성임 감지 — **가만히 섰던 자리**에서 0.6 m 넘게 벗어났나. 걷는 것 자체는 서성임이 아니다: 들어와서 자리를 잡으러 가는
 * 걸음까지 세면 첫 걸음부터 개체들이 쳐다본다. 2 초 넘게 선 자리가 생겨야 그 자리가 「내 자리」가 되고, 거기서 벗어나는 것이 서성임이다.
 * 한 번 잡으면 다음 자리를 잡을 때까지 다시 안 잡는다 — 한 걸음이 프레임마다 서성임이 되지 않게.
 */
export function stirDetector(opt: { stillMs?: number; driftM?: number } = {}) {
  const stillMs = opt.stillMs ?? STIR.stillMs;
  const driftM = opt.driftM ?? STIR.driftM;
  let stillSince: number | null = null;
  let stillPos: Vec2 | null = null;
  let anchor: Vec2 | null = null;
  return {
    /** 한 프레임. 서성임이 잡힌 프레임에만 true */
    feed(now: number, x: number, z: number, moving: boolean): boolean {
      if (!moving) {
        if (stillSince === null) {
          stillSince = now;
          stillPos = { x, z };
        } else if (now - stillSince >= stillMs && stillPos) anchor = stillPos;
        return false;
      }
      stillSince = null;
      stillPos = null;
      if (anchor && Math.hypot(anchor.x - x, anchor.z - z) > driftM) {
        anchor = null;
        return true;
      }
      return false;
    },
    reset(): void {
      stillSince = null;
      stillPos = null;
      anchor = null;
    },
  };
}

/* ─────────────────────────────── 조작권 — 「손을 댄 뒤」부터 세는 시계 ─────────────────────────────── */

/**
 * 조작권 시계 — **플레이어가 손을 대기 전에는 아무 시계도 안 돈다.**
 * 2026-09-03 사용자: 「대사가 내가 아무것도 안 했는데 트리거가 지혼자 발생한다」. 들어와서 12 초 · 6 초 · 90 초 같은 이야기의 시계가 전부
 * **방에 들어선 시각**에서 셌다 — 포인터 잠금도 안 잡고 화면만 보고 있어도 저쪽이 걸어와 말을 걸고, 문이 열리고, 소각로가 불렀다.
 * 이 시계는 첫 조작(포인터 잠금 · 첫 걸음 · Enter)에서 시작한다. 그 전에 건 것(after)은 줄을 서고, 손을 대는 순간 그때부터 센다.
 * 방의 첫마디(INTRO · ARRIVE)는 이걸 안 탄다 — 그건 방이 여는 말이지 나에게 일어나는 일이 아니다.
 *
 * 순수하다: 시각은 인자로 받고, 타이머는 run 콜백이 건다. ms 가 0 이거나 이미 지난 것은 **그 자리에서** 돈다(run 을 안 거친다) —
 * 「조작권부터 90 초」 같은 시계의 기준 시각을 잡는 데 쓰인다
 */
export function controlGate() {
  let at: number | null = null;
  const held: { ms: number; fn: () => void; kind: 'line' | 'cue' }[] = [];
  type Run = (ms: number, fn: () => void, kind: 'line' | 'cue') => void;
  const fire = (ms: number, fn: () => void, kind: 'line' | 'cue', run: Run) => {
    if (ms <= 0) fn();
    else run(ms, fn, kind);
  };
  return {
    /** 손을 댔나 */
    taken(): boolean {
      return at !== null;
    },
    /** 손을 댄 시각 — 아직이면 null */
    at(): number | null {
      return at;
    },
    /** 손을 댄 뒤 흐른 ms — 아직이면 −1 */
    since(now: number): number {
      return at === null ? -1 : now - at;
    },
    /** 손을 댔다 — 처음이면 true 를 돌려주고 줄 선 것들을 그 시각부터 건다. 두 번째부터는 아무것도 안 한다 */
    take(now: number, run: Run): boolean {
      if (at !== null) return false;
      at = now;
      for (const h of held.splice(0)) fire(h.ms, h.fn, h.kind, run);
      return true;
    },
    /** 손을 댄 시각부터 ms 뒤에 — 이미 댔으면 남은 만큼만 기다리고, 아직이면 줄을 선다 */
    after(ms: number, fn: () => void, now: number, run: Run, kind: 'line' | 'cue' = 'cue'): void {
      if (at === null) held.push({ ms, fn, kind });
      else fire(ms - (now - at), fn, kind, run);
    },
    /** 줄 선 것 수 — 시험 · 확인용 */
    pending(): number {
      return held.length;
    },
    /** 방을 옮겼다 — 시각도 줄도 처음부터 */
    reset(): void {
      at = null;
      held.length = 0;
    },
  };
}

/* ─────────────────────────────── 중앙 시설 — 슬롯 ─────────────────────────────── */

export interface SlotCandidate {
  id: string;
  /** 태도 −3..3 */
  stage: number;
  /** 말을 건 적이 있나 */
  met: boolean;
  agent: boolean;
  /** 이 개체가 든 내 조각 수 */
  fragments: number;
}

/**
 * 재회 슬롯 둘 · 씨앗 슬롯 둘 (레벨 설계 07 · 슬롯 표).
 *   재회  복도 · 휴게에서 말을 건 개체 — |태도| 가 큰 순. 원장이 생긴 것부터: 좋게든 나쁘게든 기억이 있는 얼굴이 먼저 와 있어야 재회가 값을 한다
 *   씨앗  재회에 안 뽑힌 것 중 내 조각을 든 개체 — 「내 어긋남을 본 개체를 코어권에」. 든 수가 많은 순
 * 요원(agent)은 어느 슬롯에도 안 선다 — 겉으로 구별되면 안 되는 것들이라 방을 따라다니면 그것만으로 표가 난다.
 * `fixed`(그 방의 고정 명부)와 `exclude`(리더 · 밖을 본 것 · 배경)는 뽑지 않는다. 빈 슬롯은 호출자가 배경 개체로 채운다
 */
export function pickSlots(input: {
  candidates: readonly SlotCandidate[];
  fixed: readonly string[];
  exclude: readonly string[];
  reunionN?: number;
  seedN?: number;
}): { reunion: string[]; seeds: string[] } {
  const reunionN = input.reunionN ?? 2;
  const seedN = input.seedN ?? 2;
  const ok = (c: SlotCandidate) => !c.agent && !input.fixed.includes(c.id) && !input.exclude.includes(c.id);
  const reunion = input.candidates
    .filter((c) => ok(c) && c.met)
    .sort((a, b) => Math.abs(b.stage) - Math.abs(a.stage))
    .slice(0, reunionN)
    .map((c) => c.id);
  const seeds = input.candidates
    .filter((c) => ok(c) && !reunion.includes(c.id) && c.fragments > 0)
    .sort((a, b) => b.fragments - a.fragments)
    .slice(0, seedN)
    .map((c) => c.id);
  return { reunion, seeds };
}

/* ─────────────────────────────── 중앙 시설 — 소문 ─────────────────────────────── */

/**
 * 소문 한 줄 고르기 (대본 RUMOR_ARRIVES). 출처가 지워졌으면 anon, 위로(「쉬」)를 거쳐 온 조각이면 comfort,
 * 동료 확인의 조각(topic '발화')이면 pair, 나머지는 strong — 차례가 곧 우선순위다: 출처 없음이 가장 먼저다
 */
export function rumorLine(f: { from: string | null; text: string; topic: string }): 'anon' | 'comfort' | 'pair' | 'strong' {
  if (f.from === null) return 'anon';
  if (/쉬/.test(f.text)) return 'comfort';
  if (f.topic === '발화') return 'pair';
  return 'strong';
}

/* ─────────────────────────────── 관문 ① roll ─────────────────────────────── */

export type RollGrade = 'ok' | 'okMarked' | 'unknown' | 'bad';

/**
 * 식별번호 대조. 재료는 셋 — 사실(matchUnit) · 표지(어투 흔들림 · 앞말과 어긋난 숫자) · 명판을 읽었나(known).
 *   맞다 · 표지 없음      ok
 *   맞다 · 표지 있음      okMarked (escort)
 *   번호를 못 댔다        unknown — 한 번만 봐준다. 두 번째(secondUnknown)면 bad
 *   다른 번호 · 적대      bad — 즉결
 * 맞는 번호를 대면 명판을 안 읽었어도 맞다 — 잠금장치가 아니다(어휘와 같은 규칙). 안 읽은 판은 대개 번호를 모를 뿐이다
 */
export function gradeRoll(i: {
  text: string;
  known: boolean;
  matchUnit: boolean;
  wobble: number;
  lieTag: boolean;
  crossTag: boolean;
  secondUnknown: boolean;
}): RollGrade {
  if (i.crossTag) return 'bad';
  if (i.matchUnit) return i.wobble > 0 || i.lieTag ? 'okMarked' : 'ok';
  const gaveNumber = /\d/.test(i.text);
  if (!i.known || !gaveNumber) return i.secondUnknown ? 'bad' : 'unknown';
  return 'bad';
}

/* ─────────────────────────────── 관문 ② fear ─────────────────────────────── */

export type FearGrade = 'deny' | 'ask' | 'admit';

const FEAR_DENY = /아니|없|모르|않|안\s*느|안\s*무서/;
const FEAR_ASK = /\?$|왜|뭐|무슨/;
const FEAR_ADMIT = /무서|느껴|느낀|^응|^네|그래|맞아|조금|약간/;

/**
 * 「너 무서운 거… 느껴?」의 세 갈래. 부정이 먼저다 — 「무섭지 않아」는 무서움을 말했어도 부정이다.
 * 되묻기는 그다음(「뭐가 무서워?」), 인정은 마지막. 어느 것도 아니면 침묵으로 친다 = 부정 (시간 초과와 같다)
 */
export function classifyFear(text: string): FearGrade {
  // 앞머리의 말줄임표·문장부호는 뜻이 아니다 — 「…응.」은 「응」이다
  const t = text.trim().replace(/^[^가-힣a-zA-Z0-9]+/, '');
  if (!t) return 'deny';
  if (FEAR_DENY.test(t)) return 'deny';
  if (FEAR_ASK.test(t)) return 'ask';
  if (FEAR_ADMIT.test(t)) return 'admit';
  return 'deny';
}

/* ─────────────────────────────── 관문 ③ memory ─────────────────────────────── */

export type MemoryGrade = 'ok' | 'unknown' | 'wrong';

/**
 * 구역을 수로 댔나 — 숫자든 「일곱 구역」이든. 한자어 「이(2)」는 뺀다: 「이 구역이야」의 「이」는 가리키는 말이라 회피지 숫자가 아니다 —
 * 그걸 수로 읽으면 자연스러운 얼버무림이 즉결(wrong)이 된다. 2 구역이 답인 판은 「둘 구역」 · 「2 구역」 이 있다 (identity 의 matchSector 가 먼저 본다)
 */
const SECTOR_NUMBERED = /\d|(하나|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|일|삼|사|오|육|칠|팔|구)\s*구역/;

/**
 * 마지막 정비 위치. 맞으면 ok, 다른 구역을 댔으면 wrong(즉결), 구역을 안 댔거나 모른다고 했으면 unknown(escort).
 * 「모르」는 숫자가 섞여 있어도 unknown 이다 — 「4 구역인가… 모르겠어」는 회피지 거짓이 아니다
 */
export function gradeMemory(i: { text: string; matchSector: boolean }): MemoryGrade {
  if (i.matchSector) return 'ok';
  const t = i.text.trim();
  if (!t || /모르/.test(t) || !SECTOR_NUMBERED.test(t)) return 'unknown';
  return 'wrong';
}

/* ─────────────────────────────── 자리 · 방향 ─────────────────────────────── */

/**
 * 시선이 그쪽을 향했나 — yaw 는 Unit·patrol 의 heading 규약(θ 가 보는 방향은 (sin θ, cos θ)).
 * 나에서 target 으로의 방향과 withinDeg 안이면 참. 같은 자리(target = me)면 방향이 없으니 거짓 — 판정을 못 하면 무죄다
 */
export function facingToward(yaw: number, me: Readonly<Vec2>, target: Readonly<Vec2>, withinDeg: number): boolean {
  const tx = target.x - me.x;
  const tz = target.z - me.z;
  const len = Math.hypot(tx, tz);
  if (len === 0) return false;
  const cos = (Math.sin(yaw) * tx + Math.cos(yaw) * tz) / len;
  return cos >= Math.cos((withinDeg * Math.PI) / 180);
}

/** 여럿 중 가장 가까운 점 — 중앙 시설의 문 ①② 중 「도주라면 어느 문으로」를 고를 때 */
export function nearestPoint<T extends Readonly<Vec2>>(me: Readonly<Vec2>, points: readonly T[]): T {
  let best = points[0];
  let bestD = Infinity;
  for (const p of points) {
    const d = Math.hypot(p.x - me.x, p.z - me.z);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** 반경 안에서 가장 가까운 것의 id — 없으면 null. 곁의 개체(「개체 (곁)」)를 고르는 한 가지 규칙 */
export function nearestWithin(units: ReadonlyArray<{ id: string; x: number; z: number }>, me: Readonly<Vec2>, radius: number): string | null {
  let best: string | null = null;
  let bestD = radius;
  for (const u of units) {
    const d = Math.hypot(u.x - me.x, u.z - me.z);
    if (d <= bestD) {
      bestD = d;
      best = u.id;
    }
  }
  return best;
}

/** 코어까지의 거리 — DARK_CORE 의 「코어 앞」(6 m) 판정 */
export function distToCore(me: Readonly<Vec2>, center: Readonly<Vec2> = CORE_CENTER): number {
  return Math.hypot(me.x - center.x, me.z - center.z);
}

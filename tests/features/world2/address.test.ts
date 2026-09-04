/**
 * 말 걸어오기 — 개체가 **와서** 말하고, 답할 시간을 준다 (address.ts).
 * 걸어오기 → 도착 기다리기 → 앞 줄 뒤에 말하기 → 창 → 답/침묵 → 풀기. 방이 바뀌면 거두고, 집행 · 검문 동안은 멎는다.
 * 시계는 시험이 쥔다(tick(now)) — 가짜 host 로 돈다.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  ADDRESS_DEFAULT,
  ADDRESS_GAP_MS,
  ADDRESS_MUST_SPEAK,
  APPROACH_NEAR_M,
  APPROACH_STOP_M,
  APPROACH_STUCK_MS,
  APPROACH_TRAVEL_M,
  address,
  cast,
  type AddressHost,
} from '../../../src/features/world2/address';
import { TALK_DIST_M } from '../../../src/features/world2/corefield';
import { corridor, FIRST_LOOK_AFTER_INTRO_MS, FIRST_LOOK_RETRY_MS, FIRST_LOOK_WINDOW_MS, type Host } from '../../../src/features/world2/corridor';
import { FIRST_LOOK_ANY, FIRST_LOOK_NONE, FIRST_LOOK_OPEN, HALL_SEE, OBJ_INSPECT, OBJ_TALK, type CastLine } from '../../../src/features/world2/script';
import { identity } from '../../../src/world/mp/identity';
import { suspicion } from '../../../src/world/mp/suspicion';

interface Log {
  approached: { id: string; to: { x: number; z: number }; stopAt: number; then: string }[];
  stared: { id: string; ms: number }[];
  released: string[];
  cast: { lines: readonly CastLine[]; id: string | null; startAt: number }[];
  pinned: (string | null)[];
  objectives: (string | null)[];
  windows: ({ until: number; span: number; paused: number | null } | null)[];
}

/**
 * 가짜 판 — 자리 · 시각 · 방 · 흐르는 대사 · 입력줄을 시험이 손으로 옮긴다.
 * walks 가 true 면 approach 를 받는 순간 몸이 그 자리까지 걷는다 — **걸어올 수 있는 몸**(address ⑦). false 면 못 오는 몸이다
 */
function fake(opts: { unit?: { x: number; z: number; still: boolean } | null; lineMs?: number; walks?: boolean } = {}) {
  const log: Log = { approached: [], stared: [], released: [], cast: [], pinned: [], objectives: [], windows: [] };
  const w = {
    now: 0,
    me: { x: 0, z: 0 },
    room: 'corridor',
    unit: opts.unit === undefined ? { x: 0, z: -6, still: true } : opts.unit,
    busyUntil: 0,
    objective: '복도를 조사하라' as string | null,
    talking: false,
    frozen: false,
    lineMs: opts.lineMs ?? 1000,
    walks: opts.walks ?? false,
  };
  const host: AddressHost = {
    now: () => w.now,
    me: () => w.me,
    room: () => w.room,
    unitAt: () => w.unit,
    approach: (id, to, o) => {
      log.approached.push({ id, to: { ...to }, stopAt: o.stopAt, then: o.then });
      if (!w.walks || !w.unit) return;
      // 걸어와서 내 앞 stopAt 에 선다 — 오는 내내 이쪽을 보고 있다(가짜 판은 heading 을 안 적으므로 「본다」는 안 물린다)
      const d = Math.hypot(w.unit.x - to.x, w.unit.z - to.z) || 1;
      w.unit = { x: to.x + ((w.unit.x - to.x) / d) * o.stopAt, z: to.z + ((w.unit.z - to.z) / d) * o.stopAt, still: true };
    },
    stare: (id, ms) => void log.stared.push({ id, ms }),
    release: (id) => void log.released.push(id),
    busyUntil: () => w.busyUntil,
    playCast: (lines, id, startAt = 0) => {
      log.cast.push({ lines, id, startAt });
      w.busyUntil = Math.max(w.busyUntil, w.now + startAt + w.lineMs);
      return w.lineMs;
    },
    pinNear: (id) => void log.pinned.push(id),
    objective: () => w.objective,
    setObjective: (t) => {
      w.objective = t;
      log.objectives.push(t);
    },
    talking: () => w.talking,
    answerWindow: (win) => void log.windows.push(win),
    frozen: () => w.frozen,
  };
  const tick = (now: number) => {
    w.now = now;
    address.tick(now);
  };
  /** 걸어온 몸이 앞에 와 섰다 — APPROACH_STOP_M(1.4 m) 자리 */
  const arrive = (z = -APPROACH_STOP_M) => {
    w.unit = { x: 0, z, still: true };
  };
  return { host, log, w, tick, arrive };
}

const LINES = cast(['…너 여기 처음이지.']);

beforeEach(() => {
  address.reset();
});

describe('걸어와서 말한다 — 도착 · 정적 · 줄 · 창', () => {
  it('멀면 approach 로 걸어오고, 서서 앞에 닿기 전에는 말하지 않는다', () => {
    const { host, log, w, tick, arrive } = fake();
    address.bind(host);
    address.request('ally-timid', LINES, { answerMs: 3000 });
    expect(log.approached).toEqual([{ id: 'ally-timid', to: { x: 0, z: 0 }, stopAt: APPROACH_STOP_M, then: 'stand' }]);
    expect(address.phase()).toBe('approach');
    // 아직 걷는 중 — 2 m 안에 들어와도 서지 않았으면 말하지 않는다
    w.unit = { x: 0, z: -2, still: false };
    tick(1000);
    expect(log.cast).toEqual([]);
    arrive();
    tick(1100);
    expect(log.cast).toHaveLength(1);
    expect(log.cast[0]).toMatchObject({ lines: LINES, id: 'ally-timid' });
    // 말하는 동안 · 답하는 동안 나를 본다
    expect(log.stared).toEqual([{ id: 'ally-timid', ms: 1000 + 3000 }]);
  });

  it('내가 부른 답(solicited)은 이미 앞에 있으면 걸어오지 않는다 — 고개만 돌린다', () => {
    const { host, log, tick } = fake({ unit: { x: 1, z: -1, still: true } });
    address.bind(host);
    address.request('u104', LINES, { solicited: true });
    tick(0);
    expect(log.approached).toEqual([]);
    expect(log.cast).toHaveLength(1);
    expect(log.stared).toEqual([{ id: 'u104', ms: 1000 }]);
    // 창이 없는 말 — 줄이 끝나면 곧 끝난다. 곁도 목표도 안 건드린다
    tick(999);
    expect(address.speaker()).toBe('u104');
    tick(1000);
    expect(address.speaker()).toBeNull();
    expect(log.pinned).toEqual([]);
    expect(log.objectives).toEqual([]);
    expect(log.released).toEqual([]);
  });

  it('★ maxWaitMs 가 지나도 **말 거는 거리(2.6 m) 밖이면 말하지 않는다** — 안에 들어오면 서지 않았어도 말한다 (면제된 말의 규칙)', () => {
    const { host, log, w, tick } = fake();
    // 중앙 시설 — 걸음이 면제된 방(ADDRESS_EXEMPT_ROOMS). 여기서는 예전의 「2.6 m 안이면 말한다」가 그대로다
    w.room = 'central2';
    address.bind(host);
    address.request('u104', LINES);
    tick(ADDRESS_DEFAULT.maxWaitMs - 1);
    expect(log.cast).toEqual([]);
    // 4.5 초가 지났는데 아직 6 m 밖 — 멀리서 한 말은 자막이다. 계속 걸어온다
    tick(ADDRESS_DEFAULT.maxWaitMs);
    tick(ADDRESS_DEFAULT.maxWaitMs + 2000);
    expect(log.cast).toEqual([]);
    expect(address.phase()).toBe('approach');
    // 2.6 m 안에 들어왔다 — 아직 걷는 중(still false)이라도 말한다
    w.unit = { x: 0, z: -(TALK_DIST_M - 0.1), still: false };
    tick(ADDRESS_DEFAULT.maxWaitMs + 2100);
    expect(log.cast).toHaveLength(1);
  });

  it('★ giveUpMs 까지 못 오면 말없이 거둔다 — onDropped 만 부르고 몸은 푼다. 줄도 창도 없다 (면제된 말)', () => {
    const { host, log, w, tick } = fake();
    // 걸음이 면제된 방 — 걸어오다 못 닿은 몸은 예전대로 giveUpMs 에 거둬진다 (걸음이 필요한 말은 6 초에 거둬진다, 아래 ★)
    w.room = 'central2';
    address.bind(host);
    let dropped = 0;
    let silent = 0;
    address.request('u104', LINES, { answerMs: 3000, onDropped: () => (dropped += 1), onSilent: () => (silent += 1) });
    tick(ADDRESS_DEFAULT.giveUpMs - 1);
    expect(dropped).toBe(0);
    expect(address.speaker()).toBe('u104');
    tick(ADDRESS_DEFAULT.giveUpMs);
    expect(dropped).toBe(1);
    expect(silent).toBe(0);
    expect(log.cast).toEqual([]);
    expect(log.windows.filter(Boolean)).toEqual([]);
    expect(log.released).toEqual(['u104']);
    expect(address.speaker()).toBeNull();
  });

  it('앞 줄이 아직 흐르면 그 뒤에 말한다 — 읽지도 못한 줄 밑에 묻히지 않는다', () => {
    const { host, log, w, tick } = fake({ unit: { x: 0, z: -1, still: true } });
    address.bind(host);
    w.busyUntil = 5000;
    address.request('u104', LINES);
    tick(0);
    tick(4999);
    expect(log.cast).toEqual([]);
    tick(5000);
    expect(log.cast).toHaveLength(1);
  });

  it('delayMs — 대답의 숨. 정적이어도 그만큼은 기다린다 (걸음이 끝난 시각부터 센다)', () => {
    const { host, log, tick } = fake({ unit: { x: 0, z: -1, still: true } });
    address.bind(host);
    address.request('u104', LINES, { delayMs: 700 });
    // 걸음은 첫 프레임에 끝난다(이미 1.4 m 안 · 나를 본다) — 숨은 거기서부터
    tick(0);
    tick(699);
    expect(log.cast).toEqual([]);
    tick(700);
    expect(log.cast).toHaveLength(1);
  });

  it('onSpoken 은 줄이 나가는 순간 길이를 준다 — 뒤에 이어 붙일 줄의 자리', () => {
    const { host, tick } = fake({ unit: { x: 0, z: -1, still: true }, lineMs: 1234 });
    address.bind(host);
    const got: number[] = [];
    address.request('u104', LINES, { onSpoken: (t) => got.push(t) });
    tick(0);
    expect(got).toEqual([1234]);
  });
});

describe('답할 창 — 줄이 끝난 뒤부터, Enter 로 멈춤, 답이면 onAnswer · 닫히면 onSilent', () => {
  function asked(lineMs = 1000) {
    const f = fake({ unit: { x: 0, z: -1, still: true }, lineMs });
    address.bind(f.host);
    const seen = { answer: [] as string[], silent: 0 };
    address.request('u104', LINES, { answerMs: 3000, onAnswer: (t) => seen.answer.push(t), onSilent: () => (seen.silent += 1) });
    f.tick(0);
    return { ...f, seen };
  }

  it('줄이 흐르는 동안 곁은 이미 그 개체다(Enter 가 열리게), 목표의 힌트는 줄이 끝난 뒤에 선다', () => {
    const { log, w, tick } = asked();
    expect(log.pinned).toEqual(['u104']);
    expect(address.pending()).toBe(true);
    expect(address.pinned()).toBe('u104');
    expect(log.objectives).toEqual([]);
    tick(999);
    expect(w.objective).toBe('복도를 조사하라');
    tick(1000);
    expect(w.objective).toBe(OBJ_TALK);
    expect(address.phase()).toBe('window');
    expect(log.windows.at(-1)).toEqual({ until: 4000, span: 3000, paused: null });
  });

  it('창 안의 한 마디 → onAnswer, 그리고 푼다: 곁 해제 · 목표 복원 · 창 내림', () => {
    const { log, w, tick, seen } = asked();
    tick(1500);
    expect(address.answer('응')).toBe(true);
    expect(seen.answer).toEqual(['응']);
    expect(seen.silent).toBe(0);
    expect(log.pinned).toEqual(['u104', null]);
    expect(w.objective).toBe('복도를 조사하라');
    expect(log.windows.at(-1)).toBeNull();
    expect(address.pending()).toBe(false);
    // 두 번째 한 마디는 이 장치의 것이 아니다
    expect(address.answer('또')).toBe(false);
  });

  it('줄이 흐르는 동안의 한 마디도 답이다', () => {
    const { tick, seen } = asked();
    tick(500);
    expect(address.answer('어')).toBe(true);
    expect(seen.answer).toEqual(['어']);
  });

  it('창이 닫히면 onSilent — 줄이 끝난 시각부터 answerMs', () => {
    const { tick, seen, w } = asked();
    tick(3999);
    expect(seen.silent).toBe(0);
    tick(4000);
    expect(seen.silent).toBe(1);
    expect(w.objective).toBe('복도를 조사하라');
    expect(address.pending()).toBe(false);
  });

  it('Enter 로 멈추고(hold) ESC 로 다시 흐른다(release) — 남은 시간은 그대로', () => {
    const { tick, seen, log } = asked();
    tick(2000);
    address.hold();
    expect(address.phase()).toBe('held');
    expect(log.windows.at(-1)).toEqual({ until: 4000, span: 3000, paused: 2000 });
    tick(10_000);
    expect(seen.silent).toBe(0);
    address.release();
    expect(log.windows.at(-1)).toEqual({ until: 12_000, span: 3000, paused: null });
    tick(11_999);
    expect(seen.silent).toBe(0);
    tick(12_000);
    expect(seen.silent).toBe(1);
  });

  it('줄이 흐르는 동안 Enter 를 눌렀으면 창은 열리자마자 멈춘 채다', () => {
    const { tick, seen, log } = asked();
    tick(300);
    address.hold();
    tick(1000);
    expect(address.phase()).toBe('held');
    expect(log.windows.at(-1)).toEqual({ until: 4000, span: 3000, paused: 3000 });
    tick(9000);
    expect(seen.silent).toBe(0);
  });

  it('입력줄이 이미 열려 있으면(치는 중) 창은 멈춘 채로 열린다', () => {
    const { tick, w } = asked();
    w.talking = true;
    tick(1000);
    expect(address.phase()).toBe('held');
  });

  it('창 동안 다른 것이 목표를 바꿨으면 그건 그대로 — 내 힌트만 거둔다', () => {
    const { tick, w } = asked();
    tick(1000);
    w.objective = '안쪽으로 이동하라';
    tick(4000);
    expect(w.objective).toBe('안쪽으로 이동하라');
  });
});

describe('하나씩 · 방 · 멎음', () => {
  it('동시에 하나뿐이다 — 새 것은 줄을 서고, 앞 것이 풀리면 시작한다', () => {
    const { host, log, tick } = fake({ unit: { x: 0, z: -1, still: true } });
    address.bind(host);
    address.request('u104', LINES);
    // 둘째는 내가 부른 답(solicited)으로 — 저쪽이 먼저 거는 말끼리는 20 초 뜸이 있다(아래 ★)
    address.request('u089', cast(['왜 그렇게 서성여?']), { solicited: true });
    tick(0);
    expect(log.cast).toHaveLength(1);
    expect(address.queued()).toBe(1);
    tick(1000);
    expect(log.cast).toHaveLength(2);
    expect(log.cast[1].id).toBe('u089');
    expect(address.queued()).toBe(0);
  });

  it('방이 바뀌면 cancel — 아무것도 틀지 않고 거둔다: 콜백 없음 · 몸은 풀고 · 곁과 목표는 되돌린다', () => {
    const { host, log, w, tick, arrive } = fake();
    address.bind(host);
    const seen = { answer: 0, silent: 0 };
    address.request('ally-timid', LINES, { answerMs: 3000, onAnswer: () => (seen.answer += 1), onSilent: () => (seen.silent += 1) });
    address.request('u089', LINES);
    arrive();
    tick(100);
    tick(1100);
    expect(w.objective).toBe(OBJ_TALK);
    address.cancel();
    expect(seen).toEqual({ answer: 0, silent: 0 });
    expect(log.released).toEqual(['ally-timid']);
    expect(log.pinned.at(-1)).toBeNull();
    expect(w.objective).toBe('복도를 조사하라');
    expect(address.queued()).toBe(0);
    expect(address.pending()).toBe(false);
    tick(20_000);
    expect(log.cast).toHaveLength(1);
  });

  it('줄 선 것은 방이 다르면 버린다', () => {
    const { host, log, w, tick } = fake({ unit: { x: 0, z: -1, still: true } });
    address.bind(host);
    address.request('u104', LINES);
    address.request('u089', LINES);
    tick(0);
    w.room = 'rest';
    tick(1000);
    expect(log.cast).toHaveLength(1);
    expect(address.speaker()).toBeNull();
  });

  it('집행 · 검문 동안은 멎는다 — 풀리면 멎었던 만큼 창이 뒤로 민다', () => {
    const { host, w, tick } = fake({ unit: { x: 0, z: -1, still: true } });
    address.bind(host);
    let silent = 0;
    address.request('u104', LINES, { answerMs: 3000, onSilent: () => (silent += 1) });
    tick(0);
    tick(1000);
    expect(address.phase()).toBe('window');
    w.frozen = true;
    tick(2000);
    tick(30_000);
    expect(silent).toBe(0);
    w.frozen = false;
    // 2000 에 멎어 30000 의 프레임에서 풀린 것을 봤다 — 창은 4000 + 28000 = 32000 에 닫힌다
    tick(30_000);
    tick(31_999);
    expect(silent).toBe(0);
    tick(32_000);
    expect(silent).toBe(1);
  });

  it('멎은 동안 들어온 것은 풀릴 때 시작한다', () => {
    const { host, log, w, tick } = fake({ unit: { x: 0, z: -1, still: true } });
    address.bind(host);
    w.frozen = true;
    address.request('u104', LINES);
    tick(0);
    expect(log.cast).toEqual([]);
    w.frozen = false;
    tick(100);
    expect(log.cast).toHaveLength(1);
  });

  it('★ 저쪽이 먼저 거는 말은 20 초에 하나 — 둘째는 줄에서 기다린다. 내가 부른 답(solicited)은 뜸을 안 둔다', () => {
    const { host, log, tick } = fake({ unit: { x: 0, z: -1, still: true } });
    address.bind(host);
    address.request('u104', LINES);
    tick(0);
    expect(log.cast).toHaveLength(1);
    tick(1000);
    expect(address.speaker()).toBeNull();
    // 둘째 — 저쪽이 먼저 거는 말. 20 초가 안 지났다
    address.request('u089', cast(['왜 그렇게 서성여?']));
    tick(1100);
    tick(ADDRESS_GAP_MS - 1);
    expect(log.cast).toHaveLength(1);
    expect(address.queued()).toBe(1);
    tick(ADDRESS_GAP_MS);
    expect(log.cast).toHaveLength(2);
    expect(log.cast[1].id).toBe('u089');
    tick(ADDRESS_GAP_MS + 1000);
    // 내가 걸어가 건 말의 답은 곧바로
    address.request('u137', cast(['…그럼 누가.']), { solicited: true });
    tick(ADDRESS_GAP_MS + 1100);
    expect(log.cast).toHaveLength(3);
    expect(log.cast[2].id).toBe('u137');
  });

  it('★ blockedUntil — 창이 있는 말이 흐르는 동안과 창이 열린 동안은 다른 줄이 못 든다. 멎어 있으면(집행 · 검문) 0', () => {
    const { host, w, tick } = fake({ unit: { x: 0, z: -1, still: true } });
    address.bind(host);
    expect(address.blockedUntil(0)).toBe(0);
    address.request('u104', LINES, { answerMs: 3000 });
    tick(0);
    // 줄 1000 + 창 3000
    expect(address.blockedUntil(500)).toBe(4000);
    tick(1000);
    expect(address.blockedUntil(1500)).toBe(4000);
    // 마지막 프레임이 1000 이라 남은 창은 3000 — 멈춘 동안은 「지금 + 남은 창」
    address.hold();
    expect(address.blockedUntil(9000)).toBe(9000 + 3000);
    address.release();
    w.frozen = true;
    tick(9100);
    expect(address.blockedUntil(9100)).toBe(0);
    w.frozen = false;
    // 창이 없는 말은 막지 않는다
    tick(9200);
    address.answer('응');
    address.request('u089', cast(['가 봐.']), { solicited: true });
    tick(9300);
    expect(address.blockedUntil(9300)).toBe(0);
  });

  it('cast — 문자열은 전부 「개체 (곁)」 자리다', () => {
    expect(cast(['a', 'b'])).toEqual([
      { who: 'unit', text: 'a' },
      { who: 'unit', text: 'b' },
    ]);
  });
});

/* ─────────────────────────────── ⑦ 걸음이 곧 허락 ─────────────────────────────── */

/**
 * 2026-09-03 사용자(기획): 「다른 객체가 말을 거는 건 중앙시설, 특별한 상황을 제외하고, 내가 말을 걸 때나,
 * 꼭 말해야 하는 상황이거나, 다른 객체가 다가와서 말을 하는 경우에만」.
 * 규칙은 address.ts 한 곳(ADDRESS_EXEMPT_ROOMS · ADDRESS_MUST_SPEAK)이고, 여기서는 그 한 곳만 검사한다.
 */
describe('★ 저쪽이 먼저 거는 말은 걸어온 뒤에만 — 못 오는 몸은 한 줄도 안 한다', () => {
  it('못 오는 몸은 영영 말하지 않는다 — 6 초에 말없이 거둔다(onDropped). 줄도 창도 없다', () => {
    // walks 없음 = approach 를 받아도 안 움직이는 몸(자는 것 · 붙잡힌 것 · 순찰 밖의 몸 · 길이 막힌 것)
    const { host, log, tick } = fake({ unit: { x: 0, z: -5, still: true } });
    address.bind(host);
    let dropped = 0;
    address.request('u104', LINES, { scene: 'REST_STIR', answerMs: 3000, onDropped: () => (dropped += 1) });
    expect(log.approached).toHaveLength(1);
    tick(APPROACH_STUCK_MS - 1);
    expect(dropped).toBe(0);
    expect(log.cast).toEqual([]);
    tick(APPROACH_STUCK_MS);
    expect(dropped).toBe(1);
    expect(log.cast).toEqual([]);
    expect(log.windows.filter(Boolean)).toEqual([]);
    expect(address.speaker()).toBeNull();
    // 뜸(⑥)도 안 걸린다 — 나가지 않은 말은 말이 아니다
    expect(address.lastUnsolicitedAt()).toBe(-Infinity);
  });

  it('자리를 모르는 몸(아직 안 적힌 개체)도 말하지 않는다 — 걸어오는 것을 볼 길이 없다', () => {
    const { host, log, tick } = fake({ unit: null });
    address.bind(host);
    let dropped = 0;
    address.request('u104', LINES, { scene: 'REST_STIR', onDropped: () => (dropped += 1) });
    tick(0);
    expect(dropped).toBe(1);
    expect(log.approached).toEqual([]);
    expect(log.cast).toEqual([]);
  });

  it('걸어올 수 있는 몸은 **1.5 m 안에 들어와 선 뒤에야** 말한다 — 그 전에는 2.6 m 안이어도 한 줄도 없다', () => {
    const { host, log, w, tick } = fake({ unit: { x: 0, z: -5, still: true } });
    address.bind(host);
    address.request('u104', LINES, { scene: 'REST_STIR' });
    expect(log.approached).toEqual([{ id: 'u104', to: { x: 0, z: 0 }, stopAt: APPROACH_STOP_M, then: 'stand' }]);
    // 말 거는 거리(2.6 m) 안까지 왔다 — 예전 규칙이면 여기서 말했다. 이제는 아니다
    w.unit = { x: 0, z: -(TALK_DIST_M - 0.1), still: false };
    tick(ADDRESS_DEFAULT.maxWaitMs + 1000);
    expect(log.cast).toEqual([]);
    expect(address.phase()).toBe('approach');
    // 앞에 와 섰다 — 이제 말한다. 5 m 에서 왔으니 걸은 거리도 넉넉하다
    w.unit = { x: 0, z: -APPROACH_STOP_M, still: true };
    tick(ADDRESS_DEFAULT.maxWaitMs + 1100);
    expect(log.cast).toHaveLength(1);
    expect(log.cast[0]).toMatchObject({ id: 'u104' });
  });

  it('앞에 와 있어도 **걸은 거리**가 없으면 말하지 않는다 — 0.8 m 는 걸어야 「왔다」다', () => {
    const { host, log, w, tick } = fake({ unit: { x: 0, z: -5, still: true } });
    address.bind(host);
    address.request('u104', LINES, { scene: 'REST_STIR' });
    // 내가 그 앞으로 걸어갔다 — 개체는 한 발짝도 안 뗐는데 1.5 m 안이 됐다. 이건 「다가와서 말한다」가 아니다
    w.me = { x: 0, z: -4 };
    tick(1000);
    expect(log.cast).toEqual([]);
    // 그 뒤 개체가 실제로 걸어왔다
    w.unit = { x: 0, z: -5 + APPROACH_TRAVEL_M, still: true };
    tick(1100);
    expect(log.cast).toHaveLength(1);
  });

  it('처음부터 가까이 있던 것은 그만큼만 걸어 나온다 — 1.4 m 자리에 서고 나를 본다', () => {
    const { host, log, tick } = fake({ unit: { x: 0, z: -1.8, still: true }, walks: true });
    address.bind(host);
    address.request('u104', LINES, { scene: 'REST_STIR' });
    // 0.8 m 를 걸을 거리가 없다 — 그래도 걸음은 시킨다(stopAt 1.4)
    expect(log.approached).toEqual([{ id: 'u104', to: { x: 0, z: 0 }, stopAt: APPROACH_STOP_M, then: 'stand' }]);
    tick(0);
    expect(log.cast).toHaveLength(1);
  });

  it('중앙 시설의 말은 걸음을 안 탄다 — 그 방의 일이다 (방 면제)', () => {
    const { host, log, w, tick } = fake({ unit: { x: 0, z: -1, still: true } });
    w.room = 'central2';
    address.bind(host);
    address.request('u118', LINES);
    tick(0);
    expect(log.approached).toEqual([]);
    expect(log.cast).toHaveLength(1);
  });

  it('꼭 말해야 하는 장면도 걸음을 안 탄다 — 표(ADDRESS_MUST_SPEAK)에 있는 것만', () => {
    for (const scene of Object.keys(ADDRESS_MUST_SPEAK)) {
      address.reset();
      const { host, log, tick } = fake({ unit: { x: 0, z: -1, still: true } });
      address.bind(host);
      address.request('u201', LINES, { scene });
      tick(0);
      expect(log.approached, scene).toEqual([]);
      expect(log.cast, scene).toHaveLength(1);
    }
    // 표에 없는 이름은 걸음을 탄다
    address.reset();
    const { host, log, tick } = fake({ unit: { x: 0, z: -5, still: true } });
    address.bind(host);
    address.request('u201', LINES, { scene: 'LEAVE_WORK_LIKE_US' });
    tick(0);
    expect(log.approached).toHaveLength(1);
    expect(log.cast).toEqual([]);
  });

  it('내가 건 말의 답(solicited)은 걸음을 안 탄다 — 멀리 있어도 예전 규칙 그대로', () => {
    const { host, log, tick } = fake({ unit: { x: 0, z: -1, still: true } });
    address.bind(host);
    address.request('u137', cast(['…그럼 누가.']), { solicited: true });
    tick(0);
    expect(log.approached).toEqual([]);
    expect(log.cast).toHaveLength(1);
  });

  it('한 걸음 위에 이어 붙는 두 번째 마디(continues)는 다시 안 걷고 뜸도 안 둔다 — 앞말이 못 나갔으면 같이 조용하다', () => {
    const { host, log, tick } = fake({ unit: { x: 0, z: -3, still: true }, walks: true });
    address.bind(host);
    address.request('u137', LINES, { scene: 'OTHER_HAND' });
    address.request('u137', cast(['너 몇 번째 벽 봤어?']), { scene: 'OTHER_HAND_MORE', continues: true });
    tick(0);
    expect(log.cast).toHaveLength(1);
    expect(log.approached).toHaveLength(1);
    // 앞말이 끝나면 곧바로 — 20 초 뜸에 안 걸리고, 걸음도 한 번뿐이다
    tick(1000);
    expect(log.cast).toHaveLength(2);
    expect(log.approached).toHaveLength(1);
  });

  it('앞말이 거둬졌으면 이어 붙는 마디도 제 걸음을 요구받는다 — 못 오는 몸이면 둘 다 없다', () => {
    const { host, log, tick } = fake({ unit: { x: 0, z: -5, still: true } });
    address.bind(host);
    address.request('u137', LINES, { scene: 'OTHER_HAND' });
    address.request('u137', cast(['너 몇 번째 벽 봤어?']), { scene: 'OTHER_HAND_MORE', continues: true });
    tick(APPROACH_STUCK_MS);
    tick(APPROACH_STUCK_MS * 2);
    expect(log.cast).toEqual([]);
    expect(address.speaker()).toBeNull();
  });

  it('걷다가 막힌 몸도 거둔다 — 가까워지는 동안은 기다리고, 6 초 동안 한 뼘도 못 오면 끝이다', () => {
    const { host, log, w, tick } = fake({ unit: { x: 0, z: -8, still: true } });
    address.bind(host);
    let dropped = 0;
    address.request('u201', LINES, { scene: 'DOZE_LINES', onDropped: () => (dropped += 1) });
    // 5 초 동안 걸어온다 — 가까워지는 동안은 시계가 밀린다
    for (let t = 500; t <= 5000; t += 500) {
      w.unit = { x: 0, z: -8 + t / 1000, still: false };
      tick(t);
    }
    expect(dropped).toBe(0);
    // 3 m 에서 막혔다 — 여기서부터 6 초
    tick(5000 + APPROACH_STUCK_MS - 1);
    expect(dropped).toBe(0);
    tick(5000 + APPROACH_STUCK_MS);
    expect(dropped).toBe(1);
    expect(log.cast).toEqual([]);
  });

  it('내가 걸어가 버리면 걸음의 목적지를 다시 준다 — 내가 섰던 자리에 와 서는 것은 다가온 것이 아니다', () => {
    const { host, log, w, tick } = fake({ unit: { x: 0, z: -6, still: true } });
    address.bind(host);
    address.request('u201', LINES, { scene: 'DOZE_LINES' });
    expect(log.approached).toEqual([{ id: 'u201', to: { x: 0, z: 0 }, stopAt: APPROACH_STOP_M, then: 'stand' }]);
    // 개체가 내 앞까지 왔는데 — 나는 그새 저쪽으로 걸어갔다. 이건 도착이 아니다
    w.unit = { x: 0, z: -1.4, still: true };
    w.me = { x: 0, z: -6 };
    tick(1000);
    expect(log.cast).toEqual([]);
    expect(log.approached).toHaveLength(2);
    expect(log.approached[1].to).toEqual({ x: 0, z: -6 });
    // 다시 따라와 섰다 — 이제 말한다
    w.unit = { x: 0, z: -6 + APPROACH_STOP_M, still: true };
    tick(1100);
    expect(log.cast).toHaveLength(1);
  });

  it('멎은 동안(집행 · 검문)은 걸음의 기한도 멎는다 — 아무도 안 걷는 시간을 「안 오고 있다」로 읽지 않는다', () => {
    const { host, log, w, tick } = fake({ unit: { x: 0, z: -4, still: true } });
    address.bind(host);
    let dropped = 0;
    address.request('u201', LINES, { scene: 'REST_STIR', onDropped: () => (dropped += 1) });
    tick(100);
    // 집행이 들어왔다 — 순찰이 통째로 멎어(patrol.freeze) 개체가 20 초 동안 한 발짝도 못 뗀다
    w.frozen = true;
    tick(200);
    tick(20_000);
    w.frozen = false;
    // 풀린 프레임 — 멎어 있던 20 초는 「안 오고 있던」 시간이 아니다
    tick(20_100);
    expect(dropped).toBe(0);
    expect(address.phase()).toBe('approach');
    // 이제부터 다시 6 초를 센다
    w.unit = { x: 0, z: -1.4, still: true };
    tick(20_200);
    expect(log.cast).toHaveLength(1);
  });

  it('걸음이 끝난 자리는 1.5 m 안이다 — 그 수가 규칙의 전부다', () => {
    expect(APPROACH_STOP_M).toBeLessThan(APPROACH_NEAR_M);
    expect(APPROACH_NEAR_M).toBeLessThan(TALK_DIST_M);
  });
});

/* ─────────────────────────────── 복도의 첫마디가 이 장치를 탄다 ─────────────────────────────── */

describe('FIRST_LOOK — 화자가 걸어와 묻고, 뭐라도 치면 「…어. 그래.」 · 창이 닫히면 「아니야? 그럼 됐고.」', () => {
  interface CLog {
    address: { id: string; lines: readonly CastLine[]; answerMs?: number; onAnswer?: (t: string) => void; onSilent?: () => void }[];
    cast: { lines: readonly CastLine[]; id: string | null; startAt: number }[];
    played: unknown[];
    timers: { ms: number; fn: () => void; gated?: boolean }[];
  }
  function corridorHost(sinceControl = 0) {
    const log: CLog = { address: [], cast: [], played: [], timers: [] };
    const st = { objective: OBJ_INSPECT as string | null, talking: false };
    const once = new Set<string>();
    const host = {
      once: (k: string) => (once.has(k) ? false : (once.add(k), true)),
      play: (lines: unknown) => (log.played.push(lines), 800),
      playCast: (lines: readonly CastLine[], id: string | null, startAt = 0) => (log.cast.push({ lines, id, startAt }), 1000),
      patch: (p: Partial<typeof st>) => Object.assign(st, p),
      now: () => 0,
      me: () => ({ x: 0, z: 0 }),
      nearest: () => 'u104',
      /*
       * 물어보는 개체는 정해져 있다 (corridor 의 FIRST_LOOK_SPEAKER = ally-timid) — 그리던 것을 붓에서 떼지 않으려고
       * 「하던 일이 없는 것」을 고른다 (2026-09-03 사용자). 이 가짜 host 는 정해진 것이 방에 없다고 답해
       * 예전처럼 가까운 것(u104)이 오게 둔다 — 시험이 보는 것은 화자가 누구냐가 아니라 걸어와서 묻는가다
       */
      has: () => false,
      nearestIdle: () => 'u104',
      room: () => 'corridor',
      state: () => st,
      busyUntil: () => 0,
      quiet: () => true,
      later: (ms: number, fn: () => void) => void log.timers.push({ ms, fn }),
      // 조작권의 시계 — 시험에서는 그냥 타이머다. 어느 쪽으로 걸었는지(gated)만 적어 둔다
      afterControl: (ms: number, fn: () => void) => void log.timers.push({ ms, fn, gated: true }),
      sinceControl: () => sinceControl,
      address: (id: string, lines: readonly CastLine[], opts: CLog['address'][number] = { id, lines }) => void log.address.push({ ...opts, id, lines }),
    } as unknown as Host;
    // 걸어 둔 타이머를 시각 순으로 전부 돌린다
    // 타이머 안에서 건 타이머(인트로 뒤 → afterControl(0))까지 다 돌린다
    const flush = () => {
      while (log.timers.length) {
        const run = log.timers.splice(0).sort((a, b) => a.ms - b.ms);
        for (const t of run) t.fn();
      }
    };
    return { host, log, st, flush };
  }

  beforeEach(() => {
    suspicion.reset();
    identity.assign();
  });

  it('★ 인트로의 마지막 줄이 뜨면(introDone) 그 줄 길이 + 1.5 초 뒤, 그때 조작권(afterControl(0))으로 address 에 넘긴다 — 설명 도중에 걸어오지 않고, 스킵하면 그만큼 당겨진다', () => {
    const { host, log, flush } = corridorHost();
    corridor.start(host);
    corridor.enter(0);
    // 들어선 것만으로는 아무 시계도 안 건다 — 첫마디는 인트로의 마지막 줄이 뜰 때부터다
    expect(log.timers).toHaveLength(0);
    corridor.introDone(3000);
    // 마지막 줄(3 s) + 1.5 s 의 보통 타이머 하나 — 조작권 타이머는 아직 없다
    expect(log.timers.some((t) => t.ms === 3000 + FIRST_LOOK_AFTER_INTRO_MS && !t.gated)).toBe(true);
    expect(log.timers.some((t) => t.gated)).toBe(false);
    const run = log.timers.splice(0);
    for (const t of run) t.fn();
    // 그 시각이 오면 조작권의 시계(0 ms)로 넘긴다 — 손을 안 댔으면 손을 댈 때 온다
    expect(log.timers.some((t) => t.ms === 0 && t.gated)).toBe(true);
    flush();
    expect(log.address).toHaveLength(1);
    expect(log.address[0]).toMatchObject({ id: 'u104', lines: FIRST_LOOK_OPEN, answerMs: FIRST_LOOK_WINDOW_MS });
    expect(log.cast).toEqual([]);
    expect(corridor.firstLookPending()).toBe(true);
    expect(corridor.firstLookSpeaker()).toBe('u104');
    corridor.reset();
  });

  it('답 → 「…어. 그래.」 → 목표 복원(명판 미독이면 OBJ_INSPECT) · HALL_SEE', () => {
    const { host, log, st, flush } = corridorHost();
    corridor.start(host);
    corridor.enter(0);
    corridor.introDone(0);
    flush();
    st.objective = OBJ_TALK;
    log.address[0].onAnswer!('응');
    expect(log.cast).toEqual([{ lines: FIRST_LOOK_ANY, id: 'u104', startAt: 700 }]);
    expect(corridor.firstLookPending()).toBe(false);
    flush();
    expect(st.objective).toBe(OBJ_INSPECT);
    expect(log.played).toContainEqual(HALL_SEE);
    corridor.reset();
  });

  it('침묵 → 「아니야? 그럼 됐고.」 — 판당 한 번이라 두 번째 enter 는 아무것도 안 건다', () => {
    const { host, log, flush } = corridorHost();
    corridor.start(host);
    corridor.enter(0);
    corridor.introDone(0);
    flush();
    log.address[0].onSilent!();
    expect(log.cast).toEqual([{ lines: FIRST_LOOK_NONE, id: 'u104', startAt: 0 }]);
    corridor.enter(1);
    corridor.introDone(0);
    flush();
    expect(log.address).toHaveLength(1);
    corridor.reset();
  });

  it('★ 화자가 끝내 못 와서 거둬지면(onDropped) 아무 줄도 없이 한 번 더 부른다 — 판당 반드시 한 번은 멀리서 외치는 것으로는 안 채워진다', () => {
    const { host, log, flush } = corridorHost();
    corridor.start(host);
    corridor.enter(0);
    corridor.introDone(0);
    flush();
    expect(log.address).toHaveLength(1);
    const first = log.address[0] as unknown as { onDropped?: () => void };
    first.onDropped!();
    expect(corridor.firstLookPending()).toBe(false);
    expect(log.cast).toEqual([]);
    // 다시 부르는 것도 조작권의 시계다
    expect(log.timers.some((t) => t.ms === FIRST_LOOK_RETRY_MS && t.gated)).toBe(true);
    flush();
    expect(log.address).toHaveLength(2);
    expect(corridor.firstLookPending()).toBe(true);
    // 두 번째도 못 오면 그걸로 끝 — 세 번은 없다
    (log.address[1] as unknown as { onDropped?: () => void }).onDropped!();
    flush();
    expect(log.address).toHaveLength(2);
    corridor.reset();
  });

  it('★ 유도 속마음(NUDGES)은 조작권부터 24 초 — 손을 대기 전에는 정적이어도 안 든다', () => {
    const { host, log } = corridorHost(-1);
    corridor.start(host);
    corridor.enter(0);
    corridor.tick(60_000, { x: 0, z: 1.4 });
    expect(log.played).toEqual([]);
    corridor.reset();
    const late = corridorHost(24_000);
    corridor.start(late.host);
    corridor.enter(0);
    corridor.tick(60_000, { x: 0, z: 1.4 });
    expect(late.log.played).toHaveLength(1);
    corridor.reset();
  });
});

/**
 * worker/src/game/runtime.ts — 판 한 바퀴를 가짜 부품(명부 · 방송 수집기 · 가짜 엔진 · 가짜 두뇌)으로 돌린다.
 *
 * 여기서 반드시 잡는 것 셋:
 *   1. 와이어에 정체가 없다 — game_state 의 좌석 어디에도 kind/role 이 없고, 격리 전엔 revealed 도 없다 (P-원칙).
 *   2. 판이 도는 동안 사람의 채팅은 좌석 이름으로 나간다 (플레이어 id · 닉네임이 사라진다).
 *   3. 의심도는 말로만 움직이고(말 속의 지목 · 관리 AI 의 말 읽기), 100 이면 격리 · 정체 공개 · 승패로 이어진다 (P1 · §1.2 · §1.3).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GAME_BRIEFING_MS,
  GAME_DISCUSSION_MS,
  GAME_FIRST_DISCUSSION_MS,
  GAME_PROLOGUE_MAX_MS,
  CARD,
  CARD_ITEMS,
  type CardItem,
  GAME_RESULT_MODAL_MS,
  GAME_TEST_MS,
  GAME_TEST_COUNT,
  GAME_TEST_POOL,
  SUSPICION,
  TALK,
  pressureFor,
  talkFor,
  type GameS2CMessage,
  type GameStateWire,
} from '../../src/world/mp/game-protocol';
import type { PlayerSnapshot, S2CMessage, TrialGame, TrialPlayerResult } from '../../src/world/mp/protocol';
import type { Brain } from '../../worker/src/game/brain';
import { GameRuntime, dealOrder } from '../../worker/src/game/runtime';
import { REPEAT_STEP } from '../../worker/src/game/suspicion';
import { DUCK_WINDOW_MS, MENTION_GAP_MS, STILL_MS } from '../../worker/src/game/tells';
import type { EngineContext, GameEngine } from '../../worker/src/trial/engine';

type Out = S2CMessage | GameS2CMessage;

function fakeStorage() {
  const cell = new Map<string, unknown>();
  return {
    get: async (k: string) => cell.get(k),
    put: async (k: string, v: unknown) => void cell.set(k, v),
    delete: async (k: string) => void cell.delete(k),
    list: async ({ prefix }: { prefix: string }) => {
      const out = new Map<string, unknown>();
      for (const [k, v] of cell) if (k.startsWith(prefix)) out.set(k, v);
      return out;
    },
  } as unknown as DurableObjectStorage;
}

/** 이벤트제 가짜 엔진 — finishNow() 를 부르면 done 이 된다. 결과는 참가자 전원에게 같은 모양으로 */
class FakeEngine implements GameEngine {
  readonly game = 'stopline' as const;
  ids: string[] = [];
  tuning: Record<string, { precision: number }> | undefined;
  private finished = false;
  ctx: EngineContext | null = null;
  condition() {
    return { friction: 0.6 };
  }
  start(_round: number, real: readonly string[], ai: readonly string[], ctx: EngineContext, tuning?: Record<string, { precision: number }>) {
    this.ids = [...real, ...ai];
    this.tuning = tuning;
    this.ctx = ctx;
    this.finished = false;
  }
  stop() {}
  join() {}
  onAccel() {}
  onBrake() {
    this.finished = true;
  }
  onMove() {}
  done() {
    return this.finished;
  }
  results(): TrialPlayerResult[] {
    return this.ids.map((id, i) => ({
      id,
      metrics: { stopError: i * 0.5, transitionError: i * 0.4 },
      transitionError: i * 0.4,
      errorDirection: [1, -1],
      adaptationCurve: [i * 0.4, i * 0.2],
    }));
  }
}

const silentBrain: Brain = { mode: 'none', ask: async () => null };

function player(id: string, seat: number): PlayerSnapshot {
  return { id, seat, nickname: `닉${seat}`, x: 0, z: 0, y: 0, heading: 0, anim: 'idle' };
}

/** storage 를 건네면 같은 저장소로 런타임을 하나 더 세울 수 있다 — 워커가 되살리는 길을 재려고. engine 은 가짜 엔진을 바꿔 끼운다 */
function harness(opts: { players?: PlayerSnapshot[]; brain?: Brain; storage?: DurableObjectStorage; engine?: GameEngine; rand?: () => number } = {}) {
  const roster = opts.players ?? [player('p1', 1), player('p2', 2), player('p3', 3)];
  const sent: Out[] = [];
  const direct: { to: string; msg: Out }[] = [];
  const engine = new FakeEngine();
  const storage = opts.storage ?? fakeStorage();
  const rt = new GameRuntime({
    storage,
    roster: () => roster,
    broadcast: (m) => sent.push(m),
    sendTo: (to, msg) => {
      direct.push({ to, msg });
      return true;
    },
    brain: opts.brain ?? silentBrain,
    makeEngine: () => opts.engine ?? engine,
    rand: opts.rand ?? (() => 0.4),
  });
  const lastState = () => [...sent].reverse().find((m): m is { t: 'game_state'; state: GameStateWire } => m.t === 'game_state')!.state;
  const roleOf = (to: string) => [...direct].reverse().find((d) => d.to === to && d.msg.t === 'game_role')?.msg as Extract<GameS2CMessage, { t: 'game_role' }> | undefined;
  return { rt, sent, direct, engine, roster, storage, lastState, roleOf };
}

/**
 * 브리핑을 지나 **판이 실제로 열리는 자리**까지.
 *
 * 첫 토론은 시계만으로 열리지 않는다 — 화면에서 검문소 프롤로그가 흐르는 동안은 아무도 말하지 않고,
 * 붙어 있는 사람이 전부 「방송이 끝났다」고 알려 와야 그때부터 40초를 센다 (runtime 의 prologueHold).
 */
async function openBoard(h: ReturnType<typeof harness>): Promise<void> {
  await vi.advanceTimersByTimeAsync(GAME_BRIEFING_MS + 10);
  for (const p of h.roster) await h.rt.handle(p.id, { t: 'game_prologue_done' });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('GameRuntime — 판 한 바퀴', () => {
  it('방장만 열 수 있고, 열리면 좌석이 섞이고 정체는 와이어에 없다', async () => {
    const h = harness();
    await h.rt.handle('p2', { t: 'game_start' });
    expect(h.direct.at(-1)?.msg.t).toBe('game_reject');
    await h.rt.handle('p1', { t: 'game_start', fillTo: 5 });

    const state = h.lastState();
    expect(state.phase).toBe('briefing');
    // 사람 3 + 대역 2 + AI 1
    expect(state.seats).toHaveLength(6);
    // 이름은 한국인 이름이다 (2026-09-05 사용자) — 전원 세 글자, 성도 이름도 서로 다르다. 좌석 번호는 1부터 차례로
    const names = state.seats.map((s) => s.name);
    for (const n of names) expect(n).toMatch(/^[가-힣]{3}$/);
    expect(new Set(names).size).toBe(6);
    expect(new Set(names.map((n) => n[0])).size).toBe(6);
    expect(new Set(names.map((n) => n.slice(1))).size).toBe(6);
    expect(state.seats.map((s) => s.seat)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const s of state.seats) {
      expect(s).not.toHaveProperty('kind');
      expect(s).not.toHaveProperty('role');
      expect(s.revealed).toBeUndefined();
    }
    expect(state.quota).toBe(3);
    // 배역은 소켓마다 따로 — 셋 다 받았고, 셋 다 좌석이 다르다
    const roles = ['p1', 'p2', 'p3'].map((p) => h.roleOf(p)!);
    expect(new Set(roles.map((r) => r.seatId)).size).toBe(3);
    for (const r of roles) expect(['human', 'designer']).toContain(r.role);
    // 설계자에게만 aiId 가 온다
    for (const r of roles) if (r.role === 'human') expect(r.aiId).toBeUndefined();
  });

  it('판이 도는 동안 사람의 채팅은 좌석 이름으로 나간다', async () => {
    const h = harness();
    expect(h.rt.onChat('p1', '안녕')).toBe(false); // 로비 — RoomDO 가 흘린다
    await h.rt.handle('p1', { t: 'game_start' });
    expect(h.rt.onChat('p1', '나 사람임')).toBe(true);
    const chat = h.sent.at(-1) as Extract<S2CMessage, { t: 'chat' }>;
    expect(chat.t).toBe('chat');
    expect(chat.id).toBe(h.roleOf('p1')!.seatId);
    expect(chat.nickname).toMatch(/^[가-힣]{3}$/);
    expect(chat.nickname).not.toBe('닉1');
  });

  it('채팅에서 좌석 번호와 의심의 말이 같이 나오면 지목 발언으로 친다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await vi.advanceTimersByTimeAsync(GAME_BRIEFING_MS + 10);
    const seats = h.lastState().seats;
    const p1Seat = h.roleOf('p1')!.seatId;
    const other = seats.find((s) => s.id !== p1Seat)!;
    const nn = String(other.seat).padStart(2, '0');
    h.rt.onChat('p1', `${nn} 너 AI 아니야?`);
    expect(h.lastState().suspicion[other.id]).toBe(SUSPICION.accuse);
    expect(h.lastState().accusations[p1Seat]).toBe(other.id);
    // 잡담은 안 움직인다
    h.rt.onChat('p1', `${nn} 오늘 날씨 좋다`);
    await vi.advanceTimersByTimeAsync(6_000);
    h.rt.onChat('p1', '아 배고파');
    expect(h.lastState().suspicion[other.id]).toBe(SUSPICION.accuse);
  });

  it('이름으로 부르는 지목 — 성 없이 「지훈이 너 AI 아니야?」 도 그 좌석이다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await vi.advanceTimersByTimeAsync(GAME_BRIEFING_MS + 10);
    const p1Seat = h.roleOf('p1')!.seatId;
    const other = h.lastState().seats.find((s) => s.id !== p1Seat)!;
    const given = other.name.slice(1);
    // 감싸 주는 말은 지목이 아니다
    h.rt.onChat('p1', `${given}이는 AI 아닌 것 같아`);
    expect(h.lastState().suspicion[other.id] ?? 0).toBe(0);
    h.rt.onChat('p1', `${given}이 너 AI 아니야?`);
    expect(h.lastState().suspicion[other.id]).toBe(SUSPICION.accuse);
    expect(h.lastState().accusations[p1Seat]).toBe(other.id);
  });

  /**
   * 2026-09-05 — accusationIn 이 일상 채팅을 지목으로 오독하던 자리들. 애먼 사람을 격리하면 AI 가 이기므로
   * (roles.outcomeFor) 애매한 줄은 **안 잡는 쪽**이 맞다.
   */
  it('일상 채팅은 지목이 아니다 — 맨 숫자 · 「몰라」 · 감싸 주는 말', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await vi.advanceTimersByTimeAsync(GAME_BRIEFING_MS + 10);
    const p1Seat = h.roleOf('p1')!.seatId;
    const other = h.lastState().seats.find((s) => s.id !== p1Seat)!;
    const n = String(other.seat);
    const nn = n.padStart(2, '0');

    // 맨 숫자는 회차·등수·초와 못 가른다 — 죄목 낱말이 같이 있어도 좌석을 부른 것이 아니다
    h.rt.onChat('p1', `${n}회차 기록 보면 AI 티 나던데`);
    // 「몰라」의 「몰」이 죄목으로 읽히던 자리
    h.rt.onChat('p1', `${n}번 기록은 나도 몰라`);
    // 감싸 주는 말이 +로 가던 자리
    h.rt.onChat('p1', `${nn}은 AI 아닌 것 같아`);
    expect(h.lastState().suspicion[other.id] ?? 0).toBe(0);
    expect(h.lastState().accusations).toEqual({});

    // 「3번」에 죄목이 붙으면 그건 지목이다 — 되묻기("아니야?")는 부정이 아니다
    h.rt.onChat('p1', `${n}번 너 AI 아니야?`);
    expect(h.lastState().suspicion[other.id]).toBe(SUSPICION.accuse);
    expect(h.lastState().accusations[p1Seat]).toBe(other.id);
  });

  it('관리 AI 가 오간 말을 읽고 의심도를 움직인다 — 지목 없이', async () => {
    let target = '';
    let asked = 0;
    const brain: Brain = {
      mode: 'api',
      ask: async ({ tool }) => {
        if (tool.name !== 'read_room') return null;
        asked += 1;
        return { marks: [{ name: target, amount: 9, reason: '소수점까지 읽었다' }] };
      },
    };
    const h = harness({ brain });
    await h.rt.handle('p1', { t: 'game_start' });
    await vi.advanceTimersByTimeAsync(GAME_BRIEFING_MS + 10);
    const p1Seat = h.roleOf('p1')!.seatId;
    target = h.lastState().seats.find((s) => s.id === p1Seat)!.name;

    // 한 마디로는 안 읽는다 — 몇 마디가 한 장면이다 (READ_MIN_LINES)
    h.rt.onChat('p1', '나는 정지선에서 0.42m 초과했다');
    await vi.advanceTimersByTimeAsync(20);
    expect(asked).toBe(0);

    h.rt.onChat('p1', '전환 직후 오차는 0.08m 였다');
    await vi.advanceTimersByTimeAsync(20);
    expect(asked).toBe(1);
    expect(h.lastState().suspicion[p1Seat]).toBe(9);
    // 방송은 없다 — 관측은 소리로 안 나간다 (runtime.readRoom 의 「방송은 없다」). 근거는 delta 의 why 로 피드에 남는다
    expect(h.sent.some((m) => m.t === 'game_leader')).toBe(false);
    // 겨눔은 안 생긴다 — 말에 붙은 값이라 철회로 걷히지 않는다
    expect(h.lastState().accusations).toEqual({});

    // 바로 이어 떠들어도 다음 장면은 READ_EVERY_MS 뒤에야 읽는다
    h.rt.onChat('p1', '아무튼 나는 사람이다');
    h.rt.onChat('p1', '믿어라');
    await vi.advanceTimersByTimeAsync(20);
    expect(asked).toBe(1);
    expect(h.lastState().suspicion[p1Seat]).toBe(9);
  });

  it('브리핑 → 토론 → 테스트 → 결과 모달 → 토론 으로 흐른다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    expect(h.lastState().phase).toBe('discussion');
    // 첫 토론이 열려도 방송은 없다 — 판을 여는 말은 화면의 프롤로그가 한다 (겹쳐 나오던 것을 걷었다)
    expect(h.sent.some((m) => m.t === 'game_leader')).toBe(false);

    await vi.advanceTimersByTimeAsync(GAME_FIRST_DISCUSSION_MS + 10);
    expect(h.lastState().phase).toBe('test');
    expect(h.sent.some((m) => m.t === 'trial_round_start')).toBe(true);
    // 시험이 열려도 방송은 없다 — 개시 방송도 걷었고, leader 는 시험 중 입을 다문다 (2026-09-06 「미니게임하는 시간에는 모두 tts 없애줘」)
    expect(h.sent.some((m) => m.t === 'game_leader')).toBe(false);
    // 엔진에는 좌석 id 가 간다 — 사람 3 + AI 1. AI 좌석에는 전략(tuning)이 붙는다
    expect(h.engine.ids).toHaveLength(4);
    expect(Object.keys(h.engine.tuning ?? {})).toHaveLength(1);

    // 사람이 브레이크를 밟으면 (가짜 엔진은 그걸로 done) 결과가 공개된다
    await h.rt.handleTrial('p1', { t: 'trial_brake' });
    expect(h.lastState().phase).toBe('result');
    const result = h.sent.find((m): m is Extract<S2CMessage, { t: 'trial_result' }> => m.t === 'trial_result')!;
    expect(result.result.players).toHaveLength(4);
    expect(JSON.stringify(result)).not.toContain('friction');
    expect(h.lastState().testsDone).toBe(1);

    await vi.advanceTimersByTimeAsync(GAME_RESULT_MODAL_MS + 10);
    expect(h.lastState().phase).toBe('discussion');
  });

  it('지목은 의심도를 움직이고, 100 이면 격리 · 정체 공개 · 승패로 간다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await vi.advanceTimersByTimeAsync(GAME_BRIEFING_MS + 10);
    const seats = h.lastState().seats;
    const mine = new Set(['p1', 'p2', 'p3'].map((p) => h.roleOf(p)!.seatId));
    const aiSeat = seats.find((s) => !mine.has(s.id))!; // 사람 셋뿐이니 남는 하나가 AI 다 — 시험이라서 안다

    await h.rt.handle('p1', { t: 'game_accuse', target: aiSeat.id });
    expect(h.lastState().suspicion[aiSeat.id]).toBe(SUSPICION.accuse);
    await h.rt.handle('p2', { t: 'game_accuse', target: aiSeat.id });
    expect(h.lastState().suspicion[aiSeat.id]).toBe(SUSPICION.accuse + SUSPICION.agree + SUSPICION.mobPer);
    await h.rt.handle('p2', { t: 'game_withdraw' });
    expect(h.lastState().suspicion[aiSeat.id]).toBe(SUSPICION.accuse);
    // 같은 사람의 연타는 서버가 5초에 한 번만 받는다
    await h.rt.handle('p1', { t: 'game_accuse', target: aiSeat.id });
    expect(h.lastState().suspicion[aiSeat.id]).toBe(SUSPICION.accuse);
    await vi.advanceTimersByTimeAsync(5_100);
    await h.rt.handle('p1', { t: 'game_accuse', target: aiSeat.id });
    expect(h.lastState().suspicion[aiSeat.id]).toBe(SUSPICION.accuse + REPEAT_STEP);

    // 100 까지 — 주장 판정으로 채운다 (가짜 두뇌가 불일치를 낸다)
    const liar: Brain = { mode: 'api', ask: async () => ({ verdict: 'mismatch', reason: '기록이 다르다' }) };
    const h2 = harness({ brain: liar });
    await h2.rt.handle('p1', { t: 'game_start' });
    await openBoard(h2);
    const seats2 = h2.lastState().seats;
    const mine2 = new Set(['p1', 'p2', 'p3'].map((p) => h2.roleOf(p)!.seatId));
    const ai2 = seats2.find((s) => !mine2.has(s.id))!;
    const p1Seat = h2.roleOf('p1')!.seatId;
    // 거짓 해명은 12초에 한 번만 판정된다 — 토론이 끝나 테스트가 열리면 브레이크로 바로 닫고 다음 토론에서 이어 간다
    for (let i = 0; i < 60 && (h2.lastState().suspicion[p1Seat] ?? 0) < 100; i += 1) {
      const phase = h2.lastState().phase;
      if (phase === 'discussion') {
        await h2.rt.handle('p1', { t: 'game_claim', text: `나는 사람이다 ${i}` });
        await vi.advanceTimersByTimeAsync(12_100);
      } else if (phase === 'test') {
        await h2.rt.handleTrial('p1', { t: 'trial_brake' });
      } else {
        await vi.advanceTimersByTimeAsync(1_000);
      }
    }
    // 거짓 해명 열 번 → p1 100 → 격리 · 사람이었다 · **판은 거기서 끝난다** — AI 는 아직 이 안에 있으니 AI 의 승리
    // (2026-09-05 사용자: 처형되면 그 순간 끝. 예전엔 목표 2 중 1 이라 판이 계속됐다)
    const iso = h2.sent.find((m): m is Extract<GameS2CMessage, { t: 'game_isolated' }> => m.t === 'game_isolated');
    expect(iso?.id).toBe(p1Seat);
    expect(iso?.role === 'human' || iso?.role === 'designer').toBe(true);
    expect(h2.lastState().phase).toBe('ended');
    const ended2 = h2.sent.find((m): m is Extract<GameS2CMessage, { t: 'game_ended' }> => m.t === 'game_ended')!;
    expect(ended2.outcome.winner).toBe('ai');
    expect(ended2.roles[ai2.id]).toBe('ai');
  });

  it('셋이 AI 를 거듭 몰면 100 — 격리 · AI 였다 · 사람 승리로 끝나고 정체표가 공개된다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    const seats = h.lastState().seats;
    const mine = new Set(['p1', 'p2', 'p3'].map((p) => h.roleOf(p)!.seatId));
    const ai = seats.find((s) => !mine.has(s.id))!;
    for (let i = 0; i < 40 && (h.lastState().suspicion[ai.id] ?? 0) < 100; i += 1) {
      for (const p of ['p1', 'p2', 'p3']) await h.rt.handle(p, { t: 'game_accuse', target: ai.id });
      await vi.advanceTimersByTimeAsync(5_100);
    }
    expect(h.lastState().phase).toBe('ended');
    const iso = h.sent.find((m): m is Extract<GameS2CMessage, { t: 'game_isolated' }> => m.t === 'game_isolated')!;
    expect(iso.id).toBe(ai.id);
    expect(iso.role).toBe('ai');
    const ended = h.sent.find((m): m is Extract<GameS2CMessage, { t: 'game_ended' }> => m.t === 'game_ended')!;
    expect(ended.outcome.winner).toBe('humans');
    expect(Object.values(ended.roles).filter((r) => r === 'ai')).toHaveLength(1);
    expect(Object.keys(ended.roles)).toHaveLength(4);
    // 기본 판의 배역은 [AI 설계자 1 · 사람 2 · AI 1] 이다 (roles.designerCount, 2026-09-05 사용자)
    expect(Object.values(ended.roles).filter((r) => r === 'designer')).toHaveLength(1);
    expect(Object.values(ended.roles).filter((r) => r === 'human')).toHaveLength(2);
  });

  it('설계자는 AI 의 좌석만 안다 — 기록에는 손을 못 댄다 (공개본 = 엔진의 원본)', async () => {
    // 6명이면 설계자는 둘이다 (roles.designerCount)
    const six = [1, 2, 3, 4, 5, 6].map((i) => player(`p${i}`, i));
    const h = harness({ players: six });
    await h.rt.handle('p1', { t: 'game_start' });
    const designer = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].find((p) => h.roleOf(p)!.role === 'designer');
    expect(designer).toBeDefined();
    const role = h.roleOf(designer!)!;
    expect(role.aiId).toBeDefined();

    await openBoard(h);
    await vi.advanceTimersByTimeAsync(GAME_FIRST_DISCUSSION_MS + 10);
    await h.rt.handleTrial('p1', { t: 'trial_brake' });
    const result = h.sent.find((m): m is Extract<S2CMessage, { t: 'trial_result' }> => m.t === 'trial_result')!.result;
    // 공개본은 엔진이 낸 그대로다 — 사이에 아무도 끼어들지 않는다
    for (const raw of h.engine.results()) {
      const pub = result.players.find((p) => p.id === raw.id)!;
      expect(pub.errorDirection).toEqual(raw.errorDirection);
      expect(pub.transitionError).toBe(raw.transitionError);
    }
  });
});

/**
 * 프롤로그 방송 (2026-09-05 사용자: "프롤로그가 끝나기 전까지는 AI 참가자가 대화 못 치게").
 *
 * 대본은 화면에서만 나므로 서버는 그 길이를 셀 수 없다 — 화면이 「끝났다」고 알려 오는 것이 유일한 신호다.
 * 그 사이 판은 **멎어 있어야** 한다: 대역도 AI 참가자도 조용하고, 첫 토론의 40초도 아직 안 시작한다.
 */
describe('GameRuntime — 프롤로그 방송이 끝나야 판이 열린다', () => {
  /** 늘 말하는 두뇌 — 조용한 것이 폴백 때문인지 프롤로그 때문인지 갈리게 */
  const chatty: Brain = { mode: 'api', ask: async () => ({ text: '누구 수상한데', accuse: '' }) };
  const botLines = (h: ReturnType<typeof harness>, seatIds: Set<string>) =>
    h.sent.filter((m): m is Extract<S2CMessage, { t: 'chat' }> => m.t === 'chat' && !seatIds.has(m.id));

  it('방송이 흐르는 동안 대역·AI 참가자는 한 마디도 안 한다 — 끝났다고 알려 와야 말문이 열린다', async () => {
    const h = harness({ brain: chatty });
    await h.rt.handle('p1', { t: 'game_start' });
    await vi.advanceTimersByTimeAsync(GAME_BRIEFING_MS + 10);
    const mine = new Set(['p1', 'p2', 'p3'].map((p) => h.roleOf(p)!.seatId));
    expect(h.lastState().phase).toBe('discussion');

    // 대본이 흐르는 40초 — 봇 차례가 여러 번 돌 시간인데도 판은 조용하다
    await vi.advanceTimersByTimeAsync(40_000);
    expect(botLines(h, mine)).toHaveLength(0);
    // 토론의 40초도 아직 안 샜다 — 시험이 열리면 안 된다
    expect(h.lastState().phase).toBe('discussion');

    // 셋 중 둘만 봤다 — 아직 기다린다 (한 사람의 화면에서 방송이 도는 중이다)
    for (const p of ['p1', 'p2']) await h.rt.handle(p, { t: 'game_prologue_done' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(botLines(h, mine)).toHaveLength(0);

    // 마지막 한 사람까지 — 여기서 말문이 열린다
    await h.rt.handle('p3', { t: 'game_prologue_done' });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(botLines(h, mine).length).toBeGreaterThan(0);
  });

  it('방송이 걷힌 그때부터 토론 40초를 센다 — 기다린 만큼 대화가 깎이지 않는다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await vi.advanceTimersByTimeAsync(GAME_BRIEFING_MS + 10);
    await vi.advanceTimersByTimeAsync(45_000); // 대본이 흐르는 동안
    for (const p of ['p1', 'p2', 'p3']) await h.rt.handle(p, { t: 'game_prologue_done' });

    await vi.advanceTimersByTimeAsync(GAME_FIRST_DISCUSSION_MS - 5_000);
    expect(h.lastState().phase).toBe('discussion');
    await vi.advanceTimersByTimeAsync(5_100);
    expect(h.lastState().phase).toBe('test');
  });

  it('아무도 안 알려 와도 상한에서 걷는다 — 화면 하나 때문에 판이 멎지 않는다', async () => {
    const h = harness({ brain: chatty });
    await h.rt.handle('p1', { t: 'game_start' });
    await vi.advanceTimersByTimeAsync(GAME_BRIEFING_MS + 10);
    const mine = new Set(['p1', 'p2', 'p3'].map((p) => h.roleOf(p)!.seatId));

    await vi.advanceTimersByTimeAsync(GAME_PROLOGUE_MAX_MS - 5_000);
    expect(botLines(h, mine)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(5_100 + 3_000);
    expect(botLines(h, mine).length).toBeGreaterThan(0);
    // 상한에서 걷혔어도 토론은 온전한 40초다
    expect(h.lastState().phase).toBe('discussion');
    await vi.advanceTimersByTimeAsync(GAME_FIRST_DISCUSSION_MS);
    expect(h.lastState().phase).toBe('test');
  });

  /*
   * **트는 쪽과 붙잡는 쪽이 같은 값을 봐야 한다** (2026-09-05 사용자: 「지금 프롤로그를 껴서 겹치거든」).
   *
   * 화면이 혼자 「첫 토론이고 시험이 없으면 튼다」로 정하면 서버가 아직 붙잡는 중인지 이미 걷고
   * 40초를 세는 중인지를 모른다 — 그 어긋남이 곧 방송과 대화가 겹치는 자리다.
   */
  it('붙잡고 있는 동안만 화면에 틀라고 알린다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await vi.advanceTimersByTimeAsync(GAME_BRIEFING_MS + 10);
    expect(h.lastState().prologue).toBe(true);

    for (const p of ['p1', 'p2', 'p3']) await h.rt.handle(p, { t: 'game_prologue_done' });
    expect(h.lastState().prologue).toBe(false);
  });

  /** 방송이 끝난 뒤 새로고침한 화면이 대본을 처음부터 다시 틀던 자리 — 서버는 이미 40초를 세고 있다 */
  it('걷힌 뒤 다시 물어도 틀라고 하지 않는다 — 새로고침이 대본을 되감지 않게', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    await vi.advanceTimersByTimeAsync(10_000);
    // 새로고침한 화면이 붙자마자 상태를 다시 묻는다 (GameConnection 의 game_sync)
    await h.rt.handle('p1', { t: 'game_sync' });
    const back = [...h.direct].reverse().find((d) => d.to === 'p1' && d.msg.t === 'game_state')!.msg as { t: 'game_state'; state: GameStateWire };
    // 국면·시험 수만 보면 첫 토론과 구별이 안 된다 — 그래서 붙잡기를 따로 싣는다
    expect(back.state.phase).toBe('discussion');
    expect(back.state.testsDone).toBe(0);
    expect(back.state.prologue).toBe(false);
  });

  /** 워커가 되살린 판은 붙잡기 없이 열린다 (restoreIfNeeded) — 화면이 그걸 첫 토론으로 보면 또 겹친다 */
  it('되살린 판은 틀라고 하지 않는다 — 붙잡기 없이 열리는 판이다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await vi.advanceTimersByTimeAsync(GAME_BRIEFING_MS + 10);
    expect(h.lastState().prologue).toBe(true);

    // 워커가 다시 떴다 — 같은 저장소에 새 런타임이 붙어 판을 되살린다
    const h2 = harness({ storage: h.storage, players: h.roster });
    await h2.rt.handle('p1', { t: 'game_sync' });
    expect(h2.lastState().phase).toBe('discussion');
    expect(h2.lastState().prologue).toBe(false);
  });

  it('방송을 보던 사람이 나가면 남은 사람만 기다린다', async () => {
    const h = harness({ brain: chatty });
    await h.rt.handle('p1', { t: 'game_start' });
    await vi.advanceTimersByTimeAsync(GAME_BRIEFING_MS + 10);
    const mine = new Set(['p1', 'p2', 'p3'].map((p) => h.roleOf(p)!.seatId));

    for (const p of ['p1', 'p2']) await h.rt.handle(p, { t: 'game_prologue_done' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(botLines(h, mine)).toHaveLength(0);

    // p3 이 창을 닫았다 — 없는 사람의 화면을 기다릴 이유가 없다
    h.roster.splice(2, 1);
    h.rt.onLeave('p3');
    await vi.advanceTimersByTimeAsync(3_000);
    expect(botLines(h, mine).length).toBeGreaterThan(0);
  });
});

/**
 * 차례표 (2026-09-05 사용자: "입장 · 40초 대화 · 시험 30초 · 40초 대화 · 시험 30초 · 40초 대화 · 시험 30초").
 * 관리 AI 가 매번 종류를 고르던 것을 그만두었으므로, **몇 번째로 몇 초 열리는가**가 판의 규칙이다. 어느 셋인가는 판이 열릴 때
 * 후보 넷에서 뽑는다 (2026-09-05 사용자: "검사판 랜덤 게임에 무게중심다리도") — 뽑힌 차례는 game_state 의 tests 로 공개된다.
 */
describe('GameRuntime — 차례표', () => {
  const rounds = (h: ReturnType<typeof harness>) => h.sent.filter((m): m is Extract<S2CMessage, { t: 'trial_round_start' }> => m.t === 'trial_round_start');

  it('판이 열리면 후보 넷에서 겹치지 않는 셋을 뽑아 공개하고, 난수가 다르면 다른 셋이 나온다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    const tests = h.lastState().tests!;
    expect(tests).toHaveLength(GAME_TEST_COUNT);
    expect(new Set(tests).size).toBe(GAME_TEST_COUNT);
    for (const g of tests) expect(GAME_TEST_POOL).toContain(g);
    // 다른 난수 → 다른 차례. 후보가 넷이라 셋을 뽑으면 하나가 빠진다 — 어느 것이 빠지는지가 난수에 달렸다
    const h2 = harness({ rand: () => 0.9 });
    await h2.rt.handle('p1', { t: 'game_start' });
    expect(h2.lastState().tests).not.toEqual(tests);
  });

  it('뽑힌 셋을 30초씩, 사이사이 40초 대화로 연다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    expect(h.lastState().phase).toBe('discussion');
    const order = h.lastState().tests!;

    for (const game of order) {
      // 대화가 끝나야 시험이 열린다 — 첫 대화도 그 뒤의 대화도 40초다
      await vi.advanceTimersByTimeAsync(GAME_DISCUSSION_MS + 10);
      expect(h.lastState().phase).toBe('test');
      expect(rounds(h).at(-1)).toMatchObject({ game, durationMs: GAME_TEST_MS });

      // 엔진이 제 길이(/trial 의 1분)로 끝내기 전에 판이 30초에 닫는다
      await vi.advanceTimersByTimeAsync(GAME_TEST_MS - 1_000);
      expect(h.lastState().phase).toBe('test');
      await vi.advanceTimersByTimeAsync(1_100);
      expect(h.lastState().phase).toBe('result');

      await vi.advanceTimersByTimeAsync(GAME_RESULT_MODAL_MS + 10);
      expect(h.lastState().phase).toBe('discussion');
    }

    expect(rounds(h).map((r) => r.game)).toEqual([...order]);
    expect(h.lastState().testsDone).toBe(GAME_TEST_COUNT);
    // 마지막 대화 40초까지 끝나면 판이 닫힌다 — 그때까지 AI 를 못 찾았으면 AI 의 승리
    await vi.advanceTimersByTimeAsync(GAME_DISCUSSION_MS + 10);
    expect(h.lastState().phase).toBe('ended');
    expect(h.sent.find((m): m is Extract<GameS2CMessage, { t: 'game_ended' }> => m.t === 'game_ended')?.outcome.winner).toBe('ai');
  });

  it('시험이 도는 중에도 의심도 100 은 그 자리에서 격리한다 — 격리되면 차례표가 남아도 끝난다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    const mine = new Set(['p1', 'p2', 'p3'].map((p) => h.roleOf(p)!.seatId));
    const ai = h.lastState().seats.find((s) => !mine.has(s.id))!;

    // 첫 시험(낙하 생존)이 도는 동안 셋이 한 좌석을 몬다 — 몸으로 하는 판이어도 지목은 멈추지 않는다
    await vi.advanceTimersByTimeAsync(GAME_DISCUSSION_MS + 10);
    expect(h.lastState().phase).toBe('test');
    for (let i = 0; i < 12 && h.lastState().phase !== 'ended'; i += 1) {
      for (const p of ['p1', 'p2', 'p3']) await h.rt.handle(p, { t: 'game_accuse', target: ai.id });
      await vi.advanceTimersByTimeAsync(5_100);
    }
    // 셋째 시험을 열기 한참 전에 AI 가 잡혀 판이 끝난다
    expect(h.sent.find((m): m is Extract<GameS2CMessage, { t: 'game_isolated' }> => m.t === 'game_isolated')?.id).toBe(ai.id);
    expect(h.lastState().phase).toBe('ended');
    expect(rounds(h).length).toBeLessThan(3);
  });
});

describe('GameRuntime — 죽은 판이 방을 잡고 있지 않다 (2026-09-04 「게임 시작이 안 된다」)', () => {
  /** 셋이 AI 를 몰아 판을 끝낸다 — 위의 승패 시험과 같은 길 */
  async function playToEnd(h: ReturnType<typeof harness>): Promise<void> {
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    const mine = new Set(['p1', 'p2', 'p3'].map((p) => h.roleOf(p)!.seatId));
    const ai = h.lastState().seats.find((s) => !mine.has(s.id))!;
    for (let i = 0; i < 40 && h.lastState().phase !== 'ended'; i += 1) {
      for (const p of ['p1', 'p2', 'p3']) await h.rt.handle(p, { t: 'game_accuse', target: ai.id });
      await vi.advanceTimersByTimeAsync(5_100);
    }
    expect(h.lastState().phase).toBe('ended');
  }

  it('판이 끝나면 잠시 뒤 로비로 돌아오고, 새 판을 열 수 있다', async () => {
    const h = harness();
    await playToEnd(h);
    await vi.advanceTimersByTimeAsync(31_000); // ENDED_LINGER_MS
    expect(h.lastState().phase).toBe('lobby');
    await h.rt.handle('p1', { t: 'game_start' });
    expect(h.lastState().phase).toBe('briefing');
  });

  it('끝 화면이 아직 서 있어도 방장의 시작은 새 판을 연다', async () => {
    const h = harness();
    await playToEnd(h);
    await h.rt.handle('p1', { t: 'game_start' }); // linger 를 기다리지 않는다
    expect(h.lastState().phase).toBe('briefing');
    expect(h.lastState().outcome).toBeNull();
  });

  it('판에 묶인 사람이 전원 나가면 — 유예 뒤 청소 알람이 판을 접고, 새로 온 사람이 시작할 수 있다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await vi.advanceTimersByTimeAsync(GAME_BRIEFING_MS + 10);
    expect(h.lastState().phase).toBe('discussion');

    // 전원 이탈 — 새로고침으로 id 가 바뀌어 낯선 사람만 남았다 (닉네임도 달라 rebind 도 안 된다)
    h.roster.splice(0, h.roster.length, player('q9', 1));
    const t0 = Date.now();
    await h.rt.onSweep(t0); // 버려진 것을 처음 본다 — 아직 유예
    expect(h.lastState().phase).toBe('discussion');
    // 유예 중엔 낯선 사람의 시작이 거절되지 않는다 — 버려진 판이면 접고 새로 연다
    await h.rt.onSweep(t0 + 95_000); // ABANDONED_AFTER_MS 경과
    expect(h.lastState().phase).toBe('lobby');
    await h.rt.handle('q9', { t: 'game_start' });
    expect(h.lastState().phase).toBe('briefing');
  });

  it('버려진 판에서는 청소를 기다릴 것 없이 시작 한 번으로 새 판이 열린다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await vi.advanceTimersByTimeAsync(GAME_BRIEFING_MS + 10);
    h.roster.splice(0, h.roster.length, player('q9', 1));
    await h.rt.handle('q9', { t: 'game_start' });
    expect(h.lastState().phase).toBe('briefing');
    // 반대로, 판에 묶인 사람이 남아 있으면 여전히 거절이다
    const h2 = harness();
    await h2.rt.handle('p1', { t: 'game_start' });
    await h2.rt.handle('p1', { t: 'game_start' });
    expect(h2.direct.at(-1)?.msg).toMatchObject({ t: 'game_reject' });
  });
});

describe('GameRuntime — 좌석의 몸 (mp/bodies)', () => {
  it('사람은 입장 때 받은 몸 그대로, 대역·AI 는 남은 몸에서 — 넷이면 넷이 다 다르다', async () => {
    const h = harness({ players: [{ ...player('p1', 1), body: 'sol_fit_f' }, { ...player('p2', 2), body: 'sol_heavy_m' }] });
    await h.rt.handle('p1', { t: 'game_start', fillTo: 3 });
    const seats = h.lastState().seats;
    // 사람 2 + 대역 1 + AI 1
    expect(seats).toHaveLength(4);
    const bodies = seats.map((s) => s.body);
    expect(bodies.every(Boolean)).toBe(true);
    expect(new Set(bodies).size).toBe(4);
    // 사람의 몸은 바뀌지 않는다 (좌석 id 는 seat-<playerId>)
    expect(seats.find((s) => s.id === 'seat-p1')?.body).toBe('sol_fit_f');
    expect(seats.find((s) => s.id === 'seat-p2')?.body).toBe('sol_heavy_m');
  });
});

/**
 * 발언권 (2026-09-05 사용자: "처음에 각자 대화 발언권 갯수가 주어지고, 미니게임에서 이겼을 때 게임마다 추가").
 * 값의 근거는 game-protocol 의 TALK 머리말. 여기서는 규칙의 모양만 잡는다:
 *   시작 지갑 · 한 마디에 하나 · 비면 거절 · 시험이 끝나면 버틴 3초마다 하나(최소 1) · 상한.
 */
describe('GameRuntime — 발언권', () => {
  /** 시간제 가짜 엔진 — 좌석마다 정해 둔 기록을 돌려준다. 판이 30초에 닫는다 (GAME_TEST_MS) */
  class TimedEngine implements GameEngine {
    ids: string[] = [];
    constructor(
      readonly game: TrialGame,
      private readonly metricsOf: (id: string, i: number) => Record<string, number>,
    ) {}
    condition() {
      return { friction: 0.6 };
    }
    start(_round: number, real: readonly string[], ai: readonly string[]) {
      this.ids = [...real, ...ai];
    }
    stop() {}
    join() {}
    onAccel() {}
    onBrake() {}
    onMove() {}
    onPick() {}
    done() {
      return false;
    }
    results(): TrialPlayerResult[] {
      return this.ids.map((id, i) => ({ id, metrics: this.metricsOf(id, i), transitionError: 0.1, errorDirection: [1], adaptationCurve: [0.1] }));
    }
  }
  const talks = (h: ReturnType<typeof harness>) => h.sent.filter((m): m is Extract<GameS2CMessage, { t: 'game_talk' }> => m.t === 'game_talk');
  const rejects = (h: ReturnType<typeof harness>) => h.direct.filter((d) => d.msg.t === 'game_reject');

  it('판이 열리면 전원이 시작 지갑을 받고, 한 마디에 하나씩 쓴다 — 비면 말이 안 나가고 거절 한 줄이 온다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    const state = h.lastState();
    for (const s of state.seats) expect(state.talk[s.id]).toBe(TALK.start);

    const mySeat = h.roleOf('p1')!.seatId;
    for (let i = 0; i < TALK.start; i += 1) expect(h.rt.onChat('p1', `말 ${i}`)).toBe(true);
    // 차감은 game_talk 로만 나간다 — 상태 전체(game_state)를 말마다 다시 쏘지 않는다
    expect(talks(h).at(-1)?.talk[mySeat]).toBe(0);

    const chatsBefore = h.sent.filter((m) => m.t === 'chat').length;
    expect(h.rt.onChat('p1', '하나 더')).toBe(true); // 처리는 했다 — RoomDO 가 흘리면 안 된다
    expect(h.sent.filter((m) => m.t === 'chat').length).toBe(chatsBefore);
    expect(rejects(h).at(-1)?.to).toBe('p1');
    // 다른 사람의 지갑은 그대로다
    expect(talks(h).at(-1)?.talk[h.roleOf('p2')!.seatId]).toBe(TALK.start);
  });

  it('낙하 생존 — 첫 피격까지 버틴 3초마다 하나, 최소 하나, 지갑 상한까지', async () => {
    // 첫째는 끝까지 버텼다 — 엔진이 마감을 틱 하나 넘겨 닫으므로 30.08초로 온다 (실제 판에서 +11 이 찍히던 자리). 셋째는 곧바로 맞았다
    const survival: Record<number, number> = { 0: 30.08, 1: 8, 2: 0.4 };
    const engine = new TimedEngine('fall', (_id, i) => ({ survivalTime: survival[i] ?? 30, hitCount: 1, transitionError: 0.1 }));
    const h = harness({ engine });
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    await vi.advanceTimersByTimeAsync(GAME_DISCUSSION_MS + 10);
    expect(h.lastState().phase).toBe('test');
    await vi.advanceTimersByTimeAsync(GAME_TEST_MS + 10);
    expect(h.lastState().phase).toBe('result');

    const grant = talks(h).find((m) => m.gained)!;
    expect(grant.game).toBe('fall');
    const [full, eight, instant] = engine.ids;
    // 30.08초 → 30초로 잘라 10. 지급은 온전히 — 안 쓴 6 중 넘어가는 것은 carry(5)까지라 지갑은 5 + 10
    expect(grant.gained[full]).toBe(10);
    expect(talkFor('fall', { survivalTime: 30.08 }, GAME_TEST_MS)).toBe(10);
    expect(talkFor('disc', { survivalTime: 31 }, GAME_TEST_MS)).toBe(10);
    expect(grant.gained[eight]).toBe(3); // 8초 → ceil(8/3)
    expect(grant.gained[instant]).toBe(TALK.min); // 0.4초 → 최소
    expect(h.lastState().talk[full]).toBe(TALK.carry + 10);
    expect(h.lastState().talk[eight]).toBe(TALK.carry + 3);
  });

  it('발판 — 도착하고 남긴 초로, 못 갔으면 최소만', async () => {
    const engine = new TimedEngine('platform', (_id, i) => ({ finishMs: i === 0 ? 12_000 : Number.NaN, jumps: 4, transitionError: 0.1 }));
    const h = harness({ engine });
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    await vi.advanceTimersByTimeAsync(GAME_DISCUSSION_MS + 10);
    await vi.advanceTimersByTimeAsync(GAME_TEST_MS + 10);
    const grant = talks(h).find((m) => m.gained)!;
    const [finished, stuck] = engine.ids;
    expect(grant.gained[finished]).toBe(6); // 30 − 12 = 18초 남김 → 6
    expect(grant.gained[stuck]).toBe(TALK.min);
  });

  it('아껴 둔 것은 다섯까지만 넘어가고, 지급은 1등이든 꼴등이든 제 몫을 온전히 받는다', async () => {
    const engine = new TimedEngine('disc', () => ({ survivalTime: 30, falls: 0, transitionError: 0.1 }));
    const h = harness({ engine });
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    // p1 은 다 쓰고, 나머지는 한 마디도 안 한다 — 시험에서는 전원이 끝까지 버텼다
    for (let i = 0; i < TALK.start; i += 1) h.rt.onChat('p1', `말 ${i}`);
    await vi.advanceTimersByTimeAsync(GAME_DISCUSSION_MS + 10);
    await vi.advanceTimersByTimeAsync(GAME_TEST_MS + 10);
    const grant = talks(h).find((m) => m.gained)!;
    const spent = h.roleOf('p1')!.seatId;
    // 받은 것은 똑같이 10 — 상한이 지급을 깎지 않는다 (예전엔 아낀 쪽이 +9, 다음 시험엔 +0 이었다)
    for (const id of engine.ids) expect(grant.gained[id]).toBe(10);
    expect(h.lastState().talk[spent]).toBe(10); // 0 + 10
    for (const id of engine.ids) if (id !== spent) expect(h.lastState().talk[id]).toBe(TALK.carry + 10); // 6 → 5 + 10
  });

  it('주장도 한 마디다 — 지갑이 비면 판정에 안 오른다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    for (let i = 0; i < TALK.start; i += 1) h.rt.onChat('p1', `말 ${i}`);
    const chatsBefore = h.sent.filter((m) => m.t === 'chat').length;
    await h.rt.handle('p1', { t: 'game_claim', text: '2회차는 내가 제일 늦었다' });
    expect(h.sent.filter((m) => m.t === 'chat').length).toBe(chatsBefore);
    expect(rejects(h).at(-1)?.msg).toMatchObject({ t: 'game_reject' });
  });
});

/**
 * 말·몸의 표식 (docs/SUSPICION.md ⑥⑦⑧⑨) — **규칙이 잡는 문**들. LLM 없이 도는지를 여기서 잰다.
 * (걸음이 거듭 걸릴 때 무거워지는 것과 bodyCap 은 순수 규칙이라 game-rules.test.ts 가 잠근다)
 */
describe('GameRuntime — 표식', () => {
  it('같은 말을 되풀이하면 문다 — 처음 한 말은 안 문다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    const p1Seat = h.roleOf('p1')!.seatId;

    const line = '아까 결과 보면 내가 제일 늦게 반응했잖아';
    h.rt.onChat('p1', line);
    expect(h.lastState().suspicion[p1Seat]).toBe(0);
    h.rt.onChat('p1', line);
    expect(h.lastState().suspicion[p1Seat]).toBe(SUSPICION.echo);
  });

  it('짧은 맞장구는 되풀이가 아니다 — 채팅의 정상 리듬이다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    const p1Seat = h.roleOf('p1')!.seatId;
    for (let i = 0; i < 5; i += 1) h.rt.onChat('p1', 'ㅇㅇ');
    expect(h.lastState().suspicion[p1Seat]).toBe(0);
  });

  it('불렀는데 답하면 회피가 아니다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    const p2Seat = h.roleOf('p2')!.seatId;
    const nn = String(h.lastState().seats.find((s) => s.id === p2Seat)!.seat).padStart(2, '0');

    h.rt.onChat('p1', `${nn} 너는 어땠어`); // 죄목 낱말이 없다 — 호명일 뿐 지목이 아니다
    expect(h.lastState().accusations[h.roleOf('p1')!.seatId]).toBeUndefined();
    h.rt.onChat('p2', '나는 그냥 서 있었는데');
    await vi.advanceTimersByTimeAsync(21_000);
    expect(h.lastState().suspicion[p2Seat]).toBe(0);
  });

  it('첫 회피부터 문다 — 불렀는데 15초 안에 답이 없으면. 안 불렸으면 아무리 조용해도 0 이다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    const p3Seat = h.roleOf('p3')!.seatId;
    const nn = String(h.lastState().seats.find((s) => s.id === p3Seat)!.seat).padStart(2, '0');

    h.rt.onChat('p1', `${nn} 너는 어땠어`);
    await vi.advanceTimersByTimeAsync(DUCK_WINDOW_MS + 1_000);
    // 2026-09-05 사용자: "대답을 회피하는 상대 · 대답을 안 하는 상대 위주로" — 첫 번을 봐주면 40초 토론에서 한 번도 안 물린다
    expect(h.lastState().suspicion[p3Seat]).toBe(SUSPICION.duck);
    // p2 는 아예 불린 적이 없다 — 판 내내 조용해도 눈금은 안 움직인다 (침묵은 벌하지 않는다)
    expect(h.lastState().suspicion[h.roleOf('p2')!.seatId]).toBe(0);
  });

  it('거듭 불러도 유예는 처음 불린 때부터다 — 부를수록 봐주면 침묵이 최적 전략이 된다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    const p3Seat = h.roleOf('p3')!.seatId;
    const nn = String(h.lastState().seats.find((s) => s.id === p3Seat)!.seat).padStart(2, '0');

    // 1차 토론의 첫 회피 — 첫 번부터 문다 (DUCK_FREE 0, 2026-09-05)
    h.rt.onChat('p1', `${nn} 너는 어땠어`);
    await vi.advanceTimersByTimeAsync(DUCK_WINDOW_MS + 1_000);
    expect(h.lastState().suspicion[p3Seat]).toBe(SUSPICION.duck);

    // 2차 토론이 **열리는 자리**까지 — 호명은 토론마다 새로 센다 (openDiscussion 의 called.clear)
    for (const p of ['test', 'result', 'discussion'] as const) {
      for (let i = 0; i < 120 && h.lastState().phase !== p; i += 1) await vi.advanceTimersByTimeAsync(1_000);
      expect(h.lastState().phase).toBe(p);
    }

    /*
     * 둘이 이어서 묻는다 — 방의 박자(3.5~10초)가 회피의 문턱(15초)보다 짧으니, 불릴 때마다 시계가
     * 0 으로 돌아가면 아무리 물어도 영영 안 물린다. 세는 것은 「처음 불린 뒤 여태 대답이 없다」다.
     */
    const before = h.lastState().suspicion[p3Seat];
    h.rt.onChat('p1', `${nn} 아까 기록 얘기 좀 해봐`);
    await vi.advanceTimersByTimeAsync(DUCK_WINDOW_MS - 5_000);
    h.rt.onChat('p2', `${nn} 왜 대답을 안 해`);
    // 아직 회피는 아니다 — 다만 이 줄이 그 좌석의 **세 번째 거론**이라 ⑩ 이 한 번 문다 (압력이 붙는다)
    const mentioned = before + Math.round(SUSPICION.mention * pressureFor(1));
    expect(h.lastState().suspicion[p3Seat]).toBe(mentioned);

    // 처음 불린 때부터 15초 — 되묻기가 유예를 늘리지 않는다. 두 번째 회피라 누계(+5)에 2차 토론의 압력이 붙는다
    await vi.advanceTimersByTimeAsync(6_000);
    expect(h.lastState().suspicion[p3Seat]).toBe(mentioned + Math.round((SUSPICION.duck + SUSPICION.repeatWeight) * pressureFor(1)));
  });

  it('죄목의 말은 「AI」만이 아니다 — 「이상해」·「로봇 같아」·「가짜」·「사람 아니야」도 지목이다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    const p1Seat = h.roleOf('p1')!.seatId;
    const other = h.lastState().seats.find((s) => s.id !== p1Seat)!;
    const given = other.name.slice(1);
    h.rt.onChat('p1', `${given}이 좀 이상해`);
    expect(h.lastState().accusations[p1Seat]).toBe(other.id);
    await h.rt.handle('p1', { t: 'game_withdraw' });
    await vi.advanceTimersByTimeAsync(5_100);
    h.rt.onChat('p1', `${given} 완전 로봇 같은데`);
    expect(h.lastState().accusations[p1Seat]).toBe(other.id);
    await h.rt.handle('p1', { t: 'game_withdraw' });
    await vi.advanceTimersByTimeAsync(5_100);
    // 「그 이상」은 아니다 — 활용형만 잡는다
    h.rt.onChat('p1', `${given} 기록은 3초 이상이었나`);
    expect(h.lastState().accusations[p1Seat]).toBeUndefined();
  });

  /*
   * ⑩ 거듭 거론 (2026-09-05 사용자: "명칭으로 계속 얘기해도 의심도가 안 올라가" / "짧게 몇 번 언급됐는데 확 올리진 말고").
   * 지목의 말 없이 이름만 오르내리면 — 두 번까지는 0, 세 번째에 +4, 다섯 번째에 +4 … 한 좌석에 12 까지.
   */
  it('이름이 자꾸 오르내리면 천천히 오른다 — 두 번은 0, 세 번째부터 두 번에 한 번 +4, 상한 12', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    // 거론되는 쪽은 말하는 셋이 아닌 넷째 좌석(AI) — 제 이름을 제가 부르는 것은 안 센다
    const mine = new Set(['p1', 'p2', 'p3'].map((p) => h.roleOf(p)!.seatId));
    const other = h.lastState().seats.find((s) => !mine.has(s.id))!;
    const given = other.name.slice(1);
    // 같은 사람의 연타는 10초 안이면 한 번이다
    h.rt.onChat('p1', `${given} 아까 뭐 했어`);
    h.rt.onChat('p1', `${given} 말이야`);
    expect(h.lastState().suspicion[other.id] ?? 0).toBe(0);
    await vi.advanceTimersByTimeAsync(MENTION_GAP_MS + 100);
    h.rt.onChat('p2', `${given} 기록 봤어?`);
    expect(h.lastState().suspicion[other.id] ?? 0).toBe(0); // 두 번 — 아직
    h.rt.onChat('p3', `${given} 그때 늦지 않았나`);
    expect(h.lastState().suspicion[other.id]).toBe(SUSPICION.mention); // 세 번째
    // 처음 불린 지 15초가 지나면 그 좌석(대답 없는 AI)은 회피(⑦)로도 한 번 물린다 — 거론과 별개의 문이다
    await vi.advanceTimersByTimeAsync(MENTION_GAP_MS + 100);
    const ducked = SUSPICION.duck;
    h.rt.onChat('p1', `${given} 얘기 좀 해 봐`);
    expect(h.lastState().suspicion[other.id]).toBe(SUSPICION.mention + ducked); // 네 번째 — 두 번에 한 번이라 거론은 그대로
    h.rt.onChat('p2', `${given} 대답이 없네`);
    expect(h.lastState().suspicion[other.id]).toBe(SUSPICION.mention * 2 + ducked); // 다섯 번째
    // 상한(mentionCap)은 장부 시험(game-rules)이 잠근다 — 여기서 더 부르면 회피가 거듭 걸려 거론만 못 잰다
  });

  it('프롤로그 방송 동안은 아무것도 안 잰다 — 못 움직이게 해 놓고 안 움직였다고 물면 안 된다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await vi.advanceTimersByTimeAsync(GAME_BRIEFING_MS + 10);
    expect(h.lastState().phase).toBe('discussion'); // 열려 있지만 아직 대본이 흐르는 중이다

    // 자리는 알려져 있고(대본이 뜨기 직전의 한 걸음), 그 뒤로 방송이 걷힐 때까지 아무도 못 움직인다.
    // 굳음 문턱(25초)을 두 번이나 넘기고도 눈금은 0 이어야 한다 — 방송은 75초까지 간다
    h.rt.onMove('p1', 3, 4, Date.now(), 0, 0);
    await vi.advanceTimersByTimeAsync(GAME_PROLOGUE_MAX_MS - 100);
    for (const s of h.lastState().seats) expect(h.lastState().suspicion[s.id]).toBe(0);

    // 방송이 걷히고 나서야 시계가 돈다
    for (const p of h.roster) await h.rt.handle(p.id, { t: 'game_prologue_done' });
    const p1Seat = h.roleOf('p1')!.seatId;
    h.rt.onMove('p1', 3, 4, Date.now(), 0, 0);
    await vi.advanceTimersByTimeAsync(STILL_MS + 500);
    expect(h.lastState().suspicion[p1Seat]).toBe(SUSPICION.still);
  });

  it('한자리에 오래 굳어 있으면 문다 — 몸은 bodyCap 안에서만 문다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    const p1Seat = h.roleOf('p1')!.seatId;

    // 한 번 자리를 알린 뒤로 move 가 안 온다 = 그 자리에 그대로 서 있다 (클라는 바뀔 때만 보낸다)
    h.rt.onMove('p1', 3, 4, Date.now(), 0, 0);
    await vi.advanceTimersByTimeAsync(STILL_MS + 500);
    expect(h.lastState().suspicion[p1Seat]).toBe(SUSPICION.still);
    expect(h.lastState().suspicion[p1Seat]).toBeLessThan(SUSPICION.bodyCap);
  });

  it('토론이 열린 뒤 한 번도 안 움직여도 문다 — 가만히 있는 것이 굳음을 피하는 길이면 안 된다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    // 브리핑에서 자리를 한 번 알린 뒤로 그 자리에 그대로 서 있다 — 클라는 바뀔 때만 보내므로 move 가 더는 안 온다
    h.rt.onMove('p1', 3, 4, Date.now(), 0, 0);
    await openBoard(h);
    const p1Seat = h.roleOf('p1')!.seatId;

    await vi.advanceTimersByTimeAsync(STILL_MS + 500);
    expect(h.lastState().suspicion[p1Seat]).toBe(SUSPICION.still);
  });

  it('토론 사이에는 몸을 새로 센다 — 시험 30초를 굳어 있었다고 치지 않는다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    const p1Seat = h.roleOf('p1')!.seatId;
    h.rt.onMove('p1', 3, 4, Date.now(), 0, 0);

    // 첫 토론 40초 — 굳음 문턱(25초)을 한 번 넘겼다. 다음은 50초라 이 토론에서는 여기까지다
    await vi.advanceTimersByTimeAsync(GAME_DISCUSSION_MS + 10);
    expect(h.lastState().phase).toBe('test');
    expect(h.lastState().suspicion[p1Seat]).toBe(SUSPICION.still);

    // 시험 30초 + 결과 모달을 지나 다음 토론으로 — 그 사이의 부동은 안 센다
    await vi.advanceTimersByTimeAsync(GAME_TEST_MS + 10);
    await vi.advanceTimersByTimeAsync(GAME_RESULT_MODAL_MS + 10);
    expect(h.lastState().phase).toBe('discussion');
    expect(h.lastState().suspicion[p1Seat]).toBe(SUSPICION.still);

    // 시계가 0 부터다 — 다시 25초를 채워야 한 번 더 물고, 두 번째는 누계만큼 무겁다
    h.rt.onMove('p1', 3, 4, Date.now(), 0, 0);
    await vi.advanceTimersByTimeAsync(STILL_MS - 2_000);
    expect(h.lastState().suspicion[p1Seat]).toBe(SUSPICION.still);
    await vi.advanceTimersByTimeAsync(2_500);
    // 두 번째는 누계만큼 무겁고, 여기는 **두 번째 토론**이라 국면 압력까지 탄다 (docs/SUSPICION.md §7)
    const second = Math.round((SUSPICION.still + SUSPICION.repeatWeight) * pressureFor(1));
    expect(h.lastState().suspicion[p1Seat]).toBe(SUSPICION.still + second);
  });
});

/**
 * 카드 (game-protocol CARD) — 시험 1등이 셋 중 하나를 고르고 토론에서 쓴다 (2026-09-05 사용자: "1등하면 카드 3개를 선택할 수 있게").
 * 지목권 +20 · 진정권 −20 · 답변 강제권(질문 → 답 → 관리 AI 판정). 1등이 봇이면 카드 없는 시험이다.
 */
describe('GameRuntime — 카드', () => {
  /** 시간제 가짜 엔진 — 좌석마다 버틴 초를 정해 준다. 판이 30초에 닫는다 */
  class HeldEngine implements GameEngine {
    readonly game = 'fall' as const;
    ids: string[] = [];
    heldOf: (id: string) => number = () => 5;
    condition() {
      return { gravity: 9.8 };
    }
    start(_round: number, real: readonly string[], ai: readonly string[]) {
      this.ids = [...real, ...ai];
    }
    stop() {}
    join() {}
    onAccel() {}
    onBrake() {}
    onMove() {}
    onPick() {}
    done() {
      return false;
    }
    results(): TrialPlayerResult[] {
      return this.ids.map((id) => ({ id, metrics: { survivalTime: this.heldOf(id), hitCount: 1, transitionError: 0.1 }, transitionError: 0.1, errorDirection: [1], adaptationCurve: [0.1] }));
    }
  }
  type Cards = Extract<GameS2CMessage, { t: 'game_cards' }>;
  const cardsTo = (h: ReturnType<typeof harness>, to: string) => [...h.direct].reverse().find((d) => d.to === to && d.msg.t === 'game_cards')?.msg as Cards | undefined;
  /** 카드는 엎어져 온다 — 시험은 harness 의 rand(0.4)로 섞인 순서를 알아 이름으로 뒤집는다 */
  const DEALT = dealOrder(() => 0.4);
  const pick = (h: ReturnType<typeof harness>, who: string, item: CardItem) => h.rt.handle(who, { t: 'game_card_pick', index: DEALT.indexOf(item) });

  /** p1 이 1등인 판을 첫 시험 뒤 토론까지 돌린다 */
  async function winFirstTest(brain?: Brain) {
    const engine = new HeldEngine();
    const h = harness({ engine, brain });
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    const winner = h.roleOf('p1')!.seatId;
    engine.heldOf = (id) => (id === winner ? 28 : 6);
    await vi.advanceTimersByTimeAsync(GAME_DISCUSSION_MS + 10);
    expect(h.lastState().phase).toBe('test');
    await vi.advanceTimersByTimeAsync(GAME_TEST_MS + 10);
    expect(h.lastState().phase).toBe('result');
    return { h, winner, engine };
  }

  it('1등에게만 카드 셋이 간다 — 고르면 그 카드를 쥐고, 남은 제안은 사라진다', async () => {
    const { h } = await winFirstTest();
    const offer = cardsTo(h, 'p1');
    expect(offer?.offer).toBe(3);
    expect(new Set(DEALT)).toEqual(new Set(CARD_ITEMS));
    expect(offer?.items).toEqual([]);
    expect(cardsTo(h, 'p2')).toBeUndefined();
    expect(cardsTo(h, 'p3')).toBeUndefined();

    await pick(h, 'p1', 'accuse');
    const held = cardsTo(h, 'p1');
    expect(held?.offer).toBeNull();
    expect(held?.items).toEqual(['accuse']);
    // 두 번 고르지는 못한다
    await pick(h, 'p1', 'calm');
    expect(cardsTo(h, 'p1')?.items).toEqual(['accuse']);
    expect(h.direct.at(-1)?.msg.t).toBe('game_reject');
  });

  it('공동 1등이면 그중 하나가 무작위로 카드를 받는다', async () => {
    for (const [rand, which] of [
      [() => 0.0, 0],
      [() => 0.99, 1],
    ] as const) {
      const engine = new HeldEngine();
      const h = harness({ engine, rand });
      await h.rt.handle('p1', { t: 'game_start' });
      await openBoard(h);
      const s1 = h.roleOf('p1')!.seatId;
      const s2 = h.roleOf('p2')!.seatId;
      engine.heldOf = (id) => (id === s1 || id === s2 ? 28 : 6);
      await vi.advanceTimersByTimeAsync(GAME_DISCUSSION_MS + 10);
      await vi.advanceTimersByTimeAsync(GAME_TEST_MS + 10);
      expect(h.lastState().phase).toBe('result');
      const got = ['p1', 'p2', 'p3'].filter((p) => cardsTo(h, p) !== undefined);
      expect(got.length).toBe(1);
      // 공동 1등은 결과표 순서(좌석 순)로 늘어서고 rand 가 그중 하나를 짚는다
      const order = h.lastState().seats.filter((s) => s.id === s1 || s.id === s2).map((s) => s.id);
      expect(h.roleOf(got[0])!.seatId).toBe(order[which]);
    }
  });

  /**
   * 봇이 1등 — 카드는 서버 안에서 봇이 쥐고, 토론에서 처지에 맞게 쓴다 (runtime 의 botCards,
   * 2026-09-05 사용자: "AI 가 우승했을 때 아이템을 얻으면 아이템을 적절하게 사용할 수 있도록").
   */
  it('1등이 봇이면 봇이 엎어진 셋 중 하나를 쥐고 — 사람에게는 아무것도 안 간다 — 토론에서 처지에 맞게 쓴다', async () => {
    const engine = new HeldEngine();
    const h = harness({ engine });
    await h.rt.handle('p1', { t: 'game_start' });
    await openBoard(h);
    const humans = new Set(['p1', 'p2', 'p3'].map((p) => h.roleOf(p)!.seatId));
    const bot = h.lastState().seats.find((s) => !humans.has(s.id))!;
    engine.heldOf = (id) => (id === bot.id ? 28 : 6);
    await vi.advanceTimersByTimeAsync(GAME_DISCUSSION_MS + 10);
    await vi.advanceTimersByTimeAsync(GAME_TEST_MS + 10);
    expect(h.lastState().phase).toBe('result');
    for (const p of ['p1', 'p2', 'p3']) expect(cardsTo(h, p)).toBeUndefined();
    expect(h.rt.itemsOf(bot.id)).toHaveLength(1);
    const item = h.rt.itemsOf(bot.id)[0];
    expect(item).toBe(DEALT[0]);

    await vi.advanceTimersByTimeAsync(GAME_RESULT_MODAL_MS + 10);
    expect(h.lastState().phase).toBe('discussion');
    // 아직 아무 처지도 아니다 — 카드를 아껴 둔다
    await vi.advanceTimersByTimeAsync(12_000);
    expect(h.sent.some((m) => m.t === 'game_card_used')).toBe(false);

    // 처지를 만든다 — 진정권이면 둘이 봇을 겨누고, 지목권·답변 강제권이면 둘이 p2 를 겨눈다 (지목 15 × 2 ≥ 문턱 25)
    const p2 = h.roleOf('p2')!.seatId;
    const victim = item === 'calm' ? bot.id : p2;
    await h.rt.handle('p1', { t: 'game_accuse', target: victim });
    await h.rt.handle('p3', { t: 'game_accuse', target: victim });
    expect(h.lastState().suspicion[victim]).toBeGreaterThanOrEqual(25);
    await vi.advanceTimersByTimeAsync(12_000);
    const used = h.sent.find((m): m is Extract<GameS2CMessage, { t: 'game_card_used' }> => m.t === 'game_card_used');
    expect(used).toBeDefined();
    expect(used!.by).toBe(bot.id);
    expect(used!.item).toBe(item);
    if (item === 'calm') expect(used!.target).toBeUndefined();
    else expect(used!.target).toBe(p2);
    expect(h.rt.itemsOf(bot.id)).toHaveLength(0);
    // 같은 카드를 또 쓰지는 않는다 — 빈손이다
    await vi.advanceTimersByTimeAsync(12_000);
    expect(h.sent.filter((m) => m.t === 'game_card_used')).toHaveLength(1);
  });

  it('지목권은 겨눈 상대를 +20 (그 국면의 압력을 곱해), 진정권은 나를 −20 — 결과 모달 중에는 못 쓴다', async () => {
    const { h, winner } = await winFirstTest();
    await pick(h, 'p1', 'accuse');
    const other = h.lastState().seats.find((s) => s.id !== winner)!;
    await h.rt.handle('p1', { t: 'game_card_use', item: 'accuse', target: other.id });
    expect(h.direct.at(-1)?.msg.t).toBe('game_reject'); // 토론 중에만
    await vi.advanceTimersByTimeAsync(GAME_RESULT_MODAL_MS + 10);
    expect(h.lastState().phase).toBe('discussion');
    await h.rt.handle('p1', { t: 'game_card_use', item: 'accuse', target: other.id });
    expect(h.lastState().suspicion[other.id]).toBe(Math.round(CARD.accuseBoost * pressureFor(1)));
    expect(cardsTo(h, 'p1')?.items).toEqual([]);
    const used = h.sent.find((m): m is Extract<GameS2CMessage, { t: 'game_card_used' }> => m.t === 'game_card_used')!;
    expect(used).toMatchObject({ by: winner, item: 'accuse', target: other.id });
    // 같은 카드를 또 쓰지는 못한다
    await h.rt.handle('p1', { t: 'game_card_use', item: 'accuse', target: other.id });
    expect(h.direct.at(-1)?.msg.t).toBe('game_reject');
  });

  it('진정권 — 몰려 있던 내 눈금이 20 내려간다 (압력을 안 곱한다)', async () => {
    const { h, winner } = await winFirstTest();
    await pick(h, 'p1', 'calm');
    await vi.advanceTimersByTimeAsync(GAME_RESULT_MODAL_MS + 10);
    const given = h.lastState().seats.find((s) => s.id === winner)!.name.slice(1);
    h.rt.onChat('p2', `${given}이 이상해`);
    const before = h.lastState().suspicion[winner];
    expect(before).toBeGreaterThan(0);
    await h.rt.handle('p1', { t: 'game_card_use', item: 'calm' });
    expect(h.lastState().suspicion[winner]).toBe(Math.max(0, before - CARD.calmDrop));
  });

  it('답변 강제권 — 내 다음 말이 질문, 상대의 다음 말이 답. 거짓이면 +25, 진실이면 −10, 회피면 +12', async () => {
    const liar: Brain = { mode: 'api', ask: async () => ({ verdict: 'false', reason: '기록은 6초라 했다' }) };
    const { h, winner } = await winFirstTest(liar);
    await pick(h, 'p1', 'truth');
    await vi.advanceTimersByTimeAsync(GAME_RESULT_MODAL_MS + 10);
    const p2Seat = h.roleOf('p2')!.seatId;
    await h.rt.handle('p1', { t: 'game_card_use', item: 'truth', target: p2Seat });
    expect(h.lastState().compelled).toMatchObject({ by: winner, target: p2Seat, question: null });
    // 남의 말은 질문이 아니다 — p1 의 다음 말이 질문이다
    h.rt.onChat('p3', '뭐야 갑자기');
    expect(h.lastState().compelled?.question).toBeNull();
    h.rt.onChat('p1', '너 낙하에서 몇 초 버텼어?');
    expect(h.lastState().compelled?.question).toBe('너 낙하에서 몇 초 버텼어?');
    const before = h.lastState().suspicion[p2Seat] ?? 0;
    h.rt.onChat('p2', '나 끝까지 버텼는데');
    await vi.advanceTimersByTimeAsync(10);
    expect(h.lastState().compelled).toBeNull();
    // 거짓은 25 × 압력이지만 한 걸음의 절대 상한(stepCap)에 걸린다
    expect(h.lastState().suspicion[p2Seat]).toBe(before + Math.min(SUSPICION.stepCap, Math.round(CARD.truthLie * pressureFor(1))));
    const judged = h.sent.find((m): m is Extract<GameS2CMessage, { t: 'game_compelled' }> => m.t === 'game_compelled')!;
    expect(judged).toMatchObject({ by: winner, target: p2Seat, verdict: 'false' });
  });

  it('답변 강제권 — 진실이면 내려 주고, 답이 없으면 마감에 회피로 문다', async () => {
    const honest: Brain = { mode: 'api', ask: async () => ({ verdict: 'truthful', reason: '기록과 맞는다' }) };
    const { h, winner } = await winFirstTest(honest);
    await pick(h, 'p1', 'truth');
    await vi.advanceTimersByTimeAsync(GAME_RESULT_MODAL_MS + 10);
    const p2Seat = h.roleOf('p2')!.seatId;
    const given2 = h.lastState().seats.find((s) => s.id === p2Seat)!.name.slice(1);
    h.rt.onChat('p3', `${given2}이 이상해`); // 먼저 몰아 둔다 — 내려갈 것이 있어야 보인다
    const before = h.lastState().suspicion[p2Seat];
    await h.rt.handle('p1', { t: 'game_card_use', item: 'truth', target: p2Seat });
    h.rt.onChat('p1', '너 낙하에서 몇 초 버텼어?');
    h.rt.onChat('p2', '6초쯤 버텼어');
    await vi.advanceTimersByTimeAsync(10);
    expect(h.lastState().suspicion[p2Seat]).toBe(Math.max(0, before + CARD.truthHonest));
    expect(h.lastState().compelled).toBeNull();
    void winner;
  });

  it('답변 강제권 — 판별자는 비공개 장부(전원의 배역)를 받는다. 정체를 묻는 질문에 AI 가 부인하면 거짓', async () => {
    const asked: string[] = [];
    const brain: Brain = {
      mode: 'api',
      ask: async (a) => {
        asked.push(a.user);
        return { verdict: 'false', reason: '장부와 다르다' };
      },
    };
    const { h } = await winFirstTest(brain);
    await pick(h, 'p1', 'truth');
    await vi.advanceTimersByTimeAsync(GAME_RESULT_MODAL_MS + 10);
    const p2Seat = h.roleOf('p2')!.seatId;
    const p2Name = h.lastState().seats.find((s) => s.id === p2Seat)!.name;
    await h.rt.handle('p1', { t: 'game_card_use', item: 'truth', target: p2Seat });
    h.rt.onChat('p1', '너 AI야?');
    const before = h.lastState().suspicion[p2Seat] ?? 0;
    h.rt.onChat('p2', '아니, 나는 사람이야');
    await vi.advanceTimersByTimeAsync(50);
    const judged = asked.find((u) => u.includes('비공개 장부'))!;
    expect(judged).toBeDefined();
    // 전원의 배역이 장부에 선다 — 답한 사람의 줄에 그 배역이 있다
    const roleWord = { human: '사람', designer: 'AI 설계자', ai: 'AI (' }[h.roleOf('p2')!.role];
    expect(judged).toContain(`- ${p2Name}: 배역 ${roleWord}`);
    expect(h.lastState().suspicion[p2Seat]).toBe(before + Math.min(SUSPICION.stepCap, Math.round(CARD.truthLie * pressureFor(1))));
  });

  it('답변 강제권 — 질문이 나왔는데 15초까지 답이 없으면 무응답으로 문다 (+25 · 거짓과 같은 상한). 14초까지는 아무 일도 없다', async () => {
    expect(CARD.answerMs).toBe(15_000);
    expect(CARD.truthSilent).toBe(25); // 헌법 13 — 단일 증가 상한
    const { h } = await winFirstTest();
    await pick(h, 'p1', 'truth');
    await vi.advanceTimersByTimeAsync(GAME_RESULT_MODAL_MS + 10);
    const p2Seat = h.roleOf('p2')!.seatId;
    await h.rt.handle('p1', { t: 'game_card_use', item: 'truth', target: p2Seat });
    h.rt.onChat('p1', '너 낙하에서 몇 초 버텼어?');
    const before = h.lastState().suspicion[p2Seat] ?? 0;
    await vi.advanceTimersByTimeAsync(14_000);
    expect(h.lastState().compelled).not.toBeNull();
    expect(h.lastState().suspicion[p2Seat] ?? 0).toBe(before);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.lastState().compelled).toBeNull();
    expect(h.lastState().suspicion[p2Seat]).toBe(before + Math.min(SUSPICION.stepCap, Math.round(CARD.truthSilent * pressureFor(1))));
    const judged = h.sent.find((m): m is Extract<GameS2CMessage, { t: 'game_compelled' }> => m.t === 'game_compelled')!;
    expect(judged.verdict).toBe('silent');
    expect(judged.text).toContain('답하지 않았다');
  });

  it('답변 강제권 — 강제된 답은 발언권을 안 쓴다. 지갑이 빈 사람도 답할 수 있고, 무응답 +25 의 함정에 안 걸린다', async () => {
    const honest: Brain = { mode: 'api', ask: async () => ({ verdict: 'truthful', reason: '기록과 맞는다' }) };
    const { h } = await winFirstTest(honest);
    await pick(h, 'p1', 'truth');
    await vi.advanceTimersByTimeAsync(GAME_RESULT_MODAL_MS + 10);
    const p2Seat = h.roleOf('p2')!.seatId;
    // p2 의 지갑을 비운다 — 차감은 game_talk 로만 나간다 (game_state 는 말마다 안 쏜다)
    const talkOf = (id: string) =>
      h.sent.filter((m): m is Extract<GameS2CMessage, { t: 'game_talk' }> => m.t === 'game_talk').at(-1)?.talk[id] ?? h.lastState().talk[id];
    for (let i = 0; i < TALK.start + TALK.carry + 20 && (talkOf(p2Seat) ?? 0) > 0; i++) h.rt.onChat('p2', '나는 사람이다');
    expect(talkOf(p2Seat)).toBe(0);
    h.rt.onChat('p2', '한 마디 더');
    expect(h.direct.at(-1)?.msg).toMatchObject({ t: 'game_reject' });
    await h.rt.handle('p1', { t: 'game_card_use', item: 'truth', target: p2Seat });
    h.rt.onChat('p1', '너 낙하에서 몇 초 버텼어?');
    const rejects = h.direct.filter((d) => d.msg.t === 'game_reject').length;
    h.rt.onChat('p2', '6초쯤 버텼어'); // 지갑이 비었지만 강제된 답이라 나간다
    await vi.advanceTimersByTimeAsync(10);
    expect(h.direct.filter((d) => d.msg.t === 'game_reject').length).toBe(rejects);
    expect(talkOf(p2Seat)).toBe(0);
    expect(h.lastState().compelled).toBeNull();
    const judged = h.sent.find((m): m is Extract<GameS2CMessage, { t: 'game_compelled' }> => m.t === 'game_compelled')!;
    expect(judged.verdict).toBe('truthful');
  });
});

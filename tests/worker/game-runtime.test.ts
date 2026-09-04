/**
 * worker/src/game/runtime.ts — 판 한 바퀴를 가짜 부품(명부 · 방송 수집기 · 가짜 엔진 · 가짜 두뇌)으로 돌린다.
 *
 * 여기서 반드시 잡는 것 셋:
 *   1. 와이어에 정체가 없다 — game_state 의 좌석 어디에도 kind/role 이 없고, 격리 전엔 revealed 도 없다 (P-원칙).
 *   2. 판이 도는 동안 사람의 채팅은 좌석 이름으로 나간다 (플레이어 id · 닉네임이 사라진다).
 *   3. 의심도는 지목으로만 움직이고, 100 이면 격리 · 정체 공개 · 승패로 이어진다 (P1 · §1.2 · §1.3).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_BRIEFING_MS, GAME_FIRST_DISCUSSION_MS, GAME_RESULT_MODAL_MS, type GameS2CMessage, type GameStateWire } from '../../src/world/mp/game-protocol';
import type { PlayerSnapshot, S2CMessage, TrialPlayerResult } from '../../src/world/mp/protocol';
import type { Brain } from '../../worker/src/game/brain';
import { GameRuntime } from '../../worker/src/game/runtime';
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

function harness(opts: { players?: PlayerSnapshot[]; brain?: Brain } = {}) {
  const roster = opts.players ?? [player('p1', 1), player('p2', 2), player('p3', 3)];
  const sent: Out[] = [];
  const direct: { to: string; msg: Out }[] = [];
  const engine = new FakeEngine();
  const rt = new GameRuntime({
    storage: fakeStorage(),
    roster: () => roster,
    broadcast: (m) => sent.push(m),
    sendTo: (to, msg) => {
      direct.push({ to, msg });
      return true;
    },
    brain: opts.brain ?? silentBrain,
    makeEngine: () => engine,
    rand: () => 0.4,
  });
  const lastState = () => [...sent].reverse().find((m): m is { t: 'game_state'; state: GameStateWire } => m.t === 'game_state')!.state;
  const roleOf = (to: string) => [...direct].reverse().find((d) => d.to === to && d.msg.t === 'game_role')?.msg as Extract<GameS2CMessage, { t: 'game_role' }> | undefined;
  return { rt, sent, direct, engine, roster, lastState, roleOf };
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
    expect(state.seats.map((s) => s.name)).toEqual(['SUBJECT 01', 'SUBJECT 02', 'SUBJECT 03', 'SUBJECT 04', 'SUBJECT 05', 'SUBJECT 06']);
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
    expect(chat.nickname).toMatch(/^SUBJECT \d\d$/);
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
    expect(h.lastState().suspicion[other.id]).toBe(8);
    expect(h.lastState().accusations[p1Seat]).toBe(other.id);
    // 잡담은 안 움직인다
    h.rt.onChat('p1', `${nn} 오늘 날씨 좋다`);
    await vi.advanceTimersByTimeAsync(6_000);
    h.rt.onChat('p1', '아 배고파');
    expect(h.lastState().suspicion[other.id]).toBe(8);
  });

  it('브리핑 → 토론 → 테스트 → 결과 모달 → 토론 으로 흐른다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await vi.advanceTimersByTimeAsync(GAME_BRIEFING_MS + 10);
    expect(h.lastState().phase).toBe('discussion');
    expect(h.sent.some((m) => m.t === 'game_leader')).toBe(true);

    await vi.advanceTimersByTimeAsync(GAME_FIRST_DISCUSSION_MS + 10);
    expect(h.lastState().phase).toBe('test');
    expect(h.sent.some((m) => m.t === 'trial_round_start')).toBe(true);
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
    expect(h.lastState().suspicion[aiSeat.id]).toBe(8);
    await h.rt.handle('p2', { t: 'game_accuse', target: aiSeat.id });
    expect(h.lastState().suspicion[aiSeat.id]).toBe(15);
    await h.rt.handle('p2', { t: 'game_withdraw' });
    expect(h.lastState().suspicion[aiSeat.id]).toBe(8);
    // 같은 사람의 연타는 서버가 5초에 한 번만 받는다
    await h.rt.handle('p1', { t: 'game_accuse', target: aiSeat.id });
    expect(h.lastState().suspicion[aiSeat.id]).toBe(8);
    await vi.advanceTimersByTimeAsync(5_100);
    await h.rt.handle('p1', { t: 'game_accuse', target: aiSeat.id });
    expect(h.lastState().suspicion[aiSeat.id]).toBe(11);

    // 100 까지 — 주장 판정으로 채운다 (가짜 두뇌가 불일치를 낸다)
    const liar: Brain = { mode: 'api', ask: async () => ({ verdict: 'mismatch', reason: '기록이 다르다' }) };
    const h2 = harness({ brain: liar });
    await h2.rt.handle('p1', { t: 'game_start' });
    await vi.advanceTimersByTimeAsync(GAME_BRIEFING_MS + 10);
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
    // 거짓 해명 열 번 → p1 100 → 격리 · 사람이었다 · 판은 계속 (목표 2 중 1)
    const iso = h2.sent.find((m): m is Extract<GameS2CMessage, { t: 'game_isolated' }> => m.t === 'game_isolated');
    expect(iso?.id).toBe(p1Seat);
    expect(iso?.role === 'human' || iso?.role === 'designer').toBe(true);
    expect(h2.lastState().seats.find((s) => s.id === p1Seat)?.revealed).toBe(iso?.role);
    expect(h2.lastState().seats.find((s) => s.id === ai2.id)?.revealed).toBeUndefined();
  });

  it('셋이 AI 를 거듭 몰면 100 — 격리 · AI 였다 · 사람 승리로 끝나고 정체표가 공개된다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start' });
    await vi.advanceTimersByTimeAsync(GAME_BRIEFING_MS + 10);
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
  });

  it('설계자 조작은 다음 결과의 공개본을 바꾸고, 원본은 그대로다', async () => {
    // 6명이면 설계자 상한 2, rand 0.4 → floor(0.4*3)=1 명
    const six = [1, 2, 3, 4, 5, 6].map((i) => player(`p${i}`, i));
    const h = harness({ players: six });
    await h.rt.handle('p1', { t: 'game_start' });
    const designer = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].find((p) => h.roleOf(p)!.role === 'designer');
    expect(designer).toBeDefined();
    const role = h.roleOf(designer!)!;
    expect(role.aiId).toBeDefined();
    expect(role.tamperLeft).toBe(1);

    await vi.advanceTimersByTimeAsync(GAME_BRIEFING_MS + 10);
    await h.rt.handle(designer!, { t: 'game_tamper', target: role.aiId!, direction: 'suspicious' });
    expect(h.direct.at(-1)?.msg).toMatchObject({ t: 'game_tamper_ok', left: 0 });
    await h.rt.handle(designer!, { t: 'game_tamper', target: role.aiId!, direction: 'suspicious' });
    expect(h.direct.at(-1)?.msg.t).toBe('game_reject');

    await vi.advanceTimersByTimeAsync(GAME_FIRST_DISCUSSION_MS + 10);
    await h.rt.handleTrial('p1', { t: 'trial_brake' });
    const result = h.sent.find((m): m is Extract<S2CMessage, { t: 'trial_result' }> => m.t === 'trial_result')!.result;
    const raw = h.engine.results().find((p) => p.id === role.aiId)!;
    const pub = result.players.find((p) => p.id === role.aiId)!;
    // 「튀게」 — 기계처럼: 오차 방향이 한쪽으로, 전환 직후 오차가 거의 0
    expect(pub.errorDirection).toEqual([1, 1]);
    expect(pub.transitionError).toBeLessThan(0.2);
    expect(raw.errorDirection).toEqual([1, -1]);
    // 다른 사람의 공개본은 그대로다
    const other = result.players.find((p) => p.id !== role.aiId)!;
    expect(other.errorDirection).toEqual([1, -1]);
  });
});

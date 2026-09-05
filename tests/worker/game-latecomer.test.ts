/**
 * 「게임 시작」을 같이 눌렀는데 **판이 먼저 열려 버린 사람** — worker/src/game/runtime.ts 의 rebind.
 *
 * 대기방의 전원이 같은 순간에 검문소로 넘어가도 소켓은 한 사람씩 붙고, 판은 첫 사람이 붙는 그 순간 열린다
 * (화면의 AUTO_SEATS 자동 시작). 늦게 붙은 사람은 시작 명부에 없어 좌석이 없었다 — 판이 끝날 때까지 말도
 * 못 하고 몸도 안 움직였다 (2026-09-05 사용자: "게임 시작 되면 움직여지는 사람이 있고 안움직여지는 방이 있어").
 *
 * 그래서 **배역 통보(briefing) 동안 도착한 사람은 대역의 자리에 앉힌다.** 그 몇 초 동안은 아무 일도
 * 일어나지 않았으니 자리의 주인만 바뀌면 된다. 토론이 시작된 뒤에 온 사람은 예전대로 구경한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_BRIEFING_MS, type GameS2CMessage, type GameStateWire } from '../../src/world/mp/game-protocol';
import type { PlayerSnapshot, S2CMessage } from '../../src/world/mp/protocol';
import type { Brain } from '../../worker/src/game/brain';
import { GameRuntime } from '../../worker/src/game/runtime';

type Out = S2CMessage | GameS2CMessage;

function fakeStorage() {
  const cell = new Map<string, unknown>();
  return {
    get: async (k: string) => cell.get(k),
    put: async (k: string, v: unknown) => void cell.set(k, v),
    delete: async (k: string) => void cell.delete(k),
    list: async () => new Map<string, unknown>(),
  } as unknown as DurableObjectStorage;
}

function player(id: string, seat: number, nickname = `닉${seat}`): PlayerSnapshot {
  return { id, seat, nickname, x: 0, z: 0, y: 0, heading: 0, anim: 'idle' };
}

const silentBrain: Brain = { mode: 'none', ask: async () => null };

/** 명부가 **자라는** 판 — 판이 열린 뒤에 사람이 하나씩 붙는다 (join 이 명부에 넣고 onJoin 을 부른다) */
function harness(start: PlayerSnapshot[] = [player('p1', 1)]) {
  const roster: PlayerSnapshot[] = [...start];
  const sent: Out[] = [];
  const direct: { to: string; msg: Out }[] = [];
  const rt = new GameRuntime({
    storage: fakeStorage(),
    roster: () => roster,
    broadcast: (m) => sent.push(m),
    sendTo: (to, msg) => {
      direct.push({ to, msg });
      return true;
    },
    brain: silentBrain,
    makeEngine: () => null,
    rand: () => 0.4,
  });
  const join = async (id: string, seat: number, nickname?: string) => {
    roster.push(player(id, seat, nickname));
    await rt.onJoin(id);
  };
  /** 창을 닫았다 — 명부에서 빠진다 (새로고침은 leave 뒤 join 이다: 소켓이 새로 열리니 id 도 새것) */
  const leave = (id: string) => {
    roster.splice(roster.findIndex((p) => p.id === id), 1);
    rt.onLeave(id);
  };
  const roleOf = (to: string) => [...direct].reverse().find((d) => d.to === to && d.msg.t === 'game_role')?.msg as Extract<GameS2CMessage, { t: 'game_role' }> | undefined;
  const lastState = () => [...sent].reverse().find((m): m is { t: 'game_state'; state: GameStateWire } => m.t === 'game_state')!.state;
  return { rt, roster, sent, direct, join, leave, roleOf, lastState };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('늦게 붙은 사람', () => {
  it('배역 통보 중에 오면 대역의 자리에 앉는다 — 좌석 수는 그대로다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start', fillTo: 3 }); // 사람 1 + 대역 2 + AI 1
    const before = h.lastState().seats.map((s) => s.id);
    expect(before).toHaveLength(4);

    await h.join('p2', 2);
    const seatOfP2 = h.roleOf('p2');
    expect(seatOfP2).toBeDefined();
    expect(seatOfP2!.seatId).not.toBe(h.roleOf('p1')!.seatId);
    // 자리를 **새로 만들지 않는다** — 이미 서 있던 대역의 자리를 물려받는다 (남들 화면의 몸·이름이 그대로다)
    expect(before).toContain(seatOfP2!.seatId);

    // 셋째도 남은 대역 자리에 앉고, 넷째는 앉을 대역이 없다 (남은 자리는 AI 것뿐이다)
    await h.join('p3', 3);
    const seatOfP3 = h.roleOf('p3');
    expect(seatOfP3).toBeDefined();
    expect(new Set([h.roleOf('p1')!.seatId, seatOfP2!.seatId, seatOfP3!.seatId]).size).toBe(3);
    await h.join('p4', 4);
    expect(h.roleOf('p4')).toBeUndefined();
  });

  it('토론이 시작된 뒤에 오면 그대로 구경한다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start', fillTo: 3 });
    await vi.advanceTimersByTimeAsync(GAME_BRIEFING_MS + 10);
    expect(h.lastState().phase).not.toBe('briefing');

    await h.join('p2', 2);
    expect(h.roleOf('p2')).toBeUndefined();
    // 구경꾼의 이동은 판에 안 들어간다 — 좌석이 없으니 몸을 읽을 자리도 없다
    expect(() => h.rt.onMove('p2', 1, 1, Date.now())).not.toThrow();
  });

  it('새로고침한 사람의 자리를 **같은 이름의 딴 사람**이 뺏지 못한다', async () => {
    // 셋이 앉은 판. 둘은 이름이 같다 — 저장된 게스트 이름 그대로 창을 두 개 연 길이다
    const h = harness([player('p1', 1, '이유경'), player('p2', 2, '이유경'), player('p3', 3, '딴사람')]);
    await h.rt.handle('p1', { t: 'game_start' });
    const seatOfP2 = h.roleOf('p2')!.seatId;

    // p2 가 새로고침한다 — 소켓이 새로 열려 id 가 바뀐다. 같은 이름이라 제 자리로 돌아온다
    h.leave('p2');
    await h.join('p2b', 2, '이유경');
    expect(h.roleOf('p2b')!.seatId).toBe(seatOfP2);

    // 이제 **또 다른** 「이유경」이 들어온다. p2 의 옛 표가 남아 있으면 그 자리를 또 준다 — 한 좌석에 둘
    await h.join('p2c', 4, '이유경');
    expect(h.roleOf('p2c')?.seatId).not.toBe(seatOfP2);
  });

  it('자리를 물려받은 대역은 더는 스스로 말하지 않는다', async () => {
    const h = harness();
    await h.rt.handle('p1', { t: 'game_start', fillTo: 3 });
    await h.join('p2', 2);
    const seatId = h.roleOf('p2')!.seatId;
    // 그 좌석으로 들어온 채팅은 **사람의 말**로 처리된다 (봇의 입은 persona 로 도는데 그것을 뗐다)
    expect(h.rt.onChat('p2', '나 방금 들어왔다')).toBe(true);
    const chat = h.sent.at(-1) as Extract<S2CMessage, { t: 'chat' }>;
    expect(chat.t).toBe('chat');
    expect(chat.id).toBe(seatId);
  });
});

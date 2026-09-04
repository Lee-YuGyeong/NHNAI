/**
 * worker/src/trial/runtime.ts 를 RoomDO 를 통해 통짜로 돌려본다 — room-do.test.ts 와 같은
 * 규칙(가짜 소켓 쌍 + 가짜 storage, 나머지는 진짜 RoomDO/TrialRuntime)을 쓴다.
 *
 * 여기서 반드시 확인할 것 하나: trial_result 로 나가는 JSON 어디에도 condition(마찰계수)이
 * 없다는 것 — PLANNING P8을 코드 리뷰가 아니라 이 시험이 지킨다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomDO } from '../../worker/src/room-do';
import { PROTOCOL_VERSION } from '../../src/world/mp/constants';
import type { S2CMessage } from '../../src/world/mp/protocol';

const ENV = {} as never;
const ROOM = '5678';

/* ═══════════════════════════ 플랫폼 껍데기 (room-do.test.ts 와 같다) ═══════════════════════════ */

class FakeSocket {
  readyState = 1; // WebSocket.OPEN
  sent: S2CMessage[] = [];
  closed: { code: number; reason: string } | null = null;
  private attachment: unknown = null;
  accept(): void {}
  send(payload: string): void {
    this.sent.push(JSON.parse(payload) as S2CMessage);
  }
  close(code = 1000, reason = ''): void {
    this.readyState = 3;
    this.closed = { code, reason };
  }
  serializeAttachment(v: unknown): void {
    this.attachment = v;
  }
  deserializeAttachment(): unknown {
    return this.attachment;
  }
}

let pairs: { 0: FakeSocket; 1: FakeSocket }[] = [];

class FakeWebSocketPair {
  0 = new FakeSocket();
  1 = new FakeSocket();
  constructor() {
    pairs.push(this as never);
  }
}

/** room-do.test.ts 의 fakeCtx 에 storage.list 만 더했다 — trial/history.ts 가 그것도 쓴다 */
function fakeCtx() {
  const sockets: FakeSocket[] = [];
  const cell = new Map<string, unknown>();
  let alarm: number | null = null;
  return {
    cell,
    setWebSocketAutoResponse(): void {},
    acceptWebSocket(ws: FakeSocket): void {
      sockets.push(ws);
    },
    getWebSockets(): FakeSocket[] {
      return sockets;
    },
    getWebSocketAutoResponseTimestamp(): Date | null {
      return null;
    },
    storage: {
      get: async (k: string) => cell.get(k),
      put: async (k: string, v: unknown) => void cell.set(k, v),
      delete: async (k: string) => void cell.delete(k),
      list: async ({ prefix }: { prefix: string }) => {
        const out = new Map<string, unknown>();
        for (const [k, v] of cell) if (k.startsWith(prefix)) out.set(k, v);
        return out;
      },
      getAlarm: async () => alarm,
      setAlarm: async (t: number) => void (alarm = t),
    },
  };
}

async function knock(doo: RoomDO, nick: string): Promise<FakeSocket> {
  const url = new URL(`https://do/rooms/${ROOM}/ws`);
  url.searchParams.set('v', String(PROTOCOL_VERSION));
  url.searchParams.set('nick', nick);
  await doo.fetch(new Request(url, { headers: { Upgrade: 'websocket' } }));
  return pairs[pairs.length - 1][1];
}

const selfIdOf = (sock: FakeSocket): string => (sock.sent[0] as { selfId: string }).selfId;
const send = (doo: RoomDO, ws: FakeSocket, msg: unknown) => doo.webSocketMessage(ws as never, JSON.stringify(msg));

async function runAttempt(doo: RoomDO, ws: FakeSocket): Promise<void> {
  await send(doo, ws, { t: 'trial_accel' });
  await send(doo, ws, { t: 'trial_brake' });
}

beforeEach(() => {
  pairs = [];
  vi.stubGlobal(
    'Response',
    class {
      constructor(readonly body: unknown, readonly init?: { status?: number }) {}
      get status(): number {
        return this.init?.status ?? 200;
      }
    },
  );
  vi.stubGlobal('WebSocketPair', FakeWebSocketPair);
  vi.stubGlobal('WebSocketRequestResponsePair', class {});
  vi.stubGlobal('WebSocket', { OPEN: 1 });
});
afterEach(() => vi.unstubAllGlobals());

/* ═══════════════════════════════ 시험 ═══════════════════════════════ */

describe('정지선 — 한 방 전체 흐름 (1분 시간제)', () => {
  it('trial_join 하면 판이 열리고, 방 정원보다 적게 모여도 AI 좌석이 채워 1분치를 미리 뛴다', async () => {
    const doo = new RoomDO(fakeCtx() as never, ENV);
    const me = await knock(doo, '나');
    await send(doo, me, { t: 'trial_join' });

    expect(me.sent).toContainEqual(expect.objectContaining({ t: 'trial_round_start', game: 'stopline', round: 1, durationMs: 60_000 }));

    const waypoints = me.sent.filter((m) => m.t === 'trial_stopline_waypoints') as Extract<S2CMessage, { t: 'trial_stopline_waypoints' }>[];
    const aiIds = new Set(waypoints.map((m) => m.id).filter((id) => id.startsWith('SUBJECT_')));
    expect(aiIds.size).toBeGreaterThan(0);
    for (const id of aiIds) expect(waypoints.filter((m) => m.id === id).length).toBeGreaterThanOrEqual(6); // 구간 셋 × 최대 3회
  });

  it('1분이 지나면 판이 닫히고 결과가 온다 — 결과 어디에도 조건값이 없고, 다음 판은 저절로 안 열린다', async () => {
    vi.useFakeTimers();
    try {
      const doo = new RoomDO(fakeCtx() as never, ENV);
      const me = await knock(doo, '나');
      const myId = selfIdOf(me);
      await send(doo, me, { t: 'trial_join' });
      me.sent = [];

      await runAttempt(doo, me);
      await vi.advanceTimersByTimeAsync(25_000); // 구간 2
      await runAttempt(doo, me);
      await vi.advanceTimersByTimeAsync(40_000); // 1분 넘김

      const resultMsg = me.sent.find((m) => m.t === 'trial_result') as Extract<S2CMessage, { t: 'trial_result' }> | undefined;
      expect(resultMsg).toBeTruthy();
      expect(resultMsg!.result.game).toBe('stopline');
      const myRow = resultMsg!.result.players.find((p) => p.id === myId);
      expect(myRow).toBeTruthy();
      expect(myRow!.adaptationCurve).toHaveLength(2);
      expect(myRow!.errorDirection).toHaveLength(2);
      expect(myRow!.metrics.attempts).toBe(2);
      expect(resultMsg!.result.groupMean.meanAbsError).toBeTypeOf('number');

      // ★ P8 — 와이어 어디에도 조건값(마찰계수)이 없다. 타입에도, 실제 JSON 에도.
      expect('condition' in resultMsg!.result).toBe(false);
      expect(JSON.stringify(resultMsg)).not.toMatch(/friction/i);

      // 미니게임 하나 = 판 하나 — 두 번째 round_start 는 없다
      expect(me.sent.filter((m) => m.t === 'trial_round_start')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('판이 끝난 뒤 다시 trial_join 하면 새 판이 열린다', async () => {
    vi.useFakeTimers();
    try {
      const doo = new RoomDO(fakeCtx() as never, ENV);
      const me = await knock(doo, '나');
      await send(doo, me, { t: 'trial_join' });
      await vi.advanceTimersByTimeAsync(61_000);
      expect(me.sent.filter((m) => m.t === 'trial_result')).toHaveLength(1);

      me.sent = [];
      await send(doo, me, { t: 'trial_join', game: 'fall' });
      expect(me.sent).toContainEqual(expect.objectContaining({ t: 'trial_round_start', game: 'fall' }));
      const history = me.sent.find((m) => m.t === 'trial_history') as Extract<S2CMessage, { t: 'trial_history' }>;
      expect(history.results).toHaveLength(1); // 지난 판이 기록에 남았다
    } finally {
      vi.useRealTimers();
    }
  });

  it('판 도중 들어온 사람(새로고침 = 새 id)도 지금 판을 받고 시행할 수 있다', async () => {
    const doo = new RoomDO(fakeCtx() as never, ENV);
    const host = await knock(doo, '방장');
    await send(doo, host, { t: 'trial_join' });

    const late = await knock(doo, '늦참');
    const lateId = selfIdOf(late);
    await send(doo, late, { t: 'trial_join' });
    expect(late.sent).toContainEqual(expect.objectContaining({ t: 'trial_round_start', round: 1 }));

    late.sent = [];
    await runAttempt(doo, late);
    expect(late.sent.some((m) => m.t === 'trial_stopline_waypoints' && (m as { id: string }).id === lateId)).toBe(true);
  });

  it('낙하 생존 — 1분이 지나면 스스로 닫히고, 스냅샷·결과 어디에도 중력값이 없다', async () => {
    vi.useFakeTimers();
    try {
      const doo = new RoomDO(fakeCtx() as never, ENV);
      const me = await knock(doo, '나');
      await send(doo, me, { t: 'trial_join', game: 'fall' });
      expect(me.sent).toContainEqual(expect.objectContaining({ t: 'trial_round_start', game: 'fall', round: 1, durationMs: 60_000 }));

      // 마당 안에서 조금 걷는다 — 서버가 내 자리를 알아야 위협·피격을 잰다
      await send(doo, me, { t: 'move', x: 0, z: 0, y: 0, heading: 0, anim: 'walk' });
      await vi.advanceTimersByTimeAsync(3000);
      await send(doo, me, { t: 'move', x: 1.5, z: 0.5, y: 0, heading: 0, anim: 'walk' });
      await vi.advanceTimersByTimeAsync(58_000);

      const snapshots = me.sent.filter((m) => m.t === 'trial_snapshot') as Extract<S2CMessage, { t: 'trial_snapshot' }>[];
      expect(snapshots.length).toBeGreaterThan(300); // 10Hz × 60초
      expect(snapshots.some((s) => s.objects.some((o) => typeof o.k === 'number'))).toBe(true); // 공 종류가 실린다
      const result = me.sent.find((m) => m.t === 'trial_result') as Extract<S2CMessage, { t: 'trial_result' }> | undefined;
      expect(result).toBeTruthy();
      expect(result!.result.game).toBe('fall');
      const mine = result!.result.players.find((p) => p.id === selfIdOf(me));
      expect(mine).toBeTruthy();
      for (const k of ['survivalTime', 'hitCount', 'unnecessaryMoves']) expect(mine!.metrics).toHaveProperty(k);
      expect(result!.result.players.some((p) => p.id.startsWith('SUBJECT_'))).toBe(true);

      // ★ P8 — 스냅샷에도 결과에도 중력이 없다
      expect(JSON.stringify(me.sent)).not.toMatch(/gravity/i);
      expect(me.sent.filter((m) => m.t === 'trial_round_start')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('브레이크만 오고 액셀이 없으면 조용히 버린다 — 위조된 시행이 안 생긴다', async () => {
    const doo = new RoomDO(fakeCtx() as never, ENV);
    const me = await knock(doo, '나');
    await send(doo, me, { t: 'trial_join' });
    const myId = selfIdOf(me);
    me.sent = [];

    await send(doo, me, { t: 'trial_brake' }); // accel 없이 brake만
    const mine = me.sent.filter((m) => m.t === 'trial_stopline_waypoints' && (m as { id: string }).id === myId);
    expect(mine).toHaveLength(0);
    expect(me.sent.some((m) => m.t === 'trial_result')).toBe(false);
  });
});

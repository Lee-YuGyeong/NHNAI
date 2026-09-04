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

describe('정지선 — 한 방 전체 흐름', () => {
  it('trial_join 하면 라운드가 열리고, 방 정원보다 적게 모여도 AI 좌석이 채워 3회씩 뛴다', async () => {
    const doo = new RoomDO(fakeCtx() as never, ENV);
    const me = await knock(doo, '나');
    await send(doo, me, { t: 'trial_join' });

    expect(me.sent).toContainEqual(expect.objectContaining({ t: 'trial_round_start', game: 'stopline', round: 1 }));

    const waypoints = me.sent.filter((m) => m.t === 'trial_stopline_waypoints') as Extract<S2CMessage, { t: 'trial_stopline_waypoints' }>[];
    const aiIds = new Set(waypoints.map((m) => m.id).filter((id) => id.startsWith('SUBJECT_')));
    expect(aiIds.size).toBeGreaterThan(0);
    for (const id of aiIds) expect(waypoints.filter((m) => m.id === id)).toHaveLength(3);
  });

  it('실제 플레이어가 3회를 마치면 라운드가 즉시 끝나고, 결과 어디에도 조건값이 없다', async () => {
    const doo = new RoomDO(fakeCtx() as never, ENV);
    const me = await knock(doo, '나');
    const myId = selfIdOf(me); // sent[0]('welcome')을 읽어야 하니, sent를 비우기 전에 잡아 둔다
    await send(doo, me, { t: 'trial_join' });
    me.sent = []; // round 1의 round_start/AI 시행은 이미 확인했으니 비우고 다시 본다

    await runAttempt(doo, me);
    await runAttempt(doo, me);
    await runAttempt(doo, me);

    const resultMsg = me.sent.find((m) => m.t === 'trial_result') as Extract<S2CMessage, { t: 'trial_result' }> | undefined;
    expect(resultMsg).toBeTruthy();
    expect(resultMsg!.result.round).toBe(1);
    expect(resultMsg!.result.game).toBe('stopline');

    const myRow = resultMsg!.result.players.find((p) => p.id === myId);
    expect(myRow).toBeTruthy();
    expect(myRow!.adaptationCurve).toHaveLength(3);
    expect(myRow!.errorDirection).toHaveLength(3);
    expect(typeof myRow!.transitionError).toBe('number');
    expect(resultMsg!.result.groupMean.stopError).toBeTypeOf('number');

    // ★ P8 — 와이어 어디에도 조건값(마찰계수)이 없다. 타입에도, 실제 JSON 에도.
    expect('condition' in resultMsg!.result).toBe(false);
    expect(JSON.stringify(resultMsg)).not.toMatch(/friction/i);

    // 라운드 2가 곧바로 열렸다
    expect(me.sent).toContainEqual(expect.objectContaining({ t: 'trial_round_start', round: 2 }));
  });

  it('3라운드까지 돌면 새 라운드를 더 열지 않는다', async () => {
    const doo = new RoomDO(fakeCtx() as never, ENV);
    const me = await knock(doo, '나');
    await send(doo, me, { t: 'trial_join' });

    for (let round = 0; round < 3; round += 1) {
      await runAttempt(doo, me);
      await runAttempt(doo, me);
      await runAttempt(doo, me);
    }

    const results = me.sent.filter((m) => m.t === 'trial_result');
    expect(results).toHaveLength(3);
    expect(me.sent.some((m) => m.t === 'trial_round_start' && (m as { round: number }).round === 4)).toBe(false);
  });

  it('새로 들어온 사람은 trial_history 로 이미 끝난 라운드 기록을 조건값 없이 백필받는다', async () => {
    const doo = new RoomDO(fakeCtx() as never, ENV);
    const host = await knock(doo, '방장');
    await send(doo, host, { t: 'trial_join' });
    await runAttempt(doo, host);
    await runAttempt(doo, host);
    await runAttempt(doo, host);

    const late = await knock(doo, '늦참');
    await send(doo, late, { t: 'trial_join' });

    const history = late.sent.find((m) => m.t === 'trial_history') as Extract<S2CMessage, { t: 'trial_history' }> | undefined;
    expect(history).toBeTruthy();
    expect(history!.results).toHaveLength(1);
    expect('condition' in history!.results[0]).toBe(false);
  });

  it('라운드 도중 들어온 사람(새로고침 = 새 id)도 지금 라운드를 받고 시행할 수 있다', async () => {
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

  it('나간 사람은 기다리지 않는다 — 남은 사람이 3회를 마치면 라운드가 닫힌다', async () => {
    const doo = new RoomDO(fakeCtx() as never, ENV);
    const host = await knock(doo, '방장');
    const quitter = await knock(doo, '이탈');
    await send(doo, host, { t: 'trial_join' }); // 둘 다 참가자로 잡힌 채 라운드가 열린다

    quitter.close();
    await doo.webSocketClose(quitter as never);

    await runAttempt(doo, host);
    await runAttempt(doo, host);
    await runAttempt(doo, host);
    expect(host.sent.some((m) => m.t === 'trial_result')).toBe(true);
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

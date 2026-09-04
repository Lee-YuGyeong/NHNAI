/**
 * 방의 문 — **내보내진 계정이 돌아오지 못하는가**가 이 파일의 전부다 (worker/src/room-do.ts).
 *
 * kick 은 원래 소켓을 끊는 것까지였다. 2026-09-01 에 밴 명부가 붙었다: 방장이 내보낸
 * **계정**(입장권의 sub)은 같은 방에 다시 못 들어온다. 그래서 지킬 것이 넷이다:
 *
 *   ① 내보내진 계정은 문에서 'banned' 를 받고 돌아선다
 *   ② 게스트는 명부에 안 적힌다 — 내보내도 다시 들어온다 (**알고 열어 둔 길**이다.
 *      로그인을 관문으로 안 만드는 규칙이 밴보다 오래됐다 — upgrade 주석)
 *   ③ 명부는 DO 의 잠을 이긴다 — 스토리지가 원본이다
 *   ④ 방이 다 비면 명부를 태운다 — 같은 번호로 서는 다음 방은 남이다
 *
 * lobby.test.ts 와 같은 규칙으로 쓴다 — 서버를 흉내 내지 않는다. 가짜로 세우는 것은
 * 플랫폼 껍데기(소켓 쌍·스토리지·Response)뿐이고, 입장·강퇴·퇴장은 진짜 RoomDO 를 부른다.
 * 입장권도 진짜로 서명한다 (auth.ts signTicket) — 검증까지 같이 도는 게 이 문의 실제 모습이다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signTicket } from '../../worker/src/auth';
import { RoomDO } from '../../worker/src/room-do';
import { PROTOCOL_VERSION } from '../../src/world/mp/constants';
import type { S2CMessage } from '../../src/world/mp/protocol';

const SECRET = 'test-secret-0123456789abcdef';
const ENV = { WORLD_TICKET_SECRET: SECRET } as never;
const ROOM = '1234';

/** 내보내질 사람의 계정. 밴은 소켓이 아니라 이 값에 걸린다 */
const SUB = '11111111-2222-3333-4444-555555555555';

const ticketFor = (sub: string, name: string) => signTicket({ sub, name, room: ROOM, exp: Date.now() + 60_000 }, SECRET);

/* ═══════════════════════════ 플랫폼 껍데기 ═══════════════════════════ */

/** 소켓의 양쪽 끝. 받은 것(sent)과 닫힘(closed)이 여기 적힌다 — 단언은 전부 이 두 칸을 본다 */
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

/** upgrade 가 만드는 소켓 쌍을 붙잡아 둔다 — 거절된 소켓은 ctx 에 안 실려서 이 길밖에 없다 */
let pairs: { 0: FakeSocket; 1: FakeSocket }[] = [];

class FakeWebSocketPair {
  0 = new FakeSocket();
  1 = new FakeSocket();
  constructor() {
    pairs.push(this as never);
  }
}

/** DO 의 손발. 스토리지는 Map 한 장 — 잠들었다 깨어나는 시험(③)이 이 Map 을 이어받는다 */
function fakeCtx(cell = new Map<string, unknown>()) {
  const sockets: FakeSocket[] = [];
  let alarm: number | null = null;
  return {
    cell,
    sockets,
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
      getAlarm: async () => alarm,
      setAlarm: async (t: number) => void (alarm = t),
    },
  };
}

/** 문을 두드린다. 돌아오는 것은 서버 쪽 소켓 끝 — welcome 이든 error 든 거기 적혀 있다 */
async function knock(doo: RoomDO, q: { nick?: string; tk?: string }): Promise<FakeSocket> {
  const url = new URL(`https://do/rooms/${ROOM}/ws`);
  url.searchParams.set('v', String(PROTOCOL_VERSION));
  if (q.nick) url.searchParams.set('nick', q.nick);
  if (q.tk) url.searchParams.set('tk', q.tk);
  await doo.fetch(new Request(url, { headers: { Upgrade: 'websocket' } }));
  return pairs[pairs.length - 1][1];
}

const selfIdOf = (sock: FakeSocket): string => (sock.sent[0] as { selfId: string }).selfId;

const kick = (doo: RoomDO, by: FakeSocket, id: string) =>
  doo.webSocketMessage(by as never, JSON.stringify({ t: 'kick', id }));

beforeEach(() => {
  pairs = [];
  // Response 는 101 을 못 담는다 (undici) — DO 가 돌려주는 껍데기만 흉내 낸다
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

describe('밴 명부 — 내보내진 계정은 못 돌아온다', () => {
  it('방장이 내보내면, 같은 계정의 새 입장권도 문에서 banned 를 받는다', async () => {
    const doo = new RoomDO(fakeCtx() as never, ENV);
    const host = await knock(doo, { nick: '방장' });
    const target = await knock(doo, { tk: await ticketFor(SUB, '철수') });

    await kick(doo, host, selfIdOf(target));
    expect(target.sent.at(-1)).toEqual({ t: 'error', code: 'kicked' });
    expect(target.closed).toEqual({ code: 4002, reason: 'kicked' });

    // 입장권을 **새로** 받아 와도 소용없다 — 밴은 입장권이 아니라 계정에 걸린다
    const back = await knock(doo, { tk: await ticketFor(SUB, '철수') });
    expect(back.sent).toEqual([{ t: 'error', code: 'banned' }]);
    expect(back.closed?.code).toBe(4000);
  });

  it('게스트는 명부에 안 적힌다 — 내보내도 다시 들어온다 (알고 열어 둔 길)', async () => {
    const doo = new RoomDO(fakeCtx() as never, ENV);
    const host = await knock(doo, { nick: '방장' });
    const guest = await knock(doo, { nick: '손님' });

    await kick(doo, host, selfIdOf(guest));
    expect(guest.closed?.reason).toBe('kicked');

    const back = await knock(doo, { nick: '손님' });
    expect(back.sent[0].t).toBe('welcome');
  });

  it('내보내진 계정도 입장권을 버리고 게스트로 오면 들어온다 — 감수한 우회다 (2026-09-01 a안)', async () => {
    const doo = new RoomDO(fakeCtx() as never, ENV);
    const host = await knock(doo, { nick: '방장' });
    const target = await knock(doo, { tk: await ticketFor(SUB, '철수') });

    await kick(doo, host, selfIdOf(target));
    const back = await knock(doo, { nick: '아무개' });
    expect(back.sent[0].t).toBe('welcome');
  });

  it('명부는 잠을 이긴다 — 새 DO 가 같은 스토리지로 깨어나도 남아 있다', async () => {
    const ctx = fakeCtx();
    const doo = new RoomDO(ctx as never, ENV);
    const host = await knock(doo, { nick: '방장' });
    const target = await knock(doo, { tk: await ticketFor(SUB, '철수') });
    await kick(doo, host, selfIdOf(target));

    // DO 가 잠들었다 깨어났다 — 메모리는 새것, 스토리지(cell)만 그대로다
    const woken = new RoomDO(fakeCtx(ctx.cell) as never, ENV);
    const back = await knock(woken, { tk: await ticketFor(SUB, '철수') });
    expect(back.sent).toEqual([{ t: 'error', code: 'banned' }]);
  });

  it('방이 다 비면 명부를 태운다 — 같은 번호의 다음 방은 남이다', async () => {
    const ctx = fakeCtx();
    const doo = new RoomDO(ctx as never, ENV);
    const host = await knock(doo, { nick: '방장' });
    const target = await knock(doo, { tk: await ticketFor(SUB, '철수') });
    await kick(doo, host, selfIdOf(target));

    // 방장까지 나간다 — 방이 비었다
    host.close();
    await doo.webSocketClose(host as never);
    expect(ctx.cell.has('bans')).toBe(false);

    const back = await knock(doo, { tk: await ticketFor(SUB, '철수') });
    expect(back.sent[0].t).toBe('welcome');
  });

  it('방장이 아니면 못 적는다 — kick 은 조용히 버려지고 명부도 그대로다', async () => {
    const ctx = fakeCtx();
    const doo = new RoomDO(ctx as never, ENV);
    await knock(doo, { nick: '방장' });
    const target = await knock(doo, { tk: await ticketFor(SUB, '철수') });
    const outsider = await knock(doo, { nick: '셋째' });

    await kick(doo, outsider, selfIdOf(target));
    expect(target.closed).toBeNull();
    expect(ctx.cell.has('bans')).toBe(false);
  });
});

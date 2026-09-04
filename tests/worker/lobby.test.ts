/**
 * 방 등록소 — **목록이 진짜인가**가 이 파일의 전부다 (worker/src/lobby-do.ts).
 *
 * 로비의 방 목록은 사람이 "들어가 볼까" 를 정하는 유일한 근거다. 그러니 지킬 것도 하나다:
 * **거기 적힌 것이 지금 열려 있는 방이어야 한다.** 아무도 없는 방이 남아 있으면 그 줄을 누른
 * 사람은 빈 방에 혼자 앉고, 인원이 틀리면 「2/3」 을 보고 들어가서 room_full 을 받는다.
 *
 * auth.test.ts 와 같은 규칙으로 쓴다 — 서버를 흉내 내지 않는다. 종이에 하는 일은 전부
 * 순수 함수라 그대로 부르고, DO 는 스토리지 한 칸만 가짜로 세워 진짜 fetch 를 돌린다.
 */
import { describe, expect, it } from 'vitest';
import {
  EMPTY_STALE_MS,
  LobbyDO,
  MAX_ROOMS,
  handleRooms,
  listRegistry,
  openInRegistry,
  pruneRegistry,
  reportInRegistry,
  type Registry,
  type RoomRecord,
} from '../../worker/src/lobby-do';
import { ROOM_MAX_PLAYERS } from '../../src/world/mp/constants';
import { ROOM_STALE_MS } from '../../src/world/mp/lobby';

const NOW = 1_700_000_000_000;

const rec = (over: Partial<RoomRecord> & { code: string }): RoomRecord => ({
  name: null,
  players: 1,
  phase: 'lobby',
  at: NOW,
  born: NOW,
  ...over,
});

const reg = (...rows: RoomRecord[]): Registry => Object.fromEntries(rows.map((r) => [r.code, r]));

/* ═══════════════════════════════ 방 만들기 ═══════════════════════════════ */

describe('방 등록 — 번호와 제목을 적는다', () => {
  it('빈 종이에 한 줄이 선다. 인원은 **0 으로 시작한다** (아직 아무도 안 붙었다)', () => {
    const r: Registry = {};
    const out = openInRegistry(r, { code: '1024', name: '초보 환영', now: NOW });
    expect(out).toEqual({
      ok: true,
      room: { code: '1024', name: '초보 환영', players: 0, capacity: ROOM_MAX_PLAYERS, phase: 'lobby' },
    });
    expect(r['1024'].born).toBe(NOW);
  });

  it('제목을 다듬어 적는다 — 목록에 들어오는 유일한 남의 글자다', () => {
    const r: Registry = {};
    openInRegistry(r, { code: '1024', name: '  야간​  근무조 ', now: NOW });
    expect(r['1024'].name).toBe('야간 근무조');
  });

  it('제목이 없으면 null 이다 — 빈 문자열을 적지 않는다 (화면이 #번호 로 부른다)', () => {
    const r: Registry = {};
    openInRegistry(r, { code: '1024', name: '   ', now: NOW });
    expect(r['1024'].name).toBeNull();
  });

  it('**이미 열린 번호는 거절한다** — 만들기로 남의 방에 들어가면 그 방의 제목이 덮인다', () => {
    const r = reg(rec({ code: '1024', name: '먼저 온 방' }));
    expect(openInRegistry(r, { code: '1024', name: '나중 방', now: NOW })).toEqual({ ok: false, error: 'code_taken' });
    expect(r['1024'].name).toBe('먼저 온 방');
  });

  it('같은 제목도 거절한다. **눈에 같아 보이면 같은 것으로 본다** (띄어쓰기·대소문자)', () => {
    const r = reg(rec({ code: '1024', name: '말 많은 방' }));
    expect(openInRegistry(r, { code: '2098', name: '말많은방', now: NOW })).toEqual({ ok: false, error: 'name_taken' });
    expect(openInRegistry(r, { code: '2098', name: 'NIGHT shift', now: NOW }).ok).toBe(true);
    expect(openInRegistry(r, { code: '3141', name: 'night   Shift', now: NOW })).toEqual({ ok: false, error: 'name_taken' });
  });

  it('번호 모양이 아니면 400 쪽이다 — 아무 문자열이나 받으면 DO 가 무한히 생긴다', () => {
    expect(openInRegistry({}, { code: 'abcd', now: NOW })).toEqual({ ok: false, error: 'bad_code' });
    expect(openInRegistry({}, { code: '1234567', now: NOW })).toEqual({ ok: false, error: 'bad_code' });
  });

  it('번호를 안 주면 **빈 번호를 뽑아 준다**', () => {
    const r = reg(rec({ code: '1000' }));
    const out = openInRegistry(r, { name: '아무 방', now: NOW, rand: () => 0.5 });
    expect(out).toEqual({
      ok: true,
      room: { code: '5500', name: '아무 방', players: 0, capacity: ROOM_MAX_PLAYERS, phase: 'lobby' },
    });
  });

  it('뽑을 번호가 전부 겹치면 no_code — 조용히 남의 방을 내주지 않는다', () => {
    const r = reg(rec({ code: '1000' }));
    // rand 가 늘 같은 값이면 뽑는 번호도 늘 같다 → 스무 번 다 겹친다
    expect(openInRegistry(r, { now: NOW, rand: () => 0 })).toEqual({ ok: false, error: 'no_code' });
  });

  it('천장이 있다 — 등록소는 로그인 없이 누구나 두드리는 자리다', () => {
    const r: Registry = {};
    for (let i = 0; i < MAX_ROOMS; i += 1) r[String(100000 + i)] = rec({ code: String(100000 + i) });
    expect(openInRegistry(r, { code: '1024', now: NOW })).toEqual({ ok: false, error: 'too_many' });
  });

  it('적기 전에 낡은 줄을 걷는다 — 시효가 지난 번호는 다시 쓸 수 있어야 한다', () => {
    const r = reg(rec({ code: '1024', name: '옛 방', players: 1, at: NOW - ROOM_STALE_MS - 1 }));
    expect(openInRegistry(r, { code: '1024', name: '옛 방', now: NOW }).ok).toBe(true);
  });
});

/* ═══════════════════════════ 방이 적는 소식 ═══════════════════════════ */

describe('인원 — **방만 말한다** (worker/src/room-do.ts 의 report)', () => {
  it('없던 방도 적힌다 — 코드로 그냥 들어온 방이 목록에 선다 (제목은 없다)', () => {
    const r: Registry = {};
    reportInRegistry(r, { code: '4700', players: 2, phase: 'lobby', now: NOW });
    expect(listRegistry(r, NOW)).toEqual([
      { code: '4700', name: null, players: 2, capacity: ROOM_MAX_PLAYERS, phase: 'lobby' },
    ]);
  });

  it('제목은 **덮지 않고 물려받는다** — 방은 자기 제목을 모른다', () => {
    const r = reg(rec({ code: '1024', name: '야간 근무조', born: NOW - 5000 }));
    reportInRegistry(r, { code: '1024', players: 3, phase: 'playing', now: NOW });
    expect(r['1024']).toMatchObject({ name: '야간 근무조', players: 3, phase: 'playing', born: NOW - 5000 });
  });

  it('**아무도 없으면 줄을 지운다** — 빈 방에 혼자 앉게 두지 않는다', () => {
    const r = reg(rec({ code: '1024', players: 1 }));
    reportInRegistry(r, { code: '1024', players: 0, phase: 'lobby', now: NOW });
    expect(r['1024']).toBeUndefined();
  });

  it('정원보다 큰 수는 정원으로 접는다 — 목록이 「4/3」 을 말하지 않게', () => {
    const r: Registry = {};
    reportInRegistry(r, { code: '1024', players: 99, phase: 'lobby', now: NOW });
    expect(r['1024'].players).toBe(ROOM_MAX_PLAYERS);
  });

  it('번호 모양이 아니면 아무 일도 하지 않는다', () => {
    const r: Registry = {};
    reportInRegistry(r, { code: 'zzz', players: 2, phase: 'lobby', now: NOW });
    expect(r).toEqual({});
  });
});

/* ═══════════════════════════════ 목록 ═══════════════════════════════ */

describe('목록 — 지금 열려 있는 방만', () => {
  it('소식이 끊긴 방은 걷힌다 (맥박은 30초마다 온다)', () => {
    const r = reg(
      rec({ code: '1024', players: 2, at: NOW - ROOM_STALE_MS + 1000 }),
      rec({ code: '2098', players: 2, at: NOW - ROOM_STALE_MS - 1 }),
    );
    expect(listRegistry(r, NOW).map((x) => x.code)).toEqual(['1024']);
  });

  it('만들어 놓고 아무도 안 간 방은 **더 빨리** 걷힌다', () => {
    const r = reg(rec({ code: '1024', players: 0, at: NOW - EMPTY_STALE_MS - 1 }));
    pruneRegistry(r, NOW);
    expect(r['1024']).toBeUndefined();
  });

  it('대기 중인 방이 앞, 그 안에서는 새 방이 위다 — 들어갈 수 있는 방이 먼저 보여야 한다', () => {
    const r = reg(
      rec({ code: '1000', phase: 'playing', born: NOW }),
      rec({ code: '2000', phase: 'lobby', born: NOW - 10_000 }),
      rec({ code: '3000', phase: 'lobby', born: NOW - 1_000 }),
    );
    expect(listRegistry(r, NOW).map((x) => x.code)).toEqual(['3000', '2000', '1000']);
  });

  it('시각(at·born)은 화면으로 내보내지 않는다 — 쓸 일이 없는 값이다', () => {
    const r = reg(rec({ code: '1024' }));
    expect(Object.keys(listRegistry(r, NOW)[0]).sort()).toEqual(['capacity', 'code', 'name', 'phase', 'players']);
  });
});

/* ═══════════════════════════════ DO · 창구 ═══════════════════════════════ */

/** 스토리지 한 칸짜리 가짜. DO 가 진짜로 쓰는 것은 get/put 둘뿐이다 */
function fakeCtx() {
  const cell = new Map<string, unknown>();
  return { storage: { get: async (k: string) => cell.get(k), put: async (k: string, v: unknown) => void cell.set(k, v) } };
}

const post = (path: string, body: unknown) =>
  new Request(`https://lobby${path}`, { method: 'POST', body: JSON.stringify(body) });

describe('LobbyDO — 종이를 들고 있는 쪽', () => {
  it('만들고, 방이 인원을 적고, 목록에 그대로 뜬다', async () => {
    const doo = new LobbyDO(fakeCtx() as never);
    const created = await doo.fetch(post('/open', { code: '1024', name: '야간 근무조' }));
    expect(created.status).toBe(201);

    await doo.fetch(post('/report', { code: '1024', players: 2, phase: 'lobby' }));
    const listed = (await (await doo.fetch(new Request('https://lobby/list'))).json()) as { rooms: unknown[] };
    expect(listed.rooms).toEqual([
      { code: '1024', name: '야간 근무조', players: 2, capacity: ROOM_MAX_PLAYERS, phase: 'lobby' },
    ]);
  });

  it('겹치면 409, 모양이 틀리면 400 — 화면이 이유를 그대로 받는다', async () => {
    const doo = new LobbyDO(fakeCtx() as never);
    await doo.fetch(post('/open', { code: '1024', name: '초보 환영' }));

    const dup = await doo.fetch(post('/open', { code: '1024' }));
    expect(dup.status).toBe(409);
    expect(await dup.json()).toEqual({ error: 'code_taken' });

    const bad = await doo.fetch(post('/open', { code: 'zzz' }));
    expect(bad.status).toBe(400);
  });

  it('아무도 없다고 적으면 목록에서 사라진다', async () => {
    const doo = new LobbyDO(fakeCtx() as never);
    await doo.fetch(post('/report', { code: '1024', players: 1, phase: 'lobby' }));
    await doo.fetch(post('/report', { code: '1024', players: 0, phase: 'lobby' }));
    const listed = (await (await doo.fetch(new Request('https://lobby/list'))).json()) as { rooms: unknown[] };
    expect(listed.rooms).toEqual([]);
  });

  it('본문이 JSON 이 아니면 400', async () => {
    const doo = new LobbyDO(fakeCtx() as never);
    const res = await doo.fetch(new Request('https://lobby/open', { method: 'POST', body: '{{{' }));
    expect(res.status).toBe(400);
  });
});

describe('/api/rooms — 워커가 여는 창구', () => {
  /** 등록소를 대신하는 가짜. 무엇으로 불렸는지 보려고 호출을 모아 둔다 */
  function stubEnv() {
    const calls: { url: string; body?: unknown }[] = [];
    const env = {
      LOBBY_DO: {
        idFromName: (n: string) => n,
        get: () => ({
          fetch: async (input: Request | string, init?: RequestInit) => {
            const url = typeof input === 'string' ? input : input.url;
            calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
            return new Response(JSON.stringify({ rooms: [] }));
          },
        }),
      },
    };
    return { calls, env: env as never };
  }

  it('GET 은 목록으로 간다', async () => {
    const { calls, env } = stubEnv();
    await handleRooms(new Request('https://x/api/rooms'), env);
    expect(calls[0].url).toBe('https://lobby/list');
  });

  it('POST 는 제목과 번호를 그대로 넘긴다', async () => {
    const { calls, env } = stubEnv();
    await handleRooms(post('/api/rooms', { name: '야간 근무조', code: '1024' }), env);
    expect(calls[0].url).toBe('https://lobby/open');
    expect(calls[0].body).toEqual({ name: '야간 근무조', code: '1024' });
  });

  it('본문이 없거나 JSON 이 아니어도 **이름 없는 방**으로 받는다 — 400 으로 막지 않는다', async () => {
    const { calls, env } = stubEnv();
    await handleRooms(new Request('https://x/api/rooms', { method: 'POST', body: '{{{' }), env);
    expect(calls[0].body).toEqual({ name: null, code: null });
  });

  it('등록소가 없으면 **503 이지 500 이 아니다** — 목록 없는 배포는 고장이 아니라 설정이다', async () => {
    const res = await handleRooms(new Request('https://x/api/rooms'), {});
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'registry_disabled' });
  });

  it('PUT 은 받지 않는다 (읽기는 GET, 만들기는 POST)', async () => {
    const { env } = stubEnv();
    const res = await handleRooms(new Request('https://x/api/rooms', { method: 'PUT' }), env);
    expect(res.status).toBe(405);
  });
});

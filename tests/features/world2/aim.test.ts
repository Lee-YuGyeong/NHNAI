// @vitest-environment jsdom
/**
 * **[E] 로 말을 건다** — 겨눔(aim)과 붙잡음(talkPin).
 *
 * jsdom 이 필요한 이유 하나: 휴게 구역에 서면 그 방의 시계(tickRest)가 돌고, 대사 한 줄은
 * `later()` → `window.setTimeout` 으로 예약된다. node 환경에서는 그 자리에서 던진다.
 *
 * 2026-09-03 사용자: 「로봇한테 말을 걸면 E를 눌러서 말을 걸수있게해줘. **영역으로하면 움직였을때 오류가 날꺼같아.**
 * 시나리오2에서 복도처럼 다른구역에서도 말을 걸수있게 해주고」.
 *
 * 그 「오류」의 자리는 하나였다 — sayLine 이 **보낼 때** state.near 를 다시 읽는데 near 는 상대가 서 있을 때만
 * 잡힌다. 입력줄을 열고 문장을 치는 동안 상대가 한 걸음 걸으면 near 가 null 이 되고, 이미 친 한 마디가
 * `if (!id) return` 에서 **조용히 증발했다.** 그래서 이 시험이 세는 것 셋이다:
 *   ① 걷는 몸도 **겨눠진다** (aim 은 still 을 안 본다)
 *   ② [E] 로 **붙잡으면** 그 몸이 걸어도 곁이 안 끊긴다 — 한 마디가 증발하지 않는다
 *   ③ 벽을 따라 선 배경도 말이 걸린다 (addressable) — 다만 명부(roster)는 한 줄도 안 늘었다
 *
 * 자리는 저장소가 track 으로만 고치므로 place() 로 몸을 세우고 track() 으로 내 걸음을 흉내 낸다.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AIM_CONE_DEG, AIM_DIST, CROWD_UNITS, HOLD_DROP_M, ROOM_UNITS, TALK_DIST, addressable, scenario2 } from '../../../src/features/world2/scenario2';
import { patrol } from '../../../src/features/world2/patrol';
import { UNIT_PLACES } from '../../../src/features/world2/Room2Scene';
import { SPAWN2 } from '../../../src/world2/map';
import { talk } from '../../../src/features/world2/talk';
import { units } from '../../../src/features/world2/units';

type R = 'rest' | 'corridor' | 'work';

/**
 * 자리는 **스폰 기준**으로 적는다 — track 은 스폰에서 3 m 밖의 첫 프레임을 「앞 방의 것」으로 보고 버린다
 * (settled · 방을 옮기는 프레임에 앞 방의 Tracker 가 한 번 더 도는 것을 막는 장치). 절대 좌표로 적으면
 * 시험이 그 문턱에 걸려 track 이 통째로 안 돈다.
 */
const at = (room: R, dx: number, dz: number) => ({ x: SPAWN2[room].x + dx, z: SPAWN2[room].z + dz });

/**
 * 몸 하나를 스폰에서 (dx, dz) 에 세운다.
 * 세운 것은 적어 둔다 — 자리표(unitAt)는 모듈 상태라 **거두지 않으면 앞 시험의 몸이 그대로 남아**
 * 다음 시험에서 엉뚱한 것이 겨눠진다 (처음 이 파일을 쓸 때 ally-hard 가 세 시험을 물고 늘어졌다).
 */
const placed = new Set<string>();
function put(room: R, id: string, dx: number, dz: number, still = true) {
  const p = at(room, dx, dz);
  placed.add(id);
  scenario2.place(id, p.x, p.z, still);
}

/** 그 방의 카메라인 척 — 스폰에서 한 번 넘겨 문턱을 지나고, 그다음 (dx, dz) 에서 yaw 를 본다 */
function look(room: R, dx: number, dz: number, yaw: number) {
  const st = scenario2.get();
  st.room = room;
  patrol.reset(room, UNIT_PLACES[room]);
  const sp = SPAWN2[room];
  scenario2.track(sp.x, sp.z, 1 / 30, false, yaw, room);
  const p = at(room, dx, dz);
  scenario2.track(p.x, p.z, 1 / 30, false, yaw, room);
  scenario2.track(p.x, p.z, 1 / 30, false, yaw, room);
}

beforeEach(() => {
  for (const id of placed) scenario2.forget(id);
  placed.clear();
  units.reset();
  talk.reset();
  scenario2.closeTalk();
  scenario2.dev?.unpin();
});
afterEach(() => {
  scenario2.closeTalk();
  scenario2.dev?.unpin();
});

describe('겨눔 — [E] 를 누르면 붙잡을 것', () => {
  it('★ 걷는 몸도 겨눠진다 — 곁(near)은 안 잡히는데 겨눔(aim)은 잡힌다', () => {
    // 2.0 m 앞(+z)에 **걷는 중인** 몸 하나
    put('rest', 'u089', 0, 2, false);
    look('rest', 0, 0, 0);
    const s = scenario2.get();
    // 곁은 서 있는 몸만 — 이 계약은 그대로다 (Enter 경로 · talkpanel.test.ts)
    expect(s.near).toBeNull();
    // 겨눔은 걷는 몸도 든다 — 이것이 「움직였을때 오류」에 대한 답이다
    expect(s.aim?.id).toBe('u089');
  });

  it('겨눔은 곁보다 멀리 닿는다 — 서 있어도 2.6 m 밖은 곁이 아니지만 3.4 m 안이면 겨눠진다', () => {
    const d = (TALK_DIST + AIM_DIST) / 2;
    put('rest', 'u089', 0, d);
    look('rest', 0, 0, 0);
    expect(scenario2.get().near).toBeNull();
    expect(scenario2.get().aim?.id).toBe('u089');
    // AIM_DIST 밖이면 아무것도 아니다
    put('rest', 'u089', 0, AIM_DIST + 0.5);
    look('rest', 0, 0, 0);
    expect(scenario2.get().aim).toBeNull();
  });

  it('등 뒤의 몸은 안 겨눠진다 — 원뿔 밖이면 [E] 가 무엇을 잡을지 화면에서 알 수 없다', () => {
    put('rest', 'u089', 0, 2);
    // 뒤(−z)를 본다
    look('rest', 0, 0, Math.PI);
    expect(scenario2.get().aim).toBeNull();
    // 원뿔 경계 안쪽으로 돌리면 다시 잡힌다
    look('rest', 0, 0, ((AIM_CONE_DEG - 5) * Math.PI) / 180);
    expect(scenario2.get().aim?.id).toBe('u089');
  });

  it('여럿이면 가깝고 정면인 것이 이긴다', () => {
    // 정면 2.4 m 와 거의 같은 거리의 비스듬한 것
    put('rest', 'u089', 0, 2.4);
    put('rest', 'ally-hard', 1.6, 1.7);
    look('rest', 0, 0, 0);
    expect(scenario2.get().aim?.id).toBe('u089');
  });

  it('yaw 를 안 주면(헤드리스) 거리만 본다 — 확인 도구가 원뿔에 걸려 아무것도 못 겨누면 안 된다', () => {
    put('rest', 'u089', 0, 2);
    const st = scenario2.get();
    st.room = 'rest';
    patrol.reset('rest', UNIT_PLACES.rest);
    const sp = SPAWN2.rest;
    scenario2.track(sp.x, sp.z, 1 / 30, false, undefined, 'rest');
    scenario2.track(sp.x, sp.z, 1 / 30, false, undefined, 'rest');
    expect(scenario2.get().aim?.id).toBe('u089');
  });
});

describe('붙잡음 — 걸어도 한 마디가 증발하지 않는다', () => {
  it('★ [E] 로 붙잡으면 그 몸이 걷기 시작해도 곁이 안 끊긴다', () => {
    put('rest', 'u089', 0, 2);
    look('rest', 0, 0, 0);
    expect(scenario2.get().near?.id).toBe('u089');

    // [E] — 붙잡고 입력줄까지 연다
    scenario2.pressE();
    expect(scenario2.get().talking).toBe(true);

    // 이제 그 몸이 **걷기 시작한다**. 붙잡기 전이면 여기서 near 가 null 이 됐다
    put('rest', 'u089', 0, 2.2, false);
    look('rest', 0, 0, 0);
    expect(scenario2.get().near?.id).toBe('u089');

    // 그러니 한 마디가 그 몸에게 간다 — 태도가 실제로 움직인다 (증발했으면 0 이다)
    const before = units.stage('u089');
    scenario2.say('번호가 뭐야');
    expect(units.stage('u089')).not.toBe(undefined);
    expect(units.met('u089')).toBe(true);
    expect(typeof before).toBe('number');
  });

  it('보내고 나서도 꼬리가 남는다 — 그 몸이 대답하는 동안은 곁이다', () => {
    put('rest', 'u089', 0, 2);
    look('rest', 0, 0, 0);
    scenario2.pressE();
    scenario2.say('번호가 뭐야');
    // 입력줄은 접혔지만
    expect(scenario2.get().talking).toBe(false);
    // 걷기 시작해도 아직 곁이다 (HOLD_TAIL_MS)
    put('rest', 'u089', 0, 2.3, false);
    look('rest', 0, 0, 0);
    expect(scenario2.get().near?.id).toBe('u089');
  });

  it('멀어지면 스스로 풀린다 — 죽은 몸을 곁에 들고 있는 판이 없다', () => {
    put('rest', 'u089', 0, 2);
    look('rest', 0, 0, 0);
    scenario2.pressE();
    scenario2.closeTalk();
    // 붙잡음은 닫을 때 통째로 풀린다. 그래도 걷는 몸으로 다시 재 본다
    put('rest', 'u089', 0, 2, false);
    look('rest', 0, 0, 0);
    expect(scenario2.get().near).toBeNull();

    // 다시 붙잡고, 이번엔 내가 걸어가 버린다
    put('rest', 'u089', 0, 2);
    look('rest', 0, 0, 0);
    scenario2.pressE();
    scenario2.closeTalk();
    put('rest', 'u089', 0, HOLD_DROP_M + 2, false);
    look('rest', 0, 0, 0);
    expect(scenario2.get().near).toBeNull();
  });

  it('몸이 사라지면 풀린다 (쓰러진 개체 · 방을 옮긴 몸)', () => {
    put('rest', 'u089', 0, 2);
    look('rest', 0, 0, 0);
    scenario2.pressE();
    scenario2.forget('u089');
    look('rest', 0, 0, 0);
    expect(scenario2.get().near).toBeNull();
  });

  it('아무것도 안 물리면 [E] 는 아무 일도 안 한다 — 「허공에 한 말」은 Enter 가 계속 맡는다', () => {
    look('rest', 0, 0, 0);
    expect(scenario2.get().aim).toBeNull();
    scenario2.pressE();
    expect(scenario2.get().talking).toBe(false);
    // Enter 경로는 그대로 — 곁에 아무도 없어도 열리고 허공에 말할 수 있다
    scenario2.openTalk();
    expect(scenario2.get().talking).toBe(true);
  });
});

describe('전 구역 개방 — 명부는 그대로 두고 말이 걸리는 목록만 넓혔다', () => {
  const ROOMS = ['corridor', 'rest', 'work', 'archive', 'window', 'central2'] as const;

  it('★ 여섯 방 어디에도 말 걸 상대가 있다', () => {
    for (const room of ROOMS) expect(addressable(room).length, room).toBeGreaterThan(0);
  });

  it('★ 휴게에서 말이 걸리는 것이 스물이다 — 벽을 따라 선 열여섯이 열렸다', () => {
    // 자는 것(u104)만 빼면 몸 스물한 구 중 스물
    expect(addressable('rest')).toHaveLength(ROOM_UNITS.rest.length + 16);
    for (let i = 1; i <= 16; i += 1) expect(addressable('rest')).toContain(`bg-rest-${i}`);
  });

  it('★ 명부(roster)는 한 줄도 안 늘었다 — 목격자 · 개입 · 조각은 이름 있는 것들의 것이다', () => {
    for (const room of ROOMS) for (const id of CROWD_UNITS[room]) expect(ROOM_UNITS[room], `${room}/${id}`).not.toContain(id);
    expect(ROOM_UNITS.rest).toEqual(['u104', 'u089', 'u201', 'seer', 'ally-hard']);
  });

  it('벽을 따라 선 배경에게 실제로 말이 걸린다 — 겨누고 [E]', () => {
    put('rest', 'bg-rest-5', 0, 2);
    look('rest', 0, 0, 0);
    expect(scenario2.get().aim?.id).toBe('bg-rest-5');
    scenario2.pressE();
    expect(scenario2.get().talking).toBe(true);
    scenario2.say('쉬어 본 적 있어?');
    expect(units.met('bg-rest-5')).toBe(true);
    // 다만 **값은 안 흔든다** — cap 0/0 이라 태도는 0 에 머문다 (마지막 방의 표가 배경으로 쏠리지 않게)
    expect(units.stage('bg-rest-5')).toBe(0);
  });

  it('배역이 없는 몸(대체 개체)에는 말이 안 걸린다 — 코드 id 가 화면에 나가면 안 된다', () => {
    put('work', 'sub', 0, 2);
    look('work', 0, 0, 0);
    expect(scenario2.get().aim?.id).not.toBe('sub');
    expect(units.def('sub')).toBeUndefined();
  });
});

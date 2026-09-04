/**
 * 걸어 다니는 것들 — v8 에서 이야기가 빌려 쓰는 걸음(stare · approach · turnAway)과 배회하는 둘.
 * 6 m 규칙 자체는 scenario2.test 가 쥔다. 여기는 **그 규칙 위에서 이야기의 걸음이 되는가**만 본다.
 * 시계는 손으로 돌린다 — patrol.tick/stare 의 now 인자 (fake timer 없음).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { BEATS, LANE, PLAYER_GAP, YIELD, patrol } from '../../../src/features/world2/patrol';
import { UNIT_PLACES } from '../../../src/features/world2/Room2Scene';
import { ARCHIVE_PATH } from '../../../src/world2/map/archive';
import { ROOM_UNITS } from '../../../src/features/world2/scenario2';

const FAR = { x: 999, z: 999 };
const DT = 1 / 30;

/** seconds 동안 돌리며 매 프레임 fn — 시계는 t0 부터 실시간처럼 */
function run(seconds: number, me = FAR, fn?: (now: number) => void, t0 = 1000) {
  for (let i = 0; i < seconds * 30; i += 1) {
    const now = t0 + i * DT * 1000;
    patrol.tick(DT, me, now);
    fn?.(now);
  }
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const near = (a: number, b: number, tol = 0.05) => Math.abs(wrap(a - b)) < tol;

/*
 * 배회하던 둘(D6)의 시험이 여기 있었다 — 「계획서에 없던 로봇 개체는 일단 없애줘」(2026-09-03 사용자)로 그 여섯을 걷어내면서
 * 시험도 같이 걷어냈다. 지금 복도에서 움직이는 것은 순찰 하나뿐이라, 남는 것은 「그 하나가 40 초 왕복을 계속하는가」다.
 * 스치는 쌍이 없어져 엿듣기(overhear)도 꺼졌다 — 모듈 시험은 overhear.test 가 가짜 id 둘로 계속 지킨다.
 */
describe('복도 — 이제 순찰 하나만 걷는다', () => {
  beforeEach(() => patrol.reset('corridor', UNIT_PLACES.corridor));

  it('★ 자리표에 서는 것은 명부에 있거나 **이름 없는 배경**이다 — 그 밖의 것은 없다', () => {
    for (const [room, places] of Object.entries(UNIT_PLACES)) {
      for (const p of places) {
        /*
         * 검문 앞줄 둘(A-044 · A-128)은 명부에 있다 — 대본 v8 QUEUE 에서 내 앞에 번호를 대는 것들이다.
         * 예외 둘:
         *   소각로의 **대체 개체**(pose 'fire-sub') — 대본이 「이름을 모르는 게 들어갔다」로 못 박은 몸이라
         *     이름도 명부도 없고, 불려 갈 때까지 보이지도 않는다 (Unit 의 unseen).
         *   **이름 없는 배경**(bg-rest-·bg-work-·bg-cor-) — 휴게의 군중 열여섯이 그것이다 (2026-09-03 사용자:
         *     「대사는 스무 명 남짓이라던데 로봇은 얼마 없어」). 말 걸기 대상도 아니고 명부에도 없다: **보이기만 한다**.
         *     이 시험이 계속 잡는 것은 **그 둘도 아니면서 명부에 없는 것** — 자리표에 몰래 끼는 개체다
         */
        if (p.pose === 'fire-sub') continue;
        if (/^bg-(rest|work|cor)-/.test(p.id)) continue;
        const named = ROOM_UNITS[room as keyof typeof ROOM_UNITS].includes(p.id);
        expect(`${room} ${p.id} ${named ? 'named' : 'unnamed'}`).toBe(`${room} ${p.id} named`);
      }
    }
  });

  /*
   * 예전에는 「걸음표에 든 것은 전부 명부의 것」이었다. 2026-09-03 사용자(「다른객체들 왜 아무것도 안움직여
   * 자연스럽게 움직이게 해줘야지」)로 그 선을 한 칸 넓혔다 — **이름 없는 배경도 걷는다.**
   * 다만 넓힌 것은 딱 한 칸이다: **자리표(UNIT_PLACES)에 있는 배경만**이다. 자리표에도 명부에도 없는 id 가
   * 걸음표에 끼는 것은 여전히 잡는다 — 그것이 이 시험이 원래 막던 것(자리표에 몰래 끼는 개체)이다.
   */
  it('걸음표(BEATS)에 유령이 없다 — 도는 것은 명부의 것이거나 자리표에 선 배경이다', () => {
    for (const [room, beats] of Object.entries(BEATS)) {
      for (const id of Object.keys(beats)) {
        const places = UNIT_PLACES[room as keyof typeof UNIT_PLACES];
        const listed =
          ROOM_UNITS[room as keyof typeof ROOM_UNITS].includes(id) ||
          (/^bg-(rest|work|cor)-/.test(id) && places.some((p) => p.id === id));
        expect(`${room} ${id} ${listed ? 'listed' : 'unlisted'}`).toBe(`${room} ${id} listed`);
      }
    }
  });

  /*
   * 예전에는 키를 완전 일치로 못 박아 뒀다(`['bg-rest-13','bg-rest-16','u201']`). 그때 적은 근거는
   * 「벽 자리가 서로 3.6 m 인데 BG_GAP 이 3.2 라 여유가 0.4 m 뿐이라 열여섯을 다 걷게 하면 못 서는 방이 된다」였는데,
   * **그 계산은 벽을 따라 옆으로 걸을 때의 것이었다** — 벽에서 안쪽으로 **수직**으로 나오면 이웃과의 거리는
   * √(3.6² + s²) 라 오히려 멀어진다(3.2 m 나오면 4.82 m).
   *
   * 그래서 2026-09-04(사용자: 「휴게랑 중앙시설 개체들만 3 분에 1 정도 걷게」) 에 넷을 더 내보냈다.
   * 이 시험이 지키던 것은 「키가 셋」이 아니라 **「이 방이 순찰하는 방이 되지 않는다」**였으므로,
   * 그 뜻을 세는 방식으로 바꾼다 — 완전 일치를 버리고 아래 넷을 센다.
   */
  it('★ 휴게는 순찰하는 방이 아니다 — 걷는 것은 몸의 3 분의 1 안팎이고, 벽을 떠나도 방 안쪽으로만 나온다', () => {
    const walkers = Object.entries(BEATS.rest).filter(([, b]) => b.posts.length > 1);
    const bodies = UNIT_PLACES.rest.length;

    // ① 3 분의 1 안팎 — 몸 스물하나에 걷는 것 일곱. 절반을 넘으면 군중이 아니라 대열이다
    expect(walkers.length).toBeLessThanOrEqual(Math.ceil(bodies / 2));
    expect(walkers.length).toBeGreaterThanOrEqual(Math.floor(bodies / 4));

    for (const [id, b] of walkers) {
      // ② 걷기 클립이 idle 로 안 되돌아가는 하한 (Unit 의 WALK_MIN 0.3)
      expect(b.speed ?? 0, id).toBeGreaterThan(0.3);
      if (!id.startsWith('bg-rest-')) continue;
      // ③ 걷는 배경은 명부 밖이다 — 그래서 간격이 BG_GAP 이고 이름 있는 다섯의 자리는 그대로 지켜진다
      expect(ROOM_UNITS.rest, id).not.toContain(id);
      /*
       * ④ 벽을 떠나는 배경은 **방 안쪽으로만** 나온다 (|x| 가 줄거나 그대로).
       *   벽을 따라 옆으로 걸으면 이웃(3.6 m)에게 가까워져 BG_GAP 3.2 를 깨고, 그러면 못 서는 몸이 된다.
       *   먼 끝 벽의 둘(13 · 16)은 x 가 같고 z 로 나오므로 「그대로」가 맞는 값이다
       */
      const [a, c] = b.posts;
      expect(Math.abs(c.x), id).toBeLessThanOrEqual(Math.abs(a.x) + 1e-9);
    }

    // ⑤ 벽을 떠나는 것은 열여섯의 절반 이하다 — 줄이 통째로 앞으로 나오면 군중이 아니다
    const leaving = walkers.filter(([id]) => id.startsWith('bg-rest-')).length;
    expect(leaving).toBeLessThanOrEqual(8);
  });

  /*
   * 검문 앞줄 둘은 **선다.** 2026-09-03 에 「줄이 조금씩 움직인다」로 자리를 둘 줬다가 2026-09-04 에 되돌렸다 —
   * 그 둘은 ROOM_UNITS.central2 에 있어 named(6 m)인데 순찰의 문 앞 자리에서 3.27 m · 재회 슬롯에서 3.44 m 라
   * 어느 자리도 6 m 를 못 채워, 걷는 게 아니라 **못 서서 튕기고** 있었다. 슬롯이 채워진 실전 판에서는 한 번도 안 서서
   * 곁 판정(p.still)에 안 들어왔고 — 즉 **말을 걸 수가 없었다.** 자리가 하나면 postFree 를 아예 안 묻는다.
   */
  it('★ 중앙 시설의 검문 앞줄 둘은 자리가 하나다 — 서 있어야 번호를 대는 것들이라 말이 걸린다', () => {
    for (const id of ['bg-c2-044', 'bg-c2-128'] as const) {
      expect(BEATS.central2[id].posts, id).toHaveLength(1);
      expect(ROOM_UNITS.central2, id).toContain(id);
    }
  });

  it('★ 복도에는 총 든 것도 도는 것도 없다 — 첫 방은 배우는 방이다 (2026-09-03 사용자)', () => {
    expect(ROOM_UNITS.corridor).not.toContain('guard21');
    expect(UNIT_PLACES.corridor.some((p) => p.id === 'guard21')).toBe(false);
    expect(Object.keys(BEATS.corridor)).toEqual([]);
    // 서 있는 넷은 그대로다 — 읽고 물을 상대는 남아 있어야 한다
    expect(UNIT_PLACES.corridor.map((p) => p.id).sort()).toEqual(['ally-timid', 'u089', 'u104', 'u137']);
  });
});

describe('작업 구역 — 기다리는 A-201 곁을 다들 지나간다', () => {
  beforeEach(() => patrol.reset('work', UNIT_PLACES.work));

  it('A-201 은 (0.6, −15) 에 서 있고 순찰 선(x 2.4)은 그 몸에서 멎는 거리 밖이다', () => {
    const u = patrol.of('u201')!;
    expect(u.still).toBe(true);
    expect([u.x, u.z]).toEqual([0.6, -15]);
    for (const p of BEATS.work.guard21.posts) expect(Math.abs(p.x - 0.6)).toBeGreaterThan(YIELD);
  });

  it('순찰이 방 끝(z −19.5)까지 갔다가 돌아온다 — A-201 앞에서 안 멎는다', () => {
    let deepest = Infinity;
    run(60, FAR, () => {
      deepest = Math.min(deepest, patrol.of('guard21')!.z);
    });
    expect(deepest).toBeLessThan(-19);
  });

});

describe('중앙 시설 — 홀의 A-118 은 서 있고, 순찰은 그 곁을 지나 양 끝을 오간다', () => {
  beforeEach(() => patrol.reset('central2', UNIT_PLACES.central2));

  it('A-118 은 홀 −x 쪽 한 자리에 서서 코어를 본다 — 자리가 하나라 두 판 내내 한 뼘도 안 움직인다', () => {
    const place = UNIT_PLACES.central2.find((p) => p.id === 'u118')!;
    expect(ROOM_UNITS.central2).toContain('u118');
    let moved = 0;
    run(120, FAR, () => {
      const u = patrol.of('u118')!;
      moved = Math.max(moved, Math.hypot(u.x - place.x, u.z - place.z));
      if (!u.still) moved = Infinity;
    });
    expect(moved).toBe(0);
    // 코어(0, −10.5)를 본다 — 헤딩 규약은 (sin θ, cos θ)
    expect(near(patrol.of('u118')!.heading, Math.atan2(0 - place.x, -10.5 - place.z))).toBe(true);
  });

  it('순찰은 A-118 이 있어도 문 ① 안쪽 벽의 양 끝(±9, 2.6)에 여전히 선다 — 홀의 자리가 벽 쪽 선을 안 건드린다', () => {
    const ends = new Set<number>();
    run(90, FAR, () => {
      for (const m of patrol.standing()) if (m.id === 'guard21') ends.add(Math.sign(m.x));
    });
    expect([...ends].sort()).toEqual([-1, 1]);
  });
});

describe('이야기가 빌리는 걸음 — stare · approach · turnAway · pin', () => {
  beforeEach(() => patrol.reset('rest', UNIT_PLACES.rest));

  it('stare — 서 있는 것이 그 점을 봤다가 ms 뒤 원래 방향으로 돌아온다', () => {
    // u089 는 (5.5, −9) 에 서서 π 를 본다
    const before = patrol.of('u089')!.heading;
    patrol.stare('u089', { x: 0, z: 0 }, 2000, 1000);
    // 반 바퀴 남짓을 TURN(2.4 rad/s)으로 — 1.5 초면 닿는다
    run(1.5, FAR, undefined, 1000);
    const want = Math.atan2(0 - 5.5, 0 + 9);
    expect(near(patrol.of('u089')!.heading, want)).toBe(true);
    // 자리는 안 옮겼고 여전히 서 있다
    expect(patrol.of('u089')!.still).toBe(true);
    expect([patrol.of('u089')!.x, patrol.of('u089')!.z]).toEqual([9.5, -15]);
    run(3, FAR, undefined, 1000 + 2000);
    expect(near(patrol.of('u089')!.heading, before)).toBe(true);
  });

  /*
   * [E] 로 붙잡기 — 2026-09-03 사용자: 「로봇한테 말을 걸면 E를 눌러서 말을 걸수있게해줘.
   * 영역으로하면 움직였을때 오류가 날꺼같아.」 그 「오류」를 막는 장치가 talkHold 다.
   * stare 와 갈리는 점이 셋이라 셋을 다 센다: 걷던 것도 멎는다 · **시각으로 안 풀린다** · still 을 안 바꾼다.
   */
  it('★ talkHold — 걷던 배경이 그 자리에 멎고, 놓아 줄 때까지 안 움직인다', () => {
    patrol.reset('rest', UNIT_PLACES.rest);
    // 걷는 프레임을 잡는다 — 벽을 떠난 배경 하나 (dwell 이 8~16 초라 넉넉히 돌린다)
    let walking = 0;
    run(40, FAR, (now) => {
      if (walking === 0 && patrol.of('bg-rest-13')!.still === false) walking = now;
    });
    expect(walking, '배경이 40 초 안에 한 번은 걷는다').toBeGreaterThan(0);

    patrol.reset('rest', UNIT_PLACES.rest);
    run(walking - 1000, FAR, undefined, 1000);
    const m0 = patrol.of('bg-rest-13')!;
    const wasStill = m0.still;
    const me = { x: 0, z: -12 };
    patrol.talkHold('bg-rest-13', me);

    // 붙잡은 뒤 10 초 — 한 뼘도 안 움직인다
    run(10, me, () => patrol.talkHold('bg-rest-13', me), walking);
    const m1 = patrol.of('bg-rest-13')!;
    expect(Math.hypot(m1.x - m0.x, m1.z - m0.z)).toBeLessThan(1e-9);
    // 고개는 나를 향해 돌았다
    expect(near(m1.heading, Math.atan2(me.x - m1.x, me.z - m1.z))).toBe(true);
    // ★ of().still 은 **안 바뀐다** — 「붙잡혔다」는 사실은 scenario2 의 talkPin 이 따로 안다 (patrol 은 몸만 멈춘다)
    expect(m1.still).toBe(wasStill);

    // 놓으면 다시 걷는다
    patrol.talkHold('bg-rest-13', null);
    run(20, FAR, undefined, walking + 10_000);
    const m2 = patrol.of('bg-rest-13')!;
    expect(Math.hypot(m2.x - m0.x, m2.z - m0.z)).toBeGreaterThan(0.5);
  });

  it('talkHold — 서 있던 것은 놓아 주면 원래 보던 방향으로 돌아간다 (붙잡는 동안 다시 걸어도 안 덮인다)', () => {
    const before = patrol.of('u089')!.heading;
    // 매 프레임 다시 거는 것이 실전 경로다 (scenario2 의 track 이 그렇게 한다) — back 이 덮이면 안 돌아온다
    patrol.talkHold('u089', { x: 0, z: 0 });
    run(2, FAR, () => patrol.talkHold('u089', { x: 0, z: 0 }), 1000);
    expect(near(patrol.of('u089')!.heading, Math.atan2(0 - 9.5, 0 + 15))).toBe(true);
    patrol.talkHold('u089', null);
    run(3, FAR, undefined, 3000);
    expect(near(patrol.of('u089')!.heading, before)).toBe(true);
  });

  it('talkHold — 시각으로 안 풀린다. 30 초를 돌려도 붙잡힌 채다 (stare 와 갈리는 자리)', () => {
    patrol.talkHold('u089', { x: 0, z: 0 });
    run(30, FAR, undefined, 1000);
    expect(near(patrol.of('u089')!.heading, Math.atan2(0 - 9.5, 0 + 15))).toBe(true);
  });

  it('stare — 걷던 것은 그동안 멈춘다', () => {
    // 복도에는 도는 것이 없다 — 순찰이 남아 있는 작업 구역에서 본다
    patrol.reset('work', UNIT_PLACES.work);
    run(3, FAR, undefined, 1000);
    const g0 = patrol.of('guard21')!;
    patrol.stare('guard21', { x: 0, z: 0 }, 1000, 4000);
    run(0.9, FAR, undefined, 4000);
    const g1 = patrol.of('guard21')!;
    expect(Math.hypot(g1.x - g0.x, g1.z - g0.z)).toBeLessThan(1e-9);
    run(3, FAR, undefined, 5000);
    const g2 = patrol.of('guard21')!;
    expect(Math.hypot(g2.x - g0.x, g2.z - g0.z)).toBeGreaterThan(1);
  });

  it('approach — 순찰을 놓고 걸어와 stopAt 앞에 서면 still 이고, release(resume) 면 순찰로 돌아간다', () => {
    patrol.reset('work', UNIT_PLACES.work);
    const me = { x: -0.9, z: 0 };
    patrol.approach('guard21', me, { stopAt: 2, then: 'resume' });
    let stillAt: number | null = null;
    run(20, me, (now) => {
      if (stillAt === null && patrol.of('guard21')!.still) stillAt = now;
    });
    const g = patrol.of('guard21')!;
    expect(g.still).toBe(true);
    expect(Math.hypot(g.x - me.x, g.z - me.z)).toBeLessThanOrEqual(2.2);
    // 나를 본다
    expect(near(g.heading, Math.atan2(me.x - g.x, me.z - g.z), 0.1)).toBe(true);
    // 서 있는 것 명단에도 든다 — 6 m 예외는 이 호출 동안만의 일이다
    expect(patrol.standing().some((m) => m.id === 'guard21')).toBe(true);
    patrol.release('guard21');
    run(6, FAR, undefined, 21000);
    const after = patrol.of('guard21')!;
    expect(Math.hypot(after.x - g.x, after.z - g.z)).toBeGreaterThan(1);
  });

  it('approach(stand) — release 뒤에도 그 자리에 선 채다', () => {
    patrol.reset('work', UNIT_PLACES.work);
    const to = { x: 1.8, z: -4 };
    patrol.approach('guard21', to, { stopAt: 0.5, then: 'stand' });
    run(20, FAR);
    patrol.release('guard21');
    const g = patrol.of('guard21')!;
    run(10, FAR, undefined, 21000);
    const after = patrol.of('guard21')!;
    expect(after.still).toBe(true);
    expect([after.x, after.z]).toEqual([g.x, g.z]);
  });

  it('turnAway — 멎은 채로(frozen) 고개만 반대쪽으로 돈다', () => {
    patrol.freeze(true);
    patrol.turnAway(['u089', 'seer'], { x: 0, z: 0 });
    run(3, FAR);
    const u = patrol.of('u089')!;
    expect(near(u.heading, Math.atan2(5.5 - 0, -9 - 0))).toBe(true);
    expect([u.x, u.z]).toEqual([9.5, -15]);
    patrol.freeze(false);
  });

  it('pin — 밖에서 움직인 몸의 자리를 알린다. still 이면 그 자리에 선 것으로 친다', () => {
    patrol.reset('work', UNIT_PLACES.work);
    patrol.pin('u201', 0.6, -19, Math.PI, false);
    expect(patrol.of('u201')!.still).toBe(false);
    run(1, FAR);
    // 걷는 중인 몸은 patrol 이 안 옮긴다
    expect(patrol.of('u201')!.z).toBe(-19);
    patrol.pin('u201', 0.6, -19.5, Math.PI, true);
    expect(patrol.of('u201')!.still).toBe(true);
    expect(patrol.standing().some((m) => m.id === 'u201' && m.z === -19.5)).toBe(true);
    patrol.drop('u201');
    expect(patrol.has('u201')).toBe(false);
  });
});

/**
 * 사람이 주 통로에 서 있어도 걷는 것이 멎지 않는다 (2026-09-03).
 * 「멎었다」는 사람 1.6 m 안에서 서 있지도(still) 않으면서 0.15 m 넘게 못 움직인 시간 — 옆걸음이 번갈아 실패하는 제자리걸음도 멎은 것이다.
 * 자리에서 쉬는 시간(dwell)은 멎은 것이 아니다 — 그것까지 세면 「30 초 서 있다 한 걸음」이 30 초 멎은 것으로 읽힌다 (maxStall 의 기준점).
 */
describe('사람 앞에서 멎지 않는다 — 비켜 가거나 물러선다', () => {
  /** seconds 동안 사람을 me 에 세워 두고 돌린다. 개체마다 가장 길게 멎은 시간(s) */
  function maxStall(seconds: number, me: { x: number; z: number }, ids: readonly string[]): Record<string, number> {
    const anchor = new Map<string, { x: number; z: number; since: number }>();
    const worst: Record<string, number> = {};
    for (const id of ids) worst[id] = 0;
    run(seconds, me, (now) => {
      for (const id of ids) {
        const p = patrol.of(id)!;
        const a = anchor.get(id);
        // **서 있는 동안(dwell)은 기준점을 계속 새로 찍는다** — 안 찍으면 자리에서 쉰 시간이 첫 걸음에 통째로 「멎은 시간」으로 달린다
        if (!a || p.still || Math.hypot(p.x - a.x, p.z - a.z) > 0.15) {
          anchor.set(id, { x: p.x, z: p.z, since: now });
          continue;
        }
        const near = Math.hypot(p.x - me.x, p.z - me.z) <= 1.6;
        if (near && !p.still) worst[id] = Math.max(worst[id], (now - a.since) / 1000);
      }
    });
    return worst;
  }

  it('★ 작업 구역 — 사람이 순찰선(2.4, −8)에 서 있어도 순찰이 3 초 넘게 안 멎는다', () => {
    // 복도에서 순찰을 뺐으므로(2026-09-03) 이 시험은 순찰이 남은 방에서 돈다
    patrol.reset('work', UNIT_PLACES.work);
    const worst = maxStall(60, { x: 2.4, z: -8 }, ['guard21']);
    for (const [id, s] of Object.entries(worst)) expect(`${id} ${s.toFixed(1)}s`).toBe(`${id} ${Math.min(s, 3).toFixed(1)}s`);
    // 그리고 순찰은 여전히 방 끝까지 간다 — 사람을 돌아 나간 것이지 앞에서 되돌아선 것이 아니다
    let deepest = Infinity;
    run(60, { x: 2.4, z: -8 }, () => {
      deepest = Math.min(deepest, patrol.of('guard21')!.z);
    }, 1000 + 60 * 1000);
    expect(deepest).toBeLessThan(-19);
  });

  it('★ 휴게 — 사람이 가운뎃줄(0, −2)에 서 있어도 서성이는 A-201 이 3 초 넘게 안 멎는다', () => {
    patrol.reset('rest', UNIT_PLACES.rest);
    const worst = maxStall(60, { x: 0, z: -2 }, ['u201']);
    for (const [id, s] of Object.entries(worst)) expect(`${id} ${s.toFixed(1)}s`).toBe(`${id} ${Math.min(s, 3).toFixed(1)}s`);
  });

  it('★ 기록 복도 — 사람이 중심선(s 26)에 서 있어도 오가는 A-137 이 3 초 넘게 안 멎는다', () => {
    patrol.reset('archive', UNIT_PLACES.archive);
    const me = ARCHIVE_PATH.point(26);
    const worst = maxStall(60, me, ['u137']);
    expect(`u137 ${worst.u137.toFixed(1)}s`).toBe(`u137 ${Math.min(worst.u137, 3).toFixed(1)}s`);
  });

  it('사람이 다음 자리 위에 서 있으면 그 자리엔 안 선다 — 밀치지 않고 다음 자리로 돌아선다', () => {
    patrol.reset('rest', UNIT_PLACES.rest);
    // A-201 의 둘째 자리 (0, −3) 위에 선다
    const me = { x: 0, z: -3 };
    let stoodThere = false;
    run(90, me, () => {
      const u = patrol.of('u201')!;
      if (u.still && Math.hypot(u.x - me.x, u.z - me.z) < PLAYER_GAP) stoodThere = true;
    });
    expect(stoodThere).toBe(false);
  });

  /*
   * ★ 배경을 걷어내고 나서 드러난 것 (2026-09-03 시뮬): 휴게 구역에서 움직이는 것은 이제 A-201 하나뿐인데,
   *   사람이 그 자리 하나(0, −1) 위에 서 있으면 「사람은 곧 비킨다」를 믿고 두 판 내내 붙박였다.
   *   그런데 이 방은 **30 초 가만히 서 있는 것이 과제**라 사람이 안 비킨다 — 서지 못하는 것과 서성임이 멎는 것은 다르다.
   */
  it('★ 사람이 자리 위에서 안 비켜도 서성임은 안 멎는다 — 그 자리를 건너뛰고 남은 자리를 계속 돈다', () => {
    patrol.reset('rest', UNIT_PLACES.rest);
    // 자리 (0, −1) 과 (0, −3) 사이 — 앞의 자리는 사람이 밟고 있어 못 서고, 뒤의 자리는 비어 있다
    const me = { x: 0, z: -1.5 };
    let deepest = Infinity;
    let highest = -Infinity;
    let stoodOnPlayer = false;
    run(90, me, () => {
      const u = patrol.of('u201')!;
      deepest = Math.min(deepest, u.z);
      highest = Math.max(highest, u.z);
      if (u.still && Math.hypot(u.x - me.x, u.z - me.z) < PLAYER_GAP) stoodOnPlayer = true;
    });
    // 남은 두 자리((0, −3) · (0, 1))를 둘 다 다녀왔다 — 하나에 붙박이지 않았다
    expect(deepest).toBeLessThan(-2.8);
    expect(highest).toBeGreaterThan(0.8);
    // 그래도 사람을 밀치고 그 자리에 서지는 않는다
    expect(stoodOnPlayer).toBe(false);
  });

  it('순찰은 사람 아닌 개체에게는 여전히 안 물러선다 — 막히면 그 자리에서 기다린다', () => {
    patrol.reset('work', UNIT_PLACES.work);
    // 순찰 선(x 2.4) 양옆에 개체 둘을 세운다 — 사이 2.0 m 라 멎는 거리(1.15) 로는 못 지나고, 비킬 폭(1.2)으로도 못 돈다.
    // 배경이 서던 자리라 이름 있는 둘(A-012 · A-063)을 손으로 옮겨 세운다 — 이 시험이 보는 것은 「누구」가 아니라 「막혔을 때」다
    patrol.pin('u012', 1.4, -8, 0, true);
    patrol.pin('u063', 3.4, -8, 0, true);
    let lowest = Infinity;
    let backed = false;
    let closest = Infinity;
    run(30, FAR, () => {
      const g = patrol.of('guard21')!;
      // 첫 자리(z 0.4)에 서 있다가 내려오는 동안 — 가장 깊이 간 뒤로 0.3 넘게 되돌아오면 물러선 것이다
      if (g.z < lowest) lowest = g.z;
      else if (!g.still && g.z > lowest + 0.3) backed = true;
      for (const [x, z] of [[1.4, -8], [3.4, -8]]) closest = Math.min(closest, Math.hypot(g.x - x, g.z - z));
    });
    expect(backed).toBe(false);
    // 둘 앞에서 멎었지 뚫고 지나가지 않았다 — 둘이 선(x 2.4) 양옆 1.0 에 있어 멎는 자리는 z −8 앞 0.57(√(1.15² − 1²))이지 1.15 가 아니다. 몸엔 YIELD 안으로 안 든다
    expect(lowest).toBeGreaterThan(-8);
    expect(closest).toBeGreaterThanOrEqual(YIELD - 1e-6);
  });

  it('solid 를 주면 발이 그 안으로 안 들어간다 — 직진도 옆걸음도 물러섬도', () => {
    // z −8 ~ −5 가 통째로 벽인 작업 구역 — 라인을 따라 내려오던 순찰이 그 앞에서 막힌다 (복도에는 도는 것이 없다)
    patrol.reset('work', UNIT_PLACES.work, { solid: (_x, z) => z < -5 && z > -8 });
    let deepest = Infinity;
    run(60, { x: 2.4, z: -2 }, () => {
      deepest = Math.min(deepest, patrol.of('guard21')!.z);
    });
    expect(deepest).toBeGreaterThanOrEqual(-5);
    // 벽 앞에서 멎는 것은 순찰뿐이 아니다 — 그래도 벽을 안 뚫는다는 것이 이 시험의 전부다
  });
});

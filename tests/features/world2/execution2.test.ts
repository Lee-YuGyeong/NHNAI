/**
 * 집행 확장 — 「여덟 걸음의 이동」(어디서 죽을 것인가 · 개정 3) + v8 「여덟 걸음」(대본 EIGHT_STEPS).
 *
 * 걸어오는 동안 이동은 자유고, 도주로 치는 것은 **문 방향 ±35° 만**이다. 그리고 어느 걸음도 시간을 못 산다 —
 * until 은 approach 에 들어선 순간 방 값으로 박히고, 그 뒤 flee · tick · 개체의 막아섬에 어떤 좌표를 넘겨도 그 수가 안 변한다
 * (헌법 14 조 「집행은 걸어온다 · 최소 8 초」). 각의 값 자체는 corefield.test 가 지킨다 — 여기서는 execution 이 그 판정을
 * **쓰는지**, 그리고 한 판에 한 번만 세는지를 본다.
 *
 * v8: 개입은 개체가 주도한다 — 걸음 4–5 에 태도 ≥2 가 말로 막고(3 초 · 한 번 더 묻는다 · 답하면 90), 6–7 에 태도 3 이 몸으로 막고(3 초),
 * 8 에 「나를 위해 나선 적 있다」 개체만 대신 부서진다(60). [E] cover 는 없다.
 *
 * 시간 경과는 scenario2.test 와 같은 수법 — fake timer 없이 until · from · pauseUntil 을 직접 mutate 한다.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  EXEC_LOWER,
  FLEE_ANGLE_DEG,
} from "../../../src/features/world2/corefield";
import {
  BLOCK_MS,
  BLOCK_STEPS,
  BODY_BLOCK_STEPS,
  execution,
  EXECUTIONER_ID,
  MIN_WALK_MS,
  STEPS,
} from "../../../src/features/world2/execution";
import { units } from "../../../src/features/world2/units";
import { suspicion } from "../../../src/world/mp/suspicion";

/** 내 자리에서 문까지의 방향을 deg 만큼 돌린 이동 방향 */
function toward(
  me: { x: number; z: number },
  door: { x: number; z: number },
  deg: number,
) {
  const a = Math.atan2(door.z - me.z, door.x - me.x) + (deg * Math.PI) / 180;
  return { dx: Math.cos(a), dz: Math.sin(a) };
}

/** 걸음 k 의 한가운데로 시계를 옮긴다 — from · until 을 같이 밀어 걸음 길이(span)는 그대로다 */
function atStep(k: number) {
  walkedTo((k - 0.5) / STEPS);
}
/** 걸어온 몫 f(0..1) 의 자리로 시계를 옮긴다 — span 은 그대로 */
function walkedTo(f: number) {
  const st = execution.get();
  const span = st.until - st.from;
  const now = performance.now();
  st.from = now - f * span;
  st.until = st.from + span;
}
/** ms 만큼 시간이 흘렀다 치고 from · until 을 같이 당긴다 — span 불변, 남은 시간은 그만큼 준다 */
function elapse(ms: number) {
  const st = execution.get();
  st.from -= ms;
  st.until -= ms;
}

const ME = { x: 0, z: 0 };
const DOOR = { x: 0, z: -18 };

beforeEach(() => {
  execution.reset();
  units.reset();
  suspicion.reset();
});

describe("★ 타이머 불변 — 이동으로 시간을 못 번다 (헌법 14 조)", () => {
  it("approach 에 들어선 뒤 어떤 좌표로 flee · tick 을 불러도 until 이 그대로다", () => {
    execution.cross(100, 11000);
    const { until, from } = execution.get();
    expect(until - from).toBe(11000);

    const spots = [
      { x: 0, z: 0 },
      { x: 5, z: -9 },
      { x: -13, z: 3 },
      { x: 0, z: -17.9 },
      { x: 9, z: -21 },
    ];
    for (const me of spots) {
      execution.flee(["u104"], { dir: toward(me, DOOR, 0), me, door: DOOR });
      execution.flee(["u104"], { dir: toward(me, DOOR, 180), me, door: DOOR });
      execution.tick(["u104", "u089"]);
      expect(execution.get().until).toBe(until);
      expect(execution.get().from).toBe(from);
    }
    // 걸어오는 중 그대로다 — 좌표가 단계도 못 바꾼다
    expect(execution.get().phase).toBe("approach");
  });

  it("좁은 방이어도 8 초 아래로는 안 내려간다 — 이동 판정을 붙여도 같은 값", () => {
    execution.cross(100, 1000);
    const st = execution.get();
    expect(st.until - st.from).toBe(MIN_WALK_MS);
  });

  it("개체가 막아서도 until 은 그대로다 — 멎은 만큼 뒤가 빠를 뿐, 도달 시각은 안 움직인다", () => {
    units.shift("u104", 2);
    execution.cross(100, 16000);
    atStep(4);
    const { until } = execution.get();
    execution.tick(["u104"]);
    expect(execution.get().phase).toBe("blocked");
    expect(execution.get().until).toBe(until);
    execution.get().pauseUntil = performance.now() - 1;
    execution.tick(["u104"]);
    expect(execution.get().phase).toBe("approach");
    expect(execution.get().until).toBe(until);
  });
});

describe("도주 각 — 문 방향 ±35° 만 도주다 (개정 3)", () => {
  it("문 쪽 30° 는 도주다 — 본 개체 전원 태도 −1, 그리고 한 판에 한 번", () => {
    units.shift("u104", 2);
    execution.cross(100, 8000);
    expect(
      execution.flee(["u104", "u089"], {
        dir: toward(ME, DOOR, 30),
        me: ME,
        door: DOOR,
      }),
    ).toBe(true);
    expect(execution.get().fled).toBe(true);
    expect(units.stage("u104")).toBe(1);
    expect(units.stage("u089")).toBe(-1);
    // 두 번째는 방향이 맞아도 안 센다
    expect(
      execution.flee(["u104"], {
        dir: toward(ME, DOOR, 0),
        me: ME,
        door: DOOR,
      }),
    ).toBe(false);
    expect(units.stage("u104")).toBe(1);
  });

  it("문 쪽 60° 는 도주가 아니다 — 개체 곁으로 가는 걸음이다", () => {
    execution.cross(100, 8000);
    expect(
      execution.flee(["u104"], {
        dir: toward(ME, DOOR, 60),
        me: ME,
        door: DOOR,
      }),
    ).toBe(false);
    expect(execution.get().fled).toBe(false);
    expect(units.stage("u104")).toBe(0);
  });

  it("문에서 멀어지는 걸음은 도주가 아니다", () => {
    execution.cross(100, 8000);
    expect(
      execution.flee(["u104"], {
        dir: toward(ME, DOOR, 180),
        me: ME,
        door: DOOR,
      }),
    ).toBe(false);
    expect(execution.get().fled).toBe(false);
  });

  it("무죄였던 걸음은 판을 안 닫는다 — 그 뒤 문 쪽으로 돌면 그때 도주다", () => {
    execution.cross(100, 8000);
    expect(
      execution.flee(["u104"], {
        dir: toward(ME, DOOR, 90),
        me: ME,
        door: DOOR,
      }),
    ).toBe(false);
    expect(
      execution.flee(["u104"], {
        dir: toward(ME, DOOR, FLEE_ANGLE_DEG - 1),
        me: ME,
        door: DOOR,
      }),
    ).toBe(true);
  });

  it("move 를 안 주면 예전 그대로다 — 걸어오는 동안 움직이면 도주 (하위 호환)", () => {
    execution.cross(100, 8000);
    expect(execution.flee(["u104"])).toBe(true);
    expect(units.stage("u104")).toBe(-1);
    expect(execution.flee(["u104"])).toBe(false);
  });

  it("걸어오기 전에는 방향이 맞아도 도주가 아니다", () => {
    execution.cross(80, 8000);
    expect(
      execution.flee(["u104"], {
        dir: toward(ME, DOOR, 0),
        me: ME,
        door: DOOR,
      }),
    ).toBe(false);
  });
});

describe("여덟 걸음 — 걸음 = walkMs 의 8 등분", () => {
  it("걷기 전엔 0, 걷는 동안 1..8, 끝난 뒤엔 8", () => {
    expect(execution.stepOf()).toBe(0);
    execution.cross(60, 16000);
    execution.cross(80, 16000);
    expect(execution.stepOf()).toBe(0);
    execution.cross(100, 16000);
    for (let k = 1; k <= STEPS; k += 1) {
      atStep(k);
      expect(execution.stepOf()).toBe(k);
    }
    execution.get().until = performance.now() - 1;
    execution.tick([]);
    expect(execution.get().phase).toBe("unsling");
    expect(execution.stepOf()).toBe(STEPS);
    expect(execution.progress()).toBe(1);
  });

  it("[E] 로 개체 뒤로 가는 손은 없다 — 개입은 개체가 주도한다", () => {
    expect((execution as unknown as { cover?: unknown }).cover).toBeUndefined();
  });
});

describe("걸음 4–5 · 말로 막는다 — 태도 ≥2 개체가 스스로 나선다", () => {
  it("걸음 4 에 4 m 안 태도 2 개체가 있으면 blocked 다 — 3 초 멎고, 원장에 「나를 위해 나선 적 있다」가 찍힌다", () => {
    units.shift("u104", 2);
    execution.cross(100, 16000);
    atStep(BLOCK_STEPS[0]);
    execution.tick(["u089", "u104"]);
    const st = execution.get();
    expect(st.phase).toBe("blocked");
    expect(st.cover).toBe("u104");
    expect(st.asked).toBe(true);
    expect(st.pauseUntil - performance.now()).toBeGreaterThan(BLOCK_MS - 100);
    expect(units.standsFor("u104")).toBe(true);
    expect(units.standsFor("u089")).toBe(false);
    // 그 개체의 태도는 안 깎인다 — 문서에 값이 없다
    expect(units.stage("u104")).toBe(2);
  });

  it("걸음 3 에는 안 나선다 — 자리가 정해져 있다", () => {
    units.shift("u104", 2);
    execution.cross(100, 16000);
    atStep(BLOCK_STEPS[0] - 1);
    execution.tick(["u104"]);
    expect(execution.get().phase).toBe("approach");
    atStep(BLOCK_STEPS[1]);
    execution.tick(["u104"]);
    expect(execution.get().phase).toBe("blocked");
  });

  it("선을 넘은 개체는 안 나선다 · 태도 1 도 안 나선다", () => {
    units.shift("u104", 1);
    units.cross("u089");
    execution.cross(100, 16000);
    atStep(4);
    execution.tick(["u104", "u089"]);
    expect(execution.get().phase).toBe("approach");
  });

  it("답하면 의심도 90 으로 내려가고 watch 로 물러난다 — 멎음이 풀린 뒤에도 총을 내리기 전까지는 받는다", () => {
    suspicion.bump(100, "돌발");
    units.shift("u104", 2);
    execution.cross(100, 16000);
    atStep(4);
    execution.tick(["u104"]);
    expect(execution.get().phase).toBe("blocked");
    // 멎음이 풀려 다시 걷는다 — 물음은 아직 열려 있다
    execution.get().pauseUntil = performance.now() - 1;
    execution.tick(["u104"]);
    expect(execution.get().phase).toBe("approach");
    expect(execution.get().asked).toBe(true);
    expect(execution.answered()).toBe(true);
    expect(execution.get().phase).toBe("watch");
    expect(execution.get().asked).toBe(false);
    expect(suspicion.get().value).toBe(EXEC_LOWER.answered);
    // 한 번 더는 없다
    expect(execution.answered()).toBe(false);
  });

  it("총을 내리기 시작하면(unsling) 답은 없다 — 그 동작은 판에 한 번뿐이라 물러났다 다시 오면 두 번 보인다", () => {
    suspicion.bump(100, "돌발");
    units.shift("u104", 2);
    execution.cross(100, 16000);
    atStep(4);
    execution.tick(["u104"]);
    expect(execution.get().phase).toBe("blocked");
    execution.get().pauseUntil = performance.now() - 1;
    execution.tick([]);
    execution.get().until = performance.now() - 1;
    execution.tick([]);
    expect(execution.get().phase).toBe("unsling");
    expect(execution.get().asked).toBe(true);
    expect(execution.answered()).toBe(false);
    expect(execution.get().phase).toBe("unsling");
    expect(suspicion.get().value).toBe(100);
  });

  it("★ 답의 창 — 물음이 BLOCK_MS 안에 걸리면 8 초 방에서 걸음 5 끝에 막혀도 총을 내리기 전에 닿는다 (host 는 min(대사, BLOCK_MS) 에 묻는다)", () => {
    suspicion.bump(100, "돌발");
    units.shift("u104", 2);
    execution.cross(100, MIN_WALK_MS);
    // 걸음 5 의 거의 끝 — 막힐 수 있는 가장 늦은 자리. 남은 걸음은 3/8 · 8000 ≈ BLOCK_MS 다
    walkedTo((BLOCK_STEPS[1] - 0.05) / STEPS);
    execution.tick(["u104"]);
    expect(execution.get().phase).toBe("blocked");
    const { until } = execution.get();
    expect(until - performance.now()).toBeGreaterThanOrEqual(BLOCK_MS);
    // 멎음 3 초가 지났고 그 순간 물음이 걸린다 — until 은 안 움직였다
    elapse(BLOCK_MS);
    execution.get().pauseUntil = performance.now() - 1;
    execution.tick(["u104"]);
    expect(execution.get().phase).toBe("approach");
    expect(execution.get().until).toBe(until - BLOCK_MS);
    expect(execution.get().until).toBeGreaterThan(performance.now());
    expect(execution.answered()).toBe(true);
    expect(execution.get().phase).toBe("watch");
    expect(suspicion.get().value).toBe(EXEC_LOWER.answered);
  });

  it("묻지 않았으면 answered 는 아무것도 아니다 — 겨눈 뒤에도", () => {
    execution.cross(100, 8000);
    expect(execution.answered()).toBe(false);
    units.shift("u104", 2);
    atStep(4);
    execution.tick(["u104"]);
    execution.get().pauseUntil = performance.now() - 1;
    execution.tick([]);
    execution.get().until = performance.now() - 1;
    execution.tick([]);
    expect(execution.get().phase).toBe("unsling");
    execution.get().until = performance.now() - 1;
    execution.tick([]);
    expect(execution.get().phase).toBe("aim");
    expect(execution.answered()).toBe(false);
    expect(execution.get().phase).toBe("aim");
  });

  it("말로 막는 것은 한 판에 한 번이다 — 풀린 뒤 걸음 5 에 다른 태도 2 가 있어도 다시 안 멎는다", () => {
    units.shift("u104", 2);
    units.shift("u201", 2);
    execution.cross(100, 16000);
    atStep(4);
    execution.tick(["u104"]);
    execution.get().pauseUntil = performance.now() - 1;
    execution.tick([]);
    atStep(5);
    execution.tick(["u201"]);
    expect(execution.get().phase).toBe("approach");
    expect(units.standsFor("u201")).toBe(false);
  });
});

describe("집행자는 저를 못 막는다 — guard21 은 명부째 넘어와도 개입 후보가 아니다", () => {
  it("태도 2 여도 걸음 4 에 안 나선다 · 태도 3 이어도 걸음 6 에 안 선다", () => {
    expect(EXECUTIONER_ID).toBe("guard21");
    units.shift("guard21", 2);
    execution.cross(100, 16000);
    atStep(4);
    execution.tick(["guard21"]);
    expect(execution.get().phase).toBe("approach");
    expect(units.standsFor("guard21")).toBe(false);
    // cap 이 2 라 3 은 못 되지만, 표를 강제로 찍어도 몸으로 안 선다
    units.markStandsFor("guard21");
    atStep(6);
    execution.tick(["guard21"]);
    expect(execution.get().phase).toBe("approach");
  });

  it("원장에 찍혀 있어도 대신 부서지지 않는다 — 다른 개체는 그대로 나선다", () => {
    units.markStandsFor("guard21");
    execution.cross(100, 8000);
    execution.get().until = performance.now() - 1;
    execution.tick(["guard21"]);
    expect(execution.get().phase).toBe("unsling");

    execution.reset();
    units.markStandsFor("u104");
    execution.cross(100, 8000);
    execution.get().until = performance.now() - 1;
    execution.tick(["guard21", "u104"]);
    expect(execution.get().phase).toBe("spared");
    expect(execution.standIn()).toBe("u104");
  });
});

describe("걸음 6–7 · 몸으로 막는다 — 태도 3 이 총구 앞에 선다", () => {
  it("걸음 6 에 태도 3 이 있으면 bodyBlock — 3 초, 물음은 없다", () => {
    units.shift("u201", 3);
    execution.cross(100, 16000);
    atStep(BODY_BLOCK_STEPS[0]);
    execution.tick(["u201"]);
    const st = execution.get();
    expect(st.phase).toBe("bodyBlock");
    expect(st.cover).toBe("u201");
    expect(st.asked).toBe(false);
    expect(execution.answered()).toBe(false);
    // 몸으로 막는 것은 원장에 안 찍힌다 — 「나선 적 있다」는 말로 막았을 때와 관문뿐이다(D19)
    expect(units.standsFor("u201")).toBe(false);
    execution.get().pauseUntil = performance.now() - 1;
    execution.tick(["u201"]);
    expect(execution.get().phase).toBe("approach");
  });

  it("태도 2 는 몸으로 안 막는다 · 걸음 5 의 태도 3 은 말로 막는 쪽이다", () => {
    units.shift("u104", 2);
    execution.cross(100, 16000);
    atStep(6);
    execution.tick(["u104"]);
    expect(execution.get().phase).toBe("approach");

    execution.reset();
    units.shift("u201", 3);
    execution.cross(100, 16000);
    atStep(5);
    execution.tick(["u201"]);
    expect(execution.get().phase).toBe("blocked");
  });
});

describe("걸음 8 · 대신 부서진다 — 「나를 위해 나선 적 있다」 개체만", () => {
  it("태도 3 만으로는 안 나선다 — 그냥 총을 내린다", () => {
    units.shift("u104", 3);
    execution.cross(100, 8000);
    execution.get().until = performance.now() - 1;
    execution.tick(["u104"]);
    expect(execution.get().phase).toBe("unsling");
    expect(execution.get().cover).toBeNull();
    expect(execution.standIn()).toBeNull();
  });

  it("원장에 찍힌 개체가 곁에 있으면 spared — 의심도 60, 판에 한 번", () => {
    suspicion.bump(100, "돌발");
    units.markStandsFor("u104");
    execution.cross(100, 8000);
    execution.get().until = performance.now() - 1;
    execution.tick(["u089", "u104"]);
    expect(execution.get().phase).toBe("spared");
    expect(execution.standIn()).toBe("u104");
    expect(execution.get().usedStandIn).toBe(true);
    expect(suspicion.get().value).toBe(EXEC_LOWER.spared);
  });

  it("선을 넘은 개체는 찍혀 있어도 안 나선다", () => {
    units.markStandsFor("u104");
    units.cross("u104");
    execution.cross(100, 8000);
    execution.get().until = performance.now() - 1;
    execution.tick(["u104"]);
    expect(execution.get().phase).toBe("unsling");
  });

  it("관측 수준 하향은 내리기만 한다 — 이미 아래면 그대로 (단일 증가 25 상한은 여기서도 산다)", () => {
    suspicion.bump(10, "돌발");
    units.markStandsFor("u104");
    execution.cross(100, 8000);
    execution.get().until = performance.now() - 1;
    execution.tick(["u104"]);
    expect(execution.get().phase).toBe("spared");
    expect(suspicion.get().value).toBe(10);
  });

  it("말로 막은 개체가 걸음 8 에도 곁에 있으면 그것이 대신 부서진다 — 4–5 의 개입이 8 의 조건을 만든다", () => {
    units.shift("u104", 2);
    execution.cross(100, 16000);
    atStep(4);
    execution.tick(["u104"]);
    execution.get().pauseUntil = performance.now() - 1;
    execution.tick([]);
    execution.get().until = performance.now() - 1;
    execution.tick(["u104"]);
    expect(execution.get().phase).toBe("spared");
    expect(execution.standIn()).toBe("u104");
  });
});

describe("끝난 자리의 기록 — 이야기가 채우고 reset 이 지운다", () => {
  it("처음엔 없다. record 가 적고, 단계는 안 건드린다", () => {
    expect(execution.get().result).toBeNull();
    execution.cross(100, 8000);
    execution.get().until = performance.now() - 1;
    execution.tick([]);
    expect(execution.get().phase).toBe("unsling");
    execution.record({
      zone: "shadow",
      witnessed: 1,
      standIn: null,
      room: "중앙 시설",
    });
    expect(execution.get().result).toEqual({
      zone: "shadow",
      witnessed: 1,
      standIn: null,
      room: "중앙 시설",
    });
    expect(execution.get().phase).toBe("unsling");
  });

  it("대신 나선 판은 그 개체가 남는다", () => {
    execution.record({
      zone: "core",
      witnessed: 6,
      standIn: "u104",
      room: "중앙 시설",
    });
    expect(execution.get().result?.standIn).toBe("u104");
  });

  it("reset 이 지운다 — 다음 판으로 안 새어 간다", () => {
    units.shift("u104", 2);
    execution.cross(100, 16000);
    atStep(4);
    execution.tick(["u104"]);
    execution.record({
      zone: "hall",
      witnessed: 3,
      standIn: null,
      room: "복도",
    });
    execution.reset();
    expect(execution.get().result).toBeNull();
    expect(execution.get().fled).toBe(false);
    expect(execution.get().usedBlock).toBe(false);
    expect(execution.get().asked).toBe(false);
    expect(execution.get().phase).toBe("none");
  });
});

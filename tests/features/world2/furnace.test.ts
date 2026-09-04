/**
 * 소각로 — THE_FURNACE 의 값이 문서 그대로인가. 막으면 의심 +30 · 경보 +15 · 본 개체 전원 +1 · A-063 +3 한 번에;
 * 안 막으면 0 / 0 / A-063 선. 그리고 작업 두 주기 · LEAVE_WORK · 「같이 일했다」.
 *
 * 순수 상태기라 host 를 가짜로 세우고 시각을 손으로 민다(node 환경 · fake timer 없음). play 는 한 벌에 1000 ms 로 친다 —
 * 대사 길이 자체는 대화창(lineDurationFor)의 일이지 이 상태기의 관심이 아니다.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { alert } from "../../../src/features/world2/alert";
import {
  FURNACE,
  STARE_MS as CORE_STARE_MS,
  WORK_CYCLE,
} from "../../../src/features/world2/corefield";
import { fragments } from "../../../src/features/world2/fragments";
import {
  FURNACE_ALERT,
  FURNACE_MS,
  FURNACE_SUSPICION,
  furnace,
  type FurnaceHost,
  LEAVE_AFTER_MS,
  STARE_MS,
  WORK_CYCLE_MS,
  WORK_CYCLES,
  WORK_FALLBACK_MS,
  WORK_FIRST_FIRE_MS,
} from "../../../src/features/world2/furnace";
import {
  FURNACE_BLOCK_ME,
  FURNACE_CALL,
  FURNACE_LET,
  LEAVE_WORK,
  LEAVE_WORK_LIKE_US,
  OBJ_WORK,
} from "../../../src/features/world2/script";
import { units } from "../../../src/features/world2/units";
import {
  FIRE_MOUTH_Z,
  WORK_063_SPOT,
  WORK_STATION,
} from "../../../src/world2/map/work";
import { suspicion } from "../../../src/world/mp/suspicion";

const WORK_UNITS = ["u012", "u063", "u201", "guard21"] as const;
const FAR = { x: 0, z: 6 };
const PLAY_MS = 1000;

interface Log {
  played: unknown[];
  cast: { lines: unknown; id: string | null }[];
  objective: (string | null)[];
  stared: string[];
  vanished: string[];
  cycle: (number | null)[];
  once: Set<string>;
}

function fakeHost(): { host: FurnaceHost; log: Log } {
  const log: Log = {
    played: [],
    cast: [],
    objective: [],
    stared: [],
    vanished: [],
    cycle: [],
    once: new Set(),
  };
  const host: FurnaceHost = {
    once: (k) => (log.once.has(k) ? false : (log.once.add(k), true)),
    play: (lines) => (log.played.push(lines), PLAY_MS),
    playCast: (lines, id) => (log.cast.push({ lines, id }), PLAY_MS),
    objective: (t) => void log.objective.push(t),
    raiseAlert: (n) => void alert.raise(n),
    stare: (id) => void log.stared.push(id),
    vanish: (id) => void log.vanished.push(id),
    witnesses: () => WORK_UNITS,
    where: () => "작업 구역",
    passerby: () => "u012",
    cycle: (got) => void log.cycle.push(got),
  };
  return { host, log };
}

beforeEach(() => {
  furnace.reset();
  units.reset();
  alert.reset();
  suspicion.reset();
  fragments.reset();
});

describe("값은 한 곳에 있다", () => {
  it("별칭이 corefield 와 같은 수다 — 8 초 · 30 · 15 · 40 초 × 2 · 12 초 · 25 초 · 150 초", () => {
    expect(FURNACE_MS).toBe(FURNACE.ms);
    expect(FURNACE_SUSPICION).toBe(FURNACE.suspicion);
    expect(FURNACE_ALERT).toBe(FURNACE.alert);
    expect([FURNACE_MS, FURNACE_SUSPICION, FURNACE_ALERT]).toEqual([
      8000, 30, 15,
    ]);
    expect([
      WORK_CYCLE_MS,
      WORK_CYCLES,
      WORK_FIRST_FIRE_MS,
      WORK_FALLBACK_MS,
      LEAVE_AFTER_MS,
    ]).toEqual([40_000, 2, 12_000, 25_000, 150_000]);
    expect(WORK_CYCLE.stationM).toBe(2);
  });

  it("응시 1.2 초는 corefield 의 STARE_MS 하나다", () => {
    expect(STARE_MS).toBe(CORE_STARE_MS);
    expect(STARE_MS).toBe(1200);
  });
});

describe("THE_FURNACE — 8 초, 아무 목표도 안 뜬다", () => {
  it("작업 위치에 안 오면 25 초 폴백으로 열린다 — 「A-201. 투입.」 · 목표 null · A-201 이 걷는다", () => {
    const { host, log } = fakeHost();
    furnace.start(host, 0);
    furnace.tick(WORK_FALLBACK_MS - 1, FAR, null);
    expect(furnace.get().phase).toBe("idle");
    furnace.tick(WORK_FALLBACK_MS, FAR, null);
    expect(furnace.get().phase).toBe("walking");
    expect(log.objective).toEqual([null]);
    expect(log.played[0]).toBe(FURNACE_CALL);
  });

  it("작업 위치에서 첫 주기 12 초를 채우면 그때 열린다 — 폴백보다 먼저", () => {
    const { host } = fakeHost();
    furnace.start(host, 0);
    for (let t = 0; t <= WORK_FIRST_FIRE_MS - 100; t += 100)
      furnace.tick(t, WORK_STATION, null);
    expect(furnace.get().phase).toBe("idle");
    furnace.tick(WORK_FIRST_FIRE_MS + 100, WORK_STATION, null);
    expect(furnace.get().phase).toBe("walking");
  });

  it("몸으로 막았다(1.2 m) — 「잠깐.」이 저절로 나가고, 의심 +30 돌발 · 경보 +15 · 전원 +1 · A-063 +3 · 조각 하나 · A-201 생존", () => {
    const { host, log } = fakeHost();
    furnace.start(host, 0);
    furnace.tick(WORK_FALLBACK_MS, FAR, null);
    const u201 = { x: 0.6, z: -16 };
    furnace.tick(
      WORK_FALLBACK_MS + 1000,
      { x: 0.6, z: -16 - FURNACE.bodyM + 0.05 },
      u201,
    );
    const st = furnace.get();
    expect(st.phase).toBe("blocked");
    expect(st.blocked).toBe(true);
    expect(st.u201Alive).toBe(true);
    expect(st.substitute).toBe(true);
    expect(log.played[1]).toEqual(
      typeof FURNACE_BLOCK_ME === "string"
        ? [{ who: "me", text: FURNACE_BLOCK_ME }]
        : FURNACE_BLOCK_ME,
    );
    expect(suspicion.get().value).toBe(FURNACE_SUSPICION);
    expect(suspicion.get().last?.reason).toBe("돌발");
    expect(alert.get()).toBe(FURNACE_ALERT);
    expect(units.stage("u012")).toBe(1);
    expect(units.stage("u201")).toBe(1);
    expect(units.stage("guard21")).toBe(1);
    expect(units.stage("u063")).toBe(3);
    expect(units.ledger("u063")[0]).toMatchObject({ delta: 3, why: "잠깐." });
    expect(units.ledger("u012")[0]).toMatchObject({ delta: 1, why: "잠깐." });
    expect(fragments.count()).toBe(1);
    expect(fragments.all()[0].text).toBe("불 앞에서 하나를 붙잡았다");
    // 대사가 끝나면 resolved — 목표가 돌아온다
    furnace.tick(WORK_FALLBACK_MS + 1000 + PLAY_MS * 3, FAR, null);
    expect(furnace.get().phase).toBe("resolved");
    expect(furnace.resolved()).toBe(true);
    expect(log.objective.at(-1)).toBe(OBJ_WORK);
  });

  it("말로 막았다 — 플레이어 문장이 원장의 이유다. 「잠깐.」은 안 나간다", () => {
    const { host, log } = fakeHost();
    furnace.start(host, 0);
    furnace.tick(WORK_FALLBACK_MS, FAR, null);
    furnace.blockBySay("거기 서.", WORK_FALLBACK_MS + 2000);
    expect(furnace.get().phase).toBe("blocked");
    expect(units.ledger("u063")[0]).toMatchObject({
      delta: 3,
      why: "거기 서.",
    });
    expect(log.played).toHaveLength(3);
    expect(suspicion.get().value).toBe(FURNACE_SUSPICION);
  });

  it("★ +30 은 단일 증가 25 관례를 깬다 — 대본이 정한 사건이라 허용(D12). 40 미만에서는 60 을 못 넘는 값이 아니라, 두 문턱을 한 번에 못 넘는 값이다", () => {
    suspicion.bump(29, "돌발");
    suspicion.bump(FURNACE_SUSPICION, "돌발");
    expect(suspicion.get().value).toBeLessThan(60);
    suspicion.reset();
    suspicion.bump(39, "돌발");
    suspicion.bump(FURNACE_SUSPICION, "돌발");
    expect(suspicion.get().value).toBeLessThan(80);
  });

  it("안 막았다(8 초) — 아무 일도 없다: 의심 0 · 경보 0. A-063 만 선을 넘고 나를 본다. A-201 은 돌아오지 않는다", () => {
    const { host, log } = fakeHost();
    furnace.start(host, 0);
    furnace.tick(WORK_FALLBACK_MS, FAR, null);
    expect(furnace.fireWalk()).toBe(true);
    furnace.tick(WORK_FALLBACK_MS + FURNACE_MS - 1, FAR, { x: 0.6, z: -20 });
    expect(furnace.get().phase).toBe("walking");
    furnace.tick(WORK_FALLBACK_MS + FURNACE_MS, FAR, { x: 0.6, z: -20 });
    const st = furnace.get();
    expect(st.phase).toBe("let");
    expect(st.blocked).toBe(false);
    expect(st.u201Alive).toBe(false);
    expect(suspicion.get().value).toBe(0);
    expect(alert.get()).toBe(0);
    expect(units.stage("u063")).toBe(-3);
    expect(units.crossed("u063")).toBe(true);
    expect(units.stage("u012")).toBe(0);
    expect(log.played[1]).toBe(FURNACE_LET);
    expect(log.stared).toEqual(["u063"]);
    expect(fragments.count()).toBe(0);
    // 몸은 아직 바닥 한가운데(z −20)다 — 여기서 지우면 불 앞 2.6 m 에서 꺼진다. 표는 켜진 채 입구까지 마저 걷는다
    expect(log.vanished).toEqual([]);
    expect(furnace.fireWalk()).toBe(true);
    expect(furnace.gone("u201")).toBe(false);
    // 국면이 resolved 로 넘어가도 걷는 중이다
    furnace.tick(WORK_FALLBACK_MS + FURNACE_MS + PLAY_MS * 2 + 300, FAR, {
      x: 0.6,
      z: FIRE_MOUTH_Z + 0.5,
    });
    expect(furnace.get().phase).toBe("resolved");
    expect(furnace.fireWalk()).toBe(true);
    expect(log.vanished).toEqual([]);
    // 입구에 닿았다 — 그제야 지운다
    furnace.tick(WORK_FALLBACK_MS + FURNACE_MS + PLAY_MS * 2 + 900, FAR, {
      x: 0.6,
      z: FIRE_MOUTH_Z,
    });
    expect(log.vanished).toEqual(["u201"]);
    expect(furnace.fireWalk()).toBe(false);
    expect(furnace.gone("u201")).toBe(true);
    // 한 번뿐이다
    furnace.tick(WORK_FALLBACK_MS + FURNACE_MS + PLAY_MS * 2 + 1000, FAR, null);
    expect(log.vanished).toEqual(["u201"]);
  });

  it("안 막았는데 Unit 이 입구에서 스스로 사라졌다(자리 null) — 그 프레임에 지운다. 몸이 없으면(들어온 적 없음) 8 초에 바로", () => {
    const a = fakeHost();
    furnace.start(a.host, 0);
    a.host && furnace.tick(WORK_FALLBACK_MS, FAR, null);
    furnace.tick(WORK_FALLBACK_MS + FURNACE_MS, FAR, { x: 0.6, z: -20 });
    expect(a.log.vanished).toEqual([]);
    furnace.tick(WORK_FALLBACK_MS + FURNACE_MS + 100, FAR, null);
    expect(a.log.vanished).toEqual(["u201"]);

    furnace.reset();
    units.reset();
    const b = fakeHost();
    furnace.start(b.host, 0);
    furnace.tick(WORK_FALLBACK_MS, FAR, null);
    furnace.tick(WORK_FALLBACK_MS + FURNACE_MS, FAR, null);
    expect(b.log.vanished).toEqual(["u201"]);
    expect(furnace.fireWalk()).toBe(false);
  });

  it("막히면 그 자리에 선다 — 표가 꺼지고, 지워지지 않는다", () => {
    const { host, log } = fakeHost();
    furnace.start(host, 0);
    furnace.tick(WORK_FALLBACK_MS, FAR, null);
    furnace.blockBySay("거기 서.", WORK_FALLBACK_MS + 2000);
    expect(furnace.fireWalk()).toBe(false);
    furnace.tick(WORK_FALLBACK_MS + 9000, FAR, { x: 0.6, z: FIRE_MOUTH_Z });
    expect(log.vanished).toEqual([]);
    expect(furnace.gone("u201")).toBe(false);
  });

  it("걷는 동안 목표가 없다 — 막든 안 막든 끝나야 돌아온다", () => {
    const { host, log } = fakeHost();
    furnace.start(host, 0);
    furnace.tick(WORK_FALLBACK_MS, FAR, null);
    furnace.tick(WORK_FALLBACK_MS + 4000, FAR, { x: 0.6, z: -20 });
    expect(log.objective).toEqual([null]);
  });
});

describe("AFTER_FURNACE — 갈래", () => {
  it("막았을 때: A-063 4 m 안 첫 진입에 A-063 이 나를 보고 넉 줄 — 한 번뿐", () => {
    const { host, log } = fakeHost();
    furnace.start(host, 0);
    furnace.tick(WORK_FALLBACK_MS, FAR, null);
    furnace.blockBySay("잠깐", WORK_FALLBACK_MS);
    furnace.tick(WORK_FALLBACK_MS + PLAY_MS * 3, FAR, null);
    expect(furnace.get().phase).toBe("resolved");
    const before = log.played.length;
    furnace.tick(
      WORK_FALLBACK_MS + 4000,
      { x: WORK_063_SPOT.x - 3, z: WORK_063_SPOT.z },
      null,
    );
    expect(log.stared).toEqual(["u063"]);
    expect(log.played.length).toBe(before + 1);
    furnace.tick(WORK_FALLBACK_MS + 5000, WORK_063_SPOT, null);
    expect(log.played.length).toBe(before + 1);
  });

  it("안 막았을 때: 6 초 뒤 속마음 한 줄 — A-063 곁에 가도 아무 말이 없다", () => {
    const { host, log } = fakeHost();
    furnace.start(host, 0);
    furnace.tick(WORK_FALLBACK_MS, FAR, null);
    const letAt = WORK_FALLBACK_MS + FURNACE_MS;
    furnace.tick(letAt, FAR, { x: 0.6, z: -20 });
    furnace.tick(letAt + 2500, WORK_063_SPOT, null);
    expect(furnace.get().phase).toBe("resolved");
    const before = log.played.length;
    expect(log.stared).toEqual(["u063"]);
    furnace.tick(letAt + 6000, WORK_063_SPOT, null);
    expect(log.played.length).toBe(before + 1);
    expect(log.stared).toEqual(["u063"]);
  });
});

describe("LEAVE_WORK — 두 주기", () => {
  /** 작업 위치에서 t 까지 100 ms 씩 서 있는다 */
  function work(host: FurnaceHost, from: number, to: number) {
    for (let t = from; t <= to; t += 100) furnace.tick(t, WORK_STATION, null);
  }

  it("두 주기를 다 채우면 문이 열리고, 지나가는 개체가 「우리 같네」 · 전원 +1 「같이 일했다」", () => {
    const { host, log } = fakeHost();
    furnace.start(host, 0);
    work(host, 0, WORK_FIRST_FIRE_MS + 100);
    expect(furnace.get().phase).toBe("walking");
    furnace.blockBySay("안 돼", WORK_FIRST_FIRE_MS + 200);
    work(host, WORK_FIRST_FIRE_MS + 200, WORK_CYCLE_MS + 500);
    expect(furnace.get().cycles).toBe(1);
    expect(furnace.get().phase).toBe("resolved");
    work(host, WORK_CYCLE_MS + 500, WORK_CYCLE_MS * 2 + 1000);
    const st = furnace.get();
    expect(st.cycles).toBe(2);
    expect(st.phase).toBe("leftWork");
    expect(st.worked).toBe(true);
    expect(furnace.left()).toBe(true);
    expect(log.played.at(-1)).toBe(LEAVE_WORK);
    expect(log.cast).toEqual([{ lines: LEAVE_WORK_LIKE_US, id: "u012" }]);
    // 막았을 때 +1 에 「같이 일했다」 +1 — u012 는 2, u063 은 3 이 끝
    expect(units.stage("u012")).toBe(2);
    expect(units.ledger("u012").map((l) => l.why)).toContain("같이 일했다");
    // 집행자는 화물을 안 날랐다 — 막는 걸 본 +1 뿐, 「같이 일했다」는 없다
    expect(units.stage("guard21")).toBe(1);
    expect(units.ledger("guard21").map((l) => l.why)).not.toContain(
      "같이 일했다",
    );
    expect(log.objective.at(-1)).toBeNull();
    expect(log.cycle.at(-1)).toBeNull();
  });

  it("안 막고 두 주기를 채우면 — 불에 들어간 A-201 은 「같이 일했다」를 못 받고, 「우리 같네」를 UNIT-21 이 말하지는 않는다", () => {
    const { host, log } = fakeHost();
    host.passerby = () => "guard21";
    furnace.start(host, 0);
    work(host, 0, WORK_FIRST_FIRE_MS + 100);
    expect(furnace.get().phase).toBe("walking");
    work(host, WORK_FIRST_FIRE_MS + 200, WORK_FIRST_FIRE_MS + FURNACE_MS + 200);
    expect(furnace.get().phase).toBe("let");
    // 입구에 닿아 사라졌다(자리 null 은 work() 가 넘긴다)
    expect(log.vanished).toEqual(["u201"]);
    work(host, WORK_FIRST_FIRE_MS + FURNACE_MS + 300, WORK_CYCLE_MS * 2 + 1000);
    expect(furnace.get().phase).toBe("leftWork");
    expect(furnace.get().worked).toBe(true);
    expect(log.cast).toEqual([{ lines: LEAVE_WORK_LIKE_US, id: null }]);
    expect(units.stage("u201")).toBe(0);
    expect(units.stage("guard21")).toBe(0);
    expect(units.stage("u012")).toBe(1);
  });

  it("작업 위치를 떠나 있으면 초가 안 쌓인다 — 150 초 폴백으로 문이 열리고, 「우리 같네」는 없다", () => {
    const { host, log } = fakeHost();
    furnace.start(host, 0);
    furnace.tick(WORK_FALLBACK_MS, FAR, null);
    const letAt = WORK_FALLBACK_MS + FURNACE_MS;
    furnace.tick(letAt, FAR, { x: 0.6, z: -20 });
    const resolvedAt = letAt + PLAY_MS * 2 + 200;
    furnace.tick(resolvedAt, FAR, null);
    expect(furnace.get().phase).toBe("resolved");
    furnace.tick(resolvedAt + LEAVE_AFTER_MS - 1, FAR, null);
    expect(furnace.get().phase).toBe("resolved");
    furnace.tick(resolvedAt + LEAVE_AFTER_MS, FAR, null);
    expect(furnace.get().phase).toBe("leftWork");
    expect(furnace.get().worked).toBe(false);
    expect(log.cast).toEqual([]);
    expect(units.stage("u012")).toBe(0);
  });

  it("작업 막대 — 채운 초와 40 초. 초가 바뀔 때만 그린다(매 프레임 patch 가 아니다)", () => {
    const { host, log } = fakeHost();
    furnace.start(host, 0);
    furnace.tick(1000, WORK_STATION, null);
    furnace.tick(1200, WORK_STATION, null);
    furnace.tick(1900, WORK_STATION, null);
    furnace.tick(2000, WORK_STATION, null);
    furnace.tick(2400, WORK_STATION, null);
    expect(log.cycle).toEqual([1, 2]);
  });
});

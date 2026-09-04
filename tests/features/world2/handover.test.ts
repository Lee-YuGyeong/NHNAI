/**
 * 넘기는 한 장 — 집행의 자리가 같이 접히는가, 대신 부서진 개체가 표에서 빠지는가, 세션을 건너 살아남는가.
 * v8: 원장 · 「나를 위해 나선 적 있다」 · 조각 수 · A-201 생존 · 「같이 일했다」 · 호의 빈틈 · 경보 · 의심이 같이 실린다(G20).
 *
 * 「여덟 걸음에서 나 대신 부서진 개체는 마지막 방에 없다」 — 호에 빈틈. 표결 규칙 자체(반박·동조·침묵)는 scenario2.test 가
 * 지킨다. 여기서는 execution.result 가 Verdict 에 실리는 길만 본다. node 환경이라 sessionStorage 가 없으면 최소 객체를 깐다.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { alert } from "../../../src/features/world2/alert";
import { execution } from "../../../src/features/world2/execution";
import { fragments } from "../../../src/features/world2/fragments";
import { furnace } from "../../../src/features/world2/furnace";
import { handover } from "../../../src/features/world2/handover";
import { units } from "../../../src/features/world2/units";
import { suspicion } from "../../../src/world/mp/suspicion";

if (typeof globalThis.sessionStorage === "undefined") {
  const mem = new Map<string, string>();
  (globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
  };
}

beforeEach(() => {
  execution.reset();
  units.reset();
  fragments.reset();
  alert.reset();
  suspicion.reset();
  furnace.reset();
  handover.clear();
});

describe("집행의 자리", () => {
  it("아무 일도 없었으면 전부 비어 있다", () => {
    expect(handover.verdict().execution).toEqual({
      zone: null,
      witnessed: 0,
      standIn: null,
      room: null,
    });
  });

  it("대신 부서진 개체는 마지막 방에 없다 — 표에서 빠지고 자리만 남는다", () => {
    units.shift("u104", 3);
    execution.record({
      zone: "core",
      witnessed: 5,
      standIn: "u104",
      room: "central2",
    });
    const v = handover.verdict();
    expect(v.votes.some((x) => x.id === "u104")).toBe(false);
    expect(v.votes).toHaveLength(units.onlyUnits().length - 1);
    expect(v.execution).toEqual({
      zone: "core",
      witnessed: 5,
      standIn: "u104",
      room: "central2",
    });
    // 부서진 개체는 더 이상 「대신 나섬」 표가 아니다
    expect(v.standIn).toBeNull();
    // 호의 빈틈 — 아레나가 이 이름으로 찾는다
    expect(v.gap).toBe("u104");
  });

  it("record 없이 spared 로만 끝나도 cover 가 그 개체다 — 나서는 것은 원장에 찍힌 개체다", () => {
    units.markStandsFor("u201");
    execution.cross(100, 8000);
    execution.get().until = performance.now() - 1;
    execution.tick(["u201"]);
    expect(execution.get().phase).toBe("spared");
    const v = handover.verdict();
    expect(v.execution.standIn).toBe("u201");
    expect(v.gap).toBe("u201");
    expect(v.votes.some((x) => x.id === "u201")).toBe(false);
  });

  it("세션을 건너 그대로 돌아온다", () => {
    execution.record({
      zone: "shadow",
      witnessed: 0,
      standIn: null,
      room: "work",
    });
    const saved = handover.save();
    expect(handover.load()).toEqual(saved);
    expect(handover.load()?.execution.zone).toBe("shadow");
    handover.clear();
    expect(handover.load()).toBeNull();
  });
});

describe("원장이 통째로 넘어간다 (G20)", () => {
  it("아무것도 안 적힌 판 — 원장은 비고, A-201 은 살아 있고, 일한 적 없고, 계량기는 0 이다", () => {
    const v = handover.verdict();
    expect(v.ledger).toEqual({});
    expect(v.standsFor).toEqual([]);
    expect(v.fragmentCount).toBe(0);
    expect(v.u201Alive).toBe(true);
    expect(v.worked).toBe(false);
    expect(v.gap).toBeNull();
    expect(v.alert).toBe(0);
    expect(v.suspicion).toBe(0);
  });

  it("개체마다 이유 한 줄 — 적힌 개체만 실리고, 문장은 원문 그대로다", () => {
    units.note("u137", 2, "내 그림을 봤다", "복도");
    units.note("u089", -1, "쓸데없는 걸 묻는다", "복도");
    const v = handover.verdict();
    expect(Object.keys(v.ledger).sort()).toEqual(["u089", "u137"]);
    expect(v.ledger.u137.map((l) => l.why)).toEqual(["내 그림을 봤다"]);
    expect(v.ledger.u089[0].delta).toBe(-1);
  });

  it("「나를 위해 나선 적 있다」 — 찍힌 개체들이 이름으로 간다", () => {
    units.markStandsFor("u104");
    units.markStandsFor("u201");
    expect(handover.verdict().standsFor.sort()).toEqual(["u104", "u201"]);
  });

  it("조각 수 · 경보 · 의심이 넘기는 순간의 값이다", () => {
    fragments.make({
      text: "불 앞에서 하나를 붙잡았다",
      topic: "불",
      from: "나",
      where: "작업 구역",
      witnesses: ["u012"],
    });
    alert.raise(15);
    suspicion.bump(30, "돌발");
    const v = handover.verdict();
    expect(v.fragmentCount).toBe(1);
    expect(v.fragments.total).toBe(1);
    expect(v.alert).toBe(15);
    expect(v.suspicion).toBe(30);
  });

  it("이야기가 얹은 값이 furnace 를 이긴다 — 그리고 clear 가 지운다", () => {
    handover.fill({ u201Alive: false, worked: true });
    expect(handover.verdict().u201Alive).toBe(false);
    expect(handover.verdict().worked).toBe(true);
    handover.clear();
    expect(handover.verdict().u201Alive).toBe(true);
    expect(handover.verdict().worked).toBe(false);
  });

  it("저장한 한 장에 새 열이 전부 있다", () => {
    units.note("u104", 1, "같이 일했다", "작업 구역");
    const saved = handover.save();
    const back = handover.load();
    expect(back).toEqual(saved);
    expect(back?.ledger.u104[0].why).toBe("같이 일했다");
    expect(back).toHaveProperty("standsFor");
    expect(back).toHaveProperty("u201Alive");
    expect(back).toHaveProperty("worked");
    expect(back).toHaveProperty("gap");
  });
});

/**
 * 경비의 말 걸기 — OPENERS 20 통과 · WATCH 40 · 무응답 +8 · 보고 수용 −16 · 여덟 걸음의 물음 → 90 · 스캔 60.
 * 모델은 없다: 이유는 저장소 사유의 매핑이고 판정은 judgeLine 과 「이상 없」뿐이다. 문장은 문서의 것만 나간다.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { OPENER } from "../../../src/features/world2/corefield";
import { execution, STEPS } from "../../../src/features/world2/execution";
import {
  openers,
  type OpenersHost,
} from "../../../src/features/world2/openers";
import { WATCH_LINES } from "../../../src/features/world2/script";
import { units } from "../../../src/features/world2/units";
import { suspicion } from "../../../src/world/mp/suspicion";

interface Log {
  spoken: { who: string; text: string }[];
  played: unknown[];
  approached: string[];
  released: string[];
  stillness: (number | null)[];
  once: Set<string>;
}

function fakeHost(
  opts: {
    guard?: { x: number; z: number } | null;
    random?: number;
    me?: { x: number; z: number };
    lastSayAt?: number;
    muralGazeMs?: number;
    free?: boolean;
  } = {},
) {
  const log: Log = {
    spoken: [],
    played: [],
    approached: [],
    released: [],
    stillness: [],
    once: new Set(),
  };
  const me = opts.me ?? { x: 0, z: 0 };
  const host: OpenersHost = {
    once: (k) => (log.once.has(k) ? false : (log.once.add(k), true)),
    play: (lines) => (log.played.push(lines), 1000),
    speak: (who, texts) => (
      texts.forEach((text) => log.spoken.push({ who, text })),
      700
    ),
    me: () => me,
    where: () => "복도",
    guard: () =>
      opts.guard === null
        ? null
        : { ...(opts.guard ?? { x: 2, z: 0 }), still: false },
    approach: (id) => void log.approached.push(id),
    release: (id) => void log.released.push(id),
    stillness: (got) => void log.stillness.push(got),
    random: () => opts.random ?? 0,
  };
  if (opts.lastSayAt !== undefined) host.lastSayAt = () => opts.lastSayAt!;
  if (opts.muralGazeMs !== undefined)
    host.muralGazeMs = () => opts.muralGazeMs!;
  if (opts.free !== undefined) host.guardFree = () => opts.free!;
  return { host, log, me };
}

beforeEach(() => {
  openers.reset();
  execution.reset();
  units.reset();
  suspicion.reset();
});

describe("20 을 넘는 순간 — 판당 한 번, 이유별 한 줄", () => {
  it("돌발로 넘으면 돌발 줄 — 경비가 다가오고 물음이 걸린다", () => {
    const { host, log } = fakeHost();
    openers.bind(host);
    openers.tick(0);
    suspicion.bump(20, "돌발");
    openers.tick(1000);
    expect(openers.pending()).toBe(true);
    expect(openers.kind()).toBe("opener");
    expect(log.approached).toEqual(["guard21"]);
    expect(log.spoken).toHaveLength(1);
    expect(log.spoken[0].who).toBe("guard21");
    expect(["방금 그거 뭐야.", "왜 그렇게 움직여."]).toContain(
      log.spoken[0].text,
    );
  });

  it("침착 · 보고로 넘으면 「잠깐. 번호.」", () => {
    const { host, log } = fakeHost();
    openers.bind(host);
    openers.tick(0);
    suspicion.bump(20, "보고");
    openers.tick(1000);
    expect(log.spoken[0].text).toBe("잠깐. 번호.");
  });

  it("경비가 방에 없으면 안 온다 — 그리고 그 판의 한 번은 안 쓴다", () => {
    const { host, log } = fakeHost({ guard: null });
    openers.bind(host);
    openers.tick(0);
    suspicion.bump(20, "돌발");
    openers.tick(1000);
    expect(openers.pending()).toBe(false);
    expect(log.spoken).toEqual([]);
    expect(log.once.has("openers:20")).toBe(false);
  });

  it("넘는 순간을 저장소에서 잡는다 — 경비 없는 방에서 넘은 20 은 버리고, 뒤에 경비 앞에서 다시 넘으면 그때 온다", () => {
    const g = { v: null as { x: number; z: number } | null };
    const { host, log } = fakeHost();
    host.guard = () => (g.v ? { ...g.v, still: false } : null);
    openers.bind(host);
    // 휴게 — 경비가 없다. 넘는 순간이 여기라 버린다
    suspicion.bump(20, "돌발");
    // 중앙 시설로 — 경비가 있다. 지난 방에서 넘은 것은 첫 tick 에 안 터진다
    g.v = { x: 2, z: 0 };
    openers.tick(5000);
    expect(openers.pending()).toBe(false);
    expect(log.spoken).toEqual([]);
    // 내려갔다 경비 앞에서 다시 넘는다 — 이번엔 온다
    suspicion.bump(-10, "침착");
    suspicion.bump(10, "돌발");
    openers.tick(6000);
    expect(openers.pending()).toBe(true);
    expect(log.once.has("openers:20")).toBe(true);
  });

  it("경비가 검문에 묶여 있으면(guardFree false) 안 온다 · 잡담도 없다 — 한 번은 남는다", () => {
    const { host, log } = fakeHost({ free: false });
    openers.bind(host);
    openers.tick(0);
    suspicion.bump(20, "돌발");
    openers.tick(1000);
    expect(openers.pending()).toBe(false);
    expect(log.spoken).toEqual([]);
    expect(log.once.has("openers:20")).toBe(false);
    openers.tick(OPENER.chatMs * 2);
    expect(log.spoken).toEqual([]);
  });

  it("이유의 창은 corefield 의 수다 — 직전 5 초 안의 발화가 「발화」, 3 초 넘은 벽화 응시가 「그림」", () => {
    const a = fakeHost({ lastSayAt: 1000 - OPENER.sayWindowMs });
    openers.bind(a.host);
    openers.tick(0);
    suspicion.bump(20, "돌발");
    openers.tick(1000);
    expect(["방금 무슨 말 했어.", "누구한테 말한 거야."]).toContain(
      a.log.spoken[0].text,
    );

    openers.reset();
    suspicion.reset();
    const b = fakeHost({
      lastSayAt: 1000 - OPENER.sayWindowMs - 1,
      muralGazeMs: OPENER.gazeMs,
    });
    openers.bind(b.host);
    openers.tick(0);
    suspicion.bump(20, "돌발");
    openers.tick(1000);
    expect(["거기서 뭘 읽어.", "그 벽 아무것도 아니야."]).toContain(
      b.log.spoken[0].text,
    );
  });

  it("한 판에 한 번이다 — 내려갔다 다시 넘어도 두 번째는 없다", () => {
    const { host, log } = fakeHost();
    openers.bind(host);
    openers.tick(0);
    suspicion.bump(20, "돌발");
    openers.tick(1000);
    openers.answer("확인.", 1000);
    suspicion.bump(-20, "침착");
    openers.tick(2000);
    suspicion.bump(25, "감정");
    openers.tick(3000);
    expect(openers.pending()).toBe(false);
    expect(log.spoken.filter((s) => s.text !== "그래. 알겠어.")).toHaveLength(
      1,
    );
  });
});

describe("답 — D9", () => {
  function asked() {
    const f = fakeHost();
    openers.bind(f.host);
    openers.tick(0);
    suspicion.bump(20, "돌발");
    openers.tick(1000);
    f.log.spoken.length = 0;
    return f;
  }

  it("「구역 이상 없음」 → 「그래. 알겠어.」 −16 · 원장에 내 문장 원문", () => {
    const { log } = asked();
    openers.answer("구역 이상 없음", 2000);
    expect(log.spoken).toEqual([{ who: "guard21", text: "그래. 알겠어." }]);
    expect(suspicion.get().value).toBe(20 + OPENER.accept);
    // 원장에 내 문장 원문이 ±0 으로 남는다(units.remember) — 태도는 안 움직인다
    expect(units.stage("guard21")).toBe(0);
    expect(units.ledger("guard21")).toContainEqual(
      expect.objectContaining({
        delta: 0,
        why: "구역 이상 없음",
        where: "복도",
      }),
    );
    expect(openers.pending()).toBe(false);
    expect(log.released).toEqual(["guard21"]);
  });

  it("보고 톤(judgeLine) 도 수용이다", () => {
    const { log } = asked();
    openers.answer("순찰 완료. 대기 중.", 2000);
    expect(log.spoken[0].text).toBe("그래. 알겠어.");
  });

  it("오르는 톤 → 「같이 가자.」 감시가 붙는다 — 죽지는 않는다", () => {
    const { log } = asked();
    openers.answer("무서워요… 제발!!", 2000);
    expect(log.spoken[0].text).toBe("같이 가자.");
    expect(openers.escort()).toBe(true);
    expect(suspicion.get().value).toBe(20);
  });

  it("그 밖에는 「됐어. 가.」", () => {
    const { log } = asked();
    openers.answer("그냥 지나가던 길인데 뭐 어쩌라고 하는 건지 나도 잘", 2000);
    expect(log.spoken[0].text).toBe("됐어. 가.");
    expect(openers.escort()).toBe(false);
  });

  it("18 초 무답 → 「…말이 없네.」 +8 말투 — 창은 줄이 끝난 뒤(가짜 speak 700)부터 센다", () => {
    const { log } = asked();
    openers.tick(1000 + 700 + OPENER.silentMs - 1);
    expect(openers.pending()).toBe(true);
    openers.tick(1000 + 700 + OPENER.silentMs);
    expect(openers.pending()).toBe(false);
    expect(log.spoken).toEqual([{ who: "guard21", text: "…말이 없네." }]);
    expect(suspicion.get().value).toBe(20 + OPENER.silent);
    expect(suspicion.get().last?.reason).toBe("말투");
  });

  it("무응답의 시계는 경비가 자리를 비워도 간다 — tick 은 명부와 무관하게 매 프레임", () => {
    const g = { v: { x: 2, z: 0 } as { x: number; z: number } | null };
    const { host, log } = fakeHost();
    host.guard = () => (g.v ? { ...g.v, still: false } : null);
    openers.bind(host);
    openers.tick(0);
    suspicion.bump(20, "돌발");
    openers.tick(1000);
    expect(openers.pending()).toBe(true);
    log.spoken.length = 0;
    g.v = null;
    openers.tick(1000 + 700 + OPENER.silentMs);
    expect(openers.pending()).toBe(false);
    expect(log.spoken).toEqual([{ who: "guard21", text: "…말이 없네." }]);
  });
});

describe("방을 나간다 — leaveRoom", () => {
  it("걸린 물음 · 스캔이 아무 말 없이 내려간다: +8 도, 판정도 없다. 경비는 순찰로, 막대는 내린다", () => {
    const { host, log } = fakeHost();
    openers.bind(host);
    expect(openers.watch(1000)).toBe(true);
    expect(openers.pending()).toBe(true);
    log.spoken.length = 0;
    openers.leaveRoom();
    expect(openers.pending()).toBe(false);
    expect(openers.kind()).toBeNull();
    expect(log.spoken).toEqual([]);
    expect(suspicion.get().value).toBe(0);
    expect(log.released).toEqual(["guard21"]);
    expect(log.stillness.at(-1)).toBeNull();
    // 18 초가 지나도 아무것도 없다 — 시계째 내려갔다
    openers.tick(1000 + OPENER.silentMs);
    expect(log.spoken).toEqual([]);
    expect(suspicion.get().value).toBe(0);
    // 다음 방에서 say 가 answer 로 돌 일이 없다
    openers.answer("확인.", 30_000);
    expect(log.spoken).toEqual([]);
  });

  it("스캔도 내려간다 — 다음 방 첫 프레임에 지난 방의 자리로 +16 이 안 터진다", () => {
    const { host, me } = fakeHost();
    openers.bind(host);
    expect(openers.scan(0)).toBe(true);
    openers.leaveRoom();
    expect(openers.scanning()).toBe(false);
    me.x = 5;
    openers.tick(500);
    expect(suspicion.get().value).toBe(0);
  });

  it("판의 것은 남는다 — WATCH 의 한 번 · 20 의 한 번 · escort", () => {
    const { host, log } = fakeHost();
    openers.bind(host);
    openers.watch(1000);
    openers.answer("무서워요… 제발!!", 2000);
    expect(openers.escort()).toBe(true);
    openers.leaveRoom();
    expect(openers.escort()).toBe(true);
    expect(openers.watch(3000)).toBe(false);
    expect(log.once.has("openers:watch")).toBe(true);
  });
});

describe("WATCH 40 — 판당 딱 한 번", () => {
  it("과학자 · UNIT-21 두 줄이 나가고 물음이 걸린다. 두 번째 watch 는 없다", () => {
    const { host, log } = fakeHost();
    openers.bind(host);
    expect(openers.watch(5000)).toBe(true);
    expect(log.played).toEqual([WATCH_LINES]);
    expect(openers.kind()).toBe("watch");
    openers.answer("확인.", 6000);
    expect(openers.watch(7000)).toBe(false);
    expect(log.played).toHaveLength(1);
  });

  it("경비가 방에 없으면 false 이고 그 판의 한 번은 안 쓴다 — 경비 앞에서 다시 부르면 그때 걸린다", () => {
    const g = { v: null as { x: number; z: number } | null };
    const { host, log } = fakeHost();
    host.guard = () => (g.v ? { ...g.v, still: false } : null);
    openers.bind(host);
    expect(openers.watch(1000)).toBe(false);
    expect(log.played).toEqual([]);
    expect(log.once.has("openers:watch")).toBe(false);
    g.v = { x: 2, z: 0 };
    expect(openers.watch(2000)).toBe(true);
    expect(log.once.has("openers:watch")).toBe(true);
    expect(openers.watch(3000)).toBe(false);
  });

  it("검문에 묶인 경비는 WATCH 도 못 건다 — 한 번은 남는다", () => {
    const { host, log } = fakeHost({ free: false });
    openers.bind(host);
    expect(openers.watch(1000)).toBe(false);
    expect(log.once.has("openers:watch")).toBe(false);
  });
});

describe("잡담 — 20 을 지난 판에서만 · 75 초마다 40 % · 3 m 안", () => {
  it("굴려서 나오면 한 줄, 안 나오면 없다 — 굴리는 것은 75 초에 한 번", () => {
    const roll = { v: 0.1 };
    const { host, log } = fakeHost();
    host.random = () => roll.v;
    openers.bind(host);
    openers.tick(0);
    suspicion.bump(20, "돌발");
    openers.tick(1000);
    openers.answer("확인.", 1000);
    log.spoken.length = 0;
    openers.tick(1000 + OPENER.chatMs - 1);
    expect(log.spoken).toEqual([]);
    openers.tick(1000 + OPENER.chatMs);
    expect(log.spoken).toHaveLength(1);
    expect(["코어 동기화 일곱 시.", "여긴 별일 없어.", "가 봐."]).toContain(
      log.spoken[0].text,
    );
    roll.v = 0.9;
    openers.tick(1000 + OPENER.chatMs * 2);
    expect(log.spoken).toHaveLength(1);
  });

  it("20 을 안 지난 판에는 잡담이 없다", () => {
    const { host, log } = fakeHost();
    openers.bind(host);
    openers.tick(0);
    openers.tick(OPENER.chatMs * 3);
    expect(log.spoken).toEqual([]);
  });
});

describe("여덟 걸음의 물음 — 답하면 의심도 90", () => {
  it("집행자가 「잠깐. 번호.」를 묻고, 답이 오면 판정 없이 execution.answered", () => {
    suspicion.bump(100, "돌발");
    units.shift("u104", 2);
    execution.cross(100, 16000);
    const st = execution.get();
    const span = st.until - st.from;
    st.from = performance.now() - (3.5 / STEPS) * span;
    st.until = st.from + span;
    execution.tick(["u104"]);
    expect(execution.get().phase).toBe("blocked");

    // 집행자의 물음이라 명부의 경비를 안 본다(guard null) — 다가올 것도 없다: 이미 앞에 있다
    const { host, log } = fakeHost({ guard: null });
    openers.bind(host);
    expect(openers.ask("block", 1000, 2400)).toBe(true);
    expect(log.spoken).toEqual([{ who: "guard21", text: "잠깐. 번호." }]);
    expect(log.approached).toEqual([]);
    openers.answer("무서워요!!", 2000);
    expect(execution.get().phase).toBe("watch");
    expect(suspicion.get().value).toBe(90);
    // 판정 줄은 없다 — 답했다는 사실이 값이다
    expect(log.spoken).toHaveLength(1);
    expect(units.stage("guard21")).toBe(0);
  });

  it("집행이 묻지 않았으면(asked 아님) 물음이 안 걸린다 — 아무것도 안 쓴다", () => {
    const { host, log } = fakeHost();
    openers.bind(host);
    expect(openers.ask("block", 1000)).toBe(false);
    expect(openers.pending()).toBe(false);
    expect(log.spoken).toEqual([]);
  });
});

describe("스캔 60 — 3.8 초 가만히", () => {
  it("경비가 방에 없으면 안 건다 — 다가올 것도 막대도 없다", () => {
    const { host, log } = fakeHost({ guard: null });
    openers.bind(host);
    expect(openers.scan(0)).toBe(false);
    expect(openers.scanning()).toBe(false);
    expect(log.approached).toEqual([]);
    expect(log.stillness).toEqual([]);
  });

  it("막대는 초가 바뀔 때만 다시 그린다 — 매 프레임 patch 가 아니다", () => {
    const { host, log } = fakeHost();
    openers.bind(host);
    openers.scan(0);
    openers.tick(200);
    openers.tick(900);
    openers.tick(1000);
    openers.tick(1300);
    openers.tick(2000);
    openers.tick(2400);
    expect(log.stillness).toEqual([0, 1, 2]);
  });

  it("0.45 m 넘게 움직이면 +16 돌발, 채우면 아무것도 없다", () => {
    const { host, log, me } = fakeHost();
    openers.bind(host);
    openers.scan(0);
    expect(openers.scanning()).toBe(true);
    expect(log.approached).toEqual(["guard21"]);
    openers.tick(1000);
    expect(log.stillness.at(-1)).toBe(1);
    me.x = OPENER.scanMoveM + 0.1;
    openers.tick(1500);
    expect(openers.scanning()).toBe(false);
    expect(suspicion.get().value).toBe(OPENER.scanFail);
    expect(suspicion.get().last?.reason).toBe("돌발");
    expect(log.stillness.at(-1)).toBeNull();

    suspicion.reset();
    openers.scan(2000);
    openers.tick(2000 + OPENER.scanMs);
    expect(openers.scanning()).toBe(false);
    expect(suspicion.get().value).toBe(0);
    expect(log.released).toEqual(["guard21", "guard21"]);
  });
});

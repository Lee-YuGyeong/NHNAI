/**
 * 경비의 말 걸기 — **OPENERS · WATCH · 스캔.** 대본 v8 「의심도가 오르면 저쪽이 먼저 온다」의 world2 판.
 *
 * 본판 interrogation.ts 에 같은 장치가 있지만 world2 는 공유 코드에 손대지 않는다(memory world2-scenario2) — 그래서 여기 따로 둔다.
 * 순수 상태기 + host 콜백이다. 모델은 없다: 이유는 의심도 저장소의 마지막 사유(suspicion.last.reason)를 문서의 이유로 옮기고(D10),
 * 답의 판정은 본판 judgeLine 의 말투 판정과 「구역 이상 없음」 정규식뿐이다(D9). 원장에는 플레이어 문장 원문을 남긴다 — 이유를 지어내지 않는다.
 *
 *   20 을 넘는 순간  경비가 다가와 이유별 한 줄. 판당 한 번. 그 뒤로는 잡담뿐(75 초마다 40 %, 3 m 안을 지날 때)
 *   40 (WATCH)       「…뒤에 하나 붙었습니다.」 「어이. 잠깐만.」 — 내가 답하고 경비가 판정한다. 틀려도 안 죽는다
 *   60 (스캔)        경비가 2 m 앞에 서고 3.8 초를 가만히 견딘다 — 0.45 m 넘게 움직이면 +16 '돌발'(본판 scan FAIL, D26). 통과 보상 없음
 *   여덟 걸음 4–5    말로 막힌 집행자가 한 번 더 묻는다(문서에 줄이 없어 OPENERS 「잠깐. 번호.」) — 답이 오면 execution.answered() (의심도 90)
 *
 * 답 판정: '보고'/'침착' 톤 또는 /이상\s*없/ → 「그래. 알겠어.」 −16 · 오르는 톤 → 「같이 가자.」(escort) · 그 외 「됐어. 가.」 ·
 * 18 초 무답 → 「…말이 없네.」 +8 '말투'. 값은 corefield.OPENER 하나에만 적혀 있다.
 *
 * ★ 물음은 **방을 못 넘는다.** 복도에서 걸린 WATCH 가 휴게의 첫마디를 가로채면 「경비가 어디서 말하나」가 안 맞는다 — enterRoom 이
 *   leaveRoom() 을 불러 걸린 물음 · 스캔을 내린다. 그리고 tick 은 **경비가 없는 방에서도 매 프레임** 돌아야 한다: 18 초 무응답의
 *   시계가 방을 따라다니지 않으면 물음이 다음 방까지 산다. 경비의 유무로 막는 것은 **말을 거는 것**(ask · 잡담)뿐이다.
 * ★ 20 통과는 **저장소가 움직이는 순간** 잡는다(suspicion.subscribe) — 지난 tick 의 값과 견주는 방식은 tick 이 안 도는 방에서 넘은
 *   것을 다음 방 첫 프레임에 엉뚱한 이유로 터뜨린다. 그 순간 경비가 없으면 **버린다**(판당 한 번은 안 쓴다).
 * ★ 판당 한 번 표(20 · WATCH)는 **물음이 실제로 걸린 뒤에만** 찍는다 — 경비 없는 방에서 넘은 40 이 그 판의 WATCH 를 통째로 지우면 안 된다.
 */

import { judgeLine, suspicion } from "@/world/mp/suspicion";

import { OPENER, type Vec2 } from "./corefield";
import { execution } from "./execution";
import {
  type Line,
  OPENER_ACCEPT,
  OPENER_CHAT,
  OPENER_ESCORT,
  OPENER_SILENT,
  OPENERS,
  WATCH_LINES,
} from "./script";
import { units } from "./units";

export type OpenerKind = "opener" | "watch" | "block";

/** 이 상태기가 방에 시키는 것 — scenario2 가 채운다. `?` 붙은 것은 없어도 돈다(연출만 빠진다) */
export interface OpenersHost {
  once(key: string): boolean;
  play(lines: readonly Line[], startAt?: number): number;
  speak(who: string, texts: readonly string[], startAt?: number): number;
  me(): Vec2;
  /** 원장에 적는 자리 이름 — ROOM_TITLE[room] */
  where(): string;
  /** 경비(guard21)가 이 방에 있나 · 어디 있나. 없으면 null — 그러면 말을 못 건다 */
  guard(): (Vec2 & { still: boolean }) | null;
  /** patrol.approach — 경비가 내 곁 stopAt 까지 걸어와 선다 */
  approach?(
    id: string,
    to: Vec2,
    opts: { stopAt: number; then: "stand" | "resume" },
  ): void;
  /** patrol.release — 판정이 끝났다. 순찰로 돌아간다 */
  release?(id: string): void;
  /** patrol.stare — 경비가 앞에 와 선 뒤 물음의 창 동안 나를 본다. 걷는 동안엔 안 건다(stare 는 걸음을 멈춘다) */
  stare?(id: string, ms: number): void;
  /** 스캔 막대 — Stillness 재사용, 라벨 '가만히 — n초'. null 이면 내린다 */
  stillness?(got: number | null, need: number): void;
  /** 마지막 say() 시각 — 5 초 안이면 이유 '발화'(D10) */
  lastSayAt?(): number;
  /** 벽화 응시 누적 ms — 3 초 이상이면 이유 '그림'(D10) */
  muralGazeMs?(): number;
  /** 잡담 확률 · 줄 고르기 — 시험이 고정한다 */
  random?(): number;
  /**
   * 경비가 검문 · 락다운 · 어둠에 묶여 있지 않은가 — 중앙 시설의 국면이 'bright' 가 아니거나 관문이 열려 있으면 false.
   * false 면 말을 안 건다(20 · WATCH · 스캔 · 잡담): 검문 중인 경비가 초소를 버리고 오면 답할 길이 없는 물음이 걸린다.
   * 없으면 언제나 건다. 여덟 걸음의 물음('block')은 집행자의 것이라 이걸 안 본다
   */
  guardFree?(): boolean;
  /**
   * 잡담을 해도 되나 — 조작권이 있고(손도 안 댄 판에 경비가 말을 거는 건 혼잣말이다), 저쪽이 먼저 건 말(address)의 뜸 20 초가 지났을 때.
   * 없으면 언제나. 20 통과 · WATCH · 스캔은 이걸 안 본다 — 그것들은 내 값이 부른 것이다
   */
  chatOk?(): boolean;
}

/** 문서의 이유 이름 — OPENERS 표의 열쇠. 응시 · 관심은 등록만 되어 있고 안 쓴다(D10) */
type ReasonKey =
  "돌발" | "뒷걸음" | "감정" | "말투" | "발화" | "그림" | "침착" | "보고";

let host: OpenersHost | null = null;
/** 지금 걸려 있는 물음 — 답이 오거나 18 초가 지나면 내려간다 */
let pending: OpenerKind | null = null;
/** 물음의 줄이 **끝나는** 시각 — 무응답 18 초는 여기서부터 센다(말이 끝나기도 전에 시계가 도는 것은 묻는 것이 아니다) */
let askedAt = 0;
/** 경비가 앞에 와 서면 한 번 나를 보게 한다 — 걸린 물음마다 한 번 */
let staredFor: OpenerKind | null = null;
/** 「같이 가자.」 — 감시가 붙었다. 아레나까지 남는 표시는 아직 없다(기록만) */
let escort = false;
/** 저장소가 마지막으로 알린 의심도 — 20 통과를 잡는 기준 */
let lastValue = 0;
/** 20 을 넘는 것을 봤고 경비가 있었다 — 다음 tick 이 그 시각으로 묻는다 */
let armed20 = false;
/** 이 판에 20 의 첫마디가 걸렸다 · WATCH 가 걸렸다 — 판당 한 번. 물음이 실제로 걸린 뒤에만 찍힌다 */
let passed20 = false;
let watched = false;
/** 저장소 구독을 끊는 손 */
let unsub: (() => void) | null = null;
/** 다음 잡담을 굴려도 되는 시각 */
let chatAt = 0;
/** 스캔 — 시작 자리와 시각 */
let scan: { origin: Vec2; from: number } | null = null;
/** 스캔 막대에 마지막으로 보인 초 — 초가 바뀔 때만 host 를 부른다(매 프레임 patch 는 방 전체를 다시 그린다) */
let scanShown = -1;

/** 말을 걸 수 있는 방 상태인가 — host 가 안 알려 주면 언제나 */
function free(): boolean {
  return host?.guardFree?.() ?? true;
}

/**
 * 저장소가 움직였다 — 20 을 **지금** 넘었나. 경비가 이 방에 있으면 다음 tick 에 묻도록 걸어 두고, 없으면 버린다.
 * 값은 여기서만 견준다: tick 이 안 도는 방에서도 어긋나지 않는다
 */
function onSuspicionChange(): void {
  const v = suspicion.get().value;
  const crossed = lastValue < OPENER.at && v >= OPENER.at;
  lastValue = v;
  if (!crossed || passed20 || !host) return;
  if (host.guard() && execution.get().phase === "none" && free())
    armed20 = true;
}

function dist(a: Readonly<Vec2>, b: Readonly<Vec2>): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
function rnd(): number {
  return host?.random?.() ?? Math.random();
}
/**
 * 대본 상수가 문장 하나든 · 배열이든 · 이름 붙은 객체든 문장 목록으로 — script.ts(W1)의 꼴에 이 파일이 안 흔들리게.
 * 문장을 여기서 만들지는 않는다: 있는 것을 고를 뿐이다
 */
function listOf(v: unknown): readonly string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v))
    return v.filter((x): x is string => typeof x === "string");
  if (v && typeof v === "object")
    return Object.values(v as Record<string, unknown>).flatMap((x) =>
      listOf(x),
    );
  return [];
}
function reasonLines(key: ReasonKey): readonly string[] {
  return listOf((OPENERS as unknown as Readonly<Record<string, unknown>>)[key]);
}
function pickOne(lines: readonly string[]): string | null {
  if (lines.length === 0) return null;
  return lines[Math.min(lines.length - 1, Math.floor(rnd() * lines.length))];
}

/** 문서의 이유로 옮긴다(D10). 직전 5 초 안의 발화 · 3 초 넘은 벽화 응시가 저장소 사유보다 앞선다 */
function reasonNow(now: number): ReasonKey {
  const say = host?.lastSayAt?.();
  if (say !== undefined && now - say <= OPENER.sayWindowMs) return "발화";
  if ((host?.muralGazeMs?.() ?? 0) >= OPENER.gazeMs) return "그림";
  const r = suspicion.get().last?.reason;
  if (r === "돌발" || r === "뒷걸음" || r === "감정" || r === "말투") return r;
  return "침착";
}

/**
 * 경비가 다가와 묻는다. 줄이 없으면(표에 그 이유가 없다) 안 묻는다 — 지어내지 않는다.
 * 경비가 이 방에 없거나 검문에 묶여 있으면 false 이고 **아무것도 안 쓴다** — 판당 한 번 표는 부르는 쪽이 true 를 받은 뒤에 찍는다.
 * 'block' 은 집행자의 물음이라 명부의 경비를 안 본다: 집행이 한 번 더 물은 상태(execution.asked)가 곧 「묻는 이가 앞에 있다」다
 */
function ask(kind: OpenerKind, now: number, startAt = 0): boolean {
  if (!host || pending) return false;
  let lineMs = 0;
  if (kind === "block") {
    if (!execution.get().asked) return false;
    // 여덟 걸음 — 집행자가 이미 앞에 있다. 한 번 더 묻는 줄은 문서에 없어 「잠깐. 번호.」(D18)
    const line = reasonLines("침착")[0] ?? reasonLines("보고")[0];
    if (!line) return false;
    lineMs = host.speak("guard21", [line], startAt);
  } else {
    if (!host.guard() || !free()) return false;
    host.approach?.("guard21", host.me(), {
      stopAt: OPENER.standM,
      then: "resume",
    });
    if (kind === "watch") lineMs = host.play(WATCH_LINES, startAt);
    else {
      const key = reasonNow(now);
      const line = pickOne(reasonLines(key)) ?? reasonLines("침착")[0] ?? null;
      if (!line) return false;
      lineMs = host.speak("guard21", [line], startAt);
    }
  }
  pending = kind;
  staredFor = null;
  // 답의 창은 줄이 **끝난** 뒤부터 — 「어이. 잠깐만.」을 아직 읽는 중에 시계가 돌면 안 된다
  askedAt = now + startAt + lineMs;
  return true;
}

/** 저장소에 귀를 댄다 — 한 번만. 값의 기준점은 지금 값이다(이미 20 위에서 묶이면 「넘는 순간」이 아니다) */
function listen(): void {
  if (unsub) return;
  lastValue = suspicion.get().value;
  unsub = suspicion.subscribe(onSuspicionChange);
}

export const openers = {
  bind(h: OpenersHost): void {
    host = h;
    listen();
  },

  /**
   * 한 프레임. 20 통과 · 잡담 · 무응답 · 스캔을 여기서 본다. **경비가 없는 방에서도 매 프레임 부른다** — 무응답의 시계와 스캔은
   * 방을 따라다녀야 한다. 경비의 유무는 ask 가 본다.
   * `h` 를 주면 그걸로 갈아 끼운다 — 계약 tick(now, host). 집행자가 서 있는 방(execution 이 none 이 아님)에서는 경비가 안 온다: 전부 멎어 있다
   */
  tick(now: number, h?: OpenersHost): void {
    if (h) host = h;
    if (!host) return;
    listen();

    // 20 을 넘는 순간 — 저장소가 알린 것을 여기서 이 시각으로 묻는다. 판당 한 번, 표는 물음이 걸린 뒤에
    if (armed20) {
      armed20 = false;
      if (
        !passed20 &&
        !pending &&
        execution.get().phase === "none" &&
        ask("opener", now)
      ) {
        passed20 = true;
        chatAt = now + OPENER.chatMs;
        host.once("openers:20");
      }
    }

    // 잡담 — 20 을 지난 판에서만. 75 초마다 한 번 굴리고, 경비가 3 m 안을 지날 때 40 %. 검문에 묶인 경비는 안 하고, 조작권 · 뜸(chatOk)을 본다
    if (passed20 && !pending && now >= chatAt && free() && (host.chatOk?.() ?? true)) {
      const g = host.guard();
      if (g && dist(g, host.me()) <= OPENER.chatM) {
        chatAt = now + OPENER.chatMs;
        const line = pickOne(listOf(OPENER_CHAT));
        if (line && rnd() < OPENER.chatChance) host.speak("guard21", [line]);
      }
    }

    // 경비가 앞에 와 섰다 — 창이 닫힐 때까지 나를 본다. 걷는 중에 걸면 stare 가 걸음을 멈추므로 선 뒤에만, 물음마다 한 번
    if (pending && pending !== "block" && staredFor !== pending) {
      const g = host.guard();
      if (g?.still) {
        staredFor = pending;
        host.stare?.("guard21", Math.max(0, askedAt + OPENER.silentMs - now));
      }
    }

    // 무응답 — 18 초, 줄이 끝난 뒤부터. 여덟 걸음의 물음이면 집행은 그대로 걸어온다(값은 이미 100 이라 +8 은 아무것도 아니다)
    if (pending && now >= askedAt + OPENER.silentMs) {
      const k = pending;
      pending = null;
      const line = listOf(OPENER_SILENT)[0];
      if (line) host.speak("guard21", [line]);
      suspicion.bump(OPENER.silent, "말투");
      if (k !== "block") host.release?.("guard21");
    }

    // 스캔 — 가만히. 0.45 m 넘게 움직이면 실패, 3.8 초를 채우면 그냥 끝난다. 막대는 초가 바뀔 때만 다시 그린다
    if (scan) {
      const need = OPENER.scanMs / 1000;
      if (dist(host.me(), scan.origin) > OPENER.scanMoveM) {
        scan = null;
        scanShown = -1;
        host.stillness?.(null, need);
        suspicion.bump(OPENER.scanFail, "돌발");
        host.release?.("guard21");
      } else if (now - scan.from >= OPENER.scanMs) {
        scan = null;
        scanShown = -1;
        host.stillness?.(null, need);
        host.release?.("guard21");
      } else {
        const got = (now - scan.from) / 1000;
        if (Math.floor(got) !== scanShown) {
          scanShown = Math.floor(got);
          host.stillness?.(got, need);
        }
      }
    }
  },

  /** 물음이 걸려 있나 — say() 가 이걸 보고 answer 로 돌린다 */
  pending(): boolean {
    return pending !== null;
  },
  kind(): OpenerKind | null {
    return pending;
  },
  escort(): boolean {
    return escort;
  },

  /**
   * 내가 답했다. 원장에 원문 한 줄(guard21, ±0 — units.remember: note 는 0 을 버린다). 여덟 걸음의 물음이면 판정 없이
   * execution.answered() — 답했다는 사실이 값이다. 그 밖에는 D9: 보고 톤 → 「그래. 알겠어.」 −16 · 오르는 톤 → 「같이 가자.」 · 그 외 「됐어. 가.」
   */
  answer(text: string, _now = performance.now()): void {
    if (!host || !pending) return;
    const k = pending;
    pending = null;
    units.remember("guard21", text, host.where());
    if (k === "block") {
      execution.answered();
      return;
    }
    const j = judgeLine(text);
    const escortLines = listOf(OPENER_ESCORT);
    if ((j && (j[1] === "보고" || j[1] === "침착")) || /이상\s*없/.test(text)) {
      const line = listOf(OPENER_ACCEPT)[0];
      if (line) host.speak("guard21", [line]);
      suspicion.bump(OPENER.accept, "보고");
    } else if (j && j[0] > 0) {
      const line = escortLines[0];
      if (line) host.speak("guard21", [line]);
      escort = true;
    } else {
      const line = escortLines[1] ?? escortLines[0];
      if (line) host.speak("guard21", [line]);
    }
    host.release?.("guard21");
  },

  /**
   * 40 — WATCH. 판당 딱 한 번 — 표는 **물음이 걸린 뒤에** 찍는다: 경비 없는 방(휴게)에서 넘은 40 은 그 판의 WATCH 를 안 태운다.
   * 40 방송(system 줄)은 scenario2 가 먼저 찍는다(D27); 여기서는 과학자 · UNIT-21 두 줄과 물음
   */
  watch(now = performance.now(), startAt = 0): boolean {
    if (!host || watched) return false;
    if (!ask("watch", now, startAt)) return false;
    watched = true;
    host.once("openers:watch");
    return true;
  },

  /** 여덟 걸음 4–5 — 집행자가 한 번 더 묻는다. scenario2 가 COVER 넉 줄 뒤에 부른다(startAt 이 그 길이) */
  ask(kind: OpenerKind, now = performance.now(), startAt = 0): boolean {
    return ask(kind, now, startAt);
  },

  /**
   * 60 — 스캔. 경비가 2 m 앞에 서고, 지금 자리에서 3.8 초. 경비가 이 방에 없거나 검문에 묶여 있으면 false — 아무것도 안 건다:
   * 휴게에서 걸린 스캔은 휴게의 30 초 막대를 덮고, 다음 방 첫 프레임에 지난 방의 자리로 +16 을 터뜨린다
   */
  scan(now = performance.now()): boolean {
    if (!host || scan || !host.guard() || !free()) return false;
    host.approach?.("guard21", host.me(), {
      stopAt: OPENER.scanM,
      then: "resume",
    });
    scan = { origin: { ...host.me() }, from: now };
    scanShown = 0;
    host.stillness?.(0, OPENER.scanMs / 1000);
    return true;
  },
  scanning(): boolean {
    return scan !== null;
  },

  /**
   * 방을 나간다 — 걸린 물음 · 스캔을 **아무것도 틀지 않고** 내린다. 무응답 +8 도 없다: 답할 상대가 방에 남았지 내가 도망친 게 아니다.
   * 경비는 순찰로 돌려보내고 막대는 내린다. 판당 한 번 표(20 · WATCH)와 escort 는 판의 것이라 남는다. enterRoom 이 부른다
   */
  leaveRoom(): void {
    pending = null;
    askedAt = 0;
    staredFor = null;
    armed20 = false;
    scan = null;
    scanShown = -1;
    if (!host) return;
    host.release?.("guard21");
    host.stillness?.(null, OPENER.scanMs / 1000);
  },

  reset(): void {
    unsub?.();
    unsub = null;
    host = null;
    pending = null;
    askedAt = 0;
    staredFor = null;
    escort = false;
    lastValue = 0;
    armed20 = false;
    passed20 = false;
    watched = false;
    chatAt = 0;
    scan = null;
    scanShown = -1;
  },
};

/**
 * 기록 복도 — **벽이 끝이 없다.** 대본 v8 · 챕터 6 (ARCHIVE_ENTER → ARCHIVE_SIXTEEN → THE_OTHER_HAND) 와 A-155 의 메모 두 곳.
 *
 * 이 방엔 검문도 집행도 없다(EXEC_ROOM null · 목격 반경 0). 있는 것은 **보는 것**뿐이라 판정을 전부 응시로 통일했다(D17):
 * 열여섯 · 메모 두 곳은 ArchiveWall 의 Gaze 대상이고(W5), 여기는 그 신호(saw)를 받아 줄과 어휘로 바꾼다.
 * THE_OTHER_HAND 만 자리다 — A-137 곁(2.6 m, 서 있을 때) 첫 진입. 그 개체가 **제 그림 앞을 떠나 내 앞까지 걸어와서** 말한다(address ⑦):
 * 내가 곁에 선 것이지 말을 건 것은 아니라 이 줄도 「저쪽이 먼저 거는 말」이다. 나 「그럼 누가.」는 대본 줄이라 저절로 나간다.
 * 「너 몇 번째 벽 봤어?」는 4 초 창을 연다 — 답은 받기만 한다(판정도 값도 없다: 그 물음의 뜻은 주제를 하나 열어 주는 것이다).
 *
 * ★ 메모는 글자만이다 — 대사 줄도 소리도 없다(문서 「화면」). 첫 메모가 쉼 주제를 열고, 둘째가 「번호랑 구역만 묻는다」 힌트를 켠다(D7).
 * ★ 「너 몇 번째 벽 봤어?」는 태도 1 이상일 때만 — 그리고 안 본 주제를 하나 연다(lexicon.open(kind,'told')). 다 봤으면 그 줄은 없다.
 */

import type { AddressOpts } from "./address";
import { TALK_DIST_M } from "./corefield";
import { lexicon, MURALS } from "./lexicon";
import {
  ARCHIVE_ENTER,
  ARCHIVE_SIXTEEN,
  type CastLine,
  type Line,
  OBJ_ARCHIVE,
  OTHER_HAND,
  OTHER_HAND_MORE,
} from "./script";
import { units } from "./units";

/** 진입 속마음이 오는 시각 — 벽이 눈에 들어올 만큼 걸은 뒤 */
export const ENTER_MS = 3400;

export type ArchiveSight = "sixteen" | "memoRest" | "memoAsk";

export interface ArchiveHost {
  once(key: string): boolean;
  play(lines: readonly Line[], startAt?: number): number;
  /** 반경 안에서 가장 가까운 **서 있는** 개체 — scenario2 의 near 와 같은 자 */
  nearest(r: number): string | null;
  objective(text: string | null): void;
  /** 개체가 나를 보고 말한다 (address.ts). 없으면 play 로 그 자리에서 */
  address?(id: string, lines: readonly CastLine[], opts?: Partial<AddressOpts>): void;
}

/** 「너 몇 번째 벽 봤어?」에 답을 기다리는 창(ms) — 답은 받기만 한다 */
export const OTHER_HAND_ANSWER_MS = 4000;

let host: ArchiveHost | null = null;
let otherHand = false;
/**
 * 걸음이 거둬져 한 줄도 못 나간 횟수 — 이 방의 개체는 A-137 하나뿐이라, 그것이 못 오면 이 장면이 통째로 없어진다.
 * 그래서 한 번은 다시 부른다(복도의 FIRST_LOOK 과 같은 셈). 두 번째도 못 오면 조용한 방으로 남는다 — 벽 건너에서 외치게 하지는 않는다
 */
let otherHandTries = 0;

/** A-137 이 끝내 못 왔다 — 한 줄도 안 나갔으니 표를 되돌린다. 다음에 다시 그 곁에 서면 한 번 더 부른다 */
function retryOtherHand(): void {
  otherHandTries += 1;
  if (otherHandTries <= 1) otherHand = false;
}

export const archiveScene = {
  /** 기록 복도에 들어왔다 — 목표 「통로를 지나라」, 3.4 초 뒤 속마음 두 줄 */
  enter(h: ArchiveHost): void {
    host = h;
    otherHand = false;
    otherHandTries = 0;
    h.objective(OBJ_ARCHIVE);
    h.play(ARCHIVE_ENTER, ENTER_MS);
  },

  /** 한 프레임 — A-137 곁 첫 진입만 본다. 나머지는 응시(saw)가 온다 */
  tick(_now: number): void {
    if (!host || otherHand) return;
    if (host.nearest(TALK_DIST_M) !== "u137") return;
    otherHand = true;
    const more = units.stage("u137") >= 1 ? MURALS.find((m) => !lexicon.has(m.kind))?.kind : undefined;
    if (host.address) {
      /*
       * 내가 곁에 선 것이지 말을 건 것은 아니다 — 그러니 이 줄도 **저쪽이 먼저 거는 말**이고, A-137 이 제 그림 앞을 떠나
       * 내 앞까지 와서 나를 보고서야 나간다 (address ⑦). 이 방엔 개체가 이것 하나뿐이라, 못 오면 이 방은 조용한 방으로 남는다.
       * 물음(OTHER_HAND_MORE)은 **같은 걸음 위에** 이어 붙는다(continues) — 왔다가 다시 오는 그림이 되면 안 된다.
       * 4 초 창의 답은 받기만 한다 (onAnswer 가 비어 있다 = 판정 없음). 주제가 열리는 것도 그 물음이 실제로 나갔을 때만이다
       */
      host.address("u137", OTHER_HAND, { scene: "OTHER_HAND", onDropped: retryOtherHand });
      if (more) {
        host.address("u137", OTHER_HAND_MORE, {
          scene: "OTHER_HAND_MORE",
          continues: true,
          answerMs: OTHER_HAND_ANSWER_MS,
          onAnswer: () => {},
          onSpoken: () => lexicon.open(more, "told"),
        });
      }
    } else {
      const t = host.play(OTHER_HAND);
      if (more) {
        host.play(OTHER_HAND_MORE, t);
        lexicon.open(more, "told");
      }
    }
  },

  /** 응시가 끝났다 — ArchiveWall 의 Gaze 가 scenario2.sawArchive 를 거쳐 부른다 */
  saw(what: ArchiveSight): void {
    if (!host) return;
    if (what === "sixteen") {
      // 「복도에서는 열다섯이었는데.」는 memorial 을 아는 판에서만 — 안 그러면 본 적 없는 수를 회상한다
      if (host.once("archive:sixteen")) host.play(lexicon.has("memorial") ? ARCHIVE_SIXTEEN : ARCHIVE_SIXTEEN.slice(0, 1));
    } else if (what === "memoRest") {
      lexicon.open("resting", "memo");
    } else {
      lexicon.markAskRule();
    }
  },

  otherHandDone(): boolean {
    return otherHand;
  },

  reset(): void {
    host = null;
    otherHand = false;
    otherHandTries = 0;
  },
};

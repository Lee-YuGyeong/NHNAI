/**
 * 「인간인 척」 판의 프로토콜 — PLANNING.md 의 게임(사람 여러 명 + AI 1 좌석 + AI 설계자 1~2)이
 * 클라이언트(features/interrogation)와 워커(worker/src/game)가 나눠 보는 **유일한 계약**이다.
 *
 * 물리 테스트(정지선 · 낙하 생존 · 색 사냥)의 이벤트는 여기 없다 — 그쪽은 `protocol.ts` 의 `trial_*`
 * 그대로다. 이 파일은 그 위에 얹히는 판의 흐름(국면 · 배역 · 의심도 · 격리 · 승패 · 관리 AI)만 적는다.
 *
 * 규칙은 protocol.ts 와 같다:
 *  1. 양쪽 핸들러를 같은 커밋에서 고친다. 2. 모르는 타입은 무시한다. 3. 위조되면 곤란한 값은 C2S 에 넣지 않는다 —
 *  누가 보내는지 · 몇 시인지 · 어느 배역인지는 전부 서버가 소켓으로 안다.
 *
 * ★ 판별 원칙(PLANNING §1.4)이 이 파일의 모양을 정한다:
 *   - 좌석 목록(GameSeat)에는 「사람인가 AI 인가」가 **없다.** 실제 사람 · 대역(NPC) · AI 좌석이 와이어에서
 *     같은 모양이다. 정체는 격리된 뒤(game_isolated)와 판이 끝난 뒤(game_ended)에만 실린다.
 *   - 배역(game_role)은 **그 소켓 하나에만** 간다. AI 설계자에게만 AI 의 좌석이 딸려 온다 (§1.1).
 *   - 물리 조건값은 어디에도 없다 (P8). 색 사냥의 이벤트(줍기 · 조명 전환)도 `protocol.ts` 의
 *     `trial_*` 다 — 내려가는 것은 서버가 곱셈을 끝낸 **겉보기 색**뿐이다.
 */

import type { BodyId, TrialGame, TrialResultWire } from './protocol';

/** 배역 — 사람(일반) · AI 설계자 · AI. 설계자는 실제 플레이어 중에서 뽑히고, AI 는 따로 합류하는 좌석이다 (§1.1) */
export type GameRole = 'human' | 'designer' | 'ai';

/**
 * 판의 국면.
 *   lobby       사람이 모이는 중 — 방장이 시작 조건을 채우면 연다
 *   briefing    배역 통보 (역할 카드가 떠 있는 몇 초)
 *   discussion  자유 토론 · 실시간 지목 — 다음 테스트가 열릴 때까지
 *   test        물리 테스트 진행 중 (전원 동시 참여)
 *   result      전체 화면 결과 모달 — 전원 입력이 잠긴다 (§3)
 *   ended       승패가 났다
 */
export type GamePhase = 'lobby' | 'briefing' | 'discussion' | 'test' | 'result' | 'ended';

/** 좌석 하나의 **공개** 모습. 정체는 없다 — 격리된 뒤에만 revealed 가 채워진다 */
export interface GameSeat {
  id: string;
  /** 사람은 닉네임, 나머지 좌석은 판이 지어 준 번호표 */
  name: string;
  /** 판이 열릴 때 다시 섞인 자리 (1..N). 입장 순서·원래 좌석과 무관하다 (§1.1) */
  seat: number;
  isolated: boolean;
  /** 격리된 뒤 공개된 정체. 살아 있으면 없다 */
  revealed?: GameRole;
  /** 이 좌석의 몸 (mp/bodies.ts) — 사람은 입장 때 받은 몸 그대로, 대역·AI 는 판이 열릴 때 남은 몸에서 뽑는다 */
  body?: BodyId;
}

/** 판이 끝난 이유와 결과 (§1.3) */
export interface GameOutcome {
  winner: 'humans' | 'ai';
  /** 왜 끝났나 — 화면 한 줄 */
  reason: string;
  aiId: string;
  /** 살아남은 설계자(개인 승리) · 잡힌 설계자 */
  designersWon: string[];
  designersLost: string[];
}

/** 지금 도는 테스트 — 조건값은 없다 (P8). durationMs 는 시간제 테스트(낙하 생존 · 색 사냥)만 */
export interface GameTestInfo {
  game: TrialGame;
  /** 이 테스트 종류가 몇 번째로 열리는가 (1 = 기준 조건, §2) */
  round: number;
  startAt: number;
  durationMs?: number;
  /** 화면 위 한 줄 지시문 */
  instruction: string;
}

/** 판 전체의 공개 상태 — 입장·국면 전환마다 통째로 온다. 화면은 이걸 그대로 그린다 */
export interface GameStateWire {
  phase: GamePhase;
  seats: GameSeat[];
  /** 좌석 id → 의심도 0~100 */
  suspicion: Record<string, number>;
  /** 지목한 사람 → 지목당한 사람. 실시간 공개 (§1.2) */
  accusations: Record<string, string>;
  /** 지금 국면이 끝나는 서버 시각 — 남은 시간 표시용. 없는 국면도 있다 */
  phaseEndsAt: number | null;
  /** 지금까지 열린 테스트 수 */
  testsDone: number;
  currentTest: GameTestInfo | null;
  /** 마지막 결과 — 모달과 HUD 요약 패널이 그린다 (§3). 설계자가 조작했으면 조작본이다 (P7) */
  latestResult: TrialResultWire | null;
  /** 격리 목표 수 = 총원 절반(내림). 여기 닿으면 끝 (§1.3) */
  quota: number;
  hostId: string | null;
  /** 시작에 필요한 실제 사람 수 — 모자란 만큼은 대역이 채울 수 있다 (§9 폴백) */
  minHumans: number;
  /** 방에 붙어 있는 실제 사람 수 (lobby 에서 시작 조건 표시용) */
  humansOnline: number;
  outcome: GameOutcome | null;
  /** 판이 열린 서버 시각 — 하드캡 표시용 */
  startedAt: number | null;
  /**
   * **검문소 프롤로그를 틀 자리인가** (features/interrogation/prologue.ts).
   *
   * 대본은 화면에서만 나지만 **틀지 말지는 서버가 정한다.** 여태 화면이 혼자
   * 「첫 토론이고 시험이 없으면 튼다」로 정했는데, 그러면 서버가 판을 붙잡고 있는 중인지
   * 이미 걷고 40초를 세는 중인지를 화면이 모른다. 그 둘이 어긋나는 자리에서 방송이 대화와
   * 겹쳤다 (2026-09-05 사용자: 「지금 프롤로그를 껴서 겹치거든」):
   *
   *   · 방송이 끝난 뒤 새로고침하면 화면은 대본을 처음부터 다시 트는데 서버의 40초는 이미 돌고 있다.
   *   · 워커가 되살린 판(restoreIfNeeded)은 붙잡기 없이 열리는데 화면은 그것도 첫 토론으로 본다.
   *
   * 그래서 「지금 붙잡고 있다」(runtime 의 prologueHold)를 그대로 내려보낸다. 참인 동안만 틀고,
   * 다 튼 화면이 game_prologue_done 을 올리면 서버가 걷으면서 이 값이 거짓이 된다.
   */
  prologue: boolean;
  /**
   * 좌석 id → 남은 **발언권**. 한 마디에 하나씩 줄고, 시험이 끝날 때마다 기록만큼 는다 (TALK · talkFor).
   * 공개다 — 남은 수는 곧 시험 기록이고, 기록은 어차피 전원이 본다 (§3).
   */
  talk: Record<string, number>;
}

/** 관리 AI 방송의 결 — 화면 배너·TTS 가 같은 값을 본다 (shared/broadcast-kind 의 부분집합) */
export type LeaderKind = 'announce' | 'readout' | 'alarm';

/** 주장 판정 결과 (§1.2 · §4.2). match −10 · mismatch +10 · unclear 0 */
export type ClaimVerdict = 'match' | 'mismatch' | 'unclear';

/** 클라이언트 → 서버 */
export type GameC2SMessage =
  /** 방장이 판을 연다. fillTo 는 실제 사람이 모자랄 때 대역으로 채울 총 인원(3~8) — 서버가 잘라 쓴다 */
  | { t: 'game_start'; fillTo?: number }
  /** 상태 전체를 다시 달라 (재접속 · 화면 복구) */
  | { t: 'game_sync' }
  /** 실시간 지목 — 같은 사람을 다시 지목하면 무시, 다른 사람으로 바꾸면 앞의 것은 철회된다 */
  | { t: 'game_accuse'; target: string }
  /** 내 지목을 거둔다 (−건 만큼) */
  | { t: 'game_withdraw' }
  /** 기록에 대한 해명·주장 — 관리 AI 가 공개된 기록과 대조해 판정한다 (P5 · P6) */
  | { t: 'game_claim'; text: string }
  /**
   * 화면의 검문소 프롤로그 방송이 끝났다 (features/interrogation/prologue.ts).
   *
   * 대본은 **화면에서만** 나지만 그 길이는 서버가 알 수 없다 — 줄마다 그 자리에서 합성한 목소리에
   * 자막을 맞추므로(prologueVoice) 판마다·기기마다 다르다. 그래서 「끝났다」만 올린다: 그때까지
   * 대역과 AI 참가자는 입을 다물고, 첫 토론의 40초도 그때부터 센다 (runtime 의 prologueHold).
   */
  | { t: 'game_prologue_done' }
  /** AI 설계자의 기록 조작 — 판당 1회 · 대상 1명 (P7). 다음 결과의 공개본이 바뀐다 */
  | { t: 'game_tamper'; target: string; direction: 'suspicious' | 'normal' };

/** 서버 → 클라이언트 */
export type GameS2CMessage =
  | { t: 'game_state'; state: GameStateWire }
  /**
   * 내 배역 — **이 소켓에만** 온다. 설계자에게만 aiId 가 실린다 (§1.1 "브리핑에서 AI 의 좌석도 함께 통보").
   * seatId 는 내 좌석 — 판이 도는 동안 채팅 · 이동은 전부 좌석 id 로 오간다 (플레이어 id 는 와이어에서 사라진다).
   * tamperLeft 는 남은 조작 횟수 (설계자만 1, 나머지 0).
   */
  | { t: 'game_role'; seatId: string; role: GameRole; aiId?: string; tamperLeft: number }
  /** 의심도가 움직였다. delta 는 방금의 한 걸음 — 로그 한 줄로 그린다 */
  | {
      t: 'game_suspicion';
      suspicion: Record<string, number>;
      accusations: Record<string, string>;
      delta?: { target: string; amount: number; by: string; why: string };
    }
  /** 100% — 그 자리에서 격리, 정체 공개 (§1.2) */
  | { t: 'game_isolated'; id: string; role: GameRole; text: string }
  /** 관리 AI 의 말 — 화면 배너와 TTS 로 나간다 */
  | { t: 'game_leader'; text: string; kind: LeaderKind; ts: number }
  /** 주장 판정이 났다 — 전원 공개 */
  | { t: 'game_verdict'; by: string; verdict: ClaimVerdict; text: string; delta: number }
  /** 설계자의 조작이 접수됐다 — 그 소켓에만 */
  | { t: 'game_tamper_ok'; left: number }
  /** 판이 끝났다 — 정체표 전부 공개 */
  | { t: 'game_ended'; outcome: GameOutcome; roles: Record<string, GameRole> }
  /**
   * 발언권이 움직였다 — 한 마디에 하나 줄었거나(gained 없음), 시험이 끝나 기록만큼 늘었다(gained · game).
   * talk 는 전원의 지금 값이다 (game_state 의 talk 와 같은 것) — 화면은 이걸 그대로 덮어쓴다.
   */
  | { t: 'game_talk'; talk: Record<string, number>; gained?: Record<string, number>; game?: TrialGame }
  /** 거절 사유 한 줄 — 그 소켓에만 (시작 조건 미달 · 권한 없음 · 국면 불일치) */
  | { t: 'game_reject'; why: string };

export function isGameMessage(msg: { t: string }): msg is GameC2SMessage {
  return msg.t.startsWith('game_');
}

/* ───────────────────────────── 판의 상수 — 양쪽이 같이 본다 ───────────────────────────── */

/** 실제 플레이어(사람) 인원 범위 (§1.1) */
export const GAME_MIN_HUMANS = 3;
export const GAME_MAX_HUMANS = 8;

/**
 * 검문소 한 판의 **차례표** (2026-09-05 사용자):
 *
 *   입장 → 대화 40초 → ① 낙하 생존 30초 → 대화 40초 → ② 발판 30초 → 대화 40초 → ③ 원판 30초 → 대화 40초 → 끝
 *
 * 종류도 순서도 고정이다 — 예전엔 관리 AI 가 매번 골랐지만(agents.designNext), 그러면 한 판에 무엇을
 * 몇 번 하는지가 판마다 달라져 「세 번의 시험」이라는 판의 모양이 안 선다. 순서를 바꾸려면 여기 한 줄이다.
 */
export const GAME_TEST_ORDER: readonly TrialGame[] = ['fall', 'platform', 'disc'];

/** 배역 통보 화면이 떠 있는 시간(ms) — RoleBriefing 의 SHOW_MS 와 같은 박자 */
export const GAME_BRIEFING_MS = 7_000;
/** 첫 토론 — 프롤로그 방송이 걷힌 뒤 첫 테스트까지 (GAME_PROLOGUE_MAX_MS) */
export const GAME_FIRST_DISCUSSION_MS = 40_000;
/**
 * 프롤로그 방송을 기다려 주는 상한(ms) — 화면이 「끝났다」(game_prologue_done)를 안 보내도 여기서 걷는다.
 *
 * 대본 열세 줄은 목소리에 맞춰 흐르므로 45~55초쯤 걸리지만, 소리가 안 뜨거나 화면이 멎으면 그 말이
 * 영영 안 온다. 판이 사람 하나 때문에 멎지 않게 두는 천장이다 (runtime 머리말의 「폴백」과 같은 규칙).
 */
export const GAME_PROLOGUE_MAX_MS = 75_000;
/** 테스트 사이 · 마지막 테스트 뒤의 토론 길이(ms). 첫 토론과 같은 40초다 — 차례표가 일정한 박자로 돈다 */
export const GAME_DISCUSSION_MS = 40_000;
/** 결과 모달 — 항상 고정, 스킵 불가 (§1.2 5~8초) */
export const GAME_RESULT_MODAL_MS = 7_000;
/**
 * 시험 하나의 길이(ms) — 엔진이 제 몸에 적어 둔 길이(/trial 의 1분)를 **판이 덮어쓴다.**
 * 검문소의 시험은 기록을 재는 자리지 완주하는 자리가 아니라서, 세 종류가 같은 30초여야 서로 견줄 수 있다.
 */
export const GAME_TEST_MS = 30_000;
/** 정지선처럼 이벤트제인 테스트가 안 닫힐 때의 상한(ms) (§1.2 테스트 진행 30~45초) */
export const GAME_TEST_MAX_MS = 45_000;
/** 하드캡 — 이만큼 지나면 그 자리에서 끝낸다 (§0 "하드캡 제안 10분") */
export const GAME_HARD_CAP_MS = 10 * 60_000;
/**
 * 판정 종료 화면이 떠 있는 시간(ms) — 지나면 서버가 로비로 되돌려 같은 방에서 새 판을 열 수 있다.
 * 서버(runtime.ts 의 로비 복귀 타이머)와 끝 화면의 시계(EndScreen)가 같은 값을 본다 — 두 벌로 두면 시계가 거짓말한다.
 */
export const GAME_ENDED_MS = 30_000;

/**
 * 의심도 걸음.
 *
 * 값은 **판 길이에 맞춰 잡혀 있다** (2026-09-05 사용자: "의심도 올라가는거 개선할부분 있을까?").
 * 처음의 제안값(§1.2: 지목 8 · 동조 5 · 몰이 2/6 · 읽기 ±12/−8)은 이 차례표에 비해 너무 작았다 — 토론은
 * 40초 × 4 = **160초**뿐인데(GAME_*_DISCUSSION_MS), 그 안에 100 을 채울 길이 없었다:
 *
 *   · 말 읽기는 READ_EVERY_MS 마다 한 장면, 한 장면에 **둘까지**(agents.readTalk) → 판 전체에 여덟 장면 남짓.
 *     한 사람에게 전부 몰아줘도 8 × 12 = 96 으로 **이론적 최대치가 격리선에 못 미쳤다.**
 *   · 지목은 봇 발화 수에 매여 있는데 그 발화가 방 전체에서 직렬로 돌았다 (runtime 의 BOT_TALK_CONCURRENCY 머리말).
 *
 * 그래서 대개 아무도 격리되지 않고 차례표가 끝나 「시간이 다 됐다」 — AI 자동 승리로 닫혔다.
 * 지금 값은 **한 판에 1~2명이 격리되는 속도**를 겨눈다: 몰이가 한 사람에 붙으면 두세 번째 토론에서 100 에 닿고,
 * 아무도 안 몰리면 말 읽기만으로는 못 닿는다 — 격리는 방이 합의해야 일어나는 일로 남는다.
 *
 * ★ 2026-09-05 한 번 더 올렸다 (사용자: "의심도 좀 더 빨리 차게 해줘"). 압력(SUSPICION_PRESSURE)은 후반만
 *   건드리는 다이얼이라 **전반이 그대로 느렸다** — 1차 토론은 여전히 ×1.0 이라 셋이 한 사람을 몰아도
 *   40초에 34 였다 (docs/SUSPICION.md §7 의 표).
 *   그래서 이번엔 **올라가는 걸음 표 자체**를 한 칸씩 키운다 (지목 12→15 · 동조 8→10 · 몰이 3→4/12→16 ·
 *   읽기 최대 16→20 · 되풀이 말 6→8 · 회피 8→10 · 누계 4→5, 되풀이 겨눔은 suspicion.REPEAT_STEP 3→5).
 *   **내려가는 걸음은 한 자도 안 건드렸다** (해명 −12 · 읽기 −10 · 철회) — 압력과 같은 규칙이다:
 *   빨리 쌓이게 하는 것이지 해명을 무겁게 하는 것이 아니다. 몸(굳음·뒷걸음 5 · bodyCap 30)도 그대로다.
 *   몸을 같이 키우면 자판에서 손을 뗀 사람이 먼저 격리된다 — 그건 판이 빨라진 게 아니라 판이 망가진 것이다.
 *
 * 여기 값은 **전반(1·2차 토론)의 크기**다. 후반에는 SUSPICION_PRESSURE 가 이 값을 곱한다 — 그쪽 머리말을 같이 볼 것.
 *
 * ★ 전체 규칙은 **docs/SUSPICION.md** 에 있다. 이 상수는 그 문서의 「걸음 표」고,
 *   판정의 조건(문턱 · 간격 · 거리)은 worker/src/game/tells.ts 에 있다.
 */
export const SUSPICION = {
  accuse: 15,
  agree: 10,
  mobPer: 4,
  mobCap: 16,
  claimMatch: -12,
  claimMismatch: 18,
  /**
   * 관리 AI 가 말을 읽고 한 번에 올릴 수 있는 최대 · 내릴 수 있는 최대 (readMin 은 음수).
   *
   * **올리는 쪽만 키웠다** (16 → 20, 2026-09-05 사용자: "의심도 좀 더 빨리 차게 해줘"). 내리는 쪽은 −10 그대로다 —
   * 걸음을 양쪽으로 같이 키우면 판정기가 한 장면에 올리고 다음 장면에 도로 내려서 눈금이 제자리를 걷는다.
   * 이 숫자는 프롬프트에도 그대로 박힌다 (agents.readTalk 의 「확실할 때만 크게」) — 한 자리에서만 고친다.
   */
  readMax: 20,
  readMin: -10,
  cut: 100,

  /* ── 표식(tell) — 겨눔이 아니라 그 사람의 말·몸에 붙는 값이라 남의 철회로 안 걷힌다 (docs/SUSPICION.md 「두 개의 층」) ── */

  /** 같은 말 되풀이 — 자기 발화를 다시 친다 (tells.echoes) */
  echo: 8,
  /**
   * 불렀는데 대답 없이 넘긴다 — **2회째부터** 문다.
   * 침묵 자체는 벌하지 않는다: 말수는 성격이고, 그걸 벌하면 입 다무는 것이 최적 전략이 된다.
   * 근거가 되는 것은 「불렀는데 안 답한 것」뿐이다 (docs/SUSPICION.md ⑦).
   */
  duck: 10,
  /** 회피한 그때 이미 지목당해 있었으면 얹는다 — 몰린 채 답을 피하는 것은 다른 무게다 */
  duckAccused: 5,
  /** 몸 — 굳음 한 장면 · 뒷걸음 한 장면 */
  still: 5,
  backstep: 5,
  /**
   * 같은 좌석이 **같은 항목**에 거듭 걸릴 때마다 한 번에 더 무는 양 (누계 — 안 지워진다).
   * 한 번은 실수, 두 번은 우연, 세 번은 정체다.
   */
  repeatWeight: 5,
  /**
   * 몸이 한 좌석에 물릴 수 있는 **총량**. 굳음·뒷걸음을 합쳐 여기서 멈춘다.
   * 몸만으로는 절대 격리되지 않는다 — 자판에서 손을 떼고 돌아왔더니 폐기돼 있으면 그건 게임이 아니다.
   */
  bodyCap: 30,
  /**
   * **한 걸음의 절대 상한** — 압력(SUSPICION_PRESSURE)을 곱한 뒤에도 눈금이 한 번에 이만큼밖에 못 움직인다.
   *
   * 압력이 1.0 인 전반에는 아무것도 안 걸린다 (제일 큰 걸음이 읽기 20) — 이 상한은 후반의 것이다.
   * 후반에만 「판정기가 무슨 숫자를 불러도 판이 한 번에 뒤집히지 않는다」(read 머리말)를 지킨다:
   * 28 은 눈금의 4분의 1 남짓 — 걸음 표가 커진(2026-09-05) 만큼 같이 올렸다. 상한이 걸음보다 낮으면
   * 커진 값이 전부 여기서 깎여, 표만 고치고 판은 안 빨라진다.
   */
  stepCap: 28,
} as const;

/**
 * **국면 압력** — 후반으로 갈수록 올라가는 걸음이 무거워진다 (2026-09-05 사용자: "의심도 후반에 가면 더 빨리 쌓이게").
 *
 * 자리는 `testsDone`(지금까지 끝난 시험 수)이다. 토론 넷이 그대로 0·1·2·3 이 된다 —
 * 시험 국면에 오는 지목은 testsDone 이 아직 안 오른 시점이라 직전 토론과 같은 압력을 받는다(불연속이 없다).
 * **상태로 안 둔다**: persist 가 이미 testsDone 을 나르므로 되살린 판도 저절로 같은 자리에 선다.
 *
 * 왜 필요한가 — 후반이 느린 것은 걸음이 작아서가 아니라 **열려 있는 문이 하나뿐**이어서다.
 * 겨눔(pointing)은 토론이 바뀌어도 안 지워지므로 2차 토론부터는 지목도 동조도 다시 안 열리고,
 * 몰이 상한도 그 토론 안에 소진된다 — 남는 것은 되풀이(REPEAT_STEP) 뿐이다. 셋이 한 사람을 계속 몰아도
 * 34 → 49 → 58 → 67 로 기어가다 「시간이 다 됐다」로 닫혔다.
 *
 * **곱하는 것은 올라가는 걸음뿐이다.** 내려가는 걸음(철회 · 사람다운 말투 · 기록 뒷받침 · 주장 일치)은 그대로다 —
 * 압력은 「의심이 빨리 쌓인다」는 규칙이지 「해명이 무거워진다」가 아니다. 후반엔 변명이 덜 먹혀야 판이 닫힌다.
 * 철회는 특히 절대 안 곱한다: 판정이 아니라 **회계**라서 얹은 만큼이 아니면 눈금이 영구히 떠오른다.
 */
export const SUSPICION_PRESSURE: readonly number[] = [1, 1.2, 1.5, 2];

/** 그 압력의 이름 — 관리 AI 방송이 부르는 말 (LINES.pressure). 숫자만 바뀌면 사람은 그걸 버그로 읽는다 */
export const SUSPICION_STAGE: readonly string[] = ['관찰', '대조', '선별', '마감'];

/** 지금 국면의 압력 — 자리를 벗어나면 마지막 칸으로 (시험이 늘어도 사다리는 안 무너진다) */
export function pressureFor(testsDone: number): number {
  const at = Math.max(0, Math.min(SUSPICION_PRESSURE.length - 1, Math.floor(testsDone)));
  return SUSPICION_PRESSURE[at] ?? 1;
}

/**
 * 관리 AI 가 방의 말을 읽는 간격(ms)과, 한 번에 읽는 새 발언의 수.
 * 한 마디마다 부르면 값이 튀고 LLM 을 너무 자주 부른다 — 몇 마디 쌓아 **한 장면**으로 읽는다.
 *
 * 14초였을 때는 40초짜리 토론 하나에 두 장면밖에 안 들어갔다. 9초면 서너 장면이다 — 말 읽기가 이 판에서
 * 눈금의 주된 문(runtime.readRoom)인데 그 문이 판 길이보다 느리게 열리고 있었다.
 *
 * 7초로 한 번 더 당겼다 (2026-09-05 "의심도 좀 더 빨리 차게 해줘"). 걸음 표를 키우는 것만으로는 모자란다 —
 * 이 문은 **토론당 몇 번 열리느냐**가 곧 속도라서, 40초에 네 장면이면 아무리 걸음이 커도 한 사람이 받는
 * 판정이 판 전체에 여덟 번뿐이다. 7초면 토론당 대여섯 장면이다.
 * 더는 못 당긴다: 한 장면이 READ_MIN_LINES(2줄)로 서는데, 봇이 방 전체에서 6~7초에 한 줄을 친다
 * (runtime 의 BOT_TALK_*) — 간격이 그보다 짧아지면 문턱에 걸려 어차피 안 열리고 호출만 늘어난다.
 */
export const READ_EVERY_MS = 7_000;
export const READ_MIN_LINES = 2;
export const READ_MAX_LINES = 12;

/** 주장 한 줄의 길이 상한 — 서버가 자른다 */
export const CLAIM_MAX_LEN = 140;

/**
 * 발언권 (2026-09-05 사용자: "처음에 각자 대화 발언권 갯수가 주어지고, 미니게임에서 이겼을 때 게임마다 추가").
 *
 * 한 마디(채팅 · 주장)에 하나씩 쓴다. 지목(game_accuse)은 말이 아니라 공짜다. 대역과 AI 참가자도 **같은 지갑**을
 * 쓴다 — 사람만 세면 끝없이 떠드는 좌석이 곧 AI 다 (P10).
 *
 * 값은 차례표에 맞춰 잡았다. 토론은 40초 × 4 인데 사람이 40초에 실제로 치는 말은 넉넉잡아 5~8마디고, 봇은
 * 7초에 하나꼴(runtime 의 BOT_TALK_*)이라 한 토론에 5~6마디다. 그래서:
 *
 *   start        6   입장 때. 첫 토론 한 번을 아끼지 않고 말할 만큼 — 여기서 모자라면 첫 시험 전에 판이 조용해진다.
 *   secondsPer   3   시험에서 **버틴(남긴) 3초마다 1**. 30초를 다 버티면 10 — 다음 토론을 넉넉히 채우고 조금 남는다.
 *                    1초에 1이면(사용자의 예시) 30초 시험에서 30이 쌓여 지갑이 뜻을 잃는다 — 8초 버틴 사람(3)과
 *                    30초 버틴 사람(10)의 차이가 다음 토론에서 실제로 느껴지는 눈금이 이쯤이다.
 *   min          1   시험마다 최소. 0이면 한 번 못한 사람이 다음 토론에서 변명조차 못 한다 — 그 침묵은 의심도가
 *                    말로만 움직이는 이 판(P1)에서 곧 격리다. 한 마디는 남긴다.
 *   carry        5   시험을 지나 **다음 대화로 가져가는 안 쓴 발언권의 상한.** 아껴 둔 사람이 마지막 토론에서
 *                    스무 마디를 쏟으면 지갑이 없는 것과 같다. 지급에는 상한이 없다 — 처음엔 지갑 자체에
 *                    상한(15)을 뒀는데, 말을 아낀 좌석이 첫 시험 뒤 이미 15라 두 번째 시험에서 1등을 하고도
 *                    「+0」을 받았고, 다 쓴 꼴등이 +3 을 받아 표가 뒤집혀 보였다 (2026-09-05 사용자: "1등인데
 *                    0개고 꼴등이 훨씬 많이"). 이제 1등은 언제나 제 10 을 받는다. 최대 지갑은 5 + 10 = 15 로 같다.
 *
 * 시험마다 무엇을 재는지는 talkFor 에 있다 — 낙하 생존은 첫 피격까지의 초, 발판은 도착하고 **남긴** 초,
 * 원판은 첫 낙하까지의 초. 셋 다 「30초 안에서 얼마를 지켰나」라 한 눈금(secondsPer)으로 잰다.
 */
export const TALK = {
  start: 6,
  secondsPer: 3,
  min: 1,
  carry: 5,
} as const;

/**
 * 시험 기록 → 그 시험이 주는 발언권. 서버가 부르고(runtime.finishTest), 화면은 받은 값을 보여 줄 뿐이다.
 * @param metrics 결과의 metrics (공개본 — 조작이 있었으면 조작본. 지갑이 기록과 어긋나면 조작이 새는 자리가 된다)
 * @param testMs  시험 길이 — 발판의 「남긴 초」를 셀 기준
 */
export function talkFor(game: TrialGame, metrics: Record<string, number>, testMs: number): number {
  const seconds = heldSecondsFor(game, metrics, testMs);
  if (seconds === null || seconds <= 0) return TALK.min;
  return Math.max(TALK.min, Math.ceil(seconds / TALK.secondsPer));
}

/**
 * 시험에서 **지킨 초** — 발언권의 밑값이자 결과 모달의 「버틴 시간」(features/interrogation/hud/ResultTable 의 요약).
 *   낙하 생존  첫 피격까지(안 맞았으면 시험 길이)     발판  도착하고 남긴 초(못 갔으면 0)     원판  첫 낙하까지
 * 시간을 안 재는 시험(정지선 · 색 사냥)이나 값이 없으면 null. 시험 길이로 자른다 — 엔진이 마감을 틱 하나 넘겨
 * 닫으므로 30초를 다 버틴 기록이 30.08초로 오는데, 그러면 올림이 한 칸 더 간다.
 */
export function heldSecondsFor(game: TrialGame, metrics: Record<string, number>, testMs: number): number | null {
  const num = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN);
  let seconds: number;
  switch (game) {
    case 'fall':
    case 'disc':
      seconds = num(metrics.survivalTime);
      break;
    case 'platform': {
      const finish = num(metrics.finishMs);
      seconds = Number.isFinite(finish) ? Math.max(0, testMs - finish) / 1000 : 0;
      break;
    }
    default:
      return null;
  }
  if (!Number.isFinite(seconds)) return null;
  return Math.max(0, Math.min(seconds, testMs / 1000));
}

/*
 * 색 사냥의 와이어는 여기 없다 — 다른 두 테스트처럼 `protocol.ts` 의 `trial_*`
 * (trial_pick · trial_colorhunt · trial_picked · trial_orb)를 그대로 쓴다. 상수는 mp/constants 의 HUNT_*.
 */

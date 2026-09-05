/**
 * 「인간인 척」 판의 프로토콜 — PLANNING.md 의 게임(사람 여러 명 + AI 1 좌석 + AI 설계자 0~2)이
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
 */
export const SUSPICION = {
  accuse: 12,
  agree: 8,
  mobPer: 3,
  mobCap: 12,
  claimMatch: -12,
  claimMismatch: 15,
  /** 관리 AI 가 말을 읽고 한 번에 올릴 수 있는 최대 · 내릴 수 있는 최대 (readMin 은 음수) */
  readMax: 16,
  readMin: -10,
  cut: 100,
} as const;

/**
 * 관리 AI 가 방의 말을 읽는 간격(ms)과, 한 번에 읽는 새 발언의 수.
 * 한 마디마다 부르면 값이 튀고 LLM 을 너무 자주 부른다 — 몇 마디 쌓아 **한 장면**으로 읽는다.
 *
 * 14초였을 때는 40초짜리 토론 하나에 두 장면밖에 안 들어갔다. 9초면 서너 장면이다 — 말 읽기가 이 판에서
 * 눈금의 주된 문(runtime.readRoom)인데 그 문이 판 길이보다 느리게 열리고 있었다.
 */
export const READ_EVERY_MS = 9_000;
export const READ_MIN_LINES = 2;
export const READ_MAX_LINES = 12;

/** 주장 한 줄의 길이 상한 — 서버가 자른다 */
export const CLAIM_MAX_LEN = 140;

/*
 * 색 사냥의 와이어는 여기 없다 — 다른 두 테스트처럼 `protocol.ts` 의 `trial_*`
 * (trial_pick · trial_colorhunt · trial_picked · trial_orb)를 그대로 쓴다. 상수는 mp/constants 의 HUNT_*.
 */

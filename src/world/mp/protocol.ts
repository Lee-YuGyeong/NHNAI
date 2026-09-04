/**
 * 멀티플레이 프로토콜 — 클라이언트와 워커가 공유하는 **유일한 계약**.
 * src/world/net/* 와 worker/src/* 가 이 파일 하나만 본다.
 *
 * 규칙:
 *  1. 양쪽 핸들러(RoomDO.webSocketMessage · WorldConnection.onmessage)를 **같은 커밋에서** 고친다.
 *  2. 양쪽 switch의 default는 **무시**한다. 필드·타입 추가는 non-breaking이다.
 *  3. PROTOCOL_VERSION은 **의미가 바뀔 때만** 올리고, 올렸으면 워커를 먼저 배포한다.
 *  4. 위조되면 곤란한 값은 애초에 C2S에 넣지 않는다. 좌석·id·시각은 전부 서버가 정한다.
 */

/**
 * 이모트 — 키 1(화남) · 2(동의). 한 번 켜면 EMOTE_MS 동안 anim 으로 실려 가고 스스로 idle 로 돌아온다.
 * 걷기 시작하면 그 자리에서 끝난다. 받는 쪽은 상태가 **바뀌는 순간**부터 클립을 처음부터 튼다.
 */
export type EmoteState = 'angry' | 'agree';

/**
 * 리더 방송의 종류. 와이어에 그대로 실리지만 원본은 여기가 아니다 —
 * 서버에 붙지 않는 화면도 쓰는 값이라 의존성 없는 파일에 따로 두고 가져온다.
 * (`@/` 별칭은 워커 타입 세계에 없어서 상대 경로로 온다)
 */
export type { BroadcastKind } from '../../shared/broadcast-kind';
import type { BroadcastKind } from '../../shared/broadcast-kind';

/** 아바타 애니메이션 상태. 서버가 화이트리스트로 검증한다. 공중인지는 `y > 0`으로 판단한다. */
export type AnimState = 'idle' | 'walk' | EmoteState;

export const ANIM_STATES: readonly AnimState[] = ['idle', 'walk', 'angry', 'agree'];

/** 방에 있는 한 사람의 현재 모습. */
export interface PlayerSnapshot {
  /** 서버가 발급한 id. 방 안에서만 유효하다. */
  id: string;
  /** 1 ~ ROOM_MAX_PLAYERS. 표시 색·시작 자리를 여기서 뽑는다. */
  seat: number;
  /** 서버가 정리한 닉네임. */
  nickname: string;
  x: number;
  z: number;
  /** 발 높이. 0이 바닥이고 점프·가구 위에서만 >0이다. */
  y: number;
  /** y축 회전(rad). 아바타가 보는 방향. */
  heading: number;
  anim: AnimState;
  /**
   * 이 이름이 **확인된 것**인가 — 서명된 입장권으로 들어왔으면 true (worker/src/auth.ts).
   * 게스트는 아예 없다 (undefined). 규칙 2 대로 추가만 하는 필드라 버전을 올리지 않는다.
   *
   * ★ 계정 id 는 **여기 없다.** 방 전원에게 뿌리면 다른 방의 그 사람과 같은 사람인 것이
   *   그냥 읽힌다 — 정체를 감추는 게임에서 공짜로 주는 답이다 (worker/src/room-do.ts Attached).
   *   이 값이 말하는 것은 「이름을 사칭한 게 아니다」까지고, 인간인지 AI 인지는 말하지 않는다.
   */
  authed?: boolean;
}

/** 클라이언트 → 서버 */
export type C2SMessage =
  | { t: 'move'; x: number; z: number; y: number; heading: number; anim: AnimState }
  | { t: 'chat'; text: string }
  /** 리더 방송. 호스트 좌석만 보낼 수 있다 — 서버가 좌석으로 판정한다 */
  | { t: 'broadcast'; text: string; kind: BroadcastKind }
  /**
   * 한 사람을 방에서 내보낸다 (원작 humanish 의 /api/room/kick).
   *
   * ★ **누가 내보내는지는 싣지 않는다.** 서버가 그 소켓의 좌석으로 안다 — 실어 보내는 모양이면
   *   남의 id 를 적는 것만으로 방장 행세가 된다 (규칙 4).
   * ★ 모르는 타입은 양쪽 다 무시하므로(규칙 2) 버전을 올리지 않는다. 옛 워커는 이 줄을 흘리고,
   *   옛 클라이언트는 애초에 보내지 않는다.
   */
  | { t: 'kick'; id: string }
  /**
   * 물리 미니게임 방에 들어왔다 — 판이 없으면 서버가 이 게임으로 새 판을 연다 (worker/src/trial/runtime.ts).
   * 이미 판이 도는 중이면 game 은 무시되고 그 판을 받는다. 없으면 정지선.
   */
  | { t: 'trial_join'; game?: TrialGame }
  /**
   * 정지선: W 를 눌렀다(달리기 시작) · S 를 눌렀다(브레이크). 시각은 **서버가 수신 시점으로 찍는다**
   * — 클라 타임스탬프를 실으면 그 값 자체가 위조 대상이 된다(규칙 4와 같은 이유).
   */
  | { t: 'trial_accel' }
  | { t: 'trial_brake' };

/**
 * 접속이 끊기는 이유.
 * 'kicked' 만 **들어온 뒤에** 오는 값이다 — 나머지는 입장 자체가 거절된 것이다.
 * 'banned' 는 내보내진 **계정**이 같은 방 문 앞에 다시 섰을 때다 (room-do.ts 의 밴 명부).
 * 게스트는 이 값을 받을 일이 없다 — 계정이 없으면 명부에 적히지도 않는다.
 */
export type ErrorCode = 'version_mismatch' | 'room_full' | 'bad_request' | 'kicked' | 'banned';

/** 물리 미니게임 3종의 식별자. 색 사냥·낙하 생존 타입은 각각 PR2·PR3에서 실배선된다. */
export type TrialGame = 'stopline' | 'colorhunt' | 'fall';

/** 판정 대상 한 명의 결과 한 라운드치. 게임마다 metrics 의 키가 다르다 (PLANNING P1~P4). */
export interface TrialPlayerResult {
  id: string;
  metrics: Record<string, number>;
  /** 조건 전환 직후(정지선은 그 라운드 1회차)의 절대오차 — 판별의 핵심 구간 */
  transitionError: number;
  /** 시행별 부호 있는 오차. 방향이 흔들리면 「일부러 틀렸다」쪽에, 한쪽으로 몰리면 「감각이 있다」쪽에 가깝다 */
  errorDirection: number[];
  /** 시행별 |오차| 추이. 사람은 우하향(적응)한다 */
  adaptationCurve: number[];
}

/**
 * 한 라운드의 판정 결과 — **와이어로 나가는 모습**이다.
 *
 * ★ 물리 조건값(중력 배율·마찰계수·차단 파장)은 여기 없다 — 절대 클라이언트로 안 보낸다
 *   (PLANNING.md P8). 조건이 실린 원본(TrialResult)은 `worker/src/trial/types.ts` 에만 있고
 *   그건 DO 스토리지 밖으로 안 나간다 — 이 파일에서 그 타입을 import 하지 않는 것 자체가 그 약속이다.
 */
export interface TrialResultWire {
  game: TrialGame;
  round: number;
  players: TrialPlayerResult[];
  /** 이 라운드 metrics 키별 무리 평균 — 상대평가의 기준선(PLANNING P2) */
  groupMean: Record<string, number>;
  groupStdDev: Record<string, number>;
  endedAt: number;
}

/** 서버 → 클라이언트 */
export type S2CMessage =
  /** 입장 직후 한 번. 지금 방에 있는 전원(본인 포함). */
  | { t: 'welcome'; selfId: string; players: PlayerSnapshot[] }
  | { t: 'player_joined'; player: PlayerSnapshot }
  | { t: 'player_left'; id: string }
  | { t: 'player_moved'; id: string; x: number; z: number; y: number; heading: number; anim: AnimState }
  | { t: 'chat'; id: string; nickname: string; text: string; ts: number }
  /**
   * 리더 방송. **본인 포함 전원에게** 같은 내용으로 나간다.
   * `ts` 는 서버 시각이다 — 클라는 이걸로 "너무 늦게 도착한 방송"을 가려낸다.
   */
  | { t: 'broadcast'; text: string; kind: BroadcastKind; ts: number }
  | { t: 'error'; code: ErrorCode }
  /** 새 라운드가 열렸다 — 조건값은 없다. 트랙 기하 등 공개 상수는 클라가 이미 안다 (mp/constants). durationMs 는 시간제 게임(낙하 생존)만 */
  | { t: 'trial_round_start'; game: TrialGame; round: number; startAt: number; durationMs?: number }
  /** 누군가 달리기 시작했다(W) — 다른 사람 화면에도 보이도록. 판정은 안 실려 있다, 그저 연출용 */
  | { t: 'trial_running'; id: string; startAt: number }
  /**
   * 한 명의 정지선 시행 결과 — 렌더용 두 점(브레이크 지점 → 정지 지점)과 그 사이의 시각만 실린다.
   * 마찰계수 자체는 여기 없다. 클라는 공개된 이징 곡선으로 두 점 사이를 보간해 그린다.
   */
  | { t: 'trial_stopline_waypoints'; id: string; brakeAt: number; brakePos: number; stopAt: number; stopPos: number }
  /**
   * 낙하 생존 — 서버가 돌리는 물리의 스냅샷(~10Hz). 클라는 이걸 보간해 그릴 뿐 물체를 스스로 떨어뜨리지 않는다.
   * 중력값은 없다 — 위치만 온다(P8). 실제 사람의 좌표는 player_moved 로 따로 오고, 여기 ai 는 서버가 움직이는 좌석뿐이다.
   */
  | { t: 'trial_snapshot'; at: number; objects: { id: number; k: number; x: number; y: number; z: number }[]; ai: { id: string; x: number; z: number }[] }
  /** 낙하물에 맞았다 — 맞은 사람 화면의 연출용. 기록은 서버가 이미 했다 */
  | { t: 'trial_hit'; id: string; objectId: number }
  | { t: 'trial_result'; result: TrialResultWire }
  /** (재)입장 시 지금까지의 전체 기록을 백필한다 — 로그 탭은 이걸로 채운다 */
  | { t: 'trial_history'; results: TrialResultWire[] };

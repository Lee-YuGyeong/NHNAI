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
/**
 * 한 번 하고 마는 몸짓 — 클립 길이(EMOTE_MS)만큼 자세를 쥐었다가 스스로 빠진다.
 * 자세는 전부 뼈를 돌려 만든다 (avatar/RobotAvatar 의 CLIPS) — GLB 에는 클립이 하나도 없다.
 *
 * 방에서 벌어지는 일마다 하나씩이다 (2026-09-03 사용자: 「AI 들 모션 더 넣을 수 있어?」):
 *   angry  아무도 안 문 이름을 처음 문다      agree  남이 물어 놓은 쪽에 얹는다
 *   point  그 이름을 **가리킨다**             deny   물린 채로 입을 연다 (해명)
 *   shrug  넘긴다 · 할 말이 없다              flinch 총이 나갔다
 *   back   붉은 원이 켜졌다 (물러선다)
 */
export type EmoteState = 'angry' | 'agree' | 'point' | 'deny' | 'shrug' | 'flinch' | 'back';

/**
 * 폐기된 몸 — **되돌아오지 않는 상태다.** 이모트처럼 스스로 풀리지 않고, 걸어도 안 풀린다:
 * 이 상태가 된 몸은 곧 보관소에서 빠진다 (features/arena 의 처형 행진).
 *
 * 리더가 무대 위에서 쏘면 그 자리에서 앞으로 넘어간다 (avatar/RobotAvatar 의 down 클립).
 * 여태는 링 조명 아래 선 채로 **툭 사라졌다** (2026-09-03 사용자: "리더가 로봇 쏘면
 * 로봇 쓰러지는 모션 넣어줘").
 */
export type DownState = 'down';

/** 아바타 애니메이션 상태. 서버가 화이트리스트로 검증한다. 공중인지는 `y > 0`으로 판단한다. */
export type AnimState = 'idle' | 'walk' | EmoteState | DownState;

export const ANIM_STATES: readonly AnimState[] = [
  'idle', 'walk', 'angry', 'agree', 'point', 'deny', 'shrug', 'flinch', 'back', 'down',
];

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
}

/** 클라이언트 → 서버 */
export type C2SMessage =
  | { t: 'move'; x: number; z: number; y: number; heading: number; anim: AnimState }
  | { t: 'chat'; text: string };

/** 접속이 거절되는 이유. */
export type ErrorCode = 'version_mismatch' | 'room_full' | 'bad_request';

/** 서버 → 클라이언트 */
export type S2CMessage =
  /** 입장 직후 한 번. 지금 방에 있는 전원(본인 포함). */
  | { t: 'welcome'; selfId: string; players: PlayerSnapshot[] }
  | { t: 'player_joined'; player: PlayerSnapshot }
  | { t: 'player_left'; id: string }
  | { t: 'player_moved'; id: string; x: number; z: number; y: number; heading: number; anim: AnimState }
  | { t: 'chat'; id: string; nickname: string; text: string; ts: number }
  | { t: 'error'; code: ErrorCode };

/**
 * 멀티플레이 튜닝 상수 — 클라이언트(src/world)와 워커(worker/src)가 **같이 읽는다**.
 * 값을 고치면 양쪽이 동시에 바뀐다. 한쪽에만 상수를 복붙하지 않는다.
 *
 * 이 파일은 의존성이 없어야 한다. 워커(Cloudflare)에서도 그대로 번들되므로
 * react/three/DOM 타입을 끌어오면 빌드가 깨진다.
 *
 * humanish 의 lib/mp/constants.ts 에서 "방에 들어가 걸어다닌다"에 필요한 것만 가져왔다.
 * 라운드·투표·봇·달리기 관련 값은 전부 뺐다.
 */

/**
 * 프로토콜 버전. 입장 URL의 `v=`로 실려 가고 워커가 다르면 끊는다.
 * 기존 필드의 **의미가 바뀔 때만** 올리고, 올렸으면 워커를 먼저 배포한다.
 */
export const PROTOCOL_VERSION = 1;

/**
 * 월드 경계 (월드 단위 ≈ m). 창고 맵(src/world/map/warehouse/layout.ts 의 ROOM: x ±15, z -20~12)을 0.6 인셋한 값이다.
 * 복도 맵(x ±5.2, z -14~6)은 이 안에 든다 — 복도 벽은 collide.ts 가 막는다.
 * x는 좌우, z는 앞뒤(-가 무대 쪽), y는 바닥에서의 높이.
 * ★ z 범위의 중심(-4)은 바꾸지 않는다 — spawn.ts 의 좌석 원 중심이 여기서 나오고, 두 맵 다 (0,-2.5) 반지름 3.4 를 비워 뒀다.
 * 서버가 이 범위로 검증하므로 씬을 넓히면 여기부터 고친다.
 */
export const WORLD = {
  minX: -14.4,
  maxX: 14.4,
  minZ: -23.4,
  maxZ: 15.4,
  /** 발 높이 상한. 가장 높은 발판(무대턱 0.75) + 점프(≈1.05)보다 넉넉히 위 */
  maxY: 4,
} as const;

/** 서버 검증 여유. 경계에서 클라 충돌 처리가 0.1쯤 튀는 걸 매번 거절하면 그 사람만 멈춘다. */
export const POS_MARGIN = 2;

/** 벽 안쪽 여유. WORLD 는 홀 벽(gallery.tsx 의 ROOM)에서 이만큼 안으로 들인 값이다. */
export const WALL_INSET = 0.6;

/** 이동 송신 주기. 10Hz. 걷기 2.6m/s 기준 샘플 간 0.26m라 보간으로 충분히 매끄럽다. */
export const MOVE_THROTTLE_MS = 100;

/** 서버가 받아주는 이동 최소 간격. 클라의 10Hz 약속을 믿지 않는 쪽의 상한이다. */
export const MOVE_MIN_INTERVAL_MS = MOVE_THROTTLE_MS / 2;

/** 수신 보간 지연. 송신 주기보다 한 칸 여유를 둬서 패킷이 늦어도 보간할 구간이 남는다. */
export const INTERP_DELAY_MS = 150;

/** 플레이어당 좌표 링버퍼 길이. */
export const MOVE_BUFFER_MAX = 24;

/** 하트비트. 플랫폼 auto-response가 받아주므로 DO는 깨어나지 않는다. */
export const PING_INTERVAL_MS = 20_000;
/** ping 3회를 놓치면 죽은 소켓으로 본다. */
export const SOCKET_TIMEOUT_MS = 60_000;
/** 유령 소켓 청소 알람 주기. */
export const SWEEP_ALARM_MS = 30_000;

/** 채팅 한 줄 길이 상한. 서버가 자른다. */
export const CHAT_MAX_LEN = 200;
/** 같은 소켓의 채팅 최소 간격. 스팸 차단. */
export const CHAT_MIN_INTERVAL_MS = 600;
/**
 * 방송 한 줄 길이 상한. 서버가 자른다 — 여기는 천장이고,
 * 실제로 읽힐 만큼 다듬는 건 클라의 문장 단위 캡(features/tts/cap.ts)이다.
 * 서버 몫은 권한을 뺏는 게 아니라 하한을 지키는 것이다 (PLANNING §1.2a).
 */
export const BROADCAST_MAX_LEN = 300;
/** 같은 소켓의 방송 최소 간격. 리더가 폭주해도 방 전원의 스피커를 점거하지 못한다. */
export const BROADCAST_MIN_INTERVAL_MS = 1500;

/** WS 메시지 크기 상한. */
export const MAX_WS_MESSAGE_LEN = 4 * 1024;

/**
 * 방 정원. 좌석 원(spawnFor)도 이 수로 나눈다 — 워커와 클라이언트가 반드시 같아야 한다.
 *
 * ★ **셋이다** (2026-08-31). 이 게임의 사람은 셋이고(PLANNING §1.8 — 인간 3명), 나머지 자리는
 *   구역의 노드들이 채운다. 정원을 아홉으로 열어 두면 로비가 "아홉이 모여야 시작하는 방"으로
 *   읽히고, 실제로는 오지 않는 여섯 자리를 계속 비워 놓고 기다리게 된다.
 *   숫자는 여기 한 곳에만 있다 — 화면(대기방 좌석·눈금·정원 표시)과 워커의 room_full 이
 *   전부 이 값을 본다.
 */
export const ROOM_MAX_PLAYERS = 3;

/**
 * 판을 여는 신호 문장. 방장이 리더 방송으로 내고, 그 방의 대기방 전원이 이 문장을 보고 같이 넘어간다
 * (features/lobby/Waitroom.tsx).
 *
 * ★ 여기 있는 이유: **방(DO)도 이 문장을 읽는다.** 이 방송이 나가면 등록소의 그 줄이
 *   「게임 중」으로 바뀐다 (worker/src/room-do.ts → lobby-do.ts). 화면에만 두면 방은
 *   자기가 시작한 줄을 모르고, 로비 목록은 이미 판이 도는 방을 계속 「대기중」으로 부른다.
 * ★ 프로토콜에 시작 메시지를 새로 만들지 않는다 — 이미 있는 통로(방송)를 쓴다.
 *   Waitroom 이 「준비」를 채팅 한 줄로 나르는 것과 같은 규칙이고, 이유도 같다:
 *   화면 하나 때문에 방 계약을 늘리면 워커를 먼저 배포해야 하는 짐이 영구히 남는다.
 */
export const ROOM_START_LINE = '전원 구역으로 진입한다';

/** 방 번호 모양. 숫자 1~6자리. */
export const ROOM_CODE_RE = /^[0-9]{1,6}$/;
/** 닉네임 길이 상한. 서버가 자른다. */
export const NICK_MAX_LEN = 12;

/* ───────────────────────────── 클라이언트 이동 ───────────────────────────── */

export const WALK_SPEED = 2.6;
/** 아바타 눈높이. 카메라가 **발 높이 + 이만큼**에 붙는다. */
export const EYE_HEIGHT = 1.62;

/**
 * 점프. 최고점 = JUMP_SPEED² / (2·GRAVITY) ≈ 1.05m, 체공 ≈ 0.75초.
 * 낮추면 중앙 좌대(0.95)에 못 올라간다.
 */
export const JUMP_SPEED = 5.6;
export const GRAVITY = 15;
export const JUMP_MAX_Y = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY);

/** 이모트(키 1·2) 길이(ms). 아바타 클립 길이이자 anim 이 idle 로 돌아오는 시각이다 — 양쪽이 같이 본다. */
export const EMOTE_MS = { angry: 2400, agree: 1800 } as const;

/* ───────────────────────────── 물리 미니게임 — 정지선 ───────────────────────────── */

/**
 * 정지선 트랙의 **공개** 상수 — 마찰계수만 숨는다(worker/src/trial/condition.ts). 여기 값은 전부
 * 클라이언트도 알아야 트랙을 그리고 달리는 시늉을 낼 수 있다. 실제 정지 위치는 서버가 계산해서
 * `trial_stopline_waypoints` 로 내려준다 — 여기 상수로 클라가 스스로 판정하지 않는다.
 */
/**
 * 트랙은 심문소 홀(map/interrogation/layout.ts: z 12 → -20, 무대 앞면 -14) 안에 놓인다 —
 * 출발선 z 10 에서 무대 앞면까지 24m. 30 이면 무대(0.45m 단) 위로 올라가 버린다.
 */
export const STOPLINE_TRACK_LENGTH = 24;
/** 출발선에서 목표 정지선까지의 거리(m). */
export const STOPLINE_TARGET = 16;
/** 가속이 끝나는 속도(m/s). 라운드마다 동일 — 변수를 마찰 하나로 좁힌다. */
export const STOPLINE_TOP_SPEED = 6;
/** 가속도(m/s²). 탑스피드까지 STOPLINE_TOP_SPEED / STOPLINE_ACCEL 초 걸린다. */
export const STOPLINE_ACCEL = 4;
/**
 * 미니게임 하나 = 1분. 그 안에서 20초마다 조건(마찰 · 중력)이 몰래 바뀐다 — "라운드"는 없다
 * (2026-09-04 사용자: "1분간 게임 하게 하고 … 라운드는 하나밖에 없어"). 세 구간의 조건표는
 * worker/src/trial/condition.ts 에만 있다.
 */
export const TRIAL_GAME_MS = 60_000;
export const TRIAL_PHASE_MS = 20_000;
/** 끝난 뒤 요약을 보여 주는 시간(ms) */
export const TRIAL_SUMMARY_MS = 10_000;

/** 1분 동안 허용되는 시행 횟수 상한. */
export const STOPLINE_MAX_ATTEMPTS = 9;

/* ───────────────────────────── 물리 미니게임 — 낙하 생존 ───────────────────────────── */

/**
 * 낙하 생존의 **공개** 상수 — 중력 배율만 숨는다(worker/src/trial/condition.ts). 마당은 심문소 홀 가운데,
 * 무대(z < -14)와 옆벽 선반을 피한 빈 바닥이다. 서버가 이 범위 안에 물체를 떨어뜨리고, 클라는 이 범위로 발을 막는다.
 */
export const FALL_ARENA = { minX: -6, maxX: 6, minZ: -11, maxZ: 8 } as const;
/** 공 스폰 간격(ms). 처음 스펙은 1.5초였는데 마당이 넓어 성겨 보였다 — 0.7초, 1분에 85개쯤 (2026-09-04 사용자: "공도 좀 더 많이") */
export const FALL_SPAWN_MS = 700;
/** 낙하물이 놓이는 높이(m). 처마(9)보다 살짝 아래 */
export const FALL_SPAWN_Y = 8.5;
/** 사람 몸 반지름(m) — 공 반지름과 더한 것이 맞는 거리다 */
export const FALL_BODY_R = 0.35;
/** 위협 반경·회피 방향 기준에 쓰는 대표 공 반지름(m) — 실제 판정은 공마다 자기 반지름으로 */
export const FALL_OBJECT_R = 0.24;

/**
 * 떨어지는 공들 — 공마다 무게가 다르다. 진공이면 다 같이 떨어지지만 여기엔 공기가 있다: 공기저항은
 * 단면적에 비례하고 무게로 나뉘므로 **가볍고 성긴 탁구공이 늦게, 무겁고 촘촘한 볼링공이 빨리** 닿는다
 * (종단속도 v = √(2mg / ρ·Cd·A)). 물리 계산은 실제 반지름(realR)·무게로, 화면·충돌은 보이게 키운 반지름(r)으로.
 * 이 표는 공개다 — 숨기는 것은 중력 배율뿐(worker/src/trial/condition.ts).
 */
export const FALL_BALLS = [
  { id: 'basketball', label: '농구공', r: 0.24, realR: 0.12, mass: 0.62, restitution: 0.75 },
  { id: 'soccer', label: '축구공', r: 0.22, realR: 0.11, mass: 0.43, restitution: 0.65 },
  { id: 'baseball', label: '야구공', r: 0.16, realR: 0.037, mass: 0.145, restitution: 0.5 },
  { id: 'pingpong', label: '탁구공', r: 0.12, realR: 0.02, mass: 0.0027, restitution: 0.8 },
  { id: 'bowling', label: '볼링공', r: 0.22, realR: 0.108, mass: 7.0, restitution: 0.1 },
] as const;
export type FallBallKind = (typeof FALL_BALLS)[number]['id'];
/** 공기저항을 실제보다 진하게 — 8.5m 낙하에서 공마다 닿는 시각 차이가 눈에 보이려면 이만큼은 필요하다(실제 ×1 이면 0.25초 차) */
export const FALL_DRAG_GAIN = 2.5;
/** 서버 물리 틱과 스냅샷 주기(ms). 틱은 판정용, 스냅샷은 그리기용 */
export const FALL_TICK_MS = 50;
export const FALL_SNAPSHOT_MS = 100;

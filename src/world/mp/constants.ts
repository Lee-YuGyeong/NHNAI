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
 * ★ **여덟이다** (2026-09-04, PLANNING §1.1 「실제 플레이어 3~8명」). 「인간인 척」 판(/interrogation)은 사람이 모이는
 *   대로 3~8명으로 열리고, 사람이 모자라면 대역이 채운다 — 정원은 그 상한이다. 예전 값 셋(2026-08-31, 이야기판의
 *   「인간 3명」)은 그 판(/world → /central → /recheck)의 사정이었고, 그쪽은 정원이 커져도 그대로 돈다(좌석 원만 넓어진다).
 *   숫자는 여기 한 곳에만 있다 — 화면(대기방 좌석·눈금·정원 표시)과 워커의 room_full 이 전부 이 값을 본다.
 */
export const ROOM_MAX_PLAYERS = 8;

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
/** 공 스폰 간격(ms). 처음 스펙은 1.5초였는데 마당이 넓어 성겨 보였다 — 0.4초, 1분에 150개쯤 (2026-09-04 사용자: "공 더 많이") */
export const FALL_SPAWN_MS = 400;
/** 공이 놓이는 높이(m). 트러스(처마 9) 위, 용마루(13) 아래 — 천장 틈에서 떨어진다. 높을수록 공마다 닿는 시각 차이가 벌어진다 */
export const FALL_SPAWN_Y = 11.5;
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
/**
 * 공기저항을 실제보다 진하게(×7) — 실제 공기(×1)면 볼링~축구가 0.1초 안에 다 닿아 눈으로 구분이 안 된다
 * (2026-09-04 사용자: "사람 눈으로 보기에는 별 차이가 없어"). 11.5m 에서 볼링 1.55s · 야구 1.70s · 농구 1.95s ·
 * 축구 2.04s · 탁구 3.75s — 순서는 실제 물리 그대로, 간격만 벌렸다.
 */
export const FALL_DRAG_GAIN = 7;
/** 서버 물리 틱과 스냅샷 주기(ms). 틱은 판정용, 스냅샷은 그리기용 */
export const FALL_TICK_MS = 50;
export const FALL_SNAPSHOT_MS = 100;

/* ───────────────────────────── 물리 미니게임 — 색 사냥 ───────────────────────────── */

/**
 * 색 사냥의 **공개** 상수 — 숨는 것은 차단 파장(worker/src/trial/condition.ts)과 구슬의 진짜
 * 색(반사율 표 — worker/src/trial/colorhunt/palette.ts)뿐이다. 클라이언트에는 서버가 곱셈을 끝낸
 * 표시색만 온다(`trial_colorhunt`). 상세 기획은 docs/COLORHUNT.md.
 */
/** 마당 — 낙하 생존과 같은 빈 바닥을 그대로 쓴다 (PLANNING §7 "같은 맵, 상수만 교체") */
export const HUNT_ARENA = FALL_ARENA;
/** 구슬 분포 — 7색(목표 가능 6 + 검정 미끼) × 10개. 색 이름은 견본판이 공개한다 */
export const HUNT_HUE_COUNT = 7;
export const HUNT_ORBS_PER_HUE = 10;
/** 구슬 반지름 · 놓이는 높이(m) — 무릎께에 떠 있다 */
export const HUNT_ORB_R = 0.18;
export const HUNT_ORB_Y = 0.35;
/** 주울 수 있는 거리(m). 서버 검증은 move 가 10Hz 라 약간의 슬랙을 더 본다(엔진) */
export const HUNT_PICK_R = 1.2;
export const HUNT_PICK_COOLDOWN_MS = 800;
/** 주워진 구슬은 이 뒤에, 그 자리 ±이 범위에 같은 색으로 다시 돋는다 — 위치 기억이 유효하게 근처다 */
export const HUNT_RESPAWN_MS = 2000;
export const HUNT_RESPAWN_JITTER = 1.5;
/** 견본판이 선 자리 — 클라가 그리는 곳이자 서버 NPC 가 「확인하러」 걸어가는 곳 (마당 안, 출발 쪽) */
export const HUNT_BOARD = { x: 0, z: 7.4 } as const;
/** 조명 전환 램프(ms) — 클라 연출용. 판정과 무관하다 */
export const HUNT_LIGHT_RAMP_MS = 500;

/* ───────────────────────────── 물리 미니게임 — 회전 원판 생존 ───────────────────────────── */

/**
 * 회전 원판 생존의 **공개** 상수 — 숨는 것은 원판 표면의 마찰계수(worker/src/trial/condition.ts 의 DISC_GRIP)뿐이다.
 * 원판은 심문소 홀 가운데 마당(FALL_ARENA 와 같은 빈 바닥)에 놓인 지름 11m 의 강판이다. 서버가 회전(각도 · 각속도)과
 * 모든 참가자의 자리를 적분해 스냅샷(trial_disc)으로 내려 보내고, 클라는 자기 걷기 입력(trial_walk)만 올린다 —
 * 미끄러짐은 마찰계수가 정하므로 클라가 스스로 계산할 수 없다(P8). 상세 설계는 worker/src/trial/disc/sim.ts 머리말.
 */
export const DISC_CENTER = { x: 0, z: -1.5 } as const;
/** 원판 반지름(m). 이 밖으로 나가면 떨어진다 */
export const DISC_R = 5.5;
/** 원판 윗면 높이(m) — 홀 바닥에서 이만큼 떠 있다. 떨어지면 이 높이만큼 추락한다 */
export const DISC_TOP = 0.75;
/** 가운데 회전축 기둥의 반지름(m) — 이 안으로는 못 들어간다. 그래서 「가장 안정한 자리」는 점이 아니라 기둥 둘레의 고리다 */
export const DISC_HUB_R = 0.9;
/** 사람 몸 반지름(m) — 기둥·가장자리 판정에 더한다 */
export const DISC_BODY_R = 0.35;
/** 원판 위 걷기 · 달리기(Shift) 속도(m/s) — 원판 표면 기준. 서버가 이 상한으로 자른다 */
export const DISC_WALK_SPEED = WALK_SPEED;
export const DISC_RUN_SPEED = 4.8;
/** 각속도 상한(rad/s). 가장자리(5.5m)에서 접선 속도 ≈ 8.8 m/s, 원심가속도 ≈ 14 m/s² */
export const DISC_OMEGA_MAX = 1.6;
/** 떨어진 뒤 다시 올라오기까지(ms) · 다시 서는 반지름(m) */
export const DISC_RESPAWN_MS = 2000;
export const DISC_RESPAWN_R = 2.4;
/** 서버 물리 틱과 스냅샷 주기(ms) — 낙하 생존과 같다 */
export const DISC_TICK_MS = 50;
export const DISC_SNAPSHOT_MS = 100;
/** 걷기 입력이 이만큼(ms) 안 오면 손을 뗀 것으로 본다 (클라는 바뀔 때만 보낸다 — 끊긴 사람이 영영 걷지 않게) */
export const DISC_WALK_STALE_MS = 1500;

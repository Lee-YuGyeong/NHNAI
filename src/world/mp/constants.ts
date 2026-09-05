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
 * 미니게임 하나 = 1분. 그 안에서 20초마다 조건(마찰 · 빛)이 몰래 바뀐다 — "라운드"는 없다
 * (2026-09-04 사용자: "1분간 게임 하게 하고 … 라운드는 하나밖에 없어"). 세 구간의 조건표는
 * worker/src/trial/condition.ts 에만 있다. 낙하 생존의 중력은 예외로 상수다(같은 파일 FALL_GRAVITY).
 */
export const TRIAL_GAME_MS = 60_000;
export const TRIAL_PHASE_MS = 20_000;
/**
 * 움직이는 플랫폼만 30초 (2026-09-05 사용자: "제한시간은 30초로"). 발판 여덟 칸을 기계는 10초쯤에, 사람은 20초쯤에 건넌다 —
 * 1분이면 완주한 사람이 반을 서서 기다린다. 20초에 배속 구간이 한 번 바뀐다(mp/platform.ts PLATFORM_PHASE_SPEED).
 */
export const PLATFORM_GAME_MS = 30_000;
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
/**
 * 공 스폰 간격(ms). 처음 스펙은 1.5초였는데 마당이 넓어 성겨 보였다 — 0.4초로 줄였고
 * (2026-09-04 사용자: "공 더 많이"), 다시 0.25초로 줄였다 (2026-09-05 사용자: "공 난이도도 높여줘").
 * 30초짜리 검문소 시험에 120개, /trial 의 1분에 240개.
 *
 * 이 값이 화면의 상한과 짝이다 — 한 종류가 동시에 몇 개까지 뜨는지(FallingBalls 의 MAX_PER_KIND).
 * 가장 오래 사는 탁구공이 낙하 3.75초 + 잔류 1초 = 4.75초를 사는데, 0.25초 간격이면 동시에 19개가
 * 다섯 종류로 나뉘어 종류당 넷 남짓이다. 더 줄이려면 저쪽 상한부터 본다.
 */
export const FALL_SPAWN_MS = 250;
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
/**
 * 기둥 둘레의 **매끈한 강판 캡** — 이 반지름 안에서는 발이 잡는 마찰이 DISC_CAP_GRIP 배로 준다 (worker/src/trial/disc/sim.ts).
 * 원심력 ω²r 은 가운데서 0 이라 가운데에 가만히 서면 어떤 μ 로도 절대 안 밀렸다 — 안전지대가 곧 정답이 되는 판이었다
 * (2026-09-05 사용자: "가운데 가만히 있는 사람 조금씩 튕겨 나가게"). 캡 위에서는 작은 원심력에도 발이 못 잡아 천천히
 * 바깥으로 밀려나고, 캡 밖 링에 가서야 선다 — 그 링의 자리는 ω 와 숨은 μ 가 정하니 매 구간 다르다.
 * 캡은 눈에 보인다(DiscStage) — 공개된 것은 「어디가 미끄러운가」이지 「얼마나」(μ)가 아니다 (P8).
 */
export const DISC_CAP_R = 2.2;
export const DISC_CAP_GRIP = 0.25;
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

/* ───────────────────────────── 물리 미니게임 — 무게 중심 다리 ───────────────────────────── */

/**
 * 무게 중심 다리의 **공개** 상수 — 숨는 것은 판자 윗면의 마찰계수(worker/src/trial/condition.ts 의 SEESAW_GRIP)뿐이다.
 * 홀 가운데 마당(FALL_ARENA)에 길이 14m · 폭 3m 의 강판이 가운데 축 하나로 얹혀 있다. 판자는 z 방향으로 길고(판자 좌표 u),
 * x 축을 중심으로 기울어진다(φ, +u 끝이 올라가면 양수). 서버가 회전(φ · ω)과 참가자·화물 전부의 자리를 적분해
 * 스냅샷(trial_seesaw)으로 내려 보내고, 클라는 걷기 명령(trial_walk)만 올린다 — 회전 원판과 같은 수법(P8).
 * 상세 설계는 worker/src/trial/seesaw/sim.ts 머리말.
 */
export const SEESAW_CENTER = { x: 0, z: -1.5 } as const;
/** 판자 절반 길이(m) — 축에서 끝까지. 이 밖으로 나가면 떨어진다 */
export const SEESAW_HALF = 7;
/** 판자 절반 폭(m). 옆은 난간이 막아 떨어지지 않는다 — 이 판의 물리는 길이 방향 하나다 */
export const SEESAW_HALF_W = 1.5;
/** 축 위 판자 윗면 높이(m). 끝은 최대 기울기에서 바닥 위 0.13m 까지 내려간다 (7·sin 0.36 ≈ 2.47) */
export const SEESAW_TOP = 2.6;
/** 판자 두께(m) — 그리기용 */
export const SEESAW_PLATE_H = 0.3;
/** 기울기 상한(rad, ≈20.6°) — 멈춤쇠가 받는다. 세게 닿으면 판이 들썩여 발이 미끄러진다 (SEESAW_JOLT) */
export const SEESAW_TILT_MAX = 0.36;
/** 멈춤쇠에 닿는 순간 판 위 모든 발에 얹히는 미끄러짐(m/s, 낮은 쪽으로). 이 각속도(rad/s)보다 세게 닿았을 때만 */
export const SEESAW_JOLT = 1.2;
export const SEESAW_JOLT_OMEGA = 0.25;
/**
 * 판자 질량(kg)과 축 둘레 관성 모멘트(kg·m²) — 균일한 막대 M·L²/12, L = 14. 사람 하나(75kg)가 끝(7m)에 서면 α ≈ 0.13 rad/s² —
 * 멈춰 있던 판이 상한(0.36)까지 2.4초. 1200kg 로 시작했더니 첫 화면부터 판이 상한에 붙어 있었다(2026-09-05 헤드리스 확인) —
 * 사람이 반응할 틈이 없어 2500 으로 올렸다
 */
export const SEESAW_PLANK_MASS = 2500;
export const SEESAW_INERTIA = (SEESAW_PLANK_MASS * (2 * SEESAW_HALF) ** 2) / 12;
/** 축 마찰(N·m·s) — 없으면 영원히 흔들린다. ω = 0.15 rad/s 에서 2250 N·m — 사람 하나가 3m 에 선 토크와 비슷하다 */
export const SEESAW_DAMPING = 15000;
/** 축이 판자 무게중심보다 이만큼(m) 위다 — 빈 판이 수평으로 돌아오는 복원력. 0.2rad 에서 사람 하나가 3.3m 에 선 것과 같다 — 끝(7m)의 하나가 이긴다 */
export const SEESAW_COM_DROP = 0.5;
/** 사람 몸의 기준 질량(kg) — 몸마다 배율이 붙는다 (mp/bodies.ts massOf: 비만 1.8) */
export const SEESAW_BODY_MASS = 75;
/** 판자 위 걷기 · 달리기(Shift) 속도(m/s). 서버가 이 상한으로 자른다 */
export const SEESAW_WALK_SPEED = WALK_SPEED;
export const SEESAW_RUN_SPEED = 4.8;
/** 떨어진 뒤 다시 올라오기까지(ms) · 다시 서는 자리(축에서, m) */
export const SEESAW_RESPAWN_MS = 2500;
export const SEESAW_RESPAWN_U = 0.8;
/** 서버 물리 틱과 스냅샷 주기(ms) — 회전 원판과 같다 */
export const SEESAW_TICK_MS = 50;
export const SEESAW_SNAPSHOT_MS = 100;
export const SEESAW_WALK_STALE_MS = 1500;
/**
 * 화물 — 천장 크레인이 판자 위 아무 자리에 상자를 내려놓는다. 이것이 판을 흔드는 「사건」이다: 무리가 반대쪽으로 옮겨 가
 * 균형을 되찾아야 한다. 상자도 같은 마찰로 미끄러진다 — 기울면 낮은 쪽으로 밀려 끝에서 떨어진다
 */
export const SEESAW_CRATE_MASS = 120;
export const SEESAW_CRATE_SIZE = 1.0;
/** 다음 상자까지(ms) 최소 · 최대, 상자가 머무는 시간(ms) 최소 · 최대, 동시에 놓이는 상한 */
export const SEESAW_CRATE_EVERY_MS = [5000, 8000] as const;
export const SEESAW_CRATE_STAY_MS = [6000, 10000] as const;
export const SEESAW_CRATE_MAX = 3;
/** 상자가 내려놓이는 자리(축에서, m) 최소 · 최대 — 축 바로 옆은 힘이 없다 */
export const SEESAW_CRATE_U = [2, 6] as const;
/** 크레인에서 판자까지 내려오는 시간(ms) — 클라 연출이자 서버가 「닿는 순간」을 정하는 값. 닿기 전에는 무게가 없다 */
export const SEESAW_CRATE_DROP_MS = 700;

/* ───────────────────────────── 물리 미니게임 — 회전 봉 넘기 ───────────────────────────── */

/**
 * 회전 봉 넘기의 **공개** 상수 — 숨는 것은 바닥 마찰계수(worker/src/trial/condition.ts 의 BAR_GRIP)뿐이다.
 * 홀 가운데 마당에 회전 원판과 같은 크기의 **돌지 않는** 강판 무대가 있고, 가운데 기둥에서 나온 낮은 봉이
 * 바닥을 쓸며 돈다 — 봉이 내 자리에 오면 Space 로 뛰어넘는다. 봉의 속도 스케줄은 눈에 보이는 것이라 공개다
 * (구간마다 바뀌고 2구간은 방향이 뒤집힌다). 중력·이륙 속도도 공개라 **점프의 수직축에는 숨은 값이 없다** —
 * 숨은 것은 발밑뿐이다: 미끄러운 구간에는 발이 μg 로만 가속·제동돼 자리 잡기가 늦고, 착지한 발이 밀리고,
 * 맞아 넘어진 몸이 멀리 미끄러진다. 판정(스침 순간의 발 높이)은 전부 서버다. 상세는 worker/src/trial/bar/sim.ts 머리말.
 */
export const BAR_CENTER = { x: 0, z: -1.5 } as const;
/** 무대 반지름(m) — 이 밖으로 밀려나면 떨어진다. 원판과 같은 크기 */
export const BAR_R = 5.5;
/** 무대 윗면 높이(m) — 홀 바닥에서 이만큼 떠 있다 */
export const BAR_TOP = 0.75;
/** 가운데 기둥 반지름(m) — 이 안으로는 못 들어간다 */
export const BAR_HUB_R = 0.9;
/** 사람 몸 반지름(m) — 기둥·가장자리 판정에 더한다 */
export const BAR_BODY_R = 0.35;
/** 봉 윗면이 무대에서 뜬 높이(m) — 스치는 순간 발이 이보다 높아야 넘은 것이다. 비만 몸(정점 1.05m)도 넉넉히 넘는다 */
export const BAR_HEIGHT = 0.42;
/** 봉의 두께(m) — 그리기용 */
export const BAR_THICK = 0.16;
/**
 * 봉의 각속도 크기 범위와 램프(rad/s²) — **공개**다(봉이 도는 것은 눈에 보인다). 회전 원판과 같은 문법으로 목표
 * 속도를 무작위로 뽑아 서서히 옮겨 가고, 잠시 유지한 뒤 다시 뽑는다 — 빨라졌다 느렸다 하고 방향도 자주 뒤집힌다
 * (2026-09-05 사용자: "회전 속도 빨랐다가 느렸다가 왔다갔다 해줘". 원래는 20초 구간마다 [0.9, −1.35, 1.1] 고정이었다).
 * 범위는 2.5~5.5 (2026-09-05 사용자: "속도 2.5~5.5로". 1.2~3.0 을 거쳐 왔다) — 5.5 면 봉이 1.14초에 한 바퀴로
 * 체공(기준 몸 0.92초)과 거의 맞물린다: 내려서자마자 다음 봉이고, 맞고 누운 1.6초(BAR_DOWN_MS) 동안 봉이 위로
 * 한 바퀴 반을 지나간다. 스케줄은 서버가 만들지만 θ·ω 가 스냅샷에 그대로 실리므로 비밀이 아니다 — 숨은 값은
 * 여전히 발밑(BAR_GRIP)뿐이다.
 * 램프 상한이 2.2 인 이유: 최악(하한 2.5 에서 감속 중 이륙)에도 스침이 체공 창(기준 몸 0.10~0.82초) 안에 남는
 * 상한이 ≈2.6 rad/s² — 그 밑이다. 이보다 급하면 이륙 순간 완벽했던 점프가 공중에서 오답이 된다. 하한 1.2 는
 * 방향 뒤집기(최대 11 rad/s 차이)가 9초를 넘지 않게 — 램프가 느리면 봉이 판의 절반을 「되돌아가는 중」으로 보낸다.
 */
export const BAR_OMEGA_MIN = 2.5;
export const BAR_OMEGA_MAX = 5.5;
export const BAR_RAMP_MIN = 1.2;
export const BAR_RAMP_MAX = 2.2;
/**
 * 이 판의 중력(m/s²) — 낙하 생존과 같은 눈금이고 **판 내내 상수**다 (2026-09-05 사용자: "중력은 그대로여야해").
 * 이륙 속도는 홀 눈금(GRAVITY=15)에서 이 눈금으로 옮겨 쓴다 — 같은 다리 힘이면 같은 높이 (fall/engine.ts 와 같은 수법)
 */
export const BAR_GRAVITY = 9.8;
export const BAR_JUMP_SCALE = Math.sqrt(BAR_GRAVITY / GRAVITY);
/** 무대 위 걷기 · 달리기(Shift) 속도(m/s). 서버가 이 상한으로 자른다 */
export const BAR_WALK_SPEED = WALK_SPEED;
export const BAR_RUN_SPEED = 4.8;
/** 시작할 때 서는 반지름(m) — 전원이 이 고리에 같은 간격으로 선다 */
export const BAR_STAND_R = 3.2;
/** 봉에 맞으면 이만큼(ms) 누워 있다 — 그동안 봉은 몸 위를 지나간다 */
export const BAR_DOWN_MS = 1600;
/** 맞는 순간 봉이 쓸어 가는 방향으로 얹히는 속도(m/s) — 미끄러운 구간에는 이게 가장자리까지 간다 */
export const BAR_SHOVE = 2.6;
/** 떨어진 뒤 다시 올라오기까지(ms) · 다시 서는 반지름(m) */
export const BAR_RESPAWN_MS = 2500;
export const BAR_RESPAWN_R = 3.2;
/** 서버 물리 틱과 스냅샷 주기(ms) — 회전 원판과 같다 */
export const BAR_TICK_MS = 50;
export const BAR_SNAPSHOT_MS = 100;
export const BAR_WALK_STALE_MS = 1500;


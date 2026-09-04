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
 * 월드 경계 (월드 단위 ≈ m). src/world/map/warehouse.tsx 의 창고 치수와 같은 좌표계다
 * (거기 ROOM 을 0.6 인셋한 값). x는 좌우, z는 앞뒤(-가 스크린 쪽), y는 바닥에서의 높이.
 * 서버가 이 범위로 검증하므로 씬을 넓히면 여기부터 고친다.
 */
export const WORLD = {
  minX: -10.4,
  maxX: 10.4,
  minZ: -13.4,
  maxZ: 5.4,
  /** 발 높이 상한. 가장 높은 발판(장비 케이스 1.3) + 점프(≈1.05)보다 넉넉히 위 */
  maxY: 4,
} as const;

/** 서버 검증 여유. 경계에서 클라 충돌 처리가 0.1쯤 튀는 걸 매번 거절하면 그 사람만 멈춘다. */
export const POS_MARGIN = 2;

/** 벽 안쪽 여유. WORLD 는 창고 벽(warehouse.tsx 의 ROOM)에서 이만큼 안으로 들인 값이다. */
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
/** WS 메시지 크기 상한. */
export const MAX_WS_MESSAGE_LEN = 4 * 1024;

/** 방 정원. 좌석 원(spawnFor)도 이 수로 나눈다 — 워커와 클라이언트가 반드시 같아야 한다. */
export const ROOM_MAX_PLAYERS = 9;

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
 * 낮추면 소파 윗면(0.99)에 못 올라간다.
 */
export const JUMP_SPEED = 5.6;
export const GRAVITY = 15;
export const JUMP_MAX_Y = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY);

/** 이모트(키 1·2) 길이(ms). 아바타 클립 길이이자 anim 이 idle 로 돌아오는 시각이다 — 양쪽이 같이 본다. */
export const EMOTE_MS = {
  angry: 2400,
  agree: 1800,
  /** 가리킨 팔은 조금 오래 머문다 — 그 팔이 곧 「저 개체다」라는 말이라 한 박자 보여야 한다 */
  point: 2200,
  deny: 2000,
  shrug: 1600,
  /** 움찔은 짧다. 길면 놀란 것이 아니라 겁먹은 자세가 된다 */
  flinch: 900,
  /** 물러서는 한 발 — 브리핑 안에서 끝나야 한다. 카운트다운이 시작될 때까지 끌면 판이 안 돈다 */
  back: 1400,
} as const;

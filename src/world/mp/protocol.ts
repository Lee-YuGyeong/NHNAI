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

import type { BodyId } from './bodies';
export type { BodyId } from './bodies';

/**
 * 아바타 애니메이션 상태. 서버가 화이트리스트로 검증한다. 공중인지는 `y > 0`으로 판단한다.
 * 'run' 은 검문소의 달리기(Shift+W, 2026-09-04) — 규칙 2 대로 값만 추가했다. 옛 워커는 이 값을 흘린다(validate 의 화이트리스트).
 */
export type AnimState = 'idle' | 'walk' | 'run' | EmoteState;

export const ANIM_STATES: readonly AnimState[] = ['idle', 'walk', 'run', 'angry', 'agree'];

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
  /**
   * 이 사람의 몸 — 군인 넷 가운데 하나 (mp/bodies.ts). 서버가 입장 때 **방 안에서 겹치지 않게** 뽑는다.
   * 규칙 2 대로 추가만 하는 필드 — 없으면(옛 워커) 클라는 로봇 몸을 그린다.
   */
  body?: BodyId;
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
  | { t: 'trial_brake' }
  /**
   * 색 사냥: 구슬을 줍는다(E). 어느 구슬인지는 클라가 고르지만 거리 · 쿨다운 · 정오는 전부 서버가
   * 판정한다(worker/src/trial/colorhunt/engine.ts). 정오는 본인에게도 실시간으로 알려 주지 않는다 —
   * 전원이 기록 공개에서 처음 안다 (docs/COLORHUNT.md §6).
   */
  | { t: 'trial_pick'; objectId: number }
  /**
   * 회전 원판: 걷기 입력 — **월드 기준** 속도 벡터(m/s). 바뀔 때만 10Hz 로 보내고, 손을 떼면 (0, 0) 을 보낸다.
   * 자리는 싣지 않는다 — 원판이 사람을 실어 나르고 미끄러뜨리는 것은 서버가 적분한다(worker/src/trial/disc/engine.ts).
   * 크기는 서버가 DISC_RUN_SPEED 로 자른다 (규칙 4: 위조돼도 「빨리 걷기」 이상이 안 된다).
   */
  | { t: 'trial_walk'; x: number; z: number }
  /**
   * 낙하 생존: Space 를 눌렀다. **자기 몸의 높이는 서버가 적분한다** — 높이가 피격 판정 대상이라 y 를 만드는
   * 쪽도 서버여야 하기 때문이다(fall/engine.ts 머리말). 클라는 「눌렀다」만 올리고 y 는 스냅샷으로 돌려받는다
   * (회전 원판이 걷기 명령만 올리는 것과 같은 수법). 시각은 서버가 수신 시점으로 찍는다
   */
  | { t: 'trial_jump' }
  /**
   * 무너지는 타워: 밀친다(Space). 방향은 카메라가 보는 쪽(월드 단위 벡터) — 서 있는 몸의 「앞」은 서버가 모른다. 누구를 미는지 · 얼마나
   * 미는지는 서버가 정한다(worker/src/trial/tower/engine.ts onPush — 거리 · 질량비 · 쿨다운)
   */
  | { t: 'trial_push'; hx: number; hz: number };

/**
 * 접속이 끊기는 이유.
 * 'kicked' 만 **들어온 뒤에** 오는 값이다 — 나머지는 입장 자체가 거절된 것이다.
 * 'banned' 는 내보내진 **계정**이 같은 방 문 앞에 다시 섰을 때다 (room-do.ts 의 밴 명부).
 * 게스트는 이 값을 받을 일이 없다 — 계정이 없으면 명부에 적히지도 않는다.
 */
export type ErrorCode = 'version_mismatch' | 'room_full' | 'bad_request' | 'kicked' | 'banned';

/**
 * 물리 미니게임의 식별자. 'platform' 은 움직이는 플랫폼(2026-09-05, mp/platform.ts) — 넷째 게임.
 * 'seesaw' 는 무게 중심 다리(2026-09-05, worker/src/trial/seesaw/) — 여섯째, 검문소 차례표 후보에도 든다.
 * 'tower' 는 무너지는 타워 생존(2026-09-05, worker/src/trial/tower/) — 일곱째. /trial 에서만 열린다
 */
export type TrialGame = 'stopline' | 'colorhunt' | 'fall' | 'platform' | 'disc' | 'seesaw' | 'tower';

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

/**
 * 색 사냥 — 구슬 하나의 **겉보기**. `c` 는 지금 조명 아래의 표시색(#rrggbb)이고, 서버가 곱셈
 * (조명 × 반사율)을 끝낸 결과다. 진짜 색(반사율)과 차단 파장은 서버에만 있다 (P8,
 * worker/src/trial/colorhunt/palette.ts) — 콘솔을 파도 화면에 보이는 것 이상이 나오지 않는다.
 */
export interface ColorOrb {
  id: number;
  x: number;
  z: number;
  c: string;
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
  /**
   * 새 라운드. pace 는 움직이는 플랫폼의 발판 배속(mp/platform.ts) — 눈에 보이는 값이라 숨기지 않는다(P8 의 비밀은 아니다).
   * 클라가 발판 자리를 서버와 같은 함수로 그려야 착지 판정이 화면과 맞는다. 규칙 2 대로 추가만 하는 필드
   */
  | { t: 'trial_round_start'; game: TrialGame; round: number; startAt: number; durationMs?: number; pace?: number }
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
  | {
      t: 'trial_snapshot';
      at: number;
      objects: { id: number; k: number; x: number; y: number; z: number }[];
      /**
       * 서버가 움직이는 좌석들. `h` 는 **몸이 보는 쪽**(heading, rad) — 있으면 그대로 쓰고, 없으면
       * 예전처럼 이동 방향에서 뽑는다. 토론 중 배회하는 대역이 **몸을 안 돌리고 물러설 때**만 실린다:
       * 이동 방향에서 뽑으면 뒤로 걷는 몸이 앞으로 걷는 것으로 그려진다 (docs/SUSPICION.md 「봇도 굳고 뒤로 걷는다」).
       */
      ai: { id: string; x: number; z: number; y?: number; h?: number }[];
      /**
       * 낙하 생존 — **공중에 뜬 몸의 발 높이**(사람 · AI 좌석 모두). 서버가 적분한 값이다.
       * 땅에 있는 사람은 안 실린다(= 0). 와이어에는 결과(높이)만 나간다
       */
      air?: { id: string; y: number }[];
    }
  /**
   * 움직이는 플랫폼 — 누가 착지했다(또는 놓쳤다). 화면의 「정중앙!」 같은 피드백용이고 판정은 서버가 이미 했다.
   * center 는 발판 중앙(PAD_CENTER_R) 안, missed 는 발판을 놓쳐 바닥에 떨어진 것. 오차 거리는 안 실린다 — 기록(trial_result)에만
   */
  | { t: 'trial_landed'; id: string; pad: number; center: boolean; missed: boolean }
  /**
   * 움직이는 플랫폼 — 착지한 발이 밀렸다. `vx`·`vz` 는 **발판에 대한** 미끄러짐 속도(m/s), `ms` 는 0 까지
   * 선형으로 잦아드는 시간. 발판 윗면의 마찰계수는 안 실린다(P8) — 서버가 곱셈을 끝낸 결과만 온다
   * (색 사냥이 반사율 대신 표시색만 내려보내는 것과 같다). 클라는 제 몸을 그만큼 민다(FreeRig)
   */
  | { t: 'trial_slip'; id: string; vx: number; vz: number; ms: number }
  /** 낙하물에 맞았다 — 맞은 사람 화면의 연출용. 기록은 서버가 이미 했다 */
  | { t: 'trial_hit'; id: string; objectId: number }
  /**
   * 색 사냥 — 판이 열렸거나 조명이 바뀌었다(전체 동기화). 구슬 · 견본판 전부 **표시색**만 온다(P8).
   * `light` 는 방을 물들일 조명색(연출용), `target` 은 목표색의 **이름**, `targetHex` 는 그 색의
   * 기준광 원색(HUD 스와치용 — 지시문에 이름이 그대로 적히므로 비밀이 아니다).
   */
  | { t: 'trial_colorhunt'; at: number; light: string; target: string; targetHex: string; orbs: ColorOrb[]; board: { name: string; c: string }[] }
  /** 색 사냥 — 누가 구슬을 주웠다. 그 구슬은 화면에서 사라진다. 맞았는지는 안 실린다 — 전원이 기록 공개에서 처음 안다 */
  | { t: 'trial_picked'; id: string; objectId: number }
  /** 색 사냥 — 주워진 자리 근처에 같은 색이 다시 돋았다 (색 분포 유지, docs/COLORHUNT.md §6) */
  | { t: 'trial_orb'; orb: ColorOrb }
  /**
   * 회전 원판 — 서버 물리 스냅샷(~10Hz). `theta` 는 원판의 회전각(rad, +y 축), `omega` 는 각속도(rad/s) — 클라는 다음
   * 스냅샷까지 이 둘로 원판을 돌린다. `players` 는 **실제 사람과 AI 좌석 전부**의 월드 자리다 — 이 게임은 사람의 자리도
   * 서버가 적분하므로 player_moved 가 아니라 여기로 온다. `s` 는 그 사람의 미끄러짐 속도(원판 기준, m/s) — 자기 몸의
   * 예측에만 쓴다. 마찰계수는 없다(P8) — 미끄러진 결과만 온다. `f` 는 떨어진 상태(1) · `m` 은 걷기(1) · 달리기(2).
   */
  | {
      t: 'trial_disc';
      at: number;
      theta: number;
      omega: number;
      players: { id: string; x: number; z: number; y: number; h: number; m: number; f: number; sx: number; sz: number }[];
    }
  /** 회전 원판 · 무게 중심 다리 · 무너지는 타워 — 누가 떨어졌다. 떨어진 사람 화면의 연출용. 기록은 서버가 이미 했다 */
  | { t: 'trial_fell'; id: string }
  /**
   * 무게 중심 다리 — 서버 물리 스냅샷(~10Hz). `phi` 는 판자의 기울기(rad, x 축 둘레, +u 끝이 올라가면 양수), `omega` 는 각속도 —
   * 클라는 다음 스냅샷까지 이 둘로 판자를 기울인다. `players` 는 **판자 좌표**다: `u` 는 축에서 길이 방향(m), `v` 는 폭 방향(m).
   * 사람의 자리도 서버가 적분하므로 여기로 온다(회전 원판과 같다). `s` 는 길이 방향 미끄러짐 속도(m/s) — 자기 몸의 예측에만 쓴다.
   * 마찰계수는 없다(P8). `f` 는 떨어진 상태(1) · `m` 은 걷기(1) · 달리기(2) · `h` 는 몸이 보는 방향(월드).
   * `crates` 는 판 위 화물 — `at` 은 판에 **닿는** 시각(서버 시각). 그 전이면 아직 크레인에서 내려오는 중이다
   */
  | {
      t: 'trial_seesaw';
      at: number;
      phi: number;
      omega: number;
      players: { id: string; u: number; v: number; h: number; m: number; f: number; s: number }[];
      crates: { id: number; u: number; v: number; at: number }[];
    }
  /**
   * 무너지는 타워 — 서버 물리 스냅샷(~10Hz). `slabs` 는 아직 있는 발판(없는 것은 안 실린다): 번호 `i`, 기울기 벡터 `tx · tz`(낮은 쪽, tan),
   * 상태 `s`(0 성함 · 1 경고 · 2 떨어지는 중)와 그 상태가 된 시각 `at`. `players` 는 전원의 월드 자리(사람의 자리도 서버가 적분한다):
   * `y` 는 발 높이, `f` 는 0 서 있음 · 1 떨어지는 중 · 2 바닥에 누움, `m` 은 걷기(1) · 달리기(2), `h` 는 보는 방향,
   * `sx · sz` 는 미끄러짐·밀림 속도(자기 몸의 예측용). 마찰계수는 없다(P8)
   */
  | {
      t: 'trial_tower';
      at: number;
      slabs: { i: number; tx: number; tz: number; s: number; at: number }[];
      players: { id: string; x: number; z: number; y: number; h: number; m: number; f: number; sx: number; sz: number }[];
    }
  | { t: 'trial_result'; result: TrialResultWire }
  /** (재)입장 시 지금까지의 전체 기록을 백필한다 — 로그 탭은 이걸로 채운다 */
  | { t: 'trial_history'; results: TrialResultWire[] };

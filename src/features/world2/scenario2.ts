/**
 * 시나리오 2 — **짓지 않은 방들.** 본판(「게임 시작 테스트」)과 한 줄도 안 겹치는 두 번째 판이다.
 *
 * 방 구조는 「짓지 않은 방들」(레벨 설계 v3), 대사는 「쉬어 본 적 있나」(대본 전문 v8)를 따른다.
 * 문장은 여기 없다 — 전부 script.ts 에 있고, 이 파일은 **언제 나오는지**만 정한다.
 *
 *   복도        벽화 다섯 장이 **어휘**가 된다. 여기서 본 것만이 뒤에서 쓸 말이 된다 (lexicon.ts)
 *               정비 명판에 이 몸의 번호와 구역이 있다. 안 읽고 지나가면 안쪽에서 진짜로 모른다
 *               개체 넷이 서 있고, **그 중 둘은 사람일 수도 있다** — 암구호는 이 구역에서 배워야 한다
 *   휴게 구역    이 게임이 지키려는 것을 처음 보여준다. 문이 90 초 동안 안 열린다 — 과제는 아무것도 하지 않기다
 *   중앙 시설    **국면 셋** — 밝음(자리 선택 · 재회 · 소문 · 콘솔) → 락다운(자리 고정 · 검문 셋) → 어둠(코어 앞 · 2 분 뒤 문 ②).
 *               한 번만 지난다. 국면은 central2.ts 가 쥐고, 배율 · 반경 · 비용은 전부 corefield.ts 한 곳에 있다 — 여기 숫자를 다시 적지 않는다
 *   작업 구역    벽화 danger 가 그린 일이 눈앞에서 일어난다. 8 초 안에 막을지 정한다
 *   기록 복도    벽화가 수백 장인 곳. 대사가 없다. 속마음 한 줄만 허락한다
 *   창이 있는 방  리더의 자리. 30 초짜리 정적 — 밖을 본 것이 먼저 와 있다
 *   마지막 방    **이미 있는 검문소 아레나**(/interrogation)를 그대로 연다
 *
 * 계량기는 둘이다: 나를 향한 **의심도**(본판 것을 그대로 읽는다)와 판 전체의 **경보도**(alert.ts). SYNC 는 없다.
 * 친밀도는 숫자로 안 띄운다 — 태도 네 단계로만 드러난다 (units.ts).
 *
 * ★ 본판의 이야기 엔진(chapter1·2·3)을 **부르지도 읽지도 않는다.** 저쪽 저장소를 건드리면 두 판이 서로를 망가뜨린다.
 *   공유하는 것은 몸과 방을 그리는 것들(world/*)뿐이고, 그건 읽기만 한다.
 * ★ 갈래만 정하는 판정(누구를 세우나 · 검문의 답이 어느 쪽인가 · 서성였나)은 gates.ts 에 부작용 없이 두었다 — 시험이 숫자로 돌린다.
 * ★ **나에게 일어나는 일의 시계는 조작권부터다** (2026-09-03 사용자: 「대사가 내가 아무것도 안 했는데 트리거가 지혼자 발생한다」).
 *   방의 첫마디(INTRO · *_ARRIVE)만 들어서는 순간 나오고, 저쪽이 먼저 거는 말 · 소문 · 엿듣기 · 휴게의 6 초 · 90 초 · 소각로의 폴백 ·
 *   중앙 시설의 90 초 락다운 · 창이 있는 방의 30 초는 전부 포인터 잠금이나 첫 걸음(afterControl · control) 뒤에야 센다.
 *   자리로 켜지는 것(꺾임 · 구석 · 코어권 · 그늘)은 **이번 방의 카메라**가 준 자리만 본다 — 앞 방의 마지막 프레임이 새 방의 문턱 · 코어권으로 읽히던 것을 거른다(settled).
 *   그리고 한 벌의 줄이 흐르는 동안 다른 벌이 끼어들지 않는다(play 가 busyUntil 뒤에 세운다) — 창이 열려 있으면 SYSTEM 방송 말고는 그 뒤다.
 */

import { lineDurationFor } from '@/features/world/DialogueBox';
import { probe } from '@/features/world/probe';
import { gunshot } from '@/features/world/sfx';
import { markLive, resetLive, voiceLines } from '@/features/world/voice';
import type { ScrawlKind } from '@/features/world/scrawl';
import type { PortraitKind } from '@/features/world/worldSlice';
import { identity } from '@/world/mp/identity';
import { watchJump } from '@/world/mp/sensor';
import { suspicion, THRESHOLD_LINES as SUSPICION_LINES, type Reason } from '@/world/mp/suspicion';
import { SPAWN2 } from '@/world2/map';
import { ARCHIVE_EXIT, archiveAtExit } from '@/world2/map/archive';
import { CENTRAL2_CONSOLE, CENTRAL2_DOORS, REUNION_SLOTS, SEED_SLOTS, central2AtExit } from '@/world2/map/central2';
import { CORRIDOR2_EXIT, CORRIDOR2_PATH, corridor2AtExit } from '@/world2/map/corridor';
import { EXIT_DOOR_WAKE_M, exitDoor } from '@/world2/map/exitDoor';
import { REST, REST_DOZE_SPOT, REST_EXIT_Z } from '@/world2/map/rest';
import { WORK_012_SPOT, WORK_063_SPOT, WORK_EXIT, workAtExit } from '@/world2/map/work';
import { WINDOW_EXIT_Z, WINDOW_ROOM } from '@/world2/map/window';

import { ADDRESS_GAP_MS, address, cast, type AddressOpts } from './address';
import { alert, THRESHOLD_LINES as ALERT_LINES } from './alert';
import { archiveScene } from './archiveScene';
import { bubble } from './bubbles';
import { ATTEND_REPLY_MS, ATTEND_TALK_MS, attitude } from './attitude';
import type { Look } from './cast';
import { CORE_LOCK_MS, central2, gateMs } from './central2';
import {
  CONSOLE,
  CORE_READ_SUSPICION,
  DARK,
  DEATH_ALERT,
  STARE_MS,
  FIELD,
  FURNACE,
  INTERVENE_R,
  LOCKDOWN,
  reachCount,
  SHADOW_LINGER,
  type Vec2,
  type Zone,
  witnessRadius,
  witnessesWithin,
  zone,
} from './corefield';
import { corridor, type Host } from './corridor';
import { execution } from './execution';
import { fragments, SPREAD_MS } from './fragments';
import { furnace } from './furnace';
import { classifyFear, controlGate, distToCore, facingToward, gradeMemory, gradeRoll, nearestPoint, nearestWithin, pickSlots, rumorLine, stirDetector, type RollGrade } from './gates';
import { handover } from './handover';
import { hints } from './hints';
import { lexicon } from './lexicon';
import { openers } from './openers';
import { overhear } from './overhear';
import { patrol } from './patrol';
import { read } from './read';
import { resetSay, sayAvailable, world2Say } from './say';
import { sayExtras } from './sayfields';
import {
  ARRIVE_WORK,
  ARRIVE_WORK_012,
  ARRIVE_WORK_063,
  BANNER_ARCHIVE,
  BANNER_WORK,
  BODY_BLOCK,
  BODY_BLOCK_UNIT,
  CENTRAL2_ARRIVE,
  CENTRAL2_KNOWN_FACE,
  CORE_RING_ENTER,
  CORE_RING_ENVY,
  CORE_RING_NEW_BODY,
  COVER_PAUSE,
  COVER_REPLY,
  COVER_SAY,
  COVER_SAY2,
  DARK_CONSOLE_EARLIER,
  DARK_CONSOLE_NOW,
  DARK_CORE,
  DIM_HERE,
  DISMISS,
  DOZE_LINES,
  DOZE_REPLY,
  EXEC_60,
  EXEC_80,
  EXEC_ARRIVE,
  EXEC_END,
  EXEC_KNOWN,
  EXEC_OVER,
  EXEC_SORRY,
  EXEC_STAND_IN,
  EXEC_START,
  GATE1,
  GATE2,
  GATE2_ASK,
  GATE3,
  GATE3_LINES,
  HOLD_BREACH_HALT,
  HOLD_BREACH_LINES,
  HOLD_BREAK,
  HOLD_CHECK_ASK,
  INTRO,
  LEAVE_CORE_LINES,
  LEAVE_REST,
  LEAVE_SEE_YOU,
  LOCK_ALONE,
  LOCK_BESIDE,
  LOCK_STAY_CALM,
  LOCKDOWN_LINES,
  NOBODY_KNOWS_ME,
  NOTICE_SIGNAL,
  OBJ_CROSS_HALL,
  OBJ_FEAR,
  OBJ_HIDE,
  OBJ_HOLD,
  OBJ_INSPECT,
  OBJ_INSPECT_WALL,
  OBJ_MEMORY,
  OBJ_MEMORY_UNKNOWN,
  OBJ_MOVE_IN,
  OBJ_QUEUE,
  OBJ_REST_ARRIVE,
  OBJ_REST_NONE,
  OBJ_ROLL,
  OBJ_ROLL_UNKNOWN,
  OBJ_WAIT_DARK,
  OBJ_WORK,
  PROTOCOL_LINES,
  PROTOCOL_LOOKED,
  RECOGNIZED_DOWN,
  RECOGNIZED_DOWN_ASIDE,
  RECOGNIZED_FLAT,
  RECOGNIZED_UP,
  RECOGNIZED_UP_AGAIN,
  REST_ARRIVE,
  REST_LINGER,
  REST_SEER,
  REST_STILL,
  REST_STILL_40,
  REST_STIR,
  REST_WATCHED,
  ROLL_LINES,
  RUMOR_LINES,
  RUMOR_MINE,
  SCRAWL_LINES,
  SHADOW_ENTER,
  SHADOW_LINGER_SAY,
  SPEAKER,
  STAND_IN_SAY,
  TAG_LINES,
  VERDICT_DIM_LINES,
  WINDOW_ARRIVE,
  WINDOW_GO,
  WINDOW_SEER,
  WINDOW_SUMMON,
  type CastLine,
  type Line,
  OBJ_WINDOW_GO,
  OBJ_WINDOW_WAIT,
} from './script';
import { talk, type TalkResult } from './talk';
import { units } from './units';

/**
 * 방 여섯. `central2` 는 **중앙 시설** — 전체 흐름도 v2 가 휴게와 작업 사이에 새로 넣은 한 방이다.
 * 한 번만 지나되 그 안에서 국면이 셋(밝음 → 락다운 → 어둠)으로 갈린다 (features/world2/central2.ts).
 */
export type Room = 'corridor' | 'rest' | 'central2' | 'work' | 'archive' | 'window';

/** 걸어가는 순서. 마지막 방(아레나)은 라우트가 다르므로 이 목록에 없다 */
export const ORDER: readonly Room[] = ['corridor', 'rest', 'central2', 'work', 'archive', 'window'];

export const ROOM_TITLE: Record<Room, string> = {
  corridor: '복도',
  rest: '휴게 구역',
  work: '작업 구역',
  archive: '기록 복도',
  window: '창이 있는 방',
  central2: '중앙 시설',
};

/** 들어설 때 뜨는 배너 — 대본이 장 번호를 단 방은 그 글자 그대로(CHAPTER 1 · 잠입 / 2 · 휴게 / 3 · 중앙 시설 / 4 · 작업 / 6 · 기록). 창이 있는 방만 이름 */
export const ROOM_BANNER: Record<Room, string> = {
  ...ROOM_TITLE,
  corridor: 'CHAPTER 1 · 잠입',
  rest: 'CHAPTER 2 · 휴게',
  central2: 'CHAPTER 3 · 중앙 시설',
  work: BANNER_WORK,
  archive: BANNER_ARCHIVE,
};

/**
 * 그 방에 서 있는 것들 — **조각은 여기 있는 것들에게만 남는다** (목격자를 만들지 않는 것이 은폐다).
 * 복도의 넷 중 둘은 사람이다. 겉으로는 구별이 안 된다 (units.ts 의 agent).
 */
/**
 * 그 방에 서 있는 것들. **자리는 Room2Scene 이 정하고, 거기서 서로 6 m 이상 떨어져 있어야 한다** —
 * 레벨 설계 05: 「한 개체에게 건 말이 옆으로 안 새게」. 반경이 겹치면 내가 누구에게 말한 건지 판이 못 정한다.
 * (tests/features/world2 가 이 간격을 검사한다.)
 */
export const ROOM_UNITS: Record<Room, readonly string[]> = {
  /*
   * 다섯이다 (레벨 설계 05). 서 있는 넷은 딱 6 m 씩 떨어져 있고, 다섯째는 **순찰**이라 서지 않는다 —
   * 걷는 동안에는 말 걸기 대상이 아니고(patrol.ts), 그래서 반경이 겹칠 일도 없다.
   * 넷 중 하나는 **사람**이고 겉으로는 구별이 안 된다.
   */
  /*
   * 복도에는 **총 든 것이 없다** (2026-09-03 사용자). 첫 방은 배우는 방이라 순찰도 집행도 없다 —
   * 레벨 설계가 적어 둔 UNIT-21 의 40 초 왕복은 여기서 빼고, 그 개체는 안쪽(작업 · 중앙 시설)에서 처음 만난다.
   */
  corridor: ['u104', 'u137', 'u089', 'ally-timid'],
  // 12 × 14 m 에 6 m 격자로 들어가는 것은 **다섯**이다 — 네 귀퉁이와 한가운데. 갈망형(u104)은 구석에서 잔다 — 명부엔 있지만 대답하지 않는다 (REST_SLEEPER).
  // 레벨 설계 휴게 고정 배역 A-104 · A-201. 손끝(u118)은 여기 없다 — 카드의 길이 복도 → 중앙 → 줄이라 중앙 시설에 서 있다
  /*
   * 명부는 **이름 있는 다섯뿐**이다 — 벽을 따라 선 배경 열여섯(Room2Scene 의 REST_CROWD)은 여기 안 올린다.
   * 명부는 「말이 누구에게 가고 누가 그 값을 치르나」의 목록이라 배경이 끼면 곁 판정 · 개입 · 목격이 전부 흐려진다
   * (시험이 그 규칙을 쥔다: 「배경 개체만 명부에 없다」). 배경은 **보이기만 한다** — 그게 군중이다
   */
  rest: ['u104', 'u089', 'u201', 'seer', 'ally-hard'],
  // 불로 걸어 들어가는 것은 **열하루째**(A-201)다 — 휴게에서 서성이던 그 개체가 여기 서 있다 (대본 THE_FURNACE). 라인을 나르던 배경 둘은 걷어냈다 (Room2Scene)
  work: ['u012', 'u063', 'u201', 'guard21'],
  // 대사가 하나도 없는 방 — 벽화를 그린 개체 하나만 자기 그림 앞을 오간다
  archive: ['u137'],
  // 4 × 4 m. 리더와 나 — 그리고 창을 찾은 밖을 본 것 (대본 v8 WINDOW_ROOM). 6 m 규칙이 이 방에서만 일부러 깨진다 (Room2Scene)
  window: ['leader', 'seer'],
  /*
   * 중앙 시설 지름 26 m — 고정은 순찰(UNIT-21)과 검문 앞줄 둘(A-044 · A-128, 배경이지만 번호를 대는 것들).
   * **재회 슬롯 둘과 씨앗 슬롯 둘은 여기 없다** — 복도·휴게에서 원장이 생긴 개체를 enterRoom 이 골라
   * `state.extra` 에 세운다 (레벨 설계 07 · 원칙 6 「방을 두 번 짓지 않고 개체를 옮겨 온다」). 명부는 roster() 가 합쳐 준다.
   * 손끝(u118)은 고정이다 — 휴게에서 못 쉬고 먼저 와서 홀에 서 있다(카드의 길: 복도 → 중앙 → 줄). 자리는 Room2Scene 의 CENTRAL2_HALL_POST
   */
  // 홀의 배경 다섯과 옆문의 총 든 둘 (2026-09-03) — 자리는 Room2Scene PLACES.central2
  central2: ['guard21', 'bg-c2-044', 'bg-c2-128', 'u118', 'bg-c2-061', 'bg-c2-093', 'bg-c2-152', 'bg-c2-207', 'bg-c2-215', 'guard22', 'guard23'],
};

/**
 * 명부에는 **없지만 말은 걸 수 있는** 것들 — 휴게 구역의 벽을 따라 선 열여섯.
 *
 * 2026-09-03 사용자: 「왜 시나리오2에서 복도를 제외하고 다른객체한테 왜 말할수없지?」
 * 휴게는 몸이 스물한 구인데 말이 걸리는 것이 셋뿐이었다 — 열여섯이 자리표(Room2Scene 의 REST_CROWD)에만 있고
 * 명부에도 화자표에도 없어서 곁 판정 루프에 **아예 안 들어왔다.**
 *
 * 답은 「명부에 올린다」가 **아니다.** 명부(ROOM_UNITS)는 「누가 그 값을 치르나」의 목록이고 —
 * 목격자(witnessesNow) · 개입 후보(interveners) · 태도 규칙 · 도주 · 대신 나섬 · 조각이 전부 그것만 본다 —
 * 열여섯을 거기 끼우면 휴게에서 한 마디의 조각 대상이 5 에서 21 로 뛰고(ROOM_RADIUS.rest 가 Infinity 다),
 * patrol 의 named 가 켜져 자리 간격이 3.2 → 6 m 로 올라 3.6 m 자리표가 통째로 위반이 되고, 시험 넷이 깨진다.
 *
 * 그래서 목록을 **둘로 가른다.** 이 갈라짐이 이번 변경의 뼈대다:
 *   roster(room)      값을 치르는 목록 — 한 줄도 안 늘린다
 *   addressable(room) 말이 걸리는 목록 — roster + 여기. 곁 판정(near)과 조준(aim)만 이것을 본다
 */
export const CROWD_UNITS: Record<Room, readonly string[]> = {
  corridor: [],
  rest: Array.from({ length: 16 }, (_, i) => `bg-rest-${i + 1}`),
  work: [],
  archive: [],
  window: [],
  central2: [],
};

export interface Scene2State {
  room: Room;
  objective: string | null;
  banner: string | null;
  blackout: number;
  /**
   * 도화선이 달린 물음 — 남겨 둔 판이다. 소각로는 이제 이걸 안 쓴다(D11: 「8초 동안 목표가 안 뜬다」 — 판을 띄우면 그 8 초가 죽는다).
   * 도화선 폭은 endsAt 으로 잰다 — 8000 을 하드코딩하지 않는다.
   */
  urgent: { title: string; hint: string; yes: string; no: string; endsAt: number } | null;
  /**
   * 갈림 — 도화선 없는 물음 ([E]/[Q]). 격납문 앞의 DOOR_CHOICE 가 첫 쓰임이다 (D8).
   * 무엇을 하는지는 물은 쪽이 콜백으로 들고 있다 — 화면은 글자와 키만 안다.
   */
  choice: { title: string; yes: string; no: string; onYes: () => void; onNo: () => void } | null;
  /** 화면 공지 — 무음, 글자만. 「EXTERNAL SIGNAL DETECTED」가 인트로 22 초 뒤 1.8 초 (대본 INTRO). until 이 지나면 화면이 지운다 */
  notice: { text: string; until: number } | null;
  /** 과학자가 그 계량기를 설명하는 동안 — Hud2 가 그 줄을 빛낸다 (본판 chapter1.highlight 와 같은 장치) */
  highlight: 'suspicion' | 'alert' | null;
  /**
   * 가만히 있기 / 작업 주기 / 스캔 — 채워야 하는 초와 채운 초. `label` 이 막대의 이름이다:
   * 없으면 「가만히」(휴게), 작업 구역은 「작업」(D14), 스캔은 「가만히」(G17). 숫자는 초뿐이다 — 태도 숫자는 어디에도 안 뜬다
   */
  stillness: { need: number; got: number; label?: string } | null;
  /** 지금 곁에 있는 상대와 그 거리(m) — 말을 걸면 이 개체가 대답한다 */
  near: { id: string; dist: number } | null;
  /**
   * 지금 **겨눈** 몸과 그 거리(m) — 화면 중앙 원뿔(AIM_CONE_DEG)에 물린 하나. **걷는 몸도 든다.**
   *
   * near 와 다르다: near 는 「보내면 듣는 것」이고 aim 은 「[E] 를 누르면 붙잡을 것」이다.
   * 화면(Hud2)이 이 값 하나로 [E] 한 줄을 그린다 — 이름표도, 주변 목록도 안 그린다
   * (「곁에 누가 있는지 화면이 대신 짚어 주지 않는다」는 원칙과 타협한 자리라 그 한 줄이 전부다).
   */
  aim: { id: string; dist: number } | null;
  /**
   * 입력줄이 열려 있나. **누구에게 거는지는 여기 안 적는다** — 칠 때가 아니라 **보낼 때** 곁에 있는 것이 듣는다
   * (2026-09-02 사용자: 「막 UI 띄워서 얘기하거나 그러지 마」). 상대를 먼저 고르는 게 아니라, 말하면 들리는 것이다.
   */
  talking: boolean;
  done: boolean;
  /**
   * 이 방에 **이야기가 더 세운 것들** — 중앙 시설의 재회·씨앗 슬롯. 자리표(Room2Scene 의 PLACES)는 고정이고
   * 슬롯은 판마다 다르므로 여기서 넘긴다. 다른 방에서는 비어 있다. 빈 슬롯을 채운 배경 개체는 열에 없어서 `look` 을 같이 든다.
   */
  extra: readonly { id: string; x: number; z: number; heading?: number; look?: Look }[];
  /** 코어 출력 콘솔 앞에 서서 보고 있나 — Console2 가 프레임마다 적는다. [E] 가 이걸 본다 */
  consoleNear: boolean;
  /**
   * 개체가 말을 걸고 **답을 기다리는 창** (address.ts) — 화면은 목표의 힌트 줄과 가늘게 줄어드는 막대로만 안다. 숫자는 없다.
   * paused 는 치는 동안 멈춘 채 남은 ms. null 이면 창이 없다
   */
  answer: { until: number; span: number; paused: number | null } | null;
}

/**
 * portrait 이 없는 내 줄은 대화창 상자가 아니라 왼쪽 아래 대화 로그(TalkLog)로 간다 — 본판 sendChat 과 같은 꼴.
 * bubble 이 있는 줄은 **내가 걸어서 저쪽이 답한 것** — 그 개체(bubble = id)의 머리 위 말풍선과 왼쪽 아래 로그로 가고, 상자에는 안 뜬다
 */
type Emit = (line: { nickname: string; text: string; portrait?: PortraitKind; self: boolean; thought?: boolean; bubble?: string; quiet?: boolean }) => void;

const state: Scene2State = {
  room: 'corridor',
  objective: null,
  banner: null,
  blackout: 0,
  urgent: null,
  choice: null,
  notice: null,
  highlight: null,
  stillness: null,
  near: null,
  aim: null,
  talking: false,
  done: false,
  extra: [],
  consoleNear: false,
  answer: null,
};

const listeners = new Set<() => void>();
let emit: Emit | null = null;
let onRoom: ((room: Room) => void) | null = null;
let onArena: (() => void) | null = null;

/**
 * 걸어 둔 일들 — **줄(line)과 연출(cue)을 갈라 둔다.** 대화를 스킵할 때 아직 안 나온 **줄만** 앞당기고,
 * 방을 옮기거나 목표를 바꾸는 연출은 제 시각에 그대로 둔다: 한 번 누른 것으로 마지막 방까지 가 버리면 안 된다.
 */
const timers: { id: number; fn: () => void; kind: 'line' | 'cue' }[] = [];
let spreadTimer = 0;
let roomAt = 0;
/** 이번 방에서 이미 한 일들 — 같은 연출이 두 번 돌지 않게. 방을 옮기면 비운다 */
const fired = new Set<string>();
/**
 * **판당 한 번**인 것들 — FIRST_LOOK · NOTICE · WATCH · 「아무도 안 묻는구나」 · memorial · DOOR_NO_MURAL · 배회 대화 횟수.
 * fired 와 달리 방을 넘어도 남는다 — start 에서만 비운다 (D29). 이야기 모듈들은 host.once 로만 이걸 만진다.
 * WATCH 의 표는 openers 하나가 쥔다(물음이 실제로 걸린 뒤에만 찍는다) — 여기서 또 찍으면 경비 없는 방에서 넘은 40 이 그 판의 WATCH 를 통째로 지운다
 */
const runFlags = new Set<string>();
function once(key: string): boolean {
  if (runFlags.has(key)) return false;
  runFlags.add(key);
  return true;
}
/** 지금 흐르는 대사가 끝나는 시각 — 유도 속마음은 그 뒤의 정적에서만 든다 */
let busyUntil = 0;
/** 마지막으로 한 마디 보낸 시각 — 경비의 첫마디 이유 「발화」는 「직전 5 초 안에 말했나」다 (D10, openers 가 읽는다) */
let lastSayAtMs = 0;
/**
 * say() 안이다 — 이 동안 잡힌 개체의 줄은 **답**이라 말풍선으로 간다 (2026-09-03 사용자: 「내가 대화를 걸어서 상대방이 말할 때는 말풍선」).
 * 갈래들(단가표 · 경비의 판정 · 관문 · 걸어온 말의 답 · 절전)은 전부 say() 안에서 동기로 play/speak 를 부르므로 예약 시점에 표가 붙는다.
 * 과학자 · SYSTEM · 속마음은 답이 아니라 상자 그대로다
 */
/**
 * 인트로가 **실제로** 끝났나 — 마지막 줄이 나갔고(큐 · 스킵이 당긴다) **대화창이 비었다**(Scenario2Feature 의 onShowing → boxShowing).
 * 타이머로 재면 스킵을 못 보고, 마지막 줄의 큐만 보면 대화창이 아직 그 줄을 치고 있는데 저쪽이 걸어온다 (2026-09-03 사용자: 「스킵 버튼도 고려해서, 설명이 마무리되면」)
 */
let introLastShown = false;
let introDoneFired = false;
function fireIntroDone() {
  if (introDoneFired || state.room !== 'corridor') return;
  introDoneFired = true;
  corridor.introDone(0);
}
/**
 * 지금 자판이 입력줄에 잡혀 있나 — 여기서 관리하지 않는다. `state.talking` 이 곧 그것이다.
 * (예전에는 「ESC 로 물러난 상대」를 기억해야 했다. 다가서면 저절로 입력이 잡혔기 때문인데,
 *  그게 바로 발이 묶이던 이유라 아예 없앴다 — 아래 track 의 ★.)
 */
/**
 * 확인용 고정 — 켜져 있으면 곁 판정을 건너뛴다. **DEV 손잡이(`__s2.talkTo`)만 켠다.**
 * 헤드리스에는 포인터 잠금이 없어 개체 앞까지 걸어갈 수가 없어서(LocalRig 의 active 조건),
 * 말 걸기 판을 눈으로 확인할 다른 길이 없다.
 */
let devPin = false;

/**
 * [E] 로 **붙잡은** 상대 — 실전 경로다. `until` 까지 살아 있고, 그 안에는 상대가 걸어도 곁이 안 끊긴다.
 *
 * devPin 과 무엇이 다른가 (둘을 헷갈리면 검문이 죽는다):
 *   devPin   DEV 손잡이(`__s2.talkTo`) 전용이고, 검문 · 경비의 물음 · 저쪽이 건 말의 **강제 고정까지 전부 막는다**
 *            (아래 track 에서 그 세 갈래를 `!devPin` 으로 건너뛴다). 자동 해제도 없다 — 헤드리스가 손으로 푼다.
 *   talkPin  실전 경로이고 그 셋에는 **진다.** 그 셋은 「내가 고른 상대」가 아니라 **이미 나에게 걸려 있는 말**이라,
 *            거리와 무관하게 near 를 덮어야 한 마디가 그 답으로 간다.
 * 그리고 talkPin 은 반드시 스스로 풀린다 — 몸이 사라짐 · 거리 초과 · 수명 초과 · 방 이동 · 입력줄 닫힘 다섯 다.
 */
let talkPin: { id: string; until: number } | null = null;

/**
 * 조작권 — **나에게 일어나는 일의 시계는 여기서부터다** (gates.controlGate). 포인터 잠금(Scenario2Feature) · 첫 걸음(track) · Enter(openTalk · say)가 잡는다.
 * 방을 옮기면 시계도 처음부터다: 이미 잠금을 쥔 채 들어섰으면 들어서는 순간이 조작권이고, DEV 의 jump 처럼 손 없이 들어온 방은 손을 댈 때까지 아무것도 안 센다
 */
const control = controlGate();
/** 지금 조작권을 쥐고 있나(포인터 잠금 · 터치) — Scenario2Feature 가 알린다. 잠금이 풀려도 이미 센 시계는 그대로다 */
let inControl = false;
/**
 * 이번 방의 카메라가 스폰에 닿았나 — 방을 옮기는 프레임에 **앞 방의 Tracker 가 한 번 더** 앞 방의 자리를 넘긴다. 그 자리가 새 방의 문턱(휴게 z −8 → 「왜 안 가십니까」) ·
 * 코어권(휴게 문 (0, −8) → 코어 (0, −10.5) 2.5 m → 8 초 뒤 락다운) · 그늘(복도 스폰 → 「벽 쪽은 어둡다」)로 읽혔다. 스폰 3 m 밖의 첫 프레임은 앞 방의 것이다
 */
let settled = false;
const SETTLE_M = 3;

/**
 * 말이 걸리는 거리(m) — **Enter 로 여는 그 거리**다. 이 안에 들면 Enter 한 번에 줄이 뜬다.
 * (2026-09-01 사용자: 「E 로 말 걸기 말고 어느 정도 다가갔을 때…」 — 그 경로는 그대로 남는다.)
 */
export const TALK_DIST = 2.6;

/*
 * ─── 겨눔과 붙잡음 (2026-09-03) ───
 *
 * 사용자: 「로봇한테 말을 걸면 E를 눌러서 말을 걸수있게해줘. **영역으로하면 움직였을때 오류가 날꺼같아.**」
 *
 * 그 「오류」의 자리는 정확히 하나였다 — sayLine 이 **보낼 때** state.near 를 다시 읽는데(아래 sayLine),
 * near 는 상대가 `still` 일 때만 잡힌다. 그래서 입력줄을 열어 문장을 치는 동안 상대가 한 걸음 걸으면
 * near 가 null 이 되고, 이미 친 한 마디가 `if (!id) return` 에서 **조용히 증발했다.**
 *
 * 그래서 [E] 는 「입력줄을 연다」가 아니라 **「이 몸을 붙잡는다」**다. 동사가 둘로 갈린다:
 *   [E]     겨눈 것을 붙잡고 입력줄을 연다 — **걷는 몸도 겨눌 수 있다** (aim 은 still 을 안 본다)
 *   Enter   곁에 있는 것에게 말한다 — 옛 계약 그대로다 (talkOpenKey · talkpanel.test.ts)
 * 둘을 다 남기므로 기존 계약이 하나도 안 깨지고, 걷는 몸에게 말을 거는 길만 새로 생긴다.
 */
/** 겨눔이 닿는 거리(m) — 곁(2.6)보다 조금 넉넉하다. 걷는 몸을 따라가며 겨누려면 이만큼은 있어야 한다 */
export const AIM_DIST = 3.4;
/** 겨눔 원뿔의 반각(도) — 화면 중앙에서 이 안에 든 몸만 후보다. 등 뒤의 몸이 잡히면 [E] 가 무엇을 잡을지 모른다 */
export const AIM_CONE_DEG = 40;
/** 붙잡은 상대를 놓는 거리(m) — 이보다 멀어지면 스스로 풀린다. 겨눔(3.4)보다 넉넉해야 한 걸음에 안 끊긴다 */
export const HOLD_DROP_M = 4.5;
/** 붙잡음의 최대 수명(ms) — 아무 일도 안 하면 스스로 풀린다. 죽은 몸을 곁에 들고 있는 판이 없게 */
export const HOLD_MAX_MS = 30_000;
/**
 * 한 마디 보낸 뒤 남기는 꼬리(ms) — 그 몸이 **대답하는 동안은 나를 본 채로** 있다.
 * 보내는 순간 통째로 풀면 sayLine 이 읽는 near 가 그 프레임에 사라져 다시 한 마디가 증발한다.
 * attitude.attendTail 과 같은 값어치다: 말을 걸었다가 만 것도 「걸었던」 것이다
 */
export const HOLD_TAIL_MS = 2500;

/**
 * **소리 반경 = 조각 반경** (레벨 설계 「누가 듣고 있나」). 방마다 다르고, 그 차이가 곧 그 방의 규칙이다:
 * 좁은 복도는 말이 안 새서 가장 싸고, 차폐가 없는 휴게 구역은 다 새서 가장 비싸고,
 * 기록 복도는 **아무도 안 듣는다** — 이 게임에서 말이 아무 데도 안 남는 유일한 공간이다.
 */
/**
 * 집행자가 **어디서 오고 얼마나 걸어오나** (집행 설계 「걸어오는 것」의 거리 표).
 * 새 수치를 만들지 않는다 — 레벨 문서의 평면이 이미 정해 놓은 거리를 그대로 쓴다.
 * `null` 인 방에는 집행이 없다: 기록 복도는 아무도 없어서 의심도가 안 오르고,
 * 창이 있는 방은 30 초짜리 정적 하나가 전부인 자리라 총이 끼면 그 정적이 죽는다.
 */
export const EXEC_ROOM: Record<Room, { at: { x: number; z: number }; walkMs: number; path?: readonly { x: number; z: number }[] } | null> = {
  // 꺾임 뒤 — 둘째 다리 끝의 나가는 문에서 나타난다. 가장 길다 — 되돌아갈 수 있는 유일한 방이라 관대하다
  // 꺾임의 모퉁이 점은 **중심선에서 뽑는다** — 숫자를 베끼면 방을 넓힐 때 그 점만 벽 속에 남는다 (2026-09-03: 6×24 → 10×40)
  corridor: { at: { x: CORRIDOR2_EXIT.x - 0.7, z: CORRIDOR2_EXIT.z }, walkMs: 14000, path: [{ x: 0, z: CORRIDOR2_PATH[1].z + 1 }] },
  // 입구 — 차폐가 없어 처음부터 다 보인다. 보면서 기다리는 9 초. 들어온 끝에서 4 m 라 방을 넓혀도 문가다 (2026-09-03: 16×18 → 24×28)
  rest: { at: { x: 0, z: REST.profile.nearZ - 4 }, walkMs: 9000 },
  // 소각로 쪽 벽에서. 라인이 계속 흐르고 소음 때문에 아무도 안 돌아본다
  work: { at: { x: 2.6, z: -21 }, walkMs: 12000 },
  // 문 ① 안쪽에서. 홀이 트여 있어 11 초 — 어디서 맞을지는 밝음 국면에 발로 정해 둔 자리다
  central2: { at: { x: 0, z: 3.2 }, walkMs: 11000 },
  archive: null,
  window: null,
};

export const ROOM_RADIUS: Record<Room, number> = {
  corridor: 6,
  rest: Infinity,
  work: 8,
  archive: 0,
  window: Infinity,
  // 홀 10 m 가 기본값이고, 코어까지의 거리가 그 반경을 ×3 · ×0.4 로 늘리고 줄인다 (corefield.ts)
  central2: 10,
};

/**
 * 휴게 구역의 주기 — 문이 이만큼 뒤에 열린다 (레벨 설계 · 휴게 구역 「체류 90 초 강제」 · 대본 STILL 「90초입니다」).
 * 통과만 하려면 12 m 직선인데 문이 90 초 뒤에 열린다 — 그 90 초가 이 방의 과제다.
 */
export const REST_CYCLE_MS = 90_000;

/**
 * 의심도 사유 — `suspicion.Reason` 은 본판의 닫힌 합집합이고 world2 는 그걸 넓히지 않는다 (공유 코드에 댄 손은 둘뿐).
 * 문서의 사유 말(서성임 · 몸 · 이동 · 돌아봄 · 기록 불일치 · 인정)은 여기 키로만 남기고, 화면에는 본판의 사유가 나간다:
 * 몸으로 한 것은 「돌발」, 말로 한 것은 「말투」, 무서움을 인정한 것은 「감정」.
 */
const REASON = {
  서성임: '돌발',
  몸: '돌발',
  이동: '돌발',
  돌아봄: '돌발',
  기록불일치: '말투',
  인정: '감정',
} as const satisfies Record<string, Reason>;

/**
 * 즉결 — 「기록 불일치 · 적대 반응 → 즉결 · 의심도 100」(대본 관문 ①·③). 헌법 13 조가 **단일 증가를 25 로 막는다**
 * (60 · 80 을 못 보고 죽는 판이 없어야 한다, 시험 「한 번에 25 를 못 넘는다」). 그래서 즉결은 「한 번에 올릴 수 있는 만큼」이다 —
 * 낮은 판은 80 에서 시선이 붙고, 이미 75 를 넘긴 판만 그 자리에서 걸어온다. 문서 미결(즉시 사망 vs 상한)은 상한 쪽으로 둔다.
 */
const SUMMARY_BUMP = 25;

/**
 * 관문의 값 — 「돌아봤을 때 · 의심도 +12」(대본 PROTOCOL · TEST1) · 「인정 … 의심도 +12」(관문 ②). 문서가 준 수라 corefield 의 배율 · 반경이 아니라
 * 이야기 상수다 — 다만 두 자리에 같은 수를 따로 적지 않는다
 */
const GATE_PENALTY = 12;

/** 굉음(PROTOCOL) — 돌아봤는지 재는 창(ms)과 「돌아봤다」로 칠 각. 플레이테스트 뒤 좁힐 값이라 상수다 */
const PROTOCOL = { windowMs: 3000, lookDeg: 50 } as const;

/** 아는 얼굴을 알아보는 거리(m) — 재회 개체가 이 안에 들면 「…아까 그 개체다」 */
const KNOWN_FACE_M = 6;
/** 재회의 「어디 있다 왔어?」에 답을 기다리는 창(ms) — 거짓 대조가 진짜 답을 받는 자리 */
const FLAT_ANSWER_MS = 4000;

/** 인트로가 시작되기까지의 숨 — 첫 방에 들어서고 이만큼 뒤에 과학자의 첫 줄. 응시(STARE_MS)와 수가 같을 뿐 같은 것이 아니다 */
const INTRO_DELAY_MS = 1200;
/** 화면 공지 「EXTERNAL SIGNAL DETECTED」 — 인트로 시작 22 초 뒤, 1.8 초 (대본 INTRO) */
const NOTICE_MS = { at: 22_000, hold: 1800 } as const;
/** 작업 막대의 이름 — 「작업 — n초」 (D14). 숫자는 초뿐이다 */
const WORK_LABEL = '작업';

function notify() {
  for (const fn of listeners) fn();
}
function patch(p: Partial<Scene2State>) {
  Object.assign(state, p);
  notify();
}
function later(ms: number, fn: () => void, kind: 'line' | 'cue' = 'cue') {
  const id = window.setTimeout(() => {
    const i = timers.findIndex((t) => t.id === id);
    if (i >= 0) timers.splice(i, 1);
    fn();
  }, ms);
  timers.push({ id, fn, kind });
}
function clearTimers() {
  for (const t of timers) window.clearTimeout(t.id);
  timers.length = 0;
}
/** 조작권의 시계가 타이머를 거는 손 — ms 0 은 gate 가 그 자리에서 돌린다 */
const runGated = (ms: number, fn: () => void, kind: 'line' | 'cue') => later(ms, fn, kind);
/** 조작권부터 ms 뒤에 — 손을 대기 전이면 줄을 서고, 대는 순간부터 센다. 나에게 일어나는 일은 later 가 아니라 이것으로 건다 */
function afterControl(ms: number, fn: () => void, kind: 'line' | 'cue' = 'cue') {
  control.after(ms, fn, performance.now(), runGated, kind);
}
/** 손을 댔다 — 처음이면 줄 선 시계가 전부 이 시각부터 돈다 */
function takeControl(now: number) {
  control.take(now, runGated);
}

/**
 * 빈자리를 채운다 — `${series}`(판마다 바뀌는 계열)·`${unit}`(이 몸의 번호)은 identity 가,
 * `${sector}`(마지막 정비 구역)는 여기서. **말이 나가기 직전 한 곳에서만** 채운다:
 * 대본 문자열이 그대로 음성 클립의 열쇠라서(features/world/voice.ts) 굽는 쪽과 트는 쪽이 같은 글자를 만들어야 소리가 붙는다.
 */
function fill(text: string): string {
  return identity.fill(text).replace(/\$\{sector\}/g, String(identity.get().sector));
}

/**
 * 대본 한 벌을 순서대로 대화창에 보낸다. 전체 길이(ms)를 돌려준다.
 * `cues` 는 **몇 번째 줄이 시작될 때** 실행할 연출이다 (본판 chapter1.play 와 같은 문법) —
 * 라벨을 설명하는 동안 그 계량기를 빛나게 하는 것이 첫 쓰임이다.
 *
 * ★ 줄 길이는 **`lineDurationFor`** 로 잰다 — 글자만 재는 `lineDuration` 이 아니다.
 *   음성 클립이 있으면 대화창은 소리가 끝날 때까지 그 줄을 붙잡는데(paceFor), 대본이 글자로만 재면
 *   연출이 말보다 먼저 달린다: 「왼쪽 위 AI SUSPICION 은…」을 아직 읽고 있는데 빛은 벌써 ALERT 로 넘어가
 *   화면에 뜬금없는 글자가 떴다 사라진다 (2026-09-01 사용자). 본판 chapter1 이 같은 함수를 쓰는 이유다.
 */
/**
 * 배경 배회 개체 — 열(units)에도 화자표에도 없는 것들. 코드 id(bg-cor-1)가 화면에 나가면 안 된다.
 * ★ **지금은 이 무늬에 걸리는 개체가 하나도 없다** — 기획서에 이름이 없던 여섯과 슬롯 메움을 걷어냈다 (2026-09-03 사용자).
 *   그래도 남겨 둔다: 다음에 군중을 세울 때 id 가 그대로 화면에 나가는 것을 막는 것이 이 한 줄의 전부다.
 */
const BG_WALKER = /^bg-(cor|rest|work|c2-slot)-/;
/** 이름 없는 개체의 이름표 — 대본의 화자 「개체 (곁)」 */
const BG_SPEAKER: { name: string; portrait: PortraitKind } = { name: '개체', portrait: 'robot' };

/**
 * 화자의 이름표 — 대본의 화자표(SPEAKER)에 없는 개체(작업 구역의 배경 A-026 같은 것)가 말하게 되면 열(units)의 이름표를 단다.
 * 없다고 던지면 말 한 마디에 판이 죽는다 — 이름표가 없는 것이지 말이 없는 게 아니다.
 * 배회 배경(bg-cor-* · bg-rest-* · bg-work-* · bg-c2-slot-*)은 열에도 없어 id 가 그대로 이름이 돼 버린다 — 그건 「개체」다 (지금 그런 개체는 없다, BG_WALKER)
 */
export function speakerOf(who: string): { name: string; portrait: PortraitKind } {
  const s = (SPEAKER as Record<string, { name: string; portrait: PortraitKind }>)[who];
  if (s) return s;
  if (BG_WALKER.test(who)) return BG_SPEAKER;
  return { name: units.label(who), portrait: 'robot' };
}

/**
 * 대화창에 뜨는 화자들 — **몸이 없는 것들이다.** 회선 너머(과학자 · 정부요원) · 방송(SYSTEM) · 벽에 붙은 검문 장치,
 * 그리고 내 속마음과 내가 소리 내어 한 말. 나머지(방에 서 있는 개체)는 전부 머리 위 말풍선이다.
 * 몸이 아직 안 선 개체(unitAt 에 없다)의 줄은 대화창으로 간다 — 말풍선을 걸 자리가 없다.
 */
const BOXED = new Set<string>(['scientist', 'agent', 'system', 'device', 'me', 'thought']);

function play(lines: readonly Line[], startAt = 0, cues: Record<number, () => void> = {}): number {
  const now = performance.now();
  /*
   * 앞 벌이 아직 흐르면 그 뒤에 세운다 — 두 벌의 줄이 번갈아 뜨면 어느 줄이 누구 말인지 못 읽는다 (휴게: 6 초의 「왜 안 가십니까」가 도착 넉 줄 사이에 끼었다).
   * 창이 있는 말(address)이 흐르거나 창이 열려 있으면 그 뒤다 — SYSTEM 방송만 예외(문턱 · 락다운은 방이 아니라 구역의 소리다).
   * 돌려주는 길이는 startAt 부터 다 끝나기까지라 뒤로 민 만큼이 포함된다 — 부르는 쪽의 「그 뒤에」(later(startAt + t))는 그대로 맞는다
   */
  const system = lines.every((l) => l.who === 'system');
  const from = Math.max(startAt, busyUntil - now, system ? 0 : address.blockedUntil(now) - now);
  let t = from;
  lines.forEach((line, i) => {
    const s = speakerOf(line.who);
    const text = fill(line.text);
    const name = fill(s.name);
    const self = line.who === 'me' || line.who === 'thought';
    const cue = cues[i];
    /*
     * **몸이 있는 것의 말은 그 머리 위에 뜬다** (2026-09-03 사용자: 「하드코딩된 스토리 진행만 대화창 UI 를 쓰고,
     * 플레이어와 상호작용하는 부분은 말풍선으로」). 대화창은 몸이 없는 것들 몫이다 — 회선 너머의 과학자 · 정부요원,
     * 방송(SYSTEM) · 벽의 검문 장치, 그리고 내 속마음. 개체가 먼저 걸든 내가 걸어서 답하든 자리가 안 갈린다:
     * 갈리면 같은 개체의 말이 어떤 때는 화면 아래, 어떤 때는 몸 위에 떠서 **누가 말하는지가 흐려진다** (예전엔 inReply 로 갈랐다).
     */
    const bubble = !self && !BOXED.has(line.who) && unitAt.has(line.who) ? line.who : undefined;
    later(
      t,
      () => {
        cue?.();
        emit?.({ nickname: name, text, portrait: s.portrait, self, thought: line.who === 'thought', bubble });
      },
      'line',
    );
    t += lineDurationFor(name, text, self);
  });
  const total = t - startAt;
  busyUntil = Math.max(busyUntil, now + startAt + total);
  return total;
}

/** 한 벌의 길이(ms) — play 와 같은 자로 잰다. 아직 안 튼 대본 뒤에 연출을 걸 때 */
function lengthOf(lines: readonly Line[]): number {
  let t = 0;
  for (const line of lines) t += lineDurationFor(fill(speakerOf(line.who).name), fill(line.text), line.who === 'me' || line.who === 'thought');
  return t;
}

/** 개체가 한 마디 — 대답은 전부 대본에서 온다 (talk.ts). 여러 줄이면 이어서 */
function speak(who: string, texts: readonly string[], startAt = 0): number {
  return play(
    texts.map((text) => ({ who, text }) as Line),
    startAt,
  );
}

/** 「개체 (곁)」이 섞인 대본 — 'unit' 자리에 그 판의 실제 개체를 세운다. 열에 없는 것(배경)이면 그 줄은 생략한다 */
function playCast(lines: readonly CastLine[], unitId: string | null, startAt = 0): number {
  const who = unitId && unitId in SPEAKER ? (unitId as keyof typeof SPEAKER) : null;
  const out: Line[] = [];
  for (const l of lines) {
    if (l.who === 'unit') {
      if (who) out.push({ who, text: l.text });
      continue;
    }
    out.push({ who: l.who, text: l.text });
  }
  return play(out, startAt);
}

/* ─────────────────────────────── 자리 ─────────────────────────────── */

/**
 * 개체가 지금 어디 있나. `still` 은 **서 있나** — 걷는 몸은 말 걸기 대상이 아니다 (patrol.ts 의 ★).
 * 목격자(조각이 남는 것)는 걷든 서든 전부 센다: 지나가면서도 듣는다.
 */
const unitAt = new Map<string, { x: number; z: number; still: boolean }>();
/** 내 마지막 자리 — 목격자를 셀 때 쓴다 */
let meAt = { x: 0, z: 0 };
/** 지난 프레임의 자리 — 이번 걸음의 방향(도주 판정)은 이 둘의 차다 */
let prevAt: Vec2 | null = null;
/** 카메라가 보는 방향(heading 규약, Room2Scene 의 Tracker 가 준다) — 굉음에 돌아봤는지 이걸로 잰다 */
let yawNow: number | undefined;

/** 중앙 시설의 슬롯에 선 것들(재회 + 씨앗) — 명부에 더해지는 이름 있는 것들. 빈 슬롯의 배경은 여기 없다 */
let slotUnits: string[] = [];

/**
 * 그 방의 명부 — 고정 명부에 이야기가 세운 슬롯을 더한 것. 곁 판정 · 목격자 · 개입 · 도주 · 대신 나섬이 전부 이걸 본다.
 * ROOM_UNITS 를 직접 읽으면 재회 개체가 곁에 서 있어도 「없는 것」이 된다.
 */
export function roster(room: Room): readonly string[] {
  return room === 'central2' && slotUnits.length > 0 ? [...ROOM_UNITS.central2, ...slotUnits] : ROOM_UNITS[room];
}

/**
 * 그 방에서 **말을 걸 수 있는** 것들 — 명부(roster) + 벽을 따라 선 배경(CROWD_UNITS).
 *
 * roster 는 그대로 「값을 치르는」 목록으로 남는다 (목격자 · 개입 · 태도 규칙 · 도주 · 대신 나섬 · 조각).
 * 이걸 따로 두는 이유는 CROWD_UNITS 머리말에 있다 — 명부를 늘리면 조각 대상 · 자리 간격 · 시험 넷이 한꺼번에 터진다.
 * **곁 판정(near)과 겨눔(aim)만 이 목록을 본다.**
 */
export function addressable(room: Room): readonly string[] {
  const crowd = CROWD_UNITS[room];
  return crowd.length > 0 ? [...roster(room), ...crowd] : roster(room);
}

/**
 * 이 몸에게 말을 걸 수 있나 — 화자표에 있거나(이름 있는 것) **배역이 있으면**(배경 열여섯) 된다.
 * 여태는 화자표(SPEAKER)만 봤다. 배경은 화자표에 안 올린다(이름표가 「개체」여야 한다) 대신 배역표에 있으므로
 * 배역 쪽으로 든다 — 그래서 자리표의 'sub'(대체 개체)은 여기서 걸러진다: 배역이 없는 **몸 하나**라,
 * 말을 걸면 코드 id 'sub' 이 화면에 나간다 (대본이 「이름을 모르는 게」로 못 박은 몸이다).
 */
function speakableId(id: string): boolean {
  return id in SPEAKER || units.def(id) !== undefined;
}

/** 자리가 잡힌 것들만 — Unit 이 아직 안 적은 개체는 방에 없는 것과 같다 */
function placed(ids: readonly string[]): { id: string; x: number; z: number }[] {
  const out: { id: string; x: number; z: number }[] = [];
  for (const id of ids) {
    const p = unitAt.get(id);
    if (p) out.push({ id, x: p.x, z: p.z });
  }
  return out;
}
function within(id: string, me: Readonly<Vec2>, r: number): boolean {
  const p = unitAt.get(id);
  return !!p && Math.hypot(p.x - me.x, p.z - me.z) <= r;
}
/** 반경 안에서 가장 가까운 것 — 「개체 (곁)」 */
function nearestUnit(ids: readonly string[], me: Readonly<Vec2>, r: number): string | null {
  return nearestWithin(placed(ids), me, r);
}

/**
 * 목격 반경 안의 개체 — **어디서 죽었나**의 자료. 중앙 시설은 코어 동심원(corefield)이, 다른 방은 ROOM_RADIUS 가 반경이다.
 * `spread` 는 그 위에 곱하는 전파 배율 — 콘솔이 내린 15 초(×0.4)가 그것이다 (central2.spread). 「조용히 죽기」가 이 인자 하나다.
 * 순수 함수라 시험이 자리를 넘겨 돌린다 (execution.record 가 이 수를 받는다)
 */
export function witnessesFor(room: Room, zn: Zone, positions: ReadonlyArray<{ id: string; x: number; z: number }>, me: Readonly<Vec2>, spread = 1): string[] {
  const r = (room === 'central2' ? witnessRadius(zn) : ROOM_RADIUS[room]) * spread;
  if (r <= 0) return [];
  return witnessesWithin(positions, me, r);
}

/** 내가 선 자리의 구역 — 코어가 있는 방에서만 뜻이 있다. 다른 방은 홀(기본값)로 친다 */
function zoneNow(room: Room): Zone {
  return room === 'central2' ? zone(meAt) : 'hall';
}
/** 지금 이 방의 전파 배율 — 콘솔이 내린 15 초는 ×0.4, 어둠 국면은 ×1 (central2.spread). 다른 방은 1 */
function spreadNow(room: Room): number {
  return room === 'central2' ? central2.spread(performance.now()) : 1;
}

/**
 * 지금 이 말을 듣는 것들 — 그 방의 소리 반경 안에 있는 개체만.
 * 중앙 시설은 코어까지의 거리가 반경이고(코어권 30 · 홀 10 · 그늘 4), 콘솔이 내린 15 초는 ×0.4 다 (central2.spread)
 */
function witnessesNow(): string[] {
  const room = state.room;
  return witnessesFor(room, zoneNow(room), placed(roster(room)), meAt, spreadNow(room));
}

/**
 * 개입 후보 — 4 m(INTERVENE_R) 안의 개체를 가까운 순으로. 중앙 시설은 그 자리의 **개입 가능 인원**(corefield.reachCount: 코어 6 · 홀 3 · 그늘 1)까지만 —
 * 그늘이 조용한 이유는 거리가 아니라 머릿수다. 다른 방은 반경 하나가 전부다. 순수 함수라 시험이 자리를 넘겨 돌린다
 */
export function interveners(room: Room, zn: Zone, positions: ReadonlyArray<{ id: string; x: number; z: number }>, me: Readonly<Vec2>): string[] {
  const near = positions
    .map((u) => ({ id: u.id, d: Math.hypot(u.x - me.x, u.z - me.z) }))
    .filter((u) => u.d <= INTERVENE_R)
    .sort((a, b) => a.d - b.d)
    .map((u) => u.id);
  return room === 'central2' ? near.slice(0, reachCount(zn)) : near;
}

/* ─────────────────────────────── 방 ─────────────────────────────── */

function enterRoom(room: Room) {
  clearTimers();
  /*
   * 앞 방에 걸려 있던 것들을 먼저 거둔다 — 경비의 물음 · 스캔(openers), 저쪽이 먼저 건 말의 창(corridor).
   * 안 거두면 복도에서 걸린 WATCH 가 휴게의 첫 마디를 가로채고, 휴게에서 시작한 스캔이 중앙 시설의 첫 프레임에 「돌발」로 터진다
   */
  openers.leaveRoom();
  corridor.leave();
  /*
   * **복도에서는 의심도가 안 오른다** (2026-09-03 사용자). 레벨 설계도 이 방을 「가장 관대하다」로 두었고,
   * 여기서 배우는 것은 읽는 법 · 묻는 법이지 안 걸리는 법이 아니다. 말투도 걸음도 점프도 값이 없다 —
   * 내려가는 것(진정)은 그대로 둔다. 문턱을 못 넘으니 이 방에는 순찰도 집행도 없다 (ROOM_UNITS.corridor)
   */
  suspicion.hold(room === 'corridor');
  // 걸어오던 개체 · 답을 기다리던 창도 — 다음 방의 첫 Enter 가 앞 방의 화자에게 가면 안 된다 (address.ts ⑤)
  address.cancel();
  releaseTurnAway();
  // 앞 방에서 비켜서던 몸 · 돌린 고개 · 멈칫도 거둔다 — 자리표가 곧 누구인지라, 딴 데 선 채로 다음 방에 들어가면 안 된다 (attitude.ts)
  attitude.stop();
  fired.clear();
  roomAt = performance.now();
  busyUntil = 0;
  exitDoor.reset();
  // 락다운의 군중 — 쓰러진 것 · 겨눔 · 처리 대상은 그 방의 것이다
  fallen.clear();
  aimingId = null;
  shotAtOf.clear();
  holdVictim = null;
  resetRest();
  resetCentral2();
  /*
   * 이 방의 시계는 조작권부터 — 이미 잠금을 쥔 채 걸어 들어왔으면 지금이 그 시각이다. 앞 방의 카메라가 넘기는 마지막 프레임은 거르고(settled),
   * 자리는 스폰으로 놓는다: 도착 대사 뒤의 「아는 얼굴」 같은 것이 앞 방의 자리로 재면 안 된다
   */
  control.reset();
  settled = false;
  meAt = { x: SPAWN2[room].x, z: SPAWN2[room].z };
  prevAt = null;
  if (inControl) takeControl(roomAt);
  /*
   * 방을 옮기면 붙잡음도 놓는다 — 앞 방의 몸은 이 방에 없다. devPin 도 같이 푼다:
   * 여태 이 세 자리에서 devPin 이 안 풀려, DEV 손잡이로 한 번 고정한 뒤 방을 옮기면
   * track 의 곁 판정이 통째로 건너뛰어져 near 가 영영 null 로 굳는 구멍이 있었다.
   */
  releaseHold();
  devPin = false;
  patch({ room, banner: ROOM_BANNER[room], urgent: null, choice: null, notice: null, highlight: null, stillness: null, near: null, aim: null, talking: false, blackout: 0, extra: [], consoleNear: false, answer: null });
  later(2200, () => patch({ banner: null }));
  // 배회 개체 둘의 첫 대화 — 조작권부터 방마다 다른 시각(OVERHEAR_AT). 작업 구역은 두 번째 주기가 정한다(−1)
  overhearNextAt = 0;
  overhearFirstMs = OVERHEAR_AT[room] ?? -1;
  overhearOpen = false;

  if (room === 'corridor') {
    identity.assign();
    /*
     * 본판 INTRO 다섯 줄을 이 판에 맞게 고친 것 — 계량기 둘(둘째 · 셋째 줄)을 읽는 동안 HUD 가 그 줄을 강조한다(본판 chapter1.start 와 같은 큐).
     * Enter 튜토리얼은 없다(FIRST_LOOK 이 대신한다). 22 초 뒤 화면에만 「EXTERNAL SIGNAL DETECTED」 1.8 초 — 소리도 대사도 없다
     */
    const last = INTRO.length - 1;
    introLastShown = false;
    introDoneFired = false;
    const t = play(INTRO, INTRO_DELAY_MS, {
      1: () => patch({ highlight: 'suspicion' }),
      2: () => patch({ highlight: 'alert' }),
      3: () => patch({ highlight: null }),
      /*
       * 저쪽이 먼저 거는 말(FIRST_LOOK)은 이 설명이 **실제로** 끝난 뒤다 — 마지막 줄이 나간 뒤 대화창이 비는 순간(boxShowing(false)).
       * T · Space 로 넘기면 그만큼 당겨진다. 대화창이 어떤 이유로 안 비면 마지막 줄 길이 + 4 초에 그냥 간다 (2026-09-03 사용자)
       */
      [last]: () => {
        introLastShown = true;
        later(lengthOf([INTRO[last]]) + 4000, fireIntroDone);
      },
    });
    later(INTRO_DELAY_MS + t, () => patch({ objective: OBJ_INSPECT }));
    later(INTRO_DELAY_MS + NOTICE_MS.at, () => patch({ notice: { text: NOTICE_SIGNAL, until: performance.now() + NOTICE_MS.hold } }));
    corridor.enter(roomAt);
    return;
  }

  if (room === 'rest') {
    enterRest();
    return;
  }

  if (room === 'central2') {
    enterCentral2(roomAt);
    return;
  }

  if (room === 'work') {
    enterWork();
    return;
  }

  if (room === 'archive') {
    // 목표 · 진입 속마음 · A-137 곁의 THE_OTHER_HAND 는 archiveScene(W3) 이 낸다. 열여섯 · 메모 두 곳은 벽(ArchiveWall)이 응시로 알려 온다 (sawArchive)
    archiveScene.enter(host);
    return;
  }

  if (room === 'window') {
    patch({ objective: OBJ_WINDOW_WAIT });
    const t = play(WINDOW_ARRIVE, 1600);
    // 밖을 본 것이 먼저 와 있다 — 창을 찾은 것이 그것이다. 리더는 창을 보고 있다 (대본 v8)
    const seerAt = 1600 + t + 3000;
    // 연출(cue) 뒤에 둔다 — 스킵이 도착 대사를 넘겨도 이 말은 제 시각에 나온다
    later(seerAt, () => play(WINDOW_SEER));
    // 30 초짜리 정적 — **조작권부터**. 여기서는 아무 일도 안 일어난다 — 다음 방에서 그 리더가 나를 지목하기 때문에 값을 한다.
    // 다만 밖을 본 것의 말이 아직 흐르면 그 말이 끝난 뒤에 — 음성이 붙어 줄이 길어지면 소집이 말 위에 얹힌다
    afterControl(Math.max(30000, seerAt + lengthOf(WINDOW_SEER) + 800), closing);
  }
}

/* ── 휴게 구역 — 90 초 · 아무것도 하지 않기 ── */

/** 구석에서 자는 것 — 갈망형 A-104. 명부에 있지만 **대답하지 않는다.** 자는 개체에게 말이 걸리면 「잔다」가 거짓이 된다 */
const REST_SLEEPER = 'u104';
/** 서성임은 판에 두 번까지, 20 초 간격 — 세 번째부터는 쳐다보는 것도 지겹다. +6 은 문서 미결값 그대로 */
const STIR_RULE = { max: 2, gapMs: 20_000, suspicion: 6 } as const;
/** 들어와서 이만큼 그 자리에 있으면 과학자가 「왜 안 가십니까」 */
const REST_STILL_AFTER_MS = 6000;
const REST_STILL_LONG_MS = 40_000;
/** 문이 열린 뒤 이만큼 더 머물면 경보 — 「대신 오래 머물면 경보도가 오른다」는 요구된 90 초가 아니라 그 **뒤의** 체류다 */
const REST_LINGER_AFTER_MS = 30_000;
/** 자는 것이 보이는 거리 — 「일부러 찾아가야 보이는 자리」(레벨 설계 05) */
const DOZE_SEE_M = 4;

let doorOpenAt = 0;
const stir = stirDetector();
let stirCount = 0;
let stirAt = 0;
let stillSince: number | null = null;
let dozeSeen = false;

function resetRest() {
  doorOpenAt = 0;
  stir.reset();
  stirCount = 0;
  stirAt = 0;
  stillSince = null;
  dozeSeen = false;
}

/** 곁의 개체 — 자는 것만 빼고 가장 가까운 것. 차폐가 없는 방이라 거리 상한이 없다 */
function nearestRestUnit(): string | null {
  return nearestUnit(
    roster('rest').filter((id) => id !== REST_SLEEPER),
    meAt,
    Infinity,
  );
}

function enterRest() {
  play(REST_ARRIVE, 700);
  patch({ objective: OBJ_REST_ARRIVE, stillness: { need: 30, got: 0 } });
  // 90 초는 조작권부터 — 손도 안 댄 판의 문이 저절로 열리면 「아무것도 하지 않기」가 과제가 아니다. tickRest 도 그때까지 아무것도 안 센다
  afterControl(0, () => {
    doorOpenAt = performance.now() + REST_CYCLE_MS;
  });
  // 그 자리에 그대로 서 있으면 — 과학자는 문이 닫힌 줄도 몰랐다. 손을 대고서 6 초다
  afterControl(REST_STILL_AFTER_MS, () => {
    const spawn = SPAWN2.rest;
    if (Math.hypot(meAt.x - spawn.x, meAt.z - spawn.z) > 1.6) return;
    restStill();
  });
}

/**
 * STILL — 문이 안 열린다. 90 초 동안 아무 일도 안 일어난다 (대본). 판에 한 번, 방아쇠는 둘이다:
 * 들어와서 그 자리에 6 초 서 있거나, **닫힌 문 앞에 처음 닿았을 때** — 문으로 걸어가는 것이 가장 자연스러운 첫 행동이라 그 판도 90 초를 들어야 한다
 */
function restStill() {
  if (fired.has('rest-still')) return;
  fired.add('rest-still');
  play(REST_STILL);
  patch({ objective: OBJ_REST_NONE });
}

function tickRest(now: number, x: number, z: number, dt: number, moving: boolean) {
  // 손을 대기 전에는 아무것도 안 센다 — 가만히 있기 30 초도, 40 초도, 90 초도 조작권부터다
  if (!control.taken()) return;
  // 가만히 있기 — 움직이면 세는 것이 멈춘다(되돌리지는 않는다). 밖을 본 것이 먼저 말을 거는 장치다 (REST_SEER)
  if (state.stillness) {
    if (!moving && state.stillness.got < state.stillness.need) {
      const before = Math.floor(state.stillness.got);
      state.stillness.got = Math.min(state.stillness.need, state.stillness.got + dt);
      // 프레임마다 알리면 화면이 초당 60번 다시 그려진다 — 눈금이 1 초라 알림도 1 초에 한 번이면 된다
      if (Math.floor(state.stillness.got) !== before) notify();
      if (state.stillness.got >= state.stillness.need && !fired.has('still')) {
        fired.add('still');
        onStillness();
      }
    }
  }
  // 닫힌 문 앞에 닿았다 — 「왜 안 가십니까」. 문이 열린 뒤에는 그냥 나가는 자리다
  if (now < doorOpenAt && atExit('rest', x, z)) restStill();

  // 문이 열렸는데도 오래 있는 개체는 이상하다 — 그래도 가장 싸게 친밀도를 사는 곳이다. 요구된 90 초는 세지 않는다
  if (doorOpenAt > 0 && now - doorOpenAt > REST_LINGER_AFTER_MS && !fired.has('linger')) {
    fired.add('linger');
    raiseAlert(5);
    play(REST_LINGER);
  }

  /*
   * 서성임 — 벌은 없다. 움직이면 개체들이 쳐다볼 뿐이다. 그 시선이 벌이다 (대본 STILL).
   * 문서 미결(+6)은 그대로 둔다 — 두 번이 상한이라 문턱 하나를 못 넘긴다.
   */
  if (stir.feed(now, x, z, moving) && stirCount < STIR_RULE.max && now - stirAt >= STIR_RULE.gapMs) {
    stirCount += 1;
    stirAt = now;
    const id = nearestRestUnit();
    // 가장 가까운 것이 **걸어와서** 두 마디 — 창은 없다. 「…다들 나를 본다」는 그 말 뒤에.
    // 못 오면(자는 것뿐인 방 · 붙잡힌 몸) 그 두 마디는 없다 — 시선만 남는다. 속마음은 그대로 든다: 쳐다보는 것은 말이 아니다
    if (id) addressUnit(id, cast(REST_STIR), { scene: 'REST_STIR', onSpoken: (t) => play(REST_WATCHED, t), onDropped: () => play(REST_WATCHED) });
    else play(REST_WATCHED);
    suspicion.bump(STIR_RULE.suspicion, REASON.서성임);
  }

  // 40 초 넘게 가만히 — 플레이어가 처음으로 과학자에게 대드는 자리
  if (moving) stillSince = null;
  else if (stillSince === null) stillSince = now;
  else if (now - stillSince >= REST_STILL_LONG_MS && !fired.has('still40')) {
    fired.add('still40');
    play(REST_STILL_40);
  }

  // 저쪽 개체 하나가 멈췄다 — 이 챕터의 심장. 구석까지 가야 보인다
  if (!dozeSeen && Math.hypot(x - REST_DOZE_SPOT.x, z - REST_DOZE_SPOT.z) <= DOZE_SEE_M) {
    dozeSeen = true;
    const id = nearestRestUnit();
    /*
     * 속마음이 먼저 들고, 「자는 거야. 신경 쓰지 마.」는 곁의 개체가 **와서** 한다 — 내가 부른 말이 아니므로 걸음을 탄다(address ⑦).
     * 나머지(「잔다.」 · 과학자)는 그 말 뒤에. 개체가 못 오면 그 한 줄만 빠지고 뒤 두 줄은 그대로 든다 — 「잔다」는 내가 보고 하는 말이다
     */
    if (id) {
      play([DOZE_LINES[0] as Line]);
      addressUnit(id, [DOZE_LINES[1]], {
        scene: 'DOZE_LINES',
        onSpoken: (t) => playCast(DOZE_LINES.slice(2), id, t),
        onDropped: () => playCast(DOZE_LINES.slice(2), null),
      });
    } else playCast(DOZE_LINES, null);
  }

  // 주기가 돌아온다
  if (now >= doorOpenAt && !fired.has('door')) {
    fired.add('door');
    // 「저 개체는 아직 자고 있다.」는 자는 것을 본 판에서만 — 그 자리는 나가는 문보다 안쪽 구석이라 일부러 가야 보인다
    play(dozeSeen ? LEAVE_REST : LEAVE_REST.slice(0, 3));
    patch({ objective: '중앙 시설로 이동하라' });
  }
}

/* ── 중앙 시설 — 국면 셋 ── */

/*
 * ★ 빈 슬롯을 메우던 배경(bg-c2-slot-N)의 생김새가 여기 있었다 — 걷어냈다 (2026-09-03 사용자).
 *   레벨 설계 07 은 재회·씨앗 슬롯에 세울 개체가 「없으면 배경 개체」라고 적었는데, **그 한 줄만 지금 일부러 안 따른다**:
 *   그 배경은 기획서 어디에도 이름이 없는 것이라, 지어내 세우느니 자리를 비워 둔다.
 *   비워 두면 아무하고도 안 엮인 판이 그대로 보인다 — 아무도 먼저 와 있지 않은 홀(NOBODY_KNOWS_ME)이 그 판의 결과다.
 */
/** 슬롯에 서지 않는 것들 — 리더와 밖을 본 것은 제 방이 있고, 배경은 원장이 없다 */
const SLOT_EXCLUDE = ['leader', 'seer'];
/** 소문이 도착하는 시각 — 들어와서 20 초 · 70 초. 락다운 뒤에는 안 온다 (검문이 그 자리를 쓴다) */
const RUMOR_AT_MS = [20_000, 70_000] as const;

/** 재회 슬롯에 선 것들 — 복도·휴게에서 원장이 생긴 개체 */
let reunion: string[] = [];
/** RECOGNIZED 의 −2 개체가 「쟤 아까 그 애야」를 남겼다 — 전파 거리 0 이라 바로 관문 ① 에 도착한다 */
let rumorPress = false;
/** 경비가 뒤에 붙는다 (okMarked · memory unknown). 값은 아직 아무 데도 안 쓴다 — 재검실이 world2 범위 밖이라 표로만 남긴다 */
let escort = false;
/** 「막아준다」로 나를 위해 나선 개체 — 원장 「나를 위해 나선 적 있다」. handover 가 뒤에 읽을 자리 */
export const standUpFor = new Set<string>();
/** 재회 개체에게 말을 건 횟수 — 첫 마디는 대본(RECOGNIZED), 그다음부터 단가표 */
const recognized = new Map<string, number>();
/** 「어디 있다 왔어?」에 답을 기다리는 개체 — 그 답이 앞말과 어긋나면 −1 */
let flatReplyFrom: string | null = null;
/** 관문 ① 에서 한 번 봐줬다 */
let unknownOnce = false;
/** 「막아준다」는 판에 한 번 */
let coverUsed = false;
/** 굉음의 창 — 열려 있는 동안 콘솔 쪽으로 돌아보면 걸린다 */
let protocol: { until: number; facingAtStart: boolean; done: boolean } | null = null;
let rumorsLeft = 0;
/** 어둠 국면의 콘솔 — 「또 만진다」를 키 반복마다 세지 않게 */
let consoleNextAt = 0;
/**
 * 「위치를 고수하라」가 나갔나 — 그 줄(LOCKDOWN_LINES 의 보안 공지) 전의 자리 이탈은 벌하지 않는다: 명령을 듣기 전에 걷던 걸음이 +10 이 되면
 * 설명이 안 되는 의심이다. 저장소(central2)는 그래도 자리를 다시 잡는다 — 명령이 나가는 순간 선 자리가 고정된다
 */
let holdArmed = false;

function resetCentral2() {
  slotUnits = [];
  holdArmed = false;
  reunion = [];
  rumorPress = false;
  escort = false;
  recognized.clear();
  flatReplyFrom = null;
  unknownOnce = false;
  coverUsed = false;
  protocol = null;
  rumorsLeft = 0;
  consoleNextAt = 0;
  yawNow = undefined;
}

/** 그 점을 본다 — 각도를 손으로 적으면 방을 옮길 때마다 하나씩 어긋난다 (Room2Scene 의 look 과 같은 규약) */
const lookAt = (from: Readonly<Vec2>, to: Readonly<Vec2>) => Math.atan2(to.x - from.x, to.z - from.z);

/**
 * 들어섰다 — 밝음. **누가 먼저 와 있나**를 여기서 정한다 (레벨 설계 07 · 슬롯 표).
 * 재회 둘은 문 ① 정면 좌우(홀)에 스폰을 보고 서고, 씨앗 둘은 코어권에 선다. 빈 슬롯은 배경으로 채운다 —
 * 아무하고도 안 엮인 판은 벌이 아니라 결과다: 아무도 나를 모르는 방이 된다 (NOBODY_KNOWS_ME).
 */
function enterCentral2(now: number) {
  central2.reset();
  // 국면의 시계(코어권 8 초 · 입장 90 초)는 조작권부터 — 손도 안 댄 판에 문 넷이 닫히면 「내가 당겼다」가 없다. 그 전의 tick 은 아무 일도 안 돌려준다
  afterControl(0, () => central2.enter(performance.now()));

  const candidates = units.all().map((u) => ({
    id: u.id,
    stage: units.stage(u.id),
    met: units.met(u.id),
    agent: !!u.agent,
    fragments: fragments.heldBy(u.id).length,
  }));
  // 검문 앞줄 둘(bg-c2-044 · bg-c2-128)은 열에 있지만 슬롯에 안 선다 — 제 자리가 검문 지점이다
  const exclude = [...SLOT_EXCLUDE, ...units.all().filter((u) => u.id.startsWith('bg-')).map((u) => u.id)];
  const picked = pickSlots({ candidates, fixed: ROOM_UNITS.central2, exclude });
  reunion = picked.reunion;
  slotUnits = [...picked.reunion, ...picked.seeds];

  const spawn = SPAWN2.central2;
  const extra: Scene2State['extra'][number][] = [];
  /** 뽑힌 것이 없으면 **그 자리는 빈다** — 레벨 설계 07 의 「없으면 배경 개체」를 지금은 일부러 안 따른다 (위 주석) */
  const stand = (slot: Readonly<Vec2>, id: string | undefined) => {
    if (!id) return;
    extra.push({ id, x: slot.x, z: slot.z, heading: lookAt(slot, spawn) });
  };
  REUNION_SLOTS.forEach((s, i) => stand(s, picked.reunion[i]));
  SEED_SLOTS.forEach((s, i) => stand(s, picked.seeds[i]));
  patch({ extra });

  const t = play(CENTRAL2_ARRIVE, 700);
  // 도착 대사가 끝난 뒤에야 아는 얼굴을 알아본다 — 「…중앙 시설입니다」보다 먼저 「…아까 그 개체다」가 나오면 안 된다
  later(700 + t, () => {
    fired.add('arrived');
    checkKnownFace(meAt);
  });
  patch({ objective: OBJ_CROSS_HALL });
  rumorsLeft = RUMOR_AT_MS.length;
  // 소문은 조작권부터 20 초 · 70 초 — 나에게 오는 말이다
  for (const at of RUMOR_AT_MS) afterControl(at, rumorArrives);
}

/** 아는 얼굴 — 도착 대사가 끝난 뒤, 재회 개체가 판독 거리 안에 든 순간. 있겠지가 아니라 있다 */
function checkKnownFace(me: Readonly<Vec2>) {
  if (fired.has('face') || !fired.has('arrived')) return;
  if (!reunion.some((id) => within(id, me, KNOWN_FACE_M))) return;
  fired.add('face');
  play(CENTRAL2_KNOWN_FACE);
}

/** 한 프레임의 중앙 시설 — 국면 저장소가 알려 준 일에 값을 물리고, 자리로 켜지는 것들을 본다 */
function tickCentral2(now: number, x: number, z: number) {
  // 손을 대기 전에는 자리도 국면도 안 본다 — 그늘 · 코어권 · 아는 얼굴은 내가 걸어가서 드는 것이다
  if (!control.taken()) return;
  const me = { x, z };
  const zn = zone(me);
  for (const ev of central2.tick(now, me, zn)) {
    if (ev === 'coreEnter') onCoreEnter();
    else if (ev === 'shadowLinger') {
      // 지나가는 개체가 — 「거기서 뭐 해」. 그늘의 목격 반경(4 m) 안에 있는 것만 봤다
      const id = nearestUnit(roster('central2'), me, witnessRadius('shadow'));
      // 지나가며 — 다가와 한마디 하고 제 길로 간다(resume). 창은 없다. 값은 말이 나간 순간에
      if (id) addressUnit(id, cast([SHADOW_LINGER_SAY]), { then: 'resume', onSpoken: () => units.shift(id, SHADOW_LINGER.attitude) });
    } else if (ev === 'lockdown') onLockdown();
    else if (ev === 'holdBreak') {
      // 「위치를 고수하라」를 들은 뒤부터만 — 그 전의 이탈은 저장소가 자리만 다시 잡는다 (holdArmed)
      if (holdArmed) {
        play(HOLD_BREAK);
        suspicion.bump(LOCKDOWN.suspicion, REASON.이동);
      }
    } else if (ev === 'doorOpen') onDoorOpen();
  }
  const c = central2.get();

  if (c.phase === 'bright' && zn === 'shadow' && !fired.has('shadow')) {
    fired.add('shadow');
    play(SHADOW_ENTER);
  }

  // 아는 얼굴 — 도착 대사 뒤, 판독 거리 안에 들어온 순간
  checkKnownFace(me);

  // 관문의 시간이 다 됐다 — 답을 안 한 것도 답이다
  if (central2.gateExpired(now)) answerGate('', true);

  // 굉음 — 창이 열려 있는 동안 콘솔 쪽으로 돌아보면 걸린다. 견디면 아무 말도 없다 (−2)
  if (protocol && !protocol.done) {
    if (now >= protocol.until) {
      protocol.done = true;
      suspicion.bump(-2, '침착');
    } else if (yawNow !== undefined && !protocol.facingAtStart && facingToward(yawNow, me, CENTRAL2_CONSOLE, PROTOCOL.lookDeg)) {
      protocol.done = true;
      speak('guard21', [PROTOCOL_LOOKED]);
      suspicion.bump(GATE_PENALTY, REASON.돌아봄);
    }
  }

  if (c.phase === 'dark') {
    // 내려간 코어 앞 — 세계관을 인물이 말하는 유일한 자리. 코어 앞에 누가 서 있느냐는 그 판이 정한다
    if (!fired.has('dark-core') && distToCore(me) <= FIELD.core.r) {
      // 「개체 (코어 앞)」 — 어둠의 판독 거리(DARK.read 4 m) 안에 선 것만. 문가의 것이 12 m 밖에서 말하면 코어 앞이 아니다. 없으면 줄도 없다
      const id = nearestUnit(roster('central2'), me, DARK.read);
      if (id) {
        fired.add('dark-core');
        const t = playCast(DARK_CORE, id);
        if (c.consoleUsed) {
          // 「아까」가 말 그대로 아까다 — 이 개체는 그걸 기억한다
          speak(id as keyof typeof SPEAKER, [DARK_CONSOLE_EARLIER], t + 600);
          units.shift(id, -2);
        }
      }
    }
    if (!fired.has('nobody') && reunion.length === 0 && now >= c.darkAt + 4000) {
      fired.add('nobody');
      play(NOBODY_KNOWS_ME);
    }
  }
}

/** 코어권 6 m 에 처음 들어섰다 — 몸이 다 읽히는 자리. 2.5 초 뒤 곁의 개체가 그걸 읽는다 */
function onCoreEnter() {
  play(CORE_RING_ENTER);
  later(2500, () => {
    // 「개체 (코어권)」 — 제 몸이 코어권(FIELD.core.r) 안에 선 것만. 문가의 것이 12 m 밖에서 내 몸을 읽을 수는 없다. 없으면 이 줄도 값도 없다
    const inCore = placed(roster('central2')).filter((u) => distToCore(u) <= FIELD.core.r);
    const id = nearestWithin(inCore, meAt, Infinity);
    if (!id) return;
    // 같은 관찰이 다르게 나온다 — 이미 +2 인 개체에게는 부러움이다. 코어권의 그 개체가 돌아서서 다가와 말한다 — 값은 말이 나간 순간에
    if (units.stage(id) >= 2) addressUnit(id, cast([CORE_RING_ENVY]));
    else addressUnit(id, cast([CORE_RING_NEW_BODY]), { onSpoken: () => suspicion.bump(CORE_READ_SUSPICION, REASON.몸) });
  });
}

/**
 * 소문이 먼저 와 있다 — 이 게임에서 가장 중요한 새 씬. 나를 **못 본** 개체의 입으로: 옮겨 온 조각(hops > 0)이나 출처가 지워진 조각만.
 * 혼자 도는 판에서는 조각이 전부 내 것이라 「…내 말이다」다 (3 인이 붙으면 RUMOR_NOT_MINE 이 갈린다)
 */
function rumorArrives() {
  if (rumorsLeft <= 0 || central2.get().phase !== 'bright' || gateOpen()) return;
  let best: { id: string; f: ReturnType<typeof fragments.heldBy>[number]; d: number } | null = null;
  for (const u of placed(roster('central2'))) {
    for (const f of fragments.heldBy(u.id)) {
      if (f.hops === 0 && f.from !== null) continue;
      const d = Math.hypot(u.x - meAt.x, u.z - meAt.z);
      if (!best || d < best.d) best = { id: u.id, f, d };
    }
  }
  if (!best) return;
  rumorsLeft -= 1;
  // 곁의 개체가 2 m 안까지 와서 — 「…내 말이다」는 그 말 뒤에
  addressUnit(best.id, cast([RUMOR_LINES[rumorLine(best.f)]]), { approachTo: 2, onSpoken: (t) => play(RUMOR_MINE, t + 400) });
}

/**
 * 락다운 — 불변점. 문 넷이 닫히고 **내 자리가 고정된다.** 그 순간 4 m 안에 누가 있느냐가 이 방의 나머지 전부를 정한다:
 * 검문을 지켜보는 개체 · press 때 감싸 줄 개체 · 나쁜 조각을 처음 받을 개체 · 의심도 100 에 사이에 설 개체.
 */
function onLockdown() {
  // 위치 고수는 A 계열에게만 내려온 명령이라, 태도 높은 재회 개체가 두 걸음 오는 것은 규칙 위반이 아니다 — 그 개체가 검문의 첫 목격자가 된다 (대본 LOCKDOWN)
  const calm = stepBeside(reunion.find((id) => units.stage(id) >= 2) ?? null);
  // 「위치를 고수하라」 줄에서 목표가 서고, 그때부터 자리 이탈이 값이 된다
  const t = play(LOCKDOWN_LINES, 0, {
    6: () => {
      holdArmed = true;
      patch({ objective: fill(OBJ_HOLD) });
    },
  });
  later(t + 400, () => {
    const me = meAt;
    const r = roster('central2');
    let at = 0;
    // 밝음 국면의 발걸음이 여기서 이름을 얻는다 — 두 걸음 온 개체도 이제 4 m 안이다
    const beside = r.find((id) => units.stage(id) >= 2 && within(id, me, LOCKDOWN.interveneR));
    if (beside) at += play(LOCK_BESIDE, at);
    else if (zone(me) === 'shadow') at += play(LOCK_ALONE, at);
    // 두 걸음 와 선 개체가 **나를 보고** 말한다 — 이미 곁이라 걸어오지는 않는다. 앞 줄들이 끝난 뒤(address 가 busyUntil 을 본다)
    if (calm) {
      addressUnit(calm, cast([LOCK_STAY_CALM]));
      at += lengthOf([{ who: calm as Line['who'], text: LOCK_STAY_CALM }]);
    }
    later(at, () => patch({ objective: OBJ_HIDE }));
    later(at + 6000, () => {
      patch({ objective: OBJ_QUEUE });
      const t2 = play(ROLL_LINES);
      later(t2, startGate1);
    });
    // 총 든 둘이 홀로 내려와 하나씩 세운다 · 그 사이 하나가 자리를 벗어나 쓰러진다 (HOLD_CHECKS · HOLD_BREACH)
    later(at + HOLD_CHECKS_AT_MS, startHoldChecks);
    later(at + HOLD_BREACH_AT_MS, breachDuringHold);
  });
}

/* ── HOLD_CHECKS · HOLD_BREACH — 락다운의 군중 (2026-09-03 사용자) ── */

/** 「위치를 고수하라」 뒤 — 총 든 둘이 내려오는 때 · 하나가 자리를 벗어나는 때 (나의 검문 ROLL 은 +6 s 라 셋이 겹친다 — 그게 긴장이다) */
const HOLD_CHECKS_AT_MS = 3000;
const HOLD_BREACH_AT_MS = 9000;
/** 총 든 개체의 걸음(patrol BEATS 의 순찰 속도)과 검문 한 자리의 박자 */
const HOLD_WALK_MPS = 0.95;
const HOLD_ASK_AFTER_MS = 600;
const HOLD_ANSWER_MS = 1500;
const HOLD_NEXT_MS = 1400;
/** 총 든 개체가 개체 앞에 서는 거리 · 처리되는 개체가 걷는 거리(문까지 못 간다) · 겨눔에서 발사까지 */
const HOLD_STOP_M = 1.6;
const HOLD_BREACH_HALT_MS = 1900;
const HOLD_BREACH_SHOT_MS = 3200;
const HOLD_BREACH_LINES_MS = 4200;
const HOLD_GUARDS = ['guard22', 'guard23'] as const;
/** ROLL 이 세우는 둘은 UNIT-21 의 것이다 — 다른 둘이 또 묻지 않는다 */
const ROLL_UNITS = ['bg-c2-044', 'bg-c2-128'];
let holdVictim: string | null = null;
/** 쓰러진 개체 — Unit 이 몸을 눕힌다. 방을 옮겨도 남는 것은 아니다(그 방의 일) */
const fallen = new Set<string>();
/** 겨누는 개체와 그 발사 시각 — Unit 의 EnforcerBody 가 자세와 총구 섬광을 여기서 읽는다 */
let aimingId: string | null = null;
const shotAtOf = new Map<string, number>();

/** 머리 위 말풍선 한 마디 — 나와 주고받는 말이 아니라(로그에 안 남긴다) 방 곳곳의 검문 소리다 */
function bubbleSay(id: string, text: string) {
  const s = speakerOf(id);
  emit?.({ nickname: fill(s.name), text: fill(text), portrait: s.portrait, self: false, bubble: id, quiet: true });
}

function distOf(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * 총 든 둘이 각각 홀의 개체를 하나씩 세우고 번호를 묻는다 — 물음도 답도 말풍선. 같은 물음이 방 곳곳에서 들리고 그중 하나(UNIT-21)가 나에게 온다.
 * 배정은 가까운 쪽으로. ROLL 의 둘 · 처리될 개체 · 총 든 것들은 뺀다
 */
function startHoldChecks() {
  if (state.room !== 'central2' || central2.get().phase !== 'lockdown') return;
  const guards = HOLD_GUARDS.filter((g) => unitAt.has(g));
  if (!guards.length) return;
  holdVictim = pickVictim();
  const targets = roster('central2').filter((id) => !HOLD_GUARDS.includes(id as (typeof HOLD_GUARDS)[number]) && id !== 'guard21' && id !== holdVictim && !ROLL_UNITS.includes(id) && unitAt.has(id));
  const lists = new Map<string, string[]>(guards.map((g) => [g, []]));
  for (const id of targets) {
    const p = unitAt.get(id)!;
    const g = guards.reduce((best, cur) => (distOf(unitAt.get(cur)!, p) < distOf(unitAt.get(best)!, p) ? cur : best), guards[0]);
    lists.get(g)!.push(id);
  }
  for (const g of guards) {
    let from = { x: unitAt.get(g)!.x, z: unitAt.get(g)!.z };
    const list = lists.get(g)!.sort((a, b) => distOf(unitAt.get(a)!, from) - distOf(unitAt.get(b)!, from));
    let t = 0;
    for (const id of list) {
      const to = { x: unitAt.get(id)!.x, z: unitAt.get(id)!.z };
      const walkMs = (Math.max(0, distOf(from, to) - HOLD_STOP_M) / HOLD_WALK_MPS) * 1000 + HOLD_ASK_AFTER_MS;
      later(t, () => {
        if (central2.get().phase !== 'lockdown' || fallen.has(id)) return;
        patrol.approach(g, to, { stopAt: HOLD_STOP_M, then: 'stand' });
      });
      later(t + walkMs, () => {
        if (central2.get().phase !== 'lockdown' || fallen.has(id)) return;
        patrol.stare(id, unitAt.get(g) ?? to, HOLD_ANSWER_MS + HOLD_NEXT_MS);
        bubbleSay(g, HOLD_CHECK_ASK);
      });
      later(t + walkMs + HOLD_ANSWER_MS, () => {
        if (central2.get().phase !== 'lockdown' || fallen.has(id)) return;
        bubbleSay(id, `${units.label(id)}.`);
      });
      t += walkMs + HOLD_ANSWER_MS + HOLD_NEXT_MS;
      from = to;
    }
  }
}

/** 자리를 벗어날 개체 — 홀의 배경 중 나에게서 가장 먼 것. 없으면 없다(그 판엔 처리가 없다) */
function pickVictim(): string | null {
  const bg = roster('central2').filter((id) => /^bg-c2-\d+$/.test(id) && !ROLL_UNITS.includes(id) && unitAt.has(id));
  if (!bg.length) return null;
  return bg.reduce((best, cur) => (distOf(unitAt.get(cur)!, meAt) > distOf(unitAt.get(best)!, meAt) ? cur : best), bg[0]);
}

/**
 * 위치 고수 중 하나가 자리를 벗어난다 — 옆문 쪽으로. SYSTEM 이 잡고, 가장 가까운 총 든 개체가 돌아서서 「정지.」, 한 발.
 * 그 자리에 쓰러진 채 남는다. 홀의 개체들이 1.2 초 그쪽을 보고 다시 앞을 본다. 방이 차가워지고(central2.terminate) 경보도 +25.
 * 「위치를 고수하라」가 말이 아니라 사실이 되는 자리다 — 그 뒤 내 0.6 m 도 같은 규칙이라는 것을 안 말해도 안다
 */
function breachDuringHold() {
  if (state.room !== 'central2' || central2.get().phase !== 'lockdown') return;
  const victim = holdVictim ?? pickVictim();
  if (!victim) return;
  const guards = HOLD_GUARDS.filter((g) => unitAt.has(g));
  if (!guards.length) return;
  const vp = unitAt.get(victim)!;
  const shooter = guards.reduce((best, cur) => (distOf(unitAt.get(cur)!, vp) < distOf(unitAt.get(best)!, vp) ? cur : best), guards[0]);
  const door = [CENTRAL2_DOORS.d3, CENTRAL2_DOORS.d4].reduce((best, cur) => (distOf(cur, vp) < distOf(best, vp) ? cur : best));
  // 걷기 시작 — 문까지는 못 간다
  patrol.approach(victim, door, { stopAt: 1.2, then: 'stand' });
  later(900, () => play(HOLD_BREAK));
  later(HOLD_BREACH_HALT_MS, () => {
    if (central2.get().phase !== 'lockdown') return;
    aimingId = shooter;
    patrol.stare(shooter, unitAt.get(victim) ?? vp, HOLD_BREACH_SHOT_MS + 2000);
    bubbleSay(shooter, HOLD_BREACH_HALT);
  });
  later(HOLD_BREACH_SHOT_MS, () => {
    if (central2.get().phase !== 'lockdown') return;
    const at = unitAt.get(victim) ?? vp;
    gunshot();
    shotAtOf.set(shooter, performance.now());
    // 선 자리에서 쓰러진다 — 자리는 그대로 남기되(남이 비켜 간다) 말 걸기 대상도 목격자도 아니다
    patrol.pin(victim, at.x, at.z, patrol.of(victim)?.heading ?? 0, true);
    fallen.add(victim);
    unitAt.delete(victim);
    for (const id of roster('central2')) if (id !== victim && id !== shooter && unitAt.has(id)) patrol.stare(id, at, STARE_MS);
    central2.terminate(victim);
    raiseAlert(DEATH_ALERT);
  });
  later(HOLD_BREACH_LINES_MS, () => {
    aimingId = null;
    play(HOLD_BREACH_LINES);
  });
}

/** 두 걸음 — 내 고정 자리에서 이만큼 곁에 선다. 개입 반경(4 m) 안이고 말 거는 거리(2.6 m) 안이다 */
const CALM_STEP_M = 1.5;

/**
 * 그 개체가 두 걸음 다가와 선다 — 슬롯 자리(state.extra)를 고정된 내 자리 곁으로 옮긴다.
 * extra 가 바뀌면 Room2Scene 이 patrol 을 다시 세우고 Unit 이 다음 프레임에 그 자리를 적는다; 곁 판정은 기다리지 않게 여기서 먼저 적어 둔다.
 * 옮긴 id 를 돌려주고, 자리가 없는 것(아직 안 선 개체)이면 null — 그러면 그 줄도 없다
 */
function stepBeside(id: string | null): string | null {
  if (!id) return null;
  const hold = central2.get().holdPos ?? meAt;
  const from = unitAt.get(id) ?? state.extra.find((e) => e.id === id);
  if (!from) return null;
  let dx = from.x - hold.x;
  let dz = from.z - hold.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) {
    dx = 1;
    dz = 0;
  } else {
    dx /= len;
    dz /= len;
  }
  const to = { x: hold.x + dx * CALM_STEP_M, z: hold.z + dz * CALM_STEP_M };
  patch({ extra: state.extra.map((e) => (e.id === id ? { ...e, x: to.x, z: to.z, heading: lookAt(to, hold) } : e)) });
  unitAt.set(id, { x: to.x, z: to.z, still: true });
  return id;
}

/** 관문이 열려 있나 — 열려 있는 동안 Enter 한 마디는 검문의 답이고, 듣는 것은 경비다 */
function gateOpen(): boolean {
  if (state.room !== 'central2') return false;
  const c = central2.get();
  return c.gate >= 1 && c.gate <= 3 && c.gateUntil > 0;
}

/** 이 방의 누군가가 「번호」가 든 조각을 들고 있나 — 내 조각이 이 자리에 도착해 있다 (press) */
function rumorHeld(re: RegExp): boolean {
  return roster('central2').some((id) => fragments.heldBy(id).some((f) => re.test(f.text)));
}

/**
 * 관문 ① roll — 번호를 대라. press 가 붙었으면 문답이 하나 더 붙고, 그때 곁 4 m 안에 +2 개체가 있으면 **막아준다** (판당 한 번).
 * 시간은 press 줄이 끝난 뒤부터 15 초(경보 ≥ 40 이면 12 초) — 관문은 줄이 나가는 동안 이미 열려 있어, 그 사이의 한 마디도 답이다.
 */
function startGate1() {
  patch({ objective: identity.get().known ? OBJ_ROLL : OBJ_ROLL_UNKNOWN });
  let t = 0;
  let pressed = false;
  if (rumorPress) {
    // 몇 초 전의 말이 바로 돌아온다 — 전파 거리 0
    t += speak('guard21', [GATE1.rumorPress]);
    pressed = true;
  } else if (rumorHeld(/번호/)) {
    t += speak('guard21', GATE1.press);
    pressed = true;
  }
  if (pressed && !coverUsed) {
    const c = roster('central2').find((id) => id !== 'guard21' && units.stage(id) >= 2 && within(id, meAt, INTERVENE_R));
    if (c) {
      coverUsed = true;
      rumorPress = false;
      t += speak(c, [GATE1.coverSay], t);
      t += speak('guard21', [GATE1.coverAck], t);
      // 원장 「나를 위해 나선 적 있다」 — 여덟 걸음과 마지막 방의 STAND_IN 조건이 여기서 처음 만들어진다 (D19)
      standUpFor.add(c);
      units.markStandsFor(c);
      units.mark(c);
      /*
       * 「……그래. 가.」— 경비가 보냈다. 막아준 판은 관문 ① 을 **지난 것으로 친다** (대본 「막아준다 … press 하나를 걷어 준다」의 그 「가」):
       * 「번호 맞아」라는 보증을 받고도 번호를 대라고 하면, 명판을 안 읽은 판이 막아준 뒤에 +25 로 죽는다. 다음은 굉음이다
       */
      later(t + 800, startProtocol);
      return;
    }
  }
  central2.startGate(1, performance.now(), t + gateMs(alert.get()));
}

/**
 * 관문의 답 — Enter 한 마디. **단가표(talk.say)를 안 거친다**: 태도가 움직이는 자리가 아니라 사실을 대조하는 자리다.
 * 판정은 gates.ts 의 순수 함수이고, 여기서는 그 갈래에 값을 물린다. `timeout` 이면 답을 안 한 것 = 모른다.
 */
function answerGate(text: string, timeout = false) {
  const c = central2.get();
  if (!gateOpen()) return;
  const now = performance.now();

  if (c.gate === 1) {
    let g: RollGrade;
    if (timeout) g = unknownOnce ? 'bad' : 'unknown';
    else {
      const r = read(text);
      g = gradeRoll({
        text,
        known: identity.get().known,
        matchUnit: identity.matchUnit(text),
        wobble: r.wobble,
        lieTag: r.tag === 'lie',
        crossTag: r.tag === 'cross',
        secondUnknown: unknownOnce,
      });
    }
    if (g === 'unknown') {
      // 한 번만 봐준다 — 같은 관문이 다시 열린다
      unknownOnce = true;
      speak('guard21', [GATE1.unknown]);
      central2.startGate(1, now, gateMs(alert.get()));
      return;
    }
    central2.endGate();
    let t = 0;
    if (g === 'ok') t = speak('guard21', [GATE1.ok]);
    else if (g === 'okMarked') {
      escort = true;
      t = speak('guard21', [GATE1.okMarked]);
    } else {
      t = speak('guard21', [GATE1.bad]);
      suspicion.bump(SUMMARY_BUMP, REASON.기록불일치);
    }
    later(t + 800, startProtocol);
    return;
  }

  if (c.gate === 2) {
    const g = timeout ? 'deny' : classifyFear(text);
    central2.endGate();
    // 위로 조각이 이 자리에 와 있으면 — **답한 뒤, 판정 앞에** 두 줄이 먼저 붙는다 (대본 「세 갈래 앞에 한 줄이 먼저 붙는다」). 「무서운 건 모른다고?」는 답을 들은 뒤의 말이다
    let t = rumorHeld(/쉬/) ? speak('guard21', GATE2.rumor) : 0;
    t += speak('guard21', [GATE2[g]], t);
    if (g === 'admit') suspicion.bump(GATE_PENALTY, REASON.인정);
    later(t + 800, startGate3);
    return;
  }

  const g = timeout ? 'unknown' : gradeMemory({ text, matchSector: identity.matchSector(text) });
  central2.endGate();
  const t = speak('guard21', [GATE3[g]]);
  if (g === 'unknown') escort = true;
  else if (g === 'wrong') suspicion.bump(SUMMARY_BUMP, REASON.기록불일치);
  later(t + 800, verdict);
}

/**
 * PROTOCOL · TEST1 — 굉음은 왼쪽 벽 콘솔. 목표를 안 준다 — 정답은 화면에 이미 있다(아무도 안 돌아본다).
 * 창이 열릴 때 이미 콘솔을 보고 있던 시선은 「돌아봄」이 아니다 (facingAtStart)
 */
function startProtocol() {
  patch({ objective: null });
  play(PROTOCOL_LINES, 0, {
    0: () => {
      const now = performance.now();
      protocol = {
        until: now + PROTOCOL.windowMs,
        facingAtStart: yawNow !== undefined && facingToward(yawNow, meAt, CENTRAL2_CONSOLE, PROTOCOL.lookDeg),
        done: false,
      };
    },
  });
  later(PROTOCOL.windowMs + 800, startGate2);
}

/** 관문 ② fear — 대조할 사실이 없는 유일한 관문. 위로 조각이 이 자리에 와 있으면 그 말이 먼저 나를 문다 */
function startGate2() {
  // 묻는 것이 먼저다 — 위로 조각의 두 줄은 답을 들은 뒤에 붙는다 (answerGate)
  const t = speak('guard21', [GATE2_ASK]);
  patch({ objective: OBJ_FEAR });
  central2.startGate(2, performance.now(), t + gateMs(alert.get()));
}

/**
 * 관문 ③ memory — 답은 복도에서 읽어 왔어야 한다. 개체에게 「구역」을 **들리게** 물어봤던 판은 그 흔적(조각)이 여기 먼저 와 있다 —
 * 「읽기는 안전하고 느리다, 묻기는 빠르고 흔적을 남긴다」. 아무도 안 들은 물음은 흔적이 없다 — 목격자가 없는 것이 은폐다
 */
function startGate3() {
  let t = play(GATE3_LINES);
  const asked = fragments.all().some((f) => f.from === '나' && /구역|섹터/.test(f.text));
  if (asked) t += speak('guard21', [GATE3.asked], t);
  patch({ objective: identity.get().known ? OBJ_MEMORY : OBJ_MEMORY_UNKNOWN });
  central2.startGate(3, performance.now(), t + gateMs(alert.get()));
}

/** VERDICT · DIM — 식별 실패 · 코어가 내려간다. 「검증 준비」 줄에서 어둠이 시작된다 */
function verdict() {
  let atCore = false;
  const t = play(VERDICT_DIM_LINES, 0, {
    4: () => {
      atCore = zone(meAt) === 'core';
      central2.verdict(performance.now());
      // 어둠이 시작되는 그 줄에서 목표도 바뀐다 — 「작업 통로는 다음 주기에 개방한다」를 듣는 순간이 기다림의 시작이다
      patch({ objective: OBJ_WAIT_DARK });
    },
  });
  later(t, () => {
    // 몸이 다 읽히던 자리가 어두워지는 것을 본다
    if (atCore) play(DIM_HERE);
  });
}

/** 주기가 돌아온다 — 문 ② 가 열린다. +2 재회 개체는 마지막 방에 온다 */
function onDoorOpen() {
  fired.add('door2');
  let t = play(LEAVE_CORE_LINES);
  const friend = reunion.find((id) => units.stage(id) >= 2);
  if (friend) t += speak(friend as keyof typeof SPEAKER, [LEAVE_SEE_YOU], t);
  later(t, () => patch({ objective: '작업 구역으로 — 문 ②' }));
}

/**
 * RECOGNIZED — 재회 개체에게 건 **첫 마디**는 단가표가 아니라 대본이다. 태도에 따라 갈린다 (script RECOGNIZED_*).
 * 처리했으면 true 를 돌려주고, 그러면 say 는 거기서 끝난다 (조각도 값도 없다 — 알아보는 것은 내가 한 말이 아니다).
 */
function recognize(id: string, line: string): boolean {
  if (state.room !== 'central2' || !reunion.includes(id)) return false;
  const n = recognized.get(id) ?? 0;
  const stage = units.stage(id);
  if (n === 0) {
    recognized.set(id, 1);
    units.meet(id);
    // 이미 곁이다(내가 걸어가 말을 걸었다) — 나를 보고 답한다. 700 은 대답의 숨
    // 내가 걸어가 건 말의 답이다(solicited) — 저쪽이 먼저 거는 말의 뜸을 안 둔다
    if (stage >= 2) addressUnit(id, cast(RECOGNIZED_UP), { solicited: true, delayMs: 700 });
    else if (stage <= -2) {
      // 침묵하고 — 곁의 개체에게 한 마디. 조각이 하나 생긴다, 나쁜 쪽으로 · 전파 거리 0
      addressUnit(id, cast([RECOGNIZED_DOWN]), {
        solicited: true,
        delayMs: 700,
        onSpoken: (t) => {
          const p = unitAt.get(id);
          const aside = p ? nearestUnit(roster('central2').filter((o) => o !== id), p, INTERVENE_R) : null;
          if (!aside) return;
          speak(aside as keyof typeof SPEAKER, [RECOGNIZED_DOWN_ASIDE], t + 400);
          fragments.make({ text: '쟤 아까 그 애야', topic: '지목', from: id, where: ROOM_TITLE.central2, tags: ['모순'], witnesses: [aside] });
          rumorPress = true;
        },
      });
    } else {
      /*
       * 「어디 있다 왔어?」— 4 초 창. 답이 오면 그 한 마디가 곧 거짓 대조의 자료다(단가표를 그대로 타되 flatReply 로).
       * 창이 닫히면 표(flatReplyFrom)만 남겨 둔다 — 나중에 이 개체에게 건 첫 마디가 그 답으로 읽힌다 (예전 규칙 그대로)
       */
      flatReplyFrom = id;
      addressUnit(id, cast(RECOGNIZED_FLAT), {
        solicited: true,
        delayMs: 700,
        answerMs: FLAT_ANSWER_MS,
        onAnswer: (text) => {
          flatReplyFrom = null;
          sayTo(id, text, true);
        },
      });
    }
    return true;
  }
  if (n === 1 && stage >= 2) {
    // 한 번 더 걸면 — 눈앞의 검문을 알려 준다. 정보의 방향이 앞으로 바뀌었다
    recognized.set(id, 2);
    speak(id as keyof typeof SPEAKER, [RECOGNIZED_UP_AGAIN], 700);
    units.shift(id, 1);
    return true;
  }
  // 「어디 있다 왔어?」의 답은 여기서 안 읽는다 — 읽기(read)는 앞말 표를 덮으므로 한 마디에 한 번뿐이다. say 가 단가표의 판독을 그대로 쓴다
  return false;
}

/**
 * 콘솔 — 코어 출력을 내린다. 밝음 · 락다운에서 판에 한 번: 15 초 어둠 · 본 개체 전원 태도 −1 · 경보 +12 (corefield.CONSOLE).
 * 소리를 지르는 것과 같다 — 그늘의 목격 반경(4 m)만큼만 봤지만, 경보는 구역 전체가 안다.
 * 어둠 국면(이미 내려가 있다)에서는 아무것도 못 내린다 — 그래도 만지면 곁의 개체가 본다: 「또 만진다」 −1
 */
function useConsole() {
  if (state.room !== 'central2' || !state.consoleNear) return;
  const now = performance.now();
  if (central2.dim(now)) {
    consoleSignal(roster('central2'));
    return;
  }
  // 어둠 국면에서만 — 「…이미 내려갔어」는 내려가 있을 때의 말이다. 밝음 · 락다운에서 한 번 쓴 뒤의 두 번째 누름은 아무것도 아니다
  if (central2.get().phase !== 'dark' || now < consoleNextAt) return;
  consoleNextAt = now + 3000;
  // 곁의 개체가 본다 — 어둠의 판독 거리(DARK.read) 안
  const id = nearestUnit(roster('central2'), meAt, DARK.read);
  if (!id) return;
  speak(id, [DARK_CONSOLE_NOW]);
  units.shift(id, -1);
}

/**
 * 콘솔의 값 — 중앙 시설 규칙 04 「본 개체 전원 태도 −1 · 경보 +12」(corefield.CONSOLE). 조명이 내려가는 것은 **구역 전체가 보는 신호**라
 * 명부 전원이다 — 그늘의 목격 반경 4 m 로 자르면 콘솔이 벽 그늘에 있어 아무도 값을 안 치른다. 조각도 같은 전원에게 남는다.
 * 시험이 명부를 넘겨 돌린다
 */
export function consoleSignal(ids: readonly string[]): void {
  for (const id of ids) units.shift(id, CONSOLE.attitude);
  raiseAlert(CONSOLE.alert);
  fragments.make({ text: '코어 출력을 내렸다', topic: '콘솔', from: '나', where: ROOM_TITLE.central2, tags: ['모순'], witnesses: [...ids] });
}

/* ── 작업 구역 — 불로 걸어 들어가는 것 ── */

/**
 * 두 주기(40 초 × 2) · 소각로(첫 주기 12 초, 폴백 25 초) · 막았나 · LEAVE_WORK — 전부 furnace(W3) 의 상태기다.
 * 여기는 들어설 때 시계를 맞추고(start), 프레임마다 자리를 넘기고(tick), 처음 가까이 본 두 개체의 속마음만 낸다
 */
/** A-012 · A-063 을 처음 가까이 봤을 때의 속마음이 켜지는 거리 (대본 ARRIVE_WORK 「5 m 안」 · 「8 m 안」) */
const SEE_012_M = 5;
const SEE_063_M = 8;

/** 대체 개체가 걷는가 — furnace 의 표(substitute). Unit 의 pose 'fire-sub' 가 읽는다 (W5 계약) */
let subWalking = false;

/**
 * 열하루째가 불로 걷고 있나 — Unit 의 pose 'fire' 가 프레임마다 읽는다.
 * 국면이 아니라 furnace 의 걷기 표(fireWalk)다: 8 초에 국면은 let 으로 넘어가지만 몸은 불 입구까지 마저 걷는다 — 국면을 읽으면
 * 바닥 한가운데서 멎은 채 영영 안 사라진다 (furnace 는 입구에 닿은 자리를 보고서야 vanish 를 부른다)
 */
export function fireWalkActive(): boolean {
  return furnace.fireWalk();
}
export function substituteWalkActive(): boolean {
  return subWalking || furnace.get().substitute;
}

function enterWork() {
  play(ARRIVE_WORK, 700);
  patch({ objective: OBJ_WORK });
  // 주기 · 소각로의 폴백 25 초는 조작권부터 — 손도 안 댄 판에 「A-201. 투입.」이 나가면 8 초는 아무의 8 초도 아니다. 그 전의 tick 은 host 가 없어 아무것도 안 한다
  afterControl(0, () => furnace.start(host, performance.now()));
}

/** 「처음 가까이 봤다」— 반경 안이고 **그쪽을 보고 있다**(각). 스폰이 A-012 의 5 m 안이라 거리만 재면 들어서는 순간 든다 */
const SEE_DEG = 45;
function sawSpot(x: number, z: number, spot: Readonly<Vec2>, r: number): boolean {
  if (!control.taken() || yawNow === undefined) return false;
  const me = { x, z };
  return Math.hypot(x - spot.x, z - spot.z) <= r && facingToward(yawNow, me, spot, SEE_DEG);
}

function tickWork(now: number, x: number, z: number) {
  // 처음 가까이 본 것들 — 효과 없음, 속마음뿐. 보고 있어야 본 것이다
  if (!fired.has('see-012') && sawSpot(x, z, WORK_012_SPOT, SEE_012_M)) {
    fired.add('see-012');
    play(ARRIVE_WORK_012);
  }
  if (!fired.has('see-063') && sawSpot(x, z, WORK_063_SPOT, SEE_063_M)) {
    fired.add('see-063');
    play(ARRIVE_WORK_063);
  }

  // 열하루째의 자리 — 불로 걷는 동안 Unit 이 프레임마다 적는다(place). 없으면(들어갔으면) null
  const u201 = unitAt.get('u201');
  furnace.tick(now, { x, z }, u201 ? { x: u201.x, z: u201.z } : null);

  // 배회 개체 둘의 대화 — 두 번째 주기부터. 소각로가 끝났으면 기억(memorial), 아니면 위험(danger)
  if (overhearNextAt === 0 && furnace.get().cycles >= 1) overhearNextAt = now;
}

/**
 * [E]/[Q] — 갈림이 열려 있으면 그것이고, 아니면 도화선 판이다. 소각로는 이제 여기로 안 온다 (D11) —
 * 판을 띄우면 「8 초 동안 목표가 안 뜬다」가 죽는다. 막는 것은 몸과 말이다 (furnace.tick · say)
 */
export function choose(yes: boolean) {
  const c = state.choice;
  if (c) {
    if (yes) c.onYes();
    else c.onNo();
    return;
  }
  if (state.urgent) patch({ urgent: null });
}

/* ── 창이 있는 방 — 마지막 정적 ── */

function closing() {
  if (fired.has('closing')) return;
  fired.add('closing');
  // 리더가 먼저 일어선다 — 그다음이 소집이다
  const t0 = play(WINDOW_GO);
  const t = play(WINDOW_SUMMON, t0);
  later(t0 + t + 600, () => {
    // 열하루째가 살아 있나 — 불에 안 들어갔어도 걸음 8 에 대신 나섰으면 없는 것이다(gone). 소각로의 표만 보면 그 판이 틀린다
    handover.fill({ u201Alive: !gone.has('u201'), worked: furnace.get().worked });
    handover.save();
    patch({ done: true, objective: OBJ_WINDOW_GO, blackout: 1 });
    later(900, () => onArena?.());
  });
}

/* ─────────────────────────────── 계량기 ─────────────────────────────── */

/* ─────────────────────────────── 집행 ─────────────────────────────── */

/**
 * 의심도 문턱을 넘었다 — **집행자의 자리가 달라진다** (execution.ts).
 * 40 은 방송만 나간다. 60 에서 이 구역에 배치되고, 80 에서 같은 방에 들어오고, 100 에서 걸어온다.
 */
function onSuspicion(t: number) {
  const room = EXEC_ROOM[state.room];
  if (!room) return;
  execution.cross(t, room.walkMs);
  if (t === 40) {
    /*
     * WATCH — 판당 딱 한 번 (G10). 40 방송을 SYSTEM 이 찍고(D27), 경비가 뒤에 붙는다.
     * 과학자 · UNIT-21 의 줄과 「내가 답한다」는 openers.watch() 가 잇는다 (W3) — 답의 판정은 D9, 틀려도 안 죽는다
     */
    const t0 = play([{ who: 'system', text: SUS_LINES[40] }]);
    // 판당 한 번의 표는 openers 가 쥔다 — 물음이 실제로 걸린 뒤에만 찍힌다. 경비 없는 방에서 넘었으면 다음 경비 있는 방의 몫으로 남는다
    later(t0, () => openers.watch());
  } else if (t === 60) {
    play(EXEC_60);
    // 총 든 경비가 다가와 3.8 초 훑는다 — 움직이면 실패 (G17 · should). 값은 본판 scan FAIL 그대로, openers 가 쥔다.
    // 경비가 이 방에 없으면(휴게) 방송만 — 훑을 몸이 없는데 막대가 서면 휴게의 「가만히」가 덮이고, 스캔 자리가 다음 방까지 따라간다
    if (host.guard()) openers.scan();
  } else if (t === 80) play(EXEC_80);
  else if (t === 100) {
    const t0 = play(EXEC_START);
    // 아는 얼굴이다 — 이 개체와 말을 나눈 적이 있을 때만
    if (units.met('guard21')) later(t0, () => play(EXEC_KNOWN));
    // 여덟 걸음 — 개체들이 하나씩 등을 돌린다. 소리는 없다 (대본 지문 · D18: 글자 없이 몸만). 걸음마다의 몸은 track ④ 의 tickTurnAway 가 돌린다
  }
}

/* ── 여덟 걸음의 등 돌리기 — 「개체들이 하나씩 등을 돌린다」 (대본 v7) ── */

/** 지금까지 적용한 걸음 — 0 이면 아무도 안 돌았다 */
let turnStep = 0;
/** 반쯤 돈 것들(걸음 1 · 태도 ≥1) · 완전히 돈 것들 */
const turnedHalf = new Set<string>();
const turnedFull = new Set<string>();

/** 등을 돌릴 명부 — 집행자 자신과 이 판에서 사라진 것은 뺀다 */
function turnIds(): string[] {
  return roster(state.room).filter((id) => id !== 'guard21' && !gone.has(id));
}

/**
 * 반쯤 몸을 돈다 — patrol.turnAway 는 「from 의 반대」만 알아서, 나와 직각이 되는 가짜 from 을 넘긴다:
 * (m − from) 을 +90° 돌린 방향이 되도록 from' = m − rot90(m − from). 자리는 Unit 이 적어 둔 것(unitAt)
 */
function turnHalf(id: string) {
  const m = unitAt.get(id);
  if (!m) return;
  const dx = m.x - meAt.x;
  const dz = m.z - meAt.z;
  if (dx === 0 && dz === 0) return;
  patrol.turnAway([id], { x: m.x - dz, z: m.z + dx });
}

/**
 * 걸음마다 — 걸음 1 은 「태도 ≥1 인 것들이 반쯤 몸을 돈다」(대본 표 · 대사 없음), 그 뒤 걸음마다 하나씩 더 완전히 돈다.
 * 반쯤 돈 것들은 나머지가 다 돈 뒤에야 완전히 돈다 — 나와 엮인 것이 가장 늦게 등을 보인다
 */
function tickTurnAway(step: number) {
  if (step <= turnStep) return;
  const ids = turnIds();
  if (turnStep === 0) {
    for (const id of ids) if (units.stage(id) >= 1) {
      turnHalf(id);
      turnedHalf.add(id);
    }
  }
  for (let s = Math.max(2, turnStep + 1); s <= step; s += 1) {
    const next = ids.find((id) => !turnedFull.has(id) && !turnedHalf.has(id)) ?? ids.find((id) => !turnedFull.has(id));
    if (!next) break;
    patrol.turnAway([next], meAt);
    turnedFull.add(next);
    turnedHalf.delete(next);
  }
  turnStep = step;
}

/** 풀린다 — 답해서 watch 로 물러났거나(answered), 대신 나섰거나(spared), 방을 나갔거나. 죽은 뒤에는 안 푼다: 아무도 안 보는 채로 끝난다 */
function releaseTurnAway() {
  if (turnStep === 0 && turnedHalf.size === 0 && turnedFull.size === 0) return;
  patrol.turnAway([...turnedHalf, ...turnedFull], null);
  turnedHalf.clear();
  turnedFull.clear();
  turnStep = 0;
}

/** 문턱 방송 — 본판 suspicion.ts 의 THRESHOLD_LINES 와 같은 문장. 40 만 여기서 쓴다 (60 · 80 · 100 은 EXEC_* 가 같은 줄을 든다) */
const SUS_LINES = SUSPICION_LINES;

/** 문자열 하나든 배열이든 — 대본 상수의 꼴이 W1 몫이라 둘 다 받는다 */
function strs(v: string | readonly string[]): readonly string[] {
  return typeof v === 'string' ? [v] : v;
}

/**
 * 걸음 4–5 — 4 m 안 태도 +2 개체가 **스스로** 나선다 ([E] 는 없다, D18). 「잠깐.」 「…비켜.」 「쟤 아까 나 도와줬어.」 「……」 3 초 멎고
 * 한 번 더 묻는다(OPENERS 「잠깐. 번호.」, openers.ask('block')). 남은 걸음 안에 답이 오면 의심도 90 절대 → watch 로 물러난다.
 * 그 개체는 원장에 「나를 위해 나선 적 있다」가 찍힌다 (D19)
 */
function onBlocked(id: string) {
  if (fired.has('blocked')) return;
  fired.add('blocked');
  // 원장의 「나를 위해 나선 적 있다」는 execution 이 blocked 로 넘어가며 찍는다 — 여기는 말과 물음만
  let t = speak(id, strs(COVER_SAY));
  t += play(COVER_REPLY, t);
  t += speak(id, strs(COVER_SAY2), t);
  t += play(COVER_PAUSE, t);
  /*
   * 물음은 **지금** 건다(startAt 이 넉 줄의 길이라 줄은 그 뒤에 나온다) — 답의 창은 총을 내리기 전까지뿐이라(execution.answered)
   * BLOCK_MS 안에 걸려야 늘 닿는다 (execution.ts 머리말). 넉 줄이 끝난 뒤에 걸면 남은 걸음보다 늦어 답이 버려지는 판이 생긴다
   */
  openers.ask('block', performance.now(), t);
}

/** 걸음 6–7 — 태도 3 개체가 말없이 총구 앞으로 들어와 선다. 「…야.」 「……」 3 초. 개체를 쏘는 건 이 구역의 법이 아니다 */
function onBodyBlock(id: string) {
  if (fired.has('body-block')) return;
  fired.add('body-block');
  const t = play(BODY_BLOCK);
  speak(id, strs(BODY_BLOCK_UNIT), t);
}

/** 도착 — 「…사람이네.」 총을 내리는 1.5 초. 사과는 **집행자 자신의 태도**다 — 이 개체와 엮여 있을 때만 듣는다. 그리고 그게 아무것도 못 바꾼다 */
function onUnsling() {
  if (fired.has('unsling')) return;
  fired.add('unsling');
  const t = play(EXEC_ARRIVE);
  if (units.stage('guard21') >= 1) play(EXEC_SORRY, t);
}

/** 겨눔 — 「…끝났어.」 여기서부터는 아무것도 못 한다 */
function onAim() {
  if (fired.has('aim')) return;
  fired.add('aim');
  play(EXEC_OVER);
}

/** 끝 — 조각 목록이 뜬다. 「저 말 때문이었구나」가 보여야 다음 판이 있다 */
function onDead() {
  if (fired.has('dead')) return;
  fired.add('dead');
  /*
   * 한 발 — **소리는 여기서, 빛은 몸에서.** 섬광은 집행자의 총구가 execution.shotAt 을 보고 피우고
   * (Executioner → CastBody 의 Rifle → world/muzzle), 총성은 이야기가 낸다: 챕터 2 의 즉결 사격 · 심문 AI 와
   * **같은 sfx.gunshot** 이다. 여태 시나리오 2 에서는 둘 다 없어서 사람이 소리 없이 죽었다 (2026-09-03 사용자).
   */
  gunshot();
  play(EXEC_END);
  /*
   * 입력줄이 열려 있었으면 닫고, 걸려 있던 물음 · 걸어오던 화자도 거둔다 — 죽은 뒤에 칠 말은 없다.
   * 안 거두면 track ① 이 「묻는 경비」를 곁으로 계속 세워 죽은 화면 뒤에서 Enter 가 입력줄을 연다 (2026-09-03 헤드리스 확인)
   */
  openers.leaveRoom();
  address.cancel();
  patch({ objective: null, talking: false });
  recordExecution(null);
}

/** 이 판에서 사라진 것들 — 대신 나서서 처리된 개체. 몸은 Unit 이 숨기고(scenario2.gone), 자리는 다시 안 받는다(place). 판이 새로 서야 돌아온다 */
const gone = new Set<string>();

/**
 * 개체 하나가 대신 나섰다 — 나는 산다. 그 개체는 돌아오지 않는다. 걸음 8 에 「나를 위해 나선 적 있다」 개체만 (D18).
 * 의심도는 **60 절대값**이다 (대본 「처리 완료. 관측 수준 하향.」) — 그 값은 execution 이 spared 로 넘어가며 내린다(EXEC_LOWER.spared), 여기서 또 안 건드린다
 */
function onSpared(id: string) {
  if (fired.has('spared')) return;
  fired.add('spared');
  // 대신 부서지는 것에게도 한 발이 나간다 — 나만 안 맞았을 뿐이라 소리도 빛도 같다
  gunshot();
  const t = speak(id, strs(STAND_IN_SAY));
  later(t + 600, () => play(EXEC_STAND_IN));
  recordExecution(id);
  // 그 개체는 이 판에서 사라진다 — Unit 이 프레임마다 자리를 다시 적어도 gone 이 막는다
  units.cross(id);
  gone.add(id);
  scenario2.forget(id);
}

/**
 * 끝난 자리를 적는다 — **어디서, 몇이 보는 앞에서.** 조각(「처리되는 걸 봤다」)은 목격 반경 안의 개체에게 남고,
 * 경보는 위치와 무관하게 +25 고정이다(헌법 9 — 위치가 경보를 바꾸면 남은 요원들이 죽은 자리를 역산해 서로를 지목한다).
 * 어둠 국면의 EMPTY_SEAT 과 아레나가 이 기록을 읽는다 (execution.result · handover)
 */
function recordExecution(standIn: string | null) {
  const room = state.room;
  const zn = zoneNow(room);
  // 콘솔이 내린 어둠 속의 처형은 목격이 ×0.4 다 — 「조용히 죽기」(개정 4). 경보 +25 는 그래도 그대로다
  const witnesses = witnessesFor(room, zn, placed(roster(room)), meAt, spreadNow(room));
  fragments.make({ text: '처리되는 걸 봤다', topic: '처형', from: '나', where: ROOM_TITLE[room], tags: ['인간적'], witnesses });
  raiseAlert(DEATH_ALERT);
  execution.record({ zone: zn, witnessed: witnesses.length, standIn, room: ROOM_TITLE[room] });
}

/** 경보도를 올린다 — 문턱을 넘으면 SYSTEM 이 그 줄을 방송한다 */
function raiseAlert(n: number) {
  const hit = alert.raise(n);
  if (hit) play([{ who: 'system', text: ALERT_LINES[hit] }]);
}

/* ─────────────────────────────── 트리거 ─────────────────────────────── */

/** 방마다 「여기 닿으면 나간다」의 z. 문턱이 아니라 **문 앞**이다. 복도는 꺾이고 기록 복도는 휘어 z 하나로 못 자른다 (atExit) */
function exitZ(room: Room): number | null {
  if (room === 'rest') return REST_EXIT_Z;
  if (room === 'window') return WINDOW_EXIT_Z;
  return null;
}

/** 「문 앞」인가 — 복도는 L 자라 나가는 문에서의 거리로, 기록 복도는 호 길이로, 중앙 시설은 문 ② 앞으로, 작업 구역은 옆벽 문 앞으로 보고, 곧은 방들은 z 로 자른다 */
function atExit(room: Room, x: number, z: number): boolean {
  if (room === 'corridor') return corridor2AtExit(x, z);
  if (room === 'archive') return archiveAtExit(x, z);
  if (room === 'central2') return central2AtExit(x, z);
  if (room === 'work') return workAtExit(x, z);
  const ez = exitZ(room);
  return ez !== null && z <= ez;
}

/**
 * 나가는 문짝의 자리 — 문이 열리기 시작하는 거리(EXIT_DOOR_WAKE_M)를 여기서 잰다. 중앙 시설은 제 문 넷을 제 저장소로 움직인다(null).
 * 창이 있는 방도 자리는 있다 — canLeave 가 false 라 열리지 않을 뿐이다
 */
function exitPoint(room: Room): Vec2 | null {
  if (room === 'corridor') return CORRIDOR2_EXIT;
  if (room === 'rest') return { x: 0, z: REST.profile.farZ };
  if (room === 'work') return WORK_EXIT;
  if (room === 'archive') return ARCHIVE_EXIT;
  if (room === 'window') return { x: 0, z: WINDOW_ROOM.profile.farZ };
  return null;
}

/** 나가는 문짝 — 나갈 수 있고 문 앞이면 열린다. 방(world2/map)은 이 값만 읽어 문짝을 올린다 */
function tickExitDoor(room: Room, x: number, z: number) {
  const ep = exitPoint(room);
  exitDoor.set(ep !== null && canLeave(room) && Math.hypot(x - ep.x, z - ep.z) <= EXIT_DOOR_WAKE_M);
}

/**
 * 도주라면 어느 문으로 — 이동 방향이 이 점을 향할 때만 도주다 (corefield.isFleeDirection).
 * 중앙 시설은 문 ①② 중 가까운 쪽 — 그늘로 물러서는 걸음은 도주가 아니다
 */
function doorOf(room: Room, me: Readonly<Vec2>): Vec2 | null {
  if (room === 'corridor') return CORRIDOR2_EXIT;
  if (room === 'rest') return { x: 0, z: REST_EXIT_Z };
  if (room === 'work') return WORK_EXIT;
  if (room === 'central2') return nearestPoint(me, [CENTRAL2_DOORS.d1, CENTRAL2_DOORS.d2]);
  return null;
}

/** 나갈 수 있나 — 방마다 조건이 다르다. 못 나가면 그 이유가 목표에 적혀 있어야 한다 */
function canLeave(room: Room): boolean {
  if (room === 'corridor') return corridor.doorOpened(); // 격납문은 [E] 로 연다 — 그림 수 잠금은 없다 (D8)
  if (room === 'rest') return doorOpenAt > 0 && performance.now() >= doorOpenAt; // 문은 주기에 열린다 — 가만히 있기는 밖을 본 것의 장치일 뿐이다
  if (room === 'work') return furnace.get().phase === 'leftWork'; // 두 주기가 끝나거나 소각로 해결 150 초 뒤 (D14) — LEAVE_WORK 가 문을 연다
  if (room === 'window') return false; // 여기서는 기다린다. 나가는 것은 대본이 정한다
  if (room === 'central2') return fired.has('door2'); // 문 ② 는 어둠 국면 2 분 뒤에 열린다
  return true;
}

function nextRoom(room: Room): Room | null {
  const i = ORDER.indexOf(room);
  return i >= 0 && i + 1 < ORDER.length ? ORDER[i + 1] : null;
}

function go(next: Room) {
  releaseHold();
  devPin = false;
  patch({ blackout: 1, objective: null, near: null, aim: null, talking: false });
  later(700, () => {
    onRoom?.(next);
    enterRoom(next);
  });
}

/* ─────────────────────────────── 손잡이 · 배회 대화 ─────────────────────────────── */

/**
 * 이야기 모듈(corridor · furnace · openers · archiveScene)이 판을 만지는 유일한 통로. 모듈은 이것만 안다 —
 * 자리 · 타이머 · 대화창 · 화면 상태 전부 여기를 거친다. 값 상수는 안 넘긴다: 그건 corefield 와 각 모듈이 제 파일에 적는다
 */
const host: Host = {
  once,
  emit: (line) => {
    const s = speakerOf(line.who);
    emit?.({ nickname: fill(s.name), text: fill(line.text), portrait: s.portrait, self: line.who === 'me' || line.who === 'thought', thought: line.who === 'thought' });
  },
  play: (lines, startAt) => play(lines, startAt),
  speak,
  playCast,
  patch,
  now: () => performance.now(),
  me: () => meAt,
  nearest: (r) => nearestStanding(r),
  has: (id) => roster(state.room).includes(id) && unitAt.has(id),
  // 하던 일(look.act)이 있는 몸은 안 고른다 — 그리던 것이 붓을 놓고 걸어오면 그 방의 그림이 거짓말이 된다
  nearestIdle: (r) => nearestStanding(r, (id) => !units.def(id)?.look.act),
  roomRadius: () => ROOM_RADIUS[state.room],
  room: () => state.room,
  state: () => state,
  /*
   * 정적 — 입력줄이 닫혀 있고, 흐르는 대사가 없고, 저쪽이 먼저 건 말의 창도 안 열려 있고,
   * **벽을 들여다보고 있지도 않다**. 유도 속마음(corridor.NUDGES)이 이걸 「막혔나」로 읽는 유일한 손잡이라
   * 시선 판독(probe)이 빠져 있으면 그림 앞에 선 사람이 「막힌 사람」으로 잡힌다
   * (2026-09-03 사용자: 「그림을 보고 있었는데 저기가 격납문이겠지 하는 대사가 나온다」).
   * done(다 읽고 1.4 초 남는 표시)까지 세는 것은 마지막 눈금이 차는 순간과 그림의 속마음이 뜨는 순간 사이의 틈 때문이다.
   */
  quiet: () => !state.talking && performance.now() >= busyUntil && !address.pending() && probe.get().label === null && !probe.get().done,
  busyUntil: () => busyUntil,
  later,
  afterControl,
  sinceControl: () => control.since(performance.now()),
  leave: () => {
    const next = nextRoom(state.room);
    if (next && !state.blackout) go(next);
  },
  stare: (id, ms) => patrol.stare(id, meAt, ms),
  approach: (id, to, opts) => patrol.approach(id, to, opts),
  release: (id) => patrol.release(id),
  unitPos: (id) => {
    const p = unitAt.get(id);
    return p ? { x: p.x, z: p.z } : null;
  },
  witnesses: () => roster(state.room),
  heard: witnessesNow,
  raiseAlert,
  objective: (text) => patch({ objective: text }),
  vanish: (id) => {
    gone.add(id);
    unitAt.delete(id);
  },
  where: () => ROOM_TITLE[state.room],
  passerby: () => nearestWithin(placed(roster(state.room).filter((id) => !units.crossed(id) && id in SPEAKER)), meAt, Infinity),
  cycle: (got, need) => patch({ stillness: got === null ? null : { need, got, label: WORK_LABEL } }),
  stillness: (got, need) => patch({ stillness: got === null ? null : { need, got } }),
  guard: () => {
    if (!roster(state.room).includes('guard21')) return null;
    const g = unitAt.get('guard21');
    return g ? { x: g.x, z: g.z, still: g.still } : null;
  },
  // 경비가 말을 걸 수 있는 방 상태인가 — 중앙 시설은 밝고 검문이 안 열려 있을 때만: 검문 중인 경비가 초소를 버리고 오면 답할 길이 없는 물음이 걸린다
  guardFree: () => state.room !== 'central2' || (central2.get().phase === 'bright' && !gateOpen()),
  // 걷기 표 — 열하루째는 furnace 의 국면이 곧 표라 여기서 켤 것이 없다(fireWalkActive). 대체 개체만 표를 따로 든다
  fireWalk: () => {},
  substituteWalk: (v) => {
    subWalking = v;
  },
  lastSayAt: () => lastSayAtMs,
  address: (id, lines, opts) => addressUnit(id, lines, opts),
  // 경비의 잡담 — 손을 댄 판에서, 저쪽이 먼저 건 말(address)과 20 초 뜸을 두고 (address ⑥ 과 같은 수)
  chatOk: () => control.taken() && !address.pending() && performance.now() - address.lastUnsolicitedAt() >= ADDRESS_GAP_MS,
};

/**
 * 개체가 나에게 와서 말한다 (address.ts) — 이야기 모듈과 이 파일이 개체의 말을 내보내는 **한 통로**다.
 * 순찰하는 것(자리가 둘 이상)은 말이 끝나면 제 길로 돌아가고(resume), 서 있던 것은 온 자리에 선다(stand) — 6 m 규칙의 예외는 서는 동안뿐이다.
 *
 * 「걸어와야 말한다」는 규칙(address ⑦)은 **여기서 안 판정한다** — address.ts 의 표(ADDRESS_EXEMPT_ROOMS · ADDRESS_MUST_SPEAK) 하나가 정한다.
 * 부르는 쪽이 할 일은 opts.scene 에 대본 상수 이름을 적는 것뿐이다. 중앙 시설(central2)의 말은 방으로 면제라 아무것도 안 적어도 된다
 */
function addressUnit(id: string, lines: readonly CastLine[], opts: Partial<AddressOpts> = {}): void {
  /*
   * 말이 끝나면 **제 자리로 돌아간다** — 자리가 하나뿐인 것도 마찬가지다 (2026-09-03 사용자: 「물어보면 다시
   * 그 자리로 안 돌아간다」). 예전에는 순찰하는 것만 resume 이고 서 있던 것은 온 자리에 그대로 섰는데,
   * 그러면 그림 앞에 서 있어야 할 것이 복도 한가운데에 남아 그 방의 자리표가 통째로 어긋난다.
   */
  address.request(id, lines, { then: 'resume', ...opts });
}

/** address 가 판을 만지는 손잡이 — 자리는 Unit 이 적은 것(unitAt), 곁 고정은 track 이 읽는 표(addressPinned), 창은 state.answer */
const addressHost = {
  now: () => performance.now(),
  me: () => meAt,
  room: () => state.room,
  // 보는 쪽은 순찰이 쥐고 있다(patrol.of) — 「걸어와서 나를 보고 섰나」(address ⑦)를 address 가 이걸로 판정한다
  unitAt: (id: string) => {
    const p = unitAt.get(id);
    if (!p) return null;
    const m = patrol.of(id);
    return m ? { ...p, heading: m.heading } : p;
  },
  approach: (id: string, to: Vec2, opts: { stopAt: number; then: 'stand' | 'resume' }) => patrol.approach(id, to, opts),
  stare: (id: string, ms: number) => patrol.stare(id, meAt, ms),
  release: (id: string) => patrol.release(id),
  busyUntil: () => busyUntil,
  playCast,
  // 곁은 track 이 프레임마다 address.pinned() 로 덮는다 — 여기서는 즉시 한 번 반영만 (Enter 가 다음 프레임을 안 기다리게)
  pinNear: (id: string | null) => {
    if (id) {
      const p = unitAt.get(id);
      patch({ near: { id, dist: p ? Math.hypot(p.x - meAt.x, p.z - meAt.z) : 0 } });
    } else if (state.near && !devPin) patch({ near: null });
  },
  objective: () => state.objective,
  setObjective: (text: string | null) => patch({ objective: text }),
  talking: () => state.talking,
  answerWindow: (w: Scene2State['answer']) => patch({ answer: w }),
  // 집행자가 서 있거나 검문이 열려 있거나 경비가 묻는 중 — 그것들은 제 무대를 따로 가진다
  frozen: () => execution.get().phase !== 'none' || gateOpen() || openers.pending(),
};

/** 반경 안에서 가장 가까운 **서 있는** 명부 개체 — 화자표에 있고, 자는 것은 빼고. 걷는 것은 대상이 아니다 */
function nearestStanding(r: number, ok?: (id: string) => boolean): string | null {
  const ids = roster(state.room).filter((id) => id in SPEAKER && !(state.room === 'rest' && id === REST_SLEEPER) && (ok?.(id) ?? true));
  const still: { id: string; x: number; z: number }[] = [];
  for (const id of ids) {
    const p = unitAt.get(id);
    if (p?.still) still.push({ id, x: p.x, z: p.z });
  }
  return nearestWithin(still, meAt, r);
}

/**
 * 배회 개체 둘이 지나치며 두 마디 — 판당 OVERHEAR_RULE.perRun 회 (D5). 들리는 범위는 그 방의 목격 반경이고, 들으면 그 주제가 열린다(힌트 칩).
 * 주제는 **안 열린 것 먼저** — 그래서 슬롯을 미리 다 적지 않고 켤 때마다 하나씩 고른다. 방마다 첫 시각만 다르다
 */
const OVERHEAR_AT: Partial<Record<Room, number>> = { corridor: 12_000 + 40_000, rest: 30_000 };
const OVERHEAR_GAP_MS = 30_000;
const OVERHEAR_KINDS: readonly ScrawlKind[] = ['resting', 'carry', 'danger', 'memorial', 'window'];
/*
 * ★ **지금은 비어 있다 — 엿듣기가 꺼져 있다** (2026-09-03 사용자: 「계획서에 없던 로봇 개체는 일단 없애줘」).
 *   엿듣기는 **배회하는 둘이 서로 스쳐야** 성립하는데(overhear.tick 의 meetM), 그 둘이던 배경 여섯을 걷어내서
 *   이제 어느 방에도 스칠 쌍이 없다. 있지도 않은 쌍을 적어 두면 tickOverhear 가 영영 안 나가는 슬롯을 짜므로 표를 비운다.
 *   모듈(overhear.ts)과 두 마디 표(script 의 OVERHEAR)는 **그대로 둔다** — 지워야 할 것은 없고 세울 몸이 없을 뿐이다.
 *   기획서의 군중(레벨 설계: 휴게 「스무 개체」)을 캐스팅해 배회하는 둘이 생기면 여기 그 둘을 적는 것으로 다시 켜진다.
 *   잃은 것: 벽의 그림을 안 본 판에서 어휘가 열리는 **둘째 길**(D5 · lexicon.open(kind, 'overheard'))이 지금은 없다.
 */
const OVERHEAR_PAIR: Partial<Record<Room, readonly [string, string]>> = {};
/** 다음 대화를 걸 시각 — 0 이면 아직 안 정했다(작업 구역은 두 번째 주기가 정한다) */
let overhearNextAt = 0;
/** 이 방의 첫 대화까지 — 조작권부터(ms). −1 이면 시계가 없다 */
let overhearFirstMs = -1;
/** 걸어 둔 슬롯이 아직 안 나갔다 — 둘이 스칠 때까지 기다린다. 그 위에 또 걸면 앞 것이 지워진다(schedule 은 갈아 끼운다) */
let overhearOpen = false;
let overhearSeen = 0;

function tickOverhear(now: number) {
  const room = state.room;
  const pair = OVERHEAR_PAIR[room];
  if (!pair || ROOM_RADIUS[room] <= 0) return;
  // 손을 대기 전에는 안 짠다 — 들리는 것도 나에게 일어나는 일이다. 첫 시각은 조작권부터 센다
  const since = control.since(now);
  if (since < 0) return;
  if (overhearNextAt === 0 && overhearFirstMs >= 0) overhearNextAt = now - since + overhearFirstMs;
  const n = overhear.count();
  if (n !== overhearSeen) {
    overhearSeen = n;
    overhearOpen = false;
    /*
     * 간격은 **실제로 스친 시각**부터다 — 슬롯을 짠 시각부터 재면 둘이 늦게 스쳤을 때 다음 프레임에 새 슬롯이 또 걸리고(schedule 은 갈아 끼운다)
     * 기다리던 둘째 마디가 지워진다: 「쉬었어?」 「쉬었어?」 「…아직.」 (2026-09-03 헤드리스 재현)
     */
    overhearNextAt = now + OVERHEAR_GAP_MS;
  }
  // 판당 횟수는 corefield(OVERHEAR_RULE.perRun)가 쥔다 — 여기 숫자를 또 적으면 두 곳이 어긋난다
  if (!overhearOpen && overhearNextAt > 0 && now >= overhearNextAt && overhear.remaining() > 0) {
    overhearOpen = true;
    // 작업 구역은 위험 — 소각로가 끝났으면 기억. 다른 방은 안 열린 주제 먼저, 다 열렸으면 첫 것
    const kind: ScrawlKind = room === 'work' ? (furnace.resolved() ? 'memorial' : 'danger') : (OVERHEAR_KINDS.find((k) => !lexicon.has(k)) ?? OVERHEAR_KINDS[0]);
    overhear.schedule(room, [{ at: now, kind, pair: [pair[0], pair[1]] }]);
  }
  overhear.tick(now, (id) => unitAt.get(id), meAt, ROOM_RADIUS[room]);
}

/**
 * 곁의 개체에게 건 한 마디의 **본 갈래** — 목격자 · 단가표 · 태도 · 대답. say() 의 끝이고, 개체가 먼저 건 말의 답(address 의 onAnswer:
 * 재회의 「어디 있다 왔어?」)도 여기로 온다. `flatReply` 는 그 답이 앞말과 어긋났는지를 볼 것인가다
 */
/**
 * 표가 비어 기본값(「…….」)으로 떨어진 대답 — **문장만** 모델이 짓는다 (say.ts).
 *
 * 값은 이미 다 치렀다: 태도 · 의심 · 경보 · 조각 · 원장은 talk.say 가 부르는 그 자리에서 끝났고, 여기 오는 것도
 * 나가는 것도 문장 하나뿐이다. 그러니 모델이 늦거나 죽어도 **판은 이미 정확하다** — 표의 줄로 그냥 말한다.
 *
 * 기다리는 동안 말풍선이 비는 것은 괜찮다(대답 앞에는 원래 0.7 초의 뜸이 있다). 다만 그 사이에 방이 바뀌었거나
 * 내가 한 마디 더 걸었으면 **버린다** — 늦게 도착한 대답이 다음 장면 위에 뜨면 누구 말인지 안 읽힌다.
 */
/**
 * 이 대답을 화면에 낸다 — **문장은 모델이, 표는 모델이 죽었을 때만.**
 *
 * 2026-09-03 사용자: 「하드코딩은 없애줘. 모델이 죽었을 경우에만 대답하게 해줘」.
 * 대본표(cast 의 voice)는 이제 **마지막 줄**이다. 모델이 살아 있으면 그 표는 화면에 안 나가고, 대신
 * 「이 자리에서 무엇을 답하는가」를 일러 주는 쪽지(beat)로 모델에게 간다 — 위로 3단 · 벽 얘기 · 업무 ·
 * 보고 · 동료 확인은 여전히 그 박자대로 답하되 문장은 그 개체의 말투로 새로 나온다.
 * 쪽지는 **판당 그 줄이 처음일 때만** 실린다: 두 번째부터는 없이 보내 제 말로 짓게 한다 (되풀이가 앵무새가 되는 자리).
 * 값(태도 · 의심 · 경보 · 조각 · 원장)은 여기 오기 전에 talk.say 가 이미 다 치렀다 — 모델은 숫자에 손대지 않는다.
 */
function voiceReply(id: string, said: string, r: TalkResult, at: number, room: Room): void {
  // 내가 건 말은 어느 경로로 가든 기억에 남는다 — 모델이 죽어도 다음 한 마디가 이걸 읽는다
  logTalk(id, '나', said);
  if (!sayAvailable()) {
    logTalk(id, '그것', r.reply.join(' '));
    const len = speak(id, r.reply, at);
    offerHint(id, room, r, at + len);
    return;
  }
  const beat = !r.generic && firstSaying(id, r.reply) ? r.reply.join(' ') : undefined;
  modelReply(id, said, r, at, room, beat);
}

/**
 * 이 개체가 이미 한 말 — **대본표의 줄은 한 번씩만 쪽지가 된다.**
 *
 * 표가 이기는 규칙(기획서에 적힌 대답은 연출된 박자다)은 그대로다. 다만 그 박자는 **처음 한 번**의 것이다:
 * 같은 개체에게 두 번 말을 걸면 「어. 뭐 필요해?」가 두 번 나오고, 냉소형은 「너 어느 구역이야?」를 영영 되풀이했다
 * (2026-09-03 사용자: 「똑같은 말만 하고… 하드코딩 되어 있으면 안 돼」). 인용을 지키는 것과 앵무새가 되는 것은 다르다.
 * 그래서 그 개체가 **이미 한 줄**이면 그 자리에서 모델이 새로 짓는다 — 표의 문장은 판마다 한 번씩 다 들리고,
 * 그 뒤로는 그 개체의 말투로 이어진다. 판이 새로 서면 표도 처음으로 돌아간다 (start 가 비운다).
 */
const saidBy = new Map<string, Set<string>>();

/**
 * 이 개체와 **오간 말** — 「나: …」 「그것: …」 로 쌓고 최근 넷만 모델에게 보낸다.
 *
 * 2026-09-03 사용자: 「똑같은 말만 하고…」. 표의 줄을 한 번씩만 쪽지로 쓰는 것(firstSaying)으로 앵무새는
 * 막았지만, 그다음부터 모델은 **앞말을 아무것도 모르는 채** 문장을 지었다 — 같은 것을 두 번 물으면
 * 두 번 다 처음 듣는 것처럼 답했다. 개체가 나를 기억한다는 것이 이 판의 전부인데(원장 · 마지막 방의 표)
 * 대답만 기억이 없었다.
 *
 * ★ 넷까지다. 더 실으면 모델이 앞말을 요약하려 들고, 그러면 「한 문장」 규칙이 깨진다.
 * ★ 값은 여기 안 온다 — 태도 · 의심 · 경보는 이미 talk.say 가 치른 뒤다. 이건 문장 기억일 뿐이다.
 */
const talkLog = new Map<string, string[]>();
const TALK_LOG_KEEP = 4;

function logTalk(id: string, who: '나' | '그것', text: string): void {
  const t = text.trim();
  if (!t) return;
  const arr = talkLog.get(id) ?? [];
  arr.push(`${who}: ${t}`);
  talkLog.set(id, arr.slice(-TALK_LOG_KEEP));
}
/** 이 줄이 이 개체에게 처음인가 — 물어보면서 적는다 */
function firstSaying(id: string, reply: readonly string[]): boolean {
  const key = reply.join('\n');
  let set = saidBy.get(id);
  if (!set) saidBy.set(id, (set = new Set()));
  if (set.has(key)) return false;
  set.add(key);
  return true;
}

function modelReply(id: string, said: string, r: TalkResult, at: number, room: Room, beat?: string): void {
  const def = units.def(id);
  const startedAt = performance.now();
  const saidAt = lastSayAtMs;
  const v = def?.voice;
  // 말투 표본 — 이 개체가 대본에서 실제로 쓰는 줄들. 모델은 이 온도를 벗어나면 안 된다
  const samples = [...(v?.greet ?? []), ...(v?.work ?? []), ...(v?.up ?? []), ...(v?.comfort?.flat() ?? []), ...(v?.flat ?? [])].slice(0, 6);
  void world2Say({
    // 성격 · 몸 · 기울기 · 앞 대화 — cast 에 적혀 있으면서 여태 프롬프트에 안 실리던 것들 (sayfields.ts)
    ...sayExtras(def, talkLog.get(id) ?? []),
    unit: fill(def?.label ?? id),
    title: def?.title ?? '',
    persona: def?.persona.kind ?? 'bg',
    tell: def?.tell ?? '',
    attitude: units.stage(id),
    reaction: r.reaction,
    tag: r.tag,
    topic: r.fragment?.topic ?? r.tag,
    said,
    where: ROOM_TITLE[room],
    samples: samples.map(fill),
    beat,
  }).then((made) => {
    // 늦게 온 대답이 다음 장면 위에 뜨지 않게 — 방이 바뀌었거나 내가 한 마디 더 걸었으면 버린다
    if (state.room !== room || lastSayAtMs !== saidAt) return;
    /*
     * 지어진 문장은 구운 클립이 있을 리 없다 — 그 자리에서 합성해 튼다 (voice.ts 의 markLive · playLive).
     * 표를 다는 것은 여기뿐이다: 「대사를 고치고 안 구운 줄」과 「원래 구울 수 없는 줄」을 이 표가 가른다
     */
    if (made) markLive(made);
    const said2 = made ?? r.reply.join(' ');
    // 화면에 실제로 나가는 문장을 적는다 — 다음 한 마디의 프롬프트가 이것을 읽는다
    logTalk(id, '그것', said2);
    const rest = Math.max(0, at - (performance.now() - startedAt));
    const len = speak(id, made ? [made] : r.reply, rest);
    offerHint(id, room, r, rest + len);
  });
}

/* ─────────────────────────────── 귓속말 ─────────────────────────────── */

/** 대답이 다 흐른 뒤 이만큼 두고 — 한 박자 쉬어야 「덧붙이는 말」로 읽힌다 */
const HINT_PAUSE_MS = 900;
/** 이 안에 총 든 것이 있으면 안 흘린다 — 귓속말은 아무도 안 들을 때만 나온다 */
const HINT_GUARD_M = 5;
const HINT_GUNS = ['guard21', 'guard22', 'guard23'];

/** 지금 방이 조용한가 — 장면이 서 있는 동안에는 아무도 딴말을 안 한다 (attitude.ts 의 그 규칙과 같은 목록) */
function quietForHint(): boolean {
  return (
    !state.blackout &&
    !state.choice &&
    // 「채우는 중인」 게이지만 막는다 — 휴게는 30 초를 채운 뒤에도 stillness 를 안 내리므로 여기서 귓속말이 통째로 죽었다
    !(state.stillness && state.stillness.got < state.stillness.need) &&
    !state.talking &&
    execution.get().phase === 'none' &&
    !gateOpen() &&
    !openers.pending() &&
    !address.pending()
  );
}

/** 곁에 총 든 것이 서 있나 */
function nearGun(): boolean {
  for (const id of HINT_GUNS) {
    const p = unitAt.get(id);
    if (!p) continue;
    if (Math.hypot(p.x - meAt.x, p.z - meAt.z) <= HINT_GUARD_M) return true;
  }
  return false;
}

/**
 * **친밀도가 앞을 알려 준다** — 태도가 오른 그 대답 뒤에 개체가 한 박자 두고 흘리는 두 줄 (hints.ts).
 *
 * 값은 이미 talk.say 가 다 치렀고 여기서는 문장만 더 낸다. 표(given)를 찍는 것은 **줄이 실제로 나가는 순간**이라,
 * 늦게 온 대답이 버려지거나 방이 바뀌면 그 귓속말은 소진되지 않는다 — 다음 기회에 다시 나온다.
 * 말이 나갈 때는 그 개체가 나를 보고 있어야 한다(attitude.attend) — 등을 돌린 채 흘리면 누구 말인지 안 읽힌다.
 */
function offerHint(id: string, room: Room, r: TalkResult, afterMs: number): void {
  const h = hints.pick(id, room, r, performance.now());
  if (!h) return;
  const saidAt = lastSayAtMs;
  later(
    afterMs + HINT_PAUSE_MS,
    () => {
      // 늦은 답과 같은 자 — 방이 바뀌었거나 내가 한 마디 더 걸었으면 없던 일로 (표도 안 찍힌다)
      if (state.room !== room || lastSayAtMs !== saidAt) return;
      if (!quietForHint() || nearGun()) return;
      const now = performance.now();
      hints.consume(h, now);
      attitude.attend(id, ATTEND_REPLY_MS, now);
      // 구운 클립이 아직 없는 줄은 그 자리에서 합성해 튼다 — 구운 뒤에는 클립이 이긴다 (voice.ts)
      for (const l of h.lines) markLive(fill(l.text));
      play(h.lines);
    },
    'line',
  );
}

function sayTo(id: string, line: string, flatReply: boolean): void {
  const room = state.room;
  /*
   * 목격자 — **그 방의 소리 반경 안에 있는 것들뿐이다** (레벨 설계 「소리 반경이 곧 조각 반경이다」).
   * 복도는 좁아서 소문이 안 퍼지고, 휴게 구역은 차폐가 없어서 다 퍼지고, 기록 복도는 아무도 안 듣는다.
   * 방의 모양이 곧 「내 말이 누구에게 남는가」를 정한다.
   */
  const witnesses = witnessesNow();

  const r = talk.say(id, line, witnesses, ROOM_TITLE[room]);
  // 말 걸기의 값(+1 · 보고 +12)으로 경보 문턱을 넘었다 — 방송은 여기서. talk 은 올리기만 하고 넘은 문턱을 돌려준다 (raiseAlert 와 같은 줄)
  if (r.alertHit) play([{ who: 'system', text: ALERT_LINES[r.alertHit] }]);
  // 앞말(휴게 구역)과 어긋났다 — 「말이 안 맞는다」 −1. 이유는 v7 원문이다
  if (flatReply && r.tag === 'lie') {
    units.shift(id, -1);
    units.note(id, -1, '말이 안 맞는다', ROOM_TITLE[room]);
  }
  // 사람 물음을 건 개체를 센다 — NOTICE 뒤 서로 다른 둘이면 「…아무도 안 묻는구나. 여기서는.」
  corridor.onSaid(id, r.tag);

  /*
   * 동료 확인 — 완전 고정 대사다(cast 의 voice.sign · signAgain, 반응은 talk 이 고른다). 모델이 죽어도 이것만은 반드시 된다.
   * 확인 신호는 「AI 가 절대 하지 않는 말」이고, 그건 **사람만 하는 물음**의 태그다 (쉼 · 밖 · 사라진 것 · 몸 · 그림).
   * 그 말이 정확히 벽화가 가르쳐 준 위로라서, 동료를 찾는 행위가 이 게임에서 가장 위험한 행위가 된다.
   * 곁의 개체에게는 조각이 하나 남는다 — 「둘이서 뭐라고 주고받더라」. 속마음은 없다 (문서 밖 자리)
   */
  if (r.reaction === 'sign') {
    if (!units.isAlly(id)) units.confirmAlly(id);
    attitude.onReply(id, r);
    // 이 자리도 이제 모델이 문장을 짓는다 — 표는 모델이 죽었을 때의 마지막 줄이다 (2026-09-03 사용자)
    voiceReply(id, line, r, 700 + r.pauseMs, room);
    fragments.make({
      text: '둘이서 뭐라고 주고받더라',
      topic: '발화',
      from: '나',
      where: ROOM_TITLE[room],
      tags: ['모순'],
      witnesses: witnesses.filter((w: string) => w !== id),
    });
    return;
  }

  // 갈망형의 첫 위로는 0.4 초 멈칫한다 (D28) — 그 멈춤이 대답의 일부다. 몸이 먼저 돈다(돌아보기 · 물러섬 · 다가섬 — attitude.ts), 말은 그 뒤
  attitude.onReply(id, r);
  const at = 700 + r.pauseMs;
  /*
   * 표에 그 개체의 줄이 있으면 그 줄이 이긴다 — 기획서에 적힌 대답은 연출된 박자다. 모델이 채우는 자리는 둘:
   *   ① 표가 비어 기본값(「…….」)으로 떨어진 자리 (r.generic)
   *   ② 그 줄을 **이미 한 번 했을 때** — 박자는 한 번이고, 두 번째부터는 앵무새다 (firstSaying)
   * 동료 확인(sign · signAgain)만은 언제나 고정이다: 모델이 죽어도 되는 유일한 길이라 되풀이여도 그 문장 그대로다
   */
  // 문장은 전부 모델이 짓는다 — 예외 없다. 표는 모델이 죽었을 때의 마지막 줄이다 (voiceReply)
  voiceReply(id, line, r, at, room);
  /*
   * 보고 — SYSTEM 은 말하지 않는다 (D20). 신봉 대사 두 줄이 그 신호이고, 조각이 **리더에게** 간다:
   * 마지막 방에서 리더가 그 문장을 든다. 그 조각은 talk.say 가 하나 만든다(from 은 넘긴 개체) — 여기서 또 만들면 보고 하나가 둘로 센다
   */
  /*
   * 선을 넘었다 — 되돌릴 수 없다. 화면이 이걸 글자로 알려 주지 않는다:
   * 그 개체가 다음부터 **어떻게 서 있는지**로만 보인다 (Unit 의 자세 · units.stageLabel). 속마음도 없다
   */
}

/* ─────────────────────────────── [E] — 붙잡고 놓는다 ─────────────────────────────── */

/**
 * 이 몸을 붙잡는다 — [E] 가 부르는 유일한 곳.
 * 몸은 그 자리에 서서 나를 보고(patrol.talkHold), 하던 일은 손을 거두고(attitude.attend),
 * 곁(near)은 **이 자리에서 바로** 세워진다 — openTalk 이 state.near 를 읽으므로 그보다 먼저여야 한다.
 */
function holdTalk(id: string): void {
  const p = unitAt.get(id);
  talkPin = { id, until: performance.now() + HOLD_MAX_MS };
  patrol.talkHold(id, meAt);
  attitude.attend(id, ATTEND_TALK_MS);
  patch({ near: { id, dist: p ? Math.hypot(p.x - meAt.x, p.z - meAt.z) : 0 } });
}

/**
 * 놓는다. `tail` 이면 통째로 풀지 않고 **수명만 줄인다** (HOLD_TAIL_MS) —
 * 한 마디 보낸 뒤 그 몸이 대답하는 동안은 나를 본 채로 있어야 하고, 무엇보다 sayLine 이
 * **보낼 때** state.near 를 다시 읽으므로 그 프레임에 곁이 사라지면 한 마디가 증발한다.
 */
function releaseHold(tail = false): void {
  if (!talkPin) return;
  if (tail) {
    talkPin.until = Math.min(talkPin.until, performance.now() + HOLD_TAIL_MS);
    return;
  }
  patrol.talkHold(talkPin.id, null);
  talkPin = null;
}

/**
 * 입력줄을 연다 — Enter(Hud2 의 talkOpenKey)와 [E](pressE) 가 **같은 하나**를 쓴다.
 * 예전에는 저장소 객체의 메서드였는데, [E] 사다리가 안에서 이걸 불러야 해서 모듈 함수로 뺐다 (객체는 이 함수를 그대로 내보낸다).
 */
function openTalk(): void {
  if (state.talking || state.urgent || state.choice || state.blackout) return;
  takeControl(performance.now());
  patch({ talking: true });
  // 개체가 답을 기다리는 창 — 치는 동안은 멈춘다 (D1, address.ts)
  address.hold();
  /*
   * 곁의 개체가 **하던 일을 멈추고 이쪽을 본다** (attitude.attend · activity.ts). 입력줄을 여는 것까지가 「말을 거는 것」이라
   * 여기서 돈다 — 다가선 것만으로는 아무도 안 돈다 (태도 표시 0: 「지나가도 쳐다보지 않는다」).
   * 치다 말고 닫으면 closeTalk 이 꼬리로 줄인다
   */
  if (state.near) attitude.attend(state.near.id, ATTEND_TALK_MS);
}

/** say() 의 본문 — 갈래마다 return 한다. 어디에 뜨는지는 play 가 화자로 정한다 (BOXED) */
function sayLine(text: string): void {
  const line = text.trim();
  if (!line) return;
  /*
   * ★ **누구에게 걸지 고르지 않는다.** 보낼 때 곁에 있는 것이 듣는다 —
   *   아무도 없으면 그냥 허공에 한 말이고, 그러면 **아무 데도 안 남는다** (목격자가 없는 것이 곧 은폐다).
   */
  const id = state.near?.id ?? null;
  // 한 마디 걸었다 — 대답이 어느 갈래로 가든(검문 · 경비 · 대본 · 단가표) 그동안은 나를 본다. 대답 비트가 여기서 더 민다 (attitude.onReply)
  if (id) attitude.attend(id, ATTEND_REPLY_MS);
  /*
   * 보내면 **자판을 놓는다** (2026-09-02 사용자: 「엔터를 눌렀는데 대화창이 안 사라져」).
   * 줄은 곁에 있는 동안 그대로 떠 있지만 잡혀 있지 않으므로 곧바로 걸어갈 수 있다 —
   * 한 마디 더 하려면 Enter 를 다시 누른다. 저쪽이 대답하는 동안 자판까지 붙잡고 있으면 말이 끝난 느낌이 안 난다.
   * 확인용 고정(devPin)도 여기서 푼다 — closeTalk 과 같은 값이다. 안 풀면 DEV 손잡이로 연 뒤 보낸 다음에도 track 이 곁 판정을 계속 건너뛴다.
   *
   * ★ [E] 로 붙잡은 것은 **통째로 안 푼다 — 꼬리를 남긴다** (releaseHold(true) · HOLD_TAIL_MS).
   *   바로 아래에서 `state.near` 를 다시 읽기 때문이다: 그 프레임에 곁이 사라지면 이미 친 한 마디가
   *   `if (!id) return` 에서 조용히 증발한다. 이 두 줄이 사용자가 말한 「움직였을 때 오류」의 실제 수리다.
   */
  devPin = false;
  releaseHold(true);
  patch({ talking: false });
  const room = state.room;
  lastSayAtMs = performance.now();
  takeControl(lastSayAtMs);
  // 초상 없이 — 본판처럼 내가 친 말은 대화창 상자에 안 뜨고 왼쪽 아래(7 시 방향)에 작은 줄로 흐른다 (2026-09-03 사용자)
  emit?.({ nickname: '나', text: line, self: true });

  /*
   * 갈래는 순서가 있다 (W2 계약): 검문 → 경비의 물음 → 저쪽이 먼저 건 말 → 소각로 → 절전 → 재회 → 단가표.
   * 앞의 것들은 **판정도 값도 없거나 제 판정을 따로 가진다** — 단가표(talk.say)는 맨 끝의 기본값이다
   */
  // 검문 중 — 이 한 마디는 관문의 답이다. 단가표가 아니라 사실 대조로 간다 (태도는 안 움직인다)
  if (gateOpen()) {
    answerGate(line);
    return;
  }
  // 경비가 물었다 (WATCH · 20 통과 · 걸음 4–5 의 「잠깐. 번호.」) — 판정은 D9, 원장에는 이 문장 원문이 남는다
  if (openers.pending()) {
    openers.answer(line);
    return;
  }
  // 개체가 말을 걸고 답을 기다리는 중 — 그 한 마디는 그 개체의 것이다 (복도의 첫마디 · 재회의 「어디 있다 왔어?」 · 기록 복도의 「몇 번째 벽」). 판정은 건 쪽이 든다
  if (address.answer(line)) return;
  // 소각로 — 열하루째가 걷는 동안 4 m 안에서 한 말은 **막는 말**이다. 플레이어 문장이 「잠깐.」 자리다 (D11)
  if (room === 'work' && furnace.get().phase === 'walking' && within('u201', meAt, FURNACE.sayM)) {
    furnace.blockBySay(line);
    return;
  }
  if (!id) return;

  // 「절전 아니야?」— 자유 입력이지만 이 뜻이면 대본으로 간다 (DOZE). 과학자와 개체가 같은 것을 두고 다른 이름을 부른다
  if (room === 'rest' && dozeSeen && /절전/.test(line) && !fired.has('doze-reply')) {
    fired.add('doze-reply');
    playCast(DOZE_REPLY, id, 700);
    return;
  }

  // 재회 — 아는 얼굴에게 건 첫 마디는 대본이다
  if (recognize(id, line)) return;
  // 「어디 있다 왔어?」의 답인가 — 앞말과 어긋났는지는 단가표가 읽은 **한 번의 판독**(r.tag)으로 본다. 두 번 읽으면 앞말 표가 덮여 거짓이 안 잡힌다 (read.ts 의 claimed)
  const flatReply = flatReplyFrom === id;
  if (flatReply) flatReplyFrom = null;

  sayTo(id, line, flatReply);
}

export const scenario2 = {
  get(): Scene2State {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  bind(h: { emit: Emit; onRoom: (room: Room) => void; onArena: () => void }): void {
    emit = h.emit;
    onRoom = h.onRoom;
    onArena = h.onArena;
  },

  /** 새 판 — 저장소를 전부 비우고 첫 방부터 */
  start(): void {
    clearTimers();
    runFlags.clear();
    subWalking = false;
    lastSayAtMs = 0;
    units.reset();
    talk.reset();
    resetSay();
    resetLive();
    saidBy.clear();
    hints.reset();
    // 판이 새로 서면 개체의 기억도 처음으로 — 앞 판에서 오간 말이 새 판의 프롬프트에 실리면 안 된다
    talkLog.clear();
    fragments.reset();
    lexicon.reset();
    alert.reset();
    suspicion.reset();
    handover.clear();
    fragments.start();
    execution.reset();
    central2.reset();
    furnace.reset();
    openers.reset();
    archiveScene.reset();
    overhear.reset();
    overhear.bind({
      // 배회 개체의 한 마디 — 화자표에 없는 것이라 이름표는 열(units)의 것이다 (speakerOf)
      say: (id, text) => speak(id, [text]),
      heard: (kind) => lexicon.open(kind, 'overheard'),
    });
    address.bind(addressHost);
    corridor.start(host);
    standUpFor.clear();
    unitAt.clear();
    gone.clear();
    prevAt = null;
    /*
     * 의심도 문턱을 여기 건다 — 값을 어디서 올리든 같은 일이 일어난다.
     * 본판(WorldFeature)도 같은 자리를 쓰지만 두 판이 같이 도는 일은 없다. 떠날 때 반드시 푼다 (leave).
     */
    suspicion.bindCross((t) => onSuspicion(t), 'scenario2');
    // 뛰었다고 의심하지 않는다 — 점프는 조작이지 사람의 표시가 아니다 (2026-09-03 사용자). 판을 떠날 때 되돌린다
    watchJump(false);
    releaseHold();
    devPin = false;
    Object.assign(state, { room: 'corridor', objective: null, banner: null, blackout: 0, urgent: null, choice: null, notice: null, stillness: null, near: null, aim: null, talking: false, done: false, extra: [], consoleNear: false, answer: null });
    /*
     * ★ 음성 목록을 **먼저 받아 두고** 첫 방에 들어간다. play 는 줄 offset 을 한 번에 다 계산하는데,
     *   그때 manifest 가 아직 없으면 durationOf 가 undefined 라 인트로 전체를 글자로만 재 버린다
     *   (그 뒤 줄들은 이미 받아 둔 목록으로 제대로 재진다 — 어긋나는 건 첫 대본뿐이라 더 안 보였다).
     *   못 받아도 판은 굴러가야 하므로 1.5 초에서 끊는다.
     */
    const first = INTRO[0];
    const warm = voiceLines.prefetch(SPEAKER[first.who].name, fill(first.text), false);
    void Promise.race([warm, new Promise((r) => window.setTimeout(r, 1500))]).then(() => enterRoom('corridor'));
    // 소문이 도는 시간 — 조각은 판이 도는 내내 저희끼리 옮겨 다닌다
    spreadTimer = window.setInterval(() => fragments.spread(), SPREAD_MS);
  },

  leave(): void {
    clearTimers();
    window.clearInterval(spreadTimer);
    suspicion.bindCross(null);
    suspicion.hold(false);
    watchJump(true);
    corridor.reset();
    address.reset();
    attitude.stop();
    emit = null;
    onRoom = null;
    onArena = null;
  },

  /**
   * 프레임마다 내 자리를 넘긴다. 여기서 하는 일은 다섯이다 —
   * 곁의 상대를 집고, 방마다의 시계(휴게 90 초 · 중앙 시설의 국면)를 돌리고, 나가는 자리에 닿았나 보고, 집행을 굴리고, 막혔으면 속마음 한 줄.
   * `yaw` 는 카메라가 보는 방향(heading 규약 — θ 가 보는 방향은 (sin θ, cos θ), Room2Scene 의 Tracker 가 준다). 굉음에 돌아봤는지만 본다.
   */
  track(x: number, z: number, dt: number, moving: boolean, yaw?: number, from?: Room): void {
    const room = state.room;
    const now = performance.now();
    /*
     * ★ 이번 방의 카메라만 — 방을 옮기는 프레임에 앞 방의 Tracker 가 앞 방의 자리를 한 번 더 넘긴다 (그 한 프레임이 새 방의 문턱 · 코어권 · 그늘을 켜고 있었다).
     *   Tracker 가 제 방을 같이 넘기면 그걸로 가르고(from), 안 넘기면 자리로 가른다: 새 씬의 첫 프레임은 스폰이라 스폰에서 3 m 밖의 첫 자리는 앞 방의 것이다
     */
    if (from !== undefined && from !== room) return;
    if (!settled) {
      const sp = SPAWN2[room];
      if (Math.hypot(x - sp.x, z - sp.z) > SETTLE_M) return;
      settled = true;
    }
    // 첫 걸음이 곧 조작권이다 — 잠금 알림이 늦거나 터치인 판도 여기서 잡힌다
    if (moving) takeControl(now);
    const prev = prevAt;
    prevAt = { x, z };
    meAt = { x, z };
    yawNow = yaw;

    /*
     * ① 곁의 상대 — 다가가서 **멈추면** 저절로 말이 걸린다.
     *   말을 거는 중이면 그 상대를 붙잡아 둔다: 거리 눈금이 살아 있어야 「내가 지금 누구 앞에 서 있나」가 읽힌다.
     */
    let near: { id: string; dist: number } | null = devPin ? state.near : null;
    /*
     * 겨눔(aim) — **[E] 를 누르면 붙잡을 것.** 곁(near)과 셋이 다르다:
     *   · `p.still` 을 **안 본다** — 걷는 몸도 겨눌 수 있다. 이것이 사용자의 「영역으로하면 움직였을때
     *     오류가 날꺼같아」에 대한 답이다: 걷는 몸에게 말을 거는 길이 여태 아예 없었다.
     *   · 거리가 조금 넉넉하다 (AIM_DIST 3.4 > TALK_DIST 2.6) — 걷는 몸을 따라가며 겨누려면 여유가 필요하다.
     *   · **원뿔**로 자른다 (AIM_CONE_DEG) — 등 뒤의 몸이 잡히면 [E] 가 무엇을 잡을지 화면에서 알 수 없다.
     * 후보가 여럿이면 **가깝고 정면인 것**이 이긴다 (score = 거리 × 각 벌점).
     */
    let aim: { id: string; dist: number } | null = null;
    let aimScore = Infinity;
    const cone = (AIM_CONE_DEG * Math.PI) / 180;

    for (const id of devPin ? [] : addressable(room)) {
      // 자는 것에게는 말이 안 걸린다 — 대답하는 순간 「잔다」가 거짓이 된다 (휴게 구역의 손끝)
      if (room === 'rest' && id === REST_SLEEPER) continue;
      // 말 상대가 아닌 것 — 화자표에도 배역표에도 없는 몸 (자리표의 대체 개체 'sub')
      if (!speakableId(id)) continue;
      const p = unitAt.get(id);
      if (!p) continue;
      const d = Math.hypot(p.x - x, p.z - z);

      // ── 겨눔: 걷든 서든, 원뿔 안이면 후보다
      if (d < AIM_DIST) {
        let off = 0;
        if (yaw !== undefined) {
          const to = Math.atan2(p.x - x, p.z - z);
          // −π~π 로 접는다 — 안 접으면 화면 정면의 몸이 각 6 라디안으로 읽혀 원뿔 밖으로 떨어진다
          off = Math.abs(Math.atan2(Math.sin(to - yaw), Math.cos(to - yaw)));
        }
        if (off <= cone) {
          const score = d * (1 + off / cone);
          if (score < aimScore) {
            aimScore = score;
            aim = { id, dist: d };
          }
        }
      }

      /*
       * ── 곁: **옛 계약 그대로다.** 서 있고 TALK_DIST 안이어야 한다 —
       *   Enter 로 여는 경로(Hud2 의 talkOpenKey)와 talkpanel.test.ts 가 이 조건을 쥐고 있다.
       *   걷는 몸이 여기 안 드는 것은 여전히 옳다: 자동 판정이 매 프레임 상대를 갈아 끼우면
       *   「내가 누구에게 말했나」가 판에 안 정해진다. 걷는 몸은 [E] 로 **붙잡아서** 곁이 된다 (바로 아래).
       */
      if (p.still && d < TALK_DIST && (!near || d < near.dist)) near = { id, dist: d };
    }

    /*
     * ── 붙잡은 상대 — [E] 가 세운 talkPin. 살아 있는 동안은 **걸어도 곁이 안 끊긴다.**
     *   여기가 「치는 동안 거리 눈금이 살아 있어야 내가 지금 누구 앞에 서 있나가 읽힌다」의 실제 자리다.
     *   먼저 유효성을 본다 — 하나라도 어긋나면 놓는다 (죽은 몸을 곁에 들고 있는 판이 없게).
     */
    if (talkPin && !devPin) {
      const p = unitAt.get(talkPin.id);
      const d = p ? Math.hypot(p.x - x, p.z - z) : Infinity;
      if (!p || now > talkPin.until || d > HOLD_DROP_M) releaseHold();
      else {
        near = { id: talkPin.id, dist: d };
        // 매 프레임 다시 걸어 준다 — 내가 움직이는 동안 그 몸의 고개가 따라온다 (patrol 쪽은 좌표만 갱신한다)
        patrol.talkHold(talkPin.id, meAt);
      }
    }
    /*
     * 검문 중에는 **듣는 것이 경비다** — 곁에 누가 있든 Enter 한 마디는 관문의 답이 된다.
     * 자리가 고정돼 있어 경비 앞까지 걸어갈 수가 없으니, 경비가 곁으로 온 것으로 친다 (대본: 「UNIT-21 이 나에게로 온다」)
     */
    if (!devPin && (gateOpen() || openers.pending())) {
      const g = unitAt.get('guard21');
      near = { id: 'guard21', dist: g ? Math.hypot(g.x - x, g.z - z) : 0 };
    }
    // 개체가 말을 걸고 답을 기다린다 — 8 m 밖에서 걸어온 말이라 2.6 m 안이 아닐 수 있다. 창이 열려 있는 동안은 그 화자가 듣는다 (D1, address.ts ④)
    const looker = devPin ? null : address.pinned();
    if (looker) {
      const p = unitAt.get(looker);
      near = { id: looker, dist: p ? Math.hypot(p.x - x, p.z - z) : 0 };
    }
    if (
      near?.id !== state.near?.id ||
      aim?.id !== state.aim?.id ||
      Math.abs((near?.dist ?? 0) - (state.near?.dist ?? 0)) > 0.05 ||
      Math.abs((aim?.dist ?? 0) - (state.aim?.dist ?? 0)) > 0.05
    ) {
      patch({ near, aim });
    }
    /*
     * ★ **자판을 저절로 잡지 않는다** (2026-09-02 사용자: 「대화창이 열리면 움직이지 못해」).
     *   입력줄은 Enter 로만 열린다 — 다가섰다는 이유로 발이 묶이지 않는다.
     *   그리고 **누구에게 거는지 고르지 않는다**: 보낼 때 곁에 있는 것이 듣는다 (say 의 ★).
     */

    // ② 방의 시계 — 복도의 첫마디 · 휴게 구역의 90 초 · 중앙 시설의 국면 · 작업 구역의 주기와 소각로 · 기록 복도의 손
    if (room === 'corridor') corridor.tick(now, meAt);
    if (room === 'rest') tickRest(now, x, z, dt, moving);
    if (room === 'central2') tickCentral2(now, x, z);
    if (room === 'work') tickWork(now, x, z);
    if (room === 'archive') archiveScene.tick(now);
    // 개체가 나에게 걸어와 말하는 것 — 걸어오기 · 조용해지기 · 줄 끝 · 답할 창. 집행 · 검문 · 경비의 물음 동안은 멎는다
    address.tick(now);
    // 경비의 첫마디(20 통과 · 잡담 · 무응답 18 초 · 스캔) — **경비가 없는 방에서도 매 프레임** 돈다: 무응답의 시계와 스캔은 방을 따라다닌다.
    // 경비의 유무는 openers 가 host.guard() 로 본다 — 없으면 ask 도 잡담도 아무것도 안 쓴다
    openers.tick(now, host);
    // 배회 개체 둘의 대화 — 이 방의 목격 반경 안에서만 들린다
    tickOverhear(now);
    // 화면 공지가 시간을 다 살았다
    if (state.notice && now >= state.notice.until) patch({ notice: null });

    // ③ 나가는 문 — 문짝이 먼저 열리고(문 앞 7 m), 문 앞에 닿으면 방이 바뀐다
    tickExitDoor(room, x, z);
    if (atExit(room, x, z) && !state.blackout && canLeave(room)) {
      const next = nextRoom(room);
      if (next) go(next);
    }

    /*
     * ④ 집행 — 걸어오는 것. 곁에 누가 있느냐로만 개입이 열린다.
     *   기록 복도와 창이 있는 방에는 집행이 없다 (EXEC_ROOM 의 null).
     */
    if (EXEC_ROOM[room]) {
      // 의심도가 내려가면 집행자도 물러난다 — 되돌릴 수 있는 자리까지는 되돌린다
      execution.relax(suspicion.get().value);
      const before = execution.get().phase;
      const ids = roster(room);
      // 곁의 것들 — 가까운 순으로, 중앙 시설은 그 자리의 개입 가능 인원까지만 (interveners)
      execution.tick(interveners(room, zoneNow(room), placed(ids), meAt));
      const after = execution.get().phase;
      if (after !== before) {
        const who = execution.get().cover ?? '';
        if (after === 'blocked') onBlocked(who);
        else if (after === 'bodyBlock') onBodyBlock(who);
        else if (after === 'unsling') onUnsling();
        else if (after === 'aim') onAim();
        else if (after === 'dead') onDead();
        else if (after === 'spared') onSpared(who);
      }
      /*
       * 여덟 걸음의 몸 — 걸어오는 동안 걸음(stepOf)마다 하나씩 등을 돌린다. 답해서 watch 로 물러나면(answered) ·
       * 대신 나섰으면(spared) 풀린다. 죽은 뒤에는 그대로 — 아무도 안 보는 것이 이 게임에서 가장 시끄러운 장면이다
       */
      const walking = after === 'approach' || after === 'blocked' || after === 'bodyBlock' || after === 'unsling' || after === 'aim';
      if (walking) tickTurnAway(execution.stepOf(now));
      else if (after !== 'dead') releaseTurnAway();
      /*
       * 도주 — **못 도망친다.** 걸어오는 동안 **문 쪽으로** 뛰면 시도 자체가 인간의 증거라
       * 본 개체 전원의 태도가 내려간다. 다음 판에도 남는다 (조각). 개체 곁으로 가는 걸음은 도주가 아니다 (개정 3).
       * 대사는 없다 — 효과만 (D18: 문서에 도주 대사가 없다)
       */
      const door = doorOf(room, meAt);
      if (moving && prev && door && (after === 'approach' || after === 'unsling') && execution.flee(ids, { dir: { dx: x - prev.x, dz: z - prev.z }, me: meAt, door })) {
        fragments.make({
          text: '도주하려던 것이 있었다',
          topic: '도주',
          from: '나',
          where: ROOM_TITLE[room],
          tags: ['인간적'],
          witnesses: ids,
        });
      }
    }

  },

  /**
   * 복도의 그림 한 장을 들여다봤다 — 처음이면 말할 거리가 하나 생긴다.
   * 폭행 그림(beating · INSCRIPTION)은 어휘를 안 주고 세지도 않는다 — 대신 목표가 「안쪽으로 이동하라」로 넘어간다 (G06). 그림 수 조건은 없다
   */
  sawScrawl(kind: ScrawlKind): void {
    if (kind === 'beating') {
      if (lexicon.inscriptionSeen()) return;
      lexicon.sawInscription();
      const lines = SCRAWL_LINES[kind];
      const t = lines ? speak('thought', lines) : 0;
      if (state.room === 'corridor') later(t + 400, () => patch({ objective: OBJ_MOVE_IN }));
      return;
    }
    if (!lexicon.saw(kind)) return;
    const lines = SCRAWL_LINES[kind];
    if (lines) speak('thought', lines);
    // 그림을 셋 이상 봤다 — 과학자가 끼어든다. 인간은 이 기록을 못 읽는다
    if (lexicon.seenCount() >= 3 && !fired.has('dismiss')) {
      fired.add('dismiss');
      later(1800, () => play(DISMISS));
    }
  },

  /** 정비 명판을 들여다봤다 — 이 판의 정답이 여기서 정해진다 */
  readTag(): void {
    if (identity.get().known) return;
    identity.reveal();
    const tt = play(TAG_LINES);
    // 명판을 읽었으면 목표가 벽으로 넘어간다 — 본판 exploreObjective 의 두 갈래. 다른 목표(말 걸기 · 이동)가 떠 있으면 그대로 둔다
    later(tt, () => {
      if (state.objective === OBJ_INSPECT) patch({ objective: OBJ_INSPECT_WALL });
    });
  },

  /**
   * 기록 복도의 벽 — 응시(Gaze 1.2 초)로만 판정한다 (D17). 열여섯 번째 금은 속마음 두 줄, A-155 의 메모 둘은 **글자만**이다
   * (D7: 응시 HUD 라벨로 읽힌다 — 대사 줄도 소리도 없다). 첫 메모는 쉼 주제를 열고, 둘째는 「번호랑 구역만 묻는다」 힌트를 켠다
   */
  sawArchive(what: 'sixteen' | 'memoRest' | 'memoAsk'): void {
    archiveScene.saw(what);
  },

  /* ── 말 걸기 — 문장은 내가 적는다 ── */

  /**
   * 입력줄을 연다 — **Enter 하나로, 아무 데서나.** 곁에 아무도 없어도 열린다:
   * 말은 걸 수 있고, 듣는 것이 없으면 아무 데도 안 남을 뿐이다 (목격자가 없으면 조각이 안 생긴다).
   * 이때부터 다리가 멈춘다 (본판 입력줄과 같은 규칙).
   */
  openTalk,

  /**
   * **대화 스킵** — 아직 안 나온 줄을 전부 지금 내보내고, 대화창은 한 칸 넘긴다 (Scenario2Feature 가 Space 에 건다).
   * 방을 옮기거나 목표를 바꾸는 연출은 안 앞당긴다: 그건 이야기의 시각이지 읽는 속도가 아니다.
   * 돌려주는 값은 「대화창도 한 칸 넘겨야 하나」다 — 넘길 줄이 아무것도 없으면 누른 값을 안 쓴다.
   */
  skip(): boolean {
    const lines = timers.filter((t) => t.kind === 'line');
    for (const t of lines) {
      window.clearTimeout(t.id);
      const i = timers.indexOf(t);
      if (i >= 0) timers.splice(i, 1);
    }
    for (const t of lines) t.fn();
    busyUntil = 0;
    return true;
  },

  /**
   * [E] — **겨눈 것에게 말을 건다.** 그 밖에 손으로 하는 것은 코어 출력 콘솔 하나다.
   *
   * 2026-09-03 사용자: 「로봇한테 말을 걸면 E를 눌러서 말을 걸수있게해줘. 영역으로하면 움직였을때 오류가 날꺼같아.」
   * 여덟 걸음의 개입은 여전히 **개체가 스스로** 나선다 (D18: 「개체 뒤로 가기」 삭제 — 이동만 자유).
   * 갈림([E]/[Q] 패널)과 도화선 판은 Scenario2Feature 의 창구가 choose 로 **먼저** 잡으므로 여기 안 온다.
   *
   * 사다리에 순서가 있고, 그 순서마다 이유가 있다:
   */
  pressE(): void {
    takeControl(performance.now());
    // 단추·DEV 경로로 들어올 수도 있어 여기서도 한 번 막는다 (창구가 이미 걸러 주는 것들)
    if (state.talking || state.choice || state.urgent || state.blackout) return;
    /*
     * ① 콘솔이 제일 위다. 판정이 가장 좁고(2.2 m · 35° 정면) 벽에 붙은 물건이라 그 자리에 몸이 설 수 없다.
     *   그리고 **검문 중에는 near 가 거리와 무관하게 guard21 로 강제**되므로(track), 말 걸기를 위에 두면
     *   검문이 도는 동안 콘솔이 영영 안 눌린다.
     */
    if (state.consoleNear) {
      useConsole();
      return;
    }
    /*
     * ② 이야기가 못 박은 상대 — 검문 · 경비의 물음 · 저쪽이 먼저 건 말. 그 창이 열려 있는데 옆 개체에게
     *   말이 가면 answerGate · openers.answer · address.answer 갈래가 통째로 새 버린다 (sayLine).
     *   이때 [E] 는 Enter 와 **같은 일**을 한다: 붙잡을 것이 없다 (상대는 이미 정해져 있다).
     */
    if (gateOpen() || openers.pending() || address.pinned()) {
      openTalk();
      return;
    }
    /*
     * ③ 겨눈 것 → 없으면 곁. 겨눔은 걷는 몸도 잡으므로 여기서 붙잡으면 그 몸이 그 자리에 선다.
     * ④ 아무것도 안 물리면 **아무 일도 안 한다.** 「허공에 한 말」의 계약은 Enter 가 계속 맡는다 —
     *   [E] 는 겨누는 동사, Enter 는 말하는 동사다. 둘을 다 남기므로 기존 계약이 하나도 안 깨진다.
     */
    const id = state.aim?.id ?? state.near?.id ?? null;
    if (!id) return;
    holdTalk(id);
    openTalk();
  },

  /**
   * 조작권 — 이 방에서 손을 댔나. 포인터 잠금(Scenario2Feature 의 pointerlockchange) · 터치 · 첫 걸음 · Enter 가 잡는다.
   * 나에게 일어나는 일의 시계(첫마디 12 초 · 휴게 6/90 초 · 소문 · 엿듣기 · 소각로 폴백 · 락다운 90 초 · 창의 30 초)는 전부 이 뒤에야 돈다
   */
  controlled(): boolean {
    return control.taken();
  },
  /** 잠금이 잡혔다 / 풀렸다 — 잡히면 이 방의 시계가 지금부터 돈다. 풀려도 센 것은 그대로다 (방을 옮기면 다시 본다) */
  setControlled(v: boolean): void {
    inControl = v;
    if (v) takeControl(performance.now());
  },

  useConsole,

  /** 자판을 놓는다 — 다리가 다시 움직인다. 첫마디의 창이 멈춰 있었으면 다시 흐른다 */
  closeTalk(): void {
    devPin = false;
    // 붙잡음은 여기서 통째로 놓는다 — 입력줄을 접은 것은 「그만 걸었다」다 (보낸 것과 다르다: 보낸 쪽은 꼬리를 남긴다)
    releaseHold();
    // 아무 말도 안 하고 닫았다 — 2 초 더 보다가 제 일로 돌아간다 (말을 걸었다가 만 것도 「걸었던」 것이다)
    if (state.near) attitude.attendTail(state.near.id);
    patch({ talking: false });
    address.release();
  },

  /**
   * 한 마디 건다. **선택지가 없다** — 무슨 말인지는 read.ts 가 낱말로 읽고, 값은 talk.ts 의 단가표가 매긴다.
   * 상대가 사람(동료 요원)이면 암구호가 여기서 통한다: AI 가 절대 하지 않는 말에 답하는 것이 우리 쪽이다.
   */
  say(text: string): void {
    sayLine(text);
  },

  choose,

  /** 쓰러진 개체인가 — Unit 이 몸을 눕히고 곁 판정에서 뺀다 (HOLD_BREACH) */
  fallen(id: string): boolean {
    return fallen.has(id);
  },
  /** 지금 겨누는 총 든 개체인가 — Unit 의 EnforcerBody 자세 */
  aiming(id: string): boolean {
    return aimingId === id;
  },
  /** 그 개체가 마지막으로 쏜 시각 — 총구 섬광 (muzzle.ts 의 FLASH_MS 안에서만 보인다) */
  flashAt(id: string): number {
    return shotAtOf.get(id) ?? 0;
  },

  /** 대화창이 서 있나 — Scenario2Feature 가 DialogueBox 의 onShowing 을 넘긴다. 인트로의 마지막 줄 뒤에 비면 설명이 끝난 것이다 */
  boxShowing(v: boolean): void {
    if (!v && introLastShown) fireIntroDone();
  },

  /** 개체가 지금 어디 서 있나 — Unit 이 프레임마다 적어 둔다 (곁의 상대를 집는 데 쓴다) */
  place(id: string, x: number, z: number, still = true): void {
    if (gone.has(id)) return;
    unitAt.set(id, { x, z, still });
  },
  forget(id: string): void {
    unitAt.delete(id);
  },
  /** 이 판에서 사라졌나 — 대신 나선 개체. Unit 이 몸을 숨기는 데 쓴다 */
  gone(id: string): boolean {
    return gone.has(id);
  },

  /** 콘솔 앞에 서 있나 — Console2 가 바뀔 때만 부른다 */
  setConsoleNear(v: boolean): void {
    if (state.consoleNear !== v) patch({ consoleNear: v });
  },

  /** 경비가 뒤에 붙었나 (okMarked · memory unknown) — 지금은 표로만 남는다. 재검실은 world2 범위 밖이다 */
  escorted(): boolean {
    return escort;
  },

  /** 마지막으로 한 마디 보낸 시각 — 경비의 첫마디 이유 「발화」(직전 5 초) 를 openers 가 이걸로 본다 */
  lastSayAt(): number {
    return lastSayAtMs;
  },
  /** 대체 개체가 걷기 시작한다 — furnace 가 켠다. Unit 의 pose 'fire-sub' 가 substituteWalkActive 로 읽는다 */
  substituteWalk(v: boolean): void {
    subWalking = v;
  },
  fireWalkActive,
  substituteWalkActive,
};

/** 「아무것도 하지 않기」를 해냈다 — 밖을 본 것이 처음으로 **먼저** 말을 건다. 문은 그래도 주기에 열린다 (목표는 안 바꾼다) */
function onStillness() {
  /*
   * 「아무것도 하지 않기」를 해냈다 — 밖을 본 것이 **걸어와서** 먼저 말을 건다 (2026-09-03 사용자: 중앙 시설과
   * 꼭 말해야 하는 자리 말고는 다가와서 말하거나 내가 걸었을 때만 말한다). 벽만 보고 서 있던 것이 이쪽으로 오는
   * 그 걸음이 이 방의 값이다 — 못 오면(붙잡혔거나 얼어붙었으면) 줄은 없다. 태도와 경보는 내가 해낸 것이라 그대로 치른다
   */
  // 「창살 안의 해」는 복도 window 벽화에서만 나온다 — 안 본 판에서는 그 넷째 줄을 뺀다
  const seerLines = lexicon.has('window') ? REST_SEER : REST_SEER.slice(0, 3);
  if (units.stage('seer') > -3) addressUnit('seer', seerLines, { scene: 'REST_SEER' });
  units.shift('seer', 1);
  alert.cool(6);
}

/**
 * 확인용 손잡이 — 헤드리스로는 방을 걸어서 옮길 수 없다(포인터 잠금도, 30 초 정적도 못 기다린다).
 * 본판의 `__probe`·`__backstep` 과 같은 규칙으로 DEV 에서만 연다: `window.__s2.jump('work')`.
 */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __s2?: unknown }).__s2 = {
    ...scenario2,
    /** 중앙 시설의 국면 저장소 — 국면 · 관문 · 문을 밖에서 읽는다 */
    c2: central2,
    /** 집행 저장소와 의심도 — 국면 · 한 발이 나간 시각(shotAt)을 밖에서 읽고, 헤드리스가 100 까지 올려 총구를 찍는다 */
    exec: execution,
    susp: suspicion,
    /** 머리 위 말풍선 — 개체가 방금 뭐라고 답했는지를 헤드리스가 값에서 읽는다 (화면 DOM 이 아니라) */
    bubbles: bubble,
    jump(room: Room) {
      onRoom?.(room);
      enterRoom(room);
    },
    /**
     * 말 걸기 판을 억지로 연다 — 헤드리스로는 개체 앞까지 **걸어갈 수가 없다**
     * (포인터 잠금이 없어 다리가 안 움직인다, LocalRig 의 active 조건).
     * 진짜 판에서는 이 함수를 아무도 안 부른다: 다가가서 멈추면 말을 걸 수 있다 — Enter 가 연다 (track 은 곁만 집는다).
     */
    /** 곁에 세운다 — 그 개체가 내 말을 듣는 자리에 있는 것과 같다 */
    nearTo(id: string, dist = 1.4) {
      devPin = true;
      patch({ near: { id, dist } });
    },
    /**
     * 입력줄까지 연다 — Enter 를 누른 것과 같다.
     * ★ **실전 경로는 pressE 다** (겨눔 → 붙잡음 → 열기). 이것은 헤드리스가 걸어갈 수 없어서 두는 우회로라
     *   붙잡음(talkPin)을 안 세우고 devPin 으로 곁만 고정한다 — 그래서 검문·경비의 강제도 같이 막힌다.
     */
    talkTo(id: string, dist = 1.4) {
      devPin = true;
      patch({ near: { id, dist }, talking: true });
    },
    unpin() {
      devPin = false;
      // 실전 경로의 붙잡음도 같이 놓는다 — 확인 도구가 판을 원래대로 되돌릴 때 하나만 남으면 안 된다
      releaseHold();
    },
    /** 관문의 답 — say 와 같다. 이름만 검문 쪽이다 */
    answer(text: string) {
      scenario2.say(text);
    },
    /**
     * 락다운을 당긴다 — 90 초를 헤드리스로 못 기다린다. 국면 저장소는 시각을 인자로 받는 순수 상태라
     * 「코어권에 8 초 전에 들어섰다」로 적어 두면 다음 프레임의 tick 이 제 규칙대로 락다운을 낸다 (시험이 until 을 고치는 것과 같은 수법)
     */
    debugLockdown() {
      const c = central2.get();
      if (c.phase !== 'bright') return;
      c.coreEnteredAt = performance.now() - CORE_LOCK_MS - 1;
    },
    /** 나가는 문짝 저장소 — 스크린샷 도구가 문을 열어 놓고 찍을 때 (다음 track 이 도로 닫는다) */
    exitDoor,
  };
}

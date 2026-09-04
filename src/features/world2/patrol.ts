/**
 * 걸어 다니는 것들 — **개체가 제자리에 못 박혀 있지 않다** (2026-09-02 사용자: 「로봇들은 맵을 돌아다닐 수 있게」).
 *
 * 처음 이 시나리오를 지을 때 개체는 전부 서 있기만 했다. 자리가 곧 성격이라는 규칙(Room2Scene) 때문이었는데,
 * 그러면 방이 박물관이 된다 — 저것들은 일하러 온 것이지 전시된 것이 아니다.
 *
 * ★ 어려운 것은 걷게 만드는 게 아니라 **말 걸기를 안 망가뜨리는 것**이다 (사용자: 「행동반경에 걸리지 않게」).
 *   말은 2.6 m 안에서 걸리고(scenario2 의 TALK_DIST), 레벨 설계 05 는 개체를 **6 m 이상** 떼어 놓으라고 한다 —
 *   반경이 겹치면 내가 누구에게 말한 건지 판이 못 정하기 때문이다. 걷기 시작하면 그 간격이 매 순간 깨진다.
 *
 *   그래서 규칙을 **자리**에만 건다:
 *     ① 개체는 **서 있을 때만** 말 걸기 대상이다. 걷는 동안에는 반경 자체가 없다.
 *     ② 서는 자리(post)는 다른 개체가 선 자리에서 **6 m 이상**일 때만 고른다. 아니면 그 자리를 안 쓴다.
 *     ③ 배경 개체(이름 없는 것)는 애초에 대상이 아니고, 이름 있는 것의 자리에서 **3.2 m** 밖에만 선다 —
 *        말 반경(2.6 m) 안에 남이 서 있는 그림이 안 나온다.
 *   길은 안 막는다. 지나가며 스치는 것은 연출이고, 문제가 되는 것은 **둘이 나란히 서 있는 것**뿐이다.
 *
 * ★ 이야기가 걸음을 빌린다 (v8). 순찰은 배경이지만 셋은 이야기가 직접 부른다 —
 *     stare     한 개체가 잠깐 나를 본다 (NOTICE · FIRST_LOOK · 소각로 뒤의 A-063). 몸이 돌아보는 것이 대사 대신이다
 *     approach  경비가 순찰을 놓고 내게 걸어와 앞에 선다 (OPENERS · 60 스캔). 서는 동안만 6 m 규칙의 예외다
 *     turnAway  집행 동안 다들 등을 돌린다 — 아무도 안 보는 것이 이 게임에서 가장 시끄러운 장면이다
 *   전부 **이 파일의 자리 규칙 위에서** 논다: 돌아보는 것은 자리를 안 옮기고, 걸어오는 것은 도착해야 still 이다.
 *
 * ★ 걷는 것은 **비켜 간다**(weave). 복도에 걷는 것이 셋이면 앞에 선 것 앞에서 영영 멎는 몸이 나온다 —
 *   막히면 가는 선에서 옆으로 새어 지나간다. 배경은 LANE 만큼, 순찰은 NAMED_LANE 만큼만(순찰선을 걷는 것이지 헤매는 것이 아니다).
 *   둘 다 비켜야 한다: 한쪽만 비키면 선 것과 뒤에 온 것 사이에 낀 몸이 영영 못 빠져나간다.
 *   비킬 옆마저 없으면 배경은 온 길로 반 몸 **물러선다**(give way) — 순찰은 다른 개체에게는 안 물러선다.
 *   비켜 가는 몸이 서로 스치는 그 순간이 엿듣기(overhear.ts)의 자리다.
 *
 * ★ 막은 것이 **사람**이면 규칙이 하나 뒤집힌다 (2026-09-03). 사람은 방의 주 통로(복도 x 0 · 휴게 x 0 · 기록 중심선)에 늘 서 있고,
 *   비킬 폭(lane)이 사람 앞에서 멎는 거리(PLAYER_GAP)보다 좁으면 어떤 몸도 옆으로 돌아 나가지 못한다 — 시뮬에서 순찰이 48~60 초 멎었다.
 *   그래서 lane 은 PLAYER_GAP 보다 넓게 두고(1.2 / 1.4 > 1.1), 순찰도 **사람에게는** 옆걸음과 물러섬을 허락한다.
 *   단 approach(경비가 내 앞에 서는 연출) 중은 예외 — 사람 앞에서 서는 것이 그 걸음의 목적이다. stare · pin · freeze 중엔 애초에 안 걷는다.
 *   사람이 다음 자리 위에 서 있으면 그 자리는 **없는 자리**다 — 닿을 수 있는 데까지 가서 다음 자리로 돌아선다(밀치지도, 기다리지도 않는다).
 *
 * ★ 개체도 **맵 충돌을 본다** — reset 이 받는 solid(x, z) 가 참인 발은 안 디딘다(직진 · 옆걸음 · 물러섬 전부).
 *   Room2Scene 이 그 방의 resolveColliders 로 만들어 준다. 없으면(시험) 벽이 없는 것처럼 걷는다 — 자리와 선이 방 안에 있다는 것은 시험이 따로 쥔다.
 *
 * ★ 걸음은 몸이 그린다. 성격마다 뽑은 GLB 에 Tripo 로 뼈와 클립(preset:biped:walk · idle)을 나중에 넣었다
 *   (tools/scenario2-cast-rig.sh). 뼈가 없는 몸은 걷는 자리에 안 세운다 — 정지 메시가 미끄러지면 그게 더 나쁘다.
 */

import { ARCHIVE_PATH } from '@/world2/map/archive';
import { CENTRAL2_CORE, CHECK_SPOTS } from '@/world2/map/central2';

import { roster, type Room } from './scenario2';

export interface Post {
  x: number;
  z: number;
  /** 그 자리에 서서 보는 방향(rad). 안 주면 마지막으로 걸어온 방향을 그대로 본다 */
  heading?: number;
}

export interface Beat {
  /** 돌아가며 서는 자리들. 하나뿐이면 그 개체는 안 움직인다 */
  posts: readonly Post[];
  /** m/s. 이 구역의 걸음은 전부 느리다 — 급할 이유가 있는 개체가 하나도 없다 */
  speed?: number;
  /** 한 자리에 머무는 시간(ms) 최소·최대 */
  dwell?: readonly [number, number];
  /** 이름 있는 것인가 — 말을 걸 수 있는 것만 6 m 규칙을 서로 지킨다 */
  named?: boolean;
  /** 앞이 막히면 옆으로 비켜 가나 — 안 주면 비킨다. 자리가 하나뿐인 것은 어차피 안 걷는다 */
  weave?: boolean;
  /** 비켜 갈 때 가는 선에서 벗어나도 되는 폭(m) — 안 주면 LANE(배경) · NAMED_LANE(이름 있는 것). 좁은 방(기록 복도)은 여기서 줄인다 */
  lane?: number;
  /**
   * 지나가기만 한다 — 자리에 닿아도 서지 않고 곧장 다음 자리로 돌아선다. 복도의 배회하는 둘(D6): 「지나가는 것이지 서는 것이 아니다」.
   * 예전엔 양 끝을 이름 있는 것의 3.2 m 안에 두어 서지 못하게 했는데, 방이 넓어지며 그 자리가 스폰 곁이 되어 규칙으로 바꾼다
   */
  pass?: boolean;
}

/** 말 걸기 거리(scenario2 의 TALK_DIST)의 두 배 이상 — 레벨 설계 05 의 「6 m 이상」 */
export const POST_GAP = 6;
/** 배경 개체가 이름 있는 것의 자리에서 물러서는 거리. 말 반경(2.6) 밖이다 */
export const BG_GAP = 3.2;
/** 걷다가 앞에 누가 있으면 멎는 거리 — 몸이 서로를 통과하지 않게 */
export const YIELD = 1.15;
/**
 * 사람 앞에서 멎는 거리 — 개체는 나를 밀고 지나가지 않는다.
 * 밀어내기(bystanders.pushOut: 0.45 + 0.42 = 0.87)보다는 커야 개체가 사람을 실제로 밀치지 않고, lane 보다는 작아야 옆으로 돌아 나간다
 */
export const PLAYER_GAP = 1.1;
/** 비켜 갈 때 가는 선에서 벗어나도 되는 폭 — PLAYER_GAP 보다 넓어야 사람을 돌아 나간다. 벽은 solid 가 따로 막는다 */
export const LANE = 1.4;
/** 이름 있는 것(순찰)이 벗어나는 폭 — 순찰선에서 한 몸 남짓. PLAYER_GAP(1.1)보다 넓어 사람은 돌아 나가되 헤매지는 않는다 */
export const NAMED_LANE = 1.2;

/**
 * 중앙 시설 홀에 선 손끝(A-118)의 자리 — 여기 두는 이유는 자리표(Room2Scene)와 이 파일의 자리가 **한 수**여야 해서다: 두 군데 적으면 하나가 어긋난다.
 * 코어(0, −10.5)에서 8.1 m — 홀(6~10 m)이다. −x 쪽 씨앗 슬롯(−3.41, −5.63)에서 3.96, 재회 슬롯(−3.5, −2.2)에서 5.9 — 둘 다 BG_GAP(3.2) 밖.
 * 검문 앞줄(−3, 1.2)에서 9.0, 순찰의 서는 끝(−9, 2.6)에서 9.6 — 이름 있는 것끼리의 6 m 밖. 벽(x −13)에서 5.8, 콘솔 bay(z −6, x −12.4)에서 5 m 남짓
 */
export const CENTRAL2_HALL_POST = { x: -7.2, z: -6.8 } as const;

const SPEED = 0.9;
const DWELL: readonly [number, number] = [4000, 11000];
/** 도착 판정 */
const ARRIVE = 0.12;
/** 도는 속도(rad/s) — 몸이 홱 돌면 기계가 아니라 오류로 보인다 */
const TURN = 2.4;
/**
 * 이만큼 목표에 **가까워지지 못했으면** 배경은 온 길로 물러선다(give way). 비켜 갈 옆이 없을 때의 마지막 수다 —
 * 4 m 복도에 걷는 셋과 그림 앞에 선 하나가 한 z 에 모이면(순찰 · 배회 둘 · A-137) 앞도 옆도 다 막혀 셋이 영영 멎는다.
 * 「한 발도 못 디뎠다」로 재지 않는 이유: 양옆에 하나씩 있으면 옆걸음이 왼쪽 오른쪽 번갈아 **성공하면서** 제자리다.
 * 순찰은 안 물러선다(순찰선을 걷는 것) — 이름 없는 것이 반 몸 물러나면 순찰이 옆으로 새어 지나가고 그 뒤로 다 풀린다.
 * 1.5 초: 그림 앞의 A-137 을 비켜 가는 옆걸음(0.6 m · 0.75 초)보다 넉넉히 길어야 정상 비킴이 물러섬으로 안 읽힌다
 */
const GIVE_WAY_MS = 1500;
/** 물러서는 한 번의 길이 — 0.8 m/s 로 반 몸 남짓. 그 뒤엔 다시 GIVE_WAY_MS 동안 비켜 보고, 안 되면 또 물러선다 */
const GIVE_WAY_BURST_MS = 700;
/**
 * 물러설 때만 쓰는 좁은 간격 — 몸이 겹치지 않을 만큼(몸 폭 0.7 남짓). 멎는 거리(YIELD)로 재면 곁에 와 선 순찰 쪽으로 반 뼘 가까워지는
 * 뒷걸음도 막혀 앞뒤 옆이 다 닫힌다. 물러섬은 양보지 비킴이 아니다 — 스치는 것은 허락하고 겹치는 것만 막는다
 */
const GIVE_WAY_CLEAR = 0.8;
/**
 * 이만큼 가는 선을 따라 한 뼘도 못 나아갔고 막은 것이 사람이나 벽이면 **이 걸음을 버리고** 다음 자리로 돌아선다.
 * 사람 둘레를 돌다가 상자 모서리와 사람 사이에 끼면(작업 구역 순찰선 위의 사람 + 벽에 붙인 상자) 앞·옆·뒤가 전부 닫혀 물러섬도 안 된다 —
 * 그때는 돌아서는 것이 개체가 할 수 있는 유일한 자연스러운 일이다. 다른 개체에게 막힌 것은 여기 안 든다: 그쪽이 물러서 준다(배경) 는 규칙 위에 있다
 */
const STUCK_MS = 4000;
/**
 * 다음 자리를 사람이 밟고 서 있을 때 **비켜 주기를 기다리는 한도**(ms). 넘기면 그 자리는 건너뛰고 다음 자리로 간다.
 * 영영 기다리면 안 되는 이유: 휴게 구역은 **30 초 가만히 서 있는 것이 과제**라(scenario2 의 stillness) 사람이 안 비킨다 —
 * 이름 없는 배경을 걷어내고 나니 그 방에서 움직이는 유일한 것(A-201)이 사람의 자리 하나에 두 판 내내 붙박였다 (2026-09-03 시뮬).
 * 서지 못하는 것과 서성임이 멎는 것은 다르다: 못 서면 안 서고 지나간다 — 도착에서 쓰는 규칙(postFree)과 같은 규칙이다.
 */
const PLAYER_POST_MS = 4000;

interface Pt {
  x: number;
  z: number;
}

interface Mover {
  id: string;
  beat: Beat;
  x: number;
  z: number;
  heading: number;
  /** 지금 서 있는 자리. 걷는 중이면 null */
  at: number | null;
  /** 가고 있는 자리 */
  goal: number;
  /** 이 시각까지는 안 움직인다 */
  waitUntil: number;
  /** 지금 걸음이 출발한 점 — 비켜 갈 때 「가는 선」의 기준 */
  from: Pt;
  /** 서 있는 동안 이쪽을 본다(rad). null 이면 자리의 heading */
  faceTo: number | null;
  /** 잠깐 이 점을 본다 — 끝나면 back 으로 돌아간다 (null 이면 안 돌아간다: 걷던 것) */
  stare: { x: number; z: number; until: number; back: number | null } | null;
  /** 순찰을 덮은 걸음 — 이 점으로 걸어가 stopAt 에서 선다 */
  approach: { x: number; z: number; stopAt: number; then: 'stand' | 'resume'; arrived: boolean } | null;
  /** 자리 밖에서 서 있다 (approach 도착 · pin) — of().still 이 true */
  hold: boolean;
  /** 밖에서 몸을 움직이는 중(Unit 의 불 걸음) — 여기서는 안 움직이고 자리만 안다 */
  driven: boolean;
  /** 이 걸음에서 가는 선을 따라 남은 거리의 최솟값과 그 시각 — GIVE_WAY_MS 동안 안 줄면 막힌 것이다. since < 0 은 아직 안 잰 것 */
  leg: { best: number; since: number };
  /** 이 시각까지는 물러서기만 한다 (give way 중) */
  giveWayUntil: number;
  /** 가는 선을 따라 마지막으로 나아간 시각 — give way 로도 안 풀리는 끼임(STUCK_MS)을 이걸로 잰다. 물러섬은 이걸 안 건드린다 */
  lastProgress: number;
  /** 지금 걸음의 직진을 막은 것 — 끼임에서 돌아설지(사람·벽) 기다릴지(개체)를 가른다 */
  stuckBy: 'player' | 'solid' | 'mover' | null;
  /** 다음 자리를 사람이 밟고 서 있어 기다리기 시작한 시각. −1 이면 안 기다리는 중 (PLAYER_POST_MS) */
  waitingForPost: number;
  /**
   * [E] 로 붙잡혔다 — 이 점(내 자리)을 보고 **그 자리에 선다.** 걷던 것도 여기서 멎는다.
   * `back` 은 놓아 줄 때 돌아갈 방향 (걷던 것은 null — 돌아갈 방향이 없다).
   * ★ stare 와 달리 **시각으로 안 풀린다**: 붙잡은 쪽(scenario2 의 talkPin)이 풀어 준다.
   *   ms 로 스스로 풀리게 두면 붙잡은 채 오래 이야기하는 동안 도중에 몸이 돌아가 버린다.
   */
  talkHold: { x: number; z: number; back: number | null } | null;
}

const movers = new Map<string, Mover>();
let frozen = false;
/** 이 발은 벽·상자 안이다 — 방이 준다(reset). null 이면 맵 충돌이 없는 것으로 걷는다(시험) */
let solid: ((x: number, z: number) => boolean) | null = null;

function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/** 그 자리에 서도 되나 — 다른 것이 선 자리(또는 가고 있는 자리)에서 충분히 떨어졌나 */
function postFree(me: Mover, p: Post): boolean {
  for (const other of movers.values()) {
    if (other === me) continue;
    const gap = me.beat.named && other.beat.named ? POST_GAP : BG_GAP;
    // 남이 서 있는 자리와, 남이 가고 있는 자리 둘 다 본다 — 도착해서 나란히 서는 일이 없게
    const target = other.beat.posts[other.goal];
    /*
     * **지나가는 몸은 안 센다.** 이 규칙이 막으려는 것은 「말 반경 안에 남이 **서 있는**」 그림인데(머리말 ②③),
     * 걷는 몸은 애초에 말 걸기 대상이 아니다(규칙 ①). 여태는 걷는 몸의 그 순간 자리까지 세는 바람에,
     * 순찰선 곁의 자리는 순찰이 지나갈 때마다 거절돼 **영영 못 서는 자리**가 됐다 —
     * 중앙 시설 검문 앞줄(순찰선에서 1.3 m)이 그래서 12 초에 3 m 를 오갔다 (2026-09-03).
     * 가고 있는 자리(target)는 그대로 본다: 거기 서면 나란히 서게 되는 것은 여전히 참이다.
     */
    if (other.at !== null && dist(p.x, p.z, other.x, other.z) < gap) return false;
    if (target && dist(p.x, p.z, target.x, target.z) < gap) return false;
  }
  return true;
}

/**
 * 이 발을 디뎌도 되나 — 사람(PLAYER_GAP)과 다른 몸(YIELD)에서 **더 가까워지지 않으면** 된다.
 * 이미 그 거리 안에 든 몸(마주 걷다 만난 둘 · 자리를 옮겨 세운 것)도 멀어지는 발은 디딜 수 있어야 한다 —
 * 「그 거리 안이면 무조건 멎는다」로 두면 한 발로는 못 빠져나가는 거리에서 둘 다 영영 멎는다.
 * 막은 것이 있으면 처음 걸린 것을 돌려준다 (비켜 갈 쪽을 정하는 데 쓴다)
 */
function blockerAt(m: Mover, nx: number, nz: number, me: Pt, clear = YIELD): Pt | null {
  const dm = dist(nx, nz, me.x, me.z);
  if (dm < PLAYER_GAP && dm <= dist(m.x, m.z, me.x, me.z)) return me;
  for (const other of movers.values()) {
    if (other === m) continue;
    const d = dist(nx, nz, other.x, other.z);
    if (d < clear && d <= dist(m.x, m.z, other.x, other.z)) return other;
  }
  return null;
}

/** 가는 선(from → to)에서 이 점이 옆으로 얼마나 벗어났나 */
function offLine(from: Pt, to: Pt, p: Pt): number {
  const lx = to.x - from.x;
  const lz = to.z - from.z;
  const len = Math.hypot(lx, lz);
  if (len === 0) return dist(p.x, p.z, from.x, from.z);
  return Math.abs(lx * (p.z - from.z) - lz * (p.x - from.x)) / len;
}

/**
 * 한 걸음 — 목표 쪽으로 step 만큼. 막히면 비스듬히(45°) 아니면 옆으로(90°) 한 걸음(막은 것의 반대쪽부터), 그것도 안 되면 멎는다.
 * 옆걸음은 가는 선에서 lane 안에서만 — 비켜 가다 벽에 박히는 몸이 없게. 이름 있는 것은 제 선을 덜 벗어난다(NAMED_LANE):
 * 순찰은 순찰선을 걷는 것이지 헤매는 것이 아니다. 방향은 늘 목표를 향하므로 지나가면 저절로 선으로 돌아온다.
 * 45° 를 먼저 보는 이유: 옆으로만 새면 막은 것의 둘레(PLAYER_GAP)에 닿자마자 다시 막혀 옆·직진이 번갈아 실패한다 —
 * 비스듬한 발은 둘레를 따라 돌면서 앞으로도 간다. 모든 후보 발은 solid(벽·상자)도 거절한다
 */
function walk(m: Mover, to: Pt, step: number, me: Pt, now: number): void {
  const dx = to.x - m.x;
  const dz = to.z - m.z;
  const d = Math.hypot(dx, dz);
  if (d === 0) return;
  const ux = dx / d;
  const uz = dz / d;
  if (m.leg.since < 0) m.leg = { best: ahead(m, to), since: now };

  /*
   * 물러서는 중 — 온 길로. 앞것에서는 멀어지고, 곁에 온 것과는 스쳐도 된다(GIVE_WAY_CLEAR) — 겹치는 것만 막는다.
   * 방향은 **가는 선**의 것이지 지금 목표를 보는 방향(u)이 아니다: 옆으로 비킨 채 u 의 반대로 물러서면 선에서 점점 멀어져 벽에 박힌다
   */
  if (now < m.giveWayUntil) {
    const lx = to.x - m.from.x;
    const lz = to.z - m.from.z;
    const len = Math.hypot(lx, lz);
    const bx = m.x - (len > 0 ? lx / len : ux) * step;
    const bz = m.z - (len > 0 ? lz / len : uz) * step;
    if (!blockerAt(m, bx, bz, me, GIVE_WAY_CLEAR) && !solid?.(bx, bz)) {
      m.x = bx;
      m.z = bz;
    }
    return;
  }

  const nx = m.x + ux * step;
  const nz = m.z + uz * step;
  const wall = solid?.(nx, nz) ?? false;
  const b = wall ? null : blockerAt(m, nx, nz, me);
  if (!b && !wall) {
    m.x = nx;
    m.z = nz;
    m.stuckBy = null;
    progressed(m, to, now);
    return;
  }
  m.stuckBy = wall ? 'solid' : b === me ? 'player' : 'mover';
  /*
   * 앞이 막혔다. 한참 못 가까워졌으면 옆걸음 대신 물러선다 — 옆걸음이 번갈아 되는 자리에서도 이 판정은 든다.
   * 배경은 누구에게나, 이름 있는 것은 **사람에게만** 물러선다(다른 개체에게는 순찰선을 지킨다). 내게 걸어오는 중(approach)이면 안 물러선다 —
   * 그 걸음은 내 앞에 서는 것이 목적이라, 막힌 자리가 곧 선 자리다
   */
  const byPlayer = b === me;
  const mayGiveWay = !m.beat.named || (byPlayer && !m.approach);
  if (mayGiveWay && now - m.leg.since >= GIVE_WAY_MS) {
    m.giveWayUntil = now + GIVE_WAY_BURST_MS;
    m.leg.since = now;
    return;
  }
  if (!(m.beat.weave ?? true)) return;
  if (byPlayer && m.approach) return;
  const lane = m.beat.lane ?? (m.beat.named ? NAMED_LANE : LANE);
  // 옆 — 막은 것이 오른쪽이면 왼쪽으로, 왼쪽이면 오른쪽으로. 벽에 막혔으면(b 없음) 일단 왼쪽
  const px = -uz;
  const pz = ux;
  let side = b ? (px * (b.x - m.x) + pz * (b.z - m.z) >= 0 ? -1 : 1) : 1;
  /*
   * 그쪽에 돌아갈 자리가 실제로 있나 — 막은 것의 둘레를 도는 길(옆 · 비스듬히 앞)이 벽·상자면 반대쪽으로.
   * 사람이 바로 앞이면 좌우가 같은 값이라 아무 쪽이나 고르는데, 그쪽이 벽에 붙인 상자 쪽이면 둘레를 돌다가 모서리에 낀다
   */
  if (solid) {
    const c = b ?? { x: m.x, z: m.z };
    const r = (b === me ? PLAYER_GAP : YIELD) + 0.15;
    const room = (sg: number) =>
      !solid!(c.x + px * sg * r, c.z + pz * sg * r) && !solid!(c.x + ((px * sg + ux) / Math.SQRT2) * r, c.z + ((pz * sg + uz) / Math.SQRT2) * r);
    if (!room(side) && room(-side)) side = -side;
  }
  for (const [sx, sz] of [
    [ux + px * side, uz + pz * side],
    [ux - px * side, uz - pz * side],
    [px * side, pz * side],
    [-px * side, -pz * side],
  ]) {
    const len = Math.hypot(sx, sz);
    const cx = m.x + (sx / len) * step;
    const cz = m.z + (sz / len) * step;
    if (offLine(m.from, to, { x: cx, z: cz }) > lane) continue;
    if (solid?.(cx, cz)) continue;
    if (blockerAt(m, cx, cz, me)) continue;
    m.x = cx;
    m.z = cz;
    progressed(m, to, now);
    return;
  }
}

/**
 * 가는 선(from → to)을 따라 **앞으로 남은 거리** — 옆걸음은 이 값을 안 바꾼다.
 * 목표까지의 직선거리로 재면 선 쪽으로 되돌아오는 옆걸음이 「가까워졌다」로 읽혀 양옆에 낀 몸이 영영 진척 중이 된다
 */
function ahead(m: Mover, to: Pt): number {
  const lx = to.x - m.from.x;
  const lz = to.z - m.from.z;
  const len = Math.hypot(lx, lz);
  if (len === 0) return dist(m.x, m.z, to.x, to.z);
  return ((to.x - m.x) * lx + (to.z - m.z) * lz) / len;
}

/** 이 걸음의 진척을 갱신한다 — 선을 따라 줄었을 때만 시각을 찍는다 */
function progressed(m: Mover, to: Pt, now: number): void {
  const a = ahead(m, to);
  if (a < m.leg.best - 1e-4) {
    m.leg.best = a;
    m.leg.since = now;
    m.lastProgress = now;
  }
}

/** 새 걸음의 시작 — 가는 선의 기준점과 진척 기록을 여기서 다시 잰다 */
function startLeg(m: Mover): void {
  m.from = { x: m.x, z: m.z };
  m.leg = { best: Infinity, since: -1 };
  m.giveWayUntil = 0;
  m.lastProgress = -1;
  m.stuckBy = null;
}

/** 사람·벽에 끼어 STUCK_MS 동안 한 뼘도 못 나아갔나 — 그러면 이 걸음은 버린다(tick 이 다음 자리로 돌린다) */
function wedged(m: Mover, now: number): boolean {
  if (m.lastProgress < 0) m.lastProgress = now;
  return m.stuckBy !== null && m.stuckBy !== 'mover' && now - m.lastProgress >= STUCK_MS;
}

export const patrol = {
  /**
   * 방을 세울 때 — **그 방의 개체를 하나도 빠짐없이** 올린다. 서 있기만 하는 것도 자리가 하나인 mover 다.
   * 그래야 6 m 판정(postFree)이 서 있는 것들까지 같이 본다 — 안 그러면 순찰이 서 있는 것 옆에 가서 선다.
   */
  reset(
    room: Room,
    places: readonly { id: string; x: number; z: number; heading?: number }[],
    opts: { solid?: (x: number, z: number) => boolean } = {},
  ): void {
    movers.clear();
    frozen = false;
    solid = opts.solid ?? null;
    const beats = BEATS[room] ?? {};
    for (const place of places) {
      const beat: Beat = beats[place.id] ?? { posts: [{ x: place.x, z: place.z, heading: place.heading }] };
      // 이름 있는 것 = 그 방의 명부(고정 + 이야기가 세운 슬롯). ROOM_UNITS 만 보면 재회 개체가 배경 취급이라 순찰이 3.2 m 까지 다가가 선다
      const named = roster(room).includes(place.id);
      const p = beat.posts[0];
      movers.set(place.id, {
        id: place.id,
        beat: { ...beat, named },
        x: p.x,
        z: p.z,
        heading: p.heading ?? place.heading ?? 0,
        at: 0,
        goal: 0,
        waitUntil: 0,
        from: { x: p.x, z: p.z },
        faceTo: null,
        stare: null,
        approach: null,
        hold: false,
        driven: false,
        leg: { best: Infinity, since: -1 },
        giveWayUntil: 0,
        lastProgress: -1,
        stuckBy: null,
        waitingForPost: -1,
        talkHold: null,
      });
    }
    /*
     * 첫 자리에 **서도 되는지**는 다 세운 뒤에야 알 수 있다 (남이 어디 서 있는지를 봐야 한다).
     * 못 서는 것은 처음부터 걷기 시작한다 — 복도의 순찰과 배회하는 둘이 그렇다.
     */
    for (const m of movers.values()) {
      if (m.beat.posts.length < 2) continue;
      if (!m.beat.pass && postFree(m, m.beat.posts[0])) continue;
      m.at = null;
      m.goal = 1;
    }
  },

  /** 이 개체가 이 방에 올라와 있나 */
  has(id: string): boolean {
    return movers.has(id);
  },

  /** 확인용 — 지금 서 있는 것들만 (시험이 6 m 규칙을 이걸로 본다). 자리 밖에 선 것(approach 도착)도 서 있는 것이다 */
  standing(): { id: string; x: number; z: number; named: boolean }[] {
    return [...movers.values()]
      .filter((m) => m.at !== null || m.hold)
      .map((m) => ({ id: m.id, x: m.x, z: m.z, named: !!m.beat.named }));
  },

  /**
   * 집행자가 들어오면 **전부 멎는다.** 아무도 안 움직이는 방에 총 든 것 하나가 걸어오는 그림이
   * 이 게임에서 가장 조용한 장면이라, 여기서 배경이 계속 서성이면 그 장면이 죽는다.
   * 멎어도 고개는 돈다 — turnAway 가 이 위에서 논다.
   */
  freeze(v: boolean): void {
    frozen = v;
  },

  /**
   * 잠깐 그 점을 본다 — 서 있는 것은 고개만 돌렸다가 ms 뒤 원래 방향으로, 걷던 것은 그동안 멈춰 선다.
   * NOTICE(1.2 초)와 FIRST_LOOK 의 화자, 소각로 뒤의 A-063 이 이걸로 나를 본다. 자리는 안 옮긴다
   */
  stare(id: string, at: Pt, ms: number, now = performance.now()): void {
    const m = movers.get(id);
    if (!m) return;
    const standing = m.at !== null || m.hold || (m.approach?.arrived ?? false);
    m.stare = { x: at.x, z: at.z, until: now + ms, back: standing ? (m.faceTo ?? m.heading) : null };
  },

  /**
   * [E] 로 붙잡혔다 — **걷던 것은 그 자리에 서서 나를 본다.** 자리는 안 옮긴다.
   *
   * 2026-09-03 사용자: 「로봇한테 말을 걸면 E를 눌러서 말을 걸수있게해줘. 영역으로하면 움직였을때 오류가 날꺼같아.」
   * 그 「오류」의 자리가 정확히 이것이다 — 근접 반경만으로 상대를 정하면 상대가 한 걸음 걷는 순간 곁 판정이 끊기고
   * 이미 친 한 마디가 갈 곳을 잃는다. 그래서 [E] 는 「입력줄을 연다」가 아니라 **「이 몸을 붙잡는다」**다.
   *
   * ★ `stare` 로 하지 않는 이유: stare 는 ms 로 스스로 풀린다. 붙잡은 채 몇 마디 주고받는 동안 도중에 몸이
   *   원래 방향으로 돌아가 버리면, 화면에서는 「대답하다가 딴 데를 보는 것」이 된다. 이것은 부르는 쪽이 풀어 준다.
   * ★ `m.at` 과 `m.hold` 를 **한 줄도 안 건드린다.** of().still 이 바뀌면 nearestStanding · archiveScene ·
   *   address 의 도착 판정 · postFree 가 전부 같은 전제를 공유해서 한 곳만 풀면 나머지가 어긋난다.
   *   「붙잡혔다」는 사실은 scenario2 의 talkPin 이 따로 안다 — 여기는 몸만 멈춘다.
   *
   * null 을 주면 푼다: 서 있던 것은 붙잡히기 전 보던 방향으로 돌아가고, 걷던 것은 그대로 다시 걷는다.
   */
  talkHold(id: string, at: Pt | null): void {
    const m = movers.get(id);
    if (!m) return;
    if (!at) {
      if (m.talkHold?.back !== null && m.talkHold !== null) m.faceTo = m.talkHold.back;
      m.talkHold = null;
      return;
    }
    /*
     * 이미 붙잡혀 있으면 **좌표만** 갱신한다 (내가 걸어 다니는 동안 고개가 따라온다).
     * back 을 여기서 다시 잡으면 「이미 나를 향해 돈 방향」으로 덮여, 놓아 준 뒤 원래 방향으로 못 돌아간다.
     */
    if (m.talkHold) {
      m.talkHold.x = at.x;
      m.talkHold.z = at.z;
      return;
    }
    const standing = m.at !== null || m.hold || (m.approach?.arrived ?? false);
    m.talkHold = { x: at.x, z: at.z, back: standing ? (m.faceTo ?? m.heading) : null };
  },

  /**
   * 순찰을 놓고 그 점으로 걸어가 stopAt 앞에서 선다 — 경비가 내게 다가와 한 줄 묻는 자리(OPENERS · 60 스캔).
   * 서는 자리는 postFree 를 안 묻는다: 이 걸음 동안만 6 m 규칙의 예외다. 도착하면 of().still 이 true 라 말을 걸 수 있다.
   * then 'resume' 이면 release 때 순찰로 돌아가고, 'stand' 면 거기 그대로 선다
   */
  approach(id: string, to: Pt, opts: { stopAt: number; then: 'stand' | 'resume' }): void {
    const m = movers.get(id);
    if (!m) return;
    m.approach = { x: to.x, z: to.z, stopAt: Math.max(0, opts.stopAt), then: opts.then, arrived: false };
    m.at = null;
    m.hold = false;
    m.faceTo = null;
    startLeg(m);
  },

  /** approach 를 푼다 — 'resume' 이면 가던 자리로 다시 걷고, 'stand' 면 그 자리에 계속 선다 */
  release(id: string): void {
    const m = movers.get(id);
    if (!m?.approach) return;
    const a = m.approach;
    m.approach = null;
    if (a.then === 'resume') {
      m.hold = false;
      m.faceTo = null;
      m.at = null;
      startLeg(m);
    } else {
      m.hold = true;
    }
  },

  /** 집행 동안 등을 돌린다 — from 의 반대쪽을 본다. frozen 과 같이 논다(멎은 채로 고개만). null 이면 푼다 */
  turnAway(ids: readonly string[], from: Pt | null): void {
    for (const id of ids) {
      const m = movers.get(id);
      if (!m) continue;
      m.faceTo = from ? Math.atan2(m.x - from.x, m.z - from.z) : null;
    }
  },

  /**
   * 밖에서 움직이는 몸의 자리를 알린다 — Unit 이 불 쪽으로 걷게 하는 것(u201 · 대체 개체)은 순찰이 아니라 이야기의 걸음이다.
   * 그래도 자리는 여기 있어야 남이 비켜 가고(YIELD) 6 m 판정이 본다. still 이면 그 자리에 선 것으로 친다 — 붙잡힌 것이 그 자리에 선다
   */
  pin(id: string, x: number, z: number, heading: number, still: boolean): void {
    const m = movers.get(id);
    if (!m) return;
    m.x = x;
    m.z = z;
    m.heading = heading;
    m.at = null;
    m.approach = null;
    m.driven = !still;
    m.hold = still;
  },

  /** 이 판에서 사라진 몸 — 남은 것들의 판정에서 뺀다 */
  drop(id: string): void {
    movers.delete(id);
  },

  /** 시각은 밖에서도 준다 — 시험이 시계를 쥐고 돌린다 (fake timer 없이) */
  tick(dt: number, me: Pt, now = performance.now()): void {
    for (const m of movers.values()) {
      // 잠깐 보는 중 — 자리는 안 옮기고 고개만
      if (m.stare) {
        if (now >= m.stare.until) {
          if (m.stare.back !== null) m.faceTo = m.stare.back;
          m.stare = null;
        } else {
          m.heading = turnToward(m.heading, Math.atan2(m.stare.x - m.x, m.stare.z - m.z), TURN * dt);
          // 멈춰 선 동안은 진척을 안 잰다 — 안 그러면 돌아본 뒤 첫 걸음이 막히자마자 「한참 못 갔다」로 읽혀 물러선다
          m.leg.since = -1;
          continue;
        }
      }

      /*
       * [E] 로 붙잡힌 몸 — **여기서 멎는다.** 자리(at · hold)는 안 건드리고 고개만 나를 향해 돈다.
       * stare 뒤에 두는 것은 순위 때문이다: 이야기가 시킨 응시(NOTICE · FIRST_LOOK)는 연출된 박자라
       * 내가 말을 거는 것보다 앞선다 — 그 1.2 초가 끝나면 이 갈래가 받는다.
       */
      if (m.talkHold) {
        m.heading = turnToward(m.heading, Math.atan2(m.talkHold.x - m.x, m.talkHold.z - m.z), TURN * dt);
        // 멈춰 선 동안은 진척을 안 잰다 — 안 그러면 놓아 준 뒤 첫 걸음이 「한참 못 갔다」로 읽혀 물러선다 (stare 와 같은 이유)
        m.leg.since = -1;
        continue;
      }

      if (m.driven) continue;

      // 순찰을 덮은 걸음 — 도착하면 그 점을 보고 선다
      if (m.approach) {
        const a = m.approach;
        if (!a.arrived) {
          if (dist(m.x, m.z, a.x, a.z) <= a.stopAt + ARRIVE) {
            a.arrived = true;
            m.hold = true;
            m.faceTo = Math.atan2(a.x - m.x, a.z - m.z);
          } else if (!frozen) {
            m.heading = turnToward(m.heading, Math.atan2(a.x - m.x, a.z - m.z), TURN * dt);
            walk(m, a, (m.beat.speed ?? SPEED) * dt, me, now);
          } else {
            m.leg.since = -1;
          }
        }
        if (a.arrived && m.faceTo !== null) m.heading = turnToward(m.heading, m.faceTo, TURN * dt);
        continue;
      }

      // 자리 밖에 선 것 — 시킨 쪽을 본다
      if (m.hold) {
        if (m.faceTo !== null) m.heading = turnToward(m.heading, m.faceTo, TURN * dt);
        continue;
      }

      const target = m.beat.posts[m.goal];
      if (!target) continue;

      // 서 있는 중 — 고개는 시킨 쪽(등 돌리기 · 돌아본 뒤) 아니면 자리의 방향. 다음 자리를 고를 때가 됐나
      if (m.at !== null) {
        const want = m.faceTo ?? m.beat.posts[m.at]?.heading ?? m.heading;
        m.heading = turnToward(m.heading, want, TURN * dt);
        if (frozen || m.beat.posts.length < 2 || now < m.waitUntil) continue;
        const next = (m.at + 1) % m.beat.posts.length;
        const p = m.beat.posts[next];
        if (dist(p.x, p.z, me.x, me.z) < PLAYER_GAP) {
          // 사람이 그 자리 위에 서 있다 — 조금 뒤에 다시 본다. 밀치고 서지 않는다
          if (m.waitingForPost < 0) m.waitingForPost = now;
          if (now - m.waitingForPost < PLAYER_POST_MS) {
            m.waitUntil = now + 1200;
            continue;
          }
          // 이만큼 기다렸으면 안 비킨다 — 그 자리는 건너뛰고 그 다음 자리로. 서성임이 사람 하나에 멎지 않는다 (PLAYER_POST_MS)
          m.waitingForPost = -1;
          m.goal = (next + 1) % m.beat.posts.length;
          m.at = null;
          startLeg(m);
          m.faceTo = null;
          continue;
        }
        m.waitingForPost = -1;
        /*
         * 남이 선 자리(postFree 거짓)라도 걸음은 떠난다 — 서는지는 도착에서 다시 본다(아래).
         * 여기서 기다리면 순환의 **지나가는 자리**에서 영영 멎는다: 중앙 시설의 문 ① 앞(0, 2.5)은 검문 앞줄과 3.9 m 라 애초에 설 수 없는 자리고,
         * 그 앞줄은 고정 개체라 비는 날이 없다 — 순찰이 왼쪽 끝에 서서 두 판 내내 안 움직였다 (2026-09-03). 사람과 달리 개체는 안 비킨다
         */
        m.goal = next;
        m.at = null;
        startLeg(m);
        // 돌아본 뒤 남은 방향은 이 자리의 것 — 다음 자리에선 그 자리의 heading 을 본다
        m.faceTo = null;
        continue;
      }

      if (frozen) {
        if (m.faceTo !== null) m.heading = turnToward(m.heading, m.faceTo, TURN * dt);
        m.leg.since = -1;
        continue;
      }

      // 걷는 중
      const dx = target.x - m.x;
      const dz = target.z - m.z;
      const d = Math.hypot(dx, dz);
      /*
       * 사람이 자리 위에 서 있으면 그 자리는 닿을 수 없다(PLAYER_GAP 안으로는 안 들어간다) — 닿을 수 있는 데까지 왔으면 도착으로 친다.
       * 안 그러면 자리 앞 한 뼘에서 영영 발을 구른다. 그 자리엔 안 서고 다음 자리로 돌아선다
       */
      const taken = dist(target.x, target.z, me.x, me.z) < PLAYER_GAP;
      if (d <= ARRIVE || (taken && d <= PLAYER_GAP + ARRIVE + 0.3)) {
        if (d <= ARRIVE) {
          m.x = target.x;
          m.z = target.z;
        }
        /*
         * 도착. **여기 서도 되나**를 여기서 한 번 더 본다 — 떠날 때 비어 있었어도 도착할 때 차 있을 수 있고,
         * 애초에 설 수 없는 자리도 있다(복도의 순찰: 양 끝이 서 있는 넷과 6 m 안이다). 지나가기만 하는 것(pass)은 묻지도 않는다.
         * 못 서면 안 선다 — 그냥 다음 자리로 계속 간다. 그게 순찰이다.
         */
        if (!taken && !m.beat.pass && postFree(m, target)) {
          m.at = m.goal;
          /*
           * 머무는 시간은 **그 개체의 것**이다 — 여태 이 자리가 모듈 기본값(DWELL)만 써서 Beat.dwell 이
           * 적혀만 있고 읽히는 데가 없었다. 그래서 「9~16 초 서 있다 한 걸음」으로 적어 둔 줄이 4~11 초로 돌아
           * 검문 앞줄이 12 초에 3 m 를 오갔다 — 기다리는 줄이 아니라 서성임이다 (2026-09-03 확인).
           */
          const [lo, hi] = m.beat.dwell ?? DWELL;
          m.waitUntil = now + lo + Math.random() * (hi - lo);
        } else {
          m.goal = (m.goal + 1) % m.beat.posts.length;
        }
        startLeg(m);
        continue;
      }

      m.heading = turnToward(m.heading, Math.atan2(dx, dz), TURN * dt);
      walk(m, target, (m.beat.speed ?? SPEED) * dt, me, now);
      // 사람과 벽 사이에 끼었다 — 이 자리는 포기하고 다음 자리로 돌아선다
      if (wedged(m, now)) {
        m.goal = (m.goal + 1) % m.beat.posts.length;
        startLeg(m);
      }
    }
  },

  /** 지금 자리 — Unit 이 프레임마다 읽는다. `still` 이 아니면 말 걸기 대상이 아니다 */
  of(id: string): { x: number; z: number; heading: number; still: boolean } | null {
    const m = movers.get(id);
    return m ? { x: m.x, z: m.z, heading: m.heading, still: m.at !== null || m.hold } : null;
  },

  /** reset 이 받은 그 방의 벽·상자 판정 — attitude 가 비켜 설 쪽을 고를 때 같은 눈으로 본다. 없으면 null */
  solid(): ((x: number, z: number) => boolean) | null {
    return solid;
  },
};

/** 짧은 쪽으로 돈다 */
function turnToward(from: number, to: number, max: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + Math.max(-max, Math.min(max, d));
}

/* ─────────────────────────────── 방마다 도는 자리 ─────────────────────────────── */

/**
 * 그 점을 보는 각 — 자리표(Room2Scene 의 look)와 같은 규약이다: θ 가 보는 방향이면 (sin θ, cos θ).
 *
 * 자리에 heading 을 안 주면 **걸어온 방향이 그대로 남는다** — 코어를 보던 몸이 걸어갔다가 벽을 보고 서고,
 * 벨트를 보던 몸이 문을 보고 선다. 걸음을 주는 순간 그게 눈에 띈다. 라디안 숫자를 손으로 적으면
 * 자리를 옮길 때마다 하나씩 어긋나므로 **자리에서 계산한다.**
 */
const face = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);
/** 코어를 본다 — 중앙 시설에서 볼 것은 그것뿐이다 */
const faceCore = (x: number, z: number) => face(x, z, CENTRAL2_CORE.x, CENTRAL2_CORE.z);

/**
 * **이름 있는 것들** — 서 있는 자리가 곧 그 개체가 누구인지다(Room2Scene). 그래서 대부분은 자리가 하나고,
 * 움직이는 것은 이야기가 「움직인다」고 적어 둔 것들뿐이다:
 *   UNIT-21   하루 종일 걷는다 — 복도 순찰 40 초 왕복 (레벨 설계 03)
 *   A-201     배치된 지 열하루. 서성인다 (레벨 설계 04·캐릭터 기획) — 작업 구역에서는 서서 순서를 기다린다
 *   A-137     자기 그림 앞을 오간다 — 기록 복도는 목격 반경이 0 이라 6 m 규칙이 아무것도 안 막는다
 */
export const BEATS: Record<Room, Record<string, Beat>> = {
  /*
   * 복도 6 × 24 m · L 자. 서 있는 넷은 서로 6 m 넘게 떨어져 있고 **한 뼘도 안 움직인다** — 여기서 자리를 옮기면
   * 그 순간 반경이 겹친다. 그래서 이 방에서 도는 것 중 이름 있는 것은 순찰 하나뿐이고, 그것은 **선 자리가 없다**:
   * 양 끝도 꺾임도 서 있는 것들과 6 m 안이라 postFree 가 늘 거절한다 → 멈추지 않고 왕복한다.
   * 그게 설계가 말한 순찰이다 — 말 걸 수 있는 것이 아니라 **지나가는 것**.
   *
   * 자리는 순환이라 꺾임을 **두 번** 적는다(들어온 문 → 꺾임 → 나가는 문 → 꺾임 → …) — 그래야 벽을 뚫고 되돌지 않는다.
   * 선은 첫 다리 중심선(x 0)에서 0.6 왼쪽, 둘째 다리 중심선(z −10)에서 0.6 바깥쪽 — 사람이 걷는 문→문 직선과 안쪽 벽의 그림 앞에 선
   * 개체(A-104)를 둘 다 비켜 지나간다. 첫 자리(z −2)는 스폰(0, 1.4)에서 3.4 m 이고 첫 걸음은 스폰에서 멀어지는 쪽 —
   * 들어서자마자 등 뒤에서 밀리지 않게. 한 바퀴 8.6 + 10 + 10 + 8.6 = 37.2 m, 0.92 m/s → 40 초 (레벨 설계 03). 시험이 이 수를 쥔다.
   */
  /*
   * 복도 — **도는 것이 없다.** 총 든 UNIT-21 을 이 방에서 뺐다 (2026-09-03 사용자, ROOM_UNITS.corridor).
   * 레벨 설계 03 의 40 초 왕복은 안쪽 방(작업 · 중앙 시설)에 남아 있다
   */
  corridor: {},

  /*
   * 휴게 구역 16 × 18 m. 넷이 네 귀퉁이를 잡고, A-201 만 가운뎃줄을 오간다 —
   * 「중앙에 서 있는 것이 곧 눈에 띄는 것」인데 열하루째인 이 개체만 그걸 모른다. 그 선이 문→문 직선(x 0)과 겹치는 것은 설계 의도라 두고,
   * 사람이 그 위에 서면 비켜 주는 것은 walk() 의 규칙이 맡는다.
   * 마름모로 돌던 배경 둘은 걷어냈다 — 이 방에서 움직이는 것은 이제 A-201 하나다 (2026-09-03 사용자).
   */
  rest: {
    u201: { posts: [{ x: 0, z: -6.0 }, { x: 0, z: -11.0 }, { x: 0, z: 2.0 }], speed: 0.55, dwell: [3000, 7000], named: true },
    /*
     * 그리고 **벽을 떠나는 것들** (2026-09-03 사용자: 「다른객체들 왜 아무것도 안움직여」 ·
     * 2026-09-04 사용자: 「휴게랑 중앙시설 개체들만 3 분에 1 정도 걷게」).
     *
     * ★ 처음에는 먼 끝 벽의 둘만 골랐고, 그 이유를 「벽 자리가 서로 3.6 m 인데 BG_GAP 이 3.2 라 여유가 0.4 m 뿐이라
     *   열여섯을 다 걷게 하면 영영 못 서는 방이 된다」고 적어 뒀다. **그 계산은 벽을 따라 옆으로 걸을 때의 것이다.**
     *   벽에서 **안쪽으로 수직으로** 나오면 이웃과의 거리는 √(3.6² + s²) 라 **오히려 멀어진다** —
     *   3.2 m 나오면 4.82 m 다. 그래서 나오는 방향만 바꾸면 여유가 없기는커녕 남는다.
     * ★ 그래도 **열여섯을 다 내보내지 않는다.** 이번에는 간격 때문이 아니라 **그림** 때문이다:
     *   벽에 붙은 줄이 통째로 앞으로 나오면 군중이 아니라 대열이다. 그래서 **하나 걸러 하나**만,
     *   그것도 서벽 둘 · 동벽 하나로 흩어 놓는다. 이 방에서 걷는 것은 이제 일곱(스물하나의 3 분의 1)이다.
     * ★ 머무름을 저마다 다르게 적는 것이 중요하다 — 같은 값이면 다섯이 한 박자로 나왔다 들어간다.
     * ★ named 는 안 적는다 — reset 이 roster(room) 으로 덮어쓰고 배경은 명부 밖이라 어차피 false 다.
     *   그래서 간격은 BG_GAP(3.2) 이고, 이름 있는 다섯의 자리는 그대로 지켜진다.
     * ★ speed 는 Unit 의 WALK_MIN(0.3) 위여야 한다 — 그 아래면 patrol 이 「가는 중」이라 해도
     *   걷기 클립이 idle 로 되돌아가 정지 자세로 미끄러지는 몸이 된다.
     * ★ 안쪽 자리도 |x| 6.6 이라 **가운데 13 m 띠는 그대로 빈다** (레벨 설계 03 「중앙은 비운다」 ·
     *   가운뎃줄 x 0 은 A-201 의 자리다).
     */
    'bg-rest-13': { posts: [{ x: -5.2, z: -14.2 }, { x: -5.2, z: -11.0 }], speed: 0.4, dwell: [8000, 16000] },
    'bg-rest-16': { posts: [{ x: 5.6, z: -14.2 }, { x: 5.6, z: -11.0 }], speed: 0.4, dwell: [9000, 17000] },
    // 서벽 — 방 안쪽으로 3.2 m 나왔다 돌아간다. 이웃 벽 자리(±3.6 m)에서 4.82 m 라 BG_GAP 이 넉넉하다
    'bg-rest-2': { posts: [{ x: -9.8, z: -7.4, heading: Math.PI / 2 }, { x: -6.6, z: -7.4, heading: Math.PI / 2 }], speed: 0.4, dwell: [18000, 34000] },
    /*
     * 서벽 들어온 쪽 끝. 이 자리는 「밖을 본 것」(seer)이 코를 박고 선 빈 벽(z 10.2)에서 3.49 m 인데,
     * 안쪽으로 나오면 5.60 m 로 **멀어진다** — 그 빈 벽 앞은 여전히 아무것도 안 놓는다 (rest.tsx 가 일부러 비운 칸이다)
     */
    'bg-rest-6': { posts: [{ x: -9.8, z: 7.0, heading: Math.PI / 2 }, { x: -6.6, z: 7.0, heading: Math.PI / 2 }], speed: 0.4, dwell: [19000, 35000] },
    /*
     * 동벽. 여기서 bg-rest-7(z −11)은 **뺀다** — 그 안쪽 자리가 이미 걷는 bg-rest-16 의 안쪽 자리 (5.6, −11) 에서
     * 1.0 m 라 BG_GAP 위반이다. 벽을 떠나는 것을 고를 때는 이미 걷는 것의 **안쪽 자리**까지 봐야 한다
     */
    'bg-rest-9': { posts: [{ x: 9.8, z: -3.8, heading: -Math.PI / 2 }, { x: 6.6, z: -3.8, heading: -Math.PI / 2 }], speed: 0.4, dwell: [23000, 39000] },
    /*
     * 그리고 이름 있는 하나 — 자리표가 「그냥 서 있는 하나」라고 적은 몸이다(A-077). 들어온 문 쪽 벽을 따라 3.5 m 를 오간다:
     * **들어오고 나가는 것을 본다**가 그 배역이고, 두 자리 다 heading π 라 어느 쪽에 서도 방을 마주 본다.
     * 스폰 (0, 9.6) 에서 6.1 m 밖이라 들어서자마자 곁이 되지 않는다. 이름 있는 것이라 간격은 6 m 를 받는다 —
     * u201 의 가운뎃줄에서 10.8 m · seer 에서 17.2 m 라 넉넉하다
     */
    'ally-hard': { posts: [{ x: 9.5, z: 11.0, heading: Math.PI }, { x: 6.0, z: 11.0, heading: Math.PI }], speed: 0.45, dwell: [14000, 28000], named: true },
  },

  /*
   * 작업 구역 10 × 34 m. 긴 방이라 순찰 하나가 방 전체를 오간다 — 라인은 절대 안 멈추는데 이제 그 위를 나르는 배경이 없다
   * (라인을 따라 화물을 나르던 둘은 기획서에 이름이 없어 걷어냈다 · 2026-09-03 사용자).
   * A-201 은 (0.6, −15) 에 서서 순서를 기다린다(Room2Scene) — 순찰 선은 그 몸에서 1.8 밖(x 2.4)이라 앞에서 안 멎는다.
   */
  work: {
    guard21: {
      posts: [
        // 라인 머리(A-012, z 6.4)에서 여섯 걸음 밖 — 내 작업 위치(z 0) 곁에 선다. 일하는 등 뒤에 총이 서 있는 그림
        { x: 2.4, z: 0.4 },
        { x: 2.4, z: -8.0 },
        // 소각로 옆의 A-063 · 기다리는 A-201 과 6 m 안이라 여기서는 못 선다 — 돌아서는 자리다
        { x: 2.4, z: -19.5 },
      ],
      speed: 0.95,
      named: true,
      // 오른쪽 상자의 왼면이 x 3.5 라 그쪽으로 한 몸(1.2)까지 — 벨트 쪽(x 1.2)으로도 같은 폭
      lane: 1.2,
    },
    // 라인을 따라 나르던 배경 둘이 여기 있었다 — 그 중 하나(bg-work-1)가 「대체 개체」의 몸이었다 (Room2Scene 의 pose 'fire-sub' 자리)
  },

  /*
   * 기록 복도 4.5 × 60 m. **목격 반경이 0 인 방**이라 여기서는 6 m 규칙이 지킬 것이 없다 —
   * 아무도 안 듣는데 누구에게 말한 건지 정할 일도 없다. 그래서 이 개체는 제 그림들 앞을 마음껏 오간다.
   */
  archive: {
    // 휜 복도라 자리는 호 길이 s 로 — 한가운데(열여섯, s 30)를 사이에 두고, 벽 쪽 1.1(벽에서 1.15). 현으로 걸어도 폭 안이다.
    // 가운데 자리는 s 34: 정중앙(s 30)에 서면 「걸음이 저절로 멈추는 자리」(레벨 설계 03)의 정면 판독 자리를 6~14 초씩 몸으로 막는다
    // lane 0.5: 벽 쪽에 붙어 서니 비킬 폭이 안쪽으로만 있고, 사람은 반대쪽 벽 쪽(2.1 m 띠)으로 지나간다
    u137: {
      posts: [ARCHIVE_PATH.point(22, -1.1), ARCHIVE_PATH.point(34, 1.1), ARCHIVE_PATH.point(38, -1.1)],
      speed: 0.62,
      dwell: [6000, 14000],
      named: true,
      lane: 0.5,
    },
  },

  /* 창이 있는 방 5 × 5 m — 리더도 밖을 본 것도 창을 본다. 여기서 움직이는 것은 없다 */
  window: {},

  /*
   * 중앙 시설 지름 26 m · 국면 셋. 순찰은 **문 ① 안쪽 벽**을 따라 돈다 — 검문 지점(CHECK_SPOTS, z 1.2)이 그 벽 쪽이라
   * 총 든 것이 늘 검문 곁에 있는 그림이 된다 (레벨 설계 05). 전부 벽 그늘이다: 코어권은 플레이어가 발로 고르는 자리지
   * 순찰이 서 있을 자리가 아니고, 홀에 서면 재회 슬롯(±3.5, −2.2)과 6 m 안이라 어차피 못 선다.
   *   양 끝(±9, 2.6)   검문 앞줄에서 6.16 m — 딱 여섯 걸음 밖이라 **여기서만 선다**
   *   가운데(0, 2.5)   문 ① 앞. 앞줄 둘과 3.9 m 라 못 서고 지나간다 — 검문 뒤로 총이 지나가는 것이 이 자리의 그림이다
   * 선은 z 2.5~2.6 으로 앞줄(z 1.2)에서 1.3 m — 멎는 거리(YIELD 1.15) 밖이라 앞줄 앞에서 영영 멎지 않는다.
   * 자리는 순환이라 가운데를 두 번 적는다 (왼쪽 → 문 → 오른쪽 → 문 → …).
   * 검문 앞줄 둘과 홀의 손끝(A-118)은 자리가 하나다 — 그래도 여기 올린다: 「그 방의 개체는 하나도 빠짐없이」(reset) 가 6 m 판정의 전제다.
   */
  central2: {
    guard21: {
      posts: [
        { x: -9, z: 2.6 },
        { x: 0, z: 2.5 },
        { x: 9, z: 2.6 },
        { x: 0, z: 2.5 },
      ],
      speed: 0.95,
      named: true,
    },
    /*
     * 검문 앞줄 둘 — **자리가 하나다. 선다.**
     *
     * 2026-09-03 에 「줄이 조금씩 움직인다」로 바깥으로 1.2 m 를 오가게 했다. 그때 적은 근거는
     * 「바깥으로 1.2 m 면 순찰의 두 자리에서 4.4 · 5.0 m 라 늘 선다」였는데, **그 계산이 BG_GAP 3.2 를 전제했다.**
     * 이 둘은 이름이 bg 로 시작하지만 ROOM_UNITS.central2 에 들어 있어 patrol 에서 **named** 다(reset 이 roster 로 덮어쓴다) —
     * 그래서 받는 간격은 3.2 가 아니라 **6 m** 이고, 어느 자리도 그걸 못 채운다:
     *   제 자리 (−3, 1.2) ↔ 순찰의 문 앞 자리 (0, 2.5)          3.27 m
     *   바깥 자리 (−4.2, 1.2) ↔ 순찰의 서는 끝 (−9, 2.6)         5.00 m
     *   그리고 이야기가 세우는 재회 슬롯 (−3.5, −2.2)            3.44 m
     * 그 결과가 「걷는 것」이 아니라 **못 서서 튕기는 것**이었다 — 도착할 때마다 postFree 가 거절해 쉬지 않고 오갔고
     * (180 초에 32 m), 슬롯이 채워진 실전 판에서는 **한 번도 안 섰다.** 곁 판정은 서 있는 몸만 보므로
     * (scenario2 의 near 가 p.still 을 본다) 그동안 **검문 앞줄에는 말을 걸 수가 없었다** — 대본 v8 QUEUE 에서
     * 내 앞에 번호를 대는 것들인데도.
     * 그래서 자리를 하나로 되돌린다. 자리가 하나면 postFree 를 아예 안 묻고 늘 선다. 「줄이 서 있다」가 배역이기도 하다.
     * 이 몸들의 움직임은 **걸음이 아니라 제자리 동작**이 낸다 (cast 의 act: shift · scan — activity.ts).
     */
    'bg-c2-044': { posts: [CHECK_SPOTS[0]], named: true },
    'bg-c2-128': { posts: [CHECK_SPOTS[1]], named: true },
    // 휴게에서 못 쉬고 먼저 와 있다 — 줄 뒤에 서서 코어를 본다. 안 움직인다: 「틀릴까 봐 미리 겁을 내는」 개체가 순서를 기다리는 자세다
    u118: { posts: [CENTRAL2_HALL_POST], named: true },
    /*
     * 그리고 **자리를 고쳐 서는 셋** (2026-09-04 사용자: 「휴게랑 중앙시설 개체들만 3 분에 1 정도 걷게」).
     *
     * 이 방에서는 「걷는다」가 아니라 **자리를 고쳐 선다**가 맞는 그림이다. 26 m 홀인데 가운데 11 m 를 코어가 먹고,
     * 몸 열하나가 **전부 명부에 있어 어느 쌍이든 6 m** 를 요구한다 — 이미 6.0~7.7 m 인 쌍이 열 개가 넘어서
     * 큰 걸음을 넣을 자리가 없다. 그래서 1.1~2.0 m 다. 크게 도는 것은 총 든 UNIT-21 하나뿐이고,
     * 그 대비가 있어야 홀이 홀로 읽힌다.
     * 두 자리 다 heading 이 코어라(faceCore) 걸어가도 보는 쪽이 안 흔들린다 — 이 방에서 볼 것은 그것뿐이다.
     */
    // 홀 앞줄 −x. 옮기는 쪽은 bg-c2-207 에서 **멀어지는** 쪽이다 (그 쌍이 6.26 m 로 이 방에서 가장 빠듯하다)
    'bg-c2-061': {
      posts: [
        { x: -4.5, z: -14.0, heading: faceCore(-4.5, -14.0) },
        { x: -5.2, z: -12.7, heading: faceCore(-5.2, -12.7) },
      ],
      speed: 0.35,
      dwell: [16000, 30000],
    },
    /*
     * 옆문 ③ ④ 의 총 든 둘 — 벽을 따라 문 쪽으로 2.0 m 올라갔다 내려온다.
     * **이 둘은 지금 이 판에서 가장 굳어 있는 몸이다**: enforcer 로 그려져 activity 층(제자리 동작)을 통째로 안 읽으므로
     * 걸음을 안 주면 정말로 한 프레임도 안 움직인다 (cast.ts 의 guard 셋에 act 을 안 준 이유가 그것이다).
     * 초소를 지키는 몸이 자리를 고쳐 서는 걸음이지 순찰이 아니다 — 순찰은 UNIT-21 의 것이고 그것은 문 ① 벽을 돈다.
     * 락다운에 홀로 내려오는 것은 approach 가 맡으므로 걸음표와 안 부딪친다 (도착하면 hold 로 서고, 풀리면 이 자리로 돌아온다).
     * 머무는 시간을 서로 다르게 적는다 — 둘이 같은 박자로 움직이면 초소가 아니라 기계 장치로 보인다.
     */
    guard22: {
      posts: [
        { x: -11.6, z: -13.0, heading: faceCore(-11.6, -13.0) },
        { x: -11.6, z: -11.0, heading: faceCore(-11.6, -11.0) },
      ],
      speed: 0.4,
      dwell: [18000, 32000],
      named: true,
    },
    guard23: {
      posts: [
        { x: 11.6, z: -13.0, heading: faceCore(11.6, -13.0) },
        { x: 11.6, z: -11.0, heading: faceCore(11.6, -11.0) },
      ],
      speed: 0.4,
      dwell: [21000, 35000],
      named: true,
    },
  },
};

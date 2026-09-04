/**
 * 개막에 서는 자리와 **배회가 도는 마당** — 들어온 사람 눈앞에 몸이 있게 한다.
 *
 * ★ **시행이 설 때는 아무도 옮기지 않는다** (2026-09-01 사용자 요청 — "게임 시작하면 로봇 위치가
 *   원래 있던곳에서 다른곳으로 바뀌는데 원래 있던곳에 계속있게"). 여기 있던 TRIAL_RING(출발선)은
 *   그래서 없어졌다. 서 있던 자리가 곧 출발선이고, 어긋나는 예산은 판 쪽에서 맞춘다 —
 *   시간은 제일 먼 몸을 기준으로 잡고(quick.ts 의 farWalkTime), 봇 걸음은 제 자리에서 다시 잰다
 *   (quick 의 plan(seat, from) · 리더 설계는 free.ts 의 replanFrom).
 */
import { START } from '@/lab/arena';
import { OBJECTS } from '@/lab/objects';

/**
 * 들어온 사람이 **보고 있는 쪽**. 스폰에서 카메라가 맵의 focus(= 무대 한가운데)로 돌아가 있으므로
 * (arena3d/scene/WorldScene 의 LocalRig), 홀 가운데에서 무대를 향한 방향이 곧 화면 정면이다.
 *
 * 각도 규약은 이 파일의 둘레 좌표계다: x = cos(a)·r, z = sin(a)·r. 무대가 없는 맵이면 -z 로 친다.
 */
const STAGE = OBJECTS.find((o) => o.kind === '무대');
const FRONT = STAGE ? Math.atan2(STAGE.z - START.z, STAGE.x - START.x) : -Math.PI / 2;

/**
 * 개막 — 들어왔을 때 개체들이 서 있는 거리(m).
 *
 * 2.2m 였다. 눈앞을 가릴 만큼 가까운 데다 **부채꼴로 벌리면 서로 겹쳤다** — 그래서 물렸다.
 * 여기서부터 배회가 시작되므로 이 부채꼴은 첫 몇 초에만 보인다. 그 몇 초가 암전이 걷히는 장면이다.
 */
export const IDLE_RING = 4.2;

/**
 * 부채꼴의 반각(rad). 화면 가로 시야의 절반은 최소 37.6° 다 (arena3d/input 의 BASE_FOV·fovForAspect —
 * 4:3 에서 가로 75.2°, 더 넓은 창은 더 넓다). 카메라가 부채꼴의 **중심**에 서므로 둘레 각이 곧
 * 화면 밖으로 밀리는 각이라, 그보다 안쪽인 32° 로 잡으면 전원이 첫 프레임에 잡힌다.
 */
export const IDLE_ARC = (32 * Math.PI) / 180;

/**
 * 개막 자리가 **뒤로** 물러설 수 있는 폭(m). 앞으로는 안 나온다 — ringSpot 머리말의 ★.
 * 2.4m 면 4.2~6.6m 에 흩어져 「같은 줄에 선 다섯」이 아니라 「방에 흩어져 선 다섯」이 된다.
 */
export const IDLE_DEPTH = 2.4;

/**
 * 시선이 흩어지는 폭(m) — 홀 가운데를 보되 한 점을 겨누지는 않는다.
 * 4~7m 앞에서 12° 남짓이라 등을 보이는 몸은 안 생긴다.
 */
const GAZE_SPREAD = 1.8;

/** 그 자리가 비었나 — 가구 속에서 태어나면 밀려날 수도 없다 (separateBots 는 가구 속으로 안 민다) */
function standable(p: { x: number; z: number }): boolean {
  return inRoam(p) && !OBJECTS.some((o) => Math.abs(p.x - o.x) < o.hw + 0.6 && Math.abs(p.z - o.z) < o.hd + 0.6);
}

/**
 * 배회가 도는 마당 — 들어온 자리(START)와 무대 사이의 홀 앞쪽.
 *
 * ★ 예전에는 목적지가 **홀 전체**(23×31m)라, 입장하고 20초면 다섯이 옆벽 콘솔까지 흩어져
 *   화면에 몸이 하나도 안 남았다 (2026-09-01 사용자: 95초 8장 중 정면에 잡힌 개체 0 —
 *   "대화 로그만 흐르고 말하는 몸이 안 보인다"). 말하는 방이려면 말하는 몸이 보여야 한다.
 *
 * 무대 앞(-12)에서 내 뒤 세 걸음(+0.5)까지, 좌우로 7m. 콘솔은 옆벽(x ±11.65)에 붙어 있어
 * 이 마당 밖이다 — 시행은 여전히 거기로 보낸다(「콘솔 앞에 정렬」). 배회만 안 간다.
 */
export const ROAM = { minX: -7, maxX: 7, minZ: -12, maxZ: 0.5 } as const;

/** 그 자리가 마당 안인가 — 배회 목적지는 전부 이걸 통과해야 한다 */
export function inRoam(p: { x: number; z: number }): boolean {
  return p.x >= ROAM.minX && p.x <= ROAM.maxX && p.z >= ROAM.minZ && p.z <= ROAM.maxZ;
}

/**
 * `count` 명이 정면 부채꼴에 설 때 `i` 번째 자리. 전부 안쪽(= 들어온 사람)을 보고 선다.
 *
 * 둘레 한 바퀴(0°·72°·144°·216°·288°)로 흩던 것을 **정면 부채꼴로** 접었다 (2026-09-01).
 * 한 바퀴로 흩으면 절반이 등 뒤에 태어나고, 정면에는 아무도 없다 — 암전이 걷히자마자
 * 보이는 것이 빈 홀이었다. 이제 걷히는 순간 눈앞에 줄지어 서 있고, 배회는 거기서 시작한다.
 *
 * 자리는 사람과 개체를 가리지 않는다. **가려서도 안 된다** — 누가 어느 자리에 서느냐가
 * 정체를 말하면 그것으로 사람이 드러난다 (불변 규칙 I1~I8).
 */
export function ringSpot(i: number, count: number, radius: number): { x: number; z: number; heading: number } {
  const n = Math.max(1, count);
  // 하나뿐이면 정면 한가운데. 여럿이면 부채꼴을 균등하게 나눠 선다 (양 끝이 IDLE_ARC)
  const a = FRONT + (n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * IDLE_ARC);
  const at = (r: number) => ({ x: START.x + Math.cos(a) * r, z: START.z + Math.sin(a) * r });
  /*
   * ── 깊이를 흩는다 ── (2026-09-03 사용자: "갑자기 내 앞에 일렬로 서있을때가 있어 이상해")
   *
   * 전원이 **같은 반지름**에 균등한 각으로 서고 전부 정확히 나를 보고 있었다. 그건 방에 서 있는
   * 다섯이 아니라 **도열**이다 — 문이 열리자 사열받는 그림이라, 방금 걸어 들어온 방으로 안 읽힌다.
   *
   * 각은 안 흩는다 — 옆자리와 겹칠 수 있다. 겹치면 밀려나고(separateBots), 밀린 자리가 원 밖이면
   * 그게 곧 판정이 된다. 깊이만 흩되 **뒤로만** 간다: 아무도 기존 자리보다 앞에 서지 않으므로
   * 「한 자리가 더 가까워서 유리하다」가 생기지 않는다 (불변 규칙 I1~I8 — 자리가 정체를 말하면 안 된다).
   * 뽑는 폭은 자리마다 같으니 seat 번호로 유불리가 갈리지도 않는다.
   */
  const want = radius + Math.random() * IDLE_DEPTH;
  let p = at(want);
  if (!standable(p)) {
    /*
     * 물러선 자리가 가구 속이면 앞으로 도로 당긴다 — **가구 안에서 태어나면 빠져나올 길이 없다**
     * (separateBots 는 가구 속으로는 안 민다: 밀려서 콘솔에 박히느니 겹친 채 두는 규칙이다).
     * 마지막 걸음은 정확히 radius — 여태 쓰던, 비어 있는 것이 확인된 자리다.
     */
    for (let k = 1; k <= 8; k += 1) {
      p = at(radius + (IDLE_DEPTH * (8 - k)) / 8);
      if (standable(p)) break;
    }
  }
  /*
   * 시선은 홀 가운데를 향하되 **한 점에 모으지 않는다.** 다섯이 눈동자 하나까지 나를 겨누고 있으면
   * 방이 아니라 검문이다. 흩는 폭은 GAZE_SPREAD 뿐이라 (4~7m 앞에서 12° 남짓) 등을 보이는 몸은 없다 —
   * 말을 걸 얼굴은 그대로 보인다.
   *
   * 방향은 그 자리에서 직접 잰다. 예전 배치는 각도에 π 를 더해 썼는데 그건 이 판의 규약
   * (heading = atan2(dx, dz))과 어긋난 값이라, 실제로는 자리마다 90도씩 틀어진 쪽을 보고 있었다.
   */
  const gx = START.x + (Math.random() - 0.5) * GAZE_SPREAD;
  const gz = START.z + (Math.random() - 0.5) * GAZE_SPREAD;
  return { x: p.x, z: p.z, heading: Math.atan2(gx - p.x, gz - p.z) };
}

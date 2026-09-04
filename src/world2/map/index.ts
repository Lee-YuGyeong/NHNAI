/**
 * 시나리오 2 의 방 등록부 — **본판 등록부(world/map/index.ts)를 건드리지 않는다.**
 *
 * 「게임 시작 테스트」가 걷는 길(복도 → 중앙 시설 → 재검실 → 검문소)에는 방이 하나도 안 늘어야 한다.
 * 그래서 새 방 넷은 여기 따로 서고, 화면은 WorldScene 의 `def` 로 그 정의를 직접 넘긴다.
 * MapDef 규격은 본판과 같은 것을 쓴다 — 방을 세우는 문법을 두 벌로 만들면 둘 중 하나가 반드시 뒤처진다.
 *
 * ★ 첫 방(복도)도 **여기 것이다.** 예전에는 본판 복도를 그대로 빌렸는데, 그게
 *   「설계대로 새 방이 나와야 하는데 챕터 1 방으로 다시 들어간다」였다 (2026-09-02 사용자).
 *   레벨 설계 「누가 듣고 있나」가 정한 치수(4 × 22 → 몸이 지나가게 6 × 24 m · 목격 반경 6 m)는 본판 복도(10 × 36 m)와 아예 다르다.
 */

import type { MapDef } from '@/world/map';

import { ARCHIVE_BOUNDS, ARCHIVE_FOCUS, ARCHIVE_PATH, Archive, ArchiveLights, archiveGroundHeightAt, resolveArchiveColliders } from './archive';
import { CENTRAL2_FOCUS, CENTRAL2_SPAWN, Central2, Central2Lights, central2GroundHeightAt, resolveCentral2Colliders } from './central2';
import { CORRIDOR2, CORRIDOR2_FOCUS, Corridor2, Corridor2Lights, corridor2GroundHeightAt, resolveCorridor2Colliders } from './corridor';
import { REST, REST_FOCUS, Rest, RestLights, resolveRestColliders, restGroundHeightAt } from './rest';
import { WINDOW_FOCUS, WINDOW_SPAWN, WindowLights, WindowRoom, resolveWindowColliders, windowGroundHeightAt } from './window';
import { WORK, WORK_FOCUS, Work, WorkLights, resolveWorkColliders, workGroundHeightAt } from './work';

export const MAPS2 = {
  corridor: {
    title: '복도',
    blurb: '10 × 40 m 의 낮고 긴 L 자 통로. 벽에 그림이 걸려 있고, 진입부 왼쪽에 정비 단말이 있다. 꺾임 뒤는 걸어가 봐야 안다.',
    background: '#02040a',
    fog: ['#070b12', 0.02],
    exposure: 2.0,
    ambient: { color: '#98a6bc', intensity: 1.2 },
    Scene: Corridor2,
    Lights: Corridor2Lights,
    focus: CORRIDOR2_FOCUS,
    resolveColliders: resolveCorridor2Colliders,
    groundHeightAt: corridor2GroundHeightAt,
    bgm: '/audio/corridor-bgm.m4a',
    /**
     * 둘째 다리가 +x 로 19 m 뻗어 본판 경계(WORLD: x ±14)를 넘는다 — 기록 복도와 같은 이유로 제 상자를 준다.
     * 벽은 여전히 resolveColliders 가 막는다: 이 값은 「서버가 검증하지 않는 단독 판」의 바깥 울타리다
     */
    bounds: { minX: -8, maxX: 23, minZ: -26, maxZ: 8 },
  },

  rest: {
    title: '휴게 구역',
    blurb: '24 × 28 m — 검문도 경비도 방송도 없는 방. 가운데가 통째로 비어 있고, 개체들이 벽을 따라 앉아 있다.',
    background: '#02040a',
    /** 넓은 방이라 안개만 복도(0.016)보다 옅다. 나머지는 전부 복도와 같은 값이다 */
    fog: ['#070b12', 0.013],
    exposure: 2.0,
    ambient: { color: '#98a6bc', intensity: 1.2 },
    Scene: Rest,
    Lights: RestLights,
    focus: REST_FOCUS,
    resolveColliders: resolveRestColliders,
    groundHeightAt: restGroundHeightAt,
    /** 음악을 **안 건다.** 이 방이 이 게임에서 유일하게 조용하다 */
  },

  central2: {
    title: '중앙 시설',
    blurb: '가운데 코어 탑이 선 26 m 홀. 코어에 가까울수록 밝고 벽 그늘은 어둡다. 출입구 넷 — 락다운이 한꺼번에 닫는다.',
    background: '#02040a',
    /** 26 m 홀 — 안개는 다섯 방 중 가장 옅다. 반대편 벽까지 코어 탑이 또렷해야 「제일 밝은 방」이다 */
    fog: ['#070b12', 0.008],
    exposure: 2.0,
    ambient: { color: '#98a6bc', intensity: 1.2 },
    Scene: Central2,
    Lights: Central2Lights,
    focus: CENTRAL2_FOCUS,
    resolveColliders: resolveCentral2Colliders,
    groundHeightAt: central2GroundHeightAt,
    bgm: '/audio/corridor-bgm.m4a',
    /**
     * 락다운 — 문 넷이 닫히는 순간 곡이 갈린다. 본판 중앙 시설과 **같은 곡**이다 (Checkpoint Override):
     * 두 판에서 같은 일이 일어나면 같은 소리가 나야 한다. 화면의 색도 같이 옮긴다 (CENTRAL2_LOCKDOWN_TONE)
     */
    lockdownBgm: '/audio/checkpoint-override.m4a',
  },

  work: {
    title: '작업 구역',
    blurb: '화물이 컨베이어를 타고 소각로로 들어가는 큰 방. 벽화 danger 가 그린 그 자리.',
    background: '#0a0604',
    fog: ['#120a07', 0.012],
    exposure: 2.0,
    /** 복도와 같은 청회색에 불빛이 더해져 안쪽으로 갈수록 따뜻해진다 */
    ambient: { color: '#98a6bc', intensity: 1.2 },
    Scene: Work,
    Lights: WorkLights,
    focus: WORK_FOCUS,
    resolveColliders: resolveWorkColliders,
    groundHeightAt: workGroundHeightAt,
    bgm: '/audio/corridor-bgm.m4a',
  },

  archive: {
    title: '기록 복도',
    blurb: '마지막 방으로 가는 좁고 긴 길. 양쪽 벽에 지난 판들의 그림이 수백 장 걸려 있다.',
    background: '#02040a',
    /** 좁은 길이라 안개는 복도보다 조금 짙다 — 끝이 안 보여야 「수백 장」이 산다. 그 이상은 안 짙게 (0.024 는 "너무 어둡다"였다) */
    fog: ['#070b12', 0.018],
    exposure: 2.0,
    /** 앰비언트는 복도의 2/3 — 고루 깔리는 빛이 세면 바닥이 벽만큼 밝아진다 (설계 02: 조명은 벽면만, 바닥은 어둡게) */
    ambient: { color: '#98a6bc', intensity: 0.8 },
    Scene: Archive,
    Lights: ArchiveLights,
    focus: ARCHIVE_FOCUS,
    resolveColliders: resolveArchiveColliders,
    groundHeightAt: archiveGroundHeightAt,
    /** 60 m 호가 본판 WORLD 클램프(x ±14 · z −23~15)를 벗어난다 — 이 방만 제 상자를 준다 */
    bounds: ARCHIVE_BOUNDS,
  },

  window: {
    title: '창이 있는 방',
    blurb: '이 구역에서 유일하게 창이 있는 작은 방. 창살 너머에 해가 있다.',
    background: '#02040a',
    fog: ['#0a0f16', 0.016],
    exposure: 2.0,
    ambient: { color: '#98a6bc', intensity: 1.2 },
    Scene: WindowRoom,
    Lights: WindowLights,
    focus: WINDOW_FOCUS,
    resolveColliders: resolveWindowColliders,
    groundHeightAt: windowGroundHeightAt,
  },
} satisfies Record<string, MapDef>;

export type Map2Id = keyof typeof MAPS2;

/**
 * 방마다 들어와 서는 자리 — 들어온 문 앞(가까운 끝).
 * 자리표(Room2Scene PLACES)와의 약속: 서 있는 개체는 여기서 ≥ 2.4 m, 배경의 꼭짓점은 ≥ 1.6 m, 걷는 것의 첫 걸음은 여기서 멀어지는 쪽 —
 * 들어서자마자 등 뒤에서 밀리는 일이 없게 (2026-09-03).
 */
export const SPAWN2: Record<Map2Id, { x: number; z: number }> = {
  corridor: { x: 0, z: CORRIDOR2.profile.nearZ - 1.6 },
  rest: { x: 0, z: REST.profile.nearZ - 2.4 },
  // 문 ① 안쪽 4.8 m — 다른 방처럼 2.4 m 면 코어에서 12 m 라 벽 그늘에서 시작한다. 홀(≤ 10 m)에서 시작해야 한다 (central2.tsx)
  central2: CENTRAL2_SPAWN,
  // 오른쪽 차선 — 라인 선두(A-012, (−0.9, 6.4))와 3.5 m 떨어져서, 들어서자마자 말 반경(2.6) 안에 있지 않다
  work: { x: 2.0, z: WORK.profile.nearZ - 3.6 },
  // 휜 복도 — 들어온 문에서 호를 따라 1.2 m (링 두께 0.7 바로 안쪽)
  archive: ARCHIVE_PATH.point(1.2),
  window: WINDOW_SPAWN,
};

/**
 * 맵 등록부 — WorldScene 이 어느 배경을 세울지 여기서 고른다. 새 맵 = 항목 추가. (복도 · 창고 · 심문소)
 *
 * 맵 하나가 가져야 하는 것: 배경·안개·노출·앰비언트(분위기), 씬·조명·가구 컴포넌트, 시선 초점(FOCUS), 충돌 판정.
 * 충돌 판정을 맵이 들고 있는 이유: mp/collide.ts 의 순수 함수는 같지만 **박스 목록이 맵마다 다르다.**
 * 서버가 검증하는 WORLD(mp/constants.ts)는 맵 공통 상한이다 — 복도(±5, -22~14)·격납고 홀(±12, -20~12)·심문소가 다 그 안에 든다.
 * 벽은 어차피 맵의 충돌 박스가 막으니 WORLD 는 서버 쪽 상한일 뿐이다.
 */

import type { ComponentType } from 'react';
import type * as THREE from 'three';

import type { QualityTier } from '../perf/quality';
import { Corridor, FOCUS as CORRIDOR_FOCUS, Lights as CorridorLights, groundHeightAt as corridorGroundHeightAt, resolveColliders as resolveCorridorColliders } from './corridor';
import { CENTRAL_FOCUS, Central, CentralLights, centralGroundHeightAt, resolveCentralColliders } from './central';
import { GOVCENTER_FOCUS, Govcenter, GovcenterLights, govcenterGroundHeightAt, resolveGovcenterColliders } from './govcenter';
import { INTERROGATION_FOCUS, Interrogation, InterrogationEffects, InterrogationLights, interrogationGroundHeightAt, resolveInterrogationColliders } from './interrogation';
import { RECHECK_FOCUS, Recheck, RecheckLights, recheckGroundHeightAt, resolveRecheckColliders } from './recheck';
import { NEAR_Z as RECHECK_NEAR_Z } from './recheck/layout';
import { ENFORCER_SPAWN as INTERROGATION_ENFORCER_SPAWN } from './interrogation/layout';
import { WAREHOUSE_FOCUS, Warehouse, WarehouseLights, resolveWarehouseColliders, warehouseGroundHeightAt } from './warehouse';

export interface MapDef {
  /** 인트로 버튼·입장 화면에 보이는 이름 */
  title: string;
  /** 입장 화면 한 줄 설명 */
  blurb: string;
  background: string;
  /** fogExp2 [색, 밀도] */
  fog: readonly [string, number];
  /** 톤매핑 노출 */
  exposure: number;
  ambient: { color: string; intensity: number };
  Scene: ComponentType<{ quality?: QualityTier }>;
  Lights: ComponentType<{ flicker: boolean }>;
  /** 바닥에 놓이는 가구. 없는 맵도 있다 */
  Furniture?: ComponentType;
  /** 후처리(블룸 등). high 화질에서만 붙는다 — 씬을 한 번 더 그리므로 low·터치는 뺀다 */
  Effects?: ComponentType;
  /** 입장 연출 — 이만큼 넓은 fov(도)로 시작해 걷거나 몇 초 지나면 기본 fov 로 좁혀진다 (광각 롱샷 → 1인칭) */
  introFov?: number;
  /** 들어오면 이 점을 보고 시작한다 */
  focus: { x: number; y: number; z: number };
  /** 벽·가구에 밀려난 좌표로 p 를 제자리에서 고친다 */
  resolveColliders: (p: THREE.Vector3, feetY: number) => void;
  /** (x, z) 에서 발이 닿을 높이 */
  groundHeightAt: (x: number, z: number, fromY: number) => number;
  /** 배경음악 (public/audio/…). 없는 맵도 있다 */
  bgm?: string;
  /** 코어 트리거(chapter1.onCore → 락다운) 뒤로 바뀌는 곡 — 중앙 시설만. 이 무대를 떠날 때까지 이어진다 */
  lockdownBgm?: string;
    /** 무장 심문 AI 가 나타나는 출입구 (features/world/Enforcer.tsx). 없는 맵은 판정만 뜬다 */
  enforcerSpawn?: { x: number; z: number };
  /**
   * 걸을 수 있는 범위(m). 없으면 mp/constants 의 WORLD(서버가 검증하는 본판 경계)를 쓴다.
   * 본판 맵은 전부 그 안에 들므로 적지 않는다 — 이 칸은 서버가 검증하지 않는 **단독 판**(시나리오 2 의 60 m 기록 복도처럼
   * WORLD 보다 긴 방)만 적는다. 벽은 여전히 resolveColliders 가 막는다.
   */
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export const MAPS = {
  corridor: {
    title: '3D 월드',
    blurb: '같은 방 번호를 친 사람끼리 청백색 튜브가 늘어선 우주선 복도에서 만난다.',
    background: '#02040a',
    /** 참고 이미지는 깊은 남색 어둠 — 멀리 갈수록 튜브 빛만 남는다 */
    fog: ['#070b12', 0.016],
    exposure: 2.0,
    /** 차가운 청회색 앰비언트 — 강판 결·리브가 튜브 밖에서도 읽혀야 한다. 0.32 는 "너무 어두워 안 보인다"였다 (2026-08-29) */
    ambient: { color: '#98a6bc', intensity: 1.2 },
    Scene: Corridor,
    Lights: CorridorLights,
    focus: CORRIDOR_FOCUS,
    resolveColliders: resolveCorridorColliders,
    groundHeightAt: corridorGroundHeightAt,
    /** 사용자가 준 "Interrogation Door.wav" → AAC (afconvert, 128k) */
    bgm: '/audio/corridor-bgm.m4a',
    /**
     * 관심 지점이 **없다** (2026-09-01 사용자: "멀리서 볼 땐 괜찮은데 벽에 붙어서 벽을 보면 의심도가 오른다 —
     * 원래는 아닌 게 맞다"). 이 복도는 조사가 목표인 무대다 — 보라고 걸어 둔 그림들이 콘솔 베이 위·옆에 있어서
     * (선언문 그림이 베이 −8 정중앙, danger·carry·memorial 은 베이에서 1.25m 옆), 벽에 붙어 들여다보는 순간
     * 콘솔 관심 반경에 들어 초당 +2.4 로 찼다. 보라고 시킨 것에 벌점이 붙으면 규칙이 거짓말이 된다 —
     * 「시설이 보라고 시킨 것」에 벌점을 붙이면 규칙이 거짓말이 된다 — 지금은 쳐다보는 것 자체가 의심도를 안 올린다 (mp/sensor).
     */
    /** 등 뒤(가까운) 격납문 앞 */
    enforcerSpawn: { x: 0, z: 12.5 },
  },
  warehouse: {
    title: '창고 3D 맵',
    blurb: '같은 방 번호를 친 사람끼리 관찰창 앞 무대가 있는 우주선 격납고 홀에서 만난다.',
    background: '#02040a',
    /** 복도와 같은 톤, 홀이 넓어 안개는 더 옅게 */
    fog: ['#070b12', 0.011],
    exposure: 2.0,
    ambient: { color: '#98a6bc', intensity: 1.2 },
    Scene: Warehouse,
    Lights: WarehouseLights,
    focus: WAREHOUSE_FOCUS,
    resolveColliders: resolveWarehouseColliders,
    groundHeightAt: warehouseGroundHeightAt,
    /*
     * 복도·중앙 시설과 같은 곡 — 이 홀이 **인지 검증실**이기 때문이다 (features/arena 의 MAP_DEF).
     * 여태 이 맵만 곡이 없어서, 재검실(checkpoint-glitch)의 암전이 걷히면 마지막 방이 통째로 무음이었다:
     * 네 장을 지나오는 동안 소리가 끊기는 자리가 **여기 하나**였다. 원본 파일 이름도 그 방의 것이다
     * ("Interrogation Door.wav"). 판을 도는 동안 이 곡 위에 리더의 방송이 얹힌다.
     */
    bgm: '/audio/corridor-bgm.m4a',
  },
  govcenter: {
    title: '특수인공지능대응센터',
    blurb: '콘크리트 대형 홀 — 끝벽의 3면 상황판, 양옆 유리 관제실. 검문소(/interrogation)의 배경.',
    /** 참고 이미지(2026-09-04)는 콘크리트의 차가운 회색 — 안개도 회색, 홀이 넓어 옅게 */
    background: '#0b0e13',
    fog: ['#0f1218', 0.01],
    /** 첫 렌더(1.5 · 앰비언트 0.9)는 콘크리트가 하얗게 떴다 — 참고 이미지는 어둡고 형광등·상황판만 밝다 */
    exposure: 1.05,
    ambient: { color: '#aeb9c9', intensity: 0.55 },
    Scene: Govcenter,
    Lights: GovcenterLights,
    focus: GOVCENTER_FOCUS,
    /** ★ 격납고 홀과 같은 충돌 목록 — 게임(features/arena)의 카탈로그·판정이 그 목록을 읽는다 (govcenter/layout.ts) */
    resolveColliders: resolveGovcenterColliders,
    groundHeightAt: govcenterGroundHeightAt,
    /** 검문소는 인지 검증실이다 — 격납고 홀과 같은 곡 (features/arena 는 MAPS.warehouse.bgm 을 문다) */
    bgm: '/audio/corridor-bgm.m4a',
  },
  central: {
    title: '중앙 시설',
    blurb: '복도 끝 격납문 너머 — 코어 기둥을 둘러싼 AI 들의 본거지. 챕터 1 의 마지막 무대.',
    background: '#02040a',
    fog: ['#070b12', 0.01],
    exposure: 2.0,
    ambient: { color: '#98a6bc', intensity: 1.2 },
    Scene: Central,
    Lights: CentralLights,
    focus: CENTRAL_FOCUS,
    resolveColliders: resolveCentralColliders,
    groundHeightAt: centralGroundHeightAt,
    bgm: '/audio/corridor-bgm.m4a',
    /** 코어에 닿아 시설이 멈추면 — Checkpoint Override (2026-08-30 사용자) */
    lockdownBgm: '/audio/checkpoint-override.m4a',
    /** 들어온 문 앞 (들어온 벽 z 4) */
    enforcerSpawn: { x: 0, z: 2.6 },
  },
  interrogation: {
    title: '3D 디지털 심문소',
    blurb: '같은 방 번호를 친 사람끼리 검정 철골 천장 아래, 링 조명 하나가 빈 무대를 비추는 심문소에서 만난다.',
    background: '#101d31',
    /** 참고 이미지는 어둡지만 배경이 다 읽힌다 — 안개를 청회색으로 밝게, 멀리 갈수록 푸른 연무에 잠긴다 */
    fog: ['#101d31', 0.013],
    exposure: 1.15,
    /** 차가운 청회색 앰비언트 — 강판 벽·트러스·X 가새가 전부 읽혀야 한다 */
    ambient: { color: '#9db4d8', intensity: 1.2 },
    Scene: Interrogation,
    Lights: InterrogationLights,
    Effects: InterrogationEffects,
    /** 참고 렌더가 광각 저시점이라 — 넓게 시작해서 걸으면 좁혀진다 */
    introFov: 26,
    focus: INTERROGATION_FOCUS,
    resolveColliders: resolveInterrogationColliders,
    groundHeightAt: interrogationGroundHeightAt,
    /** 복도·중앙 시설과 같은 곡 — 원본 파일 이름이 "Interrogation Door.wav" 다 */
    bgm: '/audio/corridor-bgm.m4a',
    /** 등 뒤 격납문 앞 */
    enforcerSpawn: INTERROGATION_ENFORCER_SPAWN,
  },
  recheck: {
    title: '재검실',
    blurb: '검문에서 걸러진 개체가 끌려오는 작은 방 — 검증대 하나, 조명 하나, 열리지 않는 문 하나. 챕터 3 의 무대.',
    background: '#02040a',
    /** 좁은 방이라 안개는 짙게 — 벽이 가깝다는 게 느껴져야 한다 */
    fog: ['#070b12', 0.022],
    exposure: 2.0,
    /** 복도·중앙 시설과 같은 청회색. 다만 방이 어두워야 링 조명이 산다 */
    ambient: { color: '#98a6bc', intensity: 0.85 },
    Scene: Recheck,
    Lights: RecheckLights,
    focus: RECHECK_FOCUS,
    resolveColliders: resolveRecheckColliders,
    groundHeightAt: recheckGroundHeightAt,
    /** 사용자가 준 "Checkpoint Glitch.wav" → AAC (afconvert, 128k). 2026-08-30 사용자 지정 — 재검실 전용 곡 */
    bgm: '/audio/checkpoint-glitch.m4a',
    /** 들어온 문 앞 — 사격이 나면 그 문으로 들어온다 */
    enforcerSpawn: { x: 0, z: RECHECK_NEAR_Z - 1.5 },
  },
} satisfies Record<string, MapDef>;

export type MapId = keyof typeof MAPS;

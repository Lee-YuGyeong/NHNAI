/**
 * 낙하 생존의 무대 — 마당 테두리 · 천장 배출 호퍼 · 작업등, 그리고 떨어지는 공(FallingBalls).
 *
 * 공 자체는 /trial 과 **같은 부품**이다 (색 사냥의 HuntOrbs · 회전 원판의 DiscStage 와 같은 규칙) —
 * 종류별 GLB(농구 · 축구 · 야구 · 탁구 · 볼링), 떨어지며 도는 각도, 스폰 확대, 바닥 그림자 원반이
 * 전부 저기 있다. 여기서 다시 그리면 같은 게임이 두 모습이 된다.
 * 상태도 하나다 — features/trial/games/fall/fallState (InterrogationFeature 의 trial_snapshot).
 *
 * ★ 무대만 이 홀에 맞춘다. /trial 의 FallScene 은 옛 심문소 맵(트러스 지붕, 처마 9 · 용마루 13)에 서고,
 *   여기는 특수인공지능대응센터 홀(govcenter, **평천장 11m**)이다. 그래서 두 가지가 다르다:
 *   ① 스폰 높이(11.5)가 천장보다 위다 — 공이 생겨나는 순간은 천장이 이미 가린다. 저쪽에서 호퍼가 하던
 *      "허공 팝 감추기"를 여기서는 천장이 한다. 호퍼는 **어디서 나오는가**를 말해 주는 장식으로 남는다.
 *   ② 그래서 마당을 빈틈없이 덮지 않는다 — 천장 보(z −8·−4·0·4·8)와 형광등 줄(x ±2.8) 사이에 끼워 넣는다.
 *      겹쳐 박으면 10m 위에서 쇠가 쇠를 뚫고 나온다.
 */
import { Suspense } from 'react';
import * as THREE from 'three';
import { GlbInstances, type Fit, type InstanceItem } from '@/world/map/corridor/part';
import { CEILING_Y } from '@/world/map/govcenter/layout';
import { FALL_ARENA } from '@/world/mp/constants';
import { FallingBalls } from '@/features/trial/games/fall/FallingBalls';

const ARENA_W = FALL_ARENA.maxX - FALL_ARENA.minX;
const ARENA_D = FALL_ARENA.maxZ - FALL_ARENA.minZ;
const ARENA_CX = (FALL_ARENA.minX + FALL_ARENA.maxX) / 2;
const ARENA_CZ = (FALL_ARENA.minZ + FALL_ARENA.maxZ) / 2;

const EDGE_MAT = new THREE.MeshBasicMaterial({ color: '#ffca8e', transparent: true, opacity: 0.55 });

/** 호퍼 한 대의 크기(m). 폭은 형광등 줄 사이에 들어갈 만큼, 깊이는 천장 보 사이에 들어갈 만큼 */
const HOPPER_FIT: Fit = { x: 2.2, y: 1.15, z: 3.2 };
/** 열 — 형광등 줄(x ±2.8)을 비켜 네 줄 */
const HOPPER_XS = [-4.4, -1.2, 1.2, 4.4];
/** 행 — 천장 보(z −8 · −4 · 0 · 4 · 8) 사이 다섯 줄 */
const HOPPER_ZS = [-10, -6, -2, 2, 6];
/** 자리는 모델 바닥(=배출구)이다 — 플랜지(윗면)를 천장에 붙이려면 천장에서 키만큼 내린다 */
const HOPPER_MOUTH_Y = CEILING_Y - (HOPPER_FIT.y ?? 1);
const HOPPERS: InstanceItem[] = HOPPER_ZS.flatMap((z) => HOPPER_XS.map((x): InstanceItem => ({ position: [x, HOPPER_MOUTH_Y, z] })));

/** 마당 경계 — 바닥에 얇은 앰버 테. 여기 안에만 떨어진다는 걸 몸으로 알게 (FreeRig 가 막는 선과 같다) */
function ArenaEdge() {
  return (
    <group position={[ARENA_CX, 0.02, ARENA_CZ]}>
      <mesh position={[0, 0, -ARENA_D / 2]} material={EDGE_MAT}>
        <boxGeometry args={[ARENA_W, 0.005, 0.08]} />
      </mesh>
      <mesh position={[0, 0, ARENA_D / 2]} material={EDGE_MAT}>
        <boxGeometry args={[ARENA_W, 0.005, 0.08]} />
      </mesh>
      <mesh position={[-ARENA_W / 2, 0, 0]} material={EDGE_MAT}>
        <boxGeometry args={[0.08, 0.005, ARENA_D]} />
      </mesh>
      <mesh position={[ARENA_W / 2, 0, 0]} material={EDGE_MAT}>
        <boxGeometry args={[0.08, 0.005, ARENA_D]} />
      </mesh>
    </group>
  );
}

export function FallStage() {
  return (
    <group>
      <ArenaEdge />
      {/* 마당 위 작업등 — 홀 조명은 무대에 떨어져서 가운데가 어둡다. 떨어지는 것이 보여야 피한다 */}
      <pointLight position={[ARENA_CX, 7.5, ARENA_CZ]} color="#dfe9ff" intensity={60} distance={22} decay={2} />
      {/* 천장 밑 — 배출구에서 나오는 공이 보에 진 그늘에 묻히지 않게 한 번 더 */}
      <pointLight position={[ARENA_CX, 10.4, ARENA_CZ]} color="#ffe8c4" intensity={40} distance={14} decay={2} />
      {/* 공은 홀·호퍼와 따로 기다린다 — 부품이 늦게 와도 떨어지는 것부터 보여야 피한다 */}
      <Suspense fallback={null}>
        <GlbInstances id="trial_hopper" fit={HOPPER_FIT} items={HOPPERS} />
      </Suspense>
      <Suspense fallback={null}>
        <FallingBalls />
      </Suspense>
    </group>
  );
}

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
import { Suspense, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GlbInstances, type Fit, type InstanceItem } from '@/world/map/corridor/part';
import { CEILING_Y } from '@/world/map/govcenter/layout';
import { FALL_ARENA } from '@/world/mp/constants';
import { FallingBalls } from '@/features/trial/games/fall/FallingBalls';

const ARENA_W = FALL_ARENA.maxX - FALL_ARENA.minX;
const ARENA_D = FALL_ARENA.maxZ - FALL_ARENA.minZ;
const ARENA_CX = (FALL_ARENA.minX + FALL_ARENA.maxX) / 2;
const ARENA_CZ = (FALL_ARENA.minZ + FALL_ARENA.maxZ) / 2;

/**
 * 마당 위 작업등의 자리·세기 — **켜는 것은 HallScene 이다**(ArenaWorkLights). 값만 여기 둔다:
 * 어디를 밝혀야 하는지는 이 무대가 아는 것이고, 언제 켜지는지는 판이 아는 것이다.
 *
 *   ① 홀 조명은 무대(연단)에 떨어져서 마당 가운데가 어둡다 — 떨어지는 것이 보여야 피한다.
 *   ② 천장 밑 — 배출구에서 나오는 공이 보에 진 그늘에 묻히지 않게 한 번 더.
 */
export const ARENA_WORK_LIGHTS = [
  { position: [ARENA_CX, 7.5, ARENA_CZ] as const, color: '#dfe9ff', intensity: 60, distance: 22 },
  { position: [ARENA_CX, 10.4, ARENA_CZ] as const, color: '#ffe8c4', intensity: 40, distance: 14 },
];

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

/**
 * 이 무대의 셰이더를 **미리 링크시킨다.** 부품이 다 선 뒤 한 번 — 그래서 두 Suspense 안에 하나씩 있다.
 *
 * three 는 재질마다 셰이더 프로그램을 처음 그리는 프레임에 만든다. 링크 자체는 드라이버가 뒤에서 하지만,
 * 그 프로그램의 유니폼·어트리뷰트를 세는 순간(`getProgramParameter`) **링크가 끝날 때까지 자바스크립트가 멈춘다.**
 * 호루라기가 울리는 그 프레임이 바로 그 순간이었다 — 2026-09-05 측정으로 335ms, 처음 여는 판에서는 1.3초.
 * `gl.debug.checkShaderErrors = false`(HallScene) 로도 안 없어진다: 그건 오류 로그만 안 읽을 뿐,
 * 유니폼을 세는 일은 그대로 남는다.
 *
 * `compileAsync` 는 지금 씬에 있는 재질의 프로그램을 만들어 두고(KHR_parallel_shader_compile 이 있으면
 * 링크가 끝났는지도 안 멈추고 확인한다), 이 무대는 그때 **안 보이게** 서 있다 (HallScene 의 stageReady).
 * 40초 뒤 호루라기가 울릴 때는 링크가 이미 끝나 있어서 세는 일이 안 기다린다.
 */
function Precompile() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    void gl.compileAsync(scene, camera);
  }, [gl, scene, camera]);
  return null;
}

export function FallStage() {
  return (
    <group>
      <ArenaEdge />
      {/* 마당 위 작업등은 여기 없다 — 홀에 **상시** 켜 둔 것을 밝히기만 한다 (HallScene 의 ArenaWorkLights) */}
      {/* 공은 홀·호퍼와 따로 기다린다 — 부품이 늦게 와도 떨어지는 것부터 보여야 피한다 */}
      <Suspense fallback={null}>
        <GlbInstances id="trial_hopper" fit={HOPPER_FIT} items={HOPPERS} />
        <Precompile />
      </Suspense>
      <Suspense fallback={null}>
        <FallingBalls />
        <Precompile />
      </Suspense>
    </group>
  );
}

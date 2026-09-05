/**
 * 무게 중심 다리 — 홀 가운데 마당에 축 하나로 얹힌 길이 14m 강판. 판자는 서버가 준 기울기(seesawState.phiAt)로 매 프레임 기운다.
 * 윗면 텍스처(힉스필드 nano_banana_pro, public/textures/seesaw/beam_half.webp)는 **판자 절반**이다 — 왼쪽 끝이 축(황흑 띠), 오른읽 끝이
 * 판 끝(적백 띠), 그 사이 1m 마다 눈금과 숫자 1~6. +u 쪽은 그대로, −u 쪽은 180° 돌려 붙여 숫자가 어느 쪽에서도 바로 읽힌다 —
 * **축에서 몇 미터에 서 있는가가 곧 토크**라 눈금이 게임의 계기판이다.
 * 받침대(Tripo Studio, seesaw_pivot)는 서 있고 판자만 돈다. 축 양옆 멈춤쇠(seesaw_stop)는 판이 상한에 닿는 자리에 선다.
 * 상자(cargo_container, 격납고 부품 재사용)는 크레인 호이스트(crane_hoist)에서 내려와 판 위에 놓인다 — 닿는 시각(at) 전이면 내려오는 중.
 */
import { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { WarpFx } from '@/features/interrogation/scene/WarpFx';
import { GlbInstances, GlbPart } from '@/world/map/corridor/part';
import { SEESAW_CENTER, SEESAW_CRATE_DROP_MS, SEESAW_CRATE_SIZE, SEESAW_HALF, SEESAW_HALF_W, SEESAW_PLATE_H, SEESAW_TILT_MAX, SEESAW_TOP } from '@/world/mp/constants';
import { seesawState } from './seesawState';

const TOP_URL = '/textures/seesaw/beam_half.webp';
/** 난간 높이 · 기둥 간격 */
const RAIL_H = 0.9;
const RAIL_EVERY = 2;
/** 크레인 호이스트가 매달린 높이 */
const CRANE_Y = 7.2;
/** 멈춤쇠가 선 자리(축에서, m) — 판 밑면이 상한에서 닿는 높이만큼 세운다 */
const STOP_U = 3.5;
const STOP_H = SEESAW_TOP - SEESAW_PLATE_H - STOP_U * Math.sin(SEESAW_TILT_MAX);

const SIDE_MAT = new THREE.MeshStandardMaterial({ color: '#2b313a', metalness: 0.7, roughness: 0.45 });
const RAIL_MAT = new THREE.MeshStandardMaterial({ color: '#c9a227', metalness: 0.6, roughness: 0.4 });
const PIT_MAT = new THREE.MeshBasicMaterial({ color: '#05070a' });
const END_GLOW_P = new THREE.MeshBasicMaterial({ color: '#ff4d3a' });
const END_GLOW_N = new THREE.MeshBasicMaterial({ color: '#5ff0ff' });
const STOP_MAT = new THREE.MeshStandardMaterial({ color: '#3a3f47', metalness: 0.6, roughness: 0.5 });
const CRATE_MAT = new THREE.MeshStandardMaterial({ color: '#b8641f', metalness: 0.35, roughness: 0.7 });
const HOIST_MAT = new THREE.MeshStandardMaterial({ color: '#4a4f58', metalness: 0.7, roughness: 0.4 });
const CABLE_MAT = new THREE.MeshBasicMaterial({ color: '#1a1d22' });

function Plate() {
  const tex = useTexture(TOP_URL);
  const topMat = useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return new THREE.MeshStandardMaterial({ map: tex, metalness: 0.55, roughness: 0.5 });
  }, [tex]);
  const rails = useMemo(() => {
    const posts: [number, number, number][] = [];
    for (let u = -SEESAW_HALF; u <= SEESAW_HALF + 1e-6; u += RAIL_EVERY) posts.push([SEESAW_HALF_W, RAIL_H / 2, u], [-SEESAW_HALF_W, RAIL_H / 2, u]);
    return posts;
  }, []);
  return (
    <group>
      {/* 몸통 — 두께 있는 강판. 윗면 y=0 */}
      <mesh position={[0, -SEESAW_PLATE_H / 2, 0]} material={SIDE_MAT} castShadow receiveShadow>
        <boxGeometry args={[SEESAW_HALF_W * 2, SEESAW_PLATE_H, SEESAW_HALF * 2]} />
      </mesh>
      {/* 윗면 — 절반 텍스처 두 장. 평면의 +x 가 텍스처 오른쪽(판 끝)이 되게 돌린다: +u 절반은 x→+z, −u 절반은 x→−z */}
      <mesh rotation={[-Math.PI / 2, 0, -Math.PI / 2]} position={[0, 0.002, SEESAW_HALF / 2]} material={topMat} receiveShadow>
        <planeGeometry args={[SEESAW_HALF, SEESAW_HALF_W * 2]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[0, 0.002, -SEESAW_HALF / 2]} material={topMat} receiveShadow>
        <planeGeometry args={[SEESAW_HALF, SEESAW_HALF_W * 2]} />
      </mesh>
      {/* 난간 — 폭 방향은 막혀 있다(sim.ts). 기둥 + 위 가로대 */}
      {rails.map((p, i) => (
        <mesh key={i} position={p} material={RAIL_MAT}>
          <cylinderGeometry args={[0.03, 0.03, RAIL_H, 8]} />
        </mesh>
      ))}
      <mesh position={[SEESAW_HALF_W, RAIL_H, 0]} rotation-x={Math.PI / 2} material={RAIL_MAT}>
        <cylinderGeometry args={[0.025, 0.025, SEESAW_HALF * 2, 8]} />
      </mesh>
      <mesh position={[-SEESAW_HALF_W, RAIL_H, 0]} rotation-x={Math.PI / 2} material={RAIL_MAT}>
        <cylinderGeometry args={[0.025, 0.025, SEESAW_HALF * 2, 8]} />
      </mesh>
      {/* 양 끝 발광 띠 — +u 붉게 · −u 청록. 어느 끝이 내려가는지 멀리서도 읽힌다 */}
      <mesh position={[0, -SEESAW_PLATE_H / 2, SEESAW_HALF + 0.01]} material={END_GLOW_P}>
        <boxGeometry args={[SEESAW_HALF_W * 2, 0.06, 0.02]} />
      </mesh>
      <mesh position={[0, -SEESAW_PLATE_H / 2, -SEESAW_HALF - 0.01]} material={END_GLOW_N}>
        <boxGeometry args={[SEESAW_HALF_W * 2, 0.06, 0.02]} />
      </mesh>
    </group>
  );
}

/** 판 위 상자들 — 스냅샷 그대로. 닿기 전이면 크레인에서 내려오는 중(ease-in) */
function Crates() {
  const group = useRef<THREE.Group>(null);
  const hoist = useRef<THREE.Group>(null);
  const cable = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const now = Date.now();
    const phi = seesawState.phiAt(now);
    const crates = seesawState.crates(now);
    const newest = crates.reduce<(typeof crates)[number] | null>((best, c) => (best === null || c.landAtLocal > best.landAtLocal ? c : best), null);
    g.children.forEach((child, i) => {
      const c = crates[i];
      child.visible = !!c;
      if (!c) return;
      const surfY = SEESAW_TOP + c.u * Math.sin(phi);
      const surfZ = SEESAW_CENTER.z + c.u * Math.cos(phi);
      const t = Math.min(1, Math.max(0, 1 - (c.landAtLocal - now) / SEESAW_CRATE_DROP_MS));
      const drop = t < 1 ? (CRANE_Y - 0.6 - surfY) * (1 - t * t) : 0;
      child.position.set(SEESAW_CENTER.x + c.v, surfY + drop, surfZ);
      // 판에 놓인 상자는 판과 같이 기운다
      child.rotation.set(t < 1 ? 0 : -phi, 0, 0);
    });
    // 호이스트 — 가장 최근 상자 위에 서 있다(없으면 축 위). 내려오는 동안만 줄이 보인다
    if (hoist.current) {
      const nz = newest ? SEESAW_CENTER.z + newest.u : SEESAW_CENTER.z;
      const nx = newest ? SEESAW_CENTER.x + newest.v : SEESAW_CENTER.x;
      hoist.current.position.x += (nx - hoist.current.position.x) * 0.08;
      hoist.current.position.z += (nz - hoist.current.position.z) * 0.08;
    }
    if (cable.current) cable.current.visible = newest !== null && newest.landAtLocal > now;
  });
  return (
    <>
      <group ref={group}>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} visible={false}>
            <Suspense fallback={null}>
              <GlbPart id="cargo_container" fit={{ y: SEESAW_CRATE_SIZE }} material={CRATE_MAT} castShadow />
            </Suspense>
          </group>
        ))}
      </group>
      <group ref={hoist} position={[SEESAW_CENTER.x, CRANE_Y, SEESAW_CENTER.z]}>
        <Suspense fallback={null}>
          <GlbPart id="crane_hoist" fit={{ y: 1.1 }} position={[0, -1.1, 0]} material={HOIST_MAT} />
        </Suspense>
        <mesh ref={cable} position={[0, -(CRANE_Y - SEESAW_TOP) / 2 - 1.1, 0]} material={CABLE_MAT}>
          <cylinderGeometry args={[0.015, 0.015, CRANE_Y - SEESAW_TOP - 1.2, 6]} />
        </mesh>
        {/* 레일 — 홀 천장 밑을 판자 길이로 */}
        <mesh position={[0, 0.5, 0]} rotation-x={Math.PI / 2} material={HOIST_MAT}>
          <boxGeometry args={[0.3, SEESAW_HALF * 2 + 2, 0.3]} />
        </mesh>
      </group>
    </>
  );
}

/**
 * @param lights 판 위 작업등을 여기서 켤지 — /trial 은 켠다(기본). 검문소 홀이 이 무대를 세우게 되면 광원 수를 고정하려고 false 를 줄 것
 */
export function SeesawStage({ lights = true }: { lights?: boolean } = {}) {
  const tilt = useRef<THREE.Group>(null);
  useFrame(() => {
    // rotation.x = −φ 라야 (0,0,u) 가 (0, u·sin φ, u·cos φ) 로 간다 — +u 끝이 올라간다
    if (tilt.current) tilt.current.rotation.x = -seesawState.phiAt(Date.now());
  });
  const stops = useMemo(
    () =>
      [1, -1].flatMap((su) =>
        [1, -1].map((sv) => ({
          position: [SEESAW_CENTER.x + sv * (SEESAW_HALF_W - 0.5), 0, SEESAW_CENTER.z + su * STOP_U] as [number, number, number],
          rotationY: 0,
        })),
      ),
    [],
  );
  return (
    <group>
      {/* 구덩이 — 판 밑의 어둠. 끝이 내려오는 자리 */}
      <mesh rotation-x={-Math.PI / 2} position={[SEESAW_CENTER.x, 0.015, SEESAW_CENTER.z]} material={PIT_MAT}>
        <planeGeometry args={[SEESAW_HALF_W * 2 + 1.6, SEESAW_HALF * 2 + 1.6]} />
      </mesh>
      {/* 받침대 — 서 있다. 축 구멍이 모델의 z 축이라 90° 돌려 x 축(판이 도는 축)에 맞춘다 */}
      <Suspense fallback={null}>
        <GlbPart id="seesaw_pivot" fit={{ y: SEESAW_TOP - SEESAW_PLATE_H + 0.1 }} position={[SEESAW_CENTER.x, 0, SEESAW_CENTER.z]} rotationY={Math.PI / 2} castShadow />
      </Suspense>
      {/* 멈춤쇠 — 축 양옆 3.5m, 판 밑면이 상한에서 닿는 높이 */}
      <Suspense fallback={null}>
        <GlbInstances id="seesaw_stop" fit={{ y: STOP_H }} items={stops} material={STOP_MAT} />
      </Suspense>
      {/* 도는 것 — 판자. 축은 윗면 높이 */}
      <group position={[SEESAW_CENTER.x, SEESAW_TOP, SEESAW_CENTER.z]}>
        <group ref={tilt}>
          <Suspense fallback={null}>
            <Plate />
          </Suspense>
        </group>
      </group>
      <Crates />
      {lights ? (
        <>
          {/* 하나만 — 둘이면 축 둘레 텍스처가 하얗게 탔다(2026-09-05 헤드리스 확인) */}
          <pointLight position={[SEESAW_CENTER.x, 8.5, SEESAW_CENTER.z]} color="#dfe9ff" intensity={45} distance={26} decay={2} />
        </>
      ) : null}
      {/*
       * 떨어져 다시 서는 순간이동의 빛기둥 (interrogation/scene/warp.ts). 무대에 붙여 두면 /trial 과 검문소 홀이
       * 같이 얻는다 — 홀도 이 무대를 그대로 쓴다 (HallScene). 걸린 것이 없으면 여덟 자리가 다 꺼져 있다
       */}
      <WarpFx dim={0.45} />
    </group>
  );
}

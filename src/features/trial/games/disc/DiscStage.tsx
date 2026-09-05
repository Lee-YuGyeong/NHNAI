/**
 * 회전 원판 — 심문소 홀 가운데 마당에 놓인 지름 11m 강판과 그 받침. 원판은 서버가 준 각도(discState.thetaAt)로 매 프레임 돈다.
 * 윗면 텍스처(힉스필드 nano_banana_pro, public/textures/disc/disc_top.webp)는 12조각 방사 이음매 · 동심원 · 가장자리 위험 띠 —
 * **이음매가 돌아가는 것이 곧 회전 속도의 단서**다 (각속도 숫자는 HUD 에도 있지만 몸은 눈으로 읽는다).
 * 가운데 기둥(Tripo Studio, disc_hub)은 원판과 함께 돌고, 받침 둘레의 붉은 비콘(disc_beacon)은 서 있다 — 도는 것과 서 있는 것의
 * 대비가 회전을 읽게 한다. 기둥 둘레 청록 고리와 가장자리 앰버 띠는 발광 재질(라이트 없이).
 */
import { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { GlbInstances, GlbPart } from '@/world/map/corridor/part';
import { DISC_CENTER, DISC_HUB_R, DISC_R, DISC_TOP } from '@/world/mp/constants';
import { discState } from './discState';

const TOP_URL = '/textures/disc/disc_top.webp';
/** 원판 강판 두께(m) · 받침 반지름 */
const PLATE_H = 0.28;
const BASE_R = DISC_R + 0.55;
const BEACONS = 8;

const SIDE_MAT = new THREE.MeshStandardMaterial({ color: '#2b313a', metalness: 0.7, roughness: 0.45 });
const BASE_MAT = new THREE.MeshStandardMaterial({ color: '#171b21', metalness: 0.5, roughness: 0.8 });
const BASE_TOP_MAT = new THREE.MeshStandardMaterial({ color: '#22272e', metalness: 0.55, roughness: 0.7 });
const RIM_GLOW = new THREE.MeshBasicMaterial({ color: '#ffb347' });
const HUB_GLOW = new THREE.MeshBasicMaterial({ color: '#5ff0ff' });
const PIT_MAT = new THREE.MeshBasicMaterial({ color: '#05070a' });

function Plate() {
  const tex = useTexture(TOP_URL);
  const topMat = useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return new THREE.MeshStandardMaterial({ map: tex, metalness: 0.55, roughness: 0.5 });
  }, [tex]);
  return (
    <group position={[0, DISC_TOP - PLATE_H, 0]}>
      {/* 윗면 — 텍스처의 원이 화면을 꽉 채우므로 CircleGeometry 의 UV(단위원 → [0,1]²)가 그대로 맞는다 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, PLATE_H + 0.002, 0]} material={topMat} receiveShadow>
        <circleGeometry args={[DISC_R, 96]} />
      </mesh>
      {/* 옆면 */}
      <mesh position={[0, PLATE_H / 2, 0]} material={SIDE_MAT}>
        <cylinderGeometry args={[DISC_R, DISC_R, PLATE_H, 96, 1, true]} />
      </mesh>
      {/* 가장자리 앰버 띠 — 옆면 가운데를 두른다 */}
      <mesh rotation-x={Math.PI / 2} position={[0, PLATE_H / 2, 0]} material={RIM_GLOW}>
        <torusGeometry args={[DISC_R + 0.01, 0.035, 8, 128]} />
      </mesh>
      {/* 기둥 — 원판과 같이 돈다. 발밑 y=0 이 원점이라 윗면에 놓는다 */}
      <Suspense fallback={null}>
        <GlbPart id="disc_hub" fit={{ y: 2.0 }} position={[0, PLATE_H, 0]} />
      </Suspense>
      {/* 기둥 발치 청록 고리 — 「가장 안정한 자리」의 테두리. 발광이라 조명과 무관하게 보인다 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, PLATE_H + 0.006, 0]} material={HUB_GLOW}>
        <ringGeometry args={[DISC_HUB_R + 0.02, DISC_HUB_R + 0.08, 64]} />
      </mesh>
    </group>
  );
}

/**
 * @param lights 원판 위 작업등을 여기서 켤지 — /trial 은 켠다(기본). 검문소 홀(HallScene)은 광원 수를 고정하려고 제 ArenaWorkLights 로
 *   들고 false 를 준다: 무대가 서면서 등이 늘면 three 가 재질 셰이더를 전부 다시 링크해 그 프레임이 멈춘다
 */
export function DiscStage({ lights = true }: { lights?: boolean } = {}) {
  const spin = useRef<THREE.Group>(null);
  useFrame(() => {
    if (spin.current) spin.current.rotation.y = discState.thetaAt(Date.now());
  });
  const beacons = useMemo(
    () =>
      Array.from({ length: BEACONS }, (_, i) => {
        const a = (i / BEACONS) * Math.PI * 2 + Math.PI / BEACONS;
        return { position: [Math.cos(a) * (BASE_R - 0.2), DISC_TOP - PLATE_H - 0.1, Math.sin(a) * (BASE_R - 0.2)] as [number, number, number], rotationY: -a + Math.PI / 2 };
      }),
    [],
  );
  return (
    <group position={[DISC_CENTER.x, 0, DISC_CENTER.z]}>
      {/* 받침 — 서 있다. 원판 밑의 어둠(구덩이)과 받침 링 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, 0]} material={PIT_MAT}>
        <circleGeometry args={[BASE_R + 0.6, 96]} />
      </mesh>
      <mesh position={[0, (DISC_TOP - PLATE_H - 0.1) / 2, 0]} material={BASE_MAT}>
        <cylinderGeometry args={[BASE_R, BASE_R + 0.35, DISC_TOP - PLATE_H - 0.1, 96, 1, true]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, DISC_TOP - PLATE_H - 0.1, 0]} material={BASE_TOP_MAT}>
        <ringGeometry args={[DISC_R - 0.05, BASE_R, 96]} />
      </mesh>
      <Suspense fallback={null}>
        <GlbInstances id="disc_beacon" fit={{ y: 0.9 }} items={beacons} />
      </Suspense>
      {/* 도는 것 */}
      <group ref={spin}>
        <Suspense fallback={null}>
          <Plate />
        </Suspense>
      </group>
      {/* 원판 위 작업등 — 홀의 링 조명은 무대에만 떨어져 마당이 어둡다 (lights 머리말) */}
      {lights ? (
        <>
          <pointLight position={[0, 7.5, 0]} color="#dfe9ff" intensity={70} distance={24} decay={2} />
          <pointLight position={[0, 2.6, 0]} color="#5ff0ff" intensity={6} distance={7} decay={2} />
        </>
      ) : null}
    </group>
  );
}

/**
 * 회전 봉 무대 — 심문소 홀 가운데 마당, 회전 원판과 같은 크기의 받침 위에 **돌지 않는** 강판이 놓이고,
 * 가운데 기둥(disc_hub 재활용 — 기둥은 봉과 함께 돈다)에서 나온 낮은 봉이 바닥을 쓸며 돈다. 봉은 서버가 준
 * 각도(barState.thetaAt)로 매 프레임 돈다 — 도는 봉과 서 있는 바닥의 대비가 속도를 읽게 한다(DiscStage 의 비콘과 같은 결).
 * 봉 밑면과 무대 사이 틈(BAR_HEIGHT)이 곧 「뛰어야 하는 높이」다 — 보이는 것은 「얼마나 높이」지 「발밑이 얼마나 잡는가」(μ)가 아니다.
 */
import { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GlbInstances, GlbPart } from '@/world/map/corridor/part';
import { BAR_CENTER, BAR_HEIGHT, BAR_HUB_R, BAR_R, BAR_STAND_R, BAR_THICK, BAR_TOP } from '@/world/mp/constants';
import { barState } from './barState';

/** 무대 강판 두께(m) · 받침 반지름 — DiscStage 와 같은 눈금 */
const PLATE_H = 0.28;
const BASE_R = BAR_R + 0.55;
const BEACONS = 8;

const TOP_MAT = new THREE.MeshStandardMaterial({ color: '#39414c', metalness: 0.6, roughness: 0.55 });
const SIDE_MAT = new THREE.MeshStandardMaterial({ color: '#2b313a', metalness: 0.7, roughness: 0.45 });
const BASE_MAT = new THREE.MeshStandardMaterial({ color: '#171b21', metalness: 0.5, roughness: 0.8 });
const BASE_TOP_MAT = new THREE.MeshStandardMaterial({ color: '#22272e', metalness: 0.55, roughness: 0.7 });
const RIM_GLOW = new THREE.MeshBasicMaterial({ color: '#ffb347' });
const HUB_GLOW = new THREE.MeshBasicMaterial({ color: '#5ff0ff' });
const PIT_MAT = new THREE.MeshBasicMaterial({ color: '#05070a' });
const RING_MAT = new THREE.MeshBasicMaterial({ color: '#7d8794', transparent: true, opacity: 0.35 });
/** 봉 — 어두운 강관에 앰버 경고 띠. 발광이라 조명과 무관하게 보인다 */
const BAR_MAT = new THREE.MeshStandardMaterial({ color: '#3a3f47', metalness: 0.8, roughness: 0.35 });
const BAR_TIP_MAT = new THREE.MeshBasicMaterial({ color: '#ff4d3a' });

export function BarStage({ lights = true }: { lights?: boolean } = {}) {
  const spin = useRef<THREE.Group>(null);
  useFrame(() => {
    if (spin.current) spin.current.rotation.y = barState.thetaAt(Date.now());
  });
  const beacons = useMemo(
    () =>
      Array.from({ length: BEACONS }, (_, i) => {
        const a = (i / BEACONS) * Math.PI * 2 + Math.PI / BEACONS;
        return { position: [Math.cos(a) * (BASE_R - 0.2), BAR_TOP - PLATE_H - 0.1, Math.sin(a) * (BASE_R - 0.2)] as [number, number, number], rotationY: -a + Math.PI / 2 };
      }),
    [],
  );
  const barLen = BAR_R - BAR_HUB_R + 0.35;
  return (
    <group position={[BAR_CENTER.x, 0, BAR_CENTER.z]}>
      {/* 받침 — 원판 무대와 같은 구덩이 · 링 · 비콘. 바닥 강판은 돌지 않는다 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, 0]} material={PIT_MAT}>
        <circleGeometry args={[BASE_R + 0.6, 96]} />
      </mesh>
      <mesh position={[0, (BAR_TOP - PLATE_H - 0.1) / 2, 0]} material={BASE_MAT}>
        <cylinderGeometry args={[BASE_R, BASE_R + 0.35, BAR_TOP - PLATE_H - 0.1, 96, 1, true]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, BAR_TOP - PLATE_H - 0.1, 0]} material={BASE_TOP_MAT}>
        <ringGeometry args={[BAR_R - 0.05, BASE_R, 96]} />
      </mesh>
      <Suspense fallback={null}>
        <GlbInstances id="disc_beacon" fit={{ y: 0.9 }} items={beacons} />
      </Suspense>

      {/* 무대 — 서 있다 */}
      <group position={[0, BAR_TOP - PLATE_H, 0]}>
        <mesh rotation-x={-Math.PI / 2} position={[0, PLATE_H + 0.002, 0]} material={TOP_MAT} receiveShadow>
          <circleGeometry args={[BAR_R, 96]} />
        </mesh>
        {/* 출발 고리(BAR_STAND_R) — 어디 서 있어도 봉은 오지만, 눈금이 있어야 「내 자리」가 생긴다 */}
        <mesh rotation-x={-Math.PI / 2} position={[0, PLATE_H + 0.005, 0]} material={RING_MAT}>
          <ringGeometry args={[BAR_STAND_R - 0.04, BAR_STAND_R + 0.04, 96]} />
        </mesh>
        <mesh position={[0, PLATE_H / 2, 0]} material={SIDE_MAT}>
          <cylinderGeometry args={[BAR_R, BAR_R, PLATE_H, 96, 1, true]} />
        </mesh>
        {/* 가장자리 앰버 띠 — 밀려나면 떨어지는 그 선 */}
        <mesh rotation-x={Math.PI / 2} position={[0, PLATE_H / 2, 0]} material={RIM_GLOW}>
          <torusGeometry args={[BAR_R + 0.01, 0.035, 8, 128]} />
        </mesh>
      </group>

      {/* 도는 것 — 기둥과 봉. 봉의 윗면이 무대에서 BAR_HEIGHT — 그 밑틈을 뛰어넘는 게 아니라 봉 자체를 넘는다 */}
      <group ref={spin} position={[0, BAR_TOP, 0]}>
        <Suspense fallback={null}>
          <GlbPart id="disc_hub" fit={{ y: 2.0 }} position={[0, 0, 0]} />
        </Suspense>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, 0]} material={HUB_GLOW}>
          <ringGeometry args={[BAR_HUB_R + 0.02, BAR_HUB_R + 0.08, 64]} />
        </mesh>
        {/* 봉 본체 — 기둥에서 가장자리 너머까지. rot(θ) 축 규약(+x 에서 −z 쪽으로 돈다, 서버 sim 과 같다) */}
        <mesh position={[BAR_HUB_R + barLen / 2, BAR_HEIGHT - BAR_THICK / 2, 0]} material={BAR_MAT} castShadow>
          <boxGeometry args={[barLen, BAR_THICK, BAR_THICK]} />
        </mesh>
        {/* 봉 끝 — 붉은 발광 캡. 봉이 어디 있는지 곁눈으로 잡는 점 */}
        <mesh position={[BAR_HUB_R + barLen, BAR_HEIGHT - BAR_THICK / 2, 0]} material={BAR_TIP_MAT}>
          <boxGeometry args={[0.3, BAR_THICK + 0.04, BAR_THICK + 0.04]} />
        </mesh>
      </group>

      {/* 무대 위 작업등 — DiscStage 와 같은 이유(홀의 링 조명은 무대에만 떨어져 마당이 어둡다) */}
      {lights ? (
        <>
          <pointLight position={[0, 7.5, 0]} color="#dfe9ff" intensity={70} distance={24} decay={2} />
          <pointLight position={[0, 2.6, 0]} color="#5ff0ff" intensity={6} distance={7} decay={2} />
        </>
      ) : null}
    </group>
  );
}

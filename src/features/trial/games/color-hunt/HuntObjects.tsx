/**
 * 색 사냥의 구슬 · 견본판 — 서버가 준 표시색을 **그대로** 그린다. 재질이 meshBasicMaterial(무광 ·
 * 조명 무시)인 것이 핵심이다: 씬 조명이 어떻든 화면색 = 서버 물리의 결과다. 조명이 바뀐 「느낌」은
 * 화면 전체를 물들이는 DOM 오버레이(각 화면의 .hunt-light)가 따로 낸다.
 *
 * /trial(ColorHuntScene)과 /interrogation(HallScene)이 같이 쓴다 — 상태는 huntState 하나다.
 */
import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { HUNT_BOARD, HUNT_ORB_R, HUNT_ORB_Y } from '@/world/mp/constants';
import type { ColorOrb } from '@/world/mp/protocol';
import { huntState } from './huntState';

const MAX = 96;
const dummy = new THREE.Object3D();

/** 바닥에 흩어진 구슬들 — 인스턴스 하나로 전부. 색은 프레임마다 huntState 에서 */
export function HuntOrbs() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const out = useMemo<ColorOrb[]>(() => [], []);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const n = Math.min(MAX, huntState.orbsInto(out));
    for (let i = 0; i < n; i += 1) {
      dummy.position.set(out[i].x, HUNT_ORB_Y, out[i].z);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, color.set(out[i].c));
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} frustumCulled={false}>
      <sphereGeometry args={[HUNT_ORB_R, 14, 10]} />
      <meshBasicMaterial color="#ffffff" />
    </instancedMesh>
  );
}

const TILE_W = 0.44;
const TILE_H = 0.34;
const GAP = 0.08;

/**
 * 색 견본판 — 7색의 라벨과 「지금 조명에서 그 색이 어떻게 보이는가」. 사람이 푸는 세 갈래 중
 * 하나다 (docs/COLORHUNT.md §5-③): 조명이 바뀌면 여기 와서 대조한다. HUD 의 목표 스와치는
 * 원색이고 이 판은 조명색이다 — 그 대비가 「조명이 색을 바꿨다」를 말없이 가르친다.
 */
export function SampleBoard() {
  const [board, setBoard] = useState<readonly { name: string; c: string }[]>([]);
  const seen = useRef(-1);

  // 조명 전환은 드물다(판당 2번) — 버전이 바뀐 프레임에만 리렌더한다
  useFrame(() => {
    if (huntState.boardVersion() !== seen.current) {
      seen.current = huntState.boardVersion();
      setBoard([...huntState.boardView()]);
    }
  });

  if (!board.length) return null;
  const w = board.length * (TILE_W + GAP) + GAP;

  return (
    <group position={[HUNT_BOARD.x, 0, HUNT_BOARD.z]} rotation-y={Math.PI}>
      {/* 등판과 다리 — 로우폴리, 어두운 무광 */}
      <mesh position={[0, 1.32, -0.03]}>
        <boxGeometry args={[w, 0.72, 0.05]} />
        <meshStandardMaterial color="#20242c" roughness={0.9} />
      </mesh>
      {[-w / 2 + 0.1, w / 2 - 0.1].map((x) => (
        <mesh key={x} position={[x, 0.5, -0.03]}>
          <boxGeometry args={[0.07, 1.0, 0.07]} />
          <meshStandardMaterial color="#33383f" roughness={0.9} />
        </mesh>
      ))}
      {board.map((b, i) => {
        const x = -w / 2 + GAP + TILE_W / 2 + i * (TILE_W + GAP);
        return (
          <group key={b.name} position={[x, 1.4, 0]}>
            {/* 타일 — 서버가 곱한 표시색. 조명이 바뀌면 여기가 같이 바뀐다 */}
            <mesh>
              <boxGeometry args={[TILE_W, TILE_H, 0.03]} />
              <meshBasicMaterial color={b.c} />
            </mesh>
            <Html position={[0, -0.3, 0.03]} center distanceFactor={6} zIndexRange={[10, 0]}>
              <div
                style={{
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--linen, #e8e2d4)',
                  textShadow: '0 1px 6px rgba(0,0,0,0.9)',
                }}
              >
                {b.name}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

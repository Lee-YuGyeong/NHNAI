/**
 * 낙하 생존의 낙하물 — 서버 스냅샷(fallState)을 프레임마다 보간해 그린다. 인스턴스 하나로 전부.
 * 마당(FALL_ARENA)의 테두리도 여기서 그린다 — 밖으로 나가면 기록이 안 남으므로 발밑에 선이 보여야 한다.
 * 맞았을 때의 붉은 번쩍임은 DOM 쪽(InterrogationFeature 의 .hitflash)이 한다 — 카메라에 붙이는 것보다 싸다.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FALL_ARENA, FALL_BALLS } from '@/world/mp/constants';
import { fallState } from './fallState';

const MAX = 64;
const dummy = new THREE.Object3D();
const KIND_COLORS = ['#e2782a', '#e8e8e8', '#f3f0e6', '#ffe66d', '#2a2a36'];

export function FallObjects() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const poses = useMemo(() => Array.from({ length: MAX }, () => ({ x: 0, y: 0, z: 0, k: 0 })), []);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const n = Math.min(MAX, fallState.poses(poses));
    for (let i = 0; i < n; i += 1) {
      const ball = FALL_BALLS[poses[i].k] ?? FALL_BALLS[0];
      dummy.position.set(poses[i].x, poses[i].y, poses[i].z);
      dummy.scale.setScalar(ball.r);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, color.set(KIND_COLORS[poses[i].k] ?? KIND_COLORS[0]));
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  const w = FALL_ARENA.maxX - FALL_ARENA.minX;
  const d = FALL_ARENA.maxZ - FALL_ARENA.minZ;
  const cx = (FALL_ARENA.maxX + FALL_ARENA.minX) / 2;
  const cz = (FALL_ARENA.maxZ + FALL_ARENA.minZ) / 2;

  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} frustumCulled={false} castShadow>
        <sphereGeometry args={[1, 18, 14]} />
        <meshStandardMaterial color="#ffffff" emissive="#ff6a2a" emissiveIntensity={0.25} roughness={0.5} metalness={0.2} />
      </instancedMesh>
      {/* 마당 테두리 */}
      <lineSegments position={[cx, 0.03, cz]}>
        <edgesGeometry args={[new THREE.BoxGeometry(w, 0.001, d)]} />
        <lineBasicMaterial color="#ffb347" />
      </lineSegments>
      <pointLight position={[cx, 6, cz]} color="#ffb347" intensity={40} distance={20} decay={2} />
    </group>
  );
}

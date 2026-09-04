/**
 * 움직이는 플랫폼의 발판 열 — 프레임마다 platformState 로 자리를 계산해 그린다 (서버와 같은 식, 스냅샷 없음).
 *
 *   발판   Tripo Studio 의 hover_pad(공중 부양 팔각 발판, tools/platform-parts.json) — 지름 PAD_R×2 로 세우고
 *          윗면에 착지 표적(캔버스: 중앙 원 PAD_CENTER_R + 바깥 테 PAD_R)을 얹는다. 테는 발광 — 어두운 홀에서 발판 가장자리가 읽혀야 뛴다
 *   출발·도착 발판 옆에 비콘(pad_beacon) 하나씩
 *   마당 테두리 — 낙하 생존과 같은 앰버 선 (PLATFORM_ARENA)
 *
 * 발판 밑의 추진기 불빛은 발광 재질(점광원 없음 — 홀의 광원 예산). 발판이 움직이는 것 자체가 이 게임의 전부라 따로 애니메이션은 없다.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GlbPart } from '@/world/map/corridor/part';
import { useShapedMaterial } from '@/world/map/scifi';
import { PADS, PAD_CENTER_R, PAD_R, PAD_TOP, PLATFORM_ARENA } from '@/world/mp/platform';
import { platformState } from './platformState';

/** 발판 모델 — 지름 1 · 높이 0.345 (tools/glb-preview). 윗면이 PAD_TOP 에 오게 발밑을 그만큼 내린다 */
const PAD_MODEL_H = 0.345;
const PAD_FIT = { x: PAD_R * 2 } as const;
const PAD_LIFT = PAD_TOP - PAD_MODEL_H * (PAD_R * 2);

const EDGE_MAT = new THREE.MeshBasicMaterial({ color: '#ffca8e', transparent: true, opacity: 0.55 });
/** 발판 테 — 청록 발광 링 (움직이는 것은 정지 발판보다 밝다) */
const RIM_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color('#5fd8ff').multiplyScalar(1.1), toneMapped: false });
const RIM_STATIC_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color('#9ec9d8').multiplyScalar(0.7), toneMapped: false });
/** 추진기 불빛 — 발판 밑 */
const THRUST_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color('#7fb8ff').multiplyScalar(0.9), toneMapped: false, transparent: true, opacity: 0.7 });

/** 착지 표적 — 가운데 원(정중앙)과 반지름 눈금. 한 번만 그린다 */
let targetTex: THREE.Texture | null = null;
function targetTexture(): THREE.Texture | null {
  if (targetTex) return targetTex;
  if (typeof document === 'undefined') return null;
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  if (!g) return null;
  g.clearRect(0, 0, S, S);
  const c = S / 2;
  const r = (m: number) => (m / PAD_R) * (S / 2);
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(200,235,255,0.45)';
  for (const m of [0.5, 0.75]) {
    g.beginPath();
    g.arc(c, c, r(m), 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = 'rgba(120,220,255,0.28)';
  g.beginPath();
  g.arc(c, c, r(PAD_CENTER_R), 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(160,240,255,0.9)';
  g.beginPath();
  g.arc(c, c, r(PAD_CENTER_R), 0, Math.PI * 2);
  g.stroke();
  // 십자선
  g.strokeStyle = 'rgba(200,235,255,0.5)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(c - r(0.18), c);
  g.lineTo(c + r(0.18), c);
  g.moveTo(c, c - r(0.18));
  g.lineTo(c, c + r(0.18));
  g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  targetTex = t;
  return t;
}

function Pad({ k }: { k: number }) {
  const group = useRef<THREE.Group>(null);
  const mat = useShapedMaterial('hover_pad');
  const moving = PADS[k].amp > 0;
  const target = useMemo(() => {
    const tex = targetTexture();
    return new THREE.MeshBasicMaterial({ map: tex ?? undefined, transparent: true, depthWrite: false, toneMapped: false, opacity: tex ? 1 : 0 });
  }, []);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const p = platformState.pad(k);
    g.position.set(p.x, 0, p.z);
  });
  return (
    <group ref={group}>
      <GlbPart id="hover_pad" fit={PAD_FIT} position={[0, PAD_LIFT, 0]} material={mat} receiveShadow={false} />
      {/* 착지 표적 — 윗면 살짝 위 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, PAD_TOP + 0.012, 0]} material={target}>
        <circleGeometry args={[PAD_R, 48]} />
      </mesh>
      {/* 발광 테 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, PAD_TOP + 0.02, 0]} material={moving ? RIM_MAT : RIM_STATIC_MAT}>
        <ringGeometry args={[PAD_R - 0.05, PAD_R, 48]} />
      </mesh>
      {/* 추진기 불빛 — 밑면 */}
      <mesh rotation-x={Math.PI / 2} position={[0, PAD_LIFT + 0.02, 0]} material={THRUST_MAT}>
        <ringGeometry args={[PAD_R * 0.25, PAD_R * 0.45, 32]} />
      </mesh>
    </group>
  );
}

function ArenaEdge() {
  const w = PLATFORM_ARENA.maxX - PLATFORM_ARENA.minX;
  const d = PLATFORM_ARENA.maxZ - PLATFORM_ARENA.minZ;
  const cx = (PLATFORM_ARENA.minX + PLATFORM_ARENA.maxX) / 2;
  const cz = (PLATFORM_ARENA.minZ + PLATFORM_ARENA.maxZ) / 2;
  return (
    <group position={[cx, 0.02, cz]}>
      <mesh position={[0, 0, -d / 2]} material={EDGE_MAT}>
        <boxGeometry args={[w, 0.005, 0.08]} />
      </mesh>
      <mesh position={[0, 0, d / 2]} material={EDGE_MAT}>
        <boxGeometry args={[w, 0.005, 0.08]} />
      </mesh>
      <mesh position={[-w / 2, 0, 0]} material={EDGE_MAT}>
        <boxGeometry args={[0.08, 0.005, d]} />
      </mesh>
      <mesh position={[w / 2, 0, 0]} material={EDGE_MAT}>
        <boxGeometry args={[0.08, 0.005, d]} />
      </mesh>
    </group>
  );
}

export function PlatformCourse() {
  const beaconMat = useShapedMaterial('pad_beacon');
  const first = PADS[0];
  const last = PADS[PADS.length - 1];
  return (
    <group name="움직이는 플랫폼">
      {PADS.map((p) => (
        <Pad key={p.k} k={p.k} />
      ))}
      {/* 출발·도착 비콘 — 발판 옆 바닥 */}
      <GlbPart id="pad_beacon" fit={{ y: 1.3 }} position={[PAD_R + 0.9, 0, first.z]} material={beaconMat} receiveShadow={false} />
      <GlbPart id="pad_beacon" fit={{ y: 1.3 }} position={[-(PAD_R + 0.9), 0, last.z]} material={beaconMat} receiveShadow={false} />
      <ArenaEdge />
      {/* 마당 위 작업등 — 발판 열 가운데 */}
      <pointLight position={[0, 7.5, (first.z + last.z) / 2]} color="#dfe9ff" intensity={55} distance={24} decay={2} />
    </group>
  );
}

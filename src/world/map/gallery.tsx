/**
 * 갤러리 홀 — 3D 월드의 배경. 검은 대리석 바닥 · 다크 우드 슬랫 벽 · 금빛 라인 조명.
 *
 * 사진 한 장을 판때기에 붙이는 게 아니라 방을 **실제로 짓는다**.
 * 바닥·벽·박공 천장·기둥·액자·화분이 전부 별개의 메시라 카메라가 움직이면 시차가 생긴다.
 *
 * 텍스처 파일은 없다 — 대리석 결은 캔버스로 즉석에서 그린다 (marbleTexture).
 * 나무 슬랫은 InstancedMesh 하나로 6백 개를 그린다.
 *
 * 여기에는 **씬만 있다.** 캔버스·카메라·이동·네트워크는 scene/WorldScene.tsx 가 쥔다.
 * 치수는 mp/constants.ts 의 WORLD 와 같은 좌표계다 (WORLD 는 아래 ROOM 을 0.6 인셋한 값).
 * 가구를 옮기면 mp/collide.ts 의 COLLIDERS 도 같이 옮긴다.
 */

import { useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial, RoundedBox } from '@react-three/drei';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { groundHeightAt, resolveCollisions } from '../mp/collide';

/* ─────────────────────────── 홀 치수 (월드 단위 ≈ m) ─────────────────────────── */

const ROOM = {
  width: 22,
  /** z 범위: -14(포털 벽) ~ 6(등 뒤 벽) */
  back: -14,
  front: 6,
  /** 처마 높이. 여기까지가 벽, 위는 박공 천장 */
  eave: 5.6,
  /** 용마루 높이 */
  ridge: 8.8,
};
const DEPTH = ROOM.front - ROOM.back;
const MID_Z = (ROOM.front + ROOM.back) / 2;
const HALF_W = ROOM.width / 2;
const RISE = ROOM.ridge - ROOM.eave;
const SLOPE_ANGLE = Math.atan2(RISE, HALF_W);
const SLOPE_LEN = Math.hypot(HALF_W, RISE);

/* ─────────────────────────────── 팔레트 ─────────────────────────────── */

const WOOD = '#2c1f15';
const WOOD_LIGHT = '#4a3522';
const STONE = '#0a0908';
const GOLD = '#c9a25c';
/** 발광 라인. toneMapped 를 끄고 쓴다 — ACES 를 거치지 않아야 금빛이 하얗게 날아가지 않는다 */
const GOLD_LIGHT = '#ffd58a';
const LEATHER = '#141110';

/* ─────────────────────────────── 대리석 텍스처 ─────────────────────────────── */

/** 결정적 난수 — 새로고침마다 결이 바뀌면 방이 다른 방처럼 보인다 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 검은 대리석 — 캔버스에 흰·금빛 결을 몇 가닥 긋는다. 반복 타일이라 가장자리는 이어지지 않아도 잘 안 보인다 */
function marbleTexture(seed: number, veinTint: string, size = 1024): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const rnd = mulberry32(seed);

  g.fillStyle = STONE;
  g.fillRect(0, 0, size, size);

  // 흐릿한 얼룩 — 완전한 검정이면 플라스틱처럼 보인다
  for (let i = 0; i < 18; i += 1) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 80 + rnd() * 220;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(60,54,48,${0.05 + rnd() * 0.07})`);
    grad.addColorStop(1, 'rgba(60,54,48,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // 결 — 굵은 가닥 몇 개 + 잔가닥
  g.lineCap = 'round';
  const vein = (width: number, alpha: number, len: number) => {
    let x = rnd() * size;
    let y = rnd() * size;
    let ang = rnd() * Math.PI * 2;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < len; s += 1) {
      ang += (rnd() - 0.5) * 0.9;
      const step = 8 + rnd() * 14;
      const cx = x + Math.cos(ang) * step;
      const cy = y + Math.sin(ang) * step;
      ang += (rnd() - 0.5) * 0.9;
      x = cx + Math.cos(ang) * step;
      y = cy + Math.sin(ang) * step;
      g.quadraticCurveTo(cx, cy, x, y);
    }
    g.strokeStyle = veinTint.replace('ALPHA', String(alpha));
    g.lineWidth = width;
    g.stroke();
  };
  g.filter = 'blur(1.2px)';
  for (let i = 0; i < 5; i += 1) vein(1.6 + rnd() * 1.8, 0.35 + rnd() * 0.3, 40 + Math.floor(rnd() * 40));
  g.filter = 'blur(0.4px)';
  for (let i = 0; i < 16; i += 1) vein(0.5 + rnd() * 0.7, 0.12 + rnd() * 0.18, 12 + Math.floor(rnd() * 24));
  g.filter = 'none';

  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** 구운 텍스처 캐시. 기둥 10개가 같은 결을 쓰는데 각자 1024² 캔버스를 굽고 올리면 그것만으로 수백 ms 다 */
const marbleCache = new Map<string, THREE.Texture>();

function useMarble(seed: number, repeatX: number, repeatY: number, tint = 'rgba(214,196,168,ALPHA)', size = 512) {
  return useMemo(() => {
    const key = `${seed}|${tint}|${size}|${repeatX}|${repeatY}`;
    let t = marbleCache.get(key);
    if (!t) {
      t = marbleTexture(seed, tint, size);
      t.repeat.set(repeatX, repeatY);
      marbleCache.set(key, t);
    }
    return t;
  }, [seed, repeatX, repeatY, tint, size]);
}

/* ─────────────────────────────── 건물 ─────────────────────────────── */

/** 바닥·벽·천장·기둥·액자·화분. reflective 를 끄면 바닥이 평범한 대리석이 된다 (모바일) */
export function Gallery({ reflective = true }: { reflective?: boolean }) {
  return (
    <group>
      <Floor reflective={reflective} />
      <Ceiling />

      {/* 좌우 벽 — 슬랫 · 코브 조명 · 기둥 */}
      <SlatWall side={-1} />
      <SlatWall side={1} />

      {/* 등 뒤 벽 */}
      <group position={[0, 0, ROOM.front]} rotation-y={Math.PI}>
        <Slats width={ROOM.width} height={ROOM.eave} />
        <mesh position={[0, ROOM.eave + RISE / 2, -0.02]}>
          <planeGeometry args={[ROOM.width, RISE + 0.2]} />
          <meshStandardMaterial color={WOOD} roughness={0.9} />
        </mesh>
        <LightBar width={ROOM.width - 0.4} position={[0, ROOM.eave - 0.05, 0.12]} />
        <Sconce position={[-6, 3.2, 0.14]} />
        <Sconce position={[6, 3.2, 0.14]} />
      </group>

      {/* 안쪽 벽 — 포털 */}
      <group position={[0, 0, ROOM.back]}>
        <Slats width={ROOM.width} height={ROOM.eave} />
        <mesh position={[0, ROOM.eave + RISE / 2, 0.02]}>
          <planeGeometry args={[ROOM.width, RISE + 0.2]} />
          <meshStandardMaterial color={WOOD} roughness={0.9} />
        </mesh>
        <Pilaster x={-4.6} />
        <Pilaster x={4.6} />
        <Portal />
      </group>

      {/* 액자 — 벽마다 둘 */}
      <WavePanel side={-1} z={-8.5} seed={1} />
      <WavePanel side={-1} z={-0.5} seed={2} />
      <WavePanel side={1} z={-8.5} seed={3} />
      <WavePanel side={1} z={-0.5} seed={4} />

      {/* 벽 아래 화분 (충돌 박스는 mp/collide.ts) */}
      {[-12.2, -4.5, 3.2].map((z) => (
        <group key={z}>
          <Planter position={[-(HALF_W - 0.75), 0, z]} seed={z} />
          <Planter position={[HALF_W - 0.75, 0, z]} seed={z + 100} />
        </group>
      ))}
    </group>
  );
}

function Floor({ reflective }: { reflective: boolean }) {
  const marble = useMarble(7, ROOM.width / 6, DEPTH / 6, undefined, 1024);
  const inlay = GOLD_LIGHT;
  // 중앙 통로 양쪽에 금 인레이 라인. 살짝 띄워 z-fighting 을 피한다
  const lanes = [-4.2, 4.2];

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, MID_Z]} receiveShadow>
        <planeGeometry args={[ROOM.width, DEPTH]} />
        {reflective ? (
          <MeshReflectorMaterial
            map={marble}
            color="#3a3532"
            blur={[200, 60]}
            resolution={384}
            mixBlur={0.9}
            mixStrength={1.6}
            mixContrast={1}
            roughness={0.55}
            metalness={0.15}
            depthScale={0.9}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.6}
            mirror={0.35}
          />
        ) : (
          <meshStandardMaterial map={marble} color="#3a3532" roughness={0.35} metalness={0.2} />
        )}
      </mesh>

      {lanes.map((x) => (
        <group key={x}>
          <mesh position={[x, 0.006, MID_Z]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[0.05, DEPTH]} />
            <meshBasicMaterial color={inlay} toneMapped={false} />
          </mesh>
          <mesh position={[x * 1.045, 0.006, MID_Z]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[0.02, DEPTH]} />
            <meshBasicMaterial color={GOLD} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* 벽 밑 라인 — 바닥에서 올라오는 빛 */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (HALF_W - 0.25), 0.012, MID_Z]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.06, DEPTH]} />
          <meshBasicMaterial color={inlay} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** 박공 천장 — 어두운 나무 널 + 서까래. 안쪽에서 올려다보므로 DoubleSide */
function Ceiling() {
  const y = (ROOM.eave + ROOM.ridge) / 2;
  const rafterZs = useMemo(() => Array.from({ length: 9 }, (_, i) => ROOM.back + 2 + i * 2), []);

  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s} position={[(s * HALF_W) / 2, y, MID_Z]} rotation-z={-s * SLOPE_ANGLE}>
          <mesh rotation-x={Math.PI / 2}>
            <planeGeometry args={[SLOPE_LEN, DEPTH]} />
            <meshStandardMaterial color="#120d0a" roughness={1} side={THREE.DoubleSide} />
          </mesh>
          {/* 경사면을 따라 달리는 금 라인 — 소실점으로 모이는 선 */}
          {[0.28, 0.6].map((f) => (
            <mesh key={f} rotation-x={Math.PI / 2} position={[(f - 0.5) * SLOPE_LEN, -0.01, 0]}>
              <planeGeometry args={[0.02, DEPTH]} />
              <meshBasicMaterial color={GOLD} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
          ))}
        </group>
      ))}

      {/* 용마루 라인 */}
      <mesh position={[0, ROOM.ridge - 0.03, MID_Z]}>
        <boxGeometry args={[0.08, 0.06, DEPTH]} />
        <meshBasicMaterial color={GOLD_LIGHT} toneMapped={false} />
      </mesh>

      <Rafters zs={rafterZs} y={y - 0.1} />
    </group>
  );
}

/** 서까래 — 나무 보 + 밑면 금 테. 각각 InstancedMesh 하나 (드로우콜 2개) */
function Rafters({ zs, y }: { zs: number[]; y: number }) {
  const wood = useRef<THREE.InstancedMesh>(null);
  const gold = useRef<THREE.InstancedMesh>(null);
  const count = zs.length * 2;

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const axis = new THREE.Vector3(0, 0, 1);
    let i = 0;
    for (const z of zs) {
      for (const s of [-1, 1]) {
        q.setFromAxisAngle(axis, -s * SLOPE_ANGLE);
        pos.set((s * HALF_W) / 2, y, z);
        wood.current?.setMatrixAt(i, m.compose(pos, q, one));
        // 금 테는 보의 로컬 -y 로 0.11 내려간 자리 — 회전을 태워야 경사면을 따라간다
        pos.add(new THREE.Vector3(0, -0.11, 0).applyQuaternion(q));
        gold.current?.setMatrixAt(i, m.compose(pos, q, one));
        i += 1;
      }
    }
    if (wood.current) wood.current.instanceMatrix.needsUpdate = true;
    if (gold.current) gold.current.instanceMatrix.needsUpdate = true;
  }, [zs, y]);

  return (
    <group>
      <instancedMesh ref={wood} args={[undefined, undefined, count]}>
        <boxGeometry args={[SLOPE_LEN, 0.2, 0.14]} />
        <meshStandardMaterial color={WOOD} roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={gold} args={[undefined, undefined, count]}>
        <boxGeometry args={[SLOPE_LEN, 0.01, 0.15]} />
        <meshStandardMaterial color={GOLD} roughness={0.3} metalness={0.9} />
      </instancedMesh>
    </group>
  );
}

/** 세로 나무 슬랫 한 면. 원점이 면의 아래·가운데, 정면이 +z */
function Slats({ width, height, pitch = 0.11, thickness = 0.05, seedOffset = 0 }: { width: number; height: number; pitch?: number; thickness?: number; seedOffset?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = Math.floor(width / pitch);

  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const rnd = mulberry32(31 + seedOffset);
    const mat = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const x = -width / 2 + pitch / 2 + i * pitch;
      // 슬랫마다 깊이를 살짝 다르게 — 빛이 고르게 닿지 않아 결이 산다
      const d = thickness * (0.7 + rnd() * 0.6);
      mat.makeScale(1, 1, d / thickness);
      mat.setPosition(x, height / 2, d / 2);
      m.setMatrixAt(i, mat);
      color.set(rnd() > 0.5 ? WOOD : WOOD_LIGHT).offsetHSL(0, 0, (rnd() - 0.5) * 0.04);
      m.setColorAt(i, color);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [count, width, height, pitch, thickness, seedOffset]);

  return (
    <group>
      {/* 슬랫 뒤의 바탕판 */}
      <mesh position={[0, height / 2, -0.01]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#0c0907" roughness={1} />
      </mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, count]} receiveShadow>
        <boxGeometry args={[pitch * 0.62, height, thickness]} />
        <meshStandardMaterial color={WOOD} roughness={0.55} metalness={0.12} />
      </instancedMesh>
    </group>
  );
}

/** 좌우 벽 — 슬랫 + 위아래 코브 라인 + 기둥 + 브래킷 등 */
function SlatWall({ side }: { side: -1 | 1 }) {
  return (
    <group position={[side * HALF_W, 0, MID_Z]} rotation-y={side < 0 ? Math.PI / 2 : -Math.PI / 2}>
      <Slats width={DEPTH} height={ROOM.eave} seedOffset={side * 7} />
      {/* 처마 밑 코브 조명 — 라인 + 벽을 핥는 점광원 둘. 브래킷 등·액자·화분은 광원 없이 발광 메시만이다 */}
      <LightBar width={DEPTH} position={[0, ROOM.eave - 0.06, 0.12]} />
      {[-4.5, 4.5].map((x) => (
        <pointLight key={x} position={[x, ROOM.eave - 0.5, 1.2]} intensity={34} distance={14} decay={1.7} color="#ffc27a" />
      ))}
      {/* 기둥 — 검은 대리석 필라스터 */}
      {[-7.5, -2.5, 2.5, 7.5].map((x) => (
        <Pilaster key={x} x={x} />
      ))}
      {/* 브래킷 등 (세로 금빛 막대) */}
      {[-5, 0, 5].map((x) => (
        <Sconce key={x} position={[x, 3.2, 0.16]} />
      ))}
    </group>
  );
}

/** 벽에 붙는 얇은 검은 대리석 기둥. 로컬 정면 +z */
function Pilaster({ x }: { x: number }) {
  const marble = useMarble(3, 1, 4, 'rgba(230,214,190,ALPHA)');
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, ROOM.eave / 2, 0.22]} castShadow>
        <boxGeometry args={[0.7, ROOM.eave, 0.44]} />
        <meshStandardMaterial map={marble} color="#4a4540" roughness={0.3} metalness={0.15} />
      </mesh>
      {/* 모서리 금 라인 */}
      {[-0.36, 0.36].map((dx) => (
        <mesh key={dx} position={[dx, ROOM.eave / 2, 0.44]}>
          <boxGeometry args={[0.015, ROOM.eave, 0.015]} />
          <meshBasicMaterial color={GOLD} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** 수평 발광 라인 — 코브 조명의 실체. 위에 살짝 그림자 턱을 얹어 "숨은 조명"처럼 보인다 */
function LightBar({ width, position }: { width: number; position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[width, 0.03, 0.06]} />
        <meshBasicMaterial color={GOLD_LIGHT} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.07, 0.03]}>
        <boxGeometry args={[width, 0.1, 0.16]} />
        <meshStandardMaterial color={WOOD} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** 세로 금빛 브래킷 등 — 사진의 양쪽 벽에 걸린 것. 점광원을 품는다 */
function Sconce({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.06, 1.4, 0.06]} />
        <meshBasicMaterial color={GOLD_LIGHT} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[0.12, 1.5, 0.05]} />
        <meshStandardMaterial color={GOLD} roughness={0.35} metalness={0.9} />
      </mesh>
    </group>
  );
}

/* ─────────────────────────────── 포털 · 액자 ─────────────────────────────── */

/** 포털 치수 — 안쪽 벽 한가운데의 큰 액자 */
const PORTAL = { w: 7.2, h: 6.4, y: 3.6, z: ROOM.back + 0.3 };

/** 포털 한가운데. **들어오면 이 점을 보고 시작한다** (WorldScene 의 LocalRig). */
export const FOCUS = { x: 0, y: PORTAL.y, z: PORTAL.z } as const;

/** 안쪽 벽의 포털 — 검은 유리 위에 황금 호가 겹겹이. 사진의 정면 액자 */
function Portal() {
  const arcs = useMemo(() => {
    // 왼쪽 아래를 중심으로 하는 동심원 호. 오른쪽 위를 향해 벌어진다
    const pts: number[] = [];
    const cx = -PORTAL.w * 0.2;
    const cy = -PORTAL.h * 0.35;
    const segs = 64;
    for (let i = 0; i < 26; i += 1) {
      const r = 1.2 + i * 0.26;
      const a0 = Math.PI * 0.02;
      const a1 = Math.PI * 0.62;
      for (let s = 0; s < segs; s += 1) {
        const t0 = a0 + ((a1 - a0) * s) / segs;
        const t1 = a0 + ((a1 - a0) * (s + 1)) / segs;
        const x0 = cx + Math.cos(t0) * r;
        const y0 = cy + Math.sin(t0) * r;
        const x1 = cx + Math.cos(t1) * r;
        const y1 = cy + Math.sin(t1) * r;
        // 액자 밖으로 나가는 구간은 자른다
        const inside = (x: number, y: number) => Math.abs(x) < PORTAL.w / 2 - 0.15 && Math.abs(y) < PORTAL.h / 2 - 0.15;
        if (inside(x0, y0) && inside(x1, y1)) pts.push(x0, y0, 0, x1, y1, 0);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return geo;
  }, []);

  const glow = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (glow.current) glow.current.intensity = 34 + Math.sin(clock.getElapsedTime() * 0.8) * 4;
  });

  return (
    <group position={[0, PORTAL.y, 0.3]}>
      {/* 액자 틀 — 금 */}
      <Frame w={PORTAL.w} h={PORTAL.h} depth={0.32} bar={0.12} />
      {/* 유리 — 어두운 반사판 */}
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[PORTAL.w, PORTAL.h]} />
        <meshStandardMaterial color="#050505" roughness={0.12} metalness={0.7} />
      </mesh>
      <lineSegments geometry={arcs} position={[0, 0, 0.05]}>
        <lineBasicMaterial color={GOLD_LIGHT} toneMapped={false} transparent opacity={0.85} />
      </lineSegments>
      <WaveDots w={PORTAL.w - 0.5} h={PORTAL.h - 0.6} count={[150, 12]} amp={0.9} seed={9} position={[0, -0.6, 0.06]} />
      <pointLight ref={glow} position={[0, 0.4, 3.2]} intensity={34} distance={18} decay={1.6} color="#e8b76a" />
    </group>
  );
}

/** 좌우 벽의 액자 — 금 파티클 웨이브 아트 + 위에서 쏘는 작은 빛 */
function WavePanel({ side, z, seed }: { side: -1 | 1; z: number; seed: number }) {
  const w = 5.2;
  const h = 2.3;
  const y = 3.0;
  return (
    <group position={[side * (HALF_W - 0.34), y, z]} rotation-y={side < 0 ? Math.PI / 2 : -Math.PI / 2}>
      <Frame w={w} h={h} depth={0.18} bar={0.08} />
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color="#060606" roughness={0.15} metalness={0.6} />
      </mesh>
      <WaveDots w={w - 0.4} h={h - 0.4} count={[120, 9]} amp={0.5} seed={seed} position={[0, 0, 0.05]} />
      {/* 액자 위 스포트 — 벽을 살짝 핥는다 */}
      <mesh position={[0, h / 2 + 0.16, 0.14]}>
        <boxGeometry args={[w, 0.03, 0.05]} />
        <meshBasicMaterial color={GOLD_LIGHT} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** 금 액자 틀. 로컬 정면 +z, 원점이 액자 중심 */
function Frame({ w, h, depth, bar }: { w: number; h: number; depth: number; bar: number }) {
  return (
    <group>
      <mesh position={[0, 0, -depth / 2]}>
        <boxGeometry args={[w + bar * 2, h + bar * 2, depth]} />
        <meshStandardMaterial color="#0b0a09" roughness={0.6} />
      </mesh>
      {[
        [0, h / 2 + bar / 2, w + bar * 2, bar],
        [0, -h / 2 - bar / 2, w + bar * 2, bar],
        [-w / 2 - bar / 2, 0, bar, h],
        [w / 2 + bar / 2, 0, bar, h],
      ].map(([x, y, bw, bh]) => (
        <mesh key={`${x}${y}`} position={[x, y, 0.03]}>
          <boxGeometry args={[bw, bh, 0.06]} />
          <meshStandardMaterial color={GOLD} roughness={0.28} metalness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/** 금 점으로 그린 파도 — 점 하나하나가 셰이더에서 움직인다. 사진 액자 속 파티클 웨이브 */
function WaveDots({
  w,
  h,
  count,
  amp,
  seed,
  position,
}: {
  w: number;
  h: number;
  count: [number, number];
  amp: number;
  seed: number;
  position: [number, number, number];
}) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const [nx, ny] = count;

  const geometry = useMemo(() => {
    const rnd = mulberry32(seed * 977);
    const n = nx * ny;
    const grid = new Float32Array(n * 2);
    const jitter = new Float32Array(n);
    const pos = new Float32Array(n * 3);
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const k = j * nx + i;
        grid[k * 2] = i / (nx - 1);
        grid[k * 2 + 1] = j / (ny - 1);
        jitter[k] = rnd();
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aGrid', new THREE.BufferAttribute(grid, 2));
    g.setAttribute('aJitter', new THREE.BufferAttribute(jitter, 1));
    // 위치는 셰이더가 정하므로 바운딩은 액자 크기로 못 박는다 — 안 그러면 프러스텀 컬링이 통째로 자른다
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), Math.hypot(w, h));
    return g;
  }, [nx, ny, seed, w, h]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSize: { value: new THREE.Vector2(w, h) },
      uAmp: { value: amp },
      uSeed: { value: seed },
      uColor: { value: new THREE.Color(GOLD_LIGHT) },
      uHalfH: { value: 450 },
    }),
    [w, h, amp, seed],
  );

  useFrame(({ clock, size, gl }) => {
    const m = material.current;
    if (!m) return;
    m.uniforms.uTime.value = clock.getElapsedTime();
    m.uniforms.uHalfH.value = (size.height * gl.getPixelRatio()) / 2;
  });

  return (
    <points geometry={geometry} position={position} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        vertexShader={/* glsl */ `
          attribute vec2 aGrid;
          attribute float aJitter;
          uniform float uTime;
          uniform vec2 uSize;
          uniform float uAmp;
          uniform float uSeed;
          uniform float uHalfH;
          varying float vAlpha;
          void main() {
            float u = aGrid.x;
            float v = aGrid.y;
            float x = (u - 0.5) * uSize.x;
            // 두 개의 파도를 겹친다. v 는 파도의 두께 방향 — 가운데가 밝고 가장자리가 흐리다
            float wave = sin(u * 7.0 + uTime * 0.6 + uSeed) * 0.55
                       + sin(u * 13.0 - uTime * 0.35 + uSeed * 2.0) * 0.25
                       + sin(u * 2.3 + uTime * 0.2) * 0.2;
            float spread = 0.25 + 0.55 * (0.5 + 0.5 * sin(u * 4.0 + uSeed));
            float y = wave * uAmp + (v - 0.5) * uSize.y * spread;
            float z = (aJitter - 0.5) * 0.08;
            vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
            gl_Position = projectionMatrix * mv;
            float edge = 1.0 - abs(v - 0.5) * 2.0;
            float twinkle = 0.55 + 0.45 * sin(uTime * (1.5 + aJitter * 3.0) + aJitter * 40.0);
            vAlpha = edge * edge * twinkle * (0.3 + 0.7 * aJitter) * 0.9;
            // 월드 단위 지름 0.045~0.095m. 멀어지면 작아진다
            gl_PointSize = (0.045 + aJitter * 0.05) * uHalfH / max(-mv.z, 0.5);
          }
        `}
        fragmentShader={/* glsl */ `
          uniform vec3 uColor;
          varying float vAlpha;
          void main() {
            vec2 c = gl_PointCoord - 0.5;
            float d = 1.0 - smoothstep(0.15, 0.5, length(c));
            gl_FragColor = vec4(uColor * 1.15, d * vAlpha);
          }
        `}
      />
    </points>
  );
}

/* ─────────────────────────────── 소품 ─────────────────────────────── */

/** 검은 대리석 화분 + 어두운 잎. 벽 아래에서 위로 쏘는 빛이 잎을 비춘다 */
function Planter({ position, seed }: { position: [number, number, number]; seed: number }) {
  const leaves = useMemo(() => {
    const rnd = mulberry32(Math.floor(seed * 13) + 5);
    return Array.from({ length: 14 }, () => ({
      x: (rnd() - 0.5) * 0.5,
      z: (rnd() - 0.5) * 1.3,
      y: 0.75 + rnd() * 0.55,
      r: 0.14 + rnd() * 0.2,
      s: 0.6 + rnd() * 0.8,
      tilt: (rnd() - 0.5) * 1.2,
    }));
  }, [seed]);

  return (
    <group position={position}>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.7, 0.6, 1.6]} />
        <meshStandardMaterial color="#0d0c0b" roughness={0.3} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.605, 0]}>
        <boxGeometry args={[0.72, 0.01, 1.62]} />
        <meshStandardMaterial color={GOLD} roughness={0.3} metalness={0.9} />
      </mesh>
      <Leaves leaves={leaves} />
      {/* 업라이트 대용 — 화분 뒤 바닥의 발광 띠 */}
      <mesh position={[0, 0.01, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.9, 1.8]} />
        <meshBasicMaterial color="#5a4325" toneMapped={false} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

function Leaves({ leaves }: { leaves: { x: number; y: number; z: number; r: number; s: number; tilt: number }[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3();
    leaves.forEach((l, i) => {
      e.set(l.tilt, i, l.tilt * 0.5);
      q.setFromEuler(e);
      pos.set(l.x, l.y, l.z);
      // 반지름은 단위 구에 스케일로 싣는다
      sc.set(l.r, l.r * l.s, l.r * 0.35);
      m.setMatrixAt(i, mat.compose(pos, q, sc));
    });
    m.instanceMatrix.needsUpdate = true;
  }, [leaves]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, leaves.length]}>
      <sphereGeometry args={[1, 7, 6]} />
      <meshStandardMaterial color="#1f2e18" roughness={0.9} />
    </instancedMesh>
  );
}

/* ─────────────────────────────── 가구 ─────────────────────────────── */

/** 검은 가죽 벤치 · 대리석 낮은 탁자 · 중앙 좌대. 배치는 mp/collide.ts 의 COLLIDERS 와 같다 */
export function Furniture() {
  return (
    <group>
      <Bench position={[-6.5, 0, -8]} rotation={0.35} />
      <Bench position={[6.5, 0, -8]} rotation={-0.35} />
      <Bench position={[-6.5, 0, 2.5]} rotation={-0.35} />
      <Bench position={[6.5, 0, 2.5]} rotation={0.35} />
      <LowTable position={[-6.3, 0, -2.7]} />
      <LowTable position={[6.3, 0, -2.7]} />
      <Plinth position={[0, 0, -9.8]} />
    </group>
  );
}

function Bench({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      <RoundedBox args={[2.2, 0.22, 0.9]} radius={0.06} position={[0, 0.39, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={LEATHER} roughness={0.55} />
      </RoundedBox>
      <mesh position={[0, 0.14, 0]} castShadow>
        <boxGeometry args={[2.0, 0.28, 0.7]} />
        <meshStandardMaterial color="#0b0a09" roughness={0.3} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.285, 0]}>
        <boxGeometry args={[2.02, 0.012, 0.72]} />
        <meshStandardMaterial color={GOLD} roughness={0.3} metalness={0.9} />
      </mesh>
    </group>
  );
}

function LowTable({ position }: { position: [number, number, number] }) {
  const marble = useMarble(11, 1, 1, 'rgba(230,214,190,ALPHA)');
  return (
    <group position={position}>
      <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.4, 0.08, 0.9]} />
        <meshStandardMaterial map={marble} color="#4a4540" roughness={0.25} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.34, 0]}>
        <boxGeometry args={[1.42, 0.012, 0.92]} />
        <meshStandardMaterial color={GOLD} roughness={0.3} metalness={0.9} />
      </mesh>
      <mesh position={[0, 0.17, 0]} castShadow>
        <boxGeometry args={[1.0, 0.34, 0.5]} />
        <meshStandardMaterial color="#0b0a09" roughness={0.3} metalness={0.2} />
      </mesh>
    </group>
  );
}

/** 중앙 좌대 — 위에 금빛 매듭 조각. 점프로 올라갈 수 있는 높이 */
function Plinth({ position }: { position: [number, number, number] }) {
  const knot = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (knot.current) knot.current.rotation.y = clock.getElapsedTime() * 0.25;
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.475, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.1, 0.95, 1.1]} />
        <meshStandardMaterial color="#0b0a09" roughness={0.3} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.955, 0]}>
        <boxGeometry args={[1.12, 0.012, 1.12]} />
        <meshStandardMaterial color={GOLD} roughness={0.3} metalness={0.9} />
      </mesh>
      <mesh ref={knot} position={[0, 1.55, 0]} castShadow>
        <torusKnotGeometry args={[0.28, 0.08, 96, 12]} />
        <meshStandardMaterial color={GOLD} roughness={0.22} metalness={1} emissive="#3a2a10" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

/* ─────────────────────────────── 조명 ─────────────────────────────── */

/**
 * 전체 조명. 광원은 **8개**로 묶었다 — 벽 점광원 4 · 포털 1 · 스포트 3.
 * 점광원 하나가 늘 때마다 모든 픽셀이 그만큼 더 비싸지고, 반사 바닥이 그걸 한 번 더 그린다.
 */
export function Lights({ flicker }: { flicker: boolean }) {
  const a = useRef<THREE.SpotLight>(null);
  const b = useRef<THREE.SpotLight>(null);

  useFrame(({ clock }) => {
    if (!flicker) return;
    const t = clock.getElapsedTime();
    const n = 1 + (Math.sin(t * 6.1) * 0.5 + Math.sin(t * 2.3) * 0.5) * 0.04;
    if (a.current) a.current.intensity = 110 * n;
    if (b.current) b.current.intensity = 110 * n;
  });

  return (
    <>
      <ambientLight intensity={0.24} color="#8a6f4e" />
      <hemisphereLight args={['#4a3b2c', '#0a0806', 0.45]} />

      <Spot ref={a} from={[-2.5, ROOM.eave - 0.3, -6]} to={[-2.5, 0, -6]} angle={0.9} intensity={110} castShadow />
      <Spot ref={b} from={[2.5, ROOM.eave - 0.3, 0]} to={[2.5, 0, 0]} angle={0.9} intensity={110} castShadow />
      <Spot from={[0, ROOM.eave - 0.3, -11.5]} to={[0, 0, -11.5]} angle={0.75} intensity={80} />
    </>
  );
}

function Spot({
  ref,
  from,
  to,
  angle,
  intensity,
  color = '#ffd2a0',
  castShadow = false,
}: {
  ref?: React.Ref<THREE.SpotLight>;
  from: [number, number, number];
  to: [number, number, number];
  angle: number;
  intensity: number;
  color?: string;
  castShadow?: boolean;
}) {
  const light = useRef<THREE.SpotLight>(null);
  const target = useRef<THREE.Object3D>(null);

  useLayoutEffect(() => {
    if (light.current && target.current) light.current.target = target.current;
  }, []);

  return (
    <>
      <object3D ref={target} position={to} />
      <spotLight
        ref={(el) => {
          light.current = el;
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el;
        }}
        position={from}
        angle={angle}
        penumbra={0.95}
        intensity={intensity}
        distance={22}
        decay={1.5}
        color={color}
        castShadow={castShadow}
        shadow-mapSize={[768, 768]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />
    </>
  );
}

/* ─────────────────────────────── 가구 충돌 ─────────────────────────────── */

/** 충돌 데이터와 판정은 mp/collide.ts 하나에만 있다. 여기는 THREE.Vector3 를 제자리에서 고쳐 주는 껍데기다. */
export function resolveColliders(p: THREE.Vector3, feetY: number) {
  const out = resolveCollisions(p.x, p.z, feetY);
  p.x = out.x;
  p.z = out.z;
}

export { groundHeightAt };

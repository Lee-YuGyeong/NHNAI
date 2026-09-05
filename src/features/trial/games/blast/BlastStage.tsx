/**
 * 폭발 충격파 피하기의 무대 — 마당(BLAST_ARENA)에 장애물 여덟(mp/blast.ts BLAST_COVERS: 방호벽 · 모래주머니 · 상자), 놓인 폭약(blast_charge,
 * 빨간 등이 터질 때가 가까울수록 빨리 깜박인다), 그리고 폭발 연출 — 화염 스프라이트(힉스필드 fireball.webp, 가산 혼합) · 바닥을 달려 나가는
 * 충격파 고리 · 한 번 번쩍이는 빛 · 바닥에 남는 그을음 데칼(scorch.webp). 세기는 어디에도 없다 — 연출은 폭발마다 같다(P8).
 *
 * 광원 수는 고정이다 — 번쩍임은 pointLight 하나를 늘 두고 세기만 올린다(HallScene 머리말: 광원이 늘면 셰이더가 다시 링크돼 그 프레임이 멈춘다).
 * 방호벽(Tripo)의 베이크 텍스처는 줄이면서 번져서 콘크리트 단색 재질로 덮는다. 모래주머니 · 폭약은 그대로.
 */
import { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { GlbPart } from '@/world/map/corridor/part';
import { BLAST_ARENA, BLAST_COVERS, BLAST_MAX_ARMED, BLAST_R, type Cover } from '@/world/mp/blast';
import { blastState } from './blastState';

const FIRE_URL = '/textures/blast/fireball.webp';
const SCORCH_URL = '/textures/blast/scorch.webp';
const POOL = 6;
const SCORCHES = 14;
/** 연출 길이(ms) — 화염 · 고리 · 번쩍임 */
const FIRE_MS = 650;
const RING_MS = 550;
const FLASH_MS = 220;

const CONCRETE_MAT = new THREE.MeshStandardMaterial({ color: '#8f918c', roughness: 0.95, metalness: 0.05 });
const CRATE_MAT = new THREE.MeshStandardMaterial({ color: '#6d6f5a', metalness: 0.35, roughness: 0.75 });
const EDGE_MAT = new THREE.MeshBasicMaterial({ color: '#ffca8e', transparent: true, opacity: 0.55 });
const LAMP_ON = new THREE.MeshBasicMaterial({ color: '#ff2a1a' });
const LAMP_OFF = new THREE.MeshBasicMaterial({ color: '#3a0d0a' });
const RING_MAT = new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

function CoverPart({ c }: { c: Cover }) {
  const long = Math.max(c.hx, c.hz) * 2;
  const short = Math.min(c.hx, c.hz) * 2;
  if (c.kind === 'crate') {
    return <GlbPart id="cargo_container" fit={{ x: long, y: c.h, z: short }} position={[c.x, 0, c.z]} rotationY={c.rotY} material={CRATE_MAT} castShadow />;
  }
  if (c.kind === 'sandbag') {
    // 모델의 긴 축이 z 다 — 90° 더 돌려 배치표의 긴 축(x)에 맞춘다
    return <GlbPart id="blast_sandbag" fit={{ x: short, y: c.h, z: long }} position={[c.x, 0, c.z]} rotationY={c.rotY + Math.PI / 2} castShadow />;
  }
  return <GlbPart id="blast_barrier" fit={{ x: long, y: c.h, z: short }} position={[c.x, 0, c.z]} rotationY={c.rotY} material={CONCRETE_MAT} castShadow />;
}

/** 놓인 폭약들 — 풀 넷. 등은 터질 때가 가까울수록 빨리 깜박인다 */
function Charges() {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const now = Date.now();
    const charges = blastState.charges();
    g.children.forEach((child, i) => {
      const c = charges[i];
      child.visible = !!c;
      if (!c) return;
      child.position.set(c.x, 0, c.z);
      const left = Math.max(0, c.boomAtLocal - now);
      const period = Math.min(500, 70 + left * 0.25);
      const on = left % period < period / 2;
      const lamp = child.children[1] as THREE.Mesh | undefined;
      if (lamp) lamp.material = on ? LAMP_ON : LAMP_OFF;
    });
  });
  return (
    <group ref={group}>
      {Array.from({ length: BLAST_MAX_ARMED }, (_, i) => (
        <group key={i} visible={false}>
          <Suspense fallback={null}>
            <GlbPart id="blast_charge" fit={{ y: 0.55 }} castShadow />
          </Suspense>
          <mesh position={[0, 0.6, 0]} material={LAMP_OFF}>
            <sphereGeometry args={[0.07, 10, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** 폭발 연출 — 화염 · 고리 · 번쩍임 · 그을음. 풀로 돌린다 */
function Booms() {
  const fireTex = useTexture(FIRE_URL);
  const scorchTex = useTexture(SCORCH_URL);
  const fireMat = useMemo(() => new THREE.SpriteMaterial({ map: fireTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }), [fireTex]);
  const scorchMat = useMemo(() => {
    scorchTex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, opacity: 0.85, depthWrite: false });
  }, [scorchTex]);
  const fires = useRef<THREE.Group>(null);
  const rings = useRef<THREE.Group>(null);
  const scorches = useRef<THREE.Group>(null);
  const flash = useRef<THREE.PointLight>(null);
  /** 폭발 id → 그을음 칸. 한 번 본 폭발은 자리를 지킨다 */
  const scorchOf = useRef(new Map<number, number>());
  const scorchNext = useRef(0);

  useFrame(() => {
    const now = Date.now();
    const booms = blastState.booms();
    const f = fires.current;
    const r = rings.current;
    if (!f || !r) return;
    let newest: { x: number; z: number; age: number } | null = null;
    for (let i = 0; i < POOL; i += 1) {
      const b = booms[i];
      const fire = f.children[i] as THREE.Sprite | undefined;
      const ring = r.children[i] as THREE.Mesh | undefined;
      if (!fire || !ring) continue;
      const age = b ? now - b.atLocal : Number.POSITIVE_INFINITY;
      if (!b || age < 0 || age > Math.max(FIRE_MS, RING_MS)) {
        fire.visible = false;
        ring.visible = false;
        continue;
      }
      if (!newest || age < newest.age) newest = { x: b.x, z: b.z, age };
      const tf = Math.min(1, age / FIRE_MS);
      fire.visible = tf < 1;
      fire.position.set(b.x, 0.9 + tf * 1.6, b.z);
      const s = 1.6 + tf * 3.4;
      fire.scale.set(s, s, 1);
      (fire.material as THREE.SpriteMaterial).opacity = (1 - tf) * (0.4 + 0.6 * (1 - tf));
      const tr = Math.min(1, age / RING_MS);
      ring.visible = tr < 1;
      const rr = Math.max(0.3, BLAST_R * tr);
      ring.position.set(b.x, 0.08, b.z);
      ring.scale.set(rr, rr, 1);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - tr);
      // 그을음 — 처음 본 폭발이면 칸 하나를 준다
      if (scorches.current && !scorchOf.current.has(b.id)) {
        const slot = scorchNext.current % SCORCHES;
        scorchNext.current += 1;
        scorchOf.current.set(b.id, slot);
        const mark = scorches.current.children[slot];
        mark.visible = true;
        mark.position.set(b.x, 0.012, b.z);
        mark.rotation.z = (b.id * 1.7) % (Math.PI * 2);
      }
    }
    if (flash.current) {
      if (newest && newest.age < FLASH_MS) {
        flash.current.position.set(newest.x, 1.6, newest.z);
        flash.current.intensity = 160 * (1 - newest.age / FLASH_MS);
      } else flash.current.intensity = 0;
    }
  });

  return (
    <>
      <group ref={fires}>
        {Array.from({ length: POOL }, (_, i) => (
          <sprite key={i} visible={false} material={i === 0 ? fireMat : fireMat.clone()} />
        ))}
      </group>
      <group ref={rings}>
        {Array.from({ length: POOL }, (_, i) => (
          <mesh key={i} visible={false} rotation-x={-Math.PI / 2} material={i === 0 ? RING_MAT : RING_MAT.clone()}>
            <ringGeometry args={[0.86, 1, 64]} />
          </mesh>
        ))}
      </group>
      <group ref={scorches}>
        {Array.from({ length: SCORCHES }, (_, i) => (
          <mesh key={i} visible={false} rotation-x={-Math.PI / 2} material={scorchMat}>
            <planeGeometry args={[3.2, 3.2]} />
          </mesh>
        ))}
      </group>
      <pointLight ref={flash} position={[0, 1.6, -1.5]} color="#ffb060" intensity={0} distance={16} decay={2} />
    </>
  );
}

function ArenaEdge() {
  const w = BLAST_ARENA.maxX - BLAST_ARENA.minX;
  const d = BLAST_ARENA.maxZ - BLAST_ARENA.minZ;
  const cx = (BLAST_ARENA.minX + BLAST_ARENA.maxX) / 2;
  const cz = (BLAST_ARENA.minZ + BLAST_ARENA.maxZ) / 2;
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

/** @param lights 마당 위 작업등을 여기서 켤지 — /trial 은 켠다(기본) */
export function BlastStage({ lights = true }: { lights?: boolean } = {}) {
  return (
    <group>
      <ArenaEdge />
      <Suspense fallback={null}>
        {BLAST_COVERS.map((c, i) => (
          <CoverPart key={i} c={c} />
        ))}
      </Suspense>
      <Charges />
      <Suspense fallback={null}>
        <Booms />
      </Suspense>
      {lights ? <pointLight position={[0, 8.5, -1.5]} color="#dfe9ff" intensity={45} distance={26} decay={2} /> : null}
    </group>
  );
}

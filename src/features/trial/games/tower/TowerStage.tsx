/**
 * 무너지는 타워 — 홀 가운데 마당에 선 탑. 격자 기둥(Tripo Studio, tower_pylon)이 가운데를 받치고, 발판 25장은 각각 가는 기둥
 * (격납고의 steel_column 재사용) 위에 얹혀 서버가 준 기울기(towerState.slabAt)로 매 프레임 기운다.
 * 윗면 텍스처(힉스필드, public/textures/tower/slab_top.webp — 황흑 띠 · 가운데 청록 십자)는 「발판 가운데」를 눈으로 읽게 하고,
 * 경고가 뜬 발판은 갈라진 텍스처(slab_warn.webp)로 바뀌며 떨린다. 떨어지는 발판은 중력으로 떨어지며 돌다 사라진다(TOWER_FALL_KEEP_MS).
 * 마찰계수는 여기 없다 — 발판은 어느 구간에도 같아 보인다(P8).
 */
import { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { GlbInstances, GlbPart } from '@/world/map/corridor/part';
import { GRAVITY } from '@/world/mp/constants';
import { TOWER_CENTER, TOWER_FALL_KEEP_MS, TOWER_GAP, TOWER_N, TOWER_SLAB, TOWER_SLAB_H, TOWER_TOP, slabCenter } from '@/world/mp/tower';
import { towerState } from './towerState';

const TOP_URL = '/textures/tower/slab_top.webp';
const WARN_URL = '/textures/tower/slab_warn.webp';
const SIDE_MAT = new THREE.MeshStandardMaterial({ color: '#2b313a', metalness: 0.7, roughness: 0.45 });
const POST_MAT = new THREE.MeshStandardMaterial({ color: '#3a3f47', metalness: 0.65, roughness: 0.5 });
const PIT_MAT = new THREE.MeshBasicMaterial({ color: '#05070a' });

function Slabs() {
  const topTex = useTexture(TOP_URL);
  const warnTex = useTexture(WARN_URL);
  const mats = useMemo(() => {
    for (const t of [topTex, warnTex]) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
    }
    return {
      top: new THREE.MeshStandardMaterial({ map: topTex, metalness: 0.55, roughness: 0.5 }),
      warn: new THREE.MeshStandardMaterial({ map: warnTex, metalness: 0.55, roughness: 0.5, emissive: new THREE.Color('#ff3a1a'), emissiveIntensity: 0 }),
    };
  }, [topTex, warnTex]);
  const group = useRef<THREE.Group>(null);
  const size = TOWER_SLAB - TOWER_GAP;

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const now = Date.now();
    g.children.forEach((child, idx) => {
      const s = towerState.slabAt(idx, now);
      const c = slabCenter(idx);
      const top = child.children[1] as THREE.Mesh | undefined;
      if (s.state >= 3) {
        child.visible = false;
        return;
      }
      child.visible = true;
      // 기울기 t(낮은 쪽, tan) → 회전: x 축 둘레 atan(tz), z 축 둘레 −atan(tx) (mp/tower.ts slabSurfaceY 와 같은 부호)
      let y = TOWER_TOP;
      let rx = Math.atan(s.tz);
      let rz = -Math.atan(s.tx);
      if (s.state === 2) {
        const tau = Math.max(0, now - s.atLocal) / 1000;
        y = TOWER_TOP - 0.5 * GRAVITY * tau * tau;
        rx += tau * 1.4;
        rz += tau * 0.6;
        child.visible = now - s.atLocal < TOWER_FALL_KEEP_MS && y > -6;
      } else if (s.state === 1) {
        // 경고 — 떨리고, 붉게 숨 쉰다
        const k = ((now - s.atLocal) % 240) / 240;
        rx += Math.sin(now * 0.05) * 0.012;
        rz += Math.cos(now * 0.047) * 0.012;
        if (top) {
          top.material = mats.warn;
          mats.warn.emissiveIntensity = 0.25 + 0.6 * (k < 0.5 ? k * 2 : (1 - k) * 2);
        }
      } else if (top) top.material = mats.top;
      child.position.set(c.x, y, c.z);
      child.rotation.set(rx, 0, rz);
    });
  });

  return (
    <group ref={group}>
      {Array.from({ length: TOWER_N * TOWER_N }, (_, idx) => (
        <group key={idx}>
          <mesh position={[0, -TOWER_SLAB_H / 2, 0]} material={SIDE_MAT} castShadow receiveShadow>
            <boxGeometry args={[size, TOWER_SLAB_H, size]} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, 0]} material={mats.top} receiveShadow>
            <planeGeometry args={[size, size]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** @param lights 탑 위 작업등을 여기서 켤지 — /trial 은 켠다(기본) */
export function TowerStage({ lights = true }: { lights?: boolean } = {}) {
  const posts = useMemo(
    () =>
      Array.from({ length: TOWER_N * TOWER_N }, (_, idx) => {
        const c = slabCenter(idx);
        return { position: [c.x, 0, c.z] as [number, number, number], rotationY: 0 };
      }),
    [],
  );
  const half = (TOWER_N * TOWER_SLAB) / 2;
  return (
    <group>
      {/* 탑 밑의 어둠 — 떨어진 발판과 몸이 닿는 자리 */}
      <mesh rotation-x={-Math.PI / 2} position={[TOWER_CENTER.x, 0.015, TOWER_CENTER.z]} material={PIT_MAT}>
        <planeGeometry args={[half * 2 + 2.4, half * 2 + 2.4]} />
      </mesh>
      {/* 격자 기둥 — 탑의 몸통. 발판 밑면까지 */}
      <Suspense fallback={null}>
        <GlbPart id="tower_pylon" fit={{ x: 3.2, y: TOWER_TOP - TOWER_SLAB_H - 0.05, z: 3.2 }} position={[TOWER_CENTER.x, 0, TOWER_CENTER.z]} castShadow />
      </Suspense>
      {/* 발판마다 가는 받침 기둥 — 격납고의 H 기둥 재사용. 발판이 떨어져도 기둥은 남는다(그래서 빈 자리가 읽힌다) */}
      <Suspense fallback={null}>
        <GlbInstances id="steel_column" fit={{ x: 0.22, y: TOWER_TOP - TOWER_SLAB_H - 0.02, z: 0.22 }} items={posts} material={POST_MAT} />
      </Suspense>
      <Suspense fallback={null}>
        <Slabs />
      </Suspense>
      {lights ? <pointLight position={[TOWER_CENTER.x, TOWER_TOP + 4.5, TOWER_CENTER.z]} color="#dfe9ff" intensity={60} distance={22} decay={2} /> : null}
    </group>
  );
}

/**
 * 코어 탑 — 중앙 시설 한가운데 서 있는 것. **본판(/central)과 시나리오 2 가 같은 탑을 세운다.**
 *
 * 참고 이미지(2026-08-29): 넓은 원형 단(가장자리 발광 테) 위에 받침 기둥과 그 둘레의 콘솔 링(기울어진 화면 6장 + 발광 난간),
 * 그 위로 천장까지 솟는 다층 탑 — 층마다 8각 칼라와 네 면의 홀로 스크린, 층 사이 세로 발광 띠, 꼭대기 발광 링.
 * 참고 이미지의 주황 띠는 배경에 맞춰 청록으로.
 *
 * central.tsx 안에 있던 것을 그대로 뽑았다 — 치수는 central/layout(DAIS·CORE·TOWER·CORE_LIGHT)에서 읽고, 그 방의 중심·천장만 받는다.
 * 원래는 모듈 상수가 DAIS.x/DAIS.z 와 천장 10 을 직접 닫아 잡고 있어서, 다른 방에 옮기면 (0, −10.5) 가 하드코딩된 채 남았다.
 *
 * 천장 높이에 따라오는 것: 층 간격은 천장에서 역산한다 — tierGap = (ceilingY − baseTop − 0.6) / tiers 라 천장 10 이면 정확히 1.85(layout 값)다.
 * 간격이 MIN_TIER_GAP 밑으로 내려가면 층 수를 줄인다 — 낮은 방에 놓아도 칼라가 천장을 뚫지 않는다. 층이 0 이어도 몸통·꼭대기 링은 선다.
 *
 * 배치 배열은 useMemo — parts.Instanced 가 items 를 참조로 비교하기 때문에, 중심·천장이 같으면 같은 배열이어야 한다.
 * 홀로 스크린 텍스처는 인스턴스마다 clone 하고 언마운트 때 버린다 (URL 캐시를 공유하므로).
 *
 * 발광 재질은 기본이 scifi.TUBE_MAT — **전역 공유 인스턴스**라 락다운(CentralChapterScene)이 그 색을 붉히면 탑의 테·링·난간도 같이 붉어진다.
 * 그게 본판의 의도된 그림이다. 다른 방이 제 색을 따로 쥐고 싶으면 glow 로 제 인스턴스를 넘긴다.
 */

import { useTexture } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

import { Instanced, type Item } from '../parts';
import { STEEL_MAT, TUBE_MAT, hdr } from '../scifi';
import { CORE, CORE_LIGHT, DAIS, TOWER } from './layout';

/** 홀로 스크린 — 격납고 홀의 모니터 텍스처(막대 그래프·레이더)를 그대로 */
const TEX = { a: '/textures/warehouse/monitor_a.webp', b: '/textures/warehouse/monitor_b.webp' } as const;
useTexture.preload([TEX.a, TEX.b]);

/* ─────────────────────────────── 재질 ─────────────────────────────── */

const DAIS_MAT = new THREE.MeshStandardMaterial({ color: '#2c3644', roughness: 0.65, metalness: 0.4 });
const DAIS_TOP_MAT = new THREE.MeshStandardMaterial({ color: '#333e4d', roughness: 0.6, metalness: 0.45 });
/** 탑 몸통 — 리브보다 조금 어두운 강철 */
const TOWER_MAT = new THREE.MeshStandardMaterial({ color: '#232c38', roughness: 0.5, metalness: 0.6 });
/** 칼라·받침·콘솔 — 리브와 같은 강철 */
const COLLAR_MAT = STEEL_MAT;
/** 스크린 베젤 — 어둡게 */
const BEZEL_MAT = new THREE.MeshStandardMaterial({ color: '#0d1219', roughness: 0.6, metalness: 0.5 });
/** 세로 띠는 한 단 더 은은하게 */
const STRIPE_MAT = new THREE.MeshBasicMaterial({ color: hdr('#8fc2ee', 0.5), toneMapped: false });

/* ─────────────────────────────── 치수 ─────────────────────────────── */

/** 맨 위 층 칼라와 천장 사이 — 천장 10 · 4층 · baseTop 2 에서 tierGap 1.85 가 나오게 하는 값 */
const HEADROOM = 0.6;
/** 층 간격이 이보다 좁으면 스크린(높이 1.25)이 칼라에 파묻히고 세로 띠(tierGap − 0.9)가 사라진다 — 층을 줄이는 쪽을 택한다 */
const MIN_TIER_GAP = 1.4;

export type DaisSpec = { r: number; h: number };
export type TowerSpec = { baseTop: number; tiers: number; collarH: number; consoleR: number; consoleY: number; railH: number };

export interface CoreTowerProps {
  /** 탑의 중심 (바닥 평면). 본판은 DAIS.x/DAIS.z */
  center: { x: number; z: number };
  /** 이 방의 천장 — 탑 몸통이 여기까지 서고 꼭대기 링·칼라가 이 밑에 붙는다 */
  ceilingY: number;
  dais?: DaisSpec;
  core?: { r: number };
  /** tierGap 은 여기 없다 — 천장에서 역산한다 */
  tower?: TowerSpec;
  /** 발광 테·링·난간 재질. 기본은 전역 TUBE_MAT (락다운이 같이 붉힌다) */
  glow?: THREE.Material;
}

/** 원 둘레 n 자리의 (x, z, 각) */
function around(cx: number, cz: number, n: number, r: number, offset = 0): { x: number; z: number; a: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const a = offset + (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, a };
  });
}

/** 천장에 맞춘 층 수·간격 — 천장 10 이면 layout 그대로(4 · 1.85) */
export function tiersFor(ceilingY: number, tower: Pick<TowerSpec, 'baseTop' | 'tiers'> = TOWER): { tiers: number; tierGap: number } {
  const avail = ceilingY - tower.baseTop - HEADROOM;
  const tiers = Math.max(0, Math.min(tower.tiers, Math.floor(avail / MIN_TIER_GAP)));
  return { tiers, tierGap: tiers ? avail / tiers : 0 };
}

/* ─────────────────────────────── 배치 ─────────────────────────────── */

interface Layout {
  tierYs: number[];
  consoleLegs: Item[];
  consoleBezels: Item[];
  consoleFaces: Item[];
  tierBezels: Item[];
  tierFacesA: Item[];
  tierFacesB: Item[];
  stripes: Item[];
}

function layoutFor(cx: number, cz: number, ceilingY: number, dais: DaisSpec, core: { r: number }, tower: TowerSpec): Layout {
  /* ── 콘솔 링 — 받침 둘레의 기울어진 화면 6장 (베젤 상자 + 화면 상자), 앞에 발광 난간 ── */
  const consoleRing = around(cx, cz, 6, tower.consoleR, Math.PI / 6);
  const consoleBezels: Item[] = consoleRing.map(({ x, z, a }): Item => ({
    position: [x, dais.h + tower.consoleY, z],
    scale: [1.5, 0.9, 0.14],
    // 화면이 바깥(코어 반대쪽)을 보고 위로 25° 젖혀진다: y 로 −a 돌린 뒤 x 로 기울임
    rotation: [-0.44, -a + Math.PI / 2, 0],
  }));
  const consoleFaces: Item[] = consoleBezels.map((b): Item => ({ position: b.position, scale: [1.34, 0.76, 0.16], rotation: b.rotation }));
  const consoleLegs: Item[] = consoleRing.map(({ x, z }): Item => ({ position: [x, dais.h + tower.consoleY / 2, z], scale: [0.5, tower.consoleY, 0.5] }));

  /* ── 탑 층 — 칼라 + 네 면 스크린 + 사이 세로 띠 ── */
  const { tiers, tierGap } = tiersFor(ceilingY, tower);
  const tierYs = Array.from({ length: tiers }, (_, i) => tower.baseTop + tierGap * (i + 1));
  const tierScreens = tierYs.flatMap((y, ti) =>
    around(cx, cz, 4, core.r + 0.42, ti % 2 ? Math.PI / 4 : 0).map(({ x, z, a }, i) => ({
      bezel: { position: [x, y - tierGap * 0.45, z], scale: [1.7, 1.25, 0.16], rotation: [0, -a + Math.PI / 2, 0] } as Item,
      face: { position: [x, y - tierGap * 0.45, z], scale: [1.54, 1.1, 0.18], rotation: [0, -a + Math.PI / 2, 0] } as Item,
      alt: (ti + i) % 2 === 1,
    })),
  );
  /** 층 사이 세로 발광 띠 — 네 모서리 방향 */
  const stripes: Item[] = around(cx, cz, 4, core.r + 0.05, Math.PI / 4).flatMap(({ x, z, a }) =>
    tierYs.map((y): Item => ({ position: [x, y - tierGap / 2, z], scale: [0.08, tierGap - 0.9, 0.08], rotation: [0, -a, 0] })),
  );
  return {
    tierYs,
    consoleLegs,
    consoleBezels,
    consoleFaces,
    tierBezels: tierScreens.map((t) => t.bezel),
    tierFacesA: tierScreens.filter((t) => !t.alt).map((t) => t.face),
    tierFacesB: tierScreens.filter((t) => t.alt).map((t) => t.face),
    stripes,
  };
}

/* ─────────────────────────────── 탑 ─────────────────────────────── */

export function CoreTower({ center, ceilingY, dais = DAIS, core = CORE, tower = TOWER, glow = TUBE_MAT }: CoreTowerProps) {
  const [monA, monB] = useTexture([TEX.a, TEX.b]);
  const cx = center.x;
  const cz = center.z;

  const L = useMemo(
    () => layoutFor(cx, cz, ceilingY, dais, core, tower),
    // 객체가 아니라 숫자로 비교한다 — 호출처가 매 렌더 새 객체를 넘겨도 배열이 안 바뀐다
    [cx, cz, ceilingY, dais.r, dais.h, core.r, tower.baseTop, tower.tiers, tower.collarH, tower.consoleR, tower.consoleY, tower.railH],
  );

  const holo = useMemo(() => {
    const prep = (t: THREE.Texture) => {
      const c = t.clone();
      c.colorSpace = THREE.SRGBColorSpace;
      c.anisotropy = 8;
      c.needsUpdate = true;
      return c;
    };
    return {
      a: new THREE.MeshBasicMaterial({ map: prep(monA), color: hdr('#c4d8f0', 0.62), toneMapped: false }),
      b: new THREE.MeshBasicMaterial({ map: prep(monB), color: hdr('#c4d8f0', 0.62), toneMapped: false }),
    };
  }, [monA, monB]);
  useEffect(
    () => () => {
      holo.a.map?.dispose();
      holo.a.dispose();
      holo.b.map?.dispose();
      holo.b.dispose();
    },
    [holo],
  );

  return (
    <group name="코어 탑">
      {/* 원형 단 — 두 단, 윗단 가장자리에 발광 테 */}
      <mesh name="단" position={[cx, dais.h * 0.45, cz]} material={DAIS_MAT}>
        <cylinderGeometry args={[dais.r, dais.r + 0.35, dais.h * 0.9, 64]} />
      </mesh>
      <mesh name="단 윗판" position={[cx, dais.h - 0.05, cz]} material={DAIS_TOP_MAT}>
        <cylinderGeometry args={[dais.r - 0.4, dais.r - 0.4, 0.1, 64]} />
      </mesh>
      <mesh name="단 테" position={[cx, dais.h + 0.012, cz]} rotation-x={-Math.PI / 2} material={glow}>
        <ringGeometry args={[dais.r - 0.34, dais.r - 0.24, 96]} />
      </mesh>

      {/* 받침 기둥 — 단 위에서 탑 밑까지, 위가 살짝 넓다 */}
      <mesh name="받침" position={[cx, (dais.h + tower.baseTop) / 2, cz]} material={COLLAR_MAT}>
        <cylinderGeometry args={[core.r + 0.7, core.r + 0.35, tower.baseTop - dais.h, 8]} />
      </mesh>
      <mesh name="받침 테" position={[cx, tower.baseTop - 0.02, cz]} rotation-x={-Math.PI / 2} material={glow}>
        <ringGeometry args={[core.r + 0.55, core.r + 0.72, 8]} />
      </mesh>

      {/* 콘솔 링 — 기울어진 화면 6 + 다리, 앞에 발광 난간 */}
      <Instanced name="콘솔 다리" items={L.consoleLegs} material={COLLAR_MAT} />
      <Instanced name="콘솔 베젤" items={L.consoleBezels} material={BEZEL_MAT} />
      <Instanced name="콘솔 화면" items={L.consoleFaces} material={holo.a} receiveShadow={false} />
      <mesh name="난간" position={[cx, dais.h + tower.railH, cz]} rotation-x={Math.PI / 2} material={glow}>
        <torusGeometry args={[tower.consoleR + 0.9, 0.035, 8, 96]} />
      </mesh>

      {/* 탑 몸통 — 8각 기둥, 천장까지 */}
      <mesh name="탑" position={[cx, (tower.baseTop + ceilingY) / 2, cz]} material={TOWER_MAT}>
        <cylinderGeometry args={[core.r, core.r, ceilingY - tower.baseTop, 8]} />
      </mesh>
      {/* 층마다 8각 칼라 + 밑면 발광 테 */}
      {L.tierYs.map((y, i) => (
        <group key={i}>
          <mesh position={[cx, y, cz]} material={COLLAR_MAT}>
            <cylinderGeometry args={[core.r + 0.75, core.r + 0.95, tower.collarH, 8]} />
          </mesh>
          <mesh position={[cx, y - tower.collarH / 2 - 0.01, cz]} rotation-x={Math.PI / 2} material={glow}>
            <ringGeometry args={[core.r + 0.2, core.r + 0.95, 8]} />
          </mesh>
        </group>
      ))}
      <Instanced name="홀로 스크린 베젤" items={L.tierBezels} material={BEZEL_MAT} />
      <Instanced name="홀로 스크린 A" items={L.tierFacesA} material={holo.a} receiveShadow={false} />
      <Instanced name="홀로 스크린 B" items={L.tierFacesB} material={holo.b} receiveShadow={false} />
      <Instanced name="세로 띠" items={L.stripes} material={STRIPE_MAT} receiveShadow={false} />
      {/* 꼭대기 — 천장 바로 밑의 굵은 발광 링 */}
      <mesh name="꼭대기 링" position={[cx, ceilingY - 0.5, cz]} rotation-x={Math.PI / 2} material={glow}>
        <torusGeometry args={[core.r + 0.6, 0.09, 8, 48]} />
      </mesh>
      <mesh name="꼭대기 칼라" position={[cx, ceilingY - 0.9, cz]} material={COLLAR_MAT}>
        <cylinderGeometry args={[core.r + 0.5, core.r + 1.0, 0.8, 8]} />
      </mesh>
    </group>
  );
}

/* ─────────────────────────────── 조명 ─────────────────────────────── */

export interface CoreTowerLightsProps {
  center: { x: number; z: number };
  ceilingY: number;
  dais?: DaisSpec;
  light?: { intensity: number; distance: number };
}

/** 코어 빛 — 기둥 위아래 두 점. 그림자·깜빡임 없음. 방의 Lights 컴포넌트가 제 bay 조명 옆에 얹는다 */
export function CoreTowerLights({ center, ceilingY, dais = DAIS, light = CORE_LIGHT }: CoreTowerLightsProps) {
  return (
    <>
      <pointLight position={[center.x, dais.h + 2.5, center.z]} intensity={light.intensity} distance={light.distance} decay={1.7} color="#bfe0ff" />
      <pointLight position={[center.x, ceilingY - 2, center.z]} intensity={light.intensity * 0.6} distance={light.distance} decay={1.7} color="#bfe0ff" />
    </>
  );
}

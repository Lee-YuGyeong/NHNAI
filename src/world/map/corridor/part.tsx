/**
 * 맵 GLB 부품의 **공용 로더** — 복도·창고·심문소가 같이 쓴다. 한글 오브젝트명 표(PART_NAMES)가 여기 있다.
 *
 * 원본은 Tripo 가 만든 단일 메시 GLB 라 하나같이 최대 치수 ≈1 로 정규화돼 있고, x·z 가운데가 0 이다 (Studio v3.1 은 바닥 y=0, 옛 부품은 가운데 — map/parts.tsx 의 Parts 가 발밑을 잰다).
 * 그래서 부품마다 "실제 몇 m 로 세울 것인가"(fit)를 여기서 정하고, 한글 이름을 name·userData.assetName 에 박는다.
 *
 * ★ 이름 규칙: 함수·파일·에셋 id 는 영문, 결과 Object3D 의 name / userData.assetName 은 사용자가 지정한 한글 그대로.
 * ★ 같은 GLB 는 geometry·material 을 공유한다 — GlbPart 는 scene.clone() (얕은 복제), GlbInstances 는 InstancedMesh.
 */

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { useAsset } from '../../assets/loader';
import type { AssetId } from '../../assets/manifest';

/** 에셋 id → 한글 오브젝트명. **사용자 지정 이름이다 — 바꾸지 않는다.** */
export const PART_NAMES = {
  // SF 복도 맵 (map/corridor.tsx)
  sci_bulkhead: '격벽 링',
  sci_console: '벽 콘솔',
  sci_blast_door: '격납문',
  // 옛 창고 부품 — 심문소 맵(map/interrogation.tsx)이 재사용한다
  roof_truss: '박공 트러스',
  steel_column: 'H 기둥',
  x_brace: 'X 가새',
  // 심문소 맵 (map/interrogation.tsx)
  sci_rack: '금속 랙',
  ring_lamp: '링 조명 기구',
  metal_case: '금속 케이스',
  // 격납고 홀 (map/warehouse.tsx) — 바닥 화물 · 천장 크레인 · 등 뒤 도크 · 도는 드론
  cargo_container: '화물 컨테이너',
  crane_hoist: '크레인 호이스트',
  charge_dock: '충전 도크',
  watch_drone: '감시 드론',
  hall_fan: '배기 팬',
  wall_arm: '검사 암',
  // 작업 구역 맵 (world2/map/work.tsx)
  incinerator: '소각로 화구',
  // 물리 미니게임 — 정지선 (features/trial/games/stop-line)
  trial_gate: '정지선 게이트',
  trial_beacon: '레인 비콘',
} as const satisfies Partial<Record<AssetId, string>>;

export type PartId = keyof typeof PART_NAMES;
export type PartName = (typeof PART_NAMES)[PartId];

/**
 * 목표 치수(m). 준 축만 그 길이로 맞추고, **안 준 축은 준 축들 배율 중 가장 작은 값**을 쓴다.
 * 그래서 몰딩은 { x: 0.05, z: 4 } 처럼 두께는 고정하고 길이만 늘릴 수 있고,
 * 식물은 { y: 1.8 } 하나면 비율을 지키며 커진다.
 */
export interface Fit {
  x?: number;
  y?: number;
  z?: number;
}

export function fitScale(base: THREE.Vector3, fit: Fit): [number, number, number] {
  const rx = fit.x !== undefined && base.x > 1e-6 ? fit.x / base.x : undefined;
  const ry = fit.y !== undefined && base.y > 1e-6 ? fit.y / base.y : undefined;
  const rz = fit.z !== undefined && base.z > 1e-6 ? fit.z / base.z : undefined;
  const given = [rx, ry, rz].filter((v): v is number => v !== undefined);
  const rest = given.length ? Math.min(...given) : 1;
  return [rx ?? rest, ry ?? rest, rz ?? rest];
}

export interface PartSource {
  /** 원본 씬 (건드리지 말 것 — clone 해서 쓴다) */
  scene: THREE.Group;
  /** 정지 상태 치수 (모델 단위 ≈ 0.98 이 최대 변) */
  size: THREE.Vector3;
  /** 첫 메시의 geometry·material — InstancedMesh 용. 노드 변환은 geometry 에 구워 넣었다 */
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

const sourceCache = new WeakMap<THREE.Group, PartSource>();

/** GLB 텍스처의 이방성 필터 배율 */
const TEXTURE_ANISOTROPY = 4;

/** GLB 한 개의 원본과 치수. 같은 파일은 캐시된 하나를 돌려준다 */
export function usePartSource(id: PartId): PartSource {
  const gltf = useAsset(id);
  return useMemo(() => {
    const cached = sourceCache.get(gltf.scene);
    if (cached) return cached;

    gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = new THREE.Vector3();
    box.getSize(size);

    let mesh: THREE.Mesh | null = null;
    gltf.scene.traverse((o) => {
      if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
    });
    if (!mesh) throw new Error(`[corridor] ${PART_NAMES[id]} (${id}) 에 메시가 없다`);
    const m = mesh as THREE.Mesh;

    // 노드에 변환이 있으면 InstancedMesh 가 그걸 잃으므로 geometry 에 구워 넣는다 (Tripo 는 보통 항등)
    let geometry = m.geometry;
    const world = m.matrixWorld;
    if (!isIdentity(world)) {
      geometry = m.geometry.clone();
      geometry.applyMatrix4(world);
    }
    const material = Array.isArray(m.material) ? m.material[0] : m.material;

    // 비스듬히 보는 바닥·천장 결이 뭉개지지 않게 — GLTFLoader 기본은 1 이다. 비용은 거의 없다 (gallery.tsx 는 8)
    gltf.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!mat || Array.isArray(mat)) return;
      for (const tex of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap]) {
        if (tex) tex.anisotropy = TEXTURE_ANISOTROPY;
      }
    });

    const src: PartSource = { scene: gltf.scene, size, geometry, material };
    sourceCache.set(gltf.scene, src);
    return src;
  }, [gltf.scene, id]);
}

function isIdentity(m: THREE.Matrix4): boolean {
  const e = m.elements;
  for (let i = 0; i < 16; i++) {
    const want = i % 5 === 0 ? 1 : 0;
    if (Math.abs(e[i] - want) > 1e-6) return false;
  }
  return true;
}

export interface GlbPartProps {
  id: PartId;
  /** 목표 치수(m). 안 주면 모델 단위 그대로(≈1m) */
  fit?: Fit;
  position?: [number, number, number];
  /** y 회전(rad). 벽 부품은 정면(+z)이 복도 안쪽을 보게 돌린다 */
  rotationY?: number;
  rotation?: [number, number, number];
  /** 재질을 통째로 바꾼다 (발광 부품용). **모듈 수준에서 한 번 만들어 공유**할 것 */
  material?: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /**
   * 그룹·메시 이름 (기본 = 한글 오브젝트명). 보조 메시(화면·렌즈 등)를 곁에 두는 부품은 **바깥 그룹**이 한글명을 갖고
   * 이 GLB 는 "한글명/몸체" 가 되어야 getObjectByName(한글명) 이 보조 메시까지 함께 돌려준다.
   */
  name?: string;
  children?: React.ReactNode;
}

/**
 * GLB 부품 하나. 그룹 name·userData.assetName 과 안의 모든 메시 이름이 한글 오브젝트명이다.
 * 발밑(y=0)·가운데(x=z=0)가 원점이라 position 은 "바닥에 놓이는 점"이다.
 */
export function GlbPart({ id, fit, position, rotationY = 0, rotation, material, castShadow = false, receiveShadow = true, name, children }: GlbPartProps) {
  const src = usePartSource(id);
  const assetName = name ?? PART_NAMES[id];
  const scale = useMemo(() => (fit ? fitScale(src.size, fit) : ([1, 1, 1] as [number, number, number])), [src.size, fit]);

  const object = useMemo(() => {
    const o = src.scene.clone();
    o.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.name = assetName;
        mesh.userData.assetName = assetName;
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;
        if (material) mesh.material = material;
      }
    });
    return o;
  }, [src.scene, assetName, castShadow, receiveShadow, material]);

  return (
    <group name={assetName} userData={{ assetName }} position={position} rotation={rotation ?? [0, rotationY, 0]} scale={scale}>
      <primitive object={object} />
      {children}
    </group>
  );
}

export interface InstanceItem {
  position: [number, number, number];
  rotationY?: number;
  /** 부품별 추가 배율 (fit 위에 곱한다) */
  scale?: number | [number, number, number];
}

export interface GlbInstancesProps {
  id: PartId;
  fit?: Fit;
  items: readonly InstanceItem[];
  material?: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _axis = new THREE.Vector3(0, 1, 0);

/**
 * 같은 부품을 여러 개 — **드로우콜 하나.** 바닥 타일·천장 슬랫·몰딩처럼 반복되는 것에 쓴다.
 * 인스턴스 하나하나에는 이름을 못 붙이므로 InstancedMesh 자체가 한글 오브젝트명을 갖는다.
 * 행렬을 다 쓴 뒤 computeBoundingSphere() 로 인스턴스 전체를 감싸는 구를 만들므로 프러스텀 컬링이 정상 동작한다 —
 * 등 뒤 벽의 인스턴스 묶음은 메인·반사·그림자 패스 모두에서 빠진다.
 */
export function GlbInstances({ id, fit, items, material, castShadow = false, receiveShadow = true }: GlbInstancesProps) {
  const src = usePartSource(id);
  const assetName = PART_NAMES[id];
  const ref = useRef<THREE.InstancedMesh>(null);
  const base = useMemo(() => (fit ? fitScale(src.size, fit) : ([1, 1, 1] as [number, number, number])), [src.size, fit]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      const extra = it.scale === undefined ? [1, 1, 1] : typeof it.scale === 'number' ? [it.scale, it.scale, it.scale] : it.scale;
      _p.set(it.position[0], it.position[1], it.position[2]);
      _q.setFromAxisAngle(_axis, it.rotationY ?? 0);
      _s.set(base[0] * extra[0], base[1] * extra[1], base[2] * extra[2]);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, base]);

  return (
    <instancedMesh
      key={items.length}
      ref={ref}
      args={[src.geometry, material ?? src.material, items.length]}
      name={assetName}
      userData={{ assetName }}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
}

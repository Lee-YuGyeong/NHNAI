/**
 * 맵 공용 조립 헬퍼 — 창고(warehouse.tsx)·심문소(interrogation.tsx)가 같이 쓴다.
 *
 *   - useTiled : 텍스처 한 장을 면 크기 비율로 반복 (URL 캐시를 공유하므로 clone)
 *   - Instanced: 단위 박스(1×1×1) 여러 개를 드로우콜 하나로 (LED 띠·중도리·박스…)
 *   - Parts    : GLB 부품 여러 개를 드로우콜 하나로. ★ Tripo 부품은 **원점이 가운데**(y −0.5~0.5)라 복도 부품("발밑 y=0")과 다르다 —
 *                바운딩 박스 아래 y 를 재서 position 을 발밑 점으로 맞춘다.
 *
 * items 는 **모듈 수준 상수 배열**이어야 한다 — 참조가 바뀌면 행렬을 다시 쓴다.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { GlbInstances, fitScale, usePartSource, type Fit, type InstanceItem, type PartId } from './corridor/part';

/* ─────────────────────────────── 텍스처 ─────────────────────────────── */

/** useTexture 는 URL 단위로 캐시를 공유하므로 면마다 반복 횟수가 다르면 clone 한다. mirrored 면 이음매가 접혀 숨는다 */
export function useTiled(map: THREE.Texture, repeatX: number, repeatY: number, mirrored = true) {
  return useMemo(() => {
    const t = map.clone();
    t.wrapS = t.wrapT = mirrored ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }, [map, repeatX, repeatY, mirrored]);
}

/* ─────────────────────────────── 단위 박스 인스턴스 ─────────────────────────────── */

export interface Item {
  position: [number, number, number];
  /** 단위 박스(1×1×1)의 치수 */
  scale: [number, number, number];
  rotation?: [number, number, number];
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

export interface InstancedProps {
  items: readonly Item[];
  material: THREE.Material;
  name: string;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/** 단위 박스 여러 개 — 드로우콜 하나 */
export function Instanced({ items, material, name, castShadow = false, receiveShadow = true }: InstancedProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      _p.set(...it.position);
      const r = it.rotation ?? [0, 0, 0];
      _q.setFromEuler(_e.set(r[0], r[1], r[2]));
      _s.set(...it.scale);
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[UNIT_BOX, material, items.length]} name={name} castShadow={castShadow} receiveShadow={receiveShadow} />;
}

/* ─────────────────────────────── GLB 부품 (발밑 보정) ─────────────────────────────── */

const minYCache = new WeakMap<THREE.Group, number>();

/** 부품 바운딩 박스의 아래 y (모델 단위). Tripo 부품은 가운데가 원점이라 보통 −0.5 근처다 */
export function usePartMinY(id: PartId): number {
  const src = usePartSource(id);
  return useMemo(() => {
    const cached = minYCache.get(src.scene);
    if (cached !== undefined) return cached;
    const min = new THREE.Box3().setFromObject(src.scene).min.y;
    minYCache.set(src.scene, min);
    return min;
  }, [src.scene]);
}

export interface PartsProps {
  id: PartId;
  fit: Fit;
  /** position 은 **발밑 점**이다 (복도 부품과 같은 약속). scale 은 fit 위에 곱하는 배율 */
  items: readonly InstanceItem[];
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** 원본 재질에 곱하는 색 — 텍스처를 어둡게 가라앉힐 때 (Tripo 텍스처는 참고 이미지보다 밝은 편이다) */
  tint?: string;
  /** 재질을 통째로 바꾼다 (Tripo 텍스처가 못 쓸 때 — 형상만 쓴다). tint 보다 우선. **모듈 수준에서 한 번 만들어 공유**할 것 */
  material?: THREE.Material;
}

/** GLB 부품 여러 개 — 드로우콜 하나. 가운데 원점인 Tripo 부품의 position 을 발밑 점으로 옮겨 GlbInstances 에 넘긴다 */
export function Parts({ id, fit, items, castShadow = false, receiveShadow = true, tint, material: override }: PartsProps) {
  const src = usePartSource(id);
  const minY = usePartMinY(id);
  const sy = fitScale(src.size, fit)[1];
  const material = useMemo(() => {
    if (override) return override;
    if (!tint) return undefined;
    const m = (src.material as THREE.MeshStandardMaterial).clone();
    m.color.set(tint);
    return m;
  }, [src.material, tint, override]);
  useEffect(() => () => material?.dispose(), [material]);
  const mapped = useMemo<InstanceItem[]>(
    () =>
      items.map((it) => {
        const ey = it.scale === undefined ? 1 : typeof it.scale === 'number' ? it.scale : it.scale[1];
        return { ...it, position: [it.position[0], it.position[1] - minY * sy * ey, it.position[2]] };
      }),
    [items, minY, sy],
  );
  return <GlbInstances id={id} fit={fit} items={mapped} material={material} castShadow={castShadow} receiveShadow={receiveShadow} />;
}

/**
 * 낙하물 — 서버 스냅샷(fallState)이 준 자리에 화물 포드 GLB(trial_pod)를 인스턴싱해 그린다. 스스로 떨어뜨리지 않는다.
 * 포드마다 바닥에 그림자 원반을 깐다 — 사람이 "어디 떨어지나"를 읽는 물리적 단서다(진짜 그림자는 여럿이면 비싸다).
 * 원반은 높이 따라 작아지고 옅어져서 착지가 가까워질수록 또렷해진다.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fitScale, usePartSource } from '@/world/map/corridor/part';
import { FALL_OBJECT_R, FALL_SPAWN_Y } from '@/world/mp/constants';
import { fallState } from './fallState';

/** 동시에 공중·바닥에 있을 수 있는 최대 수 — 1.5초 간격 스폰 · 착지 후 1초 잔류면 넉넉하다 */
const MAX_PODS = 24;
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

export function FallingPods() {
  const src = usePartSource('trial_pod');
  const scale = useMemo(() => fitScale(src.size, { y: FALL_OBJECT_R * 2 }), [src.size]);
  const pods = useRef<THREE.InstancedMesh>(null);
  const shadows = useRef<THREE.InstancedMesh>(null);
  const shadowGeo = useMemo(() => new THREE.CircleGeometry(FALL_OBJECT_R * 1.1, 24), []);
  const shadowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.45, depthWrite: false }), []);

  useLayoutEffect(() => {
    if (pods.current) pods.current.count = 0;
    if (shadows.current) shadows.current.count = 0;
  }, []);

  useFrame(() => {
    const pm = pods.current;
    const sm = shadows.current;
    if (!pm || !sm) return;
    const frames = fallState.podsAt(Date.now());
    const n = Math.min(frames.length, MAX_PODS);
    for (let i = 0; i < n; i += 1) {
      const f = frames[i];
      // 떨어지며 천천히 돈다 — 고정된 각도면 종이 인형처럼 보인다
      _e.set(0, (f.id * 1.7) % Math.PI, ((FALL_SPAWN_Y - f.y) * 0.35) % Math.PI);
      _q.setFromEuler(_e);
      _p.set(f.x, f.y, f.z);
      _s.set(scale[0], scale[1], scale[2]);
      pm.setMatrixAt(i, _m.compose(_p, _q, _s));

      // 그림자 원반 — 높을수록 작고 옅게. 착지하면 몸통 밑에 붙는다
      const k = Math.max(0.35, 1 - (f.y - FALL_OBJECT_R) / FALL_SPAWN_Y);
      _p.set(f.x, 0.02, f.z);
      _q.setFromEuler(_e.set(-Math.PI / 2, 0, 0));
      _s.set(k, k, 1);
      sm.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    pm.count = n;
    sm.count = n;
    pm.instanceMatrix.needsUpdate = true;
    sm.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={pods} args={[src.geometry, src.material, MAX_PODS]} frustumCulled={false} castShadow={false} receiveShadow={false} />
      <instancedMesh ref={shadows} args={[shadowGeo, shadowMat, MAX_PODS]} frustumCulled={false} />
    </>
  );
}

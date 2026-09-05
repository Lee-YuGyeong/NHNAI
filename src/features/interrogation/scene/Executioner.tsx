/**
 * 끝벽 앞의 처형자 — 총을 들고 홀을 바라보다가, 의심도 100% 로 격리되는 좌석을 향해 돌아서서 쏜다 (2026-09-04 사용자).
 *
 * 몸: public/world/executioner/executioner.glb (사용자 제공 Tripo 리깅, 클립 없음) + gun.glb (소총 기준 좌표로 구운 총).
 * 움직임은 GLB 클립이 아니라 **코드**다 — 무장 심문 AI · 리더와 같은 자세 엔진(features/world/enforcerPose):
 *   idle → 총을 낮게 든 채 숨쉬며 둘러본다     aim/fire → 몸을 비틀어 견착, 한 발마다 반동     recover → 다시 idle 자세로
 *
 * ★ 자세 엔진은 모델이 **+x 를 본다**고 믿는다 (심문 AI · 리더가 그렇다). 이 몸은 군인들처럼 +z 를 보므로 안쪽에 +90° 돌린 피벗을
 *   끼워 리그 탐색(buildRig)이 +x 정면을 보게 하고, 겉 그룹을 −90° 돌려 되돌린다 — 겉 그룹 heading 0 이 곧 홀 쪽(+z)이다.
 *
 * 임팩트 (사용자: "총쏠때 나오는 임펙트도"):
 *   총구 — features/world/muzzle.ts 의 섬광 한 벌(점광원 + 가산 스프라이트)을 총에 매단다
 *   피격 — 표적 가슴에 튀는 불꽃(가산 스프라이트) + 스파크(Points) + 짧은 점광원, 총구에서 표적까지 예광(Line) 한 프레임 묶음
 *   소리 — features/world/sfx 의 gunshot (심문 AI 와 같은 총성)
 *
 * 표적 자리는 remotePlayers(좌석 id)의 보간된 pose 에서 프레임마다 읽는다 — 격리된 몸은 EXECUTION_MS 동안 홀에 남는다
 * (InterrogationFeature 의 dying). 내가 격리됐으면 몸이 없으니 store 의 fallback(내 마지막 좌표)을 쏜다.
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { attachRifle, buildRig, curlHands, EnforcerPoser, type PoseMode } from '@/features/world/enforcerPose';
import { flashTexture, makeMuzzle } from '@/features/world/muzzle';
import { gunshot } from '@/features/world/sfx';
import { useAsset } from '@/world/assets/loader';
import { STAGE_Z } from '@/world/map/govcenter/layout';
import { remotePlayers } from '@/world/net/remote-players';
import { executioner, type ExecutionerPhase } from './executionerStore';

/** 키(m) — 참가자(1.72)보다 조금 크다. 단상은 없어졌으니(2026-09-05 사용자) 키 차이만이 그를 가른다 */
const HEIGHT = 1.9;
/** 모델(+z 를 본다)을 자세 엔진의 +x 로 — 피벗 +90°, 겉 −90° */
const PIVOT_YAW = Math.PI / 2;
const MODEL_YAW = -Math.PI / 2;
/**
 * 총 — 소총 기준 좌표(길이 1 · 총열 +z · 위 +y, tools/gun-orient.mjs). len 은 키 비율: 0.48 × 1.9 ≈ 0.91m (SCAR 급).
 * grip 은 권총 손잡이 — 프리뷰(tools/glb-preview)에서 총 중심 뒤 0.12, 총열선(y 0.2) 아래 0.16
 */
const GUN = { len: 0.48, grip: [0, 0.04, -0.12] as const };
/** 총구 — 총 좌표. gun-orient 가 총열 끝을 z +0.5 에 둔다 */
const MUZZLE_LOCAL = new THREE.Vector3(0, 0.22, 0.5);
/** 표적 쪽으로 도는 속도(1/s) */
const TURN = 7;
/** 사격할 때 가슴 높이(발에서) */
const CHEST_Y = 1.15;
/** 피격 임팩트 수명(ms) · 예광 수명 */
const IMPACT_MS = 320;
const TRACER_MS = 70;
const SPARKS = 24;
/** 임팩트 슬롯 — 한 처형에 세 발, 겹치면 재사용 */
const IMPACT_SLOTS = 4;

const MODE_OF: Record<ExecutionerPhase, PoseMode> = { idle: 'idle', aim: 'aim', fire: 'aim', recover: 'idle' };

/* ─────────────────────────────── 피격 임팩트 ─────────────────────────────── */

interface ImpactSlot {
  at: number;
  origin: THREE.Vector3;
  from: THREE.Vector3;
  vel: Float32Array;
  flash: THREE.Sprite;
  light: THREE.PointLight;
  sparks: THREE.Points;
  tracer: THREE.Line;
  spin: number;
  size: number;
}

function makeImpactSlot(): ImpactSlot {
  const tex = flashTexture() ?? undefined;
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#ffd2a8', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
  flash.visible = false;
  flash.frustumCulled = false;
  const light = new THREE.PointLight('#ffb070', 0, 6, 1.6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
  const sparks = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffc27a', size: 0.045, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, sizeAttenuation: true }));
  sparks.visible = false;
  sparks.frustumCulled = false;
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracer = new THREE.Line(tgeo, new THREE.LineBasicMaterial({ color: '#ffe0b0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  tracer.visible = false;
  tracer.frustumCulled = false;
  return { at: -Infinity, origin: new THREE.Vector3(), from: new THREE.Vector3(), vel: new Float32Array(SPARKS * 3), flash, light, sparks, tracer, spin: 0, size: 1 };
}

function fireImpact(s: ImpactSlot, at: number, hit: THREE.Vector3, from: THREE.Vector3): void {
  s.at = at;
  s.origin.copy(hit);
  s.from.copy(from);
  s.spin = Math.random() * Math.PI;
  s.size = 0.8 + Math.random() * 0.5;
  // 스파크 — 총알이 들어온 방향의 반대(튕겨 나오는 쪽)로 반구, 위로 살짝
  const back = hit.clone().sub(from).normalize().negate();
  for (let i = 0; i < SPARKS; i++) {
    const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    if (d.dot(back) < 0) d.negate();
    d.multiplyScalar(1.5 + Math.random() * 2.5);
    d.y += 0.6;
    s.vel[i * 3] = d.x;
    s.vel[i * 3 + 1] = d.y;
    s.vel[i * 3 + 2] = d.z;
  }
  s.flash.position.copy(hit);
  s.light.position.copy(hit);
  const t = s.tracer.geometry.getAttribute('position') as THREE.BufferAttribute;
  t.setXYZ(0, from.x, from.y, from.z);
  t.setXYZ(1, hit.x, hit.y, hit.z);
  t.needsUpdate = true;
  s.flash.visible = s.light.visible = s.sparks.visible = s.tracer.visible = true;
}

function updateImpact(s: ImpactSlot, now: number): void {
  const age = now - s.at;
  if (!(age >= 0) || age > IMPACT_MS) {
    if (s.flash.visible) s.flash.visible = s.light.visible = s.sparks.visible = s.tracer.visible = false;
    s.light.intensity = 0;
    return;
  }
  const k = 1 - age / IMPACT_MS;
  const fm = s.flash.material as THREE.SpriteMaterial;
  fm.opacity = Math.min(1, k * 2);
  fm.rotation = s.spin;
  s.flash.scale.setScalar(0.35 * s.size * (0.6 + 0.9 * (1 - k)));
  s.light.intensity = 40 * k * k;
  const p = s.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
  const t = age / 1000;
  for (let i = 0; i < SPARKS; i++) p.setXYZ(i, s.origin.x + s.vel[i * 3] * t, s.origin.y + s.vel[i * 3 + 1] * t - 4.9 * t * t, s.origin.z + s.vel[i * 3 + 2] * t);
  p.needsUpdate = true;
  (s.sparks.material as THREE.PointsMaterial).opacity = k;
  const tm = s.tracer.material as THREE.LineBasicMaterial;
  const tk = age < TRACER_MS ? 1 - age / TRACER_MS : 0;
  tm.opacity = tk;
  s.tracer.visible = tk > 0;
}

/* ─────────────────────────────── 처형자 ─────────────────────────────── */

export function Executioner() {
  const gltf = useAsset('executioner');
  const gunGltf = useAsset('executioner_gun');
  /*
   * 복제와 피벗 감싸기는 **한 memo 에서** — dev StrictMode 가 memo 를 두 번 부를 때 다른 memo 에서 add() 로 옮기면
   * 두 번째 피벗이 씬을 훔쳐 가 화면의 wrap 이 빈 껍데기가 된다 (2026-09-04: 무대가 비어 있었다). 여기서는 호출마다 제 씬을 갖는다
   */
  const { wrap, scene } = useMemo(() => {
    const scene = cloneSkeleton(gltf.scene);
    // 피벗 — 리그 탐색이 +x 정면을 보게 (머리말 ★)
    const pivot = new THREE.Group();
    pivot.rotation.y = PIVOT_YAW;
    pivot.add(scene);
    const wrap = new THREE.Group();
    wrap.add(pivot);
    return { wrap, scene };
  }, [gltf.scene]);
  const group = useRef<THREE.Group>(null);
  const fxRoot = useRef<THREE.Group>(null);

  const { scale, lift, poser, muzzle, gun, slots } = useMemo(() => {
    wrap.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(wrap);
    const h = box.max.y - box.min.y;
    const scale = Number.isFinite(h) && h > 1e-4 ? HEIGHT / h : 1;
    const lift = Number.isFinite(box.min.y) ? -box.min.y * scale : 0;
    scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
    });
    const rig = buildRig(wrap);
    if (rig) curlHands(rig, wrap);
    const poser = rig ? new EnforcerPoser(rig) : null;
    const muzzle = makeMuzzle(scale);
    let gun: THREE.Object3D | null = null;
    if (rig) {
      /*
       * memo 가 두 번 돌면(dev StrictMode) 손에 총이 둘이 된다. React 는 **첫 번째** 결과를 쓰므로 두 번째 호출이 먼저 단 총을
       * 떼면 화면의 총(첫 결과)이 고아가 되어 원점 근처에 남고 섬광도 거기서 핀다 (2026-09-04 실측: gunWorld ≈ (0,0,0)).
       * 그래서 이미 달린 총이 있으면 **그것을 그대로 쓴다** — 어느 호출의 결과가 남든 같은 객체다
       */
      const hand = rig.armR[rig.armR.length - 1];
      const existing = hand.children.find((c) => c.name === 'executioner_gun');
      if (existing) gun = existing;
      else {
        gun = new THREE.Group();
        gun.name = 'executioner_gun';
        const g = gunGltf.scene.clone(true);
        g.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.frustumCulled = false;
        });
        gun.add(g);
        attachRifle(rig, gun, GUN);
      }
    } else {
      console.warn('[Executioner] 리그를 못 읽어 총 없이 선다');
    }
    const slots = Array.from({ length: IMPACT_SLOTS }, makeImpactSlot);
    return { scale, lift, poser, muzzle, gun, slots };
  }, [wrap, scene, gunGltf.scene]);

  // 총구 섬광은 effect 에서 달았다 뗀다 (Enforcer.tsx 의 StrictMode 함정과 같은 이유)
  useEffect(() => {
    if (!gun) return;
    muzzle.attach(gun);
    return () => muzzle.detach();
  }, [gun, muzzle]);
  useEffect(() => {
    const root = fxRoot.current;
    if (!root) return;
    for (const s of slots) root.add(s.flash, s.light, s.sparks, s.tracer);
    return () => {
      for (const s of slots) root.remove(s.flash, s.light, s.sparks, s.tracer);
    };
  }, [slots]);

  const st = useRef({ heading: 0, seenShotAt: -Infinity, nextSlot: 0 });
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __executionerTargets?: () => string[] }).__executionerTargets = () => {
      const ids: string[] = [];
      remotePlayers.each((p) => ids.push(p.id));
      return ids;
    };
    (window as unknown as { __executionerDebug?: unknown }).__executionerDebug = () => {
      const g = group.current;
      if (!g) return null;
      g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g);
      const nan: string[] = [];
      let geoBox: number[][] | null = null;
      g.traverse((o) => {
        if (o.matrixWorld.elements.some((v) => !Number.isFinite(v))) nan.push(`${o.type}:${o.name}`);
        const m = o as THREE.SkinnedMesh;
        if (m.isSkinnedMesh) {
          m.geometry.computeBoundingBox();
          const b = m.geometry.boundingBox!;
          geoBox = [b.min.toArray(), b.max.toArray()];
        }
      });
      const fw = muzzle.flash.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2));
      const gw = gun ? gun.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)) : null;
      return { scale, lift, rig: !!poser, gun: !!gun, pos: g.position.toArray(), box: [box.min.toArray(), box.max.toArray()], nan: nan.slice(0, 8), nanCount: nan.length, geoBox, shots: executioner.get().shots, phase: executioner.get().phase, impacts: slots.map((s) => (Number.isFinite(s.at) ? s.origin.toArray().map((v) => +v.toFixed(2)) : null)), muzzle: { visible: muzzle.flash.visible, parent: muzzle.flash.parent?.name ?? null, world: fw, scale: +muzzle.flash.scale.x.toFixed(3), light: +muzzle.light.intensity.toFixed(1), gunWorld: gw, gunScale: gun ? +gun.scale.x.toFixed(3) : null } };
    };
  }, [scale, lift, poser, gun]);
  const tmpTarget = useMemo(() => new THREE.Vector3(), []);
  const tmpMuzzle = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const now = performance.now();
    const g = group.current;
    if (!g) return;
    const e = executioner.get();

    // 표적 자리 — 격리된 몸(remotePlayers)이 있으면 그 가슴, 없으면 fallback(내 자리)
    let hasTarget = false;
    if (e.phase !== 'idle') {
      const p = e.targetId ? remotePlayers.get(e.targetId) : undefined;
      if (p) {
        tmpTarget.set(p.pose.x, p.pose.y + CHEST_Y, p.pose.z);
        hasTarget = true;
      } else if (e.fallback) {
        tmpTarget.set(e.fallback.x, CHEST_Y, e.fallback.z);
        hasTarget = true;
      }
    }
    // 겉 그룹 heading — idle 이면 홀(+z)을 본다. 표적이 있으면 그쪽으로 돈다
    const want = hasTarget ? Math.atan2(tmpTarget.x - g.position.x, tmpTarget.z - g.position.z) : 0;
    let d = want - st.current.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    st.current.heading += d * (1 - Math.exp(-dt * TURN));
    g.rotation.y = st.current.heading;

    let shotAt = e.phase === 'fire' ? e.shotAt : -Infinity;
    // 개발 화면 — window.__executionerFreeze = 60 이면 섬광·임팩트를 그 나이(ms)에 멈춰 세워 스크린샷으로 본다
    const freeze = import.meta.env.DEV ? (window as unknown as { __executionerFreeze?: number }).__executionerFreeze : undefined;
    if (freeze !== undefined) shotAt = now - freeze;
    poser?.update(dt, { mode: MODE_OF[e.phase], shotAt: Number.isFinite(shotAt) ? shotAt : undefined }, now);
    muzzle.update(shotAt, now);

    // 새 발 — 총성 · 표적 가슴에 임팩트 · 총구에서 표적까지 예광
    if (Number.isFinite(e.shotAt) && e.shotAt !== st.current.seenShotAt) {
      st.current.seenShotAt = e.shotAt;
      gunshot();
      if (hasTarget && gun) {
        gun.updateMatrixWorld(true);
        tmpMuzzle.copy(MUZZLE_LOCAL).applyMatrix4(gun.matrixWorld);
        const hit = tmpTarget.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.2));
        const slot = slots[st.current.nextSlot % slots.length];
        st.current.nextSlot += 1;
        fireImpact(slot, now, hit, tmpMuzzle);
      }
    }
    for (const s of slots) updateImpact(s, freeze !== undefined && Number.isFinite(s.at) ? s.at + freeze : now);
  });

  return (
    <>
      {/* 바닥(y 0)에 선다 — 단상(0.75)이 있던 자리 그대로, 높이만 없다 */}
      <group ref={group} position={[0, 0, STAGE_Z]} name="처형자">
        <group scale={scale} position={[0, lift, 0]} rotation-y={MODEL_YAW}>
          <primitive object={wrap} />
        </group>
      </group>
      {/* 임팩트는 월드 좌표 — 처형자 그룹 밖 */}
      <group ref={fxRoot} name="처형 임팩트" />
    </>
  );
}

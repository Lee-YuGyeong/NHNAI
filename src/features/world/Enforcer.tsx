/**
 * 무장 심문 AI 의 몸 — public/world/enforcer.glb (Tripo Studio 생성 → 리깅 → 클립 제거 → 경량화, tools/enforcer-glb.sh) + 소총 enforcer_rifle.glb.
 *
 *   EnforcerBody — 총 든 로봇의 몸. 자세(idle·walk·run·aim)를 매 프레임 함수로 묻는다 (RobotAvatar 와 같은 규약).
 *                  중앙 시설의 경비(AgentRobot body="armed")와 출동하는 심문 AI 가 같이 쓴다.
 *   Enforcer     — enforcerStore 의 phase 를 읽어: 출입구(spawn)에 나타나 **달려오고**(run) → 플레이어 앞 STAND_OFF 에 서서 **조준·사격**(aim,
 *                  총구 섬광 점광원, 한 발마다 내 체력이 깎인다) → 판정 자막 동안 조준한 채 서 있다가 → **걸어서**(walk) 출입구로 돌아가 사라진다.
 *
 * 애니메이션은 GLB 클립이 아니라 enforcerPose.ts 가 뼈를 직접 움직인다 — Tripo 프리셋 리타겟이 뼈 이름표 혼선으로 엉켜서(2026-08-30).
 * 모델은 +x 를 보므로 안쪽 그룹을 −90° 돌려 +z 를 보게 하고, 겉 그룹의 heading(atan2(dx,dz))이 플레이어를 향한다.
 * 화면 플래시·자막은 EnforcerHud 가, 피격 연출은 DamageHud·Downed 가 맡는다 (DOM·카메라).
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { useAsset } from '@/world/assets/loader';
import { health, SHOT_DAMAGE } from '@/world/mp/health';

import { attachRifle, buildRig, curlHands, EnforcerPoser, POSE, type PoseMode } from './enforcerPose';
import { makeMuzzle } from './muzzle';
import { enforcer, SHOOT_MS } from './enforcerStore';

/** 심문 AI 키(m) — 참가자(1.72)보다 크다. 위압 */
const HEIGHT = 2.3;
const RUN = 5.2;
const WALK = 1.9;
const STAND_OFF = 4.5;
/** 사격 간격 — 섬광·피해 */
const SHOT_EVERY_MS = 320;
/** 모델(+x 를 본다)을 +z 를 보게 — 겉 그룹의 heading 계산이 +z 기준이다 */
const MODEL_YAW = -Math.PI / 2;


/**
 * 총 든 로봇의 몸. 자리·방향은 부모 그룹이 정한다 (발은 y 0).
 *   getMode    — 이 프레임의 자세
 *   getFlashAt — 마지막 발사 시각(ms). 없으면 섬광 없음
 *   getSpeed   — 지금 나아가는 속도(m/s). 주면 걸음 빠르기가 여기 맞춰진다 (안 주면 고정 박자로 종종거린다)
 */
export function EnforcerBody({ getMode, getFlashAt, getSpeed, height = HEIGHT }: { getMode: () => PoseMode; getFlashAt?: () => number; getSpeed?: () => number; height?: number }) {
  const gltf = useAsset('enforcer');
  const rifleGltf = useAsset('enforcer_rifle');
  const scene = useMemo(() => cloneSkeleton(gltf.scene), [gltf.scene]);
  const { scale, lift, poser, muzzle, rifle } = useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const h = box.max.y - box.min.y;
    const scale = Number.isFinite(h) && h > 1e-4 ? height / h : 1;
    // 리깅된 Tripo 모델은 바운딩 박스가 y 0.5 부터 시작한다 — 발이 바닥에 닿게 내린다
    const lift = Number.isFinite(box.min.y) ? -box.min.y * scale : 0;
    scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
    });
    const rig = buildRig(scene);
    // 손가락 뼈가 없어 손이 편 채로 굳어 있다 — 지오메트리에 굽힘을 한 번 구워 넣는다 (인스턴스끼리 공유)
    if (rig) curlHands(rig, scene);
    const poser = rig ? new EnforcerPoser(rig) : null;
    // 소총은 오른손의 자식 — 총구 섬광(빛 + 불꽃 판)은 소총 끝(+z 가 총열)에 매단다. 한 벌은 muzzle.ts 것이다
    const muzzle = makeMuzzle(scale);
    let rifle: THREE.Object3D | null = null;
    if (rig) {
      rifle = rifleGltf.scene.clone(true);
      rifle.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.frustumCulled = false;
      });
      attachRifle(rig, rifle);
    } else {
      console.warn('[Enforcer] 리그를 못 읽어 소총 없이 선다');
    }
    return { scale, lift, poser, muzzle, rifle };
  }, [scene, rifleGltf.scene, height]);
  /*
   * 총구의 빛과 섬광 판은 **여기서 달았다 뗀다**. useMemo 안에서 달면 dev StrictMode 가 마운트를 두 번 흉내 낼 때
   * 정리(cleanup)가 곧바로 한 번 돌아 빛과 판이 소총에서 떨어져 나간 채로 남는다 — 그러면 개발 화면에서만 **총구가 안 빛난다**
   * (2026-08-31 확인: 순찰 경비가 다섯 발을 쏘는 동안 muzzle.intensity 가 한 번도 안 쓰였다). 붙이는 것도 effect 에서 하면 다시 붙는다.
   */
  useEffect(() => {
    if (!rifle) return;
    muzzle.attach(rifle);
    return () => muzzle.detach();
  }, [rifle, muzzle]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const flashAt = getFlashAt?.() ?? -Infinity;
    // 속도는 m/s 로 들어온다 — 자세는 모델 단위로 셈하므로 나눠서 넘긴다
    const mps = getSpeed?.();
    poser?.update(dt, { mode: getMode(), shotAt: Number.isFinite(flashAt) ? flashAt : undefined, speed: mps === undefined ? undefined : mps / scale });
    // 총구 — 한 발마다 새 크기·각도로 피었다가 제곱으로 죽는다 (muzzle.ts)
    muzzle.update(flashAt, performance.now());
  });

  return (
    <group scale={scale} position={[0, lift, 0]} rotation-y={MODEL_YAW}>
      <primitive object={scene} />
    </group>
  );
}

export function Enforcer({ spawn }: { spawn: { x: number; z: number } }) {
  const camera = useThree((s) => s.camera);
  const group = useRef<THREE.Group>(null);
  const st = useRef({ x: spawn.x, z: spawn.z, heading: 0, mode: 'idle' as PoseMode, seq: 0, lastShot: 0, visible: false, speed: 0, px: spawn.x, pz: spawn.z });
  const phase = useSyncExternalStore(enforcer.subscribe, () => enforcer.get().phase, () => 'idle' as const);
  const getMode = useMemo(() => () => st.current.mode, []);
  const getFlashAt = useMemo(() => () => (enforcer.get().phase === 'shoot' ? enforcer.get().flashAt : -Infinity), []);
  const getSpeed = useMemo(() => () => st.current.speed, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const s = st.current;
    const g = group.current;
    if (!g) return;
    const e = enforcer.get();
    if (e.unit !== null) {
      // 이번 출동은 순찰 중인 총 든 경비(AgentRobot)가 맡았다 — 이 몸은 나오지 않는다
      s.seq = e.seq;
      s.visible = false;
      g.visible = false;
      return;
    }
    if (e.seq !== s.seq) {
      // 새 출동 — 출입구에서 시작
      s.seq = e.seq;
      s.x = spawn.x;
      s.z = spawn.z;
      s.visible = true;
    }
    const cx = camera.position.x;
    const cz = camera.position.z;
    let want = s.heading;
    const toward = (tx: number, tz: number, stop: number, speed: number): boolean => {
      const dx = tx - s.x;
      const dz = tz - s.z;
      const d = Math.hypot(dx, dz);
      want = Math.atan2(dx, dz);
      // 여유 없이 물으면 못 닿는다 — 걸음이 남은 거리에 점근해 반올림 한 톨에 도착 판정이 영영 안 난다 (AgentRobot 의 walkTo 참고)
      if (d <= stop + 1e-3) return true;
      const step = Math.min(d - stop, speed * dt);
      s.x += (dx / d) * step;
      s.z += (dz / d) * step;
      return false;
    };

    if (e.phase === 'run') {
      s.mode = 'run';
      if (toward(cx, cz, STAND_OFF, RUN)) enforcer.arrived();
    } else if (e.phase === 'shoot') {
      s.mode = 'aim';
      want = Math.atan2(cx - s.x, cz - s.z);
      const now = performance.now();
      if (now - s.lastShot > SHOT_EVERY_MS && now - e.flashAt < SHOOT_MS) {
        s.lastShot = now;
        enforcer.flash();
        // 한 발마다 맞는다 — 체력이 다 닳으면 쓰러진다 (health → DamageHud·Downed·DefeatHud)
        health.hit(SHOT_DAMAGE, '피격', now);
      }
    } else if (e.phase === 'verdict') {
      s.mode = 'aim';
      want = Math.atan2(cx - s.x, cz - s.z);
    } else if (e.phase === 'leave') {
      s.mode = 'walk';
      if (toward(spawn.x, spawn.z, 0.3, WALK)) {
        s.visible = false;
        enforcer.left();
      }
    } else {
      s.mode = 'idle';
      s.visible = false;
    }

    let dh = want - s.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    s.heading += dh * Math.min(1, dt * 8);
    // 실제로 나아간 거리로 속도를 낸다 — 걸음 빠르기가 여기 맞춰진다 (자세가 미끄러지지 않게).
    // dt 0 인 프레임에 나누면 NaN 이 되고 그 뒤로 영원히 NaN 이다 → 자세 엔진이 몸을 NaN 으로 접는다 (AgentRobot 의 같은 자리 참고)
    if (dt > 1e-4) s.speed += (Math.hypot(s.x - s.px, s.z - s.pz) / dt - s.speed) * Math.min(1, dt * 8);
    if (!Number.isFinite(s.speed)) s.speed = 0;
    s.px = s.x;
    s.pz = s.z;
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.heading;
    g.visible = s.visible;
  });

  return (
    <group ref={group} visible={false}>
      <EnforcerBody getMode={getMode} getFlashAt={getFlashAt} getSpeed={getSpeed} />
      {phase !== 'idle' ? (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.5, 24]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.4} />
        </mesh>
      ) : null}
    </group>
  );
}

/** 자세 파라미터를 밖에서 볼 수 있게 (DEV 확인용) */
export const ENFORCER_POSE = POSE;

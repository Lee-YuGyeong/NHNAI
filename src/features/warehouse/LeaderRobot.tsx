/**
 * 격납고 홀 무대 위의 리더 대형 로봇 — 심문소(/interrogation)의 LeaderOnStage(features/arena)와 **같은 몸**을 창고 맵에도 세운다.
 *
 * 2026-09-01 몸을 새로 뽑았다 (사용자: "무대에 서 있는 로봇 디자인이 마음에 안 든다 — 위압감 넘치고 총을 든 최종보스로").
 * 예전 몸은 사용자가 준 리깅 GLB 였고 그 안의 클립 3개(걷기·발사·화남)를 재생했다. 지금 몸은 무장 심문 AI 와 같은 파이프라인이다:
 *   Tripo Studio 로 **빈손 T 포즈**의 최종보스 로봇(leader_boss)과 **대형 캐논**(leader_cannon)을 따로 뽑고(tools/leader-parts.json),
 *   리깅해 뼈·스킨만 남긴 뒤(tools/leader-robot-glb.sh 의 주석 절차) 캐논은 오른손 뼈에 붙인다.
 *   ★ 총을 든 채 한 덩어리로 뽑으면 리거가 손과 총을 뒤섞는다 — 그래서 몸과 총이 따로다 (enforcer 에서 겪은 것과 같다).
 *
 * 애니메이션은 GLB 클립이 아니라 **코드**가 뼈를 움직인다 — features/world/enforcerPose.ts 의 리그 탐색(뼈 이름을 안 믿고
 * 바인드 포즈의 위치로 팔·다리 사슬을 찾는다)과 자세 엔진을 그대로 쓴다. Tripo 자동 리그는 뼈 이름표가 뒤섞여 프리셋 클립이
 * 엉키기 때문이다 (2026-08-30 확인). 리더만 쓰는 'angry' 는 그 파일에 모드로 하나 더 있다.
 *
 * 동작(LeaderAction)과 자세의 대응 — **판이 부르는 이름은 그대로다** (ArenaFeature 의 getLeaderAction 은 손대지 않았다):
 *   idle  → 캐논을 두 손으로 든 채 숨쉬며 둘러본다      walk → 제자리 걸음 (격납고 홀 시연에서만)
 *   angry → 캐논을 대각선 위로 치켜들고 몸을 떤다        aim  → 몸통을 비틀어 총구를 방(플레이어) 쪽으로
 *   fire  → 조준 자세에서 FIRE_EVERY_MS 마다 한 발 — 반동·총구 섬광(가산 스프라이트 + 점광원)
 *
 * 크기: 심문소 리더와 같은 위계 — 키 4.3m (참가자 1.72 의 2.5배). 자리·회전은 부모가 정한다 (발이 y 0).
 * 모델은 +x 를 보므로 안쪽 그룹을 −90° 돌려 +z 를 정면으로 만든다 — 회전 0 이면 무대에서 방을 마주 본다.
 *
 * 상태는 **함수로** 받는다 (RobotAvatar·EnforcerBody 와 같은 규약) — 프레임마다 물어본다.
 */

import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { attachRifle, buildRig, curlHands, EnforcerPoser, type PoseMode } from '@/features/world/enforcerPose';
import { LEADER_NAME } from '@/lab/personas';
import { useAsset } from '@/world/assets/loader';
import { STAGE, STAGE_Z } from '@/world/map/warehouse/layout';

export type LeaderAction = 'idle' | 'walk' | 'angry' | 'fire' | 'aim';

/** 키(m). 심문소 리더(1.72 × 2.5)와 같다 — 심문소(features/arena/LeaderOnStage)도 이 값으로 이름표를 건다 */
export const LEADER_HEIGHT = 4.3;
const HEIGHT = LEADER_HEIGHT;
/** 모델(+x 를 본다)을 +z 를 보게 — 부모의 회전 0 이 곧 정면이다 */
const MODEL_YAW = -Math.PI / 2;
/** 'fire' 동안의 발사 간격(ms) — 큰 몸이라 심문 AI(320)보다 느리고 무겁게 */
const FIRE_EVERY_MS = 430;
/** 총구 섬광이 피었다 지는 시간(ms) · 점광원 세기 · 섬광 판 크기(캐논 좌표, 총 길이 1 기준) */
const FLASH_MS = 130;
const FLASH_LIGHT = 260;
const FLASH_SIZE = 0.6;

/**
 * 대형 캐논의 크기·손잡이 — 캐논 좌표(길이 1, +z 총열·+y 위, tools/leader-parts.json 의 leader_cannon)에서 잰 값이다.
 * len 0.45 = 키의 45% ≈ 1.9m — 4.3m 몸에 걸맞은 화기. 손잡이는 정사영 측면도의 눈금으로 읽었다 (총 중심 뒤 0.21, 바닥에서 0.10).
 */
const CANNON = { len: 0.45, grip: [0, 0.1, -0.21] as const };
/** 총열 축의 높이와 총구 끝(캐논 좌표) — 섬광 빛과 판을 매다는 자리 */
const MUZZLE_Y = 0.26;
const MUZZLE_Z = 0.5;

/** 동작 → 자세. fire 는 조준 자세에 반동(shotAt)만 얹는다 */
const MODE_OF: Record<LeaderAction, PoseMode> = { idle: 'idle', walk: 'walk', angry: 'angry', fire: 'aim', aim: 'aim' };

/**
 * 총구 섬광 판의 그림 — 가운데가 하얗게 타고 바깥으로 퍼지는 원에 십자 스파이크.
 * (심문 AI 것과 같은 그림이지만 색이 리더의 붉은 계열이다 — features/world/Enforcer.tsx 의 flashTexture 참고)
 */
let flashTex: THREE.Texture | null = null;
function flashTexture(): THREE.Texture | null {
  if (flashTex) return flashTex;
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  if (!g) return null;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.22, 'rgba(255,210,170,0.95)');
  grd.addColorStop(0.5, 'rgba(255,90,60,0.5)');
  grd.addColorStop(1, 'rgba(220,40,30,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(255,200,170,0.4)';
  g.fillRect(0, 60, 128, 8);
  g.fillRect(60, 0, 8, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  flashTex = t;
  return t;
}

/* ─────────────────────────────── 로봇 ─────────────────────────────── */

export function LeaderRobot({ getAction }: { getAction: () => LeaderAction }) {
  const gltf = useAsset('leader_robot');
  const cannonGltf = useAsset('leader_cannon');
  const scene = useMemo(() => cloneSkeleton(gltf.scene), [gltf.scene]);

  const { scale, lift, poser, muzzle, flash, cannon } = useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const h = box.max.y - box.min.y;
    const scale = Number.isFinite(h) && h > 1e-4 ? HEIGHT / h : 1;
    // 리깅된 Tripo 모델은 바운딩 박스가 y 0 보다 위에서 시작한다 — 발이 무대 윗면에 닿게 내린다
    const lift = Number.isFinite(box.min.y) ? -box.min.y * scale : 0;
    scene.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
    });
    const rig = buildRig(scene);
    // 손가락 뼈가 없어 손이 편 채로 굳어 있다 — 지오메트리에 굽힘을 한 번 구워 넣는다
    if (rig) curlHands(rig, scene);
    const poser = rig ? new EnforcerPoser(rig) : null;
    const muzzle = new THREE.PointLight('#ffb08a', 0, 26 / scale, 1.5);
    const flash = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: flashTexture() ?? undefined, color: '#ffd9c0', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }),
    );
    flash.visible = false;
    let cannon: THREE.Object3D | null = null;
    if (rig) {
      cannon = cannonGltf.scene.clone(true);
      cannon.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.frustumCulled = false;
      });
      attachRifle(rig, cannon, CANNON);
      // 총구는 캐논 좌표의 앞 끝 — 빛과 섬광 판을 거기 매단다
      muzzle.position.set(0, MUZZLE_Y, MUZZLE_Z);
      flash.position.set(0, MUZZLE_Y, MUZZLE_Z + 0.12);
      flash.frustumCulled = false;
    } else {
      console.warn('[LeaderRobot] 리그를 못 읽어 캐논 없이 선다');
    }
    return { scale, lift, poser, muzzle, flash, cannon };
  }, [scene, cannonGltf.scene]);

  /*
   * 빛과 섬광 판은 **effect 에서** 달았다 뗀다 — useMemo 안에서 달면 dev StrictMode 가 마운트를 두 번 흉내 낼 때
   * 정리가 곧바로 돌아 둘 다 캐논에서 떨어져 나간 채 남는다 (2026-08-31 심문 AI 에서 겪은 것과 같은 함정).
   */
  useEffect(() => {
    if (!cannon) return;
    cannon.add(muzzle);
    cannon.add(flash);
    return () => {
      muzzle.removeFromParent();
      flash.removeFromParent();
    };
  }, [cannon, muzzle, flash]);

  const state = useRef({ action: 'idle' as LeaderAction, shotAt: -Infinity, size: 1, spin: 0 });
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __leaderDebug?: unknown }).__leaderDebug = { state: state.current, poser, cannon };
  }, [poser, cannon]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const st = state.current;
    const action = getAction();
    const now = performance.now();
    // 발사 — 조준 자세에 반동을 얹는 것이 곧 한 발이다. 동작을 벗어나면 더 안 쏜다
    if (action === 'fire') {
      if (now - st.shotAt > FIRE_EVERY_MS) {
        st.shotAt = now;
        // 발마다 섬광의 크기·각도를 새로 뽑는다 — 같은 그림이 반복되지 않게
        st.size = 0.9 + Math.random() * 0.5;
        st.spin = Math.random() * Math.PI;
      }
    } else if (st.action === 'fire') {
      st.shotAt = -Infinity;
    }
    st.action = action;
    poser?.update(dt, { mode: MODE_OF[action], shotAt: Number.isFinite(st.shotAt) ? st.shotAt : undefined }, now);

    // 총구 — 한 발마다 피었다가 제곱으로 죽는다
    const age = now - st.shotAt;
    const k = age >= 0 && age < FLASH_MS ? 1 - age / FLASH_MS : 0;
    muzzle.intensity = FLASH_LIGHT * k * k;
    flash.visible = k > 0;
    if (k > 0) {
      const mat = flash.material as THREE.SpriteMaterial;
      mat.opacity = Math.min(1, k * 1.8);
      mat.rotation = st.spin;
      flash.scale.setScalar(FLASH_SIZE * st.size * (0.55 + 0.75 * k));
    }
  });

  return (
    <group scale={scale} position={[0, lift, 0]} rotation-y={MODEL_YAW}>
      <primitive object={scene} />
    </group>
  );
}

/* ─────────────────────────────── 무대 위 (시연 순서) ─────────────────────────────── */

/** 시연 순서 — [동작, 지속(초)] */
const SHOW: readonly [LeaderAction, number][] = [
  ['idle', 4],
  ['angry', 4.2],
  ['idle', 1.2],
  ['aim', 2.6],
  ['fire', 2.2],
  ['idle', 1.5],
  ['walk', 5],
];
/**
 * 걷기를 뺀 순서 — 심문소(/interrogation)의 시작 전 화면이 이걸 쓴다 (2026-08-29 사용자 결정).
 * 거기 리더는 무대에 **서 있는** 존재라 제자리걷기가 어울리지 않는다. 화남 · 조준 · 발사만 돈다.
 * 걷기 자리(5초)는 대기로 메우지 않고 그냥 뺀다 — 한 바퀴가 그만큼 짧아진다.
 */
const SHOW_STILL: readonly [LeaderAction, number][] = SHOW.filter(([a]) => a !== 'walk');

const TOTAL = (steps: readonly [LeaderAction, number][]) => steps.reduce((s, [, d]) => s + d, 0);
/** 한 바퀴(초) — 격납고 홀 / 걷기를 뺀 판 */
export const LEADER_SHOW_SECONDS = TOTAL(SHOW);
export const LEADER_SHOW_STILL_SECONDS = TOTAL(SHOW_STILL);

/**
 * 시연 순서를 **시각 하나로** 읽는다 — 상태가 없어 어디서든 쓴다.
 * 격납고 홀(아래 LeaderOnHangarStage)과 심문소의 시작 전 화면(features/arena/ArenaFeature)이 같은 이 표를 본다.
 * @param seconds 시연이 시작된 뒤 흐른 시간(초)
 * @param walk 걷기를 섞을지 — 심문소는 false 로 부른다
 */
export function leaderShowAction(seconds: number, walk = true): LeaderAction {
  const steps = walk ? SHOW : SHOW_STILL;
  const total = walk ? LEADER_SHOW_SECONDS : LEADER_SHOW_STILL_SECONDS;
  let t = seconds % total;
  if (t < 0) t += total;
  for (const [action, d] of steps) {
    if (t < d) return action;
    t -= d;
  }
  return 'idle';
}

/** 무대 위의 리더 — 격납고 홀(/warehouse)에서만. 이름표는 심문소 리더와 같은 색 */
export function LeaderOnHangarStage() {
  const clock = useRef(0);
  /** DEV 에서 window.__leader.play('aim') 로 잠깐 강제한다 — 확인용 */
  const forced = useRef<{ action: LeaderAction; until: number } | null>(null);

  useFrame((_, delta) => {
    clock.current += Math.min(delta, 0.1);
  });
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __leader?: unknown }).__leader = {
      play: (action: LeaderAction, seconds = 6) => {
        forced.current = { action, until: clock.current + seconds };
      },
    };
    return () => {
      delete (window as unknown as { __leader?: unknown }).__leader;
    };
  }, []);

  const getAction = useMemo(
    () => (): LeaderAction => {
      const f = forced.current;
      if (f) {
        if (clock.current < f.until) return f.action;
        forced.current = null;
      }
      return leaderShowAction(clock.current);
    },
    [],
  );

  return (
    <group position={[0, STAGE.h, STAGE_Z]}>
      <Suspense fallback={null}>
        <LeaderRobot getAction={getAction} />
      </Suspense>
      {/* 발밑 그림자 원반 — 없으면 무대 위에 떠 보인다 */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <circleGeometry args={[1.1, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} />
      </mesh>
      <Html position={[0, HEIGHT + 0.6, 0]} center distanceFactor={14} zIndexRange={[10, 0]}>
        <div style={{ pointerEvents: 'none', whiteSpace: 'nowrap', borderRadius: 999, background: 'rgba(0, 0, 0, 0.6)', padding: '2px 8px', fontSize: 11, fontWeight: 700, color: '#e04e42' }}>
          {LEADER_NAME}
        </div>
      </Html>
    </group>
  );
}

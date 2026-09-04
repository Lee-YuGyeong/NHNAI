/**
 * 챕터 1 후반 — 중앙 시설(/central) 캔버스에 얹는다.
 *
 *   - 감시 AI 6(AgentRobot, 총 든 3 + 기존 3): 코어 둘레·홀을 오가며 플레이어를 본다 — 돌발 행동이면 총 든 놈이 다가와 추궁, 의심이 높으면 따라다닌다.
 *     시설이 멈추면(frozen) 서고, staring 이면 플레이어를 본다. 기존 로봇 둘은 sealed 가 되면 들어온 문 앞으로 걸어가 막아선다.
 *     의심도 100 이면 총 든 놈 중 가장 가까운 놈이 순찰을 끊고 쏜다
 *   - 락다운 조명: frozen 동안 튜브 재질을 붉게 + 경보 점광원 (복도 Chapter1Scene 과 같은 방식)
 *   - 트리거: 단(코어) 반경 안으로 들어오면 chapter1.onCore · 패턴 스캔(scan.ts) 동안 내 자리·정면을 scan.track 에 준다
 *   - 챕터 2(Chapter2Scene): 락다운 뒤 — 검문·행동 분석·유도등·검증실 앞 줄. 경비의 검문 걸음과 재배치(post)는 AgentRobot 이 chapter2 를 읽는다
 */

import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';

import { MAPS } from '@/world/map';
import { CORE_KEEPOUT, DAIS, NEAR_Z } from '@/world/map/central/layout';
import { STRIP_MAT, TUBE_MAT, UPPER_TUBE_MAT, hdr } from '@/world/map/scifi';

import { AgentRobot, type AgentSpec } from './AgentRobot';
import { chapter1 } from './chapter1';
import { Chapter2Scene } from './Chapter2Scene';
import { interrogation } from './interrogation';
import { scan } from './scan';

/**
 * 여섯 — 총 든 로봇 셋(armed, EnforcerBody)은 **돌아다니고**, 기존 로봇 모델 셋(RobotAvatar)이 **문을 지킨다** (2026-08-30 사용자:
 * 입구를 지키는 건 일반 로봇, 총 든 로봇은 순찰. 검문·추궁처럼 **다가와서 묻는 쪽**은 총 든 로봇).
 *   0  총 든 · 코어 둘레 안쪽 궤도 — 챕터 2 의 검문 경비(UNIT-21). 이동 명령 뒤 post: 줄 머리 옆에서 줄을 본다
 *   1·2 기존 · 앞·뒤 가로줄을 오가다 sealed 면 들어온 문 앞(guard)에 선다 — 검문 때 A17-044·A17-128 로 답한다(chapter2.ROLL_SPOTS = guard 자리).
 *       이동 명령 뒤 post: 검증실(먼 문) 양옆에서 홀을 본다
 *   3·4 총 든 · 좌우 안쪽 세로줄을 오간다. 의심도 100 이면 이 중(0 포함) 나와 가장 가까운 놈이 순찰을 끊고 쏜다 (enforcerStore.dispatch(by))
 *   5  기존 · 오른쪽 안쪽 세로줄 (4번과 나란히, 2.5m 떨어져)
 *
 * ★ 순찰은 **홀 한가운데를 돈다** (2026-09-01 사용자: "벽의 기둥에 딱 붙어 걸어가지 말고, 걷는 로봇들이 잘 보이게 중앙 위주로.
 *   코어를 뚫고 지나가면 안 된다"). 예전엔 옆벽에서 5m 떨어진 세로줄(x ∓9)을 오갔는데, 그 줄은 기둥 사이에 끼어 있어
 *   플레이어의 시야에서는 벽에 붙어 서성이는 것처럼 보였다.
 *
 *   지금은 넷이 **코어를 도는 궤도**(반지름 6.8~9.8, 서로 다른 속도·방향)에 있고 둘은 코어 앞뒤를 가로지르는 줄에 있다.
 *   궤도 반지름은 전부 코어 우회 반경(CORE_KEEPOUT 5.9)보다 크고, 가로줄은 코어 중심에서 z 로 7.5m 떨어져 있다 —
 *   **어느 길도 코어를 지나지 않는다.** 바깥 반지름 9.8 도 옆벽(±14)·끝벽(−22·4)에서 4m 넘게 떨어져 있다.
 *   방향을 섞어 둔 건 여섯이 한 덩어리로 돌지 않게 하려는 것이다 (음수 speed = 반대로 돈다).
 */
const AGENTS: readonly AgentSpec[] = [
  { armed: true, orbit: { cx: DAIS.x, cz: DAIS.z, r: 7.2, speed: 0.14, phase: 0.4 }, post: { x: -4.0, z: -18.2, heading: -Math.PI / 2 } },
  // 코어 앞을 가로지른다 — 스폰에서 보면 바로 앞을 지나간다 (코어 중심에서 z 11.5. 스폰 원 한가운데는 비켜 간다)
  { line: { x0: -8, z0: 1, x1: 8, z1: 1, speed: 1.0, phase: 0.2 }, guard: { x: -1.3, z: NEAR_Z - 1.6 }, post: { x: -2.6, z: -20.3, heading: 0 } },
  // 코어 뒤를 가로지른다
  { line: { x0: 8, z0: -18, x1: -8, z1: -18, speed: 0.9, phase: 0.6 }, guard: { x: 1.3, z: NEAR_Z - 1.6 }, post: { x: 2.6, z: -20.3, heading: 0 } },
  { armed: true, orbit: { cx: DAIS.x, cz: DAIS.z, r: 8.8, speed: -0.12, phase: 1.6 } },
  { armed: true, orbit: { cx: DAIS.x, cz: DAIS.z, r: 6.9, speed: 0.17, phase: 3.4 } },
  { orbit: { cx: DAIS.x, cz: DAIS.z, r: 9.8, speed: -0.1, phase: 5.0 } },
];
export const CENTRAL_UNITS = ['UNIT-21', 'UNIT-33', 'UNIT-40', 'UNIT-52', 'UNIT-58', 'UNIT-63'];
/** 총 든 경비의 순번 — 대화창 초상(enforcer)·추궁 상대·의심도 100 의 사수를 이 목록에서 고른다 (WorldFeature) */
export const CENTRAL_ARMED_UNITS: readonly number[] = AGENTS.flatMap((a, i) => (a.armed ? [i] : []));

/** 경비가 돌아가야 하는 곳 — 홀 한가운데 코어. 검문 자리·재배치 자리로 가는 직선이 코어를 지나면 여기서 돌아 나간다 (features/world/walk.ts) */
const AVOID = [CORE_KEEPOUT];

const NORMAL = { tube: TUBE_MAT.color.clone(), upper: UPPER_TUBE_MAT.color.clone(), strip: STRIP_MAT.color.clone() };
const RED = { tube: hdr('#ff6a5a', 0.7), upper: hdr('#ff6a5a', 0.45), strip: hdr('#ff4a3a', 0.8) };

function Lockdown({ on }: { on: boolean }) {
  useEffect(() => {
    if (!on) return;
    TUBE_MAT.color.copy(RED.tube);
    UPPER_TUBE_MAT.color.copy(RED.upper);
    STRIP_MAT.color.copy(RED.strip);
    return () => {
      TUBE_MAT.color.copy(NORMAL.tube);
      UPPER_TUBE_MAT.color.copy(NORMAL.upper);
      STRIP_MAT.color.copy(NORMAL.strip);
    };
  }, [on]);
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (light.current) light.current.intensity = on ? 16 + 10 * (0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 1.6)) : 0;
  });
  return <pointLight ref={light} position={[DAIS.x, 7, DAIS.z]} color="#ff5a4a" distance={26} decay={1.6} intensity={0} />;
}

/**
 * 코어 트리거 — 시설이 멈춘다. 단 앞 가장자리(z -6)가 스폰 원(z -5.9 까지) 바로 앞이라 "가까이 오면" 만으로는 스폰에서 바로 걸리고,
 * "단 위에 올라서면" 만으로는 받침 콘솔 링 충돌(r 3.8)에 막혀 실제로 못 올라간다(2026-08-30 사용자: "코어를 쳐다봤는데 진행이 안 돼").
 * 그래서 둘 중 하나: ① 단 가장자리까지 다가섰다(NEAR_R) ② 과학자의 도착 대사가 끝난 뒤(ARM_MS) 코어 근처(GAZE_R)에서 코어를 GAZE_S 초 쳐다봤다.
 */
const NEAR_R = DAIS.r + 0.6;
/** 스폰 원(중심 z -2.5, r 3.4)의 가장 먼 자리(≈11.9m)에서도 코어를 보면 걸리게 — 홀 어디서든 코어를 응시하면 진행 */
const GAZE_R = DAIS.r + 8.5;
const GAZE_S = 0.9;
const GAZE_COS = Math.cos((24 * Math.PI) / 180);
const ARM_MS = 5500;

function Triggers() {
  const camera = useThree((s) => s.camera);
  const st = useRef({ since: 0, gaze: 0 });
  const fwd = useRef(new THREE.Vector3());
  useFrame((_, delta) => {
    interrogation.maybeSmallTalk(performance.now());
    /*
     * 패턴 스캔 — **프레임마다** 내 자세를 넘긴다. 스캔이 걸린 뒤에만 넘기면, 경비가 이미 곁에 서 있던 경우
     * AgentRobot 이 같은 프레임에 arrived() 를 불러 기준이 한 번도 갱신되지 않은 초기값(0,0)으로 잡히고 —
     * 다음 프레임에 「엄청 움직였다」로 즉시 실패한다 (2026-08-30 확인). track 은 스캔 중이 아니면 자세만 적고 끝난다
     */
    camera.getWorldDirection(fwd.current);
    scan.track(camera.position.x, camera.position.z, fwd.current.x, fwd.current.z);
    const s = st.current;
    if (chapter1.get().phase !== 'arrive') {
      s.since = 0;
      return;
    }
    const now = performance.now();
    if (!s.since) s.since = now;
    const dx = DAIS.x - camera.position.x;
    const dz = DAIS.z - camera.position.z;
    const d = Math.hypot(dx, dz);
    if (d < NEAR_R) {
      chapter1.onCore();
      return;
    }
    if (now - s.since < ARM_MS || d > GAZE_R) {
      s.gaze = 0;
      return;
    }
    camera.getWorldDirection(fwd.current);
    const f = fwd.current;
    const fl = Math.hypot(f.x, f.z) || 1;
    const cos = (f.x * dx + f.z * dz) / (fl * d);
    s.gaze = cos > GAZE_COS ? s.gaze + Math.min(delta, 0.1) : 0;
    if (s.gaze >= GAZE_S) chapter1.onCore();
  });
  return null;
}

export function CentralChapterScene() {
  const frozen = useSyncExternalStore(chapter1.subscribe, () => chapter1.get().frozen, () => false);
  return (
    <group name="챕터 1 · 중앙 시설">
      {/*
       * 경비마다 제 Suspense 를 준다 (2026-09-01). 여섯을 한 울타리에 묶어 두면 **총 든 몸의 GLB 하나가 늦는 동안 여섯 다 사라진다** —
       * 문턱을 넘어 들어온 홀에 경비가 아무도 없다가 한꺼번에 나타났다 (사용자: "챕터 1 → 챕터 2 로 넘어갈 때 총 든 캐릭터가 안 보인다").
       * 이제는 제 모델이 온 놈부터 선다. 애초에 늦지 않도록 복도에서 미리 받아 두기도 한다 (WorldFeature 의 preloadAsset).
       */}
      {AGENTS.map((a, i) => (
        <Suspense fallback={null} key={i}>
          <AgentRobot spec={a} index={i} body={a.armed ? 'armed' : 'robot'} resolve={MAPS.central.resolveColliders} avoid={AVOID} />
        </Suspense>
      ))}
      <Lockdown on={frozen} />
      <Triggers />
      <Chapter2Scene />
    </group>
  );
}

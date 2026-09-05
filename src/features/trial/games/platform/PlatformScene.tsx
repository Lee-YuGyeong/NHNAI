/**
 * 움직이는 플랫폼 — /trial 시험용 화면. 검문소(features/interrogation)와 **같은 맵(govcenter) · 같은 다리(FreeRig) · 같은 발판(PlatformCourse)**을
 * 그대로 쓴다 (2026-09-05 사용자: "맵과 캐릭터는 동일하게"). 남의 몸은 WorldScene 의 Remotes (AI 좌석은 몸이 없어 로봇).
 * 발판·착지 판정은 서버가 하고, 발판 자리는 platformState 가 서버와 같은 함수로 그린다.
 */
import { Suspense, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { FreeRig, type Teleport } from '@/features/interrogation/scene/FreeRig';
import { PlatformCourse } from '@/features/interrogation/scene/PlatformCourse';
import { SelfAvatar } from '@/features/interrogation/scene/SelfAvatar';
import { platformState } from '@/features/interrogation/scene/platformState';
import { WarpFx } from '@/features/interrogation/scene/WarpFx';
import { warp } from '@/features/interrogation/scene/warp';
import { RobotAvatar } from '@/world/avatar/RobotAvatar';
import { BASE_FOV } from '@/world/input/input';
import { MAPS, type MapDef } from '@/world/map';
import type { BodyId } from '@/world/mp/bodies';
import { EYE_HEIGHT } from '@/world/mp/constants';
import { PAD_START_Z, PLATFORM_ARENA } from '@/world/mp/platform';
import type { AnimState } from '@/world/mp/protocol';
import { AdaptiveFov, Exposure, MouseLook, Remotes } from '@/world/scene/WorldScene';
import { WorldCanvas } from '@/world/scene/WorldCanvas';

const def: MapDef = MAPS.govcenter;
/** 출발 발판 위 */
const SPAWN = { x: 0, z: PAD_START_Z } as const;

/** AI 좌석(SUBJECT_nn)의 몸 — 자리는 스냅샷(platformState.botAt, y 포함). 발판 위(0.5)는 공중이 아니다 */
function PlatformBot({ id }: { id: string }) {
  const group = useRef<THREE.Group>(null);
  /** 순간이동 중의 몸 — 사람과 같다 (interrogation/scene/warp.ts). 이름표는 안 줄인다: 글씨는 몸이 아니다 */
  const warped = useRef<THREE.Group>(null);
  const pose = useRef({ y: 0, x: 0, z: 0, moving: false });
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const p = platformState.botAt(id);
    if (!p) return;
    const dx = p.x - pose.current.x;
    const dz = p.z - pose.current.z;
    if (Math.hypot(dx, dz) > 0.01) g.rotation.y = Math.atan2(dx, dz);
    pose.current = { x: p.x, z: p.z, y: p.y, moving: p.moving };
    g.position.set(p.x, p.y, p.z);
    const w = warp.bodyAt(id);
    if (warped.current) {
      warped.current.scale.set(w.xz, w.y, w.xz);
      warped.current.position.y = w.lift;
    }
  });
  const getAnim = (): AnimState => (pose.current.moving ? 'walk' : 'idle');
  const getAirborne = () => pose.current.y > platformState.groundAt(pose.current.x, pose.current.z, pose.current.y) + 0.02;
  return (
    <group ref={group}>
      <Suspense fallback={null}>
        <group ref={warped}>
          <RobotAvatar getAnim={getAnim} getAirborne={getAirborne} />
        </group>
      </Suspense>
      <Html position={[0, 2.0, 0]} center distanceFactor={9} zIndexRange={[10, 0]}>
        <div style={{ whiteSpace: 'nowrap', borderRadius: 999, background: 'rgba(0,0,0,0.6)', padding: '2px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#e8ddcd', pointerEvents: 'none' }}>
          {id}
        </div>
      </Html>
    </group>
  );
}

export interface PlatformSceneProps {
  myBody?: BodyId | null;
  roster: readonly { id: string }[];
  /** AI 좌석 — 스냅샷으로 움직인다 */
  aiIds?: readonly string[];
  /** 라운드가 열릴 때 출발 발판 위로 — 키가 바뀔 때만 옮긴다 (FreeRig) */
  teleport?: Teleport | null;
  sendMove: (x: number, z: number, y: number, heading: number, anim: AnimState) => void;
}

export function PlatformScene({ myBody = null, roster, aiIds = [], teleport = null, sendMove }: PlatformSceneProps) {
  return (
    <WorldCanvas
      quality="high"
      camera={{ position: [SPAWN.x, EYE_HEIGHT, SPAWN.z], fov: BASE_FOV, near: 0.1, far: 60 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
      }}
    >
      <AdaptiveFov />
      <Exposure value={def.exposure} />
      <color attach="background" args={[def.background]} />
      <fogExp2 attach="fog" args={[def.fog[0], def.fog[1]]} />
      <def.Lights flicker />
      <ambientLight intensity={def.ambient.intensity} color={def.ambient.color} />

      <Suspense fallback={null}>
        <def.Scene quality="high" />
        <PlatformCourse />
      </Suspense>
      {/* 떨어져 출발 발판으로 돌아가는 순간이동의 빛기둥 — 사람도 AI 좌석도 같은 것을 쓴다 (interrogation/scene/warp.ts) */}
      <WarpFx />
      {def.Effects ? <def.Effects /> : null}

      <Remotes roster={roster} bubbleTick={0} />
      {aiIds.map((id) => (
        <PlatformBot key={id} id={id} />
      ))}
      <FreeRig spawn={SPAWN} body={myBody} teleport={teleport} bounds={PLATFORM_ARENA} composing={false} paused={false} sendMove={sendMove} />
      <SelfAvatar body={myBody} />
      <MouseLook />
    </WorldCanvas>
  );
}

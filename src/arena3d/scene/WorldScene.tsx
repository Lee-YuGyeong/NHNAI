/**
 * 3D 월드 씬 — 여러 명이 같이 걸어다니는 공간. humanish 의 app/world/world-scene.tsx 에서 가져왔다.
 *
 * 배경은 mapDef 로 갈아 끼운다 (기본은 ../map/warehouse.tsx 창고). 이 파일은 캔버스·카메라·이동·송신만 쥔다.
 * Redux 를 모른다 — 명부(roster)와 말풍선 신호(bubbleTick)는 feature 가 props 로 준다.
 *
 * 경계는 mp/constants.ts 의 WORLD 하나뿐이고 서버가 같은 값으로 검증한다.
 */

import { Html, PointerLockControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, memo, useCallback, useEffect, useMemo, useReducer, useRef, useSyncExternalStore, type ComponentType } from 'react';
import * as THREE from 'three';

import { RobotAvatar } from '../avatar/RobotAvatar';
import {
  BASE_FOV,
  LOOK_SENSITIVITY,
  MAX_PITCH,
  attachKeyboard,
  fovForAspect,
  getTouchMode,
  input,
  resetInput,
  subscribeTouchMode,
} from '../input/input';
import { Furniture, Lights, SCREEN_FOCUS, Warehouse, groundHeightAt, resolveColliders } from '../map/warehouse';
import { EMOTE_MS, EYE_HEIGHT, GRAVITY, INTERP_DELAY_MS, JUMP_SPEED, MOVE_THROTTLE_MS, WALK_SPEED, WORLD } from '../mp/constants';
import { sampleAt, type Pose } from '../mp/interp';
import type { AnimState, EmoteState } from '../mp/protocol';
import { seatColor } from '../mp/validate';
import { BODY_R, remotePlayers, type RemotePlayer } from '../net/remote-players';
import type { QualityTier } from '../perf/quality';
import { SUS_LOOK, SUS_TRACK, susLevel } from './susbar';
import { WorldCanvas } from './WorldCanvas';

/** 처음 올려다보는 각도의 상한(라디안). 스크린에 바짝 붙어 스폰돼도 하늘을 보며 시작하지 않게 */
const MAX_START_PITCH = (25 * Math.PI) / 180;

/**
 * 배경 한 벌 — src/world/map 의 MapDef 와 구조적으로 호환된다 (feature 가 MAPS.xxx 를 그대로 넘길 수 있게).
 * bounds 만 여기 추가다: 원본은 서버(WORLD)가 막지만 이 씬은 로컬이라 씬이 직접 막아야 한다.
 */
export interface ArenaMapDef {
  background: string;
  fog: readonly [string, number];
  exposure: number;
  ambient: { color: string; intensity: number };
  /** 기본 창고에만 있는 보조광 [하늘색, 땅색, 세기] — 맵이 안 주면 안 켠다 */
  hemisphere?: readonly [string, string, number];
  Scene: ComponentType<{ quality?: QualityTier }>;
  Lights: ComponentType<{ flicker: boolean }>;
  Furniture?: ComponentType;
  /** 후처리(블룸 등). high 화질에서만 붙는다 */
  Effects?: ComponentType;
  /** 들어오면 이 점을 보고 시작한다 */
  focus: { x: number; y: number; z: number };
  resolveColliders: (p: THREE.Vector3, feetY: number) => void;
  groundHeightAt: (x: number, z: number, fromY: number) => number;
  /** 벽 안쪽 클램프 — 로컬 플레이어를 방 안에 가둔다 */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** 기본 배경 = 창고 시네마 라운지. mapDef 를 안 주면 예전과 똑같이 그린다 */
const WAREHOUSE_DEF: ArenaMapDef = {
  background: '#080604',
  fog: ['#0b0805', 0.028],
  exposure: 1.1,
  ambient: { color: '#ffd9a8', intensity: 0.45 },
  hemisphere: ['#8fb6ff', '#3a2a1c', 0.35],
  Scene: Warehouse,
  Lights,
  Furniture,
  focus: SCREEN_FOCUS,
  resolveColliders,
  groundHeightAt,
  bounds: WORLD,
};

export interface WorldSceneProps {
  /** 내 좌표가 바뀔 때마다 부른다 (원본은 여기서 서버로 보냈다. 여기선 판정에 쓴다) */
  onMove?: (x: number, z: number, y: number, heading: number, anim: AnimState) => void;
  /** 시행 마커 같은 것을 씬 안에 얹는다 */
  children?: React.ReactNode;
  /** 배경 한 벌. 안 주면 창고 */
  mapDef?: ArenaMapDef;
  /** 내 시작 위치. 서버가 좌석으로 정한 자리와 같게 맞춘다 */
  spawn: { x: number; z: number };
  /**
   * 이 값이 바뀌면 **나를 spawn 으로 되돌린다.**
   *
   * 좌표가 아니라 열쇠인 이유: 되돌릴 자리는 늘 같은 spawn 이라 좌표 비교로는 "다시 보내라"를
   * 말할 수 없다. 시행이 설 때 전원이 같은 자리에서 출발해야 하는데(시행 예산이 그 자리를
   * 기준으로 잡힌다), 여태 개체들만 옮겨지고 나는 배회하던 자리에 남아 있었다.
   */
  respawnKey?: number;
  /** 원격 플레이어 명부 (id 만 있으면 된다 — 좌표는 remotePlayers 가 들고 있다) */
  roster: readonly { id: string }[];
  /** 말풍선이 바뀔 때만 증가하는 신호 */
  bubbleTick: number;
  /**
   * 개체 머리 위 이름표를 띄우나. 기본은 띄운다.
   * 아레나는 **게임 시작 전에는 끈다** — 성격이 만들어지기 전의 개체들은 이름 없이 배회만 한다 (사용자 결정 2026-08-29).
   */
  showNames?: boolean;
  /**
   * 개체 머리 위에 의심도 막대를 건다 — id 를 주면 지금 값(0~100)을 돌려준다. 없으면 막대를 안 그린다.
   *
   * ★ 값이 아니라 **함수로 받는다.** 의심도는 판이 돌 때마다 바뀌는데 값으로 넘기면 아바타가
   *   memo 를 뚫고 매번 다시 그려진다. 아래 useFrame 이 프레임마다 물어보고 DOM 만 직접 고친다
   *   (getAnim 과 같은 약속).
   */
  getSuspicion?: (id: string) => number;
  /** 이 값을 넘으면 붉게 — 판의 눈금(BALANCE.hotAt)을 그대로 받는다 */
  suspicionHotAt?: number;
  /**
   * 내가 지목한 개체의 id — 그 몸의 이름표 앞에 👉 가 붙는다.
   * 지목을 화면 구석의 표가 아니라 **몸에** 적는 이유는 의심도 막대와 같다 (2026-09-01 사용자):
   * 봐야 할 것은 방이지 HUD 가 아니다.
   */
  markId?: string;
  /** 한 마디 치는 중인가. 잠금은 걸린 채라 시야는 돌지만 다리는 멈춘다 */
  composing: boolean;
  /** 만질 판이 떠 있어 조작이 멈춘 상태인가 (터치에는 포인터 잠금이 없어 이 값이 유일한 정지 신호다) */
  paused: boolean;
  quality?: QualityTier;
  onLockChange?: (locked: boolean) => void;
  /** 캔버스가 DOM 에 붙었다. 이때부터 포인터 잠금을 걸 수 있다 */
  onReady?: () => void;
}

export function WorldScene({ onMove, children, spawn, respawnKey, roster, bubbleTick, showNames = true, getSuspicion, suspicionHotAt = 60, markId, composing, paused, quality = 'high', mapDef, onLockChange, onReady }: WorldSceneProps) {
  const def = mapDef ?? WAREHOUSE_DEF;
  const touchMode = useSyncExternalStore(subscribeTouchMode, getTouchMode, () => false);
  const tier = touchMode ? 'low' : quality;

  /**
   * ── 배경은 **안 바뀌면 안 다시 짓는다** ──
   *
   * 이 씬을 쓰는 화면(features/arena)은 판이 도는 동안 시계·말풍선·국면으로 자주 다시 그려진다.
   * 그때마다 여기 JSX 가 통째로 새로 만들어졌고, 배경은 격납고 홀 하나만으로도 수백 개 메시라
   * React 가 매번 그 전부를 다시 맞춰 봤다 — **판이 도는 동안에만 프레임이 끊기던 이유의 절반**이
   * 이것이다 (나머지 절반은 0.1초짜리 시계였다: features/arena 의 TrialHud).
   *
   * 배경·조명·후처리는 맵과 화질에만 달렸다. 그 둘이 그대로면 지난번 것을 그대로 쓴다.
   */
  const world = useMemo(
    () => (
      <>
        <def.Lights flicker />
        {/* 스포트 밖의 사람이 검은 덩어리가 되지 않을 최소한 */}
        <ambientLight intensity={def.ambient.intensity} color={def.ambient.color} />
        {def.hemisphere ? <hemisphereLight args={[def.hemisphere[0], def.hemisphere[1], def.hemisphere[2]]} /> : null}
        <Suspense fallback={null}>
          <def.Scene quality={tier} />
          {def.Furniture ? <def.Furniture /> : null}
        </Suspense>
        {/* 맵 후처리 — high 에서만. 컴포저가 기본 렌더 루프를 대신한다 */}
        {def.Effects && !touchMode && quality === 'high' ? <def.Effects /> : null}
      </>
    ),
    [def, tier, touchMode, quality],
  );

  // 터치로 바뀌는 순간, 걸려 있던 마우스 잠금을 푼다 (터치스크린 노트북)
  useEffect(() => {
    if (!touchMode || document.pointerLockElement === null) return;
    document.exitPointerLock();
    onLockChange?.(false);
  }, [touchMode, onLockChange]);

  return (
    <WorldCanvas
      // 터치에서는 해상도를 낮춘다 — 모바일 성능의 거의 전부다
      quality={touchMode ? 'low' : quality}
      camera={{ position: [spawn.x, EYE_HEIGHT, spawn.z], fov: BASE_FOV, near: 0.1, far: 60 }}
      gl={{ antialias: !touchMode, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = def.exposure;
        onReady?.();
      }}
    >
      <AdaptiveFov />
      <color attach="background" args={[def.background]} />
      <fogExp2 attach="fog" args={[def.fog[0], def.fog[1]]} />

      {world}

      <Remotes roster={roster} bubbleTick={bubbleTick} showNames={showNames} getSuspicion={getSuspicion} suspicionHotAt={suspicionHotAt} markId={markId} />
      <LocalRig onMove={onMove} spawn={spawn} respawnKey={respawnKey} composing={composing} paused={paused} map={def} />
      {children}

      {/*
        ★ 터치에서는 아예 렌더하지 않는다 — iOS 에는 포인터 잠금이 없다. 시야는 LocalRig 이 돌린다.
        ★ selector 는 일부러 아무것도 맞지 않는 값이다. drei 는 selector 가 없으면 document 전체에
          click→lock 을 걸어 HUD 위의 클릭까지 잠금으로 먹는다. 클릭 잠금은 feature 가
          "캔버스를 target 으로 하는 클릭"에만 따로 건다.
      */}
      {touchMode ? null : (
        <PointerLockControls
          selector="[data-world-click-to-lock]"
          onLock={() => onLockChange?.(true)}
          onUnlock={() => onLockChange?.(false)}
        />
      )}
    </WorldCanvas>
  );
}

/** 화면 비율이 바뀔 때마다 카메라 fov 를 다시 잡는다 (세로 화면 보정). */
function AdaptiveFov() {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || height <= 0) return;
    const next = fovForAspect(width / height);
    if (Math.abs(camera.fov - next) < 0.01) return;
    camera.fov = next;
    camera.updateProjectionMatrix();
  }, [camera, width, height]);

  return null;
}

/* ─────────────────────────── 내 아바타 (송신) ─────────────────────────── */

const UP = new THREE.Vector3(0, 1, 0);

/**
 * 1인칭이라 내 로봇은 내 눈에 안 보인다. 이모트를 눌렀다는 걸 몸으로 느끼게 카메라를 살짝 움직인다 —
 * 동의는 고개 끄덕임(피치), 화남은 부들거림(요·피치). 아바타 클립과 같은 박자다.
 * 반환값은 [pitch, yaw] 오프셋(rad). 매 프레임 전 프레임 값을 되돌리고 새로 얹는다.
 */
function emoteCue(name: EmoteState, t: number): [number, number] {
  const D = EMOTE_MS[name] / 1000;
  if (t >= D) return [0, 0];
  const env = Math.min(1, t / 0.15) * Math.min(1, (D - t) / 0.35);
  if (name === 'agree') return [-0.05 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2 * 2.1)) * env, 0];
  return [0.006 * Math.sin(t * Math.PI * 2 * 11) * env - 0.03 * env, 0.012 * Math.sin(t * Math.PI * 2 * 5.5) * env];
}

function LocalRig({
  onMove,
  spawn,
  respawnKey,
  composing,
  paused,
  map,
}: {
  onMove?: (x: number, z: number, y: number, heading: number, anim: AnimState) => void;
  spawn: { x: number; z: number };
  respawnKey?: number;
  composing: boolean;
  paused: boolean;
  map: ArenaMapDef;
}) {
  const { camera } = useThree();
  const touchMode = useSyncExternalStore(subscribeTouchMode, getTouchMode, () => false);

  // ★ pos.y 는 발 높이다(눈높이가 아니다). 카메라만 EYE_HEIGHT 를 더해 올린다.
  const pos = useRef(new THREE.Vector3(spawn.x, 0, spawn.z));
  const vy = useRef(0);
  const grounded = useRef(true);
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  // NaN 으로 시작해 첫 프레임에 무조건 한 번 보내게 한다 (내 자리를 남에게 알린다)
  const lastSent = useRef({ at: 0, x: NaN, z: NaN, y: NaN, heading: NaN, anim: 'idle' as AnimState });
  /** 켜져 있는 이모트. 걷기 시작하거나 EMOTE_MS 가 지나면 null */
  const emote = useRef<{ name: EmoteState; at: number } | null>(null);
  /** 지난 프레임에 카메라에 얹은 이모트 큐 [pitch, yaw] — 이번 프레임에 되돌린다 */
  const cue = useRef<[number, number]>([0, 0]);

  useEffect(() => {
    /*
     * ★ pos 도 같이 되돌린다. 여태 카메라만 옮겼는데, 걷기는 pos 를 기준으로 매 프레임 카메라를
     *   다시 놓으므로 첫 프레임에 그대로 되돌아갔다 — 처음 태어날 때는 pos 가 이미 spawn 이라
     *   드러나지 않던 버그다. 다시 보낼 일이 생기니(respawnKey) 이제 드러난다.
     */
    pos.current.set(spawn.x, 0, spawn.z);
    vy.current = 0;
    grounded.current = true;
    camera.position.set(spawn.x, EYE_HEIGHT, spawn.z);
    // 맵의 초점을 보고 시작한다. 카메라 로컬 정면은 -z 라 목표 (dx,dz) 를 보려면 yaw = atan2(-dx, -dz)
    const dx = map.focus.x - spawn.x;
    const dz = map.focus.z - spawn.z;
    const pitch = Math.atan2(map.focus.y - EYE_HEIGHT, Math.hypot(dx, dz));
    camera.rotation.order = 'YXZ';
    camera.rotation.set(Math.min(pitch, MAX_START_PITCH), Math.atan2(-dx, -dz), 0);
  }, [camera, spawn.x, spawn.z, map, respawnKey]);

  // 키보드는 input.ts 를 거친다 — 이 컴포넌트는 입력이 어디서 왔는지 모른다
  useEffect(() => attachKeyboard(), []);

  // 말하기로 들어가는 순간 눌린 것들을 비운다 (W 를 누른 채 Enter 를 치면 keyup 이 입력창으로 간다)
  useEffect(() => {
    if (composing) resetInput();
  }, [composing]);

  useFrame((_, delta) => {
    // 조작을 받는 조건: 말하는 중 아님 · 판 안 떠 있음 · (터치이거나) 마우스 잠김
    const active = !composing && !paused && (touchMode || document.pointerLockElement !== null);
    const now = performance.now();

    // 이모트 키. 한 번 켜지는 신호라 읽고 바로 비운다 (막힌 동안 누른 건 버린다)
    if (input.emote) {
      if (active) emote.current = { name: input.emote, at: now };
      input.emote = null;
    }
    // 지난 프레임의 카메라 큐를 되돌린다 — PointerLockControls 가 그 사이 돌린 값은 그대로 남는다
    camera.rotation.x -= cue.current[0];
    camera.rotation.y -= cue.current[1];
    cue.current[0] = 0;
    cue.current[1] = 0;

    // 시야. 터치에서는 PointerLockControls 가 없으므로 여기서 직접 돌린다. 막힌 동안 쌓인 값은 버린다.
    if (input.lookX !== 0 || input.lookY !== 0) {
      if (active) {
        camera.rotation.y -= input.lookX * LOOK_SENSITIVITY;
        camera.rotation.x = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, camera.rotation.x - input.lookY * LOOK_SENSITIVITY));
      }
      input.lookX = 0;
      input.lookY = 0;
    }

    const ax = active ? input.moveX : 0;
    const az = active ? input.moveZ : 0;

    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    forward.current.normalize();
    right.current.crossVectors(forward.current, UP).normalize();

    let anim: AnimState = 'idle';
    if (ax !== 0 || az !== 0) {
      const speed = WALK_SPEED * Math.min(delta, 0.1);
      // 길이가 1을 넘을 때만 줄인다 — 조이스틱은 0~1 을 연속으로 주므로 무조건 정규화하면 살살 걷기가 불가능하다
      const len = Math.hypot(ax, az);
      const fit = len > 1 ? 1 / len : 1;
      pos.current.addScaledVector(forward.current, az * fit * speed);
      pos.current.addScaledVector(right.current, ax * fit * speed);
      anim = 'walk';
      emote.current = null; // 걷기 시작하면 이모트는 끝이다
    } else if (emote.current) {
      if (now - emote.current.at >= EMOTE_MS[emote.current.name]) emote.current = null;
      else anim = emote.current.name;
    }

    // 점프. 땅에 있을 때만 받는다
    if (active && input.jump && grounded.current) {
      vy.current = JUMP_SPEED;
      grounded.current = false;
    }

    // 가구. 발이 윗면보다 높으면 막히지 않는다 — 뛰어넘고, 위에 올라선다
    map.resolveColliders(pos.current, pos.current.y);

    /*
     * 남의 몸. **로봇을 뚫고 지나가지 않는다.** 여태 여기만 비어 있어서, 개체들끼리는 떼어 놓는데
     * 나는 다섯 사이를 그대로 통과했다 (2026-09-01 사용자: "로봇끼리 통과 안 하게").
     *
     * ★ **내가 걸은 프레임에만 민다.** 서 있는 나를 지나가던 개체가 밀어내면 안 되기 때문이다 —
     *   시행에는 「그 자리에서 한 발짝도 움직이지 마라」(처형판)가 있어서, 남이 밀어 놓은 0.6m 가
     *   그대로 내 폐기 사유가 된다. 그 방향은 저쪽이 이미 맡고 있다: 서 있는 몸에게 걸어온 개체는
     *   저희가 비켜 간다 (ArenaFeature 의 separateBots — 물러나는 쪽은 늘 걷는 쪽이다).
     *   여기 남는 몫은 하나뿐이다 — 내가 남의 몸 속으로 걸어 들어갔을 때.
     *   밀린 자리가 가구 속일 수 있으니 가구를 한 번 더 본다.
     */
    if (ax !== 0 || az !== 0) {
      const away = remotePlayers.pushOut(pos.current.x, pos.current.z, pos.current.y, BODY_R);
      if (away.x !== pos.current.x || away.z !== pos.current.z) {
        pos.current.x = away.x;
        pos.current.z = away.z;
        map.resolveColliders(pos.current, pos.current.y);
      }
    }

    // 벽. 이 씬은 로컬이라 서버 검증이 없다 — 씬이 직접 막는다
    pos.current.x = Math.min(Math.max(pos.current.x, map.bounds.minX + 0.4), map.bounds.maxX - 0.4);
    pos.current.z = Math.min(Math.max(pos.current.z, map.bounds.minZ + 0.4), map.bounds.maxZ - 0.4);

    // 수직. 발밑이 무엇인지(바닥 0 또는 가구 윗면) 먼저 묻고 떨어뜨린다
    const ground = map.groundHeightAt(pos.current.x, pos.current.z, pos.current.y);
    if (grounded.current && pos.current.y > ground + 0.02) grounded.current = false;
    if (grounded.current) {
      pos.current.y = ground;
    } else {
      vy.current -= GRAVITY * Math.min(delta, 0.1);
      pos.current.y += vy.current * Math.min(delta, 0.1);
      if (vy.current <= 0 && pos.current.y <= ground) {
        pos.current.y = ground;
        vy.current = 0;
        grounded.current = true;
      }
    }

    camera.position.set(pos.current.x, pos.current.y + EYE_HEIGHT, pos.current.z);
    if (emote.current) {
      cue.current = emoteCue(emote.current.name, (now - emote.current.at) / 1000);
      camera.rotation.x += cue.current[0];
      camera.rotation.y += cue.current[1];
    }

    // 아바타의 앞면은 로컬 +z 다
    const heading = Math.atan2(forward.current.x, forward.current.z);

    const s = lastSent.current;
    const changed =
      s.anim !== anim ||
      Math.abs(s.x - pos.current.x) > 0.001 ||
      Math.abs(s.z - pos.current.z) > 0.001 ||
      Math.abs(s.y - pos.current.y) > 0.001 ||
      Math.abs(s.heading - heading) > 0.001 ||
      Number.isNaN(s.x);

    // 가만히 서 있으면 패킷이 0이다
    if (changed && now - s.at >= MOVE_THROTTLE_MS) {
      onMove?.(pos.current.x, pos.current.z, pos.current.y, heading, anim);
      s.at = now;
      s.x = pos.current.x;
      s.z = pos.current.z;
      s.y = pos.current.y;
      s.heading = heading;
      s.anim = anim;
    }
  });

  return null;
}

/* ─────────────────────────── 남의 아바타 (수신) ─────────────────────────── */

function Remotes({
  roster,
  bubbleTick,
  showNames,
  getSuspicion,
  suspicionHotAt,
  markId,
}: {
  roster: readonly { id: string }[];
  bubbleTick: number;
  showNames: boolean;
  getSuspicion?: (id: string) => number;
  suspicionHotAt: number;
  markId?: string;
}) {
  // 명부가 바뀔 때만 이 컴포넌트가 돈다. 좌표는 여기로 오지 않는다.
  return (
    <>
      {roster.map((r) => {
        const p = remotePlayers.get(r.id);
        return p ? <RemoteAvatar key={p.id} player={p} bubbleTick={bubbleTick} showNames={showNames} getSuspicion={getSuspicion} suspicionHotAt={suspicionHotAt} marked={p.id === markId} /> : null;
      })}
    </>
  );
}

const RemoteAvatar = memo(function RemoteAvatar({
  player,
  bubbleTick,
  showNames,
  getSuspicion,
  suspicionHotAt,
  marked,
}: {
  player: RemotePlayer;
  bubbleTick: number;
  showNames: boolean;
  getSuspicion?: (id: string) => number;
  suspicionHotAt: number;
  /** 내가 지금 지목하고 있는 몸인가 — 이름표 앞에 👉 가 붙는다 */
  marked?: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  /** 의심도 막대 — React 를 거치지 않고 프레임마다 직접 고친다 */
  const susBar = useRef<HTMLElement>(null);
  /** 마지막으로 쓴 값. 안 바뀌면 DOM 을 안 건드린다 */
  const susLast = useRef(-1);
  const pose = useRef<Pose>({ x: player.pose.x, z: player.pose.z, y: player.pose.y, heading: player.pose.heading });
  const color = useMemo(() => seatColor(player.seat), [player.seat]);

  // ★ 값이 아니라 함수로 준다. player 는 Map 안에서 제자리 변형되므로 값을 넘기면 입장 시점의 'idle' 이 굳는다
  const getAnim = useCallback((): AnimState => player.anim, [player]);
  const getAirborne = useCallback(() => player.pose.y > 0.02, [player]);
  /** 넘어질 방향 — 쏘는 쪽이 넣어 준다 (net/remote-players 의 fall). 안 넣었으면 정면으로 넘어간다 */
  const getFall = useCallback(() => player.fall ?? 0, [player]);

  const bubble = player.bubbleUntil > performance.now() ? player.bubbleText : '';
  void bubbleTick;

  // 말풍선 수명이 끝나는 그 시각에 한 번 다시 그린다 — 안 그러면 다음 채팅까지 영영 떠 있다
  const [, expire] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!bubble) return;
    const left = player.bubbleUntil - performance.now();
    if (left <= 0) return;
    const id = window.setTimeout(expire, left + 16);
    return () => window.clearTimeout(id);
  }, [bubble, player.bubbleUntil, player]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;

    // 150ms 과거를 그린다. 최신 샘플을 바로 그리면 패킷이 한 번 늦을 때마다 튄다
    const now = performance.now();
    if (sampleAt(player.buffer, now - INTERP_DELAY_MS, pose.current)) {
      player.pose.x = pose.current.x;
      player.pose.z = pose.current.z;
      player.pose.y = pose.current.y;
      player.pose.heading = pose.current.heading;
    }

    const y = player.pose.y;
    g.position.set(player.pose.x, y, player.pose.z);
    g.rotation.y = player.pose.heading;

    // 그림자는 늘 바닥에 붙어 있고 멀어질수록 작아진다 — 점프가 "위로 간 것"으로 읽히게
    if (shadow.current) {
      shadow.current.position.y = 0.02 - y;
      const s = Math.max(0.45, 1 - y * 0.35);
      shadow.current.scale.set(s, s, 1);
    }

    // 의심도 막대 — 값이 바뀐 프레임에만 DOM 을 만진다.
    // ★ 0 이어도 **눈금(빈 막대)은 남긴다.** 값이 있을 때만 띄우면 판이 서기 전까지 아무것도 안 보여
    //   막대가 어디서 차오르는지를 알 수가 없다 (2026-09-01 사용자: "막대길이 안뜨는데 어디있어").
    if (getSuspicion && susBar.current) {
      const sus = Math.max(0, Math.min(100, Math.round(getSuspicion(player.id))));
      if (sus !== susLast.current) {
        susLast.current = sus;
        susBar.current.style.width = `${sus}%`;
        // 길이만이 아니라 **색이 눈금을 말한다** — 어느 칸인지는 susbar.ts 한 곳이 정한다
        const look = SUS_LOOK[susLevel(sus, suspicionHotAt)];
        susBar.current.style.background = look.fill;
        susBar.current.style.boxShadow = look.glow;
      }
    }
  });

  return (
    <group ref={group}>
      <Suspense fallback={null}>
        <RobotAvatar getAnim={getAnim} getAirborne={getAirborne} getFall={getFall} />
      </Suspense>

      {/* 바닥 그림자 대용 — 실제 그림자는 여럿이면 비싸다 */}
      <mesh ref={shadow} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.34, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} />
      </mesh>

      {/*
        ★ 이름표·막대는 **말풍선이 떠도 제자리다.**
        여태 셋이 한 세로줄에 흐름으로 얹혀 있었는데, <Html center> 는 그 줄의 **한가운데**를 머리 위
        한 점에 맞춘다. 그래서 말풍선이 뜨는 순간 줄이 위로 길어지고, 다시 가운데를 맞추느라
        이름표와 막대가 통째로 아래(몸통·얼굴 쪽)로 내려갔다 — 말할 때마다 이름이 가슴팍에 붙었다
        (2026-09-01 사용자 지적). 말이 끝나면 도로 올라오니 라벨이 오르내리는 것으로 보였다.

        말풍선을 흐름에서 빼면(position:absolute) 줄의 크기는 이름표+막대로 고정된다 —
        이름표는 늘 같은 높이에 있고, 말풍선만 그 위로 자란다.
      */}
      <Html position={[0, 2.0, 0]} center distanceFactor={9} zIndexRange={[10, 0]}>
        <div style={{ position: 'relative', pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          {bubble ? (
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                marginBottom: 10,
                transform: 'translateX(-50%)',
                width: 'max-content',
                maxWidth: 220,
                borderRadius: 16,
                border: '1px solid #374151',
                background: 'rgba(30,30,30,0.62)',
                padding: '12px 24px',
                boxShadow: '0 10px 15px rgba(0,0,0,0.3)',
              }}
            >
              <span style={{ display: 'block', fontSize: 14, fontWeight: 500, lineHeight: 1.3, color: '#fff' }}>{bubble}</span>
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  bottom: -8,
                  left: '50%',
                  width: 0,
                  height: 0,
                  transform: 'translateX(-50%)',
                  borderLeft: '8px solid transparent',
                  borderRight: '8px solid transparent',
                  borderTop: '8px solid rgba(30,30,30,0.62)',
                }}
              />
            </div>
          ) : null}
          {showNames ? (
            <div
              style={{
                whiteSpace: 'nowrap',
                borderRadius: 999,
                background: marked ? 'rgba(90,40,10,0.75)' : 'rgba(0,0,0,0.6)',
                boxShadow: marked ? '0 0 0 1px #ffd9a0' : undefined,
                padding: '2px 8px',
                fontSize: 11,
                fontWeight: 700,
                color: marked ? '#ffd9a0' : color,
              }}
            >
              {marked ? '👉 ' : ''}
              {player.nickname}
            </div>
          ) : null}
          {/* 의심도 — 이름표 바로 아래. 쳐다보는 그 자리에서 눈금이 읽히라고 몸에 붙인다.
              ★ 이제 **의심도를 보는 곳은 여기 하나뿐이다** (2026-09-01 사용자) — HUD 의 표에서는 뺐다.
              길이는 이름 길이와 무관하게 늘 같은 자(54px)로 잰다 — 개체마다 자가 다르면 서로 비교가 안 된다 */}
          {showNames && getSuspicion ? (
            /*
             * 자 자체도 키웠다 — 4px 은 이름표와 함께 거리에 따라 줄어들어(distanceFactor 9)
             * 몇 걸음만 물러서도 실선 한 줄이 된다. 7px 에 검은 테를 두르면 밝은 벽 앞에서도 선다.
             */
            <div
              style={{
                width: 60,
                height: 7,
                borderRadius: 3,
                background: SUS_TRACK,
                overflow: 'hidden',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.85), inset 0 0 0 1px rgba(255,255,255,0.16)',
              }}
            >
              <i ref={susBar} style={{ display: 'block', width: '0%', height: '100%', borderRadius: 3, background: SUS_LOOK.calm.fill }} />
            </div>
          ) : null}
        </div>
      </Html>
    </group>
  );
});

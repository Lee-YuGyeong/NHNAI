/**
 * 3D 월드 씬 — 여러 명이 같이 걸어다니는 공간. humanish 의 app/world/world-scene.tsx 에서 가져왔다.
 *
 * 배경은 ../map/index.ts 의 MAPS 에서 고른다 (복도 corridor.tsx · 창고 warehouse.tsx). 이 파일은 캔버스·카메라·이동·네트워크 송수신만 쥔다.
 * Redux 를 모른다 — 명부(roster)와 말풍선 신호(bubbleTick)는 feature 가 props 로 준다.
 *
 * 경계는 mp/constants.ts 의 WORLD 하나뿐이고 서버가 같은 값으로 검증한다.
 */

import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { type ReactNode, Suspense, memo, useCallback, useEffect, useMemo, useReducer, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';

import { RobotAvatar } from '../avatar/RobotAvatar';
import {
  BASE_FOV,
  LOOK_SENSITIVITY,
  MAX_PITCH,
  addLook,
  attachKeyboard,
  fovForAspect,
  getTouchMode,
  input,
  resetInput,
  subscribeTouchMode,
} from '../input/input';
import { MAPS, type MapDef, type MapId } from '../map';
import { bystanders } from '../mp/bystanders';
import { EMOTE_MS, EYE_HEIGHT, GRAVITY, INTERP_DELAY_MS, JUMP_SPEED, MOVE_THROTTLE_MS, WALK_SPEED, WORLD } from '../mp/constants';
import { markPlayer, sense } from '../mp/sensor';
import { sampleAt, type Pose } from '../mp/interp';
import type { AnimState, EmoteState } from '../mp/protocol';
import { seatColor } from '../mp/validate';
import type { WorldConnection } from '../net/connection';
import { remotePlayers, type RemotePlayer } from '../net/remote-players';
import type { QualityTier } from '../perf/quality';
import { WorldCanvas } from './WorldCanvas';

/** 처음 올려다보는 각도의 상한(라디안). 문에 바짝 붙어 스폰돼도 하늘을 보며 시작하지 않게 */
const MAX_START_PITCH = (25 * Math.PI) / 180;

export interface WorldSceneProps {
  conn: WorldConnection;
  /** 내 시작 위치. 서버가 좌석으로 정한 자리와 같게 맞춘다 */
  spawn: { x: number; z: number };
  /** 원격 플레이어 명부 (id 만 있으면 된다 — 좌표는 remotePlayers 가 들고 있다) */
  roster: readonly { id: string }[];
  /** 말풍선이 바뀔 때만 증가하는 신호 */
  bubbleTick: number;
  /** 한 마디 치는 중인가. 잠금은 걸린 채라 시야는 돌지만 다리는 멈춘다 */
  composing: boolean;
  /** 만질 판이 떠 있어 조작이 멈춘 상태인가 (터치에는 포인터 잠금이 없어 이 값이 유일한 정지 신호다) */
  paused: boolean;
  quality?: QualityTier;
  /** 배경 맵. 기본은 복도 */
  map?: MapId;
  /**
   * 등록부(map/index.ts)에 없는 맵을 **정의 그대로** 세운다 — 주면 `map` 보다 우선한다.
   * 시나리오 2 의 방들(world2/map)이 이 문으로 들어온다: 본판 등록부를 건드리지 않으려고 자기 정의를 직접 들고 온다.
   */
  def?: MapDef;
  /** 캔버스가 DOM 에 붙었다 (잠금 상태는 feature 가 document 의 pointerlockchange 로 직접 본다 — 잠금 대상은 캔버스가 아니라 feature 의 뿌리 div) */
  onReady?: () => void;
  /** 맵 위에 얹는 것 — 격납고 무대의 리더 로봇처럼 맵(배경)도 플레이어도 아닌 존재. 캔버스 안, Suspense 밖에 그려진다 */
  children?: ReactNode;
  /** 의심도가 문턱(50·80·100)을 넘었다 — feature 가 시스템 대사를 띄운다 */
}

export function WorldScene({ conn, spawn, roster, bubbleTick, composing, paused, quality = 'high', map = 'corridor', def: given, onReady, children }: WorldSceneProps) {
  const def: MapDef = given ?? MAPS[map];
  const touchMode = useSyncExternalStore(subscribeTouchMode, getTouchMode, () => false);

  // 터치로 바뀌는 순간, 걸려 있던 마우스 잠금을 푼다 (터치스크린 노트북)
  useEffect(() => {
    if (!touchMode || document.pointerLockElement === null) return;
    document.exitPointerLock();
  }, [touchMode]);

  return (
    <WorldCanvas
      // 터치에서는 해상도를 낮춘다 — 모바일 성능의 거의 전부다
      quality={touchMode ? 'low' : quality}
      camera={{ position: [spawn.x, EYE_HEIGHT, spawn.z], fov: BASE_FOV, near: 0.1, far: 60 }}
      gl={{ antialias: !touchMode, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        // 개발 전용 — 콘솔·스크립트에서 드로우콜·프레임 시간을 재기 위한 손잡이 (tools/ 의 계측 스크립트가 읽는다)
        if (import.meta.env.DEV) (window as unknown as { __worldGl?: unknown }).__worldGl = gl;
        onReady?.();
      }}
    >
      <AdaptiveFov />
      {def.introFov ? <IntroZoom extra={def.introFov} spawn={spawn} /> : null}
      <Exposure value={def.exposure} />
      <color attach="background" args={[def.background]} />
      <fogExp2 attach="fog" args={[def.fog[0], def.fog[1]]} />

      <def.Lights flicker />
      {/* 스포트 밖의 사람이 검은 덩어리가 되지 않을 최소한 */}
      <ambientLight intensity={def.ambient.intensity} color={def.ambient.color} />

      <Suspense fallback={null}>
        {/* low(터치·통합 GPU)에서는 반사 바닥(씬을 한 번 더 그린다) 같은 비싼 것이 빠진다 */}
        <def.Scene quality={touchMode ? 'low' : quality} />
        {def.Furniture ? <def.Furniture /> : null}
      </Suspense>

      {/* 맵 후처리 — high 에서만. 컴포저가 기본 렌더 루프를 대신한다 */}
      {def.Effects && !touchMode && quality === 'high' ? <def.Effects /> : null}

      <Remotes roster={roster} bubbleTick={bubbleTick} />
      <LocalRig conn={conn} spawn={spawn} composing={composing} paused={paused} map={def} />
      {children}

      {/* ★ 터치에서는 아예 렌더하지 않는다 — iOS 에는 포인터 잠금이 없다. 시야는 조이스틱 드래그가 같은 input 으로 돌린다 */}
      {touchMode ? null : <MouseLook />}
    </WorldCanvas>
  );
}

/** 맵마다 톤매핑 노출이 다르다 — 캔버스는 한 번 만들어지므로 onCreated 가 아니라 여기서 건다 */
function Exposure({ value }: { value: number }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMappingExposure = value;
  }, [gl, value]);
  return null;
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

/**
 * 입장 연출 — fov 를 extra 만큼 넓게 시작해 기본값으로 좁힌다. 1초 멈췄다가 1.2초에 걸쳐 좁히고, 걸으면(2m) 그 즉시 끝난다.
 * ★ 천천히(8초) 좁히면 가만히 서 있어도 화면이 당겨져 "앞으로 밀리는" 것처럼 느껴진다 — 짧고 분명하게 해야 카메라 연출로 읽힌다.
 * 끝나면 AdaptiveFov 의 값으로 정확히 돌아간다.
 */
function IntroZoom({ extra, spawn }: { extra: number; spawn: { x: number; z: number } }) {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const t0 = useRef<number | null>(null);
  const done = useRef(false);
  useFrame(({ clock }) => {
    if (done.current || !(camera instanceof THREE.PerspectiveCamera)) return;
    const t = clock.getElapsedTime();
    if (t0.current === null) t0.current = t;
    const walked = Math.hypot(camera.position.x - spawn.x, camera.position.z - spawn.z);
    const k = Math.min(1, Math.max((t - t0.current - 1.0) / 1.2, walked / 2));
    const eased = k <= 0 ? 0 : 1 - (1 - k) * (1 - k);
    const base = fovForAspect(width / Math.max(1, height));
    camera.fov = base + extra * (1 - eased);
    camera.updateProjectionMatrix();
    if (k >= 1) done.current = true;
  });
  return null;
}

/* ─────────────────────────── 마우스 시야 ─────────────────────────── */

/** three 의 PointerLockControls 와 같은 감도(0.002 rad/px)를 input.ts 의 LOOK_SENSITIVITY 단위로 */
const MOUSE_LOOK = 0.002 / LOOK_SENSITIVITY;
/** 잠금 직후의 첫 움직임이 이보다(px) 크면 버린다 — 사람 손의 첫 한 틱은 이보다 작다 */
const LOCK_JUMP_PX = 50;
/** 한 이벤트가 돌릴 수 있는 상한(px). 그 이상은 잡음이다 */
const MOUSE_STEP_MAX = 200;

/**
 * 마우스 시야 — 잠금이 걸린 동안의 mousemove 를 input.lookX/Y 로 보낸다. 카메라는 LocalRig 이 터치 드래그와 **같은 길**로 돌린다.
 *
 * drei 의 PointerLockControls 를 쓰지 않는 이유: 그건 카메라를 직접 돌리고, 잠금이 걸리는 순간 크롬(특히 macOS)이 첫 mousemove 에
 * 실어 보내는 엉뚱한 delta(커서가 있던 자리 → 화면 가운데)를 걸러 낼 자리가 없다 — 들어오자마자 시야가 아무 데로나 튀었다.
 * 잠그는 것은 feature 가 한다(어느 요소에 걸든 상관없다 — 이 문서에 잠금이 있으면 그게 우리 것이다). 여기는 시야만 돌린다.
 */
function MouseLook() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const doc = gl.domElement.ownerDocument;
    let locked = doc.pointerLockElement !== null;
    /** 잠금 뒤 첫 mousemove 인가 — 크롬의 튐을 거를 자리. 이미 잠긴 채 씬이 떴어도(「입장」에서 잡은 잠금) 첫 움직임은 거른다 */
    let fresh = true;
    const clamp = (v: number) => Math.max(-MOUSE_STEP_MAX, Math.min(MOUSE_STEP_MAX, v));
    const onChange = () => {
      const now = doc.pointerLockElement !== null;
      if (now === locked) return;
      locked = now;
      fresh = now;
      input.lookX = 0;
      input.lookY = 0;
    };
    const onMove = (e: MouseEvent) => {
      if (!locked) return;
      if (fresh) {
        fresh = false;
        if (Math.abs(e.movementX) > LOCK_JUMP_PX || Math.abs(e.movementY) > LOCK_JUMP_PX) return;
      }
      addLook(clamp(e.movementX) * MOUSE_LOOK, clamp(e.movementY) * MOUSE_LOOK);
    };
    doc.addEventListener('pointerlockchange', onChange);
    doc.addEventListener('mousemove', onMove);
    return () => {
      doc.removeEventListener('pointerlockchange', onChange);
      doc.removeEventListener('mousemove', onMove);
    };
  }, [gl]);
  return null;
}

/* ─────────────────────────── 내 아바타 (송신) ─────────────────────────── */

const UP = new THREE.Vector3(0, 1, 0);
/** 인간 전용 물건이 없는 맵 — 매 프레임 새 배열을 만들지 않는다 */

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

/** 플레이어 몸 반지름(m) — 경비 몸(BODY_R 0.42)과 더해 겹침을 푼다 */
const PLAYER_BODY_R = 0.45;

function LocalRig({ conn, spawn, composing, paused, map }: { conn: WorldConnection; spawn: { x: number; z: number }; composing: boolean; paused: boolean; map: MapDef }) {
  const { focus: FOCUS, resolveColliders, groundHeightAt } = map;
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
    camera.position.set(spawn.x, EYE_HEIGHT, spawn.z);
    // 복도 끝 문을 보고 시작한다. 카메라 로컬 정면은 -z 라 목표 (dx,dz) 를 보려면 yaw = atan2(-dx, -dz)
    const dx = FOCUS.x - spawn.x;
    const dz = FOCUS.z - spawn.z;
    const pitch = Math.atan2(FOCUS.y - EYE_HEIGHT, Math.hypot(dx, dz));
    camera.rotation.order = 'YXZ';
    camera.rotation.set(Math.min(pitch, MAX_START_PITCH), Math.atan2(-dx, -dz), 0);
  }, [camera, spawn.x, spawn.z, FOCUS]);

  // 키보드는 input.ts 를 거친다 — 이 컴포넌트는 입력이 어디서 왔는지 모른다
  useEffect(() => attachKeyboard(), []);

  // 말하기로 들어가는 순간 눌린 것들을 비운다 (W 를 누른 채 Enter 를 치면 keyup 이 입력창으로 간다)
  useEffect(() => {
    if (composing) resetInput();
  }, [composing]);

  useFrame((_, delta) => {
    // 조작을 받는 조건: 말하는 중 아님 · 판 안 떠 있음 · (터치이거나) 마우스 잠김
    const active = !composing && !paused && (touchMode || document.pointerLockElement !== null);
    // 시야는 말하는 중에도 돈다 — 잠금은 걸린 채라 다리만 멈춘다
    const lookActive = !paused && (touchMode || document.pointerLockElement !== null);
    const now = performance.now();

    // 이모트 키. 한 번 켜지는 신호라 읽고 바로 비운다 (막힌 동안 누른 건 버린다)
    if (input.emote) {
      if (active) emote.current = { name: input.emote, at: now };
      input.emote = null;
    }
    // 지난 프레임의 카메라 큐를 되돌린다 — 시야 회전(아래)은 그 위에 얹힌다
    camera.rotation.x -= cue.current[0];
    camera.rotation.y -= cue.current[1];
    cue.current[0] = 0;
    cue.current[1] = 0;

    // 시야. 마우스(MouseLook)도 터치 드래그도 input.look 으로 온다. 막힌 동안 쌓인 값은 버린다.
    if (input.lookX !== 0 || input.lookY !== 0) {
      if (lookActive) {
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

    // 점프. 땅에 있을 때만 받는다. 시작한 프레임은 의심도 감지(돌발)로 넘긴다
    let jumped = false;
    if (active && input.jump && grounded.current) {
      vy.current = JUMP_SPEED;
      grounded.current = false;
      jumped = true;
    }

    // 가구. 발이 윗면보다 높으면 막히지 않는다 — 뛰어넘고, 위에 올라선다
    resolveColliders(pos.current, pos.current.y);
    // 경비(장면이 세운 개체) — 몸을 뚫고 지나가지 않는다. 경비도 AgentRobot 에서 나를 피해 밀려난다
    const pushed = bystanders.pushOut(pos.current.x, pos.current.z, PLAYER_BODY_R);
    pos.current.x = pushed.x;
    pos.current.z = pushed.z;
    // 밀려난 자리가 다시 가구 안일 수 있다 — 리브·상자 옆에 선 개체가 나를 벽 쪽으로 밀면 프레임마다 벽과 몸이 번갈아 밀어 튕긴다. 한 번 더 벽을 푼다
    resolveColliders(pos.current, pos.current.y);

    // 벽. 서버는 범위 밖을 거절만 하므로 클라가 먼저 막는다
    const bounds = map.bounds ?? WORLD;
    pos.current.x = Math.min(Math.max(pos.current.x, bounds.minX + 0.4), bounds.maxX - 0.4);
    pos.current.z = Math.min(Math.max(pos.current.z, bounds.minZ + 0.4), bounds.maxZ - 0.4);

    // 수직. 발밑이 무엇인지(바닥 0 또는 가구 윗면) 먼저 묻고 떨어뜨린다
    const ground = groundHeightAt(pos.current.x, pos.current.z, pos.current.y);
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

    // 의심도 감지 — 뒷걸음·점프·이모트뿐이다 (쳐다보는 것으로는 안 오른다, mp/sensor 의 ★). 문턱 연출은 저장소가 알린다 (mp/suspicion.bindCross)
    markPlayer(pos.current.x, pos.current.z);
    if (active) sense({ dt: Math.min(delta, 0.1), x: pos.current.x, z: pos.current.z, fx: forward.current.x, fz: forward.current.z, anim, moveZ: az, jumped });

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
      conn.sendMove(pos.current.x, pos.current.z, pos.current.y, heading, anim);
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

function Remotes({ roster, bubbleTick }: { roster: readonly { id: string }[]; bubbleTick: number }) {
  // 명부가 바뀔 때만 이 컴포넌트가 돈다. 좌표는 여기로 오지 않는다.
  return (
    <>
      {roster.map((r) => {
        const p = remotePlayers.get(r.id);
        return p ? <RemoteAvatar key={p.id} player={p} bubbleTick={bubbleTick} /> : null;
      })}
    </>
  );
}

const RemoteAvatar = memo(function RemoteAvatar({ player, bubbleTick }: { player: RemotePlayer; bubbleTick: number }) {
  const group = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const pose = useRef<Pose>({ x: player.pose.x, z: player.pose.z, y: player.pose.y, heading: player.pose.heading });
  const color = useMemo(() => seatColor(player.seat), [player.seat]);

  // ★ 값이 아니라 함수로 준다. player 는 Map 안에서 제자리 변형되므로 값을 넘기면 입장 시점의 'idle' 이 굳는다
  const getAnim = useCallback((): AnimState => player.anim, [player]);
  const getAirborne = useCallback(() => player.pose.y > 0.02, [player]);

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
  });

  return (
    <group ref={group}>
      {/*
       * 몸과 그림자는 **한 Suspense 안**에 있어야 한다 (2026-09-01). 그림자만 밖에 두면 모델(robot.glb)이
       * 아직 안 왔거나 못 왔을 때 **바닥에 그림자만 떠 있는 사람**이 된다 — 몸은 없고 발밑 얼룩만 남는다.
       * 그림자 대용인 이 원반은 몸이 있을 때만 의미가 있다.
       */}
      <Suspense fallback={null}>
        <RobotAvatar getAnim={getAnim} getAirborne={getAirborne} />
        {/* 바닥 그림자 대용 — 실제 그림자는 여럿이면 비싸다 */}
        <mesh ref={shadow} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.34, 20]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.35} />
        </mesh>
      </Suspense>

      <Html position={[0, 2.0, 0]} center distanceFactor={9} zIndexRange={[10, 0]}>
        <div style={{ pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          {bubble ? (
            <div
              style={{
                position: 'relative',
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
          <div style={{ whiteSpace: 'nowrap', borderRadius: 999, background: 'rgba(0,0,0,0.6)', padding: '2px 8px', fontSize: 11, fontWeight: 700, color }}>
            {player.nickname}
          </div>
        </div>
      </Html>
    </group>
  );
});

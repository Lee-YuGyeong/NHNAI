/**
 * 월드 조작의 **단일 출처**.
 *
 * 키보드도 조이스틱도 여기 `input` 하나에만 쓰고, 씬의 LocalRig 는 그것만 읽는다 —
 * LocalRig 은 입력이 어디서 왔는지 모른다.
 *
 * ★ Redux 에 넣지 않는다. 매 프레임 바뀌는 값이라 불변 업데이트로 바꾸면 초당 수십 번
 *   리렌더가 난다. 여기 `input` 은 **제자리에서 변형되는 가변 객체**고, 읽는 쪽은 useFrame 뿐이다.
 *   (구독이 필요한 건 "지금 터치 기기인가" 하나뿐이라 그것만 리스너를 둔다.)
 *
 * ★ iOS 사파리에는 포인터 잠금이 없다. 그래서 입력을 잠금에서 떼어냈다 — 터치에서는
 *   조이스틱이 곧 조작이다.
 */

/* ─────────────────────────── 지금 조작 중인 손 ─────────────────────────── */

let touch = false;
const listeners = new Set<() => void>();

function setTouch(next: boolean): void {
  if (touch === next) return;
  touch = next;
  for (const fn of listeners) fn();
}

/** useSyncExternalStore 용. */
export function getTouchMode(): boolean {
  return touch;
}

export function subscribeTouchMode(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

let watchers = 0;
let stopWatching: (() => void) | null = null;

/**
 * 입력 종류를 지켜본다. 처음엔 `(pointer: coarse)` 로 짐작하고, 그다음부터는
 * **실제로 들어온 입력**을 보고 뒤집는다 (키보드를 붙인 아이패드, 터치 노트북).
 */
export function watchPointerKind(): () => void {
  if (typeof window === 'undefined') return () => {};

  watchers += 1;
  if (watchers > 1) {
    return () => {
      watchers -= 1;
      if (watchers === 0 && stopWatching) {
        stopWatching();
        stopWatching = null;
      }
    };
  }

  setTouch(window.matchMedia?.('(pointer: coarse)').matches === true);

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') setTouch(true);
    else if (e.pointerType === 'mouse') setTouch(false);
  };
  const onMouseMove = (e: MouseEvent) => {
    if (e.movementX !== 0 || e.movementY !== 0) setTouch(false);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (MOVE_CODES.has(e.code)) setTouch(false);
  };

  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('mousemove', onMouseMove, { passive: true });
  window.addEventListener('keydown', onKeyDown);
  stopWatching = () => {
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('keydown', onKeyDown);
  };

  return () => {
    watchers -= 1;
    if (watchers === 0 && stopWatching) {
      stopWatching();
      stopWatching = null;
    }
  };
}

/* ─────────────────────────────── 입력 상태 ─────────────────────────────── */

import type { EmoteState } from '../mp/protocol';

export interface InputState {
  /** 오른쪽이 양수. 길이가 1을 넘을 수 있다 (키보드 대각선) — 읽는 쪽이 줄인다 */
  moveX: number;
  /** 앞이 양수 */
  moveZ: number;
  /** 점프 키가 **눌려 있는가**. */
  jump: boolean;
  /** 아직 카메라에 반영하지 않은 시야 변화(라디안). 읽는 쪽이 0으로 비운다. */
  lookX: number;
  lookY: number;
  /** 방금 누른 이모트 (1 화남 · 2 동의). 한 번만 켜지는 신호라 읽는 쪽이 null 로 비운다. */
  emote: EmoteState | null;
}

/** ★ 제자리에서 변형된다. 이 객체를 복사해 들고 있지 말 것 */
export const input: InputState = { moveX: 0, moveZ: 0, jump: false, lookX: 0, lookY: 0, emote: null };

/** 전부 놓은 상태로 되돌린다. 눌린 키 목록까지 비우고, **아직 안 뗀 손도 안 받는다** (heldMuted). */
export function resetInput(): void {
  for (const k of Object.keys(keys)) delete keys[k];
  heldMuted = true;
  input.moveX = 0;
  input.moveZ = 0;
  input.jump = false;
  input.lookX = 0;
  input.lookY = 0;
  input.emote = null;
}

/** 시야를 이만큼 더 돌린다 (터치 드래그가 부른다). */
export function addLook(dx: number, dy: number): void {
  input.lookX += dx;
  input.lookY += dy;
}

/* ─────────────────────────────── 키보드 ─────────────────────────────── */

const MOVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

const EMOTE_CODES: Record<string, EmoteState> = { Digit1: 'angry', Numpad1: 'angry', Digit2: 'agree', Numpad2: 'agree' };

const keys: Record<string, boolean> = {};

/**
 * **아직 안 뗀 손을 다시 안 받는 상태** — resetInput 이 켜고, 새로 누르는 키 하나가 끈다.
 *
 * 키를 놓은 것으로 치고 목록을 비워도, 손이 그대로 얹혀 있으면 운영체제의 자동 반복이
 * 30~50ms 만에 같은 키를 도로 켠다 — 턴 것이 없던 일이 된다. 그래서 턴 직후에 오는
 * **반복 keydown 은 안 받는다.** 새로 누른 것(e.repeat 이 거짓)이 오면 손이 실제로 움직인 것이니 푼다.
 *
 * 이게 필요한 자리는 둘이고 둘 다 같은 모양이다:
 *   · 부동자세 검사가 서는 순간 (features/arena 의 begin) — 누른 채 세던 손이 그대로 걸어 나가면
 *     지시를 읽기도 전에 처형판에서 끝난다.
 *   · 창이 초점을 잃었다 돌아왔을 때 (아래 blur) — 자리를 비운 사이 눌려 있던 키로 저절로 걷지 않는다.
 */
let heldMuted = false;

function recompute(): void {
  input.moveX = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  input.moveZ = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  input.jump = Boolean(keys.Space);
}

/** 키보드를 `input` 에 연결한다. 반환값은 정리 함수다. 입력창에 치는 동안은 조작키가 아니다. */
export function attachKeyboard(): () => void {
  const typing = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable === true;
  };

  const down = (e: KeyboardEvent) => {
    if (typing(e)) return;
    // 방금 턴 참이다 — 자동 반복은 **아직 안 뗀 손**이라 안 받는다 (heldMuted 머리말)
    if (heldMuted) {
      if (e.repeat) return;
      heldMuted = false;
    }
    if (e.code === 'Space') e.preventDefault();
    // 이모트는 누르는 순간 한 번이다 — 꾹 누르고 있어도 키 반복으로 다시 켜지지 않는다
    const emote = EMOTE_CODES[e.code];
    if (emote && !e.repeat) input.emote = emote;
    keys[e.code] = true;
    recompute();
  };
  const up = (e: KeyboardEvent) => {
    keys[e.code] = false;
    recompute();
  };
  const blur = () => resetInput();

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    resetInput();
  };
}

/* ─────────────────────────── 조이스틱 (순수 함수) ─────────────────────────── */

export const STICK_RADIUS = 56;
export const STICK_DEADZONE = 0.18;
/** 여기서 최고 속도에 닿는다. 엄지로 속도를 정밀하게 맞추는 건 불가능하다. */
const STICK_FULL = 0.85;

export interface StickVector {
  x: number;
  z: number;
}

const STOPPED: StickVector = { x: 0, z: 0 };

/** 조이스틱 중심에서 손가락까지의 화면 거리(px)를 이동 벡터로 바꾼다. dy 는 화면 아래가 양수. */
export function stickVector(dx: number, dy: number, radius = STICK_RADIUS): StickVector {
  const dist = Math.hypot(dx, dy);
  if (dist <= 0) return STOPPED;
  const mag = Math.min(1, dist / radius);
  if (mag < STICK_DEADZONE) return STOPPED;
  const speed = Math.min(1, (mag - STICK_DEADZONE) / (STICK_FULL - STICK_DEADZONE));
  return { x: (dx / dist) * speed, z: (-dy / dist) * speed };
}

/** 엄지 그림이 원 밖으로 나가지 않게 자른 위치(px). */
export function stickKnob(dx: number, dy: number, radius = STICK_RADIUS): { x: number; y: number } {
  const dist = Math.hypot(dx, dy);
  if (dist <= radius) return { x: dx, y: dy };
  return { x: (dx / dist) * radius, y: (dy / dist) * radius };
}

/* ─────────────────────────────── 시야 ─────────────────────────────── */

/** 드래그 1px 당 몇 라디안 도는가. */
export const LOOK_SENSITIVITY = 0.0035;
/** 고개를 젖힐 수 있는 한계(rad). */
export const MAX_PITCH = (85 * Math.PI) / 180;

/**
 * three.js 의 fov 는 **세로** 시야각이라 세로 화면에서 가로가 좁아진다.
 * 4:3 을 기준으로 가로 시야각을 지키도록 역산한다 (그보다 넓은 창은 전부 60).
 */
export const BASE_FOV = 60;
const MAX_FOV = 82;
const HALF_H_FOV = Math.atan(Math.tan((BASE_FOV / 2) * (Math.PI / 180)) * (4 / 3));

export function fovForAspect(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return BASE_FOV;
  const deg = 2 * Math.atan(Math.tan(HALF_H_FOV) / aspect) * (180 / Math.PI);
  return Math.min(MAX_FOV, Math.max(BASE_FOV, deg));
}

/**
 * 손으로 하는 조작 — 가상 조이스틱 · 시야 드래그 · 점프 버튼.
 *
 * 값은 전부 `./input` 의 `input` 하나에만 쓴다. React 상태가 하나도 없다 —
 * 엄지 좌표를 useState 에 담으면 초당 60번 리렌더가 3D 캔버스까지 끌고 돈다.
 * 그래서 엄지 그림은 ref 로 DOM transform 을 직접 만진다.
 *
 * 손가락 두 개를 동시에 받아야 한다(왼손 걷기 + 오른손 시야) — Pointer Events 로 pointerId 를 따로 추적한다.
 */

import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { STICK_RADIUS, addLook, input, resetInput, stickKnob, stickVector } from './input';

/** 조이스틱을 받는 영역 — 화면 왼쪽 이만큼. 나머지는 시야 드래그다 */
const STICK_ZONE = 0.5;
/** 조이스틱 원의 기본 자리(가장자리에서 px). */
const STICK_HOME_INSET = STICK_RADIUS + 30;

const ACCENT = '#d4a373';

export function TouchControls() {
  const rootRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);

  const stick = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const look = useRef<{ id: number; x: number; y: number } | null>(null);

  const placeRing = (x: number, y: number, active: boolean) => {
    const ring = ringRef.current;
    if (!ring) return;
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    ring.style.opacity = active ? '0.85' : '0.3';
  };

  const placeKnob = (dx: number, dy: number) => {
    const knob = knobRef.current;
    if (!knob) return;
    const k = stickKnob(dx, dy);
    knob.style.transform = `translate(-50%, -50%) translate(${k.x}px, ${k.y}px)`;
  };

  const releaseStick = () => {
    stick.current = null;
    input.moveX = 0;
    input.moveZ = 0;
    placeKnob(0, 0);
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) placeRing(STICK_HOME_INSET, rect.height - STICK_HOME_INSET, false);
  };

  useEffect(() => {
    const home = () => {
      if (stick.current) return;
      const rect = rootRef.current?.getBoundingClientRect();
      if (rect) placeRing(STICK_HOME_INSET, rect.height - STICK_HOME_INSET, false);
    };
    home();
    window.addEventListener('resize', home);
    window.addEventListener('orientationchange', home);
    return () => {
      window.removeEventListener('resize', home);
      window.removeEventListener('orientationchange', home);
    };
  }, []);

  // 사라질 때 반드시 비운다 — 밀고 있던 조이스틱의 pointerup 이 영영 안 오면 혼자 계속 걸어간다
  useEffect(() => () => resetInput(), []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (stick.current === null && x < rect.width * STICK_ZONE) {
      stick.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      placeRing(x, y, true);
      placeKnob(0, 0);
    } else if (look.current === null) {
      look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    } else {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stick.current;
    if (s && s.id === e.pointerId) {
      const dx = e.clientX - s.ox;
      const dy = e.clientY - s.oy;
      const v = stickVector(dx, dy);
      input.moveX = v.x;
      input.moveZ = v.z;
      placeKnob(dx, dy);
      return;
    }
    const l = look.current;
    if (l && l.id === e.pointerId) {
      addLook(e.clientX - l.x, e.clientY - l.y);
      l.x = e.clientX;
      l.y = e.clientY;
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stick.current?.id === e.pointerId) releaseStick();
    else if (look.current?.id === e.pointerId) look.current = null;
  };

  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0, zIndex: 28, pointerEvents: 'none', userSelect: 'none' }}>
      <div
        style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      <div
        ref={ringRef}
        aria-hidden
        style={{
          position: 'absolute',
          width: STICK_RADIUS * 2,
          height: STICK_RADIUS * 2,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.25)',
          background: 'rgba(0,0,0,0.25)',
          opacity: 0.3,
          transition: 'opacity 150ms',
          pointerEvents: 'none',
        }}
      >
        <div
          ref={knobRef}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'rgba(212,163,115,0.7)',
            boxShadow: '0 0 12px rgba(212,163,115,0.35)',
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>

      <button
        type="button"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          input.jump = true;
        }}
        onPointerUp={() => {
          input.jump = false;
        }}
        onPointerCancel={() => {
          input.jump = false;
        }}
        aria-label="점프"
        style={{ ...ROUND_BTN, right: 20, bottom: 'calc(1.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        ⤒
      </button>
    </div>
  );
}

/** 💬 — 데스크톱의 Enter 자리. 점프 버튼 위에 뜬다. */
export function SpeakButton({ onSpeak }: { onSpeak: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.stopPropagation();
        onSpeak();
      }}
      aria-label="말하기"
      style={{
        ...ROUND_BTN,
        width: 56,
        height: 56,
        right: 20,
        bottom: 'calc(1.75rem + 4rem + 0.75rem + env(safe-area-inset-bottom, 0px))',
        zIndex: 45,
        borderColor: 'rgba(212,163,115,0.5)',
        color: '#e8c9a0',
      }}
    >
      💬
    </button>
  );
}

const ROUND_BTN: CSSProperties = {
  position: 'absolute',
  width: 64,
  height: 64,
  borderRadius: '50%',
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(0,0,0,0.55)',
  color: '#e5e5e5',
  fontSize: 22,
  pointerEvents: 'auto',
  touchAction: 'none',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export { ACCENT as TOUCH_ACCENT };

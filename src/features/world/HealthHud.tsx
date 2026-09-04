/**
 * 체력 HUD — 화면 오른쪽 아래의 VITAL 판. 왼쪽 위 상태 패널(StatusPanel)과 같은 결 — uxpilot 디자인(hud.css 머리말).
 *
 *   ┌ VITAL                              ┐
 *   │ 100 HP   ╱╲__╱╲___ (EKG)           │
 *   │          ▮▮▮▮▮▮▮▮                  │
 *   └────────────────────────────────────┘
 *
 * 맞으면 판이 붉게 번쩍이고 숫자가 떨어진다. 값이 낮을수록 청록 → 호박 → 붉은색. 쓰러지면(0) 어두워지고 EKG 가 멈춘다.
 * 저장소(mp/health.ts)를 useSyncExternalStore 로 읽는다. pointer-events 없음.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';

import { health, HEALTH_MAX } from '@/world/mp/health';

import './hud.css';

const SEGMENTS = 8;

export function HealthHud() {
  const s = useSyncExternalStore(health.subscribe, health.get, health.get);
  const [hitAt, setHitAt] = useState(0);
  useEffect(() => {
    if (s.last) setHitAt(s.last.at);
  }, [s.last]);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!hitAt) return;
    setFlash(true);
    const id = window.setTimeout(() => setFlash(false), 320);
    return () => window.clearTimeout(id);
  }, [hitAt]);

  const t = s.value / HEALTH_MAX;
  const tone = s.dead ? 'hud-vital--dead' : t <= 0.25 ? 'hud-vital--crit' : t <= 0.5 ? 'hud-vital--low' : '';
  const lit = Math.round(t * SEGMENTS);
  return (
    <div className={`hud-vital ${tone} ${flash ? 'hud-vital--hit' : ''}`} aria-label={`체력 ${Math.round(s.value)}`}>
      <div>
        <div className="hud-label">VITAL</div>
        <div className="hud-vital__num">
          <b>{Math.round(s.value)}</b>
          <small>HP</small>
        </div>
      </div>
      <div className="hud-vital__body">
        <svg className="hud-vital__ekg" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="0,10 12,10 17,5 22,15 27,10 42,10 47,2 52,18 57,10 80,10 85,6 90,14 95,10 100,10" />
        </svg>
        <div className="hud-seg">
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <i key={i} className={i < lit ? 'on' : ''} />
          ))}
        </div>
      </div>
    </div>
  );
}

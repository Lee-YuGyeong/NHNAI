/**
 * 피격 연출(DOM) — 맞는 순간 붉은 비네트가 번쩍이고, 화면 위쪽에 「DANGER」 가 떠서 두근거린다.
 * 쓰러지면(dead) 비네트가 어둡게 남는다 (패배 판은 DefeatHud). 카메라 충격(임팩트)은 Downed 가 캔버스 안에서 준다.
 * mp/health.ts 를 읽기만 한다. pointer-events 없음.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';

import { health } from '@/world/mp/health';

/** DANGER 표시가 남는 시간(ms) — 연달아 맞으면 이어진다 */
const DANGER_MS = 900;

export function DamageHud() {
  const s = useSyncExternalStore(health.subscribe, health.get, health.get);
  const [hitAt, setHitAt] = useState(0);
  useEffect(() => {
    if (s.last) setHitAt(s.last.at);
  }, [s.last]);
  const [danger, setDanger] = useState(false);
  useEffect(() => {
    if (!hitAt) return;
    setDanger(true);
    const id = window.setTimeout(() => setDanger(false), DANGER_MS);
    return () => window.clearTimeout(id);
  }, [hitAt]);

  return (
    <>
      {hitAt ? (
        <>
          {/* 맞은 순간 — 화면이 통째로 한 번 하얗게 달아올랐다가(0.14s) 붉은 비네트가 죈다 (2026-08-31 사용자: 두려움을 느낄 정도로) */}
          <div
            key={`punch-${hitAt}`}
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, zIndex: 42, pointerEvents: 'none', background: 'radial-gradient(ellipse at center, rgba(255,225,200,0.28) 0%, rgba(255,90,60,0.24) 55%, rgba(180,20,10,0.5) 100%)', animation: 'dmg-punch 0.14s ease-out forwards' }}
          />
          <div
            key={hitAt}
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, zIndex: 42, pointerEvents: 'none', background: 'radial-gradient(ellipse at center, rgba(255,40,30,0) 18%, rgba(255,25,15,0.85) 100%)', animation: 'dmg-flash 0.62s ease-out forwards' }}
          />
        </>
      ) : null}
      {s.dead ? <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 42, pointerEvents: 'none', boxShadow: 'inset 0 0 220px rgba(120,10,10,0.8)' }} /> : null}
      {danger && !s.dead ? (
        <div style={{ position: 'absolute', top: '18%', left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 43, pointerEvents: 'none' }}>
          <div
            style={{
              padding: '6px 22px',
              fontFamily: 'monospace',
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '0.5em',
              color: '#ff6a5a',
              textShadow: '0 0 18px rgba(255,60,40,0.9)',
              border: '1px solid rgba(255,90,70,0.8)',
              background: 'rgba(40,4,4,0.55)',
              animation: 'dmg-danger 0.45s ease-in-out infinite',
            }}
          >
            ⚠ DANGER
          </div>
        </div>
      ) : null}
      <style>{`
        @keyframes dmg-flash { 0% { opacity: 1; } 12% { opacity: 0.95; } 100% { opacity: 0; } }
        @keyframes dmg-punch { 0% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes dmg-danger { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 1; transform: scale(1.06); } }
      `}</style>
    </>
  );
}

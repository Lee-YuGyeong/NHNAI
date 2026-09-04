/**
 * 무장 심문 AI 의 화면 연출 — 사격 때 화면이 하얗게 번쩍, 판정 동안 붉은 비네트와 자막 "INFILTRATOR TERMINATED".
 * enforcer.ts 를 읽기만 한다. pointer-events 없음.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';

import { enforcer } from './enforcerStore';

export function EnforcerHud() {
  const s = useSyncExternalStore(enforcer.subscribe, enforcer.get, enforcer.get);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (s.phase !== 'shoot') return;
    setFlash(s.flashAt);
  }, [s.flashAt, s.phase]);

  return (
    <>
      {s.phase === 'shoot' && flash ? (
        <div key={flash} aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none', background: '#fff', animation: 'enf-flash 0.22s ease-out forwards' }} />
      ) : null}
      {s.phase === 'shoot' || s.phase === 'verdict' ? (
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 39, pointerEvents: 'none', boxShadow: 'inset 0 0 180px rgba(255,40,30,0.55)' }} />
      ) : null}
      {s.phase === 'verdict' ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 41, pointerEvents: 'none' }}>
          <div
            style={{
              padding: '12px 30px',
              fontFamily: 'monospace',
              fontSize: 24,
              letterSpacing: '0.4em',
              color: '#ffb3a8',
              textShadow: '0 0 20px rgba(255,60,40,0.8)',
              borderTop: '1px solid rgba(255,90,70,0.7)',
              borderBottom: '1px solid rgba(255,90,70,0.7)',
              background: 'rgba(20,4,4,0.55)',
              animation: 'ch-banner 3.2s ease-out forwards',
            }}
          >
            INFILTRATOR TERMINATED
          </div>
        </div>
      ) : null}
      <style>{`@keyframes enf-flash { 0% { opacity: 0.9; } 100% { opacity: 0; } }`}</style>
    </>
  );
}

/**
 * 챕터 진행 HUD — 가운데 잠깐 뜨는 챕터 자막과 락다운 동안의 붉은 가장자리. (목표 줄은 StatusPanel 로 옮겼다, 2026-08-30)
 * chapter1.ts 저장소를 읽기만 한다. 전부 pointer-events 없음 — 플레이를 가리지 않는다.
 */

import { useSyncExternalStore } from 'react';

import { chapter1 } from './chapter1';

export function ObjectiveHud() {
  const s = useSyncExternalStore(chapter1.subscribe, chapter1.get, chapter1.get);
  return (
    <>
      {s.banner ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 28, pointerEvents: 'none' }}>
          <div
            key={s.banner}
            style={{
              padding: '10px 26px',
              fontFamily: 'monospace',
              fontSize: 22,
              letterSpacing: '0.35em',
              color: '#eaf6ff',
              textShadow: '0 0 18px rgba(111,211,255,0.6)',
              borderTop: '1px solid rgba(111,211,255,0.5)',
              borderBottom: '1px solid rgba(111,211,255,0.5)',
              background: 'rgba(4,12,22,0.35)',
              animation: 'ch-banner 2.6s ease-out forwards',
            }}
          >
            {s.banner}
          </div>
        </div>
      ) : null}

      {s.frozen ? (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 24,
            pointerEvents: 'none',
            boxShadow: 'inset 0 0 120px rgba(255,70,50,0.28)',
            animation: 'ch-alert 2.4s ease-in-out infinite',
          }}
        />
      ) : null}
      <style>{`@keyframes ch-banner { 0% { opacity: 0; transform: translateY(8px); } 12% { opacity: 1; transform: none; } 80% { opacity: 1; } 100% { opacity: 0; } }
@keyframes ch-alert { 50% { box-shadow: inset 0 0 160px rgba(255,70,50,0.42); } }`}</style>
    </>
  );
}

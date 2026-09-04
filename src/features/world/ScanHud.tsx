/**
 * 패턴 스캔 화면 — features/world/scan.ts 를 읽기만 한다. 전부 pointer-events 없음.
 *
 *   approach 경비가 온다 — 위쪽에 작은 경고 칩 (SCAN INBOUND)
 *   scan     화면에 훑는 선이 위아래로 흐르고, 가운데 "정지", 아래에 남은 시간 막대. **가만히 있어야 한다**
 *   done     통과면 청록 CLEAR, 실패면 붉은 FLAGGED 가 잠깐
 *
 * 값이 아니라 **압박**을 보여 주는 판이다 — 숫자는 StatusPanel 이 맡는다.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';

import { HOLD_MS, scan } from './scan';

export function ScanHud() {
  const s = useSyncExternalStore(scan.subscribe, scan.get, scan.get);
  const [left, setLeft] = useState(1);

  // 남은 시간 — 스캔 중에만 프레임마다 줄어든다
  useEffect(() => {
    if (s.phase !== 'scan') return;
    let raf = 0;
    const tick = () => {
      setLeft(Math.max(0, Math.min(1, (s.until - performance.now()) / HOLD_MS)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.phase, s.until]);

  if (s.phase === 'idle') return null;

  return (
    <>
      {s.phase === 'approach' ? (
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 27, pointerEvents: 'none' }}>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 12,
              letterSpacing: '0.28em',
              color: '#ffb84d',
              background: 'rgba(10,6,2,0.6)',
              border: '1px solid rgba(255,184,77,0.5)',
              padding: '5px 12px',
              animation: 'scan-blink 1.1s ease-in-out infinite',
            }}
          >
            SCAN INBOUND — {s.unitName}
          </span>
        </div>
      ) : null}

      {s.phase === 'scan' ? (
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 27, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 140px rgba(111,211,255,0.22)' }} />
          {/* 훑는 선 */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: 3,
              background: 'linear-gradient(90deg, transparent, rgba(143,230,255,0.95), transparent)',
              boxShadow: '0 0 18px rgba(143,230,255,0.8)',
              animation: 'scan-sweep 1.5s linear infinite',
            }}
          />
          <div style={{ position: 'absolute', top: '38%', left: 0, right: 0, textAlign: 'center' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 26, letterSpacing: '0.4em', color: '#eaf6ff', textShadow: '0 0 16px rgba(111,211,255,0.8)' }}>정지</div>
            <div style={{ marginTop: 6, fontSize: 12, letterSpacing: '0.2em', color: '#9fd4ec' }}>움직이지 마라 · 시선을 돌리지 마라</div>
          </div>
          {/* 남은 시간 */}
          <div style={{ position: 'absolute', left: '50%', bottom: '22%', transform: 'translateX(-50%)', width: 'min(340px, 60vw)', height: 5, background: 'rgba(4,12,22,0.7)', border: '1px solid rgba(111,211,255,0.45)' }}>
            <i style={{ display: 'block', height: '100%', width: `${left * 100}%`, background: '#6fd3ff', boxShadow: '0 0 10px rgba(111,211,255,0.9)' }} />
          </div>
        </div>
      ) : null}

      {s.phase === 'done' && s.passed !== null ? (
        <div style={{ position: 'absolute', top: '38%', left: 0, right: 0, textAlign: 'center', zIndex: 27, pointerEvents: 'none' }}>
          <span
            key={String(s.passed)}
            style={{
              fontFamily: 'monospace',
              fontSize: 22,
              letterSpacing: '0.36em',
              color: s.passed ? '#8ff0c8' : '#ff6a5a',
              textShadow: `0 0 18px ${s.passed ? 'rgba(143,240,200,0.6)' : 'rgba(255,106,90,0.7)'}`,
              animation: 'scan-verdict 2.2s ease-out forwards',
            }}
          >
            {s.passed ? 'CLEAR' : 'FLAGGED'}
          </span>
        </div>
      ) : null}

      <style>{`@keyframes scan-sweep { 0% { top: -4px; } 100% { top: 100%; } }
@keyframes scan-blink { 50% { opacity: 0.45; } }
@keyframes scan-verdict { 0% { opacity: 0; transform: scale(1.15); } 15% { opacity: 1; transform: none; } 70% { opacity: 1; } 100% { opacity: 0; } }`}</style>
    </>
  );
}

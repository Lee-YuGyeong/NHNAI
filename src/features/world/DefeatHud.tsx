/**
 * 패배 판 — 쓰러지면(health.dead) 어두워지며 「제압되었다」. 남은 팀원이 있으면 그들이 끝날 때까지 기다리고(관전),
 * 없으면 RESTART_S 초를 세고 처음으로 돌아간다 (onRestart — WorldFeature 가 방을 다시 연다).
 *
 *   alive     — 아직 서 있는 팀원 수 (명부 − 쓰러진 사람). WorldFeature 가 team.ts 로 센다
 *   onRestart — 처음부터 다시 시작
 * pointer-events 없음.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';

import { health } from '@/world/mp/health';

const RESTART_S = 5;

export function DefeatHud({ alive, onRestart }: { alive: number; onRestart: () => void }) {
  const dead = useSyncExternalStore(health.subscribe, () => health.get().dead, () => false);
  const [left, setLeft] = useState(RESTART_S);

  // 쓰러졌고 팀원이 없으면 — 초를 세고 처음으로
  useEffect(() => {
    if (!dead || alive > 0) {
      setLeft(RESTART_S);
      return;
    }
    const startedAt = performance.now();
    const id = window.setInterval(() => {
      const remain = Math.max(0, Math.ceil(RESTART_S - (performance.now() - startedAt) / 1000));
      setLeft(remain);
      if (remain <= 0) {
        window.clearInterval(id);
        onRestart();
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [dead, alive, onRestart]);

  if (!dead) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, pointerEvents: 'none', background: 'rgba(6,2,2,0.55)', animation: 'defeat-in 1.2s ease-out both' }}>
      <div style={{ fontFamily: 'monospace', fontSize: 34, letterSpacing: '0.5em', color: '#ffb3a8', textShadow: '0 0 24px rgba(255,60,40,0.8)', borderTop: '1px solid rgba(255,90,70,0.6)', borderBottom: '1px solid rgba(255,90,70,0.6)', padding: '12px 36px' }}>
        제압되었다
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.2em', color: '#d9a39a' }}>패배 — 인간으로 판정되었다</div>
      <div style={{ marginTop: 10, fontFamily: 'monospace', fontSize: 12, letterSpacing: '0.1em', color: '#a8b8c8', textAlign: 'center', lineHeight: 1.8 }}>
        {alive > 0 ? (
          <>
            남은 팀원 {alive}명 — 그들이 제압되면 처음부터 다시 시작한다
            <br />
            <span style={{ color: '#7f95a8' }}>관전 중</span>
          </>
        ) : (
          <>
            남은 팀원이 없다
            <br />
            <span style={{ color: '#e0e8f0' }}>{left}초 뒤 처음부터 다시 시작</span>
          </>
        )}
      </div>
      <style>{`@keyframes defeat-in { 0% { opacity: 0; } 100% { opacity: 1; } }`}</style>
    </div>
  );
}

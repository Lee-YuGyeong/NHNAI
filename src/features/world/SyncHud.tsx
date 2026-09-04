/**
 * SYNC 글리치 화면 효과 — 80 아래에서 mp/sync.ts 의 glitch 가 오를 때: 화면 가장자리가 붉게 한 번 뛰고,
 * **사람 손**(public/ui/sync-hand.webp)이 0.12초 겹쳐 보이고, 심장박동(sfx.ts)이 난다. 손 떨림(카메라)은 캔버스 안의 SyncTremor 가 한다.
 * 게이지 자체는 StatusPanel 에 있다.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';

import { sync } from '@/world/mp/sync';

import { heartbeat } from './sfx';

const HAND = '/ui/sync-hand.webp';

export function SyncHud() {
  const glitch = useSyncExternalStore(sync.subscribe, () => sync.get().glitch, () => 0);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    if (!glitch) return;
    setFlash(glitch);
    heartbeat();
    const id = window.setTimeout(() => setFlash(0), 140);
    return () => window.clearTimeout(id);
  }, [glitch]);

  if (!flash) return null;
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 38, pointerEvents: 'none', boxShadow: 'inset 0 0 140px rgba(255,60,50,0.55)' }}>
      <img src={HAND} alt="" draggable={false} style={{ position: 'absolute', right: '-4%', bottom: '-6%', width: '58%', maxWidth: 860, mixBlendMode: 'screen', opacity: 0.85, filter: 'contrast(1.1)' }} />
    </div>
  );
}

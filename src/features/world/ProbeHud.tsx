/**
 * 판독 표시 — 화면 한가운데. 정비 단말이나 벽의 문구에 **조준이 물린 동안**만 뜬다 (probe.ts).
 *
 * 네 귀퉁이 꺾쇠가 대상을 물고, 그 아래로 대상 이름 · 눈금 · 지금 하는 일 한 줄. 다 읽으면 초록으로 한 번 확인해 주고 사라진다.
 * 「가까이 가서 정면으로 본다」가 이 게임의 조사 방법이라는 걸 화면이 직접 말해 준다 (2026-08-31 사용자: 복도에서 뭘 해야 할지 알 수 있게).
 *
 * 조준점 — 물리기 전에도 화면 한가운데 2 px 점 하나. 시나리오 2 의 응시가 「앵커를 화면 가운데에 둔다」로 바뀌면서(world2/Murals 의 GAZE_NDC)
 * 그 가운데가 어디인지 화면이 말해야 했다. 흐린 점 하나뿐이라 본판에서도 거슬리지 않는다 — 끄려면 reticle={false}.
 *
 * 저장소를 읽기만 한다. pointer-events 없음 — 걷기를 방해하지 않는다.
 */

import { useSyncExternalStore, type CSSProperties } from 'react';

import { PROBE_STEPS, probe } from './probe';
import './hud.css';

/** 조준점 — hud.css 에 손대지 않으려고 여기서 그린다. .probe 의 꺾쇠(top 46% + 28px)와 같은 중심 */
const RETICLE: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: 2,
  height: 2,
  marginLeft: -1,
  marginTop: -1,
  borderRadius: 1,
  background: 'rgba(234, 246, 255, 0.5)',
  zIndex: 29,
  pointerEvents: 'none',
};

export function ProbeHud({ reticle = true }: { reticle?: boolean } = {}) {
  const s = useSyncExternalStore(probe.subscribe, probe.get, probe.get);
  const dot = reticle ? <span className="probe__dot" style={RETICLE} aria-hidden="true" /> : null;
  if (!s.label) return dot;
  const lit = Math.round(s.progress * PROBE_STEPS);
  return (
    <>
      {dot}
      <div className={`probe ${s.done ? 'probe--done' : ''}`} aria-hidden="true">
        <span className="probe__frame">
          <i />
          <i />
          <i />
          <i />
        </span>
        <div className="probe__label">{s.label}</div>
        <div className="probe__seg">
          {Array.from({ length: PROBE_STEPS }, (_, i) => (
            <i key={i} className={i < lit ? 'on' : ''} />
          ))}
        </div>
        <div className="probe__hint">{s.hint}</div>
      </div>
    </>
  );
}

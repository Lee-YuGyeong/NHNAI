/**
 * 시설 공지 — 화면 위 가운데의 보안 공지(SECURITY NOTICE / MODEL : A-17 …)와 **무대를 넘는 암전** 셋.
 * 무대를 넘는 자리마다 하나씩이다: chapter1 의 문턱(복도 → 중앙 시설), chapter2 의 마지막(→ 재검실),
 * chapter3 의 마지막(→ 인지 검증실). 읽기만 한다.
 * 복도 스크린에 스치는 문구(EXTERNAL SIGNAL DETECTED)도 이 자리로 뜬다 (chapter1 이 잠깐 켠다).
 *
 * ★ **챕터 3 의 암전이 여기 없었다.** chapter3 은 나가면서 blackout 을 세우는데(chapter3 의 leave)
 *   그 값을 읽는 화면이 하나도 없어서, 재검실 → 검증실만 **암전 없이** 넘어갔다. 문이 열리고
 *   배너 둘이 지나가는 6.2초 내내 방은 환한 채였고, 그 밝은 방에서 검증실의 검은 인계 화면으로
 *   컷이 튀었다. 검증실 쪽 주석들이 「앞 무대의 암전을 이어받는다」고 적어 둔 그 암전이 없던 것이다
 *   (features/arena/ArenaFeature 의 .arrive · features/arena/handover 머리말).
 */

import { useSyncExternalStore } from 'react';

import { chapter1 } from './chapter1';
import { chapter2, type Notice } from './chapter2';
import { chapter3 } from './chapter3';

const TONE: Record<Notice['tone'], { line: string; text: string; bg: string }> = {
  alert: { line: 'rgba(255,90,74,0.85)', text: '#ffb3a8', bg: 'rgba(40,6,4,0.62)' },
  info: { line: 'rgba(111,211,255,0.7)', text: '#cfeeff', bg: 'rgba(4,12,22,0.62)' },
  ok: { line: 'rgba(143,240,200,0.8)', text: '#d6fff0', bg: 'rgba(4,22,14,0.62)' },
};

export function NoticeHud() {
  const notice2 = useSyncExternalStore(chapter2.subscribe, () => chapter2.get().notice, () => null);
  const notice1 = useSyncExternalStore(chapter1.subscribe, () => chapter1.get().notice, () => null);
  const blackout = useSyncExternalStore(chapter2.subscribe, () => chapter2.get().blackout, () => 0);
  /** 복도 → 중앙 시설로 넘어가는 짧은 암전 (chapter1.onDoorway). 챕터 2 의 마지막 암전보다 빠르다 */
  const transit = useSyncExternalStore(chapter1.subscribe, () => chapter1.get().blackout, () => 0);
  /**
   * 재검실 → 인지 검증실 (chapter3.leave). 챕터 2 것보다 조금 빠른 1.2초인데, 거기 배너가
   * **2.4초에** 서기 때문이다 — 그때 화면이 다 검어야 「CHAPTER 3 · END」가 검은 바탕에 뜬다.
   * (챕터 2 는 암전 1.6 초 뒤 3.6초에 배너라 같은 모양이 1.6 으로 맞는다.)
   */
  const exit3 = useSyncExternalStore(chapter3.subscribe, () => chapter3.get().blackout, () => 0);
  const notice = notice2 ?? notice1;
  return (
    <>
      {notice ? (
        <div key={notice.title + notice.lines.join()} style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 29, pointerEvents: 'none', animation: 'notice-in 0.35s ease-out both' }}>
          <div
            style={{
              padding: '8px 22px',
              minWidth: 260,
              textAlign: 'center',
              fontFamily: 'monospace',
              letterSpacing: '0.22em',
              background: TONE[notice.tone].bg,
              borderTop: `1px solid ${TONE[notice.tone].line}`,
              borderBottom: `1px solid ${TONE[notice.tone].line}`,
              color: TONE[notice.tone].text,
              textShadow: `0 0 12px ${TONE[notice.tone].line}`,
              animation: notice.tone === 'alert' ? 'notice-blink 1.6s ease-in-out infinite' : 'none',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700 }}>{notice.title}</div>
            {notice.lines.map((l) => (
              <div key={l} style={{ fontSize: 11, marginTop: 3, opacity: 0.9 }}>
                {l}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {blackout > 0 || transit > 0 || exit3 > 0 ? (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 60,
            background: '#000',
            pointerEvents: 'none',
            animation: `notice-black ${blackout > 0 ? '1.6s' : exit3 > 0 ? '1.2s' : '0.82s'} ease-in both`,
          }}
        />
      ) : null}
      <style>{`@keyframes notice-in { from { opacity: 0; transform: translate(-50%, -6px); } to { opacity: 1; transform: translate(-50%, 0); } }
@keyframes notice-blink { 50% { opacity: 0.72; } }
@keyframes notice-black { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </>
  );
}

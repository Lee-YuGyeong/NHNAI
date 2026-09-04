import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { BroadcastKind } from '@/shared/broadcast';
import { useAppSelector } from '@/store/hooks';
import { drawsOwnSubtitle, inVoiceScope } from './scope';
import { ttsSelectors } from './ttsSlice';

/**
 * 발화가 끝나고도 자막이 남는 시간.
 *
 * 소리가 멎는 순간 글자를 지우면 늦게 본 사람은 못 읽는다. 소리는 처음부터 듣지만
 * 글자는 눈이 가야 읽히고, 3D 화면에서는 다른 데를 보고 있다가 목소리를 듣고
 * 그제야 자막으로 눈을 옮긴다 — 그 사람에게는 읽을 시간이 한 글자도 없는 셈이다.
 *
 * 다음 방송이 오면 기다리지 않고 바로 갈린다. 이 시간은 **뒤에 아무것도 없을 때만** 쓰인다.
 * 라운드가 6~12초 단위로 넘어가니 2초면 다음 단계를 밀어내지 않는다 (PLANNING §1.2b).
 */
export const LINGER_MS = 2000;

/**
 * 종류별 생김새. 경보만 확실히 다르게 — 폐기가 결정되는 순간과 평소 안내가
 * 똑같이 생기면 자막이 그 차이를 지운다.
 *
 * 색으로만 구분하지는 않는다. 색을 못 보는 사람과 화면 낭독기에는 아래 role 이 같은 일을 한다.
 */
const LOOK: Record<BroadcastKind, { background: string; border: string; color: string; weight: number }> = {
  announce: { background: 'rgba(0, 0, 0, 0.72)', border: 'rgba(255, 255, 255, 0.14)', color: '#e8eef6', weight: 400 },
  readout: { background: 'rgba(8, 26, 40, 0.8)', border: 'rgba(96, 176, 220, 0.5)', color: '#d6ecf8', weight: 400 },
  alarm: { background: 'rgba(48, 8, 10, 0.85)', border: 'rgba(224, 78, 66, 0.75)', color: '#ffdedb', weight: 600 },
};

/**
 * 방송 자막 — App 에 한 번 마운트되는 전역 띠. 지금 읽고 있는 문장을 글자로 같이 낸다.
 *
 * 소리를 못 듣는 경우가 생각보다 많다. 발표장에서 스피커가 안 잡히기도 하고,
 * 지금은 영어로 녹음된 목소리가 한국어를 읽는 데다 확성기 필터까지 씌워서
 * 알아듣기가 더 어렵다. /arena 는 리더의 지시문 자체가 게임이라 그 순간
 * 분위기가 아니라 **기능이** 깨진다. 자막은 그 보험이다.
 *
 * 재생기(TtsPlayer)와 같은 자리에서 같은 상태(current)를 본다 — 소리와 글자가
 * 한 곳에서 갈라져 나가야 둘이 어긋나지 않는다.
 */
export function BroadcastBanner() {
  const current = useAppSelector(ttsSelectors.selectCurrent);
  const { pathname } = useLocation();
  // 지금 읽는 것과 따로 든다 — 소리는 멎었는데 글자는 아직 남아 있는 구간이 있다
  const [shown, setShown] = useState(current);

  useEffect(() => {
    // 새 방송이 왔다. 기다리지 않고 바로 간다 — 소리가 이미 그 문장을 읽고 있다
    if (current) {
      setShown(current);
      return;
    }
    const t = setTimeout(() => setShown(null), LINGER_MS);
    return () => clearTimeout(t); // 남아 있는 사이에 다음 방송이 오면 취소된다
  }, [current]);

  // 아직 손보는 중이라 내 화면에서만 띄운다 (scope.ts). 시계는 위에서 계속 돌게 두어
  // 다른 화면을 다녀와도 남은 시간이 어긋나지 않는다 — 훅은 조건 뒤에 올 수 없기도 하다.
  if (!shown || !inVoiceScope(pathname) || drawsOwnSubtitle(pathname)) return null;

  const look = LOOK[shown.kind];
  // 경보는 기다리지 않는다 — 큐에서 재생 중인 방송을 끊고 나가는 것과 같은 규칙을
  // 낭독기에도 적용한다. alert/assertive 는 읽던 것을 끊고 먼저 읽는다.
  const urgent = shown.kind === 'alarm';

  return (
    <div
      // 화면 위를 덮는 띠라 클릭을 가로채면 안 된다 — 3D 화면에서는 조작을 통째로 먹는다
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 32,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 100,
      }}
    >
      <p
        role={urgent ? 'alert' : 'status'}
        aria-live={urgent ? 'assertive' : 'polite'}
        style={{
          margin: 0,
          maxWidth: 'min(90vw, 720px)',
          padding: '12px 20px',
          borderRadius: 8,
          background: look.background,
          border: `1px solid ${look.border}`,
          color: look.color,
          fontWeight: look.weight,
          fontSize: 18,
          lineHeight: 1.5,
          textAlign: 'center',
          // 3D 화면 위에도 얹히므로 배경이 밝든 어둡든 읽혀야 한다
          textShadow: '0 1px 3px rgba(0, 0, 0, 0.9)',
        }}
      >
        {shown.text}
      </p>
    </div>
  );
}

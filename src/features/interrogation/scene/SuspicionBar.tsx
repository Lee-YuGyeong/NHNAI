/**
 * 머리 위 의심도 막대 — 남의 몸(SeatAvatar)과 내 몸(SelfAvatar)이 **같은 부품**을 쓴다
 * (2026-09-05 사용자: "내 의심도도 내 머리 위에 보이게 해줘"). 원래 SeatAvatar 안에 박혀 있던 것을 그대로 떼어 냈다:
 *
 *   · **React 를 거치지 않고** 프레임마다 style 을 직접 고친다 — 의심도는 자주 움직이고, 값으로 넘기면
 *     눈금이 바뀔 때마다 아바타가 memo 를 뚫고 다시 그려진다. 그래서 값이 아니라 `getValue` 함수를 받는다.
 *   · 값이 바뀐 프레임에만 DOM 을 만진다.
 *   · **0 이어도 눈금(빈 막대)은 남긴다** — 값이 있을 때만 띄우면 판이 서기 전까지 아무것도 안 보여
 *     막대가 어디서 차오르는지를 알 수가 없다 (susbar.ts 머리말).
 *   · 색은 susbar.ts 한 곳이 정한다 — 길이만이 아니라 **색이 눈금을 말한다.**
 *
 * 자(width · height)는 기본이 60×7 — 남의 몸은 전부 이 자다(이름 길이와 무관하게 늘 같아야 서로 비교가 된다).
 * 내 몸만 다른 자를 받는다 — 이유는 SelfAvatar 머리말.
 *
 * 파일 이름이 susbar.ts(색 결정)와 대소문자만 달라서는 안 된다 — 맥의 파일계가 둘을 못 가른다(tsc TS1261).
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

import { SUS_LOOK, SUS_TRACK, susLevel } from './susbar';

export function SuspicionBar({ getValue, width = 60, height = 7 }: { getValue: () => number; width?: number; height?: number }) {
  const fill = useRef<HTMLElement>(null);
  /** 마지막으로 쓴 값. 안 바뀌면 DOM 을 안 건드린다 */
  const last = useRef(-1);
  const radius = Math.round(height * 0.43);

  useFrame(() => {
    const el = fill.current;
    if (!el) return;
    const sus = Math.max(0, Math.min(100, Math.round(getValue())));
    if (sus === last.current) return;
    last.current = sus;
    el.style.width = `${sus}%`;
    const look = SUS_LOOK[susLevel(sus)];
    el.style.background = look.fill;
    el.style.boxShadow = look.glow;
  });

  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background: SUS_TRACK,
        overflow: 'hidden',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.85), inset 0 0 0 1px rgba(255,255,255,0.16)',
      }}
    >
      <i ref={fill} style={{ display: 'block', width: '0%', height: '100%', borderRadius: radius, background: SUS_LOOK.calm.fill }} />
    </div>
  );
}

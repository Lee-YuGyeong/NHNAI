/**
 * 내 의심도 — 발치 안내줄(WASD 이동 · Enter 로 말하기) 바로 위, 한가운데의 **고정 계기**. 구석에 두면 눈에 안 들어온다 (2026-09-05 사용자).
 *
 * 머리 위에 있던 내 막대를 여기로 내렸다 (2026-09-05 사용자: "AI 의심도랑 대화 말풍선이 같은 위치에 있으니까
 * 어색해"). 내 몸은 카메라 1.9m 앞이라 머리 위 자리가 곧 시선 한가운데인데, 거기에 막대와 말풍선이 겹쳐 서면
 * 말풍선 꼬리가 막대를 가리키고 막대는 상자 밑단처럼 읽혔다. 말풍선은 머리 위에 있어야 말풍선이고(ChatBubble
 * 머리말 — 옆으로 비켜 세운 판은 걷었다), 내 눈금은 남과 견주는 것이 아니라 **나 하나의 상태**라 몸에 붙어 있을
 * 이유가 없다. 남의 막대는 그대로 몸 위다 — 누구 것인지가 곧 정보라서.
 *
 * 막대는 남의 것과 같은 부품(SuspicionBar)이라 색·눈금 규칙이 같다. 수치는 rAF 로 따라 쓴다 — 값으로 넘기면
 * 눈금이 움직일 때마다 화면 전체가 다시 그려진다 (SuspicionBar 머리말과 같은 이유).
 */
import { useEffect, useRef } from 'react';

import { SuspicionBar } from '../scene/SuspicionBar';

export function SelfSuspicion({ getValue }: { getValue: () => number }) {
  const num = useRef<HTMLElement>(null);
  const get = useRef(getValue);
  get.current = getValue;
  useEffect(() => {
    let raf = 0;
    let last = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = num.current;
      if (!el) return;
      const v = Math.max(0, Math.min(100, Math.round(get.current())));
      if (v === last) return;
      last = v;
      el.textContent = `${v}%`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="ig-susme" aria-label="내 의심도">
      <span className="lbl">내 의심도</span>
      <SuspicionBar getValue={getValue} width={240} height={12} />
      <b ref={num}>0%</b>
    </div>
  );
}

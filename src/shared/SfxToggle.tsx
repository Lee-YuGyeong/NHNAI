/**
 * 소리 스위치 — 켜고 끄는 것 하나뿐이다.
 *
 * 크기 손잡이(리더 방송·배경음악 Bgm)를 두지 않는 이유: 방송·음악은 "지금은 못 들어서" 줄이는
 * 소리지만 효과음은 **듣거나 안 듣거나**다. 반쯤 들리는 클릭음을 원하는 사람은 없다.
 *
 * ★ 이 스위치 하나가 **소리 전부**를 맡는다. setSfxOn(false) 는 방의 배경음(roomTone)까지
 *   같이 내린다 (shared/sfx.ts) — 껐는데 음악만 남으면 스위치가 고장 난 것으로 보인다.
 *
 * ★ 글자를 그리지 않는다 (2026-08-30 사용자: "이거 다 글자 없애줘" → "소리 누르면 꺼지는거
 *   넣어줘"). 걸린 것은 기능이 아니라 **글자**였다. 그래서 이모지(🔊)도 문자(♪)도 쓰지 않고
 *   인라인 SVG 한 개다 — 머리말의 다른 아이콘들과 같은 손이다 (lobby/console.tsx 의 규칙:
 *   currentColor, 1.1px 선, 12px 안팎). 읽을 글자는 aria-label 에만 있다.
 *
 * 모양은 인라인이다. shared 의 부품은 남의 CSS(lobby.css)를 쓰지 않는다 — 꺼진 표시도
 * 색 이름이 아니라 opacity 로 낸다. className 은 자리를 잡아 주는 쪽에서 준다.
 *
 * 스위치 자신은 data-sfx="none" 이라 누를 때 클릭음이 나지 않는다. **끌 때는 조용해야 하고**
 * (끄는 소리가 나면 그게 마지막으로 듣는 소리다), 켜는 쪽으로 넘길 때만 철컹 소리를 한 번 낸다 —
 * 켰다는 확인이자, 이 스위치가 무엇을 켜는지 그대로 들려주는 자리다.
 */

import { useState } from 'react';
import { playSfx, setSfxOn, sfxOn } from './sfx';

/** 스피커 하나. 켜져 있으면 소리결 두 줄, 꺼져 있으면 사선 하나 */
function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M1.1 4.6h1.8L5.3 2.3v7.4L2.9 7.4H1.1z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      {on ? (
        <>
          <path d="M7.3 4.5a2.1 2.1 0 010 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <path d="M8.9 2.9a4.4 4.4 0 010 6.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </>
      ) : (
        <path d="M7.4 4.2l3.5 3.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function SfxToggle({ className }: { className?: string }) {
  const [on, setOn] = useState(sfxOn);

  return (
    <button
      type="button"
      className={className}
      data-sfx="none"
      aria-pressed={on}
      aria-label={on ? '소리 끄기' : '소리 켜기'}
      title={on ? '소리 끄기' : '소리 켜기'}
      style={{ opacity: on ? 1 : 0.5 }}
      onClick={() => {
        const next = !on;
        setSfxOn(next);
        setOn(next);
        // 켤 때만 낸다 — 끄면서 소리를 내면 그게 마지막으로 듣는 소리가 된다
        if (next) playSfx('clank');
      }}
    >
      <SpeakerIcon on={on} />
    </button>
  );
}

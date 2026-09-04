/**
 * 7 시 방향의 대화 로그 — 내가 친 말과 저쪽의 **답**이 화면 왼쪽 아래에 작은 줄로 잠깐 흐른다 (2026-09-03 사용자: 「대화는 7 시 방향에 대화한 게 보이고」).
 * 본판 SelfChatLog(내 말만)와 같은 자리·같은 생김새에 상대 줄이 더해진 것이다. 답은 머리 위 말풍선(bubbles.ts)에도 뜨고, 여기에는 **주고받은 순서로** 남는다.
 * 대본·저쪽이 먼저 건 말은 대화창 상자(DialogueBox)의 것이라 여기 안 온다.
 * 최근 4줄, 8초 지나면 사라진다. 전부 pointer-events 없음.
 */

import { useEffect, useState } from 'react';

export interface TalkEntry {
  key: string;
  /** 이름표 — 내 줄은 「나」, 답은 그 개체의 이름표(units.label) */
  who: string;
  text: string;
  ts: number;
  mine: boolean;
}

const KEEP = 4;
const FADE_MS = 8000;

/** lift: 대화창이 올라간 만큼(px) 같이 올린다 — 입력줄이 열렸을 때 대화창과 겹치지 않게 (SelfChatLog 와 같은 값) */
export function TalkLog({ entries, touch, lift = 0 }: { entries: readonly TalkEntry[]; touch: boolean; lift?: number }) {
  const [tick, setTick] = useState(0);
  const now = Date.now();
  const live = entries.filter((e) => now - e.ts < FADE_MS).slice(-KEEP);

  // 사라질 때가 되면 다시 그린다
  useEffect(() => {
    if (!live.length) return;
    const oldest = live[0].ts;
    const id = window.setTimeout(() => setTick((n) => n + 1), Math.max(200, oldest + FADE_MS - Date.now()));
    return () => window.clearTimeout(id);
  }, [live, tick]);

  if (!live.length) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        bottom: touch ? 'calc(300px + env(safe-area-inset-bottom, 0px))' : `calc(${190 + lift}px + env(safe-area-inset-bottom, 0px))`,
        transition: 'bottom 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        zIndex: 25,
        pointerEvents: 'none',
        fontFamily: 'monospace',
        fontSize: 12,
        letterSpacing: '0.02em',
      }}
    >
      {live.map((e) => (
        <p
          key={e.key}
          style={{
            margin: 0,
            maxWidth: 'min(30rem, 50vw)',
            padding: '3px 8px',
            borderRadius: 4,
            background: 'rgba(4,12,22,0.55)',
            borderLeft: `2px solid ${e.mine ? 'rgba(230,214,170,0.75)' : 'rgba(111,211,255,0.75)'}`,
            color: '#eaf0f6',
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
            opacity: Math.max(0.35, 1 - (now - e.ts) / FADE_MS),
            wordBreak: 'keep-all',
            overflowWrap: 'anywhere',
          }}
        >
          <span style={{ color: e.mine ? '#e6d6aa' : '#9fdcff', fontWeight: 700 }}>{e.who}</span> {e.text}
        </p>
      ))}
    </div>
  );
}

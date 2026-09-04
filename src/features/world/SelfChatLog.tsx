/**
 * 내가 친 말 — 대화창(초상 박스)에는 안 뜨고, 화면 왼쪽 아래에 작은 줄로 잠깐 흐른다.
 * 대화창은 AI·이야기·다른 사람의 말을 담고, 내 말은 "내가 한 말"로만 남는다 (AI 는 이 말을 듣고 판정한다 — WorldFeature 의 sendLine).
 * 최근 4줄, 8초 지나면 사라진다. 전부 pointer-events 없음.
 */

import { useEffect, useState } from 'react';

import type { ChatLine } from './worldSlice';

const KEEP = 4;
const FADE_MS = 8000;

/** lift: 대화창이 올라간 만큼(px) 같이 올린다 — 입력줄이 열렸을 때 대화창과 겹치지 않게 */
export function SelfChatLog({ messages, selfId, touch, lift = 0 }: { messages: readonly ChatLine[]; selfId: string | null; touch: boolean; lift?: number }) {
  const [tick, setTick] = useState(0);
  const now = Date.now();
  const mine = messages.filter((m) => m.id === selfId && !m.portrait && now - m.ts < FADE_MS).slice(-KEEP);

  // 사라질 때가 되면 다시 그린다
  useEffect(() => {
    if (!mine.length) return;
    const oldest = mine[0].ts;
    const id = window.setTimeout(() => setTick((n) => n + 1), Math.max(200, oldest + FADE_MS - Date.now()));
    return () => window.clearTimeout(id);
  }, [mine, tick]);

  if (!mine.length) return null;
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
      {mine.map((m) => (
        <p
          key={m.key}
          style={{
            margin: 0,
            maxWidth: 'min(30rem, 50vw)',
            padding: '3px 8px',
            borderRadius: 4,
            background: 'rgba(4,12,22,0.55)',
            borderLeft: '2px solid rgba(230,214,170,0.75)',
            color: '#eaf0f6',
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
            opacity: Math.max(0.35, 1 - (now - m.ts) / FADE_MS),
            wordBreak: 'keep-all',
            overflowWrap: 'anywhere',
          }}
        >
          <span style={{ color: '#e6d6aa', fontWeight: 700 }}>나</span> {m.text}
        </p>
      ))}
    </div>
  );
}

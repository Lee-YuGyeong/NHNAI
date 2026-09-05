/**
 * 머리 위 말풍선 — 남의 몸(SeatAvatar)과 내 몸(SelfAvatar)이 같은 것을 단다 (2026-09-05 사용자: "내 대화 친 것도
 * 말풍선 보이게"). 생김새는 옛 시행판(SeatAvatar 에 인라인으로 있던 것)을 그대로 옮겼다 — 둥근 반투명 상자에 아래로
 * 꼬리 하나. 부모는 이름표·막대가 선 세로 칸이고, 이 상자는 그 칸의 **위**에 절대 배치로 얹힌다.
 */
import type { CSSProperties } from 'react';

const BOX: CSSProperties = {
  position: 'absolute',
  bottom: '100%',
  left: '50%',
  marginBottom: 10,
  transform: 'translateX(-50%)',
  width: 'max-content',
  maxWidth: 300,
  borderRadius: 16,
  border: '1px solid #374151',
  background: 'rgba(30,30,30,0.62)',
  padding: '12px 24px',
  boxShadow: '0 10px 15px rgba(0,0,0,0.3)',
};
// 2026-09-05 사용자: 「내 대화 텍스트 크기 너무 작아」 — 14 → 18. 상자 폭(maxWidth)도 같이 넓혀 줄이 덜 접힌다
const TEXT: CSSProperties = { display: 'block', fontSize: 18, fontWeight: 500, lineHeight: 1.3, color: '#fff' };
const TAIL: CSSProperties = {
  position: 'absolute',
  bottom: -8,
  left: '50%',
  width: 0,
  height: 0,
  transform: 'translateX(-50%)',
  borderLeft: '8px solid transparent',
  borderRight: '8px solid transparent',
  borderTop: '8px solid rgba(30,30,30,0.62)',
};

export function ChatBubble({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div style={BOX}>
      <span style={TEXT}>{text}</span>
      <span aria-hidden style={TAIL} />
    </div>
  );
}

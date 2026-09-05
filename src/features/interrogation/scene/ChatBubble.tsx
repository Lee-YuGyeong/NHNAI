/**
 * 머리 위 말풍선 — 남의 몸(SeatAvatar)과 내 몸(SelfAvatar)이 같은 것을 단다 (2026-09-05 사용자: "내 대화 친 것도
 * 말풍선 보이게"). 생김새는 옛 시행판(SeatAvatar 에 인라인으로 있던 것)을 그대로 옮겼다 — 둥근 반투명 상자에 아래로
 * 꼬리 하나. 부모는 이름표·막대가 선 세로 칸이고, 이 상자는 그 칸의 **위**에 절대 배치로 얹힌다.
 *
 * 내 것도 같은 자리다. 잠깐 헬멧 오른쪽 위로 비켜 세워 봤는데(시선 한가운데를 비우려고) 「옆으로 설 때가 있다」로
 * 돌아왔다 (2026-09-05 사용자) — 말풍선은 머리 위에 있어야 말풍선이다.
 *
 * 꼬리는 상자와 같은 반투명 회색이라 어두운 벽 앞에서 사라졌다 (2026-09-05 사용자: "꼬리도 보이게") — 상자 테두리 색의
 * 삼각형을 한 겹 뒤에 깔아 윤곽을 준다.
 *
 * 크기가 두 벌이다 (big). 남의 것은 거리 배율(distanceFactor 9)로 멀면 작고 가까우면 커지는데, 내 것은 배율 없이 픽셀
 * 고정이라(SelfAvatar 머리말) 1.9m 앞의 내 몸 옆에서 남의 3m 거리 크기로 보였다 — 「대화 텍스트창 너무 작은데」
 * (2026-09-05 사용자). 내 것은 글자·여백·꼬리를 한 벌 키운다.
 */
import type { CSSProperties } from 'react';

const BG = 'rgba(30,30,30,0.62)';
const EDGE = '#374151';
const box = (k: number): CSSProperties => ({
  position: 'absolute',
  bottom: '100%',
  left: '50%',
  marginBottom: 10 * k,
  transform: 'translateX(-50%)',
  width: 'max-content',
  maxWidth: 220 * k,
  borderRadius: 16 * k,
  border: `1px solid ${EDGE}`,
  background: BG,
  padding: `${12 * k}px ${24 * k}px`,
  boxShadow: '0 10px 15px rgba(0,0,0,0.3)',
});
const text = (k: number): CSSProperties => ({ display: 'block', fontSize: 14 * k, fontWeight: 500, lineHeight: 1.3, color: '#fff' });
const tail = (size: number, color: string, bottom: number): CSSProperties => ({
  position: 'absolute',
  bottom,
  left: '50%',
  width: 0,
  height: 0,
  transform: 'translateX(-50%)',
  borderLeft: `${size}px solid transparent`,
  borderRight: `${size}px solid transparent`,
  borderTop: `${size}px solid ${color}`,
});
/** 내 것의 배율 — 남의 것이 3m 가 아니라 **1.9m** (카메라 거리) 에서 보이는 크기와 맞춘다 */
const BIG = 1.5;
/* 윤곽(테두리색, 한 치수 크게) 위에 속(상자색) — 상자 아랫변에서 각각 9 · 8 px 내려온다 */
const STYLE = {
  normal: { box: box(1), text: text(1), edge: tail(9, EDGE, -10), fill: tail(8, BG, -8) },
  big: { box: box(BIG), text: text(BIG), edge: tail(9 * BIG, EDGE, -10 * BIG), fill: tail(8 * BIG, BG, -8 * BIG) },
} as const;

export function ChatBubble({ text, big = false }: { text: string; big?: boolean }) {
  if (!text) return null;
  const st = big ? STYLE.big : STYLE.normal;
  return (
    <div style={st.box}>
      <span style={st.text}>{text}</span>
      <span aria-hidden style={st.edge} />
      <span aria-hidden style={st.fill} />
    </div>
  );
}

/**
 * 역할 카드 = 「배정 통보」 판 — docs/role-card 의 시안 A.
 *
 * 처음엔 humanish(원본, /Users/yugyeong/Documents/GitHub/humanish)의 RoleCard 를 파일째 옮겨
 * 썼다(2026-09-04 사용자: "예전에 humanish 폴더에서 만든 디자인 그대로 쓰라고"). 그런데 그 카드는
 * 둥근 카드 · 딜 입장 · 사람=청록이고, 카드가 뜨는 화면(interrogation.css)은 /arena 「구역 통신」
 * 판에서 값을 가져와 세운 각진 단말이다. 한 화면에 말투가 둘이었다. 그래서 2026-09-05,
 * **내용은 그대로 두고 겉모습만 그 화면 것으로** 옮겼다 (시안 3종은 docs/role-card/, 그중 A).
 *
 * 바뀐 것은 겉모습뿐이다. 뜨는 시점(ArenaFeature 의 onStart) · 받는 배역(서버의 game_role) ·
 * 몇 초 뒤 스스로 걷히는 성질(SHOW_MS)은 그대로다. 이 판은 관문이 아니라 스쳐 가는 통보다
 * (2026-09-04 사용자: "역할카드도 게임시작 뭐 이런거 아니야. humanish 처럼 몇초보여주고 없어져").
 * 「닫기」는 그 전에 먼저 걷고 싶을 때 쓴다.
 *
 * 배역은 **서버가 준다** (worker/src/game/roles.ts → game_role, 그 소켓에만). 이 판은 받은 배역을
 * 그리기만 한다. 실제 AI(LLM 좌석)에는 소켓이 없어 판이 갈 곳도 없다 — 판을 받는 것은 언제나
 * 실제 플레이어뿐이고, 그 안에서 사람 vs AI 설계자가 갈린다(호출부에서 role !== 'ai' 로 거른다).
 * AI 설계자에게는 AI 의 좌석 번호가 마지막 줄로 같이 온다 — §1.1 "브리핑에서 자기 역할이 공개되는
 * 바로 그 순간, AI 의 좌석 · 정체도 함께 통보받는다".
 */
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import cardStyles from './role-card.module.css';

/** 판이 떠 있는 시간(ms) — 서버의 배역 통보 국면(GAME_BRIEFING_MS = 7초)보다 조금 짧게, 판이 열리기 전에 걷힌다 */
const SHOW_MS = 6000;
/** 닫힘 페이드 시간(ms) — role-card.module.css 의 fadeOut 과 같은 값이어야 한다 */
const FADE_MS = 300;

export type MyRole = 'human' | 'designer';

/**
 * 역할별 화면 문구. 색은 이 화면의 토큰을 쓴다 — 사람은 조명색(--amber), 설계자는 비상등(--signal).
 * 원본의 청록(#6fd3ff)은 쓰지 않는다: 옆에 선 좌석판 · 통신판과 말투가 갈린다.
 * 그림은 검문소 전용이다(/interrogation/) — /intro/role-*.jpg 는 표지와 로비 카드가 같이 쓰고 있어
 * 건드리지 않는다. 인물이 군인인 것은 3인칭 아바타가 군인 몸이기 때문이다.
 */
const ROLE_CARD: Record<MyRole, { name: string; tagline: string; lines: string[]; color: string; art: string; artAlt: string }> = {
  human: {
    name: '사람',
    tagline: '표식 없는 AI가 사람들 틈에 숨어 있다',
    lines: ['대화를 나누며 AI 같은 개체를 찾아내 지목하라.', 'AI가 격리되면 사람 진영이 이긴다.'],
    color: 'var(--amber)',
    art: '/interrogation/role-human.jpg',
    artAlt: '조명 아래 정면으로 선 군인',
  },
  designer: {
    name: 'AI 설계자',
    tagline: '표식을 붙이지 않은 걸 들켜서는 안 된다',
    lines: ['AI의 정체를 시작부터 정확히 안다.', '판당 한 번, 누군가의 기록을 조작할 수 있다.', '들키면 그 자리에서 패배가 확정된다.'],
    color: 'var(--signal)',
    art: '/interrogation/role-designer.jpg',
    artAlt: '비상등이 한쪽을 무는 어두운 통제실의 군인',
  },
};

/** 머리띠의 남은 시간 — 발치의 막대와 같은 것을 센다. 00:06 처럼 자리를 고정해 덜덜 떨지 않게 */
function clock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `00:${String(s).padStart(2, '0')}`;
}

export function RoleBriefing({ role, aiName, onDone }: { role: MyRole; /** 설계자에게만 — AI 의 좌석 이름 */ aiName?: string | null; onDone: () => void }) {
  const [closing, setClosing] = useState(false);
  const [left, setLeft] = useState(SHOW_MS);
  const card = ROLE_CARD[role];
  const lines = aiName ? [...card.lines, `표식 없는 AI는 ${aiName} 이다.`] : card.lines;

  // 먼저 닫힘(closing)을 켜서 페이드가 보이게 하고, 그 페이드가 끝난 뒤에야 실제로 걷는다
  const dismiss = useCallback(() => {
    setClosing(true);
    window.setTimeout(onDone, FADE_MS);
  }, [onDone]);

  useEffect(() => {
    const t = window.setTimeout(dismiss, SHOW_MS);
    return () => window.clearTimeout(t);
  }, [dismiss]);

  // 머리띠의 숫자만 1초마다 센다. 막대는 CSS 가 --show 로 이어서 그린다 — 둘의 출처가 같아 어긋나지 않는다
  useEffect(() => {
    const started = performance.now();
    const id = window.setInterval(() => setLeft(SHOW_MS - (performance.now() - started)), 250);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className={`${cardStyles.backdrop}${closing ? ` ${cardStyles.closing}` : ''}`}
      role="dialog"
      aria-label="배정 통보"
    >
      <div className={cardStyles.panel} style={{ '--rc': card.color, '--show': `${SHOW_MS}ms` } as CSSProperties}>
        <div aria-hidden className={cardStyles.shine} />

        <div className={cardStyles.hd}>
          <span aria-hidden className={cardStyles.live} />
          <span className={cardStyles.ttl}>배정 통보 · ROLE ASSIGNMENT</span>
          <span className={cardStyles.clock}>{clock(left)}</span>
        </div>

        <div className={cardStyles.art}>
          <img src={card.art} alt={card.artAlt} className={cardStyles.artImg} draggable={false} />
          <div aria-hidden className={cardStyles.tone} />
          <div aria-hidden className={cardStyles.fade} />
          <div aria-hidden className={cardStyles.artScan} />
        </div>

        <div className={cardStyles.bd}>
          <p className={cardStyles.kicker}>당신의 배역</p>
          <p className={cardStyles.name}>{card.name}</p>
          <p className={cardStyles.tagline}>{card.tagline}</p>
          <div className={cardStyles.rule} aria-hidden>
            ▪
          </div>
          <ul className={cardStyles.lines}>
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        <div className={cardStyles.ft}>
          <span className={cardStyles.ftx}>{SHOW_MS / 1000}초 뒤 스스로 걷힌다</span>
          <button type="button" onClick={dismiss} className={cardStyles.close}>
            닫기
          </button>
          <span aria-hidden className={cardStyles.prog}>
            <i />
          </span>
        </div>
      </div>
    </div>
  );
}

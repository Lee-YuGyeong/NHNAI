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
 * 「닫기」는 그 전에 먼저 걷고 싶을 때 쓴다. 남은 시간은 **말하지 않는다** — 숫자도 안내 줄도 없이
 * 발치의 가는 막대 하나가 줄어들 뿐이다(2026-09-05 사용자: 「6초 뒤 스스로 걷힌다」·「00:06」 빼 달라).
 * 판을 읽는 데 6초를 세게 만들면, 정작 읽어야 할 배역에서 눈이 떠난다.
 *
 * 배역은 **서버가 준다** (worker/src/game/roles.ts → game_role, 그 소켓에만). 이 판은 받은 배역을
 * 그리기만 한다. 실제 AI(LLM 좌석)에는 소켓이 없어 판이 갈 곳도 없다 — 판을 받는 것은 언제나
 * 실제 플레이어뿐이고, 그 안에서 사람 vs AI 설계자가 갈린다(호출부에서 role !== 'ai' 로 거른다).
 * AI 설계자에게는 AI 의 좌석 번호가 마지막 줄로 같이 온다 — §1.1 "브리핑에서 자기 역할이 공개되는
 * 바로 그 순간, AI 의 좌석 · 정체도 함께 통보받는다".
 */
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { BODIES, type BodyId } from '@/world/mp/bodies';
import cardStyles from './role-card.module.css';

/** 판이 떠 있는 시간(ms) — 서버의 배역 통보 국면(GAME_BRIEFING_MS = 7초)보다 조금 짧게, 판이 열리기 전에 걷힌다 */
const SHOW_MS = 6000;
/** 닫힘 페이드 시간(ms) — role-card.module.css 의 fadeOut 과 같은 값이어야 한다 */
const FADE_MS = 300;

export type MyRole = 'human' | 'designer';

/**
 * 역할별 화면 문구. 색은 이 화면의 토큰을 쓴다 — 사람은 조명색(--amber), 설계자는 비상등(--signal).
 * 원본의 청록(#6fd3ff)은 쓰지 않는다: 옆에 선 좌석판 · 통신판과 말투가 갈린다.
 *
 * 그림은 여기 없다 — 배역이 아니라 **몸**을 따라간다(아래 face). 배역이 달라도 얼굴은 같은 사람이다:
 * 이 판에서 내가 쓰고 있는 그 몸. 갈리는 것은 색과 문장뿐이고, 그게 이 게임의 사실이기도 하다.
 */
const ROLE_CARD: Record<MyRole, { name: string; tagline: string; lines: string[]; color: string }> = {
  human: {
    name: '사람',
    tagline: '표식 없는 AI가 사람들 틈에 숨어 있다',
    lines: ['대화를 나누며 AI 같은 개체를 찾아내 지목하라.', 'AI가 격리되면 사람 진영이 이긴다.'],
    color: 'var(--amber)',
  },
  designer: {
    name: 'AI 설계자',
    tagline: '표식을 붙이지 않은 걸 들켜서는 안 된다',
    lines: ['AI의 정체를 시작부터 정확히 안다.', '들키면 그 자리에서 패배가 확정된다.'],
    color: 'var(--signal)',
  },
};

/**
 * 카드에 뜨는 얼굴 = **이 판에서 내가 쓰는 몸**(mp/bodies.ts 의 군인 넷, 노원상이 물린 Tripo 리깅 GLB).
 * 사진을 따로 두지 않는 이유: 카드가 「지금 이 판의 나」를 가리켜야 하기 때문이다. 스톡 인물을 쓰면
 * 카드 속 사람과 내가 홀에서 보는 내 몸이 다른 사람이 된다.
 * 그림은 그 GLB 를 그대로 찍은 것이다 — tools/soldier-portrait.html (정면 직교 · 앰버 다운라이트 · 3:4).
 * 몸을 아직 못 받은 찰나(좌석 배정 전)에만 이 하나로 대신한다.
 */
const FALLBACK_BODY: BodyId = 'sol_fit_m';

export function RoleBriefing({ role, body, aiName, onDone }: {
  role: MyRole;
  /** 이 판에서 내가 쓰는 몸 — 카드의 얼굴이 된다. 아직 못 받았으면 null */
  body?: BodyId | null;
  /** 설계자에게만 — AI 의 좌석 이름 */
  aiName?: string | null;
  onDone: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const card = ROLE_CARD[role];
  const face = body ?? FALLBACK_BODY;
  // 설계자에게만 붙는 마지막 줄 — 지시문과 급이 다른 정보라 클래스(reveal)도 따로 받는다
  const reveal = aiName ? `표식 없는 AI는 ${aiName} 이다.` : null;

  // 먼저 닫힘(closing)을 켜서 페이드가 보이게 하고, 그 페이드가 끝난 뒤에야 실제로 걷는다
  const dismiss = useCallback(() => {
    setClosing(true);
    window.setTimeout(onDone, FADE_MS);
  }, [onDone]);

  useEffect(() => {
    const t = window.setTimeout(dismiss, SHOW_MS);
    return () => window.clearTimeout(t);
  }, [dismiss]);

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
        </div>

        <div className={cardStyles.art}>
          <img
            src={`/interrogation/body-${face}.jpg`}
            alt={`이 판에서 내가 쓰는 몸 — ${BODIES[face].name}`}
            className={cardStyles.artImg}
            draggable={false}
          />
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
            {card.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
            {reveal && <li className={cardStyles.reveal}>{reveal}</li>}
          </ul>
        </div>

        <div className={cardStyles.ft}>
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

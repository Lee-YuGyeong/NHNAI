/**
 * 역할 카드 — humanish(원본, /Users/yugyeong/Documents/GitHub/humanish)의 app/world/game-hud.tsx
 * 의 RoleCard 를 그대로 옮긴 것이다(2026-09-04 사용자: "intro 가 아니라 예전에 humanish
 * 폴더에서 만든 디자인 그대로 쓰라고"). /intro 의 배역 소개 카드(RoleCard, features/lobby/Intro.tsx)
 * 는 이것과 다른 컴포넌트다 — 더는 쓰지 않는다.
 *
 * 원본 구조를 그대로 따른다: 딜(입장) 애니메이션 → 액자선 · 광택 → kicker("Secret Role") →
 * 인물 그림 → 상징(가면/눈) → 이름 · 태그라인 → ◆ 구분선 → 문장 줄들 → 확인 버튼.
 * 겉모습(role-card.module.css)은 파일까지 그대로고, 내용(ROLE_CARD)만 이 게임의 두 배역
 * (사람·AI 설계자, PLANNING §1.1)에 맞춰 바꿨다 — 원본에 AI 역할 카드가 없는 것과 같은
 * 이유로(원본 머리말: "AI 좌석엔 소켓이 없어 카드가 갈 곳이 없다") 여기도 실제 AI(LLM 좌석)에는
 * 카드가 없다. 카드를 받는 것은 항상 "실제 플레이어"뿐이고, 그 안에서 사람 vs AI 설계자가 갈린다.
 *
 * 뜨는 시점은 원본과 같다 — 원본은 게이트가 열리는 순간(dealEarlyRoles) 딜되어 들어온다.
 * ArenaFeature 의 onStart(판이 실제로 열리는 순간, 이제는 autoStart 뿐이니 곧 마운트 직후)가
 * 그 신호다. 걷히는 방식은 원본과 다르게 잡았다 — 원본은 「확인」을 눌러야 닫히지만, 여기서는
 * **몇 초 보여주고 스스로 닫힌다**(2026-09-04 사용자: "역할카드도 게임시작 뭐 이런거 아니야.
 * humanish 처럼 몇초보여주고 없어져") — 카드가 판을 여는 관문이 아니라 스치는 알림이어야
 * 한다는 뜻이라, SHOW_MS 뒤 자동으로 닫는다. 「확인」 버튼은 그 전에 먼저 닫고 싶을 때 쓴다.
 *
 * 배역 배정은 아직 서버 자리가 없다 — worker/src/trial 에 진짜 다인원 로스터와 정체표가 붙기
 * 전까지는 이 화면이 PLANNING §1.1 의 표(실제 플레이어 수 → AI 설계자 상한)를 그대로
 * 클라이언트에서 굴려 채운다. TRIAL_PARTY(이 방의 시행 참가 인원, lab/personas)를 "실제
 * 플레이어 수" 자리에 대신 넣는다 — 진짜 배정이 붙으면 rollMyRole 을 그 응답으로 바꿔치면 된다.
 */
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { TRIAL_PARTY } from '@/lab/personas';
import cardStyles from './role-card.module.css';

/** 카드가 떠 있는 시간(ms) — 두세 줄 문장을 읽기엔 넉넉하고, 판을 막아 서지는 않을 만큼 */
const SHOW_MS = 4500;
/** 닫힘 페이드 시간(ms) — role-card.module.css 의 fadeOut 과 같은 값이어야 한다 */
const FADE_MS = 300;

type MyRole = 'human' | 'designer';

/**
 * 역할별 화면 문구 — 원본 ROLE_CARD 와 같은 모양(name·tagline·lines·color·art·artAlt)이다.
 * lines 는 문장마다 한 줄씩 그린다(원본 규칙 그대로).
 */
const ROLE_CARD: Record<MyRole, { name: string; tagline: string; lines: string[]; color: string; art: string; artAlt: string }> = {
  human: {
    name: '사람',
    tagline: '표식 없는 AI가 사람들 틈에 숨어 있다',
    lines: ['대화를 나누며 AI 같은 개체를 찾아내 지목하라.', 'AI가 격리되면 사람 진영이 이긴다.'],
    color: '#6fd3ff',
    art: '/intro/role-human.jpg',
    artAlt: '검은 후드를 쓰고 손을 든 사람',
  },
  designer: {
    name: 'AI 설계자',
    tagline: '표식을 붙이지 않은 걸 들켜서는 안 되는 조력자',
    lines: ['AI의 정체를 시작부터 정확히 안다.', '판당 한 번, 누군가의 기록을 조작할 수 있다.', '들키면 그 자리에서 패배가 확정된다.'],
    color: '#ffca8e',
    art: '/intro/role-designer.jpg',
    artAlt: '어둠 속에서 단말을 조작하는 손',
  },
};

/** AI 설계자 상한 — PLANNING §1.1 표 그대로 (3명→0 · 4~5명→1 · 6~8명→2) */
function designerCap(partySize: number): number {
  if (partySize <= 3) return 0;
  if (partySize <= 5) return 1;
  return 2;
}

/**
 * 이 판의 내 배역을 굴린다 — §1.1: 상한 안에서 설계자 수를 0부터 균등 랜덤으로 뽑고,
 * 그 수만큼의 자리가 파티 인원 중 무작위로 설계자가 된다("인원을 알아도 실제 설계자 수는
 * 알 수 없다"). 내가 그 자리에 들 확률은 뽑힌 설계자 수를 파티 인원으로 나눈 값이다.
 */
function rollMyRole(partySize: number): MyRole {
  const cap = designerCap(partySize);
  const designerCount = Math.floor(Math.random() * (cap + 1));
  return Math.random() < designerCount / partySize ? 'designer' : 'human';
}

/** AI 설계자 — 가면. 카드 문장(정체를 숨기고 조력한다)의 그림 버전이다 (원본 MaskIcon 그대로) */
function MaskIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 6.5C6 5.3 9 4.8 12 4.8s6 .5 9 1.7c0 5.5-2.6 10.7-6.7 10.7-1.5 0-2.3-.9-2.3-.9s-.8.9-2.3.9C5.6 17.2 3 12 3 6.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <ellipse cx="8.6" cy="10" rx="1.5" ry="1.1" fill="currentColor" />
      <ellipse cx="15.4" cy="10" rx="1.5" ry="1.1" fill="currentColor" />
    </svg>
  );
}

/** 사람 — 감시하는 눈. 찾아내는 쪽의 그림이다 (원본 EyeIcon 그대로) */
function EyeIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2.5 12S6 6.2 12 6.2 21.5 12 21.5 12 18 17.8 12 17.8 2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function RoleBriefing({ onDone }: { onDone: () => void }) {
  // 마운트 시 한 번만 굴린다 — 다시 렌더될 때마다 배역이 바뀌면 브리핑이 아니라 뽑기가 된다
  const [myRole] = useState<MyRole>(() => rollMyRole(TRIAL_PARTY));
  const [closing, setClosing] = useState(false);
  const card = ROLE_CARD[myRole];

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
      aria-label="역할 카드"
    >
      <div className={cardStyles.deal}>
        <div className={cardStyles.card} style={{ '--rc': card.color } as CSSProperties}>
          <div aria-hidden className={cardStyles.frame} />
          <div aria-hidden className={cardStyles.shine} />

          <p className={cardStyles.kicker}>Secret Role — 당신의 역할</p>

          <div className={cardStyles.art}>
            <img src={card.art} alt={card.artAlt} className={cardStyles.artImg} draggable={false} />
            <div aria-hidden className={cardStyles.artFade} />
          </div>

          <div className={cardStyles.emblem} aria-hidden>
            {myRole === 'designer' ? <MaskIcon /> : <EyeIcon />}
          </div>
          <p className={cardStyles.name}>{card.name}</p>
          <p className={cardStyles.tagline}>{card.tagline}</p>
          <div className={cardStyles.rule} aria-hidden>
            ◆
          </div>
          <div className={cardStyles.lines}>
            {card.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          <button type="button" onClick={dismiss} className={cardStyles.confirm}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 표지 (/intro 첫 화면) — 그려진 복도 한 장 위에 글을 앉힌다.
 *
 * 여섯 벌을 나란히 두고 골랐다(58ddd2b) — 2026-09-03, ?hero=g 로 시험해 보고 이 벌로
 * 정했다. 나머지 다섯(지금·극장·송출·단말·정렬·문)은 이 파일에 없다 — 그 커밋에 있다:
 * `git show 58ddd2b:src/features/lobby/heroes.tsx`.
 *
 * 이 벌만 **그려진 그림**(/intro/corridor.jpg)을 쓴다 — 남의 사진을 빌리지 않는다.
 * 똑같이 생긴 칸이 소실점까지 늘어서고 그 중 하나만 따뜻하다: 이 게임이 무슨 게임인지
 * 한 장으로 말하는 그림이다.
 *
 * ★ 사진에 lobby.css 의 .bl-hero__art 를 안 쓴다. 저쪽은 luminosity + brightness(0.82) 로
 *   사진을 파랗게 담그는데, 그러면 이 그림에서 유일하게 중요한 **주황이 통째로 죽는다.**
 *   클래스(hero-key__art)를 따로 둔 이유가 그것뿐이다.
 * ★ 소실점의 문은 한 겹 눌러 둔다(hero-key__far). 제목이 앉는 자리가 바로 그 앞이라
 *   그대로 두면 흰 글자와 빛이 서로 싸운다.
 * ★ 개체 수는 한 줄도 안 적는다 — 그림 속 칸도 셀 수 없게 멀어진다 (Intro.tsx 머리말의 규칙).
 */
import { LEADER_NAME } from '@/lab/personas';
import { ArrowIcon } from './console';
import { Typed } from './live';
import './heroes.css';

export interface HeroProps {
  /** 제목이 다 찍혔나 — 아래 것들이 차례로 올라오는 신호 (heroes.css 의 .hero-late) */
  titled: boolean;
  onTitled: () => void;
  /** 입장하기 — 구글을 거쳐 /lobby */
  enter: () => void;
  /** 로그인 없이 들어가기 — 이 길은 빠지면 안 된다 (shared/guest.ts 의 약속) */
  guest: () => void;
  /** 규칙 보기 */
  rules: () => void;
  /** 아래 칸(브리핑)으로 */
  next: () => void;
}

/* ── 글 ────────────────────────────────────────────────────────────────
 *
 * ┌─ 어투 (2026-08-30 사용자: "AI 티 안 나고 게임같은 어투") ────────────────┐
 * │ 여기 이렇게 적혀 있었다:                                                  │
 * │   「이 구역의 대부분은 AI다 / 그 사이에 숨을 쉬는 누군가가 섞여 있다 /     │
 * │     그게 당신이다. 들키지 않으면 이긴다.」                                │
 * │ 틀린 말은 없는데 **게임의 말이 아니었다.** 이유는 넷이다:                 │
 * │   1. 설명하고 있다. 세 줄이 전부 상황 요약이다 — 세계는 요약하지 않는다.  │
 * │   2. '당신'이 나온다. 2인칭으로 부르는 건 광고 카피의 말투다.             │
 * │      이 구역은 나를 사람으로 부르지 않는다 — 개체이거나 번호다.           │
 * │   3. 세 줄 대구 + 마지막 한 방. 이 균일한 삼단 리듬이 제일 큰 티다.       │
 * │   4. 승리 조건을 카피에 적었다. 그건 규칙 자리에 적을 말이다.             │
 * │                                                                          │
 * │ 그래서 화자를 바꿨다. 여기 있는 글은 **구역이 내보내는 방송**이다 —       │
 * │ 플레이어에게 하는 말이 아니라 플레이어가 엿듣는 말. 두 줄뿐이고 둘째      │
 * │ 줄이 첫 줄을 뒤집는다. 설명이 사라진 자리에 위협이 남는다.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const TAG = 'SOCIAL DEDUCTION  //  EP.01';
const SUB = 'WHO IS HUMAN? ONE OF US IS STILL BREATHING.';
const LINE_1 = '이 구역에 인간은 없다.';
const LINE_2 = '없어야 한다.';
const FROM = `구역 관리자 ${LEADER_NAME} · 상시 송출`;

/**
 * 제목.
 *
 * ★ 표지도 찍힌다 — 다만 **본문 제목보다 느리게** (2026-08-30 사용자 물음:
 *   "이것도 넣으면 이상한가?"). 여덟 자뿐이라 본문 속도(42ms)로 치면 0.3초에
 *   끝나서 찍히는 줄도 모르고 지나간다. 제목은 문장이 아니라 한 장면이라
 *   또박또박 와야 하고, 앰버 한 점(인간)이 찍히는 순간이 이 화면의 심장이다.
 */
function Title({ onDone, className = '' }: { onDone: () => void; className?: string }) {
  return (
    <h1 className={`bl-hero__title ${className}`}>
      <Typed ms={85} parts={['누가 ', { em: '인간' }, '인가?']} onDone={onDone} />
    </h1>
  );
}

function Cta({ enter, rules, className = '' }: { enter: () => void; rules: () => void; className?: string }) {
  return (
    <div className={`bl-hero__cta ${className}`}>
      <button type="button" className="bl-btn bl-btn--go bl-edge" data-sfx="clank" onClick={enter}>
        입장하기 <ArrowIcon />
      </button>
      <button type="button" className="bl-btn bl-edge" onClick={rules}>
        규칙 보기
      </button>
    </div>
  );
}

/**
 * 로그인 없이 노는 길.
 *
 * ★ 「NO SIGN-UP」 이라고 적혀 있던 자리다. 「입장하기」가 구글로 떠나게 된
 *   순간(2026-08-31) 그 말은 사실이 아니다 — 첫 화면이 거짓말을 하면 그 뒤
 *   화면을 전부 의심하게 된다.
 * ★ 그래서 글자를 고치는 데서 그치지 않고 **문으로 만들었다.** 로그인 없이
 *   노는 길은 이 게임의 약속이라(shared/guest.ts) 어딘가에 반드시 있어야 한다.
 */
function Guest({ guest, className = '' }: { guest: () => void; className?: string }) {
  return (
    <button type="button" className={`bl-label hero-guest ${className}`} data-sfx="clank" onClick={guest}>
      로그인 없이 들어가기
    </button>
  );
}

/** 아래에 더 있다는 표시 — 한 번에 한 칸이라 이게 없으면 여기서 끝인 줄 안다 */
function Cue({ next, className = '' }: { next: () => void; className?: string }) {
  return (
    <button type="button" className={`bl-scrollcue ${className}`} onClick={next}>
      <span className="bl-label">SCROLL</span>
      <span className="bl-scrollcue__line" aria-hidden />
    </button>
  );
}

/* ══════════════════════ 복도 ══════════════════════════════════════════════
   그려진 복도 한 장 위에 글을 앉힌다. 배경이 밝고 복잡해서, 여기서 할 일의 절반은
   「무엇을 더할까」가 아니라 「글이 앉을 어둠을 어디에 깔까」다.
   ════════════════════════════════════════════════════════════════════════ */

export function HeroKey({ titled, onTitled, enter, guest, rules, next }: HeroProps) {
  return (
    <>
      <span className="hero-key__art" aria-hidden>
        <img src="/intro/corridor.jpg" alt="" />
      </span>
      <span className="hero-key__far" aria-hidden />
      <span className="hero-key__glow" aria-hidden />
      <span className="hero-key__scrim" aria-hidden />
      <span className="hero-key__grain" aria-hidden />
      {/* 라벨은 화면 맨 위 — 글 뭉치 안에 있으면 대문짝 제목의 힘을 깎는다 */}
      <span className="bl-label hero-key__tag">{TAG}</span>
      <div className={`hero-key__body bl-snap__in${titled ? ' hero-on' : ''}`}>
        <p className="bl-hero__sub hero-key__sub">{SUB}</p>
        <Title onDone={onTitled} className="hero-key__title" />
        <p className="hero-key__lines hero-late">
          {LINE_1} <em>{LINE_2}</em>
        </p>
        <p className="bl-hero__from hero-late">{FROM}</p>
        <Cta className="hero-late" enter={enter} rules={rules} />
        <Guest className="hero-late" guest={guest} />
      </div>
      <Cue next={next} />
    </>
  );
}

/**
 * 파란 콘솔의 부품들 — 두 화면(로비·대기방)이 같이 쓴다.
 *
 * 생김새의 원본은 **리더가 말할 때 뜨는 대화 상자**다 (features/world/DialogueBox 의 Frame).
 * 거기서 온 것: 모따기한 남색 판, 청록 1px 테와 번짐, 왼쪽 위에 얹히는 이름 탭,
 * 오른쪽 위 표시등 넷. 색·수치는 lobby.css 한 곳에 있다 — 여기서는 구조만 짠다.
 */

import type { ReactNode } from 'react';
import './lobby.css';

/* ══════════════════════════════════ 바탕 ══════════════════════════════════ */

/**
 * 화면 뒤 세 겹 (원작 humanish 의 .backdrop · .noise · .scanlines).
 * App.tsx 가 깔아 둔 창고 라운지는 지우지 않는다 — 그 위에 파랗게 덮어 콘솔 안으로 끌고 온다.
 */
export function Backdrop() {
  return <div className="bl-bg" aria-hidden />;
}

/* ══════════════════════════════════ 판 ══════════════════════════════════ */

/**
 * 판 하나. 이름표는 테 **밖**에 산다 — clip-path 가 자식을 자르기 때문이다 (lobby.css 머리말).
 *
 * @param mock 뒷받침할 데이터가 아직 없는 판인가. 이름표 옆에 「목업」이 붙는다.
 *             이 프로젝트에는 프로필·전적 API 가 없어서, 원작에서 진짜였던 판이 여기서는 그림뿐이다.
 *             감추지 않고 화면이 스스로 실토하게 둔다 (features/main/MainFeature 의 목업 표기와 같은 규칙).
 */
export function Panel({
  title,
  mock,
  className,
  children,
}: {
  title?: string;
  mock?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`bl-card${className ? ` ${className}` : ''}`}>
      {title ? (
        <span className="bl-card__tab">
          {title}
          {mock ? <span className="bl-card__mock">목업</span> : null}
        </span>
      ) : null}
      <div className="bl-frame bl-edge">
        <div className="bl-frame__in">
          <span className="bl-deco" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
          {children}
        </div>
      </div>
    </section>
  );
}

/**
 * 리더의 한 줄 — 이 화면들의 주인공이다.
 *
 * 로비에도 대기방에도 리더가 있다는 것을 **말풍선 하나로** 말한다. 소리는 내지 않는다:
 * 방송 장치를 켜는 경로는 features/tts/scope.ts 가 따로 정하고, 여기는 그 목록 밖이다.
 * 글자만으로도 "누가 지시하고 있다"는 자리는 선다.
 */
export function LeaderLine({ who = 'LEADER', children }: { who?: string; children: ReactNode }) {
  return (
    <div className="bl-lead" role="status">
      <p className="bl-lead__box bl-edge">
        <span className="bl-lead__led" aria-hidden />
        <span className="bl-lead__who">{who}</span>
        {children}
      </p>
      <span className="bl-lead__tail" aria-hidden />
    </div>
  );
}

/* ═══════════════════════════════ 좌석 그림 ═══════════════════════════════ */

/**
 * 좌석 카드의 그림 — **발급되다 만 신분증 한 장.** 사진칸에는 실루엣만, 분류란은 끝까지 `?`.
 * 대기방이 실제로 그 상태다: 사람만 앉아 있고 아직 아무 역할도 배정되지 않았다.
 *
 * ★ **세 칸이 전부 같은 그림이다** (원작 room-lobby.tsx 의 I1 규칙을 그대로 지킨다).
 *   자리마다 다른 인물·색·번호를 넣는 순간 그게 지목의 근거가 된다. 여기서 갈리는 것은
 *   이미 공개된 값 둘뿐이다 — 비었나(empty), 준비했나(ready). 인자를 더할 때는
 *   "이걸로 누가 기계인지 골라낼 수 있나"를 먼저 묻는다.
 */
export function SeatArt() {
  return (
    <svg className="bl-seat__art" viewBox="0 0 120 160" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="blSeatFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d2438" />
          <stop offset="1" stopColor="#040f1b" />
        </linearGradient>
      </defs>
      <rect width="120" height="160" fill="url(#blSeatFill)" />
      {/* 사진칸 — 대화 상자의 초상 창(.dlg__portrait)과 같은 둥근 사각 */}
      <rect x="26" y="18" width="68" height="74" rx="8" fill="#08182a" stroke="#6fd3ff" strokeOpacity="0.45" />
      {/* 실루엣 — 머리와 어깨. 누구인지는 알 수 없다 */}
      <circle cx="60" cy="46" r="14" fill="#6fd3ff" fillOpacity="0.22" />
      <path d="M36 92c0-14 11-24 24-24s24 10 24 24z" fill="#6fd3ff" fillOpacity="0.18" />
      {/* 가려진 항목 셋 — 이름·분류·번호가 들어갈 자리 */}
      <rect x="26" y="102" width="52" height="4" fill="#6fd3ff" fillOpacity="0.3" />
      <rect x="26" y="112" width="34" height="4" fill="#6fd3ff" fillOpacity="0.2" />
      <rect x="26" y="122" width="44" height="4" fill="#6fd3ff" fillOpacity="0.14" />
      {/* 분류란 — 끝까지 물음표다 */}
      <text x="88" y="124" fill="#6fd3ff" fillOpacity="0.5" fontSize="22" fontFamily="monospace">
        ?
      </text>
      {/* 오른쪽 위 눈금 — 대화 상자 프레임의 그것 */}
      {[0, 1, 2].map((i) => (
        <rect key={i} x={96} y={22 + i * 6} width={10 - i * 3} height={2} fill="#6fd3ff" fillOpacity={0.5 - i * 0.14} />
      ))}
    </svg>
  );
}

/* ═══════════════════════════════ 아이콘 ═══════════════════════════════ */
/* 원작과 같은 규칙 — CDN 아이콘 대신 인라인 SVG. 배포본에서 외부 요청이 나가지 않는다 */

export function SearchIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <circle cx="5" cy="5" r="3.6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7.8 7.8L11 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
      <path d="M5 0v10M0 5h10" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** 다시 읽기 — 목록을 손으로 새로 받는 자리 (LobbyFeature 의 새로고침) */
export function RefreshIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M10.2 6a4.2 4.2 0 11-1.3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M10.4 0.9v2.6H7.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg width="10" height="11" viewBox="0 0 10 11" fill="none" aria-hidden>
      <rect x="0.6" y="4.6" width="8.8" height="6" stroke="currentColor" strokeWidth="1.1" />
      <path d="M2.6 4.5V3a2.4 2.4 0 014.8 0v1.5" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

export function ArrowIcon() {
  return (
    <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden>
      <path d="M0 4.5h9.5M6.5 1l3.2 3.5L6.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowLeftIcon() {
  return (
    <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden>
      <path d="M11 4.5H1.5M4.5 1L1.3 4.5 4.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** 방장 표시. 원작과 같이 **왕관 하나로만** 말한다 — 「host」 태그는 이름만큼 눈에 띄었다 */
export function CrownIcon() {
  return (
    <svg width="14" height="11" viewBox="0 0 15 12" fill="none" aria-hidden>
      <path d="M1 10.5V3l3.4 2.6L7.5 1l3.1 4.6L14 3v7.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg width="9" height="10" viewBox="0 0 9 10" aria-hidden>
      <path d="M0 0l9 5-9 5z" fill="currentColor" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden>
      <path d="M1 4.6L4 7.6 10 1.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ExitIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M7 1H1v10h6M5 6h6M8.5 3.5L11 6l-2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <rect x="0.6" y="0.6" width="7" height="7" stroke="currentColor" strokeWidth="1.1" />
      <path d="M4 10.4h6.4a1 1 0 001-1V3.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

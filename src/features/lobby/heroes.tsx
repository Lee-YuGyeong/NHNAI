/**
 * 표식 (/intro 첫 화면) — 그려진 복도 한 장 위에 글을 앉힌다.
 *
 * 여섯 벌을 나란히 두고 골랐다(58ddd2b) — 2026-09-03, ?hero=g 로 시험해 보고 이 벌로
 * 정했다. 나머지 다섯(지금·극장·송출·단말·정렬·문)은 이 파일에 없다 — 그 커밋에 있다:
 * `git show 58ddd2b:src/features/lobby/heroes.tsx`.
 *
 * 이 벌은 원래 **그려진 복도 그림**(/intro/corridor.jpg) 위에 글을 앉혔다 — 똑같이 생긴 칸이
 * 소실점까지 늘어서고 그 중 하나만 따뜻한, 이 게임이 무슨 게임인지 한 장으로 말하는 그림.
 * 2026-09-05 에 배경 영상(who_is_AI)이 들어오면서 그림은 **영상이 오기 전의 자리**가 됐고,
 * 그러자 두 장면이 안 이어졌다 (사용자: "영상 나오기 전에 외부 이상한 이미지가 나오는데").
 * 그래서 그림을 **영상의 첫 장면**(INTRO_VIDEO_START_SEC 초의 프레임, /intro/who_is_ai-22s.jpg)
 * 으로 바꿨다 — 영상이 오기 전엔 그 장면이 서 있고, 오면 같은 자리에서 움직이기 시작한다.
 * 영상이 안 도는 판(주소 없음 · 실패 · 모션 줄임)에서도 같은 장면이 표지다.
 * corridor.jpg 는 public 에 그대로 있다 — 영상을 걷어내면 다시 그 그림이다.
 *
 * ★ 사진에 lobby.css 의 .bl-hero__art 를 안 쓴다. 저쪽은 luminosity + brightness(0.82) 로
 *   사진을 파랗게 담그는데, 그러면 이 그림에서 유일하게 중요한 **주황이 통째로 죽는다.**
 *   클래스(hero-key__art)를 따로 둔 이유가 그것뿐이다.
 * ★ 소실점의 문은 한 겹 눌러 둔다(hero-key__far). 제목이 앉는 자리가 바로 그 앞이라
 *   그대로 두면 흰 글자와 빛이 서로 싸운다.
 * ★ 개체 수는 한 줄도 안 적는다 — 그림 속 칸도 셀 수 없게 멀어진다 (Intro.tsx 머리말의 규칙).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { LEADER_NAME } from '@/lab/personas';
import { WHO_IS_AI_SRC } from '@/shared/opening';
import { EnterButton } from './console';
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
 *
 * ┌─ 진영이 뒤집혔다 (2026-09-04, PLANNING.md 개정) ──────────────────────────┐
 * │ 옛 기획은 "AI 구역에 숨어든 인간"을 찾았다 — 방송은 "이 구역에 인간은      │
 * │ 없다 / 없어야 한다"였다. 새 기획(§서두)은 반대다: 표식 없는 AI가 인간      │
 * │ 사회로 새어 나왔다. 찾는 것은 숨은 인간이 아니라 **숨은 AI**다.            │
 * │                                                                          │
 * │ 방송의 장치(단정 → 둘째 줄이 뒤집는다)는 그대로 두고 대상만 바꿨다 —       │
 * │ 이 게임의 중심 장치가 "표식"이므로 그 낱말을 그대로 쓴다.                  │
 * │ FROM 도 바꿨다: 옛 기획의 "리더"는 판정하고 폐기하는 존재였지만,           │
 * │ 새 기획의 관리 AI는 판정하지 않는다(PLANNING P1·P5) — 기록만 방송한다.     │
 * │ 그래서 직함을 "구역 관리자"에서 "관리 AI"로 바꾼다. 가리키는 개체(번호     │
 * │ 표 LEADER_NAME)는 그대로다 — 방 안에서 방송하는 것과 같은 목소리다.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const TAG = 'SOCIAL DEDUCTION  //  EP.01';
const SUB = 'WHO IS HUMAN? ONE OF US NEVER WAS.';
const LINE_1 = '여기, 전부 표식이 붙어 있다.';
const LINE_2 = '붙어 있어야 한다.';
const FROM = `관리 AI ${LEADER_NAME} · 상시 송출`;

/**
 * 제목.
 *
 * ★ 표식도 찍힌다 — 다만 **본문 제목보다 느리게** (2026-08-30 사용자 물음:
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
      {/* 표지의 문은 **작은 벌**이다 — 「규칙 보기」와 나란히 서는 자리라, 큰 벌을 놓으면 옆칸이 부속으로 보인다 */}
      <EnterButton onClick={enter} />
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

/*
 * ── 표지 배경 영상 (2026-09-04 사용자: "위쪽에는 영상 넣을 수 있게 · cloudflare 에 올려서 받아온다") ──
 *
 * 영상을 올린 뒤 아래 상수에 주소를 적으면 켜진다 — R2 공개 버킷의 mp4/webm URL 이든,
 * Cloudflare Stream 의 「MP4 다운로드」 URL 이든 <video> 가 먹는 주소면 된다.
 * (Stream 의 기본 HLS(.m3u8) 주소는 사파리 밖에서 안 돈다 — Stream 을 쓰면 MP4 쪽을 적는다.)
 *
 * ★ 비워 두면 복도 그림만 선다. 영상이 죽어도(404 · 코덱) 그림으로 내려앉는다 —
 *   첫 화면은 어떤 경우에도 성립해야 한다.
 * ★ 모션을 꺼 둔 사람에게는 틀지 않는다 (RoleSlides · Typed 와 같은 규칙).
 * ★ 소리는 없다(muted) — 자동재생의 조건이기도 하고, 이 화면의 소리 규칙
 *   (소리가 하는 일은 누른 것에 대답하는 것뿐, Intro.tsx)이기도 하다.
 * ★ INTRO_VIDEO_START_SEC 초부터 튼다 (2026-09-05 사용자: "22초부터 시작"). 끝나면 다시 거기로 —
 *   loop 속성은 0초로 되감기 때문에 안 쓰고 ended 에서 직접 되감는다.
 *
 * ┌─ 시작점은 **두 길**로 놓는다 — loadedmetadata 와 마운트 직후 (2026-09-05 사용자: "22초 … 다시 돌아왔는데") ┐
 * │ 처음 오는 브라우저는 파일을 받아 오는 데 몇백 ms 가 걸려 loadedmetadata 가 React 가 <video> 를     │
 * │ 문서에 붙인 **뒤**에 오고, 그때는 onLoadedMetadata 가 22초로 놓는다. 그런데 같은 파일을 한 번 받아  │
 * │ 둔 브라우저(로비 오프닝이 같은 파일이라 이제 흔하다)는 metadata 가 **수십 ms** 만에 오는데, React 는  │
 * │ 요소를 만들어 src 를 걸고(렌더) 문서에 붙이기(커밋)까지 사이에 브라우저에 자리를 내준다. 그 틈에   │
 * │ 온 이벤트는 React 가 「아직 안 붙은 요소」의 것으로 보고 **버린다** — 핸들러가 한 번도 안 불리고     │
 * │ 영상은 0초부터 돈다. 헤드리스 크롬에서 두 번째 로드마다 재현됐다.                                   │
 * │ 그래서 커밋 직후(useEffect)에 **이미 길이를 알고 있으면 그 자리에서 놓는다.** 그 뒤에 오는 metadata │
 * │ 는 붙은 요소의 것이라 정상으로 핸들러에 온다. 두 길 중 어느 쪽이든 먼저 닿는 쪽이 놓고, 늦은 쪽은   │
 * │ currentTime < startSec 검사에서 손대지 않는다.                                                       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 * ★ poster 는 **그 초의 프레임**(INTRO_VIDEO_POSTER)이다. 파일이 260MB 라 첫 장면까지 몇 초가 비는데,
 *   그동안 <video> 는 투명이라 밑의 그림이 보인다. 밑의 그림도 같은 프레임이라(HeroKey) 영상이
 *   시작되는 순간 화면이 바뀌지 않는다. 시작점을 옮기면 **프레임도 다시 딴다**:
 *     ffmpeg -ss 22 -i <who_is_AI.faststart.mp4 주소> -frames:v 1 -vf scale=1920:-2 -q:v 3 public/intro/who_is_ai-22s.jpg
 *
 * ★ 주소는 shared/opening.ts 의 WHO_IS_AI_SRC 다 — 로비 오프닝(처음 접속한 사람에게 한 번)과
 *   **같은 파일**을 본다 (2026-09-05 사용자). faststart 여야 하는 사정도 거기 적혀 있다.
 */
export const INTRO_VIDEO_SRC = WHO_IS_AI_SRC;
/** 이 초부터 튼다 — 앞 22초는 건너뛴다 (2026-09-05 사용자: 20 → 22) */
export const INTRO_VIDEO_START_SEC = 22;
/** INTRO_VIDEO_START_SEC 초의 프레임 — 영상이 오기 전에 서 있는 장면. 시작점을 옮기면 같이 다시 딴다 (위 ffmpeg 한 줄) */
export const INTRO_VIDEO_POSTER = '/intro/who_is_ai-22s.jpg';

export function HeroVideo({
  src = INTRO_VIDEO_SRC,
  startSec = INTRO_VIDEO_START_SEC,
  poster = INTRO_VIDEO_POSTER,
}: {
  src?: string;
  startSec?: number;
  poster?: string;
}) {
  /** 로드가 죽었다 — 이 판에서는 다시 시도하지 않고 그림으로 내려앉는다 */
  const [dead, setDead] = useState(false);
  const ref = useRef<HTMLVideoElement | null>(null);
  /** 시작점으로 놓고 튼다 — 길이를 받아 온 순간 · 끝난 순간(되감기) · 마운트 직후(아래) */
  const place = useCallback(
    (v: HTMLVideoElement) => {
      if (v.currentTime < startSec || v.ended) v.currentTime = startSec;
      try {
        void v.play()?.catch(() => {});
      } catch {
        /* jsdom 이거나 이 판에서는 안 돈다 — 그림이 그대로 표지다 */
      }
    },
    [startSec],
  );
  const restart = useCallback((e: { currentTarget: HTMLVideoElement }) => place(e.currentTarget), [place]);
  /*
   * 커밋 직후 — metadata 가 커밋보다 먼저 왔으면(캐시가 따뜻한 두 번째 로드) 그 이벤트는 React 가 버렸다.
   * readyState ≥ 1(HAVE_METADATA)이면 길이를 이미 아는 것이니 여기서 놓는다. 아직 0 이면 뒤에 올
   * loadedmetadata 가 붙은 요소의 것이라 restart 로 정상히 온다 (파일 머리말의 「두 길」).
   */
  useEffect(() => {
    const v = ref.current;
    if (v && v.readyState >= 1) place(v);
  }, [place]);
  // jsdom 에는 matchMedia 가 없다 — 없으면 움직이는 쪽으로 둔다 (Typed 와 같은 규칙)
  const still =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!src || dead || still) return null;
  return (
    <video
      ref={ref}
      className="hero-key__video"
      src={src}
      poster={poster}
      autoPlay
      muted
      playsInline
      preload="auto"
      aria-hidden
      onLoadedMetadata={restart}
      onEnded={restart}
      onError={() => setDead(true)}
    />
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
   영상의 첫 장면 한 장 위에 글을 앉히고, 영상이 오면 그 자리에서 움직인다. 배경이 밝고
   복잡해서, 여기서 할 일의 절반은 「무엇을 더할까」가 아니라 「글이 앉을 어둠을 어디에 깔까」다.
   ════════════════════════════════════════════════════════════════════════ */

export function HeroKey({ titled, onTitled, enter, guest, rules, next }: HeroProps) {
  return (
    <>
      <span className="hero-key__art" aria-hidden>
        {/* 영상과 같은 장면 — 영상이 오기 전·안 도는 판의 표지. 이게 다른 그림이면 영상이 켜지는 순간 화면이 튄다 */}
        <img src={INTRO_VIDEO_POSTER} alt="" />
        <HeroVideo />
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

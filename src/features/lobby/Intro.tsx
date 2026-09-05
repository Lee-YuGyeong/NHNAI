/**
 * 인트로 (/intro) — 이 줄의 첫 화면. **인트로 → 방 목록 → 대기방 → 게임 시작**이 여기서 시작한다.
 *
 * ┌─ 주소가 바뀐 내력 (2026-08-30) ─────────────────────────────────────────┐
 * │ 처음엔 /lobby 의 첫 칸이었다. /intro 는 **그대로 두라**는 지시였기 때문   │
 * │ 이다 — 그건 남의 화면이고 그 색(차가운 틸 안개 + 앰버)은 그 화면의 것     │
 * │ 이라서. 그래서 같은 이야기를 이 줄의 색으로 다시 말하는 화면을 하나 더    │
 * │ 지었다 (리더의 파란 상자 문법, lobby.css).                               │
 * │                                                                         │
 * │ 그날 저녁 지시가 뒤집혔다 — "내가 만든 걸 /intro 로 다 옮겨줘".           │
 * │ 그래서 **이 화면이 /intro 다.** 옮긴 것은 파일이 아니라 **주소**다:       │
 * │ 이 파일은 features/lobby 에 그대로 있고(형제인 console.tsx · lobby.css · │
 * │ live.tsx 를 방 목록·대기방과 나눠 쓰므로 떼어낼 수 없다), 등록부          │
 * │ (features/index.ts)의 intro 한 줄이 이쪽을 가리킨다.                     │
 * │                                                                         │
 * │ 옛 랜딩(features/intro/IntroFeature)은 **지우지 않았다.** 파일도 시험도   │
 * │ 그대로 있고 경로만 잃었다 — 남의 화면을 지우는 것은 주소를 옮기라는       │
 * │ 지시에 없던 일이다. 되돌리려면 등록부 한 줄이면 된다.                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ★ 숫자를 화면에 박지 않는다. 인원도 차례표도 **판이 실제로 보는 상수**(world/mp/game-protocol)
 *   한 곳에서 오고, 배역 수는 **적지 않는다** (×N · ×? — 원작 humanish 인트로가 남긴 규칙 그대로다:
 *   첫 화면에 적힌 숫자가 방에 들어가서 틀리면 그 뒤 화면을 전부 의심하게 된다).
 *   몇 대가 섞였는지는 이 게임이 감추는 값이기도 하다 (PLANNING §3 I1).
 *
 * ┌─ 한 번에 한 칸 (2026-08-30 사용자 지시) ────────────────────────────────┐
 * │ 굴리면 칸이 **하나씩** 선다. 다섯 칸(히어로 · 브리핑 · 배역 · 진행 ·     │
 * │ 마지막)이 각각 화면을 가득 채우고 scroll-snap 이 그 자리에 붙잡는다.     │
 * │ 웹 문서는 끊김 없이 흐르지만 게임의 브리핑은 장(章)으로 넘어간다 —       │
 * │ 그 차이가 이 화면을 "페이지"가 아니라 "화면"으로 만든다.                 │
 * │                                                                         │
 * │ 들어오는 칸은 IntersectionObserver 가 표시하고(.bl-snap--in), 글은 그때  │
 * │ 한 박자 늦게 올라온다. **나간 칸은 다시 꺼진다** — 되감아 올릴 때도 연출  │
 * │ 이 다시 난다 (2026-08-30 사용자 지시로 뒤집었다. useSections 참고).       │
 * │ 관찰자가 없는 환경(jsdom)에서는 전부 켜 둔다 — 안 보이는 채로 남으면      │
 * │ 시험도 낭독기도 그 글을 못 읽는다.                                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * 글(2098년 구역 · 배역 · 진행 · 규칙)의 원본은 features/intro/IntroFeature 다.
 * 고칠 일이 있으면 **두 화면을 같이** 고친다 — 한쪽만 고치면 같은 게임이 두 말을 한다.
 *
 * ┌─ 무엇을 기준으로 적나 (2026-08-30, 2026-09-04 개정) ────────────────────┐
 * │ 처음 이 규칙을 적을 때는 「게임 시작」이 실제로 여는 판(대기방 →           │
 * │ /world(복도) → /central → /interrogation = ArenaFeature)을 따랐다 —      │
 * │ PLANNING §1 이 아직 8석 · AI5+인간3 · 3라운드 · 리더 판정으로 적혀        │
 * │ 있던 때라, 첫 화면이 아직 오지 않은 설계를 약속하면 안 됐기 때문이다.     │
 * │                                                                          │
 * │ **그 전제가 2026-09-04 사용자 지시로 뒤집혔다** — "기획서에 맞게 intro    │
 * │ 부분 꾸며줘". PLANNING.md 가 그새 개정되어 진영·인원·판정 방식이 전부     │
 * │ 바뀌었다(라운드 없이 연속 진행 · 시스템은 판정하지 않고 기록만 공개).     │
 * │ 이 화면은 이제 **그 개정판**을 따른다 — 물리 시행(worker/src/trial/)이   │
 * │ 실제로 그 방향으로 지어지고 있는 것도 확인했다.                           │
 * │                                                                          │
 * │ ★ 인원은 **구현값에서 온다** (2026-09-05 재확인). 한때 여기 「시행 총원 4 │
 * │   고정 · 사람 2~3명(ROOM_MAX_PLAYERS=3)」이라 적혀 있었는데, 그 4는       │
 * │   /trial 의 TRIAL_PARTY_SIZE 였다 — 본판(검문소)의 값이 아니다. 검문소는  │
 * │   **사람 GAME_MIN_HUMANS~GAME_MAX_HUMANS 명 + AI 1좌석**이고, 사람이      │
 * │   모자란 자리는 대역이 채운다 (game-protocol.ts · game/runtime.start).    │
 * │   같은 문장이 대기 패널에도 서 있다 (interrogation/hud/Panels.tsx).       │
 * │                                                                          │
 * │ ★ 차례표도 마찬가지다 (2026-09-05, bde946a). 「테스트가 주기적으로        │
 * │   열린다」는 이제 틀린 말이다 — 종류도 순서도 횟수도 GAME_TEST_ORDER      │
 * │   한 줄이 정한다: 대화 40초 ⇄ 시험 30초가 세 번, 그리고 끝난다.          │
 * │                                                                          │
 * │ ArenaFeature · lab/personas(고정 리더 + AI5 + 사람1)는 아직 옛 구성       │
 * │ 그대로다 — 그 쪽이 따라붙기 전까지는 첫 화면과 실제 입장 사이에 틈이      │
 * │ 있을 수 있다. 숫자는 여전히 안 박는다(머리말 규칙 그대로) — 약속이       │
 * │ 배역 이름과 규칙의 **모양**뿐이라 훨씬 안전하게 앞서 갈 수 있다.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AccountButton } from '@/shared/AccountButton';
import { signInWithGoogle, useAccount, useAccountSync } from '@/shared/useAccount';
import { SfxToggle } from '@/shared/SfxToggle';
import { LEADER_NAME, NAMES } from '@/lab/personas';
import { TRIAL_PHASE_MS } from '@/world/mp/constants';
import {
  GAME_BRIEFING_MS,
  GAME_DISCUSSION_MS,
  GAME_FIRST_DISCUSSION_MS,
  GAME_MAX_HUMANS,
  GAME_MIN_HUMANS,
  GAME_RESULT_MODAL_MS,
  GAME_TEST_MS,
  GAME_TEST_ORDER,
} from '@/world/mp/game-protocol';
import { Backdrop, EnterButton } from './console';
import { Typed } from './live';
import './lobby.css';
/*
 * 표식(첫 화면) — heroes.tsx 의 복도 벌로 확정했다(2026-09-03, ?hero=g 로 시험해 본 것).
 * 이 줄이 lobby.css **뒤에** 있어야 heroes.css 가 나중에 실린다.
 */
import { HeroKey } from './heroes';

/**
 * 한 판이 실제로 걸리는 시간 — 차례표를 그대로 더한다 (game-protocol 의 상수들).
 *
 *   배역 통보 + 첫 대화 + (시험 + 결과 창 + 대화) × 차례표 길이
 *
 * ★ 분 수를 손으로 적지 않는 이유는 머리말 규칙 그대로다. 이 자리에는 「1분 한 판」이
 *   적혀 있었는데, 그건 /trial 의 TRIAL_GAME_MS 였다 — 이 줄이 여는 판은 그 다섯 배다.
 *   더하기로 두면 GAME_TEST_ORDER 에 한 줄이 붙는 날 이 화면도 같이 따라간다.
 */
const ROUND_MS =
  GAME_BRIEFING_MS +
  GAME_FIRST_DISCUSSION_MS +
  GAME_TEST_ORDER.length * (GAME_TEST_MS + GAME_RESULT_MODAL_MS + GAME_DISCUSSION_MS);

/** 다섯 칸. 순서가 곧 스크롤 순서다 — 내비도 오른쪽 눈금도 이 하나를 본다 */
const SECTIONS = [
  { id: 'hero', label: '표식' },
  { id: 'about', label: '게임 소개' },
  { id: 'roles', label: '배역' },
  { id: 'rules', label: '진행' },
  { id: 'enter', label: '입장' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

/** 머리말 내비에 세우는 칸 — 표식과 마지막은 뺀다 (거기로 가는 길은 로고와 버튼이다) */
const NAV: SectionId[] = ['about', 'roles', 'rules'];

const anchor = (id: SectionId) => `bl-brief-${id}`;

function scrollTo(id: SectionId) {
  // jsdom 에는 scrollIntoView 가 없다 — 없으면 그냥 아무 일도 안 일어난다
  document.getElementById(anchor(id))?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

/**
 * 지금 어느 칸에 서 있나. 화면에 든 칸을 켜고 나간 칸을 끄고, 머리말·눈금이 볼
 * 「지금 칸」을 돌려준다.
 *
 * ★ 예전에는 **한 번 켜지면 안 껐다** ("되돌아갈 때 글이 다시 사라지면 산만하다").
 *   2026-08-30 사용자 지시로 뒤집었다 — **되감아 올릴 때도 연출이 다시 난다.**
 *   한 번에 한 칸씩 서는 화면이라 되짚어 올라가는 것도 「다음 칸으로 넘어가는 것」이고,
 *   그때만 글이 이미 서 있으면 올라가는 길에서만 화면이 죽어 보인다.
 *
 * ★ 켜고 끄는 문턱이 **다르다**. 0.2 를 넘으면 켜고, 완전히 나가야(0) 끈다.
 *   그 사이에서는 아무것도 안 한다 — 문턱이 하나면 경계에 걸친 칸이 굴리는 내내 깜빡인다.
 *   완전히 나가는 순간을 잡으려면 threshold 에 0 이 있어야 한다.
 */
function useSections() {
  const [at, setAt] = useState<SectionId>('hero');
  /** 지금 화면에 들어 있는 칸들. 누적이 아니다 — 나가면 빠지고, 다시 들어오면 연출이 다시 난다 */
  const [seen, setSeen] = useState<SectionId[]>(['hero']);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(SECTIONS.map((s) => s.id)); // 관찰자가 없으면 전부 켜 둔다 (파일 머리말)
      return;
    }
    const ratio = new Map<SectionId, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = SECTIONS.find((s) => anchor(s.id) === e.target.id)?.id;
          if (!id) continue;
          const r = e.isIntersecting ? e.intersectionRatio : 0;
          ratio.set(id, r);
          // 켤 때와 끌 때의 문턱이 다르다 (위 머리말) — 그 사이 구간은 건드리지 않는다
          if (r >= 0.2) setSeen((cur) => (cur.includes(id) ? cur : [...cur, id]));
          else if (r === 0) setSeen((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur));
        }
        let best: SectionId | null = null;
        let top = 0;
        for (const [id, r] of ratio) if (r > top) { best = id; top = r; }
        if (best) setAt(best);
      },
      { threshold: [0, 0.2, 0.5, 0.8] },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(anchor(s.id));
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  return { at, seen };
}

export function LobbyIntro() {
  const navigate = useNavigate();
  /*
   * 로그인 왕복이 끝난 뒤의 뒷정리 — 여기서도 부른다 (/lobby 와 같은 이유, shared/useAccount.ts).
   * 로그인 단추가 이 화면에도 있어서, 이 줄이 없으면 여기서 로그인한 사람만 이름이 늦게 맞는다.
   */
  useAccountSync();
  const account = useAccount();
  const { at, seen } = useSections();
  /**
   * 표식의 제목이 다 찍혔나. 찍히는 동안 그 아래는 **아직 오지 않은 것**이고, 앉는 순간
   * 차례로 올라온다 (live.css 의 .bl-hero__late). 제목만 찍히고 나머지가 이미 다 있으면
   * 그건 효과가 아니라 「제목이 안 불러와졌다」로 읽힌다 — 첫 화면에서는 사고로 보인다.
   */
  const [titled, setTitled] = useState(false);
  /**
   * 다음 칸 — **누르면 곧장 구글 로그인 창이다** (2026-08-31 사용자 지시).
   *
   * ┌─ 중간 화면을 두지 않는다 ────────────────────────────────────────────┐
   * │ 처음에는 /login 을 한 장 거치게 했다. 그 화면은 「무엇이 달라지는지」  │
   * │ 를 설명했는데, 사용자가 원한 것은 설명이 아니라 **로그인 창**이었다.   │
   * │ 입장하기를 누른 사람은 이미 들어가기로 마음먹은 사람이라, 그 앞에      │
   * │ 읽을 것을 한 장 세우면 그건 안내가 아니라 지연이다.                    │
   * │                                                                      │
   * │ 세 경우에 각각 다르게 군다:                                           │
   * │   로그인 안 함   구글로 바로 떠난다. 돌아오면 /lobby 다               │
   * │   이미 로그인함  묻지 않고 /lobby                                      │
   * │   설정이 없음    /lobby (로그인이 꺼진 판에서는 물을 것이 없다)       │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * 주소는 이렇게 이어진다: /intro → 구글 → /login(돌아오는 자리) → /lobby → ?code=1234
   * 로그인 없이 가는 길(shared/guest.ts)은 살아 있다 — /lobby 로 곧장 가면 된다. 표지의
   * 「로그인 없이 들어가기」 문은 2026-09-05 사용자 지시로 뺐다.
   */
  const enter = () => {
    if (account.status !== 'out') {
      navigate('/lobby');
      return;
    }
    // 성공하면 이 페이지는 구글로 떠난다. 못 떠난 경우에만 아래가 돈다
    void signInWithGoogle('/lobby').then(({ error }) => {
      if (error) navigate('/lobby');
    });
  };
  const on = (id: SectionId) => (seen.includes(id) ? ' bl-snap--in' : '');

  return (
    <div className="bl bl--snap">
      <Backdrop />

      <header className="bl-top">
        {/* 26 → 48 (2026-09-05 사용자 시안의 gap-12) — 나머지 옷은 lobby.css 의 .bl--snap .bl-top 묶음이다 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 48, minWidth: 0 }}>
          <span className="bl-logo">특수인공지능대응센터</span>
          <nav className="bl-nav">
            {NAV.map((id) => (
              <button
                key={id}
                type="button"
                className={`bl-navbtn${at === id ? ' bl-navbtn--on' : ''}`}
                aria-current={at === id ? 'true' : undefined}
                onClick={() => scrollTo(id)}
              >
                {SECTIONS.find((s) => s.id === id)?.label}
              </button>
            ))}
          </nav>
        </div>
        {/*
          ★ 글자 셋을 걷었다 (2026-08-30 사용자: "이거 다 글자 없애줘") —
            `SECTOR 2098` · 효과음 토글 · `← 처음`. 브리핑은 읽는 화면이라
            머리말에 조작이 늘어설수록 읽을 것과 누를 것이 섞인다.
            남은 둘은 사용자가 가리킨 것이 아니다: 로그인은 방에 들어가기 전에
            이름이 정해져야 해서 이 줄이 제자리고(shared/AccountButton),
            음악 고르개도 소리가 처음 나는 화면이 여기다.

          ★ `← 처음` 이 빠지면서 이 화면에서 루트(/)로 돌아가는 길이 없어졌다.
            로고는 <span> 이라 대체 통로도 아니다. **그대로 둔다** — 2026-08-31 에
            사용자가 로비 머리말의 같은 글자를 보고 "처음 없애줘" 라고 했다
            (LobbyFeature). 루트는 개발용 문 목록이라 게임 화면이 들고 있을 길이 아니다.
        */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <AccountButton className="bl-navbtn" />
          {/*
            소리 스위치는 다시 들어왔다 (2026-08-30 사용자: "소리 누르면 꺼지는거 넣어줘").
            앞 지시("글자 없애줘")와 어긋나지 않는다 — 걸린 것은 글자였지 기능이 아니었다.
            그래서 이건 **아이콘 하나뿐이고 글자는 aria-label 에만 있다** (shared/SfxToggle).
            이 하나로 효과음도 방의 배경음도 같이 내려간다 (sfx.ts 의 setSfxOn).
          */}
          <SfxToggle className="bl-navbtn" />
        </div>
      </header>

      {/* 오른쪽 눈금 — 다섯 칸 중 어디인지. 눌러서 건너뛸 수도 있다 */}
      <nav className="bl-rail" aria-label="구간">
        {SECTIONS.map((sec) => (
          <button
            key={sec.id}
            type="button"
            className={`bl-rail__tick${at === sec.id ? ' bl-rail__tick--on' : ''}`}
            aria-label={`${sec.label}(으)로`}
            aria-current={at === sec.id ? 'true' : undefined}
            onClick={() => scrollTo(sec.id)}
          />
        ))}
      </nav>

      {/* ── 1. 표식 ─────────────────────────────────────────────────────
          이 칸의 속은 heroes.tsx 의 HeroKey(복도 벌)가 그린다 — 시험해 본 다른 여섯 벌은
          58ddd2b 에 있다. 칸 자체(id · bl-snap)는 여기 남는다: 오른쪽 눈금과
          IntersectionObserver 가 이 id 를 보고 있다. */}
      <section id={anchor('hero')} className={`bl-snap bl-hero hero--key${on('hero')}`}>
        <HeroKey
          titled={titled}
          onTitled={() => setTitled(true)}
          enter={enter}
          next={() => scrollTo('about')}
        />
      </section>

      {/* ── 2. 브리핑 ───────────────────────────────────────────────────
          ★ 가운데 뜬 판을 걷어냈다 (2026-08-30). 테 두른 상자가 빈 화면 복판에 하나 떠 있으면
            그건 게임 화면이 아니라 웹 카드다. 제목은 위에, 계기는 아래에 붙이고 그 사이를
            비워 둔다 — 브리핑 화면이 늘 그렇게 생겼다. */}
      <section id={anchor('about')} className={`bl-snap${on('about')}`}>
        {/* 빈 화면 복판을 채우는 것은 글이 아니라 공기다 — 사진을 옅게 깔아 장면으로 만든다 */}
        {/*
          2026-09-05 시안: 오른쪽 반만 옅게 깔던 hero.jpg 대신 **표식 칸(영상 화면)처럼 칸을
          통째로 덮는** 장면 — 관제실, 줄 선 병사들, 놀란 연구원(/intro/brief-bg.jpg).
          글은 왼쪽 절반에 앉으므로 왼쪽을 어둡게 누른다(lobby.css .bl-scene__bleed--full).
          마음에 안 들면 이 두 줄을 옛 것으로 되돌리면 된다:
            <span className="bl-scene__bleed" aria-hidden><img src="/intro/hero.jpg" alt="" /></span>
        */}
        <span className="bl-scene__bleed bl-scene__bleed--full" aria-hidden>
          <img src="/intro/brief-bg.jpg" alt="" />
        </span>
        <div className="bl-scene bl-scene--brief bl-snap__in">
          <div>
            <span className="bl-label">01 // BRIEFING</span>
            {/*
              ★ 「2098. AI만 출입할 수 있는 / 구역이 있다.」 였다. 연도가 한 줄을 통째로 갖고,
                그 아래에 한 문장이 오는 짜임은 그대로 둔다(2026-08-30 사용자 지시) — 브리핑의
                첫 화면에서 제일 크게 읽혀야 할 것은 **그 해** 다.
              ★ 2026-09-04, PLANNING.md 개정에 맞춰 연도와 사건을 바꿨다. 옛 글은 "AI 전용 구역이
                생겼다"였다 — 인간이 AI 구역에 숨어드는 이야기였다. 새 글은 반대다: 표식 없는
                개체가 인간 사회로 새어 나왔다. 2098(72년 후)이 아니라 사건이 일어난 그해,
                2026이다.
              ★ 말줄임은 마침표 셋이다 (… 한 글자가 아니라). 점 하나마다 뜸을 들여 찍히므로
                「나왔다. . .」 로 흘러나온다 — 문장이 끝난 게 아니라 말을 아끼는 것처럼 들린다.
            */}
            <h2 className="bl-scene__h">
              <Typed
                start={seen.includes('about')}
                parts={['2026.', 'br', { dim: '표식 없는 개체가' }, 'br', '새어 나왔다...']}
              />
            </h2>
          </div>
          {/*
            글의 짜임(줄이 곧 박자, 마지막 줄이 홀로 앉는다, <br/> 로 끊고 칸을 나누지 않는다)은
            그대로 둔다 — 2026-09-04 에 바뀐 것은 **사건**이지 이 화면이 말하는 방식이 아니다.
          */}
          {/*
            ┌─ 색은 세 단이다 (2026-08-30 사용자: "중요한거 색 못바꿔?") ──────────────┐
            │ 굵게만 쓰면 무엇이 중요한지는 알려도 **무엇의 이야기인지**는 못 알린다.  │
            │ 그래서 색이 뜻을 맡는다 — 이 화면 어디서나 같은 약속이다:                │
            │                                                                          │
            │   <mark>  청록  구역 · 시스템이 정한 것   (표식 없는 것들)               │
            │   <b>     흰   규칙                      (아무도 정체를 모른다)          │
            │   <em>    앰버  사람 · 나 · 감춰진 것     (증명해야 하는 쪽 / 당신)       │
            │                                                                          │
            │ ★ **문단마다 하나씩만.** 넷을 넘기면 전부 평평해져서 색이 없는 것과 같다. │
            │   마지막 줄의 앰버는 이 글에서 유일하게 나를 가리키는 말이라 남긴다.      │
            └──────────────────────────────────────────────────────────────────────────┘
          */}
          <div className="bl-narr">
            <p className="bl-scene__lead">
              인간과 AI는 같은 도시에 산다. 다만 표식을 붙여야 하는 쪽은 언제나 AI였다.
              <br />
              그해, 설계자 하나의 실수로 <mark>표식 없는 개체들</mark>이 새어 나왔다.
            </p>
            <p className="bl-scene__lead">
              말투도 표정도 다르지 않다. 다른 건 몸이 물리 법칙에 반응하는 방식뿐...
              <br />
              그래서 정부는 의심 인물을 비밀 시설로 불러모은다. <em>사람도 예외 없이</em> 몸으로
              증명해야 한다.
            </p>
            <p className="bl-scene__lead">
              이 안에서는 <b>아무도 서로의 정체를 모른다.</b> AI도, 사람도, 시스템 자신도.
              <br />
              그래서 애먼 사람이 먼저 격리되기도 한다.
              <br />
              <em>그게 당신이 아니길</em> 바랄 뿐이다.
            </p>
          </div>
          {/*
            아래를 가로지르는 줄 — **계기 하나뿐이다.** 이 자리는 두 번 비워졌었다(2026-08-30,
            머리말 규칙: 수를 크게 띄우지 않는다 · 화자를 바꾸지 않는다 · 마지막 한 방 뒤에
            군더더기를 붙이지 않는다). 남은 계기 한 줄은 말이 아니라 수치라 위의 글과 다투지
            않는다 — 그 규칙은 2026-09-04 에도 그대로 지킨다.
          */}
          <div className="bl-brief-foot">
            {/*
              옛 줄은 연표였다(2026 첫 규칙 —— 2098 구역 폐쇄 · 72년째 누적) — "규정은 늘기만
              하고 줄지 않는다"는 옛 기획의 규칙 그 자체였다(lab/agent 의 누적 규정).

              새 기획엔 그 72년짜리 신화가 없다 — 사건은 2026년 하루다. 그래서 연표 대신 이
              판을 실제로 움직이는 두 수치를 적는다.

              ★ 2026-09-04 개정: 한때 여기에 「60–90초 마다 시행 —— 100% 닿으면 즉시 격리」가
              적혀 있었는데, 둘 다 **아직 안 만든 것**이었다 (의심도·격리는 PLANNING §0 에서
              미구현). 이 파일 머리말의 규칙이 정확히 그것을 금한다 — 첫 화면이 아직 오지 않은
              설계를 약속하면, 방에 들어간 사람이 그 뒤 화면을 전부 의심한다.

              ★ 2026-09-05: 그 자리에 /trial 의 두 수치(TRIAL_GAME_MS 1분 · TRIAL_PHASE_MS)를
              빌려 뒀었는데, 그건 **혼자 미니게임 하나를 돌려 보는 화면**의 값이지 이 줄이
              여는 판의 값이 아니었다. 이제 본판에 차례표가 생겼으므로(bde946a) 그 차례표를
              그대로 적는다 — 「몇 분」과 「무엇이 몇 번」이 둘 다 상수에서 온다.
              조건 전환(TRIAL_PHASE_MS)은 30초짜리 시험 안에 한 번 든다 — 그 말은 진행 칸이 한다.
            */}
            <p className="bl-brief-foot__era bl-mono">
              <b>
                {Math.floor(ROUND_MS / 60_000)}분 {Math.round((ROUND_MS % 60_000) / 1000)}초
              </b>{' '}
              한 판<i aria-hidden>——</i>
              <b>
                대화 {GAME_DISCUSSION_MS / 1000}초 ⇄ 시험 {GAME_TEST_MS / 1000}초
              </b>{' '}
              × {GAME_TEST_ORDER.length}
            </p>
            <p className="bl-brief-foot__facts bl-mono">
              {/*
                「2–3명」 이었다 — /trial 의 총원 4에서 온 수라 이 줄이 여는 판과 달랐다.
                검문소는 사람이 모자란 자리를 대역이 채우므로 아랫값이 「모여야 하는 수」다.
              */}
              사람 {GAME_MIN_HUMANS}–{GAME_MAX_HUMANS}명 + AI 1좌석 · 관리 AI {LEADER_NAME}
            </p>
          </div>
        </div>
      </section>

      {/* ── 3. 배역 ───────────────────────────────────────────────────── */}
      <section id={anchor('roles')} className={`bl-snap${on('roles')}`}>
        <div className="bl-scene bl-scene--roles bl-snap__in">
          <div>
            <span className="bl-label">02 // ROLES</span>
            {/*
              세 칸의 제목이 다 같이 찍힌다 — 한 칸만 찍히면 그건 효과가 아니라 사고로 보인다.

              ★ 이 줄은 **사용자가 직접 준 문장이다** (2026-08-30). 앞서 세 번 갈아엎었고
                셋 다 같은 잘못이었다:
                  「한 방, 두 종류. 그리고 리더.」   종류를 **세는 말**이다 — 목차다.
                  「전원이 개체로 등록된다. 그 전부가 개체는 아니다.」   같은 낱말로 뒤집는
                    **말장난**이고, '등록'은 이 게임에 없는 절차다.
                  「무엇을 받든, 증명할 방법은 없다.」   맞는 말이지만 **감정을 설명한다.**
                    구역은 플레이어가 어떤 기분일지 말해 주지 않는다.

                지금 줄은 셋 다 피한다. **사실 하나만 적고, 위협은 읽는 쪽이 만든다.**
                2026-09-04(절충): 문장을 새 기획의 공개 사실로 바꿨다 — 「하나는 인간이
                아니다」는 §1.1 이 공개하는 값이고(AI 존재는 공개, 좌석은 비공개), 그 한
                문장이 「그럼 누구인가」를 묻게 만든다. 그게 이 화면의 물음이다.
                색이 앉는 낱말은 '하나' — 셀 수 있는데 가려낼 수 없는 것.

              ★ 흐린 반쪽(.dim)은 두지 않는다. 다른 두 칸은 두 박자로 뒤집지만 이 줄은 한
                문장이라, 절반을 흐리면 없던 박자가 생긴다. 대신 **낱말 하나에만 색을 준다**
                (2026-08-30 사용자: "번호에 색 다른걸로") — 문장은 한 줄로 납작하게 두고
                눈이 걸리는 데만 한 점 찍는 것이라 박자가 안 생긴다. 색은 앰버가 아니라
                청록이다. 이유는 live.css 의 .bl-scene__h em 에 적었다.
            */}
            <h2 className="bl-scene__h">
              <Typed start={seen.includes('roles')} parts={['이 안의 ', { em: '하나' }, '는 인간이 아니다.']} />
            </h2>
            {/* 「아무도 통보받지 않는다」였다 — 새 기획에서 틀린 말이다: 설계자는 브리핑에서
                AI 의 정체까지 통보받는다(§1.1). 그 통보도 「자기 몫」 안이다 — 남의 몫은 아무도 못 본다 */}
            <p className="bl-scene__lead bl-scene__lead--tight">
              배정은 시작과 동시에, 무작위로. 자기 몫 외에는 아무것도 통보되지 않는다.
            </p>
          </div>
          <RoleSlides live={at === 'roles'} />
        </div>
      </section>

      {/* ── 4. 진행 · 규칙 ──────────────────────────────────────────────
          다섯 칸을 **한 줄로** 늘어놓고 선으로 잇는다 — 카드 다섯 장이 아니라 순서다.
          배경의 role-leader.jpg(얼굴 없는 관리자, 모니터 벽)는 더 이상 배역 카드가 아니다
          (2026-09-04, ROLES 머리말 참고) — 여기서는 그냥 분위기다: 관리 AI가 어딘가에서
          이 판을 지켜보고 있다는 것. 이름은 그대로 둔다 — 지우면 옛 커밋과 이 파일 사이
          diff가 파일 이동으로 안 읽힌다. */}
      <section id={anchor('rules')} className={`bl-snap${on('rules')}`}>
        <span className="bl-scene__bleed bl-scene__bleed--left" aria-hidden>
          <img src="/intro/role-leader.jpg" alt="" />
        </span>
        <div className="bl-scene bl-scene--rules bl-snap__in">
          <div>
            <span className="bl-label">03 // HOW TO PLAY</span>
            {/*
              「의심은 쌓이기만 한다」였다 — 같은 화면의 계기 줄("대화로만 풀린다")과 모순이다.
              §1.2 는 상승·하강이 대칭이다(지목 철회 −8 · 해명 일치 −10). 진짜 규칙을 적는다:
              움직이는 길이 말뿐이라는 것 (2026-09-04 절충).

              앞박자는 「테스트는 계속된다」였다 — 차례표가 고정되면서(bde946a) 틀린 말이 됐다.
              시험은 끝이 있고, 그 끝까지 못 찾으면 AI 가 이긴다. 그 사실이 이 칸의 긴장이라
              앞박자로 세운다. 수는 GAME_TEST_ORDER 에서 온다.
            */}
            <h2 className="bl-scene__h">
              <Typed
                start={seen.includes('rules')}
                parts={[`시험은 ${GAME_TEST_ORDER.length}번뿐이다. `, { dim: '의심은 말로만 움직인다.' }]}
              />
            </h2>
          </div>
          <ol className="bl-flow">
            {STEPS.map((s2, i) => (
              <li key={s2.title} className="bl-flow__step">
                <span className="bl-flow__no bl-mono">{String(i + 1).padStart(2, '0')}</span>
                <h4>{s2.title}</h4>
                <p className="bl-note">{s2.body}</p>
              </li>
            ))}
          </ol>
          <ul className="bl-rules">
            <li className="bl-rule">
              {/*
                「몸을 조심해라」 였다 (2026-08-30 검토). 브라우저에서 도는 판인데 몸을 말하면
                반응속도·조작 미션이 있는 줄 알게 된다 — 여기서 남는 것은 몸이 아니라 기록이다.
                2026-09-04: "리더는 본다"를 걷었다 — 새 기획은 관리 AI도 판정하지 않는다
                (PLANNING P1·P5). 보는 것은 사람들, 관리 AI는 그 기록을 공개할 뿐이다.
              */}
              <b>말은 꾸며도 된다. 기록은 못 꾸민다</b>
              <span>들키는 곳은 검사다. 기록은 그대로 공개된다 — 판정은 관리 AI가 아니라 서로가 한다.</span>
            </li>
            <li className="bl-rule">
              {/*
                「한 번 몰리면 잘 안 풀린다 · 대화로만 풀린다」 였다 — STEPS 4번 칸이 이미 같은
                말을 한다(같은 말을 두 번 하지 않는다, 2026-08-30 검토와 같은 규칙). 대신 빠져
                있던 판별 원리를 세운다 — README 의 핵심 긴장이자 P3(전환 구간)가 이 줄이다.
              */}
              <b>몸은 조건이 바뀐 직후에 들킨다</b>
              <span>얼마나 틀리는지는 흉내 낼 수 있다. 어느 쪽으로 헤매다 나아지는지는 못 한다.</span>
            </li>
            <li className="bl-rule bl-rule--human">
              {/*
                「끝까지 남으면 이긴다」 였다 — 그때는 내가 숨은 인간이라 내 생존이 곧 승리였다.
                2026-09-04: 새 기획에서 사람의 승리 조건은 **내가 남는 것**이 아니라
                **AI가 격리되는 것**이다(PLANNING §1.3). 그래서 주어를 AI로 옮긴다.
              */}
              <b>AI가 잡히면 이긴다</b>
              <span>방이 저희끼리 무너져도 마찬가지다. 그 전에 격리되면 거기서 끝이다.</span>
            </li>
          </ul>
        </div>
      </section>

      {/* ── 5. 마지막 ─────────────────────────────────────────────────── */}
      <section id={anchor('enter')} className={`bl-snap bl-snap--flush${on('enter')}`}>
        <div className="bl-final bl-snap__in">
          <span className="bl-final__art" aria-hidden>
            <img src="/intro/eye.jpg" alt="" />
          </span>
          <div className="bl-final__body">
            <span className="bl-label">FINAL BRIEFING</span>
            {/*
              마지막 화면은 묻는 자리가 아니라 **명령이 떨어지는 자리**다 (「당신은 살아남을 수
              있습니까?」를 걷어낸 2026-08-30 검토). 옛 명령 「들키지 마라.」는 숨는 쪽이 나였던
              판의 말이다 — 새 판에서 숨는 쪽은 AI 라, 시설이 소집된 전원에게 내리는 명령으로
              뒤집는다(2026-09-04 절충). 부속 한 줄은 그 명령이 왜 어려운지만 말한다 —
              전원이 같은 주장을 하기 때문이다.
            */}
            <h2 className="bl-hero__title bl-hero__title--sm">가려내라.</h2>
            <p className="bl-final__sub">전원이 인간이라고 말할 것이다. 하나는 아니다.</p>
            {/* 마지막 칸의 문은 **큰 벌**이다 — 다섯 칸을 다 읽고 닿는 자리라, 여기서는 이것 하나만 서 있다 */}
            <EnterButton onClick={enter} big className="bl-final__go" />
            <p className="bl-label">다음: 구글 로그인 → 방 목록 → 대기방 → 게임 시작</p>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * 개체 번호대 — 수용동 번호표다. **리더는 −001 고정, 나머지는 −002 부터** (src/lab/personas.ts).
 * 앞자리(계열)는 판마다 바뀌지만 판이 열릴 때 한 번 정해진다 (shared/series) — 그래서 이 화면과 방 안의 번호가 같다.
 * 사람도 같은 풀에서 받는다: 번호로는 사람과 AI 가 안 갈린다. 여기서 지어내지 않고 그 파일에서 읽는다 —
 * 첫 화면에 적힌 번호가 방에 들어가서 다르면 그 뒤 화면을 전부 의심하게 된다.
 */
const NODE_RANGE = `${NAMES[0]} ~ ${NAMES[NAMES.length - 1]}`;

/** 한 배역이 머무는 시간(ms). 세 줄짜리 카드 한 장을 읽고 남는 정도 */
const SLIDE_MS = 5200;

/**
 * 배역 슬라이드 — **한 번에 하나씩**, 스스로 넘어간다 (2026-08-30 사용자 지시).
 *
 * 셋을 나란히 놓으면 어느 것도 안 읽힌다. 하나만 크게 세우면 사진과 글이 같이 살고,
 * 넘어가는 것 자체가 「배역은 셋이다」를 말해 준다.
 *
 * ┌─ 지키는 것 ──────────────────────────────────────────────────────────────┐
 * │ 손이 올라가 있으면 멈춘다 — 읽는 중에 넘어가면 그게 제일 나쁘다.          │
 * │ 자리는 셋 다 잡아 둔다 (grid 한 칸에 겹쳐 쌓는다). 카드 높이가 달라도     │
 * │   넘어갈 때 화면이 들썩이지 않는다.                                       │
 * │ 모션을 꺼 둔 사람에게는 **자동으로 넘기지 않는다** — 점으로 직접 넘긴다.  │
 * │ 안 보이는 장은 aria-hidden 이다. 낭독기가 셋을 한꺼번에 읽으면 안 된다.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function RoleSlides({ live }: { live: boolean }) {
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  // jsdom 에는 matchMedia 가 없다 — 없으면 그냥 움직이는 쪽으로 둔다
  const still =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (paused || still) return;
    // at 이 바뀔 때마다 다시 건다 — 직접 넘긴 직후에 곧바로 또 넘어가지 않게
    const t = setTimeout(() => setAt((n) => (n + 1) % ROLES.length), SLIDE_MS);
    return () => clearTimeout(t);
  }, [at, paused, still]);

  /*
   * 모션을 꺼 둔 화면에서는 **넘기지 않고 셋을 다 편다.**
   *
   * 예전에는 여기서도 슬라이드를 그대로 두고 자동 넘김만 껐다. 그러면 한 장만 켜진 채로
   * 멈춰 있고 나머지 둘은 자리만 차지한 빈 칸으로 보인다 — 2026-08-30 검토에서
   * "카드가 A-1 하나만 채워져 있고 나머지 둘은 빈 껍데기" 로 보고된 것이 이 상태다.
   * 감춰 두고 안 넘기느니 처음부터 다 보여주는 게 맞다.
   */
  if (still) {
    return (
      <ul className="bl-slides__stack bl-slides__stack--still">
        {ROLES.map((r) => (
          <li key={r.title} className={`bl-slide bl-slide--on bl-edge${r.human ? ' bl-role--human' : ''}`}>
            <RoleCard r={r} />
          </li>
        ))}
      </ul>
    );
  }

  const go = (n: number) => setAt((n + ROLES.length) % ROLES.length);

  return (
    <div
      className="bl-slides"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <ul className="bl-slides__stack">
        {ROLES.map((r, n) => (
          <li
            key={r.title}
            className={`bl-slide bl-edge${n === at ? ' bl-slide--on' : ''}${r.human ? ' bl-role--human' : ''}`}
            aria-hidden={n !== at}
          >
            <RoleCard r={r} typing={n === at && live} />
          </li>
        ))}
      </ul>

      {/*
        손잡이 줄은 **세 칸**이다: 왼쪽 계기 · 가운데 손잡이 · 빈 칸.
        계기를 손잡이 옆에 붙여 두면 그 줄 전체가 오른쪽으로 밀려서 눈금이 화면 가운데가 아니다 —
        그게 「뭔가 이상한」 정체였다 (2026-08-30 사용자). 양쪽을 1fr 로 잡아 가운데를 붙잡는다.
      */}
      <div className="bl-slides__nav">
        {/* 계기 — 셋 중 몇 번째인가. 자릿수를 채워 적는다(01/03): 폭이 흔들리지 않는 것이 계기의 조건이다 */}
        <span className="bl-slides__count bl-mono">
          <b>{String(at + 1).padStart(2, '0')}</b> / {String(ROLES.length).padStart(2, '0')}
        </span>
        <div className="bl-slides__ctrl">
          <button type="button" className="bl-btn bl-edge bl-slides__arrow" aria-label="이전 배역" onClick={() => go(at - 1)}>
            ‹
          </button>
          <ol className="bl-dots">
            {ROLES.map((r, n) => (
              <li key={r.title}>
                <button
                  type="button"
                  className={`bl-dot-btn${n === at ? ' bl-dot-btn--on' : ''}`}
                  aria-label={`${r.title} 보기`}
                  aria-current={n === at ? 'true' : undefined}
                  onClick={() => go(n)}
                >
                  {/* 남은 시간이 채워진다 — 멈춰 있으면 같이 멈춘다 */}
                  <i key={`${at}-${paused}`} style={{ animationDuration: `${SLIDE_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }} />
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="bl-btn bl-edge bl-slides__arrow" aria-label="다음 배역" onClick={() => go(at + 1)}>
            ›
          </button>
        </div>
      </div>
    </div>
  );
}

/** 한 글자에 걸리는 시간(ms). 읽는 속도보다 조금 빠르다 — 기다리는 소리가 되면 안 된다 */
const TYPE_MS = 26;

/**
 * 글을 **한 글자씩** 찍는다 (2026-08-30 사용자: "글자 하나 생길때마다 탁탁탁").
 * 몇 글자까지 나왔는지를 돌려준다 — 줄이 여럿이면 이어서 센다 (첫 줄이 끝나야 둘째 줄이 시작한다).
 *
 * ★ **소리는 내지 않는다** (2026-08-30 사용자: "시끄러워 타닥타닥 소리 다 빼줘").
 *   글자마다 치는 소리를 붙여 봤지만, 5.2초마다 저 혼자 넘어가는 칸이라 결국 배경음이 된다 —
 *   이 화면에서 소리가 하는 일은 **누른 것에 대답하는 것**뿐이다. 찍히는 것은 눈으로만 본다.
 * ★ 찍는 중이 아니면(다른 장 · 모션 끔) **처음부터 온전한 글**이다 — 안 보이는 채로 남는 글이 없게.
 */
function useTyped(lines: string[], on: boolean): number {
  const text = lines.join('');
  const [n, setN] = useState(on ? 0 : text.length);

  useEffect(() => {
    if (!on) {
      setN(text.length);
      return;
    }
    setN(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) window.clearInterval(id);
    }, TYPE_MS);
    return () => window.clearInterval(id);
  }, [text, on]);

  return n;
}

/** 배역 한 장의 속. 슬라이드로 넘길 때와 셋을 다 펼 때가 같은 것을 그려야 한다 (features/interrogation 의 브리핑도 이걸 그대로 가져다 쓴다) */
export function RoleCard({ r, typing = false }: { r: RoleDef; typing?: boolean }) {
  const typed = useTyped(r.body, typing);
  return (
    <>
      <span className="bl-role__art" aria-hidden>
        <img src={r.img} alt="" />
      </span>
      <div className="bl-slide__text" data-code={r.stamp}>
        {/* 번호대만 — 마릿수(×1 · ×?)는 안 적는다 (머리말 ★ · 2026-09-05 사용자: 번호 옆 글자를 뺀다) */}
        <div className="bl-role__code">
          <span className="bl-mono">{r.code}</span>
        </div>
        <h3>{r.title}</h3>
        {/* 줄마다 한 칸씩 띄운다 — 뭉쳐 놓으면 어디가 한 호흡인지 안 보인다 */}
        <div className="bl-slide__body">
          {r.body.map((line, i) => {
            const from = r.body.slice(0, i).reduce((sum, l) => sum + l.length, 0);
            const shown = Math.max(0, Math.min(line.length, typed - from));
            // 찍는 장이 아니면 그냥 한 줄이다 — 같은 글이 DOM 에 두 번 있을 이유가 없다
            if (!typing) {
              return (
                <p key={line} className="bl-note">
                  {line}
                </p>
              );
            }
            return (
              <p key={line} className="bl-note">
                {/*
                  자리는 **온전한 글**이 잡는다 (opacity 0). 찍히는 글자만 그 위에 얹는다 —
                  한 글자씩 늘려 가며 줄을 접으면 글칸이 가운데 정렬이라 카드가 들썩인다.
                  낭독기는 자리를 잡은 쪽을 읽고(눈에만 안 보인다), 찍히는 쪽은 aria-hidden 이다.
                */}
                <span style={{ position: 'relative', display: 'block' }}>
                  <span style={{ opacity: 0 }}>{line}</span>
                  <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, right: 0 }}>
                    {line.slice(0, shown)}
                  </span>
                </span>
              </p>
            );
          })}
        </div>
        <ul className="bl-role__tags">
          {r.tags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

/**
 * 배역 셋 — PLANNING §1.1 개정(2026-09-04)에 맞춰 다시 짰다.
 *
 * 옛 셋은 [리더 AI · AI 노드 ×N · 인간 요원 ×?] 이었다. 리더는 판정하고 폐기하는
 * 특권 개체라 번호도 고정(-001)이었다. 새 기획엔 그런 특권 개체가 없다 — 관리 AI는
 * 판정하지 않고(PLANNING P1·P5), 그래서 애초에 "배역"이 아니다(누구도 관리 AI의
 * 정체를 의심할 필요가 없다). 셋은 이제 [AI ×1 · AI 설계자 · 사람]이고, **셋 다 같은
 * 번호 풀에서 받는다** — 번호로는 아무것도 알 수 없다는 게 이 판의 전제라서, 옛 리더처럼
 * 예약된 번호를 가진 배역을 남겨 두면 그 전제가 깨진다.
 *
 * 수는 **AI 하나만 적는다**(×1) — 그건 이 판이 공개하는 규칙이다(PLANNING §1.1: "AI 항상
 * 1명"). 나머지 둘은 여전히 안 적는다(×?) — 설계자 수(0~2)는 이 판이 감추는 값 그 자체고
 * (§1.1 "아무도 수를 모른다"), 사람 수는 방마다 다르다. 첫 화면에 적힌 숫자가 방에 들어가서
 * 틀리면 그 뒤 화면을 전부 의심하게 된다는 원칙은 그대로다(파일 머리말).
 *
 * 그림은 features/intro 와 같은 자리(public/intro/)를 쓴다. AI 카드와 설계자 카드는 새로
 * 그렸다(role-ai.jpg · role-designer.jpg, 2026-09-04) — 옛 role-node.jpg는 후드를 쓴 실루엣이라
 * 한눈에 로봇으로 보였는데, 새 기획의 AI는 "말투도 표정도 인간과 다르지 않다"(PLANNING
 * 서두)가 핵심이라 겉모습으로 갈리면 안 된다. 사람 카드는 role-human.jpg를 그대로 쓴다.
 *
 * 2026-09-05 09:21 사용자 지급으로 **설계자 카드만** 갈았었다(image/spy.png → role-designer.jpg,
 * 도면 벽 앞에서 두 손을 펼친 후드 실루엣). 위 문단의 「후드는 안 된다」는 **AI 카드의 규칙**
 * 이라 그 교체와 부딪치지 않는다 — 겉모습으로 갈리면 안 되는 쪽은 인간과 구별되지 않아야 하는
 * AI 고, 설계자는 그 반대다: 정체를 감추는 쪽이 아니라 **감추는 일을 하는 쪽**이다.
 * 파일 이름을 그대로 둔 덕에 두 인트로 화면이 같이 바뀐다 (features/intro 의 배역 칸).
 *
 * 2026-09-05 09:25 세 장을 다시 갈았다(사용자가 준 그림, 1254² → 1000² jpg): AI 는 목에 이음매
 * 선이 간 청년의 정면 얼굴, 설계자는 안경 쓴 연구원이 손으로 입을 가린 채 고민하는 모습, 사람은
 * 전투복 차림의 굳은 얼굴. 셋 다 얼굴이 복판이라 카드의 세로 자르기(lobby.css 50% 45%)에 맞는다.
 * 설계자는 그래서 spy.png(09:21)가 아니라 이 연구원이다 — 뒤의 지시가 앞의 것을 덮는다. spy.png
 * 원본은 image/ 에 그대로 있어 되돌리려면 그 파일로 다시 뽑으면 된다.
 */
/** 배역 한 장의 모양 — features/interrogation 의 브리핑 카드도 이 타입 그대로 쓴다 */
export interface RoleDef {
  code: string;
  /** 뒤에 크게 찍히는 짧은 코드. 긴 범위는 여기 안 들어간다 */
  stamp: string;
  title: string;
  /**
   * 소개 — **한 줄에 한 문장이다** (2026-08-30 사용자: "한 줄씩 띄워서 보여주게" →
   * "다 한 줄 쓰면 엔터로 띄워줘").
   *
   * 한 덩이로 흘리면 문장이 뭉쳐서 어디가 한 호흡인지 안 보인다. 브리핑의 서술과 같은
   * 규칙이다 — 줄이 곧 박자고, 박자를 지우면 읽는 속도가 사라진다. 그래서 **마침표에서
   * 끊는다**: 첫 줄은 「이것이 무엇인가」 한마디로 짧게 떨어지고(관리 권한을 가진 존재 ·
   * LLM 에이전트 · 실제 플레이어), 그 아래로 하는 일이 한 줄씩 쌓인다. 조서(調書)의 리듬이다.
   *
   * 찍는 속도는 안 바뀐다 — useTyped 는 줄을 이어 붙인 **글자 수**를 세므로 줄을 나눠도
   * 같은 글이 같은 시간에 다 찍힌다. 바뀌는 것은 사이 여백뿐이다 (.bl-slide__body 의 gap).
   */
  body: string[];
  img: string;
  tags: string[];
  human?: boolean;
}

export const ROLES: RoleDef[] = [
  {
    code: NODE_RANGE,
    stamp: 'A-··',
    title: 'AI',
    body: [
      '표식 없이 출고된 유일한 개체.',
      '말투도 표정도 인간과 다르지 않다.',
      '다른 건 몸이 물리 법칙에 반응하는 방식뿐.',
      '설계자가 누군지도 모른다.',
    ],
    img: '/intro/role-ai.jpg',
    tags: ['자기 자신만 안다', '몸으로 드러난다', '격리되지 않으면 승리'],
  },
  {
    code: NODE_RANGE,
    stamp: 'A-··',
    title: 'AI 설계자',
    body: [
      '표식을 붙이지 않은 걸 들켜서는 안 되는 조력자.',
      'AI의 정체를 시작부터 정확히 안다.',
      '있는지 없는지조차 아무도 모른다.',
      '판당 한 번, 기록을 조작할 수 있다.',
    ],
    img: '/intro/role-designer.jpg',
    tags: ['존재 자체가 비공개', 'AI의 정체를 안다', '기록 조작 1회'],
  },
  {
    code: NODE_RANGE,
    stamp: 'A-··',
    title: '사람',
    body: [
      '실제 플레이어 대다수.',
      '자신이 사람이라는 것만 안다.',
      '몸은 못 속여도 말은 속을 수 있다.',
      '대화와 지목만이 의심도를 움직인다.',
    ],
    img: '/intro/role-human.jpg',
    tags: ['실제 플레이어', '시스템은 판정하지 않는다', 'AI가 격리되면 승리'],
  },
];

/**
 * 진행 다섯 칸. 첫 칸이 **이 줄의 다음 화면**이다 — 읽고 나서 어디로 가는지가 글에 적혀 있어야
 * 「입장하기」가 무엇을 여는 버튼인지 안다.
 *
 * 2026-09-04: 옛 다섯 칸은 라운드제였다(검사 → 폐기 판정 → 조사 결과, 셋이 한 판씩 반복).
 * 새 기획엔 라운드 경계가 없다(PLANNING §1.2) — "테스트가 계속 열리고 의심도는 계속
 * 흐른다"를 다섯 칸으로 늘어놓을 때, 그걸 "1라운드·2라운드"로 끊지 않고 **하나의 순환**으로
 * 보이게 짰다: 2~4번이 사이클이고(테스트 → 기록 공개 → 의심이 쌓인다), 5번(격리)만 그
 * 순환을 끊는 유일한 사건이다(§1.2 "유일한 이벤트 경계는 격리 순간이다").
 *
 * 2026-09-05 (bde946a): 그 순환에 **끝이 생겼다.** 차례표가 고정이라 2~4번은 딱 세 바퀴
 * 돌고 멈춘다 — 칸의 짜임(2~4가 사이클, 5가 그걸 끊는다)은 그대로 두고 **횟수만** 적는다.
 * 라운드제로 돌아간 것이 아니다: 대화도 지목도 시험이 도는 중에 안 멈추므로 여전히 경계가
 * 없고, 다만 사이클이 무한하지 않을 뿐이다. 세 바퀴가 다 돌 때까지 못 찾으면 AI 가 이긴다.
 *
 * ★ 수는 전부 상수에서 온다 (머리말 규칙). 옛 칸의 「60~90초마다 · 정지선 · 색 사냥」은
 *   관리 AI 가 종목을 고르던 시절의 글이다 — 그 설계는 접혔다(PLANNING §2 머리말).
 */
const STEPS = [
  {
    title: '방에 모인다',
    body: `사람 ${GAME_MIN_HUMANS}~${GAME_MAX_HUMANS}명 + AI 1좌석. 모자란 자리는 대역이 채우고, 시작하는 순간 좌석이 다시 섞인다.`,
  },
  {
    title: `시험 ${GAME_TEST_ORDER.length}번`,
    body: `대화 ${GAME_DISCUSSION_MS / 1000}초와 시험 ${GAME_TEST_MS / 1000}초가 번갈아 ${GAME_TEST_ORDER.length}번 — 낙하 생존 → 움직이는 발판 → 회전 원판. 순서는 다 알고 들어오고, 숨는 것은 조건뿐이다: ${TRIAL_PHASE_MS / 1000}초 지점에서 말없이 한 번 바뀐다.`,
  },
  { title: '기록이 공개된다', body: '전체 화면 결과 창이 뜬다. 무리 평균 대비 편차가 원자료 그대로 드러난다.' },
  { title: '의심이 쌓인다', body: '지목·동조·몰이가 의심도를 올린다. 시간으로는 안 풀린다 — 오직 대화뿐이다.' },
  {
    title: '격리',
    body: '의심도 100%에 닿는 즉시 그 자리에서 격리된다 — 처형자가 쏜다. 누가 격리되든 판은 거기서 끝난다: AI 였으면 사람의 승리, 사람이었으면 AI 의 승리.',
  },
];

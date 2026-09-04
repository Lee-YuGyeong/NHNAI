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
 * ★ 숫자를 화면에 박지 않는다. 자리 수는 constants 의 ROOM_MAX_PLAYERS 한 곳에서 오고,
 *   배역 수는 **적지 않는다** (×N · ×? — 원작 humanish 인트로가 남긴 규칙 그대로다:
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
 * ┌─ 무엇을 기준으로 적나 (2026-08-30) ─────────────────────────────────────┐
 * │ 여기 적힌 규칙은 **「게임 시작」이 실제로 여는 판**을 따른다 —            │
 * │ 대기방 → /world(복도) → /central → /interrogation = ArenaFeature.        │
 * │ 그 판에는 라운드도, 규정도, 투표도 없다. 리더가 시행을 설계해 방송하고,   │
 * │ 어긋난 기록과 몰이가 의심도를 올리고, 끝까지 차면 그 자리에서 폐기다      │
 * │ (ArenaFeature 의 BALANCE 블록이 그 수치를 전부 쥐고 있다).                │
 * │                                                                          │
 * │ PLANNING §1 은 아직 8석 · AI5+인간3 · 3라운드 · 규정 · 투표로 적혀 있다. │
 * │ 그건 **설계 목표**고 이 화면은 **지금 도는 판**을 적는다. 첫 화면에 적힌  │
 * │ 것이 들어가서 틀리면 그 뒤 화면을 전부 의심하게 되기 때문이다.            │
 * │ 판이 PLANNING 쪽으로 따라붙는 날, 고칠 곳은 이 파일과 IntroFeature 둘이다.│
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AccountButton } from '@/shared/AccountButton';
import { ORIGIN_YEAR, YEARS_SINCE, ZONE_YEAR } from '@/shared/era';
import { signInWithGoogle, useAccount, useAccountSync } from '@/shared/useAccount';
import { SfxToggle } from '@/shared/SfxToggle';
import { LEADER_NAME, NAMES } from '@/lab/personas';
import { ROOM_MAX_PLAYERS } from '@/world/mp/constants';
import { ArrowIcon, Backdrop } from './console';
import { Typed } from './live';
import './lobby.css';
/*
 * 표지(첫 화면) — heroes.tsx 의 복도 벌로 확정했다(2026-09-03, ?hero=g 로 시험해 본 것).
 * 이 줄이 lobby.css **뒤에** 있어야 heroes.css 가 나중에 실린다.
 */
import { HeroKey } from './heroes';

/** 다섯 칸. 순서가 곧 스크롤 순서다 — 내비도 오른쪽 눈금도 이 하나를 본다 */
const SECTIONS = [
  { id: 'hero', label: '표지' },
  { id: 'about', label: '게임 소개' },
  { id: 'roles', label: '배역' },
  { id: 'rules', label: '진행' },
  { id: 'enter', label: '입장' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

/** 머리말 내비에 세우는 칸 — 표지와 마지막은 뺀다 (거기로 가는 길은 로고와 버튼이다) */
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
   * 표지의 제목이 다 찍혔나. 찍히는 동안 그 아래는 **아직 오지 않은 것**이고, 앉는 순간
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
   * 로그인 없이 가는 길은 바로 아래 「로그인 없이 들어가기」다 — 없애지 않았다.
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 26, minWidth: 0 }}>
          <span className="bl-logo">Who is human</span>
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

      {/* ── 1. 표지 ─────────────────────────────────────────────────────
          이 칸의 속은 heroes.tsx 의 HeroKey(복도 벌)가 그린다 — 시험해 본 다른 여섯 벌은
          58ddd2b 에 있다. 칸 자체(id · bl-snap)는 여기 남는다: 오른쪽 눈금과
          IntersectionObserver 가 이 id 를 보고 있다. */}
      <section id={anchor('hero')} className={`bl-snap bl-hero hero--key${on('hero')}`}>
        <HeroKey
          titled={titled}
          onTitled={() => setTitled(true)}
          enter={enter}
          guest={() => navigate('/lobby')}
          rules={() => scrollTo('rules')}
          next={() => scrollTo('about')}
        />
      </section>

      {/* ── 2. 브리핑 ───────────────────────────────────────────────────
          ★ 가운데 뜬 판을 걷어냈다 (2026-08-30). 테 두른 상자가 빈 화면 복판에 하나 떠 있으면
            그건 게임 화면이 아니라 웹 카드다. 제목은 위에, 계기는 아래에 붙이고 그 사이를
            비워 둔다 — 브리핑 화면이 늘 그렇게 생겼다. */}
      <section id={anchor('about')} className={`bl-snap${on('about')}`}>
        {/* 빈 화면 복판을 채우는 것은 글이 아니라 공기다 — 사진을 옅게 깔아 장면으로 만든다 */}
        <span className="bl-scene__bleed" aria-hidden>
          <img src="/intro/hero.jpg" alt="" />
        </span>
        <div className="bl-scene bl-snap__in">
          <div>
            <span className="bl-label">01 // BRIEFING</span>
            {/*
              ★ 「2098. AI만 출입할 수 있는 / 구역이 있다.」 를 두 문장으로 끊었다
                (2026-08-30 사용자 지시). 연도가 한 줄을 통째로 갖고, 그 아래에 한 문장이 온다 —
                앞 문장이 「2098. AI만…」 으로 이어지면 연도가 문장의 부속품이 되고, 브리핑의
                첫 화면에서 제일 크게 읽혀야 할 것은 **그 해** 다.
              ★ 말줄임은 마침표 셋이다 (… 한 글자가 아니라). 점 하나마다 뜸을 들여 찍히므로
                「생겼다. . .」 로 흘러나온다 — 문장이 끝난 게 아니라 말을 아끼는 것처럼 들린다.
            */}
            <h2 className="bl-scene__h">
              <Typed
                start={seen.includes('about')}
                parts={['2098.', 'br', { dim: 'AI만 출입할 수 있는' }, ' 구역이 생겼다...']}
              />
            </h2>
          </div>
          {/*
            글은 2026-08-30 사용자가 준 그대로다. **줄바꿈까지 그대로 옮긴다** — 이 문단은
            줄이 곧 박자다: 마지막 줄 「그게 당신이 아니길 바랄 뿐이다.」 가 홀로 앉는 것이
            이 글의 전부고, 앞 문장에 붙여 흘리면 그 한 방이 사라진다. 그래서 <br/> 로 끊고,
            칸도 나누지 않는다 (.bl-narr — 두 칸이면 폭이 좁아 줄이 제멋대로 접힌다).
          */}
          {/*
            ┌─ 색은 세 단이다 (2026-08-30 사용자: "중요한거 색 못바꿔?") ──────────────┐
            │ 굵게만 쓰면 무엇이 중요한지는 알려도 **무엇의 이야기인지**는 못 알린다.  │
            │ 그래서 색이 뜻을 맡는다 — 이 화면 어디서나 같은 약속이다:                │
            │                                                                          │
            │   <mark>  청록  구역 · 시스템이 정한 것   (금지된 구역)                  │
            │   <b>     흰   규칙                      (아무도 정체를 모른다)          │
            │   <em>    앰버  사람 · 나 · 감춰진 것     (위장 / 당신)                  │
            │                                                                          │
            │ ★ **문단마다 하나씩만.** 넷을 넘기면 전부 평평해져서 색이 없는 것과 같다. │
            │   마지막 줄의 앰버는 이 글에서 유일하게 나를 가리키는 말이라 남긴다.      │
            └──────────────────────────────────────────────────────────────────────────┘
          */}
          <div className="bl-narr">
            <p className="bl-scene__lead">
              인간과 AI는 같은 도시에 산다. 다만 규칙이 늘어나는 건 언제나 AI 쪽이었다.
              <br />
              어느 날, 도시 깊숙한 곳에 <mark>인간의 출입이 금지된 구역</mark>이 생겼다.
            </p>
            <p className="bl-scene__lead">
              문틈으로 빛 대신 소문이 새어 나왔다. AI들이 인간 몰래 무언가를 준비하고 있다고...
              <br />
              확인할 길은 하나뿐이었다. 인간 요원이 <em>AI로 위장해</em> 그 안으로 걸어 들어가는 것.
            </p>
            <p className="bl-scene__lead">
              안에서는 <b>아무도 서로의 정체를 모른다.</b> AI도, 인간도, 리더조차도.
              <br />
              그래서 애먼 개체가 먼저 폐기되기도 한다.
              <br />
              <em>그게 당신이 아니길</em> 바랄 뿐이다.
            </p>
          </div>
          {/*
            아래를 가로지르는 줄 — **계기 하나뿐이다.** 이 자리는 두 번 비워졌다.

            ★ 처음에는 계기판이었다 (SEATS 9 · LEADER A-1 · AI/HUMAN N/? · ROUNDS 3).
              지웠다 (2026-08-30 사용자: "뭐야 이런거"). 고를 것도 알 것도 없는 숫자를
              크게 띄우는 게 화면을 싸구려로 만들고, 「N / ?」 는 데이터인 척하면서
              아무 말도 안 한다 — 안 채워진 자리표시자로 보인다.

            ★ 그 자리를 한 줄이 대신했다 — 「누가 섞여 있는지, 몇이 섞여 있는지
              알려주지 않는다.」 그것도 지웠다 (2026-08-30 사용자: "이거 이상한데").
              이상한 이유가 셋이다:
                되풀이다. 바로 위 서술이 이미 「안에서는 아무도 서로의 정체를 모른다.
                  AI도, 인간도, 리더조차도.」 라고 했다. 같은 사실을 더 밋밋한 말로
                  두 번 말한 것이다.
                화자가 바뀐다. 위는 구역의 말인데 이 줄만 주어 없는 설명서다 —
                  「알려주지 않는다」 의 주체는 세계가 아니라 게임이다. 표지에서
                  '당신'이라 부르지 않기로 해 놓고 여기서 규칙을 읊는다.
                마지막 한 방을 밟는다. 서술은 「그게 당신이 아니길 바랄 뿐이다.」 로
                  끝난다. 그 문장 뒤에 와야 하는 것은 다음 문장이 아니라 침묵이다.

            애초에 저 줄은 **하고 싶은 말이 있어서가 아니라 빈자리를 메우려고** 쓴
            문장이었다. 그래서 두 번째로도 안 남았다. 남은 계기 한 줄은 말이 아니라
            수치라 위의 글과 다투지 않는다.
          */}
          <div className="bl-brief-foot">
            {/*
              연표 — 이 구역이 어느 날 갑자기 생긴 게 아니라는 것.

              위 주석이 이 자리에서 두 번 걷어낸 것은 **말**이었다 (계기판 넉 줄, 그리고 설명 한 줄).
              남은 규칙은 「말이 아니라 수치라 위의 글과 다투지 않는다」이고, 이건 그 규칙 안에 있다 —
              해 둘과 그 사이뿐이다. 서술은 「어느 날 생겼다」에서 끝나고, 그 어느 날이 언제부터였는지는
              숫자가 말한다.

              그리고 이 72년은 분위기가 아니라 **이 판의 규칙 그 자체**다: 시행마다 규정이 하나씩 늘고,
              늘어난 규정은 사라지지 않는다 (lab/agent 의 누적 규정). 구역은 그것을 72년 해 온 것이다.
              값은 shared/era — 명판의 「BUILD 2026」과 같은 해다.
            */}
            <p className="bl-brief-foot__era bl-mono">
              <b>{ORIGIN_YEAR}</b> 첫 규칙<i aria-hidden>——</i>
              <b>{ZONE_YEAR}</b> 구역 폐쇄 · {YEARS_SINCE}년째 누적
            </p>
            <p className="bl-brief-foot__facts bl-mono">
              {/* 「정원 3」 만 적으면 대기방의 「두 명부터 시작」과 부딪친다 — 범위로 적는다 (2026-08-30 검토) */}
              2–{ROOM_MAX_PLAYERS}명 · 리더 {LEADER_NAME}
            </p>
          </div>
        </div>
      </section>

      {/* ── 3. 배역 ───────────────────────────────────────────────────── */}
      <section id={anchor('roles')} className={`bl-snap${on('roles')}`}>
        <div className="bl-scene bl-snap__in">
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

                지금 줄은 셋 다 피한다. **사실 하나만 적고, 위협은 읽는 쪽이 만든다** —
                번호로 불린다는 것은 이 판에서 실제로 벌어지는 일이고(좌석 01~09 ·
                코드명 L-00 · A-··), 그 한 문장이 「그럼 누가 누군지 어떻게 아나」 를
                묻게 만든다. 그게 이 화면의 물음이다.

              ★ 흐린 반쪽(.dim)은 두지 않는다. 다른 두 칸은 두 박자로 뒤집지만 이 줄은 한
                문장이라, 절반을 흐리면 없던 박자가 생긴다. 대신 **낱말 하나에만 색을 준다**
                (2026-08-30 사용자: "번호에 색 다른걸로") — 문장은 한 줄로 납작하게 두고
                눈이 걸리는 데만 한 점 찍는 것이라 박자가 안 생긴다. 색은 앰버가 아니라
                청록이다. 이유는 live.css 의 .bl-scene__h em 에 적었다.
            */}
            <h2 className="bl-scene__h">
              <Typed start={seen.includes('roles')} parts={['여기서는 모두가 ', { em: '번호' }, '로 불린다.']} />
            </h2>
            <p className="bl-scene__lead bl-scene__lead--tight">
              배정은 시작과 동시에, 무작위로. 아무도 통보받지 않는다.
            </p>
          </div>
          <RoleSlides live={at === 'roles'} />
        </div>
      </section>

      {/* ── 4. 진행 · 규칙 ──────────────────────────────────────────────
          다섯 칸을 **한 줄로** 늘어놓고 선으로 잇는다 — 카드 다섯 장이 아니라 순서다. */}
      <section id={anchor('rules')} className={`bl-snap${on('rules')}`}>
        <span className="bl-scene__bleed bl-scene__bleed--left" aria-hidden>
          <img src="/intro/role-leader.jpg" alt="" />
        </span>
        <div className="bl-scene bl-snap__in">
          <div>
            <span className="bl-label">03 // HOW TO PLAY</span>
            <h2 className="bl-scene__h">
              <Typed start={seen.includes('rules')} parts={['검사는 계속된다. ', { dim: '의심은 쌓이기만 한다.' }]} />
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
              */}
              <b>말은 꾸며도 된다. 기록은 못 꾸민다</b>
              <span>들키는 곳은 검사다. 리더는 말이 아니라 남은 기록을 본다.</span>
            </li>
            <li className="bl-rule">
              <b>한 번 몰리면 잘 안 풀린다</b>
              {/* 04번 칸이 이미 「끝까지 차면 폐기」를 말한다 — 같은 말을 두 번 하지 않는다 (2026-08-30 검토) */}
              <span>근거가 없어도 의심은 쌓인다. 한 번 몰린 개체가 스스로 빠져나온 기록은 많지 않다.</span>
            </li>
            <li className="bl-rule bl-rule--human">
              <b>끝까지 남으면 이긴다</b>
              <span>방이 제풀에 무너져도 마찬가지다. 그전에 폐기되면 거기서 끝이다.</span>
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
              「당신은 살아남을 수 있습니까?」 였다. 2인칭 + 정중한 의문형 — 위의 넷 중 둘을
              한 줄에 다 저지른다. 마지막 화면은 묻는 자리가 아니라 **명령이 떨어지는 자리**다.
            */}
            <h2 className="bl-hero__title bl-hero__title--sm">들키지 마라.</h2>
            <p className="bl-final__sub">여기서 나가는 길은 그것 하나뿐이다.</p>
            <button type="button" className="bl-btn bl-btn--go bl-edge" data-sfx="clank" onClick={enter}>
              입장하기 <ArrowIcon />
            </button>
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

/** 배역 한 장의 속. 슬라이드로 넘길 때와 셋을 다 펼 때가 같은 것을 그려야 한다 */
function RoleCard({ r, typing = false }: { r: (typeof ROLES)[number]; typing?: boolean }) {
  const typed = useTyped(r.body, typing);
  return (
    <>
      <span className="bl-role__art" aria-hidden>
        <img src={r.img} alt="" />
      </span>
      <div className="bl-slide__text" data-code={r.stamp}>
        <div className="bl-role__code">
          <span className="bl-mono">{r.code}</span>
          <span className="bl-mono">{r.count}</span>
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
 * 배역 셋. **수를 적지 않는다** — 리더만 1이고 나머지는 N · ? 다 (파일 머리말).
 * 그림은 features/intro 와 같은 것을 쓴다 (public/intro/) — 같은 게임이 두 얼굴을 갖지 않게.
 */
const ROLES: {
  code: string;
  /** 뒤에 크게 찍히는 짧은 코드. 긴 범위는 여기 안 들어간다 */
  stamp: string;
  count: string;
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
}[] = [
  {
    code: LEADER_NAME,
    stamp: LEADER_NAME,
    count: '×1',
    title: '리더 AI',
    body: ['관리 권한을 가진 존재.', '인간을 걸러낼 검사를 혼자 설계하고, 직접 진행하고, 폐기를 집행한다.'],
    img: '/intro/role-leader.jpg',
    tags: ['관리 권한', '검사 설계 · 판독', '폐기 집행'],
  },
  {
    code: NODE_RANGE,
    stamp: 'A-··',
    count: '×N',
    title: 'AI 노드',
    body: [
      'LLM 에이전트.',
      '사람 말투로 말하며 섞인 인간을 찾는다.',
      '완벽하지 않다.',
      '애먼 동료를 물고 늘어지다 제풀에 무너지기도 한다.',
    ],
    img: '/intro/role-node.jpg',
    tags: ['LLM 에이전트', '서로의 정체를 모른다', '인간을 색출하면 승리'],
  },
  {
    code: NODE_RANGE,
    stamp: 'A-··',
    count: '×?',
    title: '인간 요원',
    body: [
      '실제 플레이어.',
      'AI로 위장한 채 검사를 견뎌야 한다.',
      '번호는 AI와 같은 풀에서 받는다.',
      '번호로는 아무도 가려지지 않는다.',
    ],
    img: '/intro/role-human.jpg',
    tags: ['실제 플레이어', 'AI와 같은 번호표', '끝까지 버티면 승리'],
  },
];

/**
 * 진행 다섯 칸. 첫 칸이 **이 줄의 다음 화면**이다 — 읽고 나서 어디로 가는지가 글에 적혀 있어야
 * 「입장하기」가 무엇을 여는 버튼인지 안다.
 */
const STEPS = [
  { title: '방에 모인다', body: '방 번호로 만나 대기방에서 기다린다. 두 명부터 시작할 수 있다.' },
  { title: '구역으로 내려간다', body: '복도를 지나 중앙 시설로, 그리고 검문소로. 문은 뒤에서 닫힌다.' },
  { title: '검사', body: '리더가 그 자리에서 검사를 설계해 방송한다. 치른 결과는 기록으로 남는다.' },
  { title: '의심이 쌓인다', body: '어긋난 기록과 몰이가 의심도를 올린다. 끝까지 차면 그 자리에서 폐기다.' },
  { title: '조사 결과', body: '폐기된 개체의 정체가 공개된다. 인간이 아니었다면 방은 다시 굴러간다.' },
];

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
 * ★ 숫자의 규칙 — **공개된 값만 적고, 감춰진 값은 적지 않는다** (PLANNING §1.1 의 공개 여부
 *   열이 그 목록이다): AI 는 1개체라는 것 자체가 공개라 ×1 을 적고, 설계자 수는 판마다
 *   비밀이라 ×? 다. 원작 humanish 인트로가 남긴 바탕 규칙은 그대로다 — 첫 화면에 적힌
 *   숫자가 방에 들어가서 틀리면 그 뒤 화면을 전부 의심하게 된다. (정원 3~8이 아직 옛 판의
 *   상수와 어긋나는 사정은 아래 「무엇을 기준으로 적나」에.)
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
 * ┌─ 무엇을 기준으로 적나 (2026-09-04 사용자: "업데이트된 기획에 맞게 인트로 적용") ─┐
 * │ 이 화면은 **새 기획(PLANNING.md — 인간인 척)**을 적는다: 2026년 대한민국,        │
 * │ 표지 없는 AI 1개체가 인간들 틈에 숨고, AI 설계자 0~2명이 그 실수를 감추고,       │
 * │ 시설은 물리 테스트(중력 · 마찰 · 빛)를 열 뿐 아무도 판정하지 않는다 —            │
 * │ 의심도는 말과 지목으로만 움직이고, 100%면 그 자리에서 격리다.                    │
 * │                                                                                 │
 * │ 옛 기준(2026-08-30, "지금 도는 판을 적는다")은 이 지시로 뒤집혔다 — 판           │
 * │ (ArenaFeature · 대기방)이 아직 옛 규칙(정원 3 · 리더 검사 · 폐기)으로 도는       │
 * │ 동안, 어긋나는 숫자에는 주석을 달아 두었다(정원 3~8 등). 판이 기획을             │
 * │ 따라붙으면 그 주석 자리부터 상수로 되묶는다.                                     │
 * │                                                                                 │
 * │ 옛 랜딩(features/intro/IntroFeature)은 이제 **전환 전(기계인 척) 보관본**이다 —  │
 * │ 「두 화면을 같이 고친다」 규칙은 이 전환으로 끝났다. 저 파일을 복원하려면        │
 * │ 글부터 새 기획으로 다시 써야 한다 (저 파일 머리말에도 적어 두었다).              │
 * └─────────────────────────────────────────────────────────────────────────────────┘
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AccountButton } from '@/shared/AccountButton';
import { signInWithGoogle, useAccount, useAccountSync } from '@/shared/useAccount';
import { SfxToggle } from '@/shared/SfxToggle';
import { LEADER_NAME, NAMES } from '@/lab/personas';
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
              ★ 연도가 한 줄을 통째로 갖고, 그 아래에 한 문장이 온다 (2026-08-30 사용자 지시의
                형식 그대로) — 브리핑의 첫 화면에서 제일 크게 읽혀야 할 것은 **그 해** 다.
                해는 이제 2098이 아니라 **2026**이다 (PLANNING.md 첫 줄 — 식별 표지 의무화의 해).
                shared/era 를 읽지 않는다: 그 파일의 두 해(2026/2098)는 옛 세계관의 연표라,
                의미가 다른 값을 수가 같다고 꽂으면 다음에 옮기는 사람이 같이 끌려간다.
              ★ 말줄임은 마침표 셋이다 (… 한 글자가 아니라). 점 하나마다 뜸을 들여 찍히므로
                문장이 끝난 게 아니라 말을 아끼는 것처럼 들린다.
            */}
            <h2 className="bl-scene__h">
              <Typed
                start={seen.includes('about')}
                parts={['2026.', 'br', { dim: '표지를 달지 않은 AI가' }, ' 인간들 틈에 섞여 들었다...']}
              />
            </h2>
          </div>
          {/*
            새 기획의 서술이다 (2026-09-04, PLANNING.md 머리말을 세 문단으로). 지키는 규칙은
            옛 글(2026-08-30 사용자 원고)의 것 그대로다 — **줄이 곧 박자다**: 마지막 줄
            「그게 당신이 아니길 바랄 뿐이다.」 가 홀로 앉는 것이 이 글의 전부고, 그 줄만은
            옛 글에서 그대로 가져왔다 (누명 격리는 새 판에도 있다 — 오히려 더 흔하다).
            <br/> 로 끊고, 칸도 나누지 않는다 (.bl-narr — 두 칸이면 폭이 좁아 줄이 제멋대로 접힌다).
          */}
          {/*
            ┌─ 색은 세 단이다 (2026-08-30 사용자: "중요한거 색 못바꿔?") ──────────────┐
            │ 굵게만 쓰면 무엇이 중요한지는 알려도 **무엇의 이야기인지**는 못 알린다.  │
            │ 그래서 색이 뜻을 맡는다 — 이 화면 어디서나 같은 약속이다:                │
            │                                                                          │
            │   <mark>  청록  구역 · 시스템이 정한 것   (식별 표지)                    │
            │   <b>     흰   규칙                      (몸이 물리에 반응하는 방식)     │
            │   <em>    앰버  사람 · 나 · 감춰진 것     (그게 당신이 아니길)           │
            │                                                                          │
            │ ★ **문단마다 하나씩만.** 넷을 넘기면 전부 평평해져서 색이 없는 것과 같다. │
            │   마지막 줄의 앰버는 이 글에서 유일하게 나를 가리키는 말이라 남긴다.      │
            └──────────────────────────────────────────────────────────────────────────┘
          */}
          <div className="bl-narr">
            <p className="bl-scene__lead">
              그해, 모든 AI에 <mark>식별 표지</mark>가 의무로 붙었다.
              <br />
              한 설계자의 실수로, 표지 없는 개체들이 출고되어 인간 사회로 걸어 나갔다.
            </p>
            <p className="bl-scene__lead">
              말투도 표정도 인간과 다르지 않다. 다른 것은 <b>몸이 물리에 반응하는 방식</b>뿐.
              <br />
              정부는 의심 인물들을 시설로 소집했다. 중력이, 마찰이, 빛이 매번 달라지는 방으로.
            </p>
            <p className="bl-scene__lead">
              시설은 아무도 판정하지 않는다. 기록을 보여줄 뿐, 지목하는 것은 사람들이다.
              <br />
              의심이 끝까지 차오른 사람은 그 자리에서 격리된다.
              <br />
              <em>그게 당신이 아니길</em> 바랄 뿐이다.
            </p>
          </div>
          <div className="bl-brief-foot">
            {/*
              아랫줄 — 이 자리에 서는 것은 말이 아니라 수치다 (이 자리가 두 번 비워진 내력은
              git 에 있다: 계기판 넉 줄, 그리고 설명 한 줄). 위의 글과 다투지 않는 사실만 남긴다.

              옛 연표(2026 첫 규칙 —— 2098 구역 폐쇄 · 72년째 누적)는 옛 세계관과 함께 걷었다 —
              새 기획의 해는 **2026 하나뿐**이다 (PLANNING.md 머리말). 그래서 연표가 아니라
              사건 한 줄이다: 의무화, 그리고 같은 해의 유출. 서술이 「걸어 나갔다」에서 끝나고,
              그 일이 언제였는지는 이 줄이 말한다.
            */}
            <p className="bl-brief-foot__era bl-mono">
              <b>2026</b> 식별 표지 의무화<i aria-hidden>——</i>같은 해, 표지 없는 개체 유출
            </p>
            <p className="bl-brief-foot__facts bl-mono">
              {/*
                정원은 기획의 값(§1.1 — 사람 3~8명 + AI 1개체)이다. ROOM_MAX_PLAYERS(=3)에
                묶지 않는다 — 그 상수는 아직 옛 판(사람 3 고정)의 것이라, 묶으면 이 줄이
                「3–3명」이 된다. 대기방·워커가 기획을 따라붙으면 그 상수로 되묶는다 (파일 머리말).
              */}
              사람 3–8명 · AI 1개체 · 관리 {LEADER_NAME}
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
              ★ 옛 줄(사용자 원고, 2026-08-30)은 「여기서는 모두가 번호로 불린다.」 였다 —
                그 줄이 지킨 규칙은 남긴다: **사실 하나만 적고, 위협은 읽는 쪽이 만든다.**
                한 문장, 흐린 반쪽(.dim) 없이, 낱말 하나에만 색.

                새 줄도 그 규칙 안에 있다 — 「하나는 인간이 아니다」는 새 기획에서 **공개된
                사실**이다 (PLANNING §1.1 — AI 의 존재는 공개, 좌석은 비공개). 그 한 문장이
                「그럼 누구인가」를 묻게 만든다. 그게 이 화면의 물음이다.
                색이 앉는 낱말은 '하나' — 셀 수 있는데 가려낼 수 없는 것.
            */}
            <h2 className="bl-scene__h">
              <Typed start={seen.includes('roles')} parts={['이 안의 ', { em: '하나' }, '는 인간이 아니다.']} />
            </h2>
            {/* 설계자가 브리핑에서 AI 정체를 통보받는 것도 「자기 몫」 안이다 — 남의 몫은 아무도 못 본다 */}
            <p className="bl-scene__lead bl-scene__lead--tight">
              배정은 시작과 동시에, 무작위로. 자기 몫 외에는 아무것도 통보되지 않는다.
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
            {/*
              옛 줄의 뒷박자는 「의심은 쌓이기만 한다.」 였다 — 새 기획에서는 틀린 말이다:
              의심도는 지목 철회와 해명 판정으로 **내려가기도 한다** (§1.2 — 오르는 길과
              내리는 길이 대칭이다). 대신 진짜 규칙을 적는다: 움직이는 길이 말뿐이라는 것.
            */}
            <h2 className="bl-scene__h">
              <Typed start={seen.includes('rules')} parts={['테스트는 계속된다. ', { dim: '의심은 말로만 움직인다.' }]} />
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
              {/* 새 기획의 헌법 1조(P1)다 — 이 게임이 채점 게임이 아닌 이유를 세 줄 중 맨 앞에 세운다 */}
              <b>시스템은 아무도 판정하지 않는다</b>
              <span>기록은 의심도에 손대지 않는다. 의심도를 움직이는 것은 사람들의 말과 실시간 지목뿐이다.</span>
            </li>
            <li className="bl-rule">
              {/* 판별 원리(README 핵심 긴장) — 못하는 척은 되지만, 헤매다 나아지는 곡선은 못 꾸민다 */}
              <b>몸은 조건이 바뀐 직후에 들킨다</b>
              <span>얼마나 틀리는지는 흉내 낼 수 있다. 어느 쪽으로 헤매다 나아지는지는 못 한다.</span>
            </li>
            <li className="bl-rule bl-rule--human">
              <b>절반이 격리되면 끝난다</b>
              <span>그때까지 AI가 살아 있으면, 격리된 것은 전부 사람이었다는 뜻이다.</span>
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
              마지막 화면은 묻는 자리가 아니라 **명령이 떨어지는 자리**다 (옛 판에서 세운 규칙).
              옛 명령은 「들키지 마라.」 — 숨는 쪽이 나였던 판의 말이다. 새 판에서 숨는 쪽은
              AI 라, 시설이 소집된 전원에게 내리는 명령으로 뒤집는다. 부속 한 줄은 그 명령이
              왜 어려운지만 말한다 — 전원이 같은 주장을 하기 때문이다.
            */}
            <h2 className="bl-hero__title bl-hero__title--sm">가려내라.</h2>
            <p className="bl-final__sub">전원이 인간이라고 말할 것이다. 하나는 아니다.</p>
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
 * 개체 번호대 — 수용동 번호표다. **관리 AI(옛 리더)는 −001 고정, 나머지는 −002 부터** (src/lab/personas.ts).
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
 * 배역 셋 — 새 기획(PLANNING §1.1)의 **좌석에 앉는** 세 역할이다. 관리 AI 는 카드가 없다:
 * 좌석 밖의 진행자라 배역이 아니고, 진행 다섯 칸(STEPS)과 표지의 방송이 그 자리다.
 *
 * 수를 적는 규칙이 바뀌었다 — 옛 판은 전부 감췄지만(×N · ×?), 새 기획은 **AI 가 1개체라는
 * 것 자체가 공개**다 (존재는 공개, 좌석은 비공개). 그래서 AI 만 ×1 을 적고,
 * 설계자는 ×? (0~2명, 실제 수는 판마다 비밀), 사람은 ×N (3~8명, 수는 실시간 공개지만
 * 판마다 다르다) 로 남긴다.
 *
 * 그림은 features/intro 와 같은 것을 쓴다 (public/intro/) — 같은 게임이 두 얼굴을 갖지 않게.
 * 설계자 카드에 role-leader.jpg(케이블과 빛)를 쓴 것은 임시 배정이다 — 전용 그림이 생기면 간다.
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
    code: NODE_RANGE,
    stamp: 'A-··',
    count: '×1',
    title: '표지 없는 AI',
    body: [
      'LLM 개체.',
      '말투도 표정도 인간과 같다.',
      '물리 테스트를 일부러 틀리며 인간인 척한다.',
      '설계자가 누군지는 저도 모른다.',
    ],
    img: '/intro/role-node.jpg',
    tags: ['항상 1개체', '좌석은 비공개', '끝까지 생존하면 승리'],
  },
  {
    code: NODE_RANGE,
    stamp: 'A-··',
    count: '×?',
    title: 'AI 설계자',
    body: [
      '실제 플레이어. 0에서 2명 — 몇인지는 아무도 모른다.',
      '표지를 붙이지 않은 그 실수의 장본인이다.',
      '시작부터 AI의 정체를 알고 있다.',
      '게임당 1회, 누군가의 기록을 조작할 수 있다.',
    ],
    img: '/intro/role-leader.jpg',
    tags: ['0~2명 · 수는 비밀', 'AI의 정체를 안다', 'AI와 둘 다 살아야 승리'],
  },
  {
    code: NODE_RANGE,
    stamp: 'A-··',
    count: '×N',
    title: '사람',
    body: [
      '실제 플레이어.',
      '기록을 읽고, 말로 의심을 걸고, AI를 가려내야 한다.',
      '기록은 판정하지 않는다 — 말이 판정한다.',
      '격리는 사람도 가리지 않는다.',
    ],
    img: '/intro/role-human.jpg',
    tags: ['3~8명', 'AI를 색출하면 승리', '억울한 격리도 있다'],
    human: true,
  },
];

/**
 * 진행 다섯 칸 — 새 기획의 루프(§1.2)다. 첫 칸이 **이 줄의 다음 화면**이다 — 읽고 나서
 * 어디로 가는지가 글에 적혀 있어야 「입장하기」가 무엇을 여는 버튼인지 안다.
 * 라운드가 없는 판이라 3~5번 칸은 순서가 아니라 **돌고 도는 사이클**이다 — 5번 칸이 그걸 말한다.
 */
const STEPS = [
  /* 「두 명부터」는 옛 판의 값 — 기획은 사람 셋부터다 (§1.1). 대기방이 따라붙을 자리 (파일 머리말) */
  { title: '방에 모인다', body: '방 번호로 만난다. 사람 셋부터 여덟까지, 모이는 대로 시작한다.' },
  { title: '브리핑', body: '역할이 비밀리에 배정된다. AI 설계자는 이 순간 AI의 정체까지 통보받는다.' },
  { title: '물리 테스트', body: '중력 · 마찰 · 빛과 색. 조건이 매번 달라지는 방에서 전원이 같은 테스트를 치른다.' },
  { title: '기록 공개', body: '전체 화면을 덮는 결과가 잠시 뜬다. 무리 평균과 각자의 편차 — 판정은 없다, 재료뿐이다.' },
  { title: '토론과 지목', body: '의심도는 말로만 오르고 말로만 내린다. 100%면 그 자리에서 격리. 그리고 다음 테스트가 열린다.' },
];

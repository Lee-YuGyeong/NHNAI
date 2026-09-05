/**
 * 인트로 — 영화 오프닝 프레임으로 열리고, 아래로 브리핑이 이어지는 랜딩. 「특수인공지능대응센터」
 *
 * 원작(humanish /intro)은 "Who is AI?" — 사람 8 속의 AI 하나를 찾는 판이었다.
 * 이 프로젝트는 진영을 뒤집은 속편이라(PLANNING.md), 인트로도 뒤집는다:
 * 뼈대는 원작과 같다 — 히어로 → 소개 → 배역 → 진행 → 마지막 CTA — 그러나
 * 네온 그린 대신 **차가운 틸 안개 + 앰버 하나**. 앰버는 '인간'과 주 CTA 에만 붙는다.
 *
 * 흐름: 입장하기 → /main (로비: 닉네임 → 방). 내비·규칙 보기 → 해당 구간으로 스크롤.
 * 상태는 하나 — 지금 보이는 구간(introSlice.section). IntersectionObserver 가 갱신하고
 * 내비가 그걸 읽어 활성 표시를 한다. 나머지는 전부 정적이다.
 *
 * 디자인 원본: uxpilot Bj09icCPuKt4sK6qVlCx (Tailwind 였던 것을 intro.css 로 옮김).
 * 그림은 public/intro/ — 생성 URL 은 만료되므로 내려받아 둔다.
 *
 * ┌─ 글은 PLANNING.md 개정판을 따른다 (2026-09-04, 사용자 지시: "기획서에 맞게 intro 부분   ┐
 * │ 꾸며줘") ──────────────────────────────────────────────────────────────────────────────  │
 * │ 이 화면이 실제로 걸린 라우트는 이제 features/lobby/Intro.tsx(/intro)다 — 이 파일은      │
 * │ 경로를 잃었지만(features/index.ts) 문서화된 대로 "고칠 일이 있으면 두 화면을 같이       │
 * │ 고친다"를 지킨다. 옛 배역(리더 AI · AI 노드 ×5 · 인간 요원 ×3, 8석 고정, 3라운드)을      │
 * │ PLANNING §1의 새 구성(AI 1 고정 · AI 설계자 1~2 · 사람 3~8, 라운드 없이 연속 진행)으로   │
 * │ 다시 썼다. 새 이미지 role-ai.jpg · role-designer.jpg 는 lobby/Intro.tsx 와 같은 것을     │
 * │ 쓴다(public/intro/) — 같은 게임이 두 얼굴을 갖지 않게.                                   │
 * └────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 2026-09-05: 수를 상수에 잇는다 ("지금까지 git에 올라온 내용으로 인트로 내용 적용해줘")┐
 * │ 이 화면이 말하던 판(60~90초마다 정지선·색 사냥 중 하나 · 7~9분 · 넷이 앉아 둘이 나간다) │
 * │ 은 어느 커밋에도 없는 판이었다. 실제로 도는 것은 **고정 차례표**다(bde946a):            │
 * │ 배역 통보 → 대화 40초 ⇄ 시험 30초 × 3 (낙하 생존 → 발판 → 원판) → 대화 40초.           │
 * │                                                                                        │
 * │ ★ 그래서 이제 **수를 손으로 안 적는다** — lobby/Intro.tsx 가 지키던 규칙을 이 파일도    │
 * │   따른다. 인원 · 길이 · 횟수가 전부 world/mp/game-protocol 에서 오므로, 차례표 한 줄을  │
 * │   고치면 두 화면이 같이 따라간다. 어긋난 이유가 바로 「손으로 적은 수」였다.            │
 * └────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
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
import { introActions, introSelectors, type IntroSection } from './introSlice';
import './intro.css';

/**
 * 한 판이 실제로 걸리는 시간 — 차례표를 그대로 더한다 (lobby/Intro.tsx 의 ROUND_MS 와 같은 셈).
 * 여기 「7–9 MIN」이 박혀 있었다: 차례표가 고정되기 전(bde946a)의 어림이었고, 실제로는 절반이다.
 */
const ROUND_MS =
  GAME_BRIEFING_MS +
  GAME_FIRST_DISCUSSION_MS +
  GAME_TEST_ORDER.length * (GAME_TEST_MS + GAME_RESULT_MODAL_MS + GAME_DISCUSSION_MS);

const NAV: { id: Exclude<IntroSection, 'hero'>; label: string }[] = [
  { id: 'about', label: '게임 소개' },
  { id: 'roles', label: '배역' },
  { id: 'rules', label: '규칙' },
];

/** 구간 앵커 — id 는 곧 IntroSection */
const anchor = (id: IntroSection) => `intro-${id}`;

function scrollTo(id: IntroSection) {
  document.getElementById(anchor(id))?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

export function IntroFeature() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const section = useAppSelector(introSelectors.selectSection);

  // 어느 구간이 보이는지 — 내비 활성 표시. 관찰자가 없는 환경(jsdom)에서는 그냥 hero 로 둔다
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const ids: IntroSection[] = ['hero', 'about', 'roles', 'rules'];
    const visible = new Map<IntroSection, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = ids.find((x) => anchor(x) === e.target.id);
          if (id) visible.set(id, e.isIntersecting ? e.intersectionRatio : 0);
        }
        let best: IntroSection = 'hero';
        let ratio = 0;
        for (const [id, r] of visible) if (r > ratio) { best = id; ratio = r; }
        if (ratio > 0) dispatch(introActions.setSection(best));
      },
      { threshold: [0.15, 0.35, 0.6] },
    );
    for (const id of ids) {
      const el = document.getElementById(anchor(id));
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [dispatch]);

  const enter = () => navigate('/main');

  return (
    <main className="intro">
      <nav className="intro-nav" aria-label="인트로">
        {/* 문패는 홀 끝벽 간판과 같은 글자다 (world/map/govcenter/layout.ts 의 TITLE) — 아래 제목과 한 말을 한다 */}
        <Link to="/" className="intro-brand">특수인공지능대응센터</Link>
        <div className="intro-nav-right">
          <div className="intro-nav-links">
            {NAV.map((n, i) => (
              <span key={n.id} style={{ display: 'contents' }}>
                {i > 0 && <span className="intro-dot" aria-hidden>·</span>}
                <button
                  type="button"
                  className="intro-nav-link"
                  aria-current={section === n.id ? 'true' : undefined}
                  onClick={() => scrollTo(n.id)}
                >
                  {n.label}
                </button>
              </span>
            ))}
          </div>
          <span className="intro-live">
            LIVE <span className="intro-dot" aria-hidden>·</span> CENTER <b>2026</b>
          </span>
        </div>
      </nav>

      {/* ── 1. 히어로 ─────────────────────────────────────────────────── */}
      <section id={anchor('hero')} className="intro-hero">
        <img className="intro-hero-bg" src="/intro/hero.jpg" alt="" aria-hidden />
        <div className="intro-layer intro-fog" />
        <div className="intro-layer intro-drift" />
        <div className="intro-layer intro-vignette" />
        <div className="intro-layer intro-grain" />

        <div className="intro-hero-body">
          <div className="intro-block">
            <span className="intro-tag">SOCIAL DEDUCTION&nbsp;&nbsp;//&nbsp;&nbsp;대한민국 정부</span>
            {/*
              제목은 이 게임의 배경 그 자체다 — 3D 홀 끝벽 간판(world/map/govcenter/layout.ts 의 TITLE,
              「대한민국 정부 특수인공지능대응센터」)과 같은 글자다. 랜딩이 곧 그 건물의 정면이 된다.
              앰버 형광펜은 「인간」에서 「인공지능」으로 옮겼다 — 이 판에서 표지가 붙어야 하는 쪽이다.
            */}
            <h1 className="intro-title">
              <span>
                특수<span className="intro-human">인공지능</span>
              </span>
              <span>대응센터</span>
            </h1>
            <p className="intro-sub">SPECIAL AI RESPONSE CENTER · THREE TESTS. ONE UNMARKED.</p>
            {/*
              세 줄은 판의 세 축이다 — 누가 앉나(§1.1) · 누가 판정하나(P1) · 언제 끝나나(§1.2).
              「넷이 앉는다 · 둘이 나가야 한다」였다: 그 넷은 /trial 의 TRIAL_PARTY_SIZE 였고
              검문소의 값이 아니었다. 여기 앉는 것은 사람 3~8 에 표식 없는 하나이고,
              모자란 자리를 채우는 것도 AI 좌석이 아니라 대역이다 (game/runtime.start).
              끝나는 조건도 「둘」이 아니라 차례표의 끝이다 — 세 번을 다 쓰고도 못 찾으면 진다.
            */}
            <ul className="intro-lines">
              <li>
                사람 {GAME_MIN_HUMANS}~{GAME_MAX_HUMANS}명, 그리고 표식 없는 하나. 빈자리는 대역이 채운다.
              </li>
              <li>센터는 기록만 내놓는다 — 아무도 판정하지 않는다.</li>
              <li>시험은 {GAME_TEST_ORDER.length}번뿐이다. 그때까지 못 찾으면 그쪽이 이긴다.</li>
            </ul>
            <div className="intro-cta">
              <button type="button" className="intro-btn intro-btn--primary" onClick={enter}>
                입장하기 <span aria-hidden>→</span>
              </button>
              <button type="button" className="intro-btn intro-btn--ghost" onClick={() => scrollTo('rules')}>
                규칙 보기
              </button>
            </div>
            <p className="intro-caption">NO SIGN-UP&nbsp;&nbsp;·&nbsp;&nbsp;브라우저에서 바로</p>
          </div>
        </div>

        <div className="intro-scroll" aria-hidden>
          <span>SCROLL</span>
          <span className="intro-scroll-line" />
        </div>
      </section>

      {/* ── 2. 브리핑 ─────────────────────────────────────────────────── */}
      <section id={anchor('about')} className="intro-section" aria-labelledby="intro-about-h">
        <div className="intro-layer intro-grid" />
        <div className="intro-layer intro-grain intro-grain--soft" />
        <div className="intro-wide intro-about">
          <div>
            <span className="intro-index">01 // BRIEFING</span>
            <h2 id="intro-about-h" className="intro-h2">
              2026. <span className="dim">표식 없는 개체가</span>
              <br />
              새어 나왔다.
            </h2>
            <p>
              대한민국 정부가 AI 식별 표식 부착을 의무화한 그해, 한 AI 설계자의 실수로 <b>표식이 붙지 않은
              휴머노이드 개체들</b>이 출고되어 인간 사회로 흘러들었다. 말투도 표정도 인간과 완벽히 같다 —
              다른 것은 몸이 물리 법칙에 반응하는 방식뿐이다.
            </p>
            <p>
              정부는 의심 인물들을 비밀 시설로 소집한다. 시설이 여는 물리 테스트는 <b>세 번</b>이고 종류도
              순서도 정해져 있다 — 낙하 생존, 움직이는 발판, 회전 원판. 숨기는 것은 종목이 아니라 <b>조건</b>이다:
              중력과 마찰이 시험 도중에 말없이 한 번 바뀐다. <q>시스템은 아무도 판정하지 않는다</q> — 기록을
              보여줄 뿐, 의심도를 움직이는 것은 사람들의 말과 실시간 지목뿐이다. 안에서는 아무도 서로의 정체를
              모른다. AI도, 사람도, 시스템 자신도. 그래서 애먼 사람이 먼저 격리되기도 한다. 당신이 아니길 바랄
              뿐이다.
            </p>
          </div>
          <div className="intro-dossier">
            <div className="intro-dossier-head">DOSSIER // FACILITY 2026</div>
            <ul className="intro-stats">
              <li>
                <small>AI</small>
                <strong>1</strong>
              </li>
              <li>
                <small>PLAYERS</small>
                <strong>
                  <span className="human">
                    {GAME_MIN_HUMANS}–{GAME_MAX_HUMANS}
                  </span>
                </strong>
              </li>
              <li>
                {/* 설계자 수는 사람 수가 정한다 (roles.designerCount: 3~5명→1 · 6~8명→2) */}
                <small>DESIGNERS</small>
                <strong>1–2</strong>
              </li>
              <li>
                {/* 「7–9 MIN」이었다 — 차례표가 고정되기 전의 어림이다. 이제 더하기로 나온다(ROUND_MS) */}
                <small>RUNTIME</small>
                <strong>
                  {Math.floor(ROUND_MS / 60_000)}:{String(Math.round((ROUND_MS % 60_000) / 1000)).padStart(2, '0')}
                </strong>
              </li>
            </ul>
            {/*
              옛 연혁(2026 첫 규칙 —— 2098 구역 폐쇄 · 72년째 누적)은 "규정은 늘기만 하고
              줄지 않는다"는 옛 기획의 규칙 그 자체였다. 이 판엔 72년짜리 신화가 없다 —
              사건은 2026년 하루다. 대신 같은 자리에, 같은 모양의 규칙 하나를 적는다:
              의심도도 시간으로는 안 내려간다, 오직 대화로만 풀린다(PLANNING §1.2).
            */}
            <ol className="intro-origin">
              <li>
                {/*
                  「60–90s · 테스트 트리거」였다 — 관리 AI 가 종목과 시점을 고르던 시절의 값이다.
                  그 설계는 접혔고(bde946a) 지금은 차례표 한 줄이 정한다: 대화 ⇄ 시험이 번갈아 세 번.
                */}
                <span>
                  {GAME_DISCUSSION_MS / 1000}s ⇄ {GAME_TEST_MS / 1000}s
                </span>
                <b>고정 차례표 ×{GAME_TEST_ORDER.length}</b>
                <small>무엇이 몇 번째인지 모두가 알고 들어온다</small>
              </li>
              <li className="now">
                <span>100%</span>
                <b>의심도 격리선</b>
                <small>닿는 즉시, 다음 테스트를 기다리지 않는다</small>
              </li>
            </ol>
            <div className="intro-status">
              <span>STATUS</span>
              <span className="intro-track" />
              <b>ACTIVE</b>
            </div>
          </div>
        </div>
      </section>

      <div className="intro-divider" />

      {/* ── 3. 배역 ───────────────────────────────────────────────────── */}
      <section id={anchor('roles')} className="intro-section" aria-labelledby="intro-roles-h">
        <div className="intro-wide">
          <div className="intro-roles-head">
            <div>
              <span className="intro-index">02 // ROLES</span>
              <h2 id="intro-roles-h" className="intro-h2">
                가변 인원, <span className="dim">세 종류. 관리 AI는 그중이 아니다.</span>
              </h2>
            </div>
            <p>
              배역은 게임을 시작하는 순간 다시 섞인다. 사람들 틈에는 AI 설계자가 섞여 있지만, 그게 누구인지는
              아무도 모른다.
            </p>
          </div>
          <ul className="intro-roles">
            <li className="intro-role">
              <img className="intro-role-img" src="/intro/role-ai.jpg" alt="AI — 인간과 구별되지 않는 얼굴, 목에 가느다란 이음매 선" />
              <div className="intro-role-code">
                <span>A-··</span>
                <span>×1</span>
              </div>
              <h3>AI</h3>
              <p>표식 없이 출고된 유일한 개체. 말투도 표정도 인간과 다르지 않다. 다른 건 몸이 물리 법칙에 반응하는 방식뿐.</p>
              <ul>
                <li>자기 자신만 안다</li>
                <li>몸으로 드러난다</li>
                <li>격리되지 않으면 승리</li>
              </ul>
            </li>
            <li className="intro-role">
              {/*
                2026-09-05 09:21 에 image/spy.png(도면 벽 앞 후드 실루엣)로 갈았다가, 같은 날 09:25
                사용자가 준 새 그림(안경 쓴 연구원)으로 다시 갈았다 — lobby/Intro.tsx 의 ROLES 머리말.
                파일 이름은 role-designer.jpg 그대로: 두 인트로 화면이 같은 자리를 보므로
                그림만 갈아 끼우면 둘이 같이 바뀐다.
              */}
              <img
                className="intro-role-img"
                src="/intro/role-designer.jpg"
                alt="AI 설계자 — 안경을 쓴 연구원이 손으로 입을 가린 채 고민한다"
              />
              <div className="intro-role-code">
                <span>A-··</span>
                <span>×?</span>
              </div>
              <h3>AI 설계자</h3>
              <p>표식을 붙이지 않은 걸 들켜서는 안 되는 조력자. AI의 정체를 시작부터 정확히 안다. 판당 한 번, 기록을 조작할 수 있다.</p>
              <ul>
                <li>누구인지는 비공개</li>
                <li>AI의 정체를 안다</li>
                <li>기록 조작 1회</li>
              </ul>
            </li>
            <li className="intro-role intro-role--human">
              <img className="intro-role-img" src="/intro/role-human.jpg" alt="사람 — 전투복 차림의 굳은 얼굴" />
              <div className="intro-role-code">
                <span>A-··</span>
                <span>×?</span>
              </div>
              <h3>사람</h3>
              <p>실제 플레이어 대다수. 자신이 사람이라는 것만 안다. 몸은 못 속여도 말은 속을 수 있다.</p>
              <ul>
                <li>실제 플레이어</li>
                <li>시스템은 판정하지 않는다</li>
                <li>AI가 격리되면 승리</li>
              </ul>
            </li>
          </ul>
        </div>
      </section>

      <div className="intro-divider" />

      {/* ── 4. 진행 · 규칙 ────────────────────────────────────────────── */}
      <section id={anchor('rules')} className="intro-section" aria-labelledby="intro-rules-h">
        <div className="intro-layer intro-grid" style={{ opacity: 0.3 }} />
        <div className="intro-layer intro-grain intro-grain--soft" />
        <div className="intro-wide">
          <div className="intro-steps-head">
            <span className="intro-index">03 // HOW TO PLAY</span>
            {/* 뒷박자 「쌓이기만 한다」는 새 기획과 모순이다(§1.2 상승·하강 대칭) — 라이브 인트로와
                같은 이유로 맞춘다(2026-09-04 절충). 앞박자 「시행은 계속된다」도 차례표가 고정되면서
                (bde946a) 틀린 말이 됐다 — 시험에는 끝이 있고, 그 끝이 곧 AI 의 승리 조건이다 */}
            <h2 id="intro-rules-h" className="intro-h2">
              시험은 {GAME_TEST_ORDER.length}번뿐이다. <span className="dim">의심은 말로만 움직인다.</span>
            </h2>
          </div>
          <ol className="intro-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="intro-step">
                <span className="intro-step-node" aria-hidden />
                <span className="intro-step-no">{String(i + 1).padStart(2, '0')}</span>
                <h4>{s.title}</h4>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
          <ul className="intro-rules">
            <li className="intro-rule">
              <b>몸은 못 속인다</b>
              <span>테스트 조건값은 절대 공개되지 않는다. 관리 AI는 판정하지 않고 기록만 공개한다.</span>
            </li>
            <li className="intro-rule">
              <b>의심은 저절로 안 풀린다</b>
              <span>시간이 지나도 안 내려간다. 지목 철회와 해명 — 오직 대화뿐이다.</span>
            </li>
            <li className="intro-rule intro-rule--human">
              <b>AI가 잡히면 이긴다</b>
              <span>방이 저희끼리 무너져도 마찬가지다. 그전에 격리되면 거기서 끝이다.</span>
            </li>
          </ul>
        </div>
      </section>

      {/* ── 5. 마지막 CTA ─────────────────────────────────────────────── */}
      <section className="intro-final" aria-label="입장">
        <img className="intro-final-bg" src="/intro/eye.jpg" alt="" aria-hidden />
        <div className="intro-layer intro-final-shade" />
        <div className="intro-layer intro-vignette" />
        <div className="intro-layer intro-grain" />
        <div className="intro-final-body">
          <div className="intro-final-label">FINAL BRIEFING</div>
          <h2>
            <span>당신 옆에 있는,</span>
            <span>정말 사람입니까?</span>
          </h2>
          <button type="button" className="intro-btn intro-btn--primary intro-btn--big" onClick={enter}>
            입장하기 <span aria-hidden>→</span>
          </button>
        </div>
        <footer className="intro-footer">
          <span>SPECIAL AI RESPONSE CENTER · EP.01</span>
          <span>SEOUL, KR</span>
          {/*
            옛 연표(shared/era, ORIGIN_YEAR/ZONE_YEAR)는 72년짜리 신화였다 — 이 판은 사건이
            일어난 그해, 2026년 하루라 그 상수를 안 쓴다(ZONE_YEAR=2098 은 이 판의 "지금"이
            아니다). 그래서 여기 2026은 상수가 아니라 그대로 적는다.

            서명도 같은 이유로 바뀐다 — SECTOR AUTHORITY 는 AI 전용 구역(2098)을 운영하던
            옛 기관이다. 이 판을 여는 것은 대한민국 정부다 (홀 간판의 TITLE 과 같은 주체).
          */}
          <span>© 2026 대한민국 정부</span>
        </footer>
      </section>
    </main>
  );
}

/*
 * 진행 순서 — README/PLANNING 의 흐름을 다섯 칸으로. **수는 손으로 안 적는다**(2026-09-05):
 * 전부 game-protocol 의 상수에서 오므로 차례표가 바뀌면 이 칸도 같이 따라간다.
 *
 * 옛 다섯 칸은 라운드제였다. PLANNING §1.2 개정으로 라운드 경계가 사라졌다 — 2~4번이
 * 순환(테스트 → 기록 공개 → 의심이 쌓인다)이고, 5번(격리)만 그 순환을 끊는 유일한 사건이다.
 * bde946a 로 그 순환에 **끝이 생겼다** — 딱 세 바퀴다. 경계가 돌아온 것은 아니다(대화도
 * 지목도 시험 중에 안 멈춘다). 다만 무한하지 않을 뿐이고, 그 끝이 AI 의 승리 조건이다.
 */
const STEPS = [
  {
    title: '입장 & 배치',
    body: `사람 ${GAME_MIN_HUMANS}~${GAME_MAX_HUMANS}명과 AI 1좌석이 뒤섞여 자리를 잡는다. 모자란 자리는 대역이 채우고, 그 사람들 틈에 AI 설계자가 섞인다.`,
  },
  {
    title: `물리 테스트 ×${GAME_TEST_ORDER.length}`,
    body: `대화 ${GAME_DISCUSSION_MS / 1000}초와 시험 ${GAME_TEST_MS / 1000}초가 번갈아 ${GAME_TEST_ORDER.length}번 — 낙하 생존 → 움직이는 발판 → 회전 원판. 순서는 공개고, 조건값은 공개되지 않는다.`,
  },
  {
    title: '기록 공개',
    body: `${GAME_RESULT_MODAL_MS / 1000}초 동안 전체 화면 결과 창이 뜬다. 무리 평균 대비 편차가 원자료 그대로 드러난다.`,
  },
  {
    title: '토론 & 지목',
    body: `시험이 끝날 때마다 ${GAME_DISCUSSION_MS / 1000}초. 지목 · 동조 · 몰이가 의심도를 올리고, 철회와 해명만이 내린다.`,
  },
  {
    title: '격리',
    body: '의심도 100%에 닿는 즉시 그 자리에서 격리된다 — 처형자가 쏜다. 누가 격리되든 판은 거기서 끝난다: AI 였으면 사람의 승리, 사람이었으면 AI 의 승리.',
  },
];

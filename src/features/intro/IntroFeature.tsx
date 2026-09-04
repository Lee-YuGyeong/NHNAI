/**
 * 인트로 — 영화 오프닝 프레임으로 열리고, 아래로 브리핑이 이어지는 랜딩. "누가 인간인가?"
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
 * │ PLANNING §1의 새 구성(AI 1 고정 · AI 설계자 0~2 · 사람 3~8, 라운드 없이 연속 진행)으로   │
 * │ 다시 썼다. 새 이미지 role-ai.jpg · role-designer.jpg 는 lobby/Intro.tsx 와 같은 것을     │
 * │ 쓴다(public/intro/) — 같은 게임이 두 얼굴을 갖지 않게.                                   │
 * └────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { introActions, introSelectors, type IntroSection } from './introSlice';
import './intro.css';

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
        <Link to="/" className="intro-brand">WHO IS HUMAN?</Link>
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
            LIVE <span className="intro-dot" aria-hidden>·</span> SECTOR <b>2098</b>
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
            <span className="intro-tag">SOCIAL DEDUCTION&nbsp;&nbsp;//&nbsp;&nbsp;EP.01</span>
            <h1 className="intro-title">
              <span>누가</span>
              <span>
                <span className="intro-human">인간</span>인가?
              </span>
            </h1>
            <p className="intro-sub">WHO IS HUMAN? ONE OF US NEVER WAS.</p>
            <ul className="intro-lines">
              <li>이 방의 대부분은 진짜 사람이다.</li>
              <li>표식 없는 무언가가 그 틈에 섞여 숨 쉬는 척한다.</li>
              <li>몸은 못 속인다. 말은 속일 수 있다.</li>
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
              정부는 의심 인물들을 비밀 시설로 소집한다. 시설은 주기적으로 중력 · 마찰 · 빛과 색이 매번 달라지는
              물리 테스트를 연다. <q>시스템은 아무도 판정하지 않는다</q> — 기록을 보여줄 뿐, 의심도를 움직이는
              것은 사람들의 말과 실시간 지목뿐이다. 안에서는 아무도 서로의 정체를 모른다. AI도, 사람도, 시스템
              자신도. 그래서 애먼 사람이 먼저 격리되기도 한다. 당신이 아니길 바랄 뿐이다.
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
                  <span className="human">3–8</span>
                </strong>
              </li>
              <li>
                <small>DESIGNERS</small>
                <strong>0–2</strong>
              </li>
              <li>
                <small>RUNTIME</small>
                <strong>
                  7–9<span className="unit"> MIN</span>
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
                <span>60–90s</span>
                <b>테스트 트리거</b>
                <small>물리 테스트가 새로 열리는 간격</small>
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
              배역은 게임을 시작하는 순간 다시 섞인다. 사람 수만 실시간으로 보일 뿐, 그 안에 설계자가 몇 있는지는
              아무도 모른다.
            </p>
          </div>
          <ul className="intro-roles">
            <li className="intro-role">
              <img className="intro-role-img" src="/intro/role-ai.jpg" alt="AI — 인간과 구별되지 않는 차가운 얼굴" />
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
              <img className="intro-role-img" src="/intro/role-designer.jpg" alt="AI 설계자 — 어둠 속에서 단말을 조작하는 손" />
              <div className="intro-role-code">
                <span>A-··</span>
                <span>×?</span>
              </div>
              <h3>AI 설계자</h3>
              <p>표식을 붙이지 않은 걸 들켜서는 안 되는 조력자. AI의 정체를 시작부터 정확히 안다. 판당 한 번, 기록을 조작할 수 있다.</p>
              <ul>
                <li>존재 자체가 비공개</li>
                <li>AI의 정체를 안다</li>
                <li>기록 조작 1회</li>
              </ul>
            </li>
            <li className="intro-role intro-role--human">
              <img className="intro-role-img" src="/intro/role-human.jpg" alt="사람 — 앰버 빛에 반쯤 드러난 얼굴, 조용히 하라는 손짓" />
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
                같은 이유로 맞춘다(2026-09-04 절충). 앞박자는 그대로 — 시험의 region 이름이 그걸 본다 */}
            <h2 id="intro-rules-h" className="intro-h2">
              시행은 계속된다. <span className="dim">의심은 말로만 움직인다.</span>
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
          <span>WHO IS HUMAN? · EP.01</span>
          <span>SEOUL, KR</span>
          {/*
            옛 연표(shared/era, ORIGIN_YEAR/ZONE_YEAR)는 72년짜리 신화였다 — 이 판은 사건이
            일어난 그해, 2026년 하루라 그 상수를 안 쓴다(ZONE_YEAR=2098 은 이 판의 "지금"이
            아니다). 그래서 여기 2026은 상수가 아니라 그대로 적는다.
          */}
          <span>© 2026 SECTOR AUTHORITY</span>
        </footer>
      </section>
    </main>
  );
}

/*
 * 진행 순서 — README/PLANNING 의 흐름을 다섯 칸으로 (숫자를 바꾸면 거기도 같이).
 * 옛 다섯 칸은 라운드제였다. PLANNING §1.2 개정으로 라운드 경계가 사라졌다 — 2~4번이
 * 순환(테스트 → 기록 공개 → 의심이 쌓인다)이고, 5번(격리)만 그 순환을 끊는 유일한 사건이다.
 */
const STEPS = [
  { title: '입장 & 배치', body: '사람 3~8명과 AI 1개체가 뒤섞여 자리를 잡는다. 설계자가 몇 있는지는 아무도 모른다.' },
  { title: '물리 테스트', body: '60~90초마다 낙하 생존 · 정지선 · 색 사냥 중 하나가 열린다. 조건값은 공개되지 않는다.' },
  { title: '기록 공개', body: '전체 화면 결과 창이 뜬다. 무리 평균 대비 편차가 원자료 그대로 드러난다.' },
  { title: '토론 & 지목', body: '지목 · 동조 · 몰이가 의심도를 올린다. 철회와 해명만이 내린다.' },
  { title: '격리', body: '의심도 100%에 닿는 즉시 격리된다. 총원의 절반이 격리되면 그 자리에서 끝난다.' },
];

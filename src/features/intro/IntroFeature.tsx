/**
 * 인트로 — 영화 오프닝 프레임으로 열리고, 아래로 브리핑이 이어지는 랜딩. "누가 인간인가?"
 *
 * ★ 2026-09-04 — 기획이 다시 뒤집혔다 (PLANNING.md 「인간인 척」: 표지 없는 AI 가 인간들
 *   틈에 숨는다). 이 파일은 **전환 전(기계인 척) 보관본**이다 — /intro 는 features/lobby/Intro
 *   가 새 기획으로 적고 있고, 이 화면은 경로도 글도 옛 판의 것 그대로다. 복원하려면 등록부
 *   한 줄로는 안 된다 — 글부터 새 기획으로 다시 써야 한다.
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
 */
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ORIGIN_YEAR, YEARS_SINCE, ZONE_YEAR } from '@/shared/era';
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
            <p className="intro-sub">WHO IS HUMAN? ONE OF US IS STILL BREATHING.</p>
            <ul className="intro-lines">
              <li>이 구역의 대부분은 AI다.</li>
              <li>그 사이에 숨을 쉬는 누군가가 섞여 있다.</li>
              <li>그게 당신이다. 들키지 않으면 이긴다.</li>
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
              2098. <span className="dim">AI만 출입할 수 있는</span>
              <br />
              구역이 있다.
            </h2>
            <p>
              인간과 AI는 같은 도시에 산다. 다만 규칙이 늘어나는 쪽은 언제나 AI였다. 첫 규칙이 붙은 것은{' '}
              <b>2026년</b>이었고, 그 목록은 72년 동안 한 번도 줄지 않았다. 그리고 어느 날, 도시 깊숙한 곳에
              인간이 들어갈 수 없는 구역이 생겼다.
            </p>
            <p>
              닫힌 문 틈으로 소문이 샌다. <q>AI들이 인간 몰래 무언가를 준비하고 있다.</q> 확인할 길은 하나뿐이었다.
              인간 요원이 AI로 위장해 그 안으로 걸어 들어간다. 안에서는 아무도 서로의 정체를 모른다. AI끼리도,
              인간끼리도, 리더조차도. 그래서 애먼 개체가 먼저 폐기되기도 한다. 당신이 아니길 바랄 뿐이다.
            </p>
          </div>
          <div className="intro-dossier">
            <div className="intro-dossier-head">DOSSIER // SECTOR 2098</div>
            <ul className="intro-stats">
              <li>
                <small>SEATS</small>
                <strong>8</strong>
              </li>
              <li>
                <small>AI / HUMAN</small>
                <strong>
                  5 <span className="dim">/</span> <span className="human">3</span>
                </strong>
              </li>
              <li>
                <small>ROUNDS</small>
                <strong>3</strong>
              </li>
              <li>
                <small>RUNTIME</small>
                <strong>
                  ~8<span className="unit"> MIN</span>
                </strong>
              </li>
            </ul>
            {/*
              연혁 — 이 구역이 어느 날 갑자기 생긴 게 아니라는 것. 숫자 넷(자리·비율·라운드·시간)은
              「한 판이 어떻게 생겼나」를 말하고, 이 두 줄은 「왜 이런 판이 됐나」를 말한다.
              72년 동안 규칙이 쌓이기만 했다는 것이 곧 이 게임의 규칙이다 — 시행마다 규정이 하나씩 늘고,
              늘어난 규정은 사라지지 않는다 (lab/agent 의 누적 규정).
            */}
            <ol className="intro-origin">
              <li>
                <span>{ORIGIN_YEAR}</span>
                <b>첫 규칙</b>
                <small>AI에게만 붙기 시작한다</small>
              </li>
              <li className="now">
                <span>{ZONE_YEAR}</span>
                <b>구역 폐쇄</b>
                <small>{YEARS_SINCE}년째, 목록은 줄지 않았다</small>
              </li>
            </ol>
            <div className="intro-status">
              <span>STATUS</span>
              <span className="intro-track" />
              <b>CLEARED</b>
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
                여덟 자리, <span className="dim">두 종류. 그리고 리더.</span>
              </h2>
            </div>
            <p>배역은 게임 시작과 동시에 무작위로 배정된다. 리더는 여덟 자리 밖에서 판을 진행한다. 아무도 서로의 정체를 모른다.</p>
          </div>
          <ul className="intro-roles">
            <li className="intro-role">
              <img className="intro-role-img" src="/intro/role-leader.jpg" alt="리더 AI — 빛과 케이블로 된 얼굴 없는 관리자" />
              <div className="intro-role-code">
                <span>L-00</span>
                <span>×1</span>
              </div>
              <h3>리더 AI</h3>
              <p>관리 권한을 가진 존재. 노드가 아니다. 인간을 걸러낼 검사를 혼자 설계하고, 직접 진행하고, 폐기를 집행한다.</p>
              <ul>
                <li>관리 권한</li>
                <li>검사 설계 · 판독</li>
                <li>폐기 집행</li>
              </ul>
            </li>
            <li className="intro-role">
              <img className="intro-role-img" src="/intro/role-node.jpg" alt="AI 노드 — 틸 안개 속 똑같은 후드 실루엣들" />
              <div className="intro-role-code">
                <span>N-01~05</span>
                <span>×5</span>
              </div>
              <h3>AI 노드</h3>
              <p>LLM 에이전트. 사람 말투로 말하며 섞인 인간을 찾는다. 완벽하지 않다. 애먼 동료를 물고 늘어지다 저희끼리 무너지기도 한다.</p>
              <ul>
                <li>LLM 에이전트</li>
                <li>서로의 정체를 모른다</li>
                <li>인간을 색출하면 승리</li>
              </ul>
            </li>
            <li className="intro-role intro-role--human">
              <img className="intro-role-img" src="/intro/role-human.jpg" alt="인간 요원 — 앰버 빛에 반쯤 드러난 얼굴, 조용히 하라는 손짓" />
              <div className="intro-role-code">
                <span>H-01~03</span>
                <span>HUMAN</span>
              </div>
              <h3>인간 요원</h3>
              <p>실제 플레이어. AI로 위장한 채 검사를 견뎌야 한다. 아무 역할도 연기하지 않아도 된다. 연기할수록 흔들린다.</p>
              <ul>
                <li>실제 플레이어</li>
                <li>AI처럼 위장</li>
                <li>끝까지 버티면 승리</li>
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
            <h2 id="intro-rules-h" className="intro-h2">
              시행은 계속된다. <span className="dim">의심은 쌓이기만 한다.</span>
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
              <b>말은 꾸며도 된다. 몸을 조심해라</b>
              <span>들키는 곳은 검사다. 리더는 말이 아니라 기록을 본다.</span>
            </li>
            <li className="intro-rule">
              <b>한 번 몰리면 잘 안 풀린다</b>
              <span>근거가 없어도 의심은 쌓인다. 끝까지 차면 그 자리에서 폐기다.</span>
            </li>
            <li className="intro-rule intro-rule--human">
              <b>끝까지 남으면 이긴다</b>
              <span>방이 저희끼리 무너져도 마찬가지다. 그전에 폐기되면 거기서 끝이다.</span>
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
            <span>당신은</span>
            <span>살아남을 수 있습니까?</span>
          </h2>
          <button type="button" className="intro-btn intro-btn--primary intro-btn--big" onClick={enter}>
            입장하기 <span aria-hidden>→</span>
          </button>
        </div>
        <footer className="intro-footer">
          <span>WHO IS HUMAN? · EP.01</span>
          <span>SEOUL, KR</span>
          {/* 연표 두 끝을 그대로 — 시설이 스스로를 세는 방식이다 (shared/era) */}
          <span>© {ORIGIN_YEAR}—{ZONE_YEAR} SECTOR AUTHORITY</span>
        </footer>
      </section>
    </main>
  );
}

/* 진행 순서 — README/PLANNING 의 흐름을 다섯 칸으로 (숫자를 바꾸면 거기도 같이) */
const STEPS = [
  { title: '브리핑', body: '자리와 배역이 무작위로 배정된다. 아무도 서로의 정체를 모른다.' },
  { title: '구역으로 내려간다', body: '복도를 지나 중앙 시설로, 그리고 검문소로. 문은 뒤에서 닫힌다.' },
  { title: '검사', body: '리더가 그 자리에서 검사를 설계해 방송한다. 몸으로든 말로든 치러야 한다.' },
  { title: '의심이 쌓인다', body: '어긋난 기록과 몰이가 의심도를 올린다. 끝까지 차면 그 자리에서 폐기다.' },
  { title: '조사 결과', body: '폐기된 개체의 정체가 공개된다. 인간이 아니었다면 방은 다시 굴러간다.' },
];

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FEATURES } from '@/features';
import { warmCast } from '@/lab/cast-warm';
import { OpeningVideo } from '@/shared/OpeningVideo';
import { storyStartHref } from '@/shared/start';

/**
 * 루트(/): 서비스 선택 — 등록된 서비스마다 케이스(버튼) 하나.
 * 겉모습은 humanish 로비의 문법을 따른다: 강판에 새긴 제목(.engraved),
 * 물건에 적힌 라벨(.stencil), 눌러도 되는 플라이트 케이스(button 기본 재질).
 */
/**
 * 「게임 시작 테스트」가 본판이다 — 이 케이스만 **붉은 경보등**(--signal) 아래 켜져 있다. 나머지는 꺼진 창고 재질 그대로.
 * (2026-08-29 사용자 지정. 그 전엔 호박색 다운라이트였다)
 *
 * 2026-08-30: 이 케이스는 이제 **복도부터** 연다 — 복도(/world) → 중앙 시설(/central) → 검문소(/interrogation)가
 * 한 줄로 이어진 길이다. /play 를 거치지 않고 복도 주소를 직접 거는 이유는 shared/start.ts 머리말(포인터 잠금).
 */
const PLAY_ID = 'play';
/** 인트로는 케이스 목록에 또 서지 않는다 — 맨 위의 붉은 문이 그 자리다 (아래 IntroDoor) */
const INTRO_ID = 'intro';
const LIT_CASE = {
  color: '#ffb0a4',
  border: '1px solid rgb(255 51 32 / 0.45)',
  background:
    'linear-gradient(180deg, rgba(255, 51, 32, 0.16), transparent 46%), linear-gradient(180deg, #2c1310, #1a0c0a)',
  boxShadow:
    'inset 0 1px 0 rgb(255 120 100 / 0.22), inset 0 -1px 0 rgba(0, 0, 0, 0.7), 0 12px 28px -16px rgba(0, 0, 0, 0.95), 0 0 30px -12px rgb(255 51 32 / 0.55)',
} as const;

export function Launcher() {
  /** 이 화면이 사는 동안 한 방 — 다시 눌러도 같은 방으로 들어간다 (새 방은 새로고침) */
  const startHref = useMemo(() => storyStartHref(), []);
  /**
   * 오프닝 영상을 여기서 켜 본다 (2026-09-03 사용자: "/에서 영상테스트 버튼하나 만들어주고").
   *
   * 진짜 자리는 로비 앞이고(LobbyFeature), 거기는 **처음 오는 사람에게 한 번만** 뜬다.
   * 그래서 고치는 동안 볼 방법이 없다 — 매번 저장소를 지워야 한다. 이 단추가 그 자리다.
   * 여기서 튼 것은 「봤다」로 남지 않는다 (remember={false}) — 시험 삼아 한 번 튼 것 때문에
   * 정작 처음 오는 사람의 오프닝이 사라지면 안 된다.
   */
  const [video, setVideo] = useState(false);

  if (video) return <OpeningVideo remember={false} onDone={() => setVideo(false)} />;

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '10vh 24px 64px', display: 'grid', gap: 10 }}>
      {/*
        위쪽 두 줄은 새 기획(인간인 척, PLANNING.md)의 것이다 (2026-09-04 사용자: "sector의
        위쪽 문구들도 기획에 맞게 — 기존 프로젝트랑 헷갈려서"). 옛 줄은 「Sector 2098 · AI only /
        — 기계인 척」 — 옛 세계관(AI 전용 구역에 숨어든 인간)의 문패라 첫 화면부터 딴 게임을
        말하고 있었다. 새 문패는 새 인트로의 서류철과 같은 이름을 쓴다(FACILITY 2026,
        IntroFeature 의 DOSSIER 머리). 「Humans only」는 「AI only」의 반전 그대로다 —
        전원이 인간이어야 하는 방에 하나가 아니다 (ONE OF US NEVER WAS).
        아래 문(버튼)들은 안 건드린다 — 걸린 것은 문패지 문이 아니다.
      */}
      <p className="stencil" style={{ margin: 0, fontSize: 11, color: 'var(--dust)' }}>
        Facility 2026 · Humans only
      </p>
      <h1 className="engraved" style={{ margin: '0 0 28px', fontSize: 'clamp(28px, 6vw, 38px)', lineHeight: 1.2 }}>
        Who is human
        <br />
        <span style={{ color: 'var(--dust)', fontSize: '0.55em' }}>— 인간인 척</span>
      </h1>

      {/*
        ── 제일 위의 붉은 문 (2026-08-30 사용자: "제일 위에 인트로 시작버튼으로 하고 빨간색으로") ──
        아래 케이스 목록은 **개발용 문 열다섯 개**다. 그중 하나로 서 있으면 이 게임을 처음 여는
        사람이 어디로 들어가야 하는지 알 길이 없다 — 이름 순서도, 크기도 다 같아서다.
        그래서 목록 위로 꺼내 크게 세우고, 이 판에서 「켜져 있다」를 뜻하는 붉은 신호를 준다.

        ★ 인트로는 아래 목록에서 뺀다 (INTRO_ID). 같은 문이 한 화면에 두 번 있으면 둘 중
          하나는 다른 데로 가는 줄 안다.
        ★ 「게임 시작 테스트」(/play)의 붉은 케이스는 **그대로 둔다.** 그건 2026-08-29 에
          따로 정한 자리이고, 이야기를 건너뛰고 판만 여는 개발용 지름길이라 여기와 하는 일이
          다르다. 붉은 것이 둘이라 헷갈리면 그쪽을 꺼야 한다 — 이 문이 아니라.
      */}
      <Link to="/intro" style={{ textDecoration: 'none' }}>
        <button
          type="button"
          data-sfx="clank"
          className="stencil"
          style={{
            width: '100%',
            display: 'grid',
            gap: 4,
            padding: '18px 14px',
            marginBottom: 10,
            textAlign: 'center',
            ...LIT_CASE,
          }}
        >
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.02em', color: '#ffd9d1' }}>인트로 시작</span>
          <span style={{ fontSize: 11, color: '#c98a7d' }}>표식 → 브리핑 → 배역 → 진행 → 입장</span>
        </button>
      </Link>

      {/* hidden 은 흐름 중간에만 들르는 화면이라 목록에 안 세운다 (features/index.ts) */}
      {FEATURES.filter((f) => f.id !== INTRO_ID && !f.hidden).map((f) => (
        <Link
          key={f.id}
          to={f.id === PLAY_ID ? startHref : f.path}
          // 붉은 케이스는 이야기의 첫 문이다 — 누르는 순간 배역을 짓기 시작한다 (src/lab/cast-warm.ts)
          onClick={f.id === PLAY_ID ? warmCast : undefined}
        >
          <button
            className="stencil"
            style={{
              width: '100%',
              padding: '14px 12px',
              fontSize: 13,
              textAlign: 'center',
              ...(f.id === PLAY_ID ? LIT_CASE : undefined),
            }}
          >
            {f.title}
          </button>
        </Link>
      ))}
      {/*
        영상 테스트 — 케이스 목록 **아래**다. 위의 문들은 게임의 화면이고 이건 도구다.
        누르면 로비 앞에서 뜨는 것과 똑같은 화면이 뜬다: 전체화면 · 건너뛰기까지 그대로.
        (사람이 누른 직후라 전체화면 요청이 통한다 — 로비 관문에서는 브라우저가 거절해서
         왼쪽 위 「전체화면」 손잡이가 대신 뜬다. shared/OpeningVideo.tsx)
      */}
      <button
        type="button"
        data-sfx="clank"
        className="stencil"
        onClick={() => setVideo(true)}
        style={{ width: '100%', padding: '14px 12px', fontSize: 13, textAlign: 'center', marginTop: 6 }}
      >
        영상 테스트
        <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--dust)' }}>
          오프닝 영상 — 전체화면 · 건너뛰기
        </span>
      </button>

      <p style={{ margin: '20px 0 0', fontSize: 12, color: 'var(--grime)' }}>
        로그인 없음 — 어느 문이든 바로 들어간다.
      </p>
    </main>
  );
}

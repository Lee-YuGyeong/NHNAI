/**
 * 로그인 (/login) — humanish 의 components/login-screen.tsx 를 옮겨 이 줄의 색으로 다시 지은 화면.
 *
 * ┌─ 원작과 결정적으로 다른 한 가지: **여기는 벽이 아니다** ─────────────────┐
 * │ humanish 는 RequireLogin 이 게임 전체를 감싸서, 들어오는 순간 이 화면을   │
 * │ 지나야 했다. 이 저장소는 그 결정을 따르지 않는다 — 로그인 없이 노는 길이  │
 * │ 이미 있고 (shared/guest.ts), 그게 이 게임의 첫 약속이다                   │
 * │ ("NO SIGN-UP · 브라우저에서 바로", Intro.tsx 의 표식).                    │
 * │                                                                          │
 * │ 그래서 이 화면에는 **나가는 문이 늘 하나 더 있다** — 「이름만 정하고      │
 * │ 들어가기」. 로그인은 권하는 것이지 요구하는 것이 아니다.                  │
 * │ 로그인이 바꾸는 것은 하나뿐이고, 그것을 이 화면이 직접 말한다:            │
 * │ **방에서 이름이 사칭되지 않는다** (worker/src/room-do.ts).                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 왜 features/login 이 아니라 여기 있나 ──────────────────────────────────┐
 * │ 폴더가 곧 소유권이라 (features/README.md) 남의 폴더의 CSS 를 끌어다 쓰지  │
 * │ 않는다. 이 화면은 로비의 콘솔(lobby.css · console.tsx)을 그대로 입는다 —  │
 * │ 로그인에서 방 목록으로 넘어갈 때 화면이 갈아끼워지면 안 되기 때문이다.    │
 * │ /intro 가 이미 같은 규칙으로 산다 (features/index.ts 는 ./lobby/Intro 를  │
 * │ 그 경로에 물린다).                                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ★ 설정이 없으면 **이유를 적는다.** 원작에는 없던 칸이다. 머리말의 계정 단추는
 *   키가 없으면 조용히 사라지는데(AccountButton), 그것만 있으면 "로그인이 어디
 *   있냐"가 된다 — 실제로 그랬다 (2026-08-31). 단추가 안 보이는 것이 정상인
 *   경우와 고장인 경우를 사람이 구분할 수 있어야 한다. 그 자리가 여기다.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { playSfx } from '@/shared/sfx';
import { signInWithGoogle, useAccount, useAccountSync } from '@/shared/useAccount';
import { ArrowIcon, Backdrop, Panel } from './console';
import './lobby.css';

/** 로그인 뒤에 갈 곳. 기본은 방 목록 — 이 화면에 온 사람은 결국 거기로 간다 */
const HOME = '/lobby';

/**
 * 돌아갈 경로를 고른다. humanish 의 콜백·로그인 화면과 **같은 규칙**이다.
 *
 * ★ 열린 리다이렉트를 막는 자리다. next 는 주소창에서 온 값이라 무엇이든 올 수 있고,
 *   '//evil.com' 은 브라우저가 **다른 호스트**로 읽는다 — 우리 도메인 링크를 눌렀는데
 *   남의 사이트로 가고, 주소창에는 그럴듯한 로그인 화면이 뜬다.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return HOME;
  // 로그인 화면으로 되돌리지 않는다 — 그 화면이 다시 여기로 보내면 고리가 된다
  if (raw === '/login' || raw.startsWith('/login?')) return HOME;
  return raw;
}

export function LoginFeature() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const account = useAccount();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // 로그인 왕복 뒷정리 — 여기가 그 왕복의 출발점이자 도착점이다 (shared/useAccount.ts)
  useAccountSync();

  /*
   * 이미 로그인해 있으면 그냥 통과시킨다. 뒤로 가기로 여기 돌아왔을 때 다시
   * 로그인 단추를 보여줄 이유가 없다 (원작과 같은 규칙).
   *
   * ★ useAccountSync 가 sessionStorage 의 돌아갈 자리로 먼저 보낼 수도 있다.
   *   둘 다 replace 라 뒤로 가기 기록에 로그인 화면이 남지 않는다.
   */
  /*
   * 로그인이 끝난 뒤 갈 곳은 둘이다 — 원작의 콜백 라우트가 하던 판단 그대로다
   * (humanish app/api/auth/callback: 프로필이 없으면 이름 짓는 화면으로).
   *
   *   이름이 있다  → 원래 가려던 곳
   *   이름이 없다  → /account/nickname (거기서 짓고 나면 같은 next 로 이어진다)
   */
  useEffect(() => {
    if (account.status !== 'in') return;
    const to = account.displayName ? next : `/account/nickname?next=${encodeURIComponent(next)}`;
    navigate(to, { replace: true });
  }, [account.status, account.status === 'in' ? account.displayName : null, next, navigate]);

  /*
   * 구글 화면에서 취소하면 code 없이 error 만 붙어 돌아온다.
   * **붉은 글씨로 말하지 않는다** — 취소는 실패가 아니다 (humanish 콜백의 규칙).
   */
  const cancelled = params.get('error') === 'access_denied';

  const login = () => {
    setBusy(true);
    setFailed(null);
    // 성공하면 이 페이지는 구글로 떠난다. 돌아오지 못한 경우에만 아래가 다시 돈다
    void signInWithGoogle(next).then(({ error }) => {
      if (!error) return;
      playSfx('deny');
      setBusy(false);
      setFailed(error);
    });
  };

  return (
    <div className="bl">
      <Backdrop />

      <header className="bl-top">
        <Link to="/" className="bl-logo" style={{ textDecoration: 'none' }}>
          Who is human
        </Link>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`bl-dot${account.status === 'off' ? ' bl-dot--red' : ''}`} aria-hidden />
          <span className="bl-label">{account.status === 'off' ? 'OFFLINE' : 'ONLINE'}</span>
        </span>
      </header>

      <main
        style={{
          position: 'relative',
          zIndex: 2,
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
        }}
      >
        <div style={{ width: '100%', maxWidth: 420 }}>
          <span className="bl-label">ACCESS // SECTOR 2098</span>
          {/* 제목은 이 화면에 하나뿐이다 — 머리말에는 로고만 둔다 (원작과 같은 규칙) */}
          <h1 className="bl-hero__title bl-hero__title--sm" style={{ margin: '10px 0 0' }}>
            출입 확인
          </h1>
          <p className="bl-note" style={{ marginTop: 10 }}>
            구역은 당신이 누구인지 묻지 않는다. <b>다만 이름을 확인해 둘 수는 있다.</b>
          </p>

          <Panel title="인증">
            <Body
              account={account}
              busy={busy}
              cancelled={cancelled}
              failed={failed}
              onLogin={login}
            />
          </Panel>

          {/*
            ★ 나가는 문. 로그인 화면에서 **제일 중요한 줄**이다 — 이 게임은 로그인이
              없어도 전부 돌아가고, 그걸 여기서 말하지 않으면 벽처럼 보인다.
          */}
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              className="bl-btn bl-edge"
              data-sfx="clank"
              onClick={() => navigate(next)}
            >
              이름만 정하고 들어가기 <ArrowIcon />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ═══════════════════════════ 판 안쪽 ═══════════════════════════ */

function Body({
  account,
  busy,
  cancelled,
  failed,
  onLogin,
}: {
  account: ReturnType<typeof useAccount>;
  busy: boolean;
  cancelled: boolean;
  failed: string | null;
  onLogin: () => void;
}) {
  if (account.status === 'loading') {
    return <p className="bl-note">확인 중…</p>;
  }

  /*
   * 키가 안 꽂혀 있다. **여기서는 감추지 않고 이유를 적는다.**
   *
   * 머리말의 단추는 이 상태에서 사라지는 게 맞다 (눌러도 안 되는 단추는 고장으로
   * 보인다). 하지만 사람이 「로그인」을 찾아 여기까지 왔으면, 없는 이유를 알려주는
   * 것이 사라지는 것보다 낫다. 대개는 워커를 안 띄운 것뿐이다.
   */
  if (account.status === 'off') {
    return (
      <>
        <p className="bl-alert">이 판에서는 로그인이 꺼져 있다.</p>
        <p className="bl-note" style={{ marginTop: 12 }}>
          게임은 그대로 전부 돌아간다 — 로그인은 이름을 확인해 주는 것뿐이다.
        </p>
        <p className="bl-note" style={{ marginTop: 10 }}>
          켜려면 워커가 같이 떠 있어야 한다. 로그인 설정은 그쪽이 들고 있다:
        </p>
        <pre
          className="bl-mono"
          style={{
            margin: '8px 0 0',
            padding: '9px 12px',
            border: '1px solid rgba(111,211,255,0.25)',
            background: 'rgba(8,18,28,0.6)',
            fontSize: 12,
            overflowX: 'auto',
          }}
        >
          npm run worker:dev
        </pre>
        <p className="bl-note" style={{ marginTop: 10, fontSize: 11.5 }}>
          그래도 안 뜨면 키가 비어 있는 것이다 — <code>npm run vars:check</code> 로 확인한다
          (docs/DEVELOPMENT.md 「계정 · 구글 로그인」).
        </p>
      </>
    );
  }

  // 바깥의 효과가 곧바로 다음 칸으로 내보낸다 (이름이 있으면 next, 없으면 이름 짓는 화면)
  if (account.status === 'in') {
    return <p className="bl-note">확인됐다. 들여보내는 중…</p>;
  }

  return (
    <>
      <button
        type="button"
        className="bl-btn bl-btn--go bl-btn--wide bl-edge"
        data-sfx="clank"
        disabled={busy}
        onClick={onLogin}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
      >
        <GoogleIcon />
        {busy ? '여는 중…' : '구글로 계속하기'}
      </button>

      {cancelled ? (
        <p className="bl-note" style={{ marginTop: 12 }}>
          로그인을 취소했다. 다시 눌러도 된다.
        </p>
      ) : null}
      {failed ? (
        <p className="bl-alert" style={{ marginTop: 12 }}>
          {failed}
        </p>
      ) : null}

      {/*
        무엇이 달라지는지 한 줄. 「왜 로그인하나」에 답하지 않는 로그인 화면은
        누르라고만 하는 화면이 된다.
      */}
      <ul className="bl-note" style={{ margin: '14px 0 0', paddingLeft: 16 }}>
        <li>humanish 에서 쓰던 계정 그대로다.</li>
        {/*
          ★ 「거기서 지은 이름으로 들어온다」 였다. **이제 틀린 말이다** — 이름은 이 게임 것이고
            (wih.profiles) 로그인 다음 칸에서 짓는다. 화면이 하는 말이 실제와 어긋나면
            그 화면은 안내가 아니라 거짓말이다.
        */}
        <li>이 구역에서 쓸 이름은 다음 칸에서 짓는다.</li>
        <li>
          그 이름은 방에서 <b>사칭되지 않는다</b>.
        </li>
      </ul>
    </>
  );
}

/** 구글 로고. CDN 을 쓰지 않는다 — 배포본은 외부 요청 없이 떠야 한다 (원작과 같은 규칙) */
function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.2-2.9.7-4.2v-5.7H4.5A22 22 0 0 0 2 24c0 3.6.9 6.9 2.5 9.9l7.3-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9z"
      />
    </svg>
  );
}

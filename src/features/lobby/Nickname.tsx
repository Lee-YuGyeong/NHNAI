/**
 * 이름 짓기 (/account/nickname) — humanish 의 app/account/nickname 을 이 줄의 색으로 옮긴 화면.
 *
 * 로그인 → **이름** → 로비. 세 화면이 한 흐름이라 같은 콘솔을 입는다 (lobby.css).
 * 중간에서 화면 언어가 바뀌면 안 된다.
 *
 * ┌─ **한 번 짓고 끝이다** (2026-08-31 사용자 지시) ─────────────────────────┐
 * │ 되돌릴 수 없는 문이라 누르기 **전에** 말한다 — 눌러 놓고 알려주는 것은    │
 * │ 알려주는 게 아니다. 그래서 이 화면에서 뺄 수 없는 문장이 하나 있다:       │
 * │ 「한 번 정하면 바꿀 수 없다.」                                            │
 * │                                                                          │
 * │ 진짜 자물쇠는 여기가 아니라 **DB 트리거**다 (supabase/schema.sql 의        │
 * │ freeze_display_name). 화면은 안내이고, 규칙은 서버가 지킨다 — 이 규칙을   │
 * │ 아는 자리가 화면 하나뿐이면 경로가 하나 더 생기는 순간 조용히 뚫린다.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ★ 이미 이름이 있으면 **화면을 그리지 않고 돌려보낸다.** 못 바꾸는데 입력칸을
 *   보여주면, 고쳐 놓고 눌렀을 때 409 를 보게 된다 (원작과 같은 규칙).
 *
 * ★ 구글 이름은 **미리 채운다** — 다만 지우고 새로 쓸 수 있다. 한 글자라도 건드린
 *   뒤에는 덮어쓰지 않는다. 여기까지는 원작 그대로다. 이 화면이 「본명이 그대로
 *   박히는 것」을 막는 방법은 감추는 게 아니라 **바꿀 수 있게 두는 것**이다.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { playSfx } from '@/shared/sfx';
import { setDisplayName, useAccount, type SaveNameError } from '@/shared/useAccount';
import { NICK_MAX_LEN } from '@/world/mp/constants';
import { ArrowIcon, Backdrop, Panel } from './console';
import { safeNext } from './Login';
import './lobby.css';

/**
 * 실패를 사람 말로. 이유를 안 적으면 「저장이 안 된다」로만 보인다.
 * ★ 로비의 SAVE_WHY 와 **같은 말**을 쓴다 — 같은 실패가 화면마다 다른 말로 나오면
 *   사용자는 다른 문제인 줄 안다.
 */
export const WHY: Record<SaveNameError, string> = {
  name_taken: '이미 쓰는 닉네임이다. 다른 것으로.',
  name_frozen: '이미 등록된 닉네임이 있다. 이름은 한 번 짓고 바꾸지 못한다.',
  bad_name: `닉네임은 1~${NICK_MAX_LEN}자다.`,
  // 이건 사용자의 잘못이 아니라 **설정**이다. 그대로 적어야 고칠 수 있다
  schema_not_exposed:
    'DB 의 wih 스키마가 아직 노출돼 있지 않다 — Supabase 대시보드 Project Settings → API → Data API → Exposed schemas 에 wih 를 추가한다.',
  offline: '저장하지 못했다. 워커가 떠 있는지 확인한다 (npm run worker:dev).',
};

export function NicknameFeature() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const account = useAccount();

  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  /*
   * 방금 저장했다. 아래 「이미 이름이 있다」 효과가 이걸 보고 비켜선다 —
   * 없으면 저장하자마자 그 효과가 먼저 돌아서, 이 화면이 스스로를 「볼일 없는 사람」
   * 으로 판정하고 내보낸다. state 가 아니라 ref 인 이유는 화면을 다시 그릴 이유가 없어서다.
   */
  const saved = useRef(false);

  const suggested = account.status === 'in' ? account.suggested : null;
  const named = account.status === 'in' && Boolean(account.displayName);

  /*
   * 여기 볼일이 없는 사람 둘. 설명하지 않고 조용히 돌려보낸다 —
   * 할 수 있는 일이 없는 화면을 보여줄 이유가 없다 (원작과 같은 규칙).
   *   · 로그인 안 함     → 로그인부터
   *   · 이미 이름이 있음 → 원래 가려던 곳으로 (한 번 짓고 끝이라 고칠 것이 없다)
   */
  useEffect(() => {
    if (saved.current || account.status === 'loading') return;
    if (account.status === 'off') navigate(next, { replace: true });
    else if (account.status === 'out') navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
    else if (named) navigate(next, { replace: true });
  }, [account.status, named, next, navigate]);

  // 구글이 준 이름을 미리 채운다. **제안일 뿐이라 지우고 새로 쓸 수 있다.**
  useEffect(() => {
    if (touched || !suggested) return;
    setName(suggested);
  }, [suggested, touched]);

  const trimmed = name.trim();
  const ready = account.status === 'in' && !named;
  const ok = trimmed.length > 0 && !busy && ready;

  const submit = () => {
    if (!ok) return;
    setBusy(true);
    setFailed(null);
    void setDisplayName(trimmed).then((err) => {
      if (!err) {
        saved.current = true;
        navigate(next, { replace: true });
        return;
      }
      playSfx('deny');
      setBusy(false);
      setFailed(WHY[err]);
    });
  };

  return (
    <div className="bl">
      <Backdrop />

      <header className="bl-top">
        <Link to="/" className="bl-logo" style={{ textDecoration: 'none' }}>
          특수인공지능대응센터
        </Link>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="bl-dot" aria-hidden />
          <span className="bl-label">ONLINE</span>
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
          {/* 눈썹줄은 account 다. 제목이 「닉네임」이라 여기도 같은 말이면 두 번이다 */}
          <span className="bl-label">ACCOUNT</span>
          <h1 className="bl-hero__title bl-hero__title--sm" style={{ margin: '10px 0 0' }}>
            닉네임
          </h1>

          <Panel title="등록">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                id="wih-name"
                className="bl-field"
                style={{ width: '100%' }}
                value={name}
                maxLength={NICK_MAX_LEN}
                disabled={!ready || busy}
                placeholder={account.status === 'loading' ? '불러오는 중…' : `1~${NICK_MAX_LEN}자`}
                aria-label="닉네임"
                autoFocus
                onChange={(e) => {
                  setTouched(true);
                  setName(e.target.value);
                  setFailed(null);
                }}
              />
              <p className="bl-label" style={{ textAlign: 'right', marginTop: 6 }}>
                {trimmed.length}/{NICK_MAX_LEN}
              </p>

              {failed ? (
                <p role="alert" className="bl-alert" style={{ marginTop: 4 }}>
                  {failed}
                </p>
              ) : null}

              <button
                type="submit"
                className="bl-btn bl-btn--go bl-btn--wide bl-edge"
                data-sfx="clank"
                disabled={!ok}
                style={{ marginTop: 12 }}
              >
                {busy ? '저장 중…' : '이 이름으로 정하기'} <ArrowIcon />
              </button>
            </form>
          </Panel>

          {/*
            남는 문장은 이것 하나다. **되돌릴 수 없는 사실**이라 누르기 전에 말해야 한다.
            중복 불가 같은 것은 뺐다 — 그건 눌렀을 때 .bl-alert 가 말한다.
          */}
          <p className="bl-note" style={{ marginTop: 16 }}>
            <b style={{ color: 'var(--bl-ink)' }}>한 번 정하면 바꿀 수 없다.</b>
          </p>
        </div>
      </main>
    </div>
  );
}

/**
 * 계정 칩 — 머리말 오른쪽에 서는 **내 이름**. humanish 의 AccountChip 을 그대로 옮긴 구조다
 * (app/main/lobby.tsx · components/top-bar.tsx).
 *
 * ┌─ 「나가기」가 머리말에 맨몸으로 서 있지 않는다 ──────────────────────────┐
 * │ (2026-08-31 사용자: "이름 누르면 로그아웃있고 그래야하는데")               │
 * │ 자주 누를 것도 아닌데 늘 보이니 「이게 뭐지」가 된다. 원작은 **이름을      │
 * │ 누르면 열리는 메뉴** 안에 넣어 뒀다 — 평소에는 내 이름만 보이고, 나갈     │
 * │ 때만 한 겹 열린다.                                                       │
 * │                                                                          │
 * │   전:  이유경  나가기   ← 이름은 글자일 뿐이라 눌러도 아무 일이 없었다     │
 * │   후:  [이] 이유경 ▾    ← 누르면 메뉴에 「로그아웃」                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 이름이 서는 자리는 여럿인데, 메뉴는 하나다 ─────────────────────────────┐
 * │ (2026-08-31 사용자: "이거 휴머니시같이 만들어줘 · 누르면 로그아웃있고")    │
 * │ 위의 고침은 **머리말 칩에만** 닿았다. 로비 왼쪽 「요원」 칸의 이름은       │
 * │ 그대로 눌러도 아무 일이 없는 글자였고, 사용자가 누른 것은 그 **큰 쪽**    │
 * │ 이었다 — 초상까지 붙어 있으니 거기가 내 자리로 보이는 게 당연하다.        │
 * │ 그래서 여는 일 자체를 AccountMenu 로 떼어 둘이 나눠 쓴다. 이름이 어디에   │
 * │ 서 있든 누르면 같은 메뉴가 열린다. 두 벌로 갈려 있으면 다음에도 한쪽만    │
 * │ 고쳐진다.                                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 상태에 따라 넷이다. 원작과 같은 나눔이다:
 *
 *   설정 없음 · 확인 중   아무것도 안 그린다 (자리도 안 잡는다)
 *   로그인 안 함          「로그인」 — 누르면 곧장 구글
 *   로그인 · 이름 없음    「이름 정하기」 — **메뉴로 바꾸지 않는다.** 이름 짓는 것이
 *                         급한 일이고, 그걸 메뉴 안으로 한 번 더 숨기면 안 된다.
 *                         (원작과 같이, 이 상태에서는 로그아웃할 방법이 없다)
 *   로그인 · 이름 있음    이름 칩 + 메뉴
 *
 * ★ 살결은 콘솔의 것이다 (.bl-who · .bl-chip · .bl-menu — features/lobby/lobby.css). 이 부품이
 *   서는 자리가 셋 다 그 콘솔이라서다 (Intro · 로비 · 대기방). 색을 정하는 변수도
 *   .bl 에만 있다 — 콘솔 밖에 세우려면 그때 이 클래스들을 같이 옮긴다.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { playSfx } from './sfx';
import { signInWithGoogle, signOut, useAccount } from './useAccount';

/**
 * 이니셜 아바타. 외부 이미지 호스트에 의존하지 않는다 — 배포본은 외부 요청 없이 떠야
 * 한다 (원작과 같은 규칙). 크기는 쓰는 쪽이 정한다: 머리말은 작고, 왼쪽 기둥은 크다.
 */
export function Avatar({ name, size }: { name: string; size: number }) {
  return (
    <span
      aria-hidden
      className="bl-avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * 머리말에 뜨는 **내 이름.** 로비의 계정 메뉴와 대기방이 같은 부품을 쓴다 — 두 벌로
 * 갈리면 방에 들어갈 때 같은 이름이 다른 크기·다른 색으로 다시 그려진다 (원작 top-bar.tsx).
 */
export function AccountName({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <>
      <Avatar name={name} size={size} />
      <span className="bl-who__name">{name}</span>
    </>
  );
}

/**
 * **이름이 곧 단추다.** 누르면 아래로 메뉴가 열리고, 그 안에 나가는 문이 하나 있다.
 * 머리말의 계정 칩과 로비 「요원」 칸이 이것 하나를 나눠 쓴다 (파일 머리말).
 *
 * @param avatar 이니셜 동그라미를 같이 그릴까. 요원 칸은 **끈다** — 그 칸에는 이미 초상이
 *               붙어 있어서, 켜 두면 한 사람에게 얼굴이 둘 생긴다.
 * @param menuClassName 메뉴가 열리는 쪽. 기본은 오른쪽 끝에 맞춘다(머리말). 왼쪽 기둥에서는
 *               `bl-menu--under` 로 이름 아래 왼쪽에 건다 — 오른쪽에 걸면 판 밖으로 나간다.
 */
export function AccountMenu({
  name,
  size,
  avatar = true,
  className,
  menuClassName,
}: {
  name: string;
  size?: number;
  avatar?: boolean;
  className?: string;
  menuClassName?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  /*
   * 바깥을 누르거나 Esc 로 닫는다 (원작과 같은 규칙).
   *
   * ★ 나가는 중(busy)에는 닫지 않는다. 닫히면 다시 누를 수 있게 되고 signOut 이 두 번 나간다.
   * ★ mousedown 으로 듣는다. click 이면 메뉴가 사라진 자리에 있던 것이 같이 눌린다.
   */
  useEffect(() => {
    if (!open || busy) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, busy]);

  return (
    <div ref={boxRef} className={className} style={{ position: 'relative', display: 'flex', minWidth: 0 }}>
      <button
        type="button"
        className="bl-who bl-chip"
        // 여는 소리와 닫는 소리가 다르다. 소리를 듣는 것만으로 지금 무엇이 됐는지 안다
        data-sfx={open ? 'close' : 'open'}
        aria-haspopup="menu"
        aria-expanded={open}
        // 보이는 글자는 이름뿐이라 낭독기에는 이게 무슨 단추인지가 안 들린다
        aria-label={`${name} — 계정 메뉴`}
        onClick={() => setOpen((v) => !v)}
      >
        {avatar ? <AccountName name={name} size={size} /> : <span className="bl-who__name">{name}</span>}
        <CaretIcon />
      </button>

      {open ? (
        <div className={`bl-menu${menuClassName ? ` ${menuClassName}` : ''}`} role="menu">
          <button
            type="button"
            role="menuitem"
            className="bl-menuitem"
            data-sfx="close"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              // 실패해도 메뉴는 닫는다. 여기서 멈추면 눌렀는데 아무 일도 안 일어난 화면이 된다
              void signOut().finally(() => {
                setBusy(false);
                setOpen(false);
              });
            }}
          >
            {busy ? '나가는 중…' : '로그아웃'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AccountButton({ className }: { className?: string }) {
  const account = useAccount();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  /** 로그인하고 돌아올 자리 — 쿼리까지 들고 간다 (방 번호가 거기 있다) */
  const here = location.pathname + location.search;

  // 설정이 없거나 아직 물어보는 중 — 자리를 잡아 두지 않는다. 나중에 툭 튀어나오는 편이
  // 빈 칸이 잠깐 떠 있다가 채워지는 것보다 덜 산만하다
  if (account.status === 'off' || account.status === 'loading') return null;

  if (account.status === 'out') {
    /*
     * ★ 누르면 **곧장 구글이다** (2026-08-31 사용자 지시). 잠깐 /login 을 한 장
     *   거치게 해 봤는데, 로그인을 누른 사람에게 「무엇이 달라지는지」를 읽히는 것은
     *   안내가 아니라 지연이었다. 설명이 필요한 사람은 /login 으로 직접 갈 수 있다.
     */
    return (
      <button
        type="button"
        className={className}
        data-sfx="clank"
        disabled={busy}
        title="계정으로 로그인한다 — 방에서 이름이 사칭되지 않는다"
        onClick={() => {
          setBusy(true);
          // 성공하면 이 페이지는 구글로 떠난다. 못 떠난 경우에만 아래가 다시 돈다
          void signInWithGoogle(here).then(({ error }) => {
            if (!error) return;
            playSfx('deny');
            setBusy(false);
          });
        }}
      >
        로그인
      </button>
    );
  }

  // 이름을 안 지었다. **메뉴로 바꾸지 않는다** — 지금 급한 일이 이름이다 (파일 머리말)
  if (!account.displayName) {
    return (
      <Link
        to={`/account/nickname?next=${encodeURIComponent(here)}`}
        className={className}
        data-sfx="clank"
        style={{ textDecoration: 'none' }}
        title="이 구역에서 불릴 이름을 정한다 — 한 번 정하면 바꿀 수 없다"
      >
        이름 정하기
      </Link>
    );
  }

  return <AccountMenu name={account.displayName} />;
}

/** 아래로 열리는 표시. CDN 을 쓰지 않는다 — 배포본은 외부 요청 없이 떠야 한다 */
function CaretIcon() {
  return (
    <svg className="bl-chip__caret" width="9" height="6" viewBox="0 0 9 6" fill="none" aria-hidden>
      <path d="M1 1l3.5 3.5L8 1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

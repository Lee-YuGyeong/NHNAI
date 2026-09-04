/**
 * 계정 상태를 화면에 물리는 손잡이. 붙는 일 자체는 shared/supabase.ts 가 한다.
 *
 * ┌─ 왜 Redux 가 아니라 모듈 스토어인가 ─────────────────────────────────────┐
 * │ 이 값의 주인은 우리가 아니라 supabase-js 다 — 토큰을 스스로 갱신하고,     │
 * │ 다른 탭에서 로그아웃하면 그쪽에서 알려 준다. 그걸 리듀서로 옮겨 적으면     │
 * │ **같은 사실이 두 군데** 있게 되고, 어긋나는 날 어느 쪽이 맞는지 알 수 없다.│
 * │ 그래서 여기서는 구독만 하고, 스토어에 넣는 것은 딱 하나 — 닉네임이다      │
 * │ (useAccountSync). 그건 원래 우리 값이고 사용자가 고칠 수도 있어서다.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 상태 넷:
 *   off      키가 안 꽂혀 있다. **로그인 단추를 그리지 않는다** — 고장이 아니다
 *   loading  아직 물어보는 중
 *   out      설정은 있고, 로그인은 안 했다
 *   in       로그인했다. displayName 은 **이 게임에서 지은 이름** (아직 없을 수 있다)
 *
 * ★ displayName 이 null 인 'in' 은 정상 상태다 — 「로그인은 했는데 이름을 아직 안 지었다」.
 *   그때 화면이 묻는다 (features/lobby/Login.tsx). humanish 의 이름을 가져다 쓰지 않는다:
 *   계정만 공유하고 이름은 이 게임 것이다 (2026-08-31 사용자 결정).
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mainActions, mainSelectors } from '@/features/main/mainSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { saveGuestNick } from '@/shared/guest';
import {
  fetchProfileName,
  getSupabase,
  saveProfileName,
  signInWithGoogle,
  signOut,
  takeReturnPath,
  type SaveNameError,
} from '@/shared/supabase';

export type AccountState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'out' }
  | {
      status: 'in';
      email: string | null;
      /** 이 게임에서 지은 이름 (wih.profiles). null 이면 아직 안 지었다 */
      displayName: string | null;
      /** 구글이 준 이름 — 이름 짓는 칸에 **제안으로만** 뜬다. 저장된 값이 아니다 */
      suggested: string | null;
    };

/* ═══════════════════════════ 모듈 스토어 ═══════════════════════════ */

let state: AccountState = { status: 'loading' };
const listeners = new Set<() => void>();

function set(next: AccountState): void {
  state = next;
  for (const l of listeners) l();
}

let started = false;

/**
 * 한 번만 붙는다. 화면이 여럿이어도 구독은 하나다 —
 * 로비 머리말과 대기방이 각각 세션을 물어보면 그만큼 왕복이 는다.
 */
function start(): void {
  if (started) return;
  started = true;

  void (async () => {
    const supabase = await getSupabase();
    if (!supabase) {
      set({ status: 'off' });
      return;
    }
    // INITIAL_SESSION 이 곧바로 한 번 오므로 getSession 을 따로 부르지 않는다.
    // 다른 탭에서 로그아웃해도 여기로 온다 — 그래서 화면이 저절로 맞는다.
    supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        set({ status: 'out' });
        return;
      }
      const email = session.user.email ?? null;
      // 이름은 한 박자 늦게 온다. 먼저 「로그인됨」을 그려 두는 편이 낫다 —
      // 이름을 기다리며 단추가 비어 있으면 로그인이 안 된 것처럼 보인다.
      if (state.status !== 'in' || state.email !== email) {
        set({ status: 'in', email, displayName: null, suggested: null });
      }

      // 토큰은 한 시간마다 저절로 갱신되고 그때마다 여기로 온다. 이미 이름을 들고 있으면 다시 묻지 않는다
      if (state.status === 'in' && state.email === email && state.displayName) return;

      void fetchProfileName().then(({ name, suggested }) => {
        // 이름을 읽는 사이에 로그아웃했으면 덮어쓰지 않는다
        if (state.status === 'in' && state.email === email) {
          set({ status: 'in', email, displayName: name, suggested });
        }
      });
    });
  })();
}

/* ═══════════════════════════ 훅 ═══════════════════════════ */

/** 지금 계정 상태. 첫 호출이 연결을 시작한다 */
export function useAccount(): AccountState {
  const [, bump] = useState(0);

  useEffect(() => {
    start();
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  return state;
}

export { signInWithGoogle, signOut };
export type { SaveNameError };

/**
 * 이름을 정한다. 성공하면 스토어의 이름도 그 자리에서 갈아 끼운다 —
 * 서버에 저장해 놓고 화면이 옛 이름을 들고 있으면 다음 렌더에 되돌아간 것처럼 보인다.
 */
export async function setDisplayName(name: string): Promise<SaveNameError | null> {
  const err = await saveProfileName(name);
  if (err) return err;
  if (state.status === 'in') set({ ...state, displayName: name });
  return null;
}

/**
 * 로그인이 끝난 뒤에 화면이 해야 할 두 가지. 로비 최상단에서 **한 번만** 부른다.
 *
 *   1. 떠나기 전 자리로 되돌린다 — 구글에서 돌아오면 주소가 `/lobby` 로 납작해져
 *      있다 (redirectTo 에 쿼리를 못 싣는 이유는 supabase.ts). 방 목록을 보다가
 *      로그인했으면 방 목록으로 돌아와야 한다.
 *   2. 이름을 닉네임 칸에 옮긴다 — 어차피 방에 들어가면 서버가 입장권의 이름을
 *      쓴다 (worker/src/room-do.ts). 화면에 다른 이름이 떠 있으면 대기방에서
 *      갑자기 바뀐 것처럼 보인다. 두 이름을 미리 하나로 맞춘다.
 */
export function useAccountSync(): void {
  const account = useAccount();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const nickname = useAppSelector(mainSelectors.selectNickname);

  // 1. 돌아갈 자리. 로그인 왕복이 끝난 그 순간에만 값이 들어 있다
  useEffect(() => {
    if (account.status !== 'in') return;
    const back = takeReturnPath();
    if (back && back !== window.location.pathname + window.location.search) navigate(back, { replace: true });
  }, [account.status, navigate]);

  /*
   * 2. 이름 맞추기 — **이름 하나당 한 번뿐이다.**
   *
   * ★ 「지금 닉네임과 다르면 맞춘다」로 쓰면 안 된다. 그러면 로그인한 사람이 닉네임
   *   칸을 고치는 순간 이 효과가 곧바로 되돌려서, 글자가 안 쳐지는 칸이 된다.
   *   맞추는 것은 이름이 **막 도착했을 때** 한 번이고, 그 뒤로는 화면 것이다.
   *   (방 안에서는 어차피 서버가 입장권의 이름을 쓴다 — worker/src/room-do.ts)
   *
   * 이름이 없는 계정(humanish 를 안 해 본 사람)은 건드리지 않는다 — 그 사람의 게스트
   * 닉네임을 지우면 이름이 통째로 사라진다.
   */
  const displayName = account.status === 'in' ? account.displayName : null;
  const synced = useRef<string | null>(null);
  useEffect(() => {
    if (!displayName || synced.current === displayName) return;
    synced.current = displayName;
    if (displayName === nickname) return;
    dispatch(mainActions.setNickname(displayName));
    saveGuestNick(displayName);
    // nickname 은 「지금 값」을 읽으려고만 본다. 여기 의존성에 넣으면 사용자가 고칠 때마다 다시 돈다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName, dispatch]);
}

/** 시험이 스토어를 되돌릴 자리 */
export function __resetAccountForTests(): void {
  state = { status: 'loading' };
  started = false;
  listeners.clear();
}

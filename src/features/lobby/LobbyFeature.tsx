/**
 * 게임 로비 (/lobby) — humanish 의 **「게임 로비」와 「대기방」을 통째로 옮겨** 이 게임의 색으로 다시 지은 화면.
 *
 * ┌─ 무엇을 옮겼나 ──────────────────────────────────────────────────────────┐
 * │ humanish app/main/lobby.tsx        방 목록 · 찾기 · 열 정렬 · 방 만들기 · │
 * │                                    코드로 입장 · 왼쪽 기둥 · 기록 탭       │
 * │ humanish components/room-lobby.tsx 좌석판 · 말풍선 · 준비/시작 · 나가기    │
 * │                                    → Waitroom.tsx (같은 주소의 ?code=)     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 무엇을 바꿨나 ──────────────────────────────────────────────────────────┐
 * │ 색   형광 초록 · 금속 케이스 → **리더가 말할 때 뜨는 파란 말풍선**        │
 * │      (features/world/dialogue.css). 모따기한 남색 판, 청록 1px 테,        │
 * │      왼쪽 위 이름 탭, 오른쪽 위 표시등 넷. 자세한 것은 lobby.css.          │
 * │ 로그인  **선택이다** (2026-08-30). 원작은 RequireLogin 뒤였지만 여기는     │
 * │      관문을 두지 않는다 — 게스트 닉네임으로 그냥 논다 (shared/guest.ts).   │
 * │      대신 원작과 **같은 Supabase 프로젝트**에 로그인할 수 있고, 그러면     │
 * │      원작에서 지은 이름이 그대로 오고 방에서 사칭되지 않는다               │
 * │      (shared/supabase.ts · worker/src/auth.ts).                            │
 * │ 화면  주소가 곧 진행이다:                                                 │
 * │        /intro             브리핑 (Intro.tsx — 이 폴더에 있지만 경로는 저쪽) │
 * │        /lobby             방 목록 (이 파일)                                │
 * │        /lobby?code=1234   그 방의 대기방 (Waitroom.tsx) = 초대장           │
 * │      브리핑이 /lobby 의 첫 칸이었다가 2026-08-30 저녁에 /intro 로 갔다      │
 * │      (사용자: "내가 만든 걸 /intro 로 다 옮겨줘"). 옮긴 것은 파일이 아니라 │
 * │      **등록부의 한 줄**이다 — Intro.tsx 는 형제들(console.tsx · lobby.css) │
 * │      을 이 파일과 나눠 쓰므로 폴더째 떼어낼 수 없다.                       │
 * │      옛 ?step=rooms 링크도 그대로 열린다: 방 번호가 없으면 전부 방 목록이다.│
 * │ 목록  원작은 supabase 의 rooms 표를 읽었다. 여기는 **등록소 DO** 를 읽는다 │
 * │      (worker/src/lobby-do.ts · features/lobby/rooms.ts). 2026-08-31 까지    │
 * │      목업이던 자리가 이때 진짜가 됐고, 그러면서 원작에 있던 **방 제목**이   │
 * │      만들기 화면으로 돌아왔다 — 적어 둘 곳이 생겼기 때문이다.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { randomRoomCode, saveGuestNick } from '@/shared/guest';
import { AccountButton, AccountMenu } from '@/shared/AccountButton';
/** 처음 오는 사람에게 방 목록보다 먼저 트는 오프닝 (아래 LobbyFeature 의 첫 칸) */
import { OpeningVideo } from '@/shared/OpeningVideo';
import { openingSeen } from '@/shared/opening';
import { SfxToggle } from '@/shared/SfxToggle';
import { useAccount, useAccountSync } from '@/shared/useAccount';
import { playSfx } from '@/shared/sfx';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { NICK_MAX_LEN, ROOM_CODE_RE } from '@/world/mp/constants';
import { mainActions, mainSelectors } from '@/features/main/mainSlice';
import { Quiet } from './live';
import {
  ArrowIcon,
  Backdrop,
  CloseIcon,
  LockIcon,
  Panel,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  SeatArt,
} from './console';
import {
  MAX_ROOM_NAME_LEN,
  OPEN_ERROR_TEXT,
  fetchRooms,
  foldForSearch,
  nextSort,
  openRoom,
  recentRooms,
  rememberRoom,
  roomLabel,
  sinceLabel,
  sortRooms,
  type LobbyRoom,
  type RoomsSnapshot,
  type Sort,
  type SortableCol,
} from './rooms';
import { Waitroom } from './Waitroom';

/** 로비의 탭. 라벨과 순서를 여기 한 곳에만 적는다 (원작 TABS) */
type LobbyTab = 'rooms' | 'history';
const TABS: { key: LobbyTab; label: string }[] = [
  { key: 'rooms', label: '게임 로비' },
  { key: 'history', label: '기록' },
];

/**
 * 주소가 곧 진행이다 (파일 머리말의 표). 뒤에서부터 본다 — 방 번호가 있으면 그 방이 이긴다.
 *
 * ┌─ 주소에는 **방 번호만** 든다 (2026-08-31 사용자: "주소에 왜 닉네임이있지") ─┐
 * │ 예전에는 `?code=4724&nick=ㅇㅇㅇ` 로 보냈다. 그 값이 하는 일은 없었다 —     │
 * │ 이름은 이미 이 브라우저에 있고(shared/guest 의 localStorage), 로그인했으면  │
 * │ 계정에서 온다 (useAccountSync). 들어가기 직전에 saveGuestNick 도 한다.      │
 * │                                                                          │
 * │ 없어도 되는데 **해로웠다.** 대기방의 「초대 주소」는 지금 주소를 그대로     │
 * │ 복사하므로(Waitroom 의 CopyCodeButton), 초대장에 내 호출부호가 실려 나갔다. │
 * │ 받은 사람이 그 주소를 열면 **내 이름으로 방에 앉았다** — 주소의 이름이      │
 * │ 자기 이름을 이겼기 때문이다. 이름이 곧 정체인 게임에서 그건 공짜로 주는     │
 * │ 혼선이고, 덤으로 남의 이름이 주소창·방문기록·서버 로그에 남았다.            │
 * │                                                                          │
 * │ 그래서 **쓰지도 읽지도 않는다.** 옛 주소(`&nick=`)도 그대로 열린다 —        │
 * │ 번호만 보고 내 이름으로 들어간다. 이름이 아직 없는 사람은 막지 않고 묻는다  │
 * │ (아래 askCode) — 초대 주소를 처음 받은 사람이 정확히 그 자리에 선다.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function LobbyFeature() {
  const [params] = useSearchParams();
  const code = (params.get('code') ?? '').trim();
  const nickname = useAppSelector(mainSelectors.selectNickname);
  const account = useAccount();
  /*
   * 로그인 왕복이 끝난 뒤의 뒷정리 — 떠나기 전 자리로 되돌리고, 계정 이름을 닉네임 칸에 맞춘다.
   * 로비의 세 칸이 전부 이 아래에 있으므로 여기 한 번이면 된다 (shared/useAccount.ts).
   */
  useAccountSync();

  /*
   * ── 오프닝 영상 (2026-09-03 사용자: "로비에 들어가기전에 처음 … 사람들한에서 영상보여주려고해") ──
   *
   * **로비의 세 칸 전부보다 먼저**다 — 방 목록이든 초대장(?code=)이든, 이 브라우저에서
   * 처음 오는 사람은 영상을 한 번 지난다. 초대장만 빼 줄까 했지만 초대를 받은 사람도
   * 처음 오는 사람이고, 여기가 이 게임의 첫 화면이라는 사실은 어느 쪽이나 같다.
   *
   * ★ 판단은 열 때 한 번만 한다 (useState 의 초기값). 매 그림마다 저장소를 읽으면
   *   건너뛰기가 남긴 표시 때문에 이 화면이 스스로 사라지는데, 그 순간이 onDone 과
   *   겹치면 영상이 한 번 깜빡인다.
   * ★ 「봤다」를 남기는 것은 OpeningVideo 다 (remember 기본값). 끝까지 봤든 건너뛰었든
   *   같게 다룬다 — 두 번 보여주지 않는다 (shared/opening.ts).
   */
  const [opening, setOpening] = useState(() => !openingSeen());
  if (opening) return <OpeningVideo onDone={() => setOpening(false)} />;

  if (ROOM_CODE_RE.test(code)) {
    if (nickname.trim()) return <Waitroom code={code} nickname={nickname} />;
    /*
     * 이름이 없다 — 목록으로 돌려보내되 **묻는 채로** 연다. 치고 나면 누르려던 그 방으로
     * 그대로 이어진다 (RoomListScreen 의 nickAsk).
     * ★ 계정을 아직 물어보는 중이면 묻지 않는다. 물어 놓고 곧 계정 이름이 도착하면
     *   팝업이 한 번 깜빡였다 사라진다 — 사람은 자기가 뭘 잘못 눌렀나 싶어진다.
     */
    return <RoomListScreen askCode={account.status === 'loading' ? null : code} />;
  }
  // 방 번호가 없으면 목록이다. 옛 ?step=rooms 링크도 여기로 떨어진다
  return <RoomListScreen />;
}

/* ═══════════════════════════════ 방 목록 화면 ═══════════════════════════════ */

/**
 * 목록을 다시 읽는 주기. 등록소는 방들이 30초마다 적는 종이라 그보다 자주 읽을 이유가 없지만,
 * **자리가 차는 것**은 초 단위로 벌어진다 — 5초면 "들어갔더니 가득 참"이 드물다.
 */
const ROOMS_POLL_MS = 5000;

/**
 * 열린 방 목록 (features/lobby/rooms.ts 의 fetchRooms).
 *
 * ★ 탭이 뒤에 있으면 **읽지 않는다.** 로비를 열어 둔 채 딴 일을 하는 사람이 흔한데,
 *   그동안에도 5초마다 두드리면 아무도 안 보는 화면 때문에 등록소가 계속 깨어난다.
 *   돌아오는 순간 한 번 읽으므로 화면이 낡아 보이지도 않는다.
 * ★ 늦게 온 응답은 버린다 (seq). 새로고침을 연달아 누르면 먼저 보낸 요청이 나중에
 *   닿을 수 있고, 그러면 방금 만든 방이 목록에서 도로 사라진다.
 */
function useRooms(): { snap: RoomsSnapshot | null; refresh: () => void } {
  const [snap, setSnap] = useState<RoomsSnapshot | null>(null);
  const seq = useRef(0);

  const refresh = useCallback(() => {
    const mine = (seq.current += 1);
    void fetchRooms().then((next) => {
      if (mine === seq.current) setSnap(next);
    });
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, ROOMS_POLL_MS);
    const onShow = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
      seq.current += 1; // 떠난 뒤에 닿는 응답은 버린다
    };
  }, [refresh]);

  return { snap, refresh };
}

/**
 * @param askCode 열자마자 이름을 물어야 하는 방 번호 (초대 주소를 처음 받은 사람 — LobbyFeature).
 *                null 이면 안 묻는다.
 */
function RoomListScreen({ askCode = null }: { askCode?: string | null }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const nickname = useAppSelector(mainSelectors.selectNickname);
  const joinCode = useAppSelector(mainSelectors.selectJoinCode);
  /** 계정 칩이 이름을 그리는 상태인가 — 그때는 머리말이 이름을 한 번 더 세우지 않는다 */
  const account = useAccount();
  const named = account.status === 'in' && Boolean(account.displayName);

  const [tab, setTab] = useState<LobbyTab>('rooms');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>({ key: 'players', dir: 'desc' });
  /** 만들기 팝업이 들고 열릴 값. null 이면 닫혀 있다 (찾다 못 찾고 만들면 찾던 말이 제목으로 든다) */
  const [createSeed, setCreateSeed] = useState<{ code: string; name: string } | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const { snap, refresh } = useRooms();
  /** 이름을 묻는 중이면 그때 들어가려던 방 번호. null 이면 안 묻고 있다 */
  const [nickAsk, setNickAsk] = useState<string | null>(askCode);
  /** 요원 카드에서 연 이름 짓기 — 방으로 이어지지 않고 이름만 정한다 */
  const [nameOpen, setNameOpen] = useState(false);
  /*
   * 계정을 물어보는 동안은 askCode 가 null 이었다가 뒤늦게 온다 (LobbyFeature) —
   * 첫 렌더의 useState 값만 보면 그 사람에게는 영영 안 묻는다.
   */
  useEffect(() => {
    if (askCode) setNickAsk(askCode);
  }, [askCode]);
  const [error, setError] = useState<string | null>(null);

  /**
   * 만들든 코드로 들어가든 같은 길이다 — 이름을 남기고 그 번호의 대기방으로 간다.
   *
   * ★ 이름이 없으면 **막지 않고 묻는다** (2026-08-30). 예전에는 「왼쪽 「요원」 칸이다」라고
   *   붉은 글씨를 띄웠는데, 그 칸은 좁은 화면에서 통째로 감춰진다 (lobby.css 의 .bl-side) —
   *   폰에서는 보이지도 않는 곳을 가리키며 길을 막는 꼴이었다. 지금은 팝업이 뜨고,
   *   이름을 치면 **누르려던 그 방으로 그대로 이어진다** — 흐름이 끊기지 않는다.
   *
   * @param override 팝업에서 방금 친 이름. 스토어는 이 렌더에서 아직 안 바뀌어 있어서 직접 받는다
   */
  const enterRoom = (code: string, override?: string) => {
    if (!ROOM_CODE_RE.test(code)) {
      // 막힌 것도 소리로 먼저 안다 — 붉은 글씨는 화면 위쪽이라 아래를 보고 있으면 안 보인다
      playSfx('deny');
      setError('방 번호는 숫자 1~6자리');
      return;
    }
    const nick = (override ?? nickname).trim();
    if (!nick) {
      setCreateSeed(null);
      setCodeOpen(false);
      setNickAsk(code);
      return;
    }
    // 이름은 여기 남기고(브라우저) 주소에는 안 싣는다 — 그 이유는 LobbyFeature 머리말에 있다
    saveGuestNick(nick);
    rememberRoom(code);
    navigate(`/lobby?code=${code}`);
  };

  /**
   * 방을 만든다 — **등록소에 먼저 적고**, 그 번호의 대기방으로 간다 (features/lobby/rooms.ts).
   *
   * ★ 등록소에 못 닿으면(offline · registry_disabled) **막지 않고 들어간다.** 방은 목록이
   *   아니라 번호로 열리기 때문이다 (같은 번호를 친 사람끼리 같은 DO 에 모인다) — 목록에
   *   안 뜰 뿐이라, 여기서 길을 막으면 등록소 하나 때문에 게임 자체가 멈춘다.
   *   대신 왜 목록에 안 뜨는지는 위쪽에 적어 준다.
   * ★ 겹치는 번호·제목은 **팝업 안에서** 말한다 (아래 CreateDialog 의 error). 팝업을 닫고
   *   화면 위쪽에 적으면 방금 친 제목이 사라진 채로 이유만 남는다.
   */
  const createRoom = async (name: string, code: string): Promise<string | null> => {
    const result = await openRoom({ name, code });
    if (result.ok) {
      setCreateSeed(null);
      refresh();
      enterRoom(result.room.code);
      return null;
    }
    if (result.error === 'offline' || result.error === 'registry_disabled') {
      setCreateSeed(null);
      setError(OPEN_ERROR_TEXT[result.error]);
      enterRoom(code);
      return null;
    }
    playSfx('deny');
    return OPEN_ERROR_TEXT[result.error];
  };

  /** 찾은 뒤 정렬한다. 원작과 같은 순서 — 정렬해 놓고 거르면 자리 번호가 어긋난다 */
  const rooms = snap?.status === 'ok' ? snap.rooms : [];
  const visible = useMemo(() => {
    const needle = foldForSearch(query);
    const found = needle ? rooms.filter((r) => foldForSearch(roomLabel(r)).includes(needle)) : rooms;
    return sortRooms(found, sort);
  }, [query, sort, rooms]);

  return (
    <div className="bl">
      <Backdrop />

      <header className="bl-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 26, minWidth: 0 }}>
          {/* 로고는 앞 칸(브리핑)으로 돌아가는 길이다 — 원작 로비의 로고가 /intro 로 갔던 자리다. 이제 정말 /intro 다 */}
          <Link to="/intro" className="bl-logo" style={{ textDecoration: 'none' }}>
            Who is human
          </Link>
          {/*
            ★ 탭은 **링크가 아니라 버튼이다** (원작 2026-08-07 결정 그대로). 「기록」이 링크였을 때는
              누르면 다른 화면으로 떠났다가 돌아와야 했다. 지금은 가운데 칸만 바뀌므로 갈 곳이 없다.
          */}
          <nav className="bl-nav">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`bl-navbtn${t.key === tab ? ' bl-navbtn--on' : ''}`}
                aria-current={t.key === tab ? 'page' : undefined}
                onClick={() => {
                  setTab(t.key);
                }}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/*
            ★ **이름은 한 번만 선다** (2026-08-31 사용자: "이름 누르면 로그아웃있고 그래야하는데").
              전에는 여기 이름을 글자로 세우고 그 옆에 계정 단추를 뒀다. 로그인한 사람에게는
              같은 이름이 두 번 나왔고 (useAccountSync 가 둘을 맞춘다), 정작 **누를 수 있는
              쪽이 어느 것인지**가 안 보였다 — 사용자는 글자 쪽을 눌렀다.
              이제 계정 칩이 그 이름을 그린다. 누르면 메뉴가 열린다 (shared/AccountButton).

            게스트 이름은 계정이 없어서 칩이 안 서는 자리다. 그때만 이 글자가 대신 선다 —
            이름이 어디에도 안 보이면 「내가 지금 누구로 있는지」를 알 길이 없다.
          */}
          {named ? null : (
            <span className="bl-label" style={{ color: nickname ? 'var(--bl-line)' : 'var(--bl-red)' }}>
              {nickname || '닉네임 없음'}
            </span>
          )}
          <AccountButton className="bl-navbtn" />
          {/*
            ★ `← 처음` 을 걷었다 (2026-08-31 사용자: "처음 없애줘"). 저건 개발용 문 목록(/ 의
              Launcher)으로 가는 길이라, 게임을 하러 온 사람에게는 내 이름 바로 옆에 서 있을
              까닭이 없는 글자였다. 브리핑으로 돌아가는 길은 왼쪽 로고가 들고 있다.
              (같은 지시로 /intro 머리말에서도 빠져 있다 — Intro.tsx)
          */}
          <SfxToggle className="bl-navbtn" />
        </div>
      </header>

      {/* .bl-wake — 판이 한 장씩 순서대로 선다. 게임 화면은 켜지고, 웹 페이지는 그냥 있다 (live.css) */}
      <div className="bl-body bl-wake">
        <aside className="bl-side bl-wake">
          <AgentPanel nickname={nickname} onAsk={() => setNameOpen(true)} />
          <RecentPanel onEnter={enterRoom} />
        </aside>

        <main className="bl-main">
          {error ? <p className="bl-alert" role="alert">{error}</p> : null}
          {tab === 'history' ? (
            <HistoryPanel onEnter={enterRoom} />
          ) : (
            // .bl-lift — 하나 남은 판 안에서 방 제목과 인원만 키운다 (live.css)
            <Panel title="열린 방" className="bl-grow bl-lift">
              <div className="bl-tools">
                <div className="bl-search">
                  <SearchIcon />
                  <input
                    className="bl-field"
                    type="text"
                    value={query}
                    maxLength={MAX_ROOM_NAME_LEN}
                    placeholder="방 제목으로 찾기"
                    aria-label="방 제목 검색"
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                {/*
                  ★ 「코드로 입장」을 검색칸 옆이 아니라 「방 만들기」 옆에 둔다 (원작 결정).
                    검색칸은 아래 목록을 **좁히고**, 코드로 입장은 목록에 없는 방으로 **건너뛴다**.
                    나란히 두면 같은 기능의 두 입구로 읽힌다 — 움직이는 것끼리 오른쪽에 모은다.
                */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  {/*
                    ★ 목록은 5초마다 저절로 다시 읽는다 (useRooms). 그래도 이 단추를 둔다 —
                      친구가 방을 만들었다는 말을 듣고 기다리는 사람에게 5초는 길고,
                      기다리는 동안 "이 화면이 살아 있나"를 확인할 방법이 없으면 새로고침(F5)을 누른다.
                  */}
                  <button type="button" className="bl-btn bl-edge" data-sfx="clank" onClick={refresh} title="목록 다시 읽기">
                    <RefreshIcon /> 새로고침
                  </button>
                  <button type="button" className="bl-btn bl-edge" data-sfx="open" onClick={() => setCodeOpen(true)}>
                    <LockIcon /> 코드로 입장
                  </button>
                  <button
                    type="button"
                    className="bl-btn bl-btn--go bl-edge"
                    data-sfx="open"
                    onClick={() => setCreateSeed({ code: randomRoomCode(), name: query.trim() })}
                  >
                    <PlusIcon /> 방 만들기
                  </button>
                </div>
              </div>

              {/* 목록 머리 — 줄과 **같은 격자**를 쓴다 (lobby.css 의 .bl-head / .bl-row) */}
              <div className="bl-head">
                <span className="bl-label">No</span>
                <SortHeader label="제목" col="title" sort={sort} onSort={(c) => setSort((s) => nextSort(s, c))} />
                <span className="bl-label">상태</span>
                <SortHeader label="인원" col="players" sort={sort} onSort={(c) => setSort((s) => nextSort(s, c))} />
              </div>

              <div className="bl-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {/*
                  ★ **세 가지 빈 화면을 구분한다.** 「읽는 중」·「못 읽었다」·「없다」를 한 모양으로
                    묶으면, 워커가 죽은 로비와 아무도 없는 로비가 똑같이 보인다 — 앞은 워커를 띄울
                    차례고 뒤는 방을 만들 차례라 사람이 할 일이 다르다 (rooms.ts 의 RoomsSnapshot).
                */}
                {snap === null ? (
                  // 읽는 중은 **글이 아니라 빈 줄 셋이다** (원작 RoomRowSkeleton). 「읽는 중…」 이라고
                  // 적으면 목록이 닿는 순간 글자가 줄로 바뀌면서 판이 한 번 튄다
                  [0, 1, 2].map((i) => <span key={i} className="bl-row bl-edge bl-row--ghost" aria-hidden />)
                ) : snap.status === 'offline' ? (
                  <div className="bl-empty">
                    <p className="bl-note" role="alert">{OPEN_ERROR_TEXT.offline}</p>
                    <p className="bl-note" style={{ fontSize: 11.5 }}>번호를 아는 방에는 그대로 들어간다.</p>
                    <button type="button" className="bl-btn bl-edge" data-sfx="clank" onClick={refresh}>
                      <RefreshIcon /> 다시 읽기
                    </button>
                  </div>
                ) : visible.length === 0 ? (
                  <div className="bl-empty">
                    <p className="bl-note">{query.trim() ? '그 제목으로 열린 방이 없다' : '지금 열린 방이 없다'}</p>
                    {/*
                      "위의 방 만들기로" 라고 손가락질하는 대신 여기서 바로 연다 (원작).
                      ★ 찾다 못 찾았으면 **찾던 말을 제목으로 들고** 팝업이 열린다 — '초보'를 찾아
                        아무것도 없으면 그 방을 만들고 싶은 게 자연스러운 다음 수다 (원작 onCreate(query)).
                    */}
                    <button
                      type="button"
                      className="bl-btn bl-btn--go bl-edge"
                      data-sfx="open"
                      onClick={() => setCreateSeed({ code: randomRoomCode(), name: query.trim() })}
                    >
                      <PlusIcon /> {query.trim() ? '이 이름으로 방 만들기' : '첫 방 만들기'}
                    </button>
                    {/* 번호를 쥐고 있던 사람을 위한 길은 여기 한 줄로 남긴다 (원작) */}
                    {query.trim() ? (
                      <p className="bl-note" style={{ fontSize: 11.5 }}>
                        방 번호를 알고 있으면 「코드로 입장」을 쓴다 — 제목 검색으로는 안 걸린다
                      </p>
                    ) : null}
                  </div>
                ) : (
                  visible.map((room, i) => <RoomRow key={room.code} room={room} index={i} onEnter={enterRoom} />)
                )}
              </div>
            </Panel>
          )}
        </main>
      </div>

      {createSeed !== null && (
        <CreateDialog
          initialCode={createSeed.code}
          initialName={createSeed.name}
          onClose={() => setCreateSeed(null)}
          onSubmit={createRoom}
        />
      )}
      {codeOpen && (
        <CodeDialog
          initial={joinCode}
          onChange={(v) => dispatch(mainActions.setJoinCode(v))}
          onClose={() => setCodeOpen(false)}
          onSubmit={enterRoom}
        />
      )}
      {nameOpen && (
        <NickDialog
          enter={false}
          onClose={() => setNameOpen(false)}
          onSubmit={(nick) => {
            // 게스트 이름은 이 브라우저 것이다 — 스토어와 저장소를 같이 맞춰 둔다 (shared/guest)
            dispatch(mainActions.setNickname(nick));
            saveGuestNick(nick);
            setNameOpen(false);
          }}
        />
      )}
      {nickAsk !== null && (
        <NickDialog
          onClose={() => setNickAsk(null)}
          onSubmit={(nick) => {
            dispatch(mainActions.setNickname(nick));
            setNickAsk(null);
            enterRoom(nickAsk, nick);
          }}
        />
      )}
    </div>
  );
}

/* ═════════════════════════════ 왼쪽 기둥 ═════════════════════════════ */

/**
 * 요원 카드 — 원작의 계정 칸 자리다. **여기는 이름을 보여 주는 자리지 고치는 자리가 아니다.**
 *
 * ┌─ 지문 · 상태 · 구역을 걷었다 (2026-08-31 사용자: "필요없는 내용 다 빼") ─┐
 * │ 세 줄 다 **뒷받침하는 데이터가 없는 값**이었다 — 지문은 이름에서 그 자리  │
 * │ 에서 만든 글자였고, 상태는 「이름이 있나 없나」를 한 번 더 말했고, 구역은  │
 * │ 지금 보고 있는 화면 이름이었다. 원작의 같은 자리(레벨 · 승률 · 판수)는     │
 * │ 진짜 전적에서 오는데, 이 저장소에는 그 표가 없다.                         │
 * │ 없는 것을 있는 것처럼 세우지 않는다 — 원작이 「고를 것이 없는 칸을 화면에  │
 * │ 두지 않는다」고 정한 것과 같은 규칙이다 (humanish app/main/lobby.tsx).     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 이름은 **여기서 안 고친다** (2026-08-31 사용자: "로비 왼쪽에서 닉네임    ─┐
 * │ 수정이되는데")                                                            │
 * │ 이 게임의 이름은 한 번 짓고 끝이다 (supabase/schema.sql 의                 │
 * │ freeze_display_name). 그런데 이 카드에 입력칸이 있는 한 그 규칙이 로비     │
 * │ 에서만 안 지켜졌다 — 계정 이름이 아직 없거나(이 게임에서 안 지은 사람),    │
 * │ 로그인이 꺼져 있어 이름을 확인할 수 없을 때 그 칸이 그대로 열렸고,         │
 * │ 거기 적힌 글자를 아무나 덮어쓸 수 있었다. **지켜지지 않는 칸을 화면에      │
 * │ 두는 게 제일 나쁘다** (만들기 팝업의 제목 칸을 뺐던 것과 같은 이유).       │
 * │                                                                          │
 * │ 그래서 카드는 읽기만 한다. 이름을 **정하는** 길은 없는 사람에게만 열리고,  │
 * │ 종류마다 한 곳뿐이다:                                                     │
 * │                                                                          │
 * │   로그인함   「이름 짓기」 → /account/nickname (features/lobby/Nickname)   │
 * │   게스트     「이름 정하기」 → 팝업 한 장. 그 이름은 이 브라우저에만 남는다 │
 * │                                                                          │
 * │ 이미 이름이 있는 사람에게는 **고치는** 손잡이가 없다. 바꾸는 길을 여기    │
 * │ 두면 「한 번 짓고 끝」이 다시 말뿐이 된다.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 대신 **나가는** 손잡이가 그 이름 뒤에 있다 ─────────────────────────────┐
 * │ (2026-08-31 사용자: "이거 휴머니시같이 만들어줘 · 누르면 로그아웃있고")    │
 * │ 앞서 머리말 칩만 그렇게 고쳤는데, 사용자가 누른 것은 이 칸의 이름이었다 —  │
 * │ 초상이 붙어 크게 서 있으니 여기가 「내 자리」로 보이는 게 당연하다. 이제   │
 * │ 로그인한 사람에게는 이 이름이 곧 단추이고, 누르면 머리말과 **같은 메뉴**   │
 * │ 가 열린다 (shared/AccountButton 의 AccountMenu).                          │
 * │                                                                          │
 * │ 게스트에게는 그대로 글자다 — 나갈 계정이 없는데 메뉴만 열리면, 열어 본     │
 * │ 사람에게 그건 비어 있는 서랍이다.                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function AgentPanel({ nickname, onAsk }: { nickname: string; onAsk: () => void }) {
  const account = useAccount();
  const has = nickname.trim().length > 0;
  /** 계정 이름. 있으면 이 칸의 이름은 **글자가 아니라 단추다** (파일 머리말의 마지막 칸) */
  const mine = account.status === 'in' ? account.displayName : null;

  return (
    // .bl-card--menu — 메뉴가 아래 「최근 방」 판 밑으로 들어가지 않게 이 판을 한 겹 올린다 (lobby.css)
    <Panel title="요원" className={mine ? 'bl-card--menu' : undefined}>
      <div className="bl-me">
        <span className="bl-me__face">
          <SeatArt />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          {mine ? (
            /*
             * ★ **이름을 누르면 메뉴가 열린다** (2026-08-31 사용자: "누르면 로그아웃있고").
             *   머리말 칩과 **같은 부품이다** (shared/AccountButton 의 AccountMenu) — 여기만
             *   따로 지으면 다음에 또 한쪽만 고쳐진다.
             *   아바타는 끈다: 왼쪽에 초상이 이미 붙어 있어 얼굴이 둘이 된다.
             */
            <AccountMenu name={mine} avatar={false} className="bl-me__who" menuClassName="bl-menu--under" />
          ) : has ? (
            // 게스트 이름 — 나갈 계정이 없으니 글자로 선다. 긴 이름은 잘린다 (bl-who__name)
            <p className="bl-who" style={{ margin: 0, maxWidth: '100%', fontSize: 14 }}>
              <span className="bl-who__name">{nickname}</span>
            </p>
          ) : account.status === 'loading' ? (
            /*
             * 계정을 아직 물어보는 중이다. **아무 손잡이도 내지 않는다** — 여기서 게스트 쪽
             * 단추를 먼저 세우면, 로그인해 둔 사람에게 「이름 정하기」가 한 번 번쩍였다가
             * 자기 이름으로 바뀐다. 잘못 누를 시간을 주는 깜빡임이다.
             */
            null
          ) : account.status === 'in' ? (
            /*
             * 로그인은 했는데 이 게임 이름이 없다. **여기서 지어 주지 않는다** — 계정 이름은
             * 서버에 적히는 값이라(worker/src/auth.ts 의 PUT /api/profile) 그 화면이 짓는다.
             * 여기서 받으면 게스트 이름만 생기고, 방에서는 ◈ 없이 서게 된다.
             */
            <Link
              to="/account/nickname"
              className="bl-btn bl-edge"
              data-sfx="open"
              style={{ textDecoration: 'none', justifyContent: 'center' }}
            >
              이름 짓기 <ArrowIcon />
            </Link>
          ) : (
            <button type="button" className="bl-btn bl-edge" data-sfx="open" style={{ justifyContent: 'center' }} onClick={onAsk}>
              이름 정하기 <ArrowIcon />
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}

/**
 * 최근 방 — 원작의 「최근 게임」 자리인데, **이쪽은 진짜다.**
 * 승패는 적을 데가 없지만 어디에 언제 있었는지는 이 브라우저가 안다 (rooms.ts 의 recentRooms).
 * 여기는 다섯 줄뿐이다 — 끝까지 보는 자리는 「기록」 탭 하나다 (원작과 같은 나눔).
 */
function RecentPanel({ onEnter }: { onEnter: (code: string) => void }) {
  const visits = recentRooms().slice(0, 5);
  return (
    <Quiet title="최근 방">
      {visits.length === 0 ? (
        <p className="bl-note" style={{ fontSize: 11.5 }}>아직 들어간 방이 없다.</p>
      ) : (
        /*
         * 다섯 줄이 저마다 케이스를 두르고 있었다 — 곁다리에 케이스가 다섯 개 더 생기는
         * 꼴이라, 그것만으로 화면의 「똑같은 것」 이 다섯 늘었다. 밑줄만 남긴다 (live.css).
         */
        <div>
          {visits.map((v) => (
            <button key={v.code} type="button" className="bl-quiet__row" data-sfx="clank" onClick={() => onEnter(v.code)}>
              <span className="bl-mono">#{v.code}</span>
              <span className="bl-label" style={{ letterSpacing: '0.06em' }}>{sinceLabel(v.at)}</span>
            </button>
          ))}
        </div>
      )}
    </Quiet>
  );
}

/**
 * 기록 탭 — 원작 history-panel.tsx 의 자리.
 *
 * 원작은 판이 끝날 때 match_results 에 적고 그걸 다시 읽어 승패를 보여줬다. 여기에는 그
 * 테이블이 없다. **없는 승패를 지어내지 않는다** — 대신 이 브라우저가 확실히 아는 것,
 * 어느 방에 언제 들어갔는지를 적는다. 판 결과를 적어 두는 자리가 생기면 이 판이 그대로 진짜가 된다.
 */
function HistoryPanel({ onEnter }: { onEnter: (code: string) => void }) {
  const visits = recentRooms();
  return (
    <Panel title="기록" className="bl-grow">
      {visits.length === 0 ? (
        <div className="bl-empty">
          <p className="bl-note">아직 들어간 방이 없다</p>
        </div>
      ) : (
        <div className="bl-scroll">
          {visits.map((v) => (
            <div key={v.code} className="bl-hist">
              <span className="bl-mono">#{v.code}</span>
              <span className="bl-label" style={{ letterSpacing: '0.06em' }}>{sinceLabel(v.at)}</span>
              <button type="button" className="bl-btn bl-edge" data-sfx="clank" style={{ padding: '5px 10px' }} onClick={() => onEnter(v.code)}>
                다시 들어가기
              </button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ═════════════════════════════ 목록의 한 줄 ═════════════════════════════ */

/**
 * 목록 머리의 한 칸 — 누르면 그 열로 정렬한다.
 *
 * ★ 화살표 자리는 늘 잡아 둔다 — 걸릴 때만 끼워 넣으면 누를 때마다 열 이름이 옆으로 밀린다.
 * ★ aria-sort 를 쓰지 않는다. 이건 진짜 표가 아니라 grid 로 짠 div·button 더미라 보조기기가
 *   무시한다. 그래서 **읽어 줄 문장을 aria-label 에 직접 적는다** (원작과 같은 이유).
 */
function SortHeader({
  label,
  col,
  sort,
  onSort,
}: {
  label: string;
  col: SortableCol;
  sort: Sort;
  onSort: (col: SortableCol) => void;
}) {
  const on = sort.key === col;
  const now = on ? (sort.dir === 'asc' ? '오름차순' : '내림차순') : null;
  const next = on ? (sort.dir === 'asc' ? '내림차순' : '오름차순') : '이 기준';
  return (
    <button
      type="button"
      className={`bl-sort${on ? ' bl-sort--on' : ''}`}
      aria-label={now ? `${label} ${now} 정렬 중. 누르면 ${next}` : `${label} 기준으로 정렬. 누르면 ${next}으로 정렬`}
      onClick={() => onSort(col)}
    >
      <span className="bl-label">{label}</span>
      <span className="bl-sortmark" aria-hidden>
        {on ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
      </span>
    </button>
  );
}

/**
 * 목록의 한 줄. **줄 전체가 버튼이다** (원작 결정) — 누를 수 있는 곳이 줄 안의 작은 사각형
 * 하나뿐이면, 줄을 눌러 본 사람은 아무 일도 안 일어나는 걸 겪는다. div+onClick 이 아니라
 * button 인 이유도 같다: div 는 탭으로 닿지도, 엔터로 눌리지도 않는다.
 */
function RoomRow({ room, index, onEnter }: { room: LobbyRoom; index: number; onEnter: (code: string) => void }) {
  const playing = room.phase !== 'lobby';
  const full = room.players >= room.capacity;
  return (
    <button
      type="button"
      className={`bl-row bl-edge${playing || full ? ' bl-row--busy' : ''}`}
      data-sfx="clank"
      aria-label={`${roomLabel(room)} — ${playing ? '게임 중' : '대기 중'}, ${room.players}/${room.capacity}명`}
      onClick={() => onEnter(room.code)}
    >
      {/* 자리를 세는 값이라 폭이 흔들리면 안 된다 — 등폭으로 둔다 */}
      <span className="bl-mono" style={{ fontSize: 12, color: 'var(--bl-faint)' }}>
        {index + 1}
      </span>
      <span className={room.name ? 'bl-title' : 'bl-title bl-mono'}>{roomLabel(room)}</span>
      {/* 색만으로 말하지 않는다 — 글자를 같이 적어야 색을 못 가리는 사람도 읽는다 */}
      <span>
        <span className={`bl-tag${playing ? '' : ' bl-tag--open'}`}>{playing ? '게임 중' : '대기중'}</span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span className={`bl-dot${full ? ' bl-dot--red' : ''}`} />
        <span className="bl-mono" style={{ fontSize: 12.5 }}>
          {room.players}/{room.capacity}
        </span>
      </span>
    </button>
  );
}

/* ═══════════════════════════════ 팝업 ═══════════════════════════════ */

/**
 * 이름 묻기 — **길을 막는 팝업이 아니라 길 위의 한 칸이다.**
 *
 * 방을 눌렀는데 이름이 없을 때만 뜨고, 치고 나면 **누르려던 그 방으로 그대로 이어진다**
 * (enterRoom 의 override). 원작에는 이 자리에 로그인이 있었다 — 로그인이 없는 판에서
 * 그 자리를 대신하는 것은 닉네임 한 줄뿐이다.
 *
 * ★ 「아무 이름이나」 를 같이 둔다. 이름을 짓느라 멈추는 사람이 실제로 많고,
 *   여기서 멈추면 판을 못 본다 — 자리 번호가 곧 정체가 되는 게임이라 이름은 껍데기다.
 */
function NickDialog({
  enter = true,
  onClose,
  onSubmit,
}: {
  /** 이 이름으로 **곧장 방에 들어가는** 길인가. 요원 카드에서 열면 이름만 정하고 닫힌다 */
  enter?: boolean;
  onClose: () => void;
  onSubmit: (nick: string) => void;
}) {
  const [nick, setNick] = useState('');
  const ok = nick.trim().length > 0;

  return (
    <div
      className="bl-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="닉네임"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="bl-modal bl-edge">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div className="bl-label" style={{ marginBottom: 5 }}>요원 등록</div>
            <h3 style={{ margin: 0, fontSize: 17, letterSpacing: '-0.01em' }}>닉네임을 정하라</h3>
          </div>
          <button type="button" className="bl-x" data-sfx="close" aria-label="닫기" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <input
          className="bl-field"
          value={nick}
          maxLength={NICK_MAX_LEN}
          autoFocus
          placeholder="예: 요원-3721"
          aria-label="닉네임"
          style={{ fontSize: 15 }}
          onChange={(e) => setNick(e.target.value)}
          onKeyDown={(e) => {
            // 입력칸은 「누를 수 있는 것」이 아니라 위임(UiSfx)이 안 듣는다 — 엔터로 가는 길에서는 여기서 낸다
            if (e.key === 'Enter' && ok) {
              playSfx('clank');
              onSubmit(nick.trim());
            }
          }}
        />

        <button
          type="button"
          className="bl-btn bl-btn--go bl-btn--wide bl-edge"
          data-sfx="clank"
          disabled={!ok}
          style={{ marginTop: 16 }}
          onClick={() => onSubmit(nick.trim())}
        >
          {enter ? '확인하고 들어가기' : '확인'} <ArrowIcon />
        </button>
        <button
          type="button"
          className="bl-btn bl-btn--wide bl-edge"
          style={{ marginTop: 8 }}
          onClick={() => setNick(`요원-${randomRoomCode()}`)}
        >
          아무 이름이나
        </button>
      </div>
    </div>
  );
}

/**
 * 「방 만들기」 — 제목을 짓고 번호를 정해 **등록소에 적는다** (features/lobby/rooms.ts 의 openRoom).
 *
 * ┌─ 제목 칸이 돌아왔다 (2026-08-31) ────────────────────────────────────────┐
 * │ 원작에는 있던 칸이다. 이 저장소에서는 한동안 빼 뒀는데, 이유가 "제목을    │
 * │ 적어 둘 서버가 없어서 지은 이름이 입장하는 순간 사라진다" 였다 —          │
 * │ **지켜지지 않는 칸을 화면에 두는 게 제일 나쁘다.** 이제 적어 둘 자리가    │
 * │ 생겼으므로(등록소 DO) 칸도 같이 돌아왔다.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 원작과 같은 뼈대 (humanish app/main/lobby.tsx 의 CreateDialog) ─────────┐
 * │ 「새 방」 라벨 → 제목 칸 → 글자 수 → 오류 → 「방 만들기」. **설명 문단이  │
 * │ 없다.** 원작이 그렇게 정한 이유를 그대로 따른다: 규칙(정원·시작 조건)은   │
 * │ 브리핑과 대기방이 더 정확한 자리에서 말하고, 세 군데로 갈리면 문구가       │
 * │ 어긋난다. 「이 번호가 곧 초대장」 같은 말도 적지 않는다 — 방에 들어가면    │
 * │ 머리말의 「초대 주소」가 그 값을 그대로 들고 있어서, 한 번 보면 설명보다   │
 * │ 빨리 안다.                                                                │
 * │                                                                          │
 * │ 원작과 다른 칸은 **번호** 하나다. 저쪽은 지은 이름이 그대로 입장 코드라   │
 * │ (codeFromName) 칸이 하나였지만, 여기 방은 숫자 하나로 열리는 DO 이고      │
 * │ (idFromName) 그 숫자가 곧 초대장이라 사람이 보고 고를 수 있어야 한다.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ★ 제목은 **선택이다.** 안 지으면 목록이 그 방을 #번호 로 부른다 (roomLabel).
 * ★ 거절당한 이유는 **이 안에서** 뜬다 (원작과 같다). 팝업을 닫고 화면 위쪽에 적으면
 *   방금 친 제목이 사라진 채로 이유만 남아서, 사람은 처음부터 다시 친다.
 */
function CreateDialog({
  initialCode,
  initialName,
  onClose,
  onSubmit,
}: {
  initialCode: string;
  /** 목록에서 찾다 못 찾고 넘어왔을 때 그 찾던 말. 없으면 빈 칸으로 연다 (원작 initialName) */
  initialName: string;
  onClose: () => void;
  /** 성공이면 null, 거절이면 그 이유를 돌려준다 (이 팝업이 그대로 서서 적는다) */
  onSubmit: (name: string, code: string) => Promise<string | null>;
}) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = ROOM_CODE_RE.test(code) && !busy;

  const submit = () => {
    if (!ok) return;
    setBusy(true);
    setError(null);
    void onSubmit(name, code).then((why) => {
      // 성공하면 화면이 곧 바뀐다 — 그때는 이 팝업의 상태를 되돌릴 이유가 없다
      if (why === null) return;
      setBusy(false);
      setError(why);
    });
  };

  /*
   * Esc 는 **창에 건다** (원작과 같다). 판 안쪽에만 걸면 입력칸 밖을 눌러 초점을 잃은 순간
   * 안 먹는다. 만드는 중에는 닫지 않는다 — 방은 생겼는데 화면만 안 넘어간 자리가 된다.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div
      className="bl-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="방 만들기"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="bl-modal bl-edge">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div className="bl-label" style={{ marginBottom: 5 }}>새 방</div>
            <h3 style={{ margin: 0, fontSize: 17, letterSpacing: '-0.01em' }}>방 만들기</h3>
          </div>
          <button type="button" className="bl-x" data-sfx="close" aria-label="닫기" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {/*
          ★ 등폭(bl-mono)을 붙이지 않는다. 아래 번호 칸과 다른 점이 이것 하나다 —
            저쪽은 숫자를 가지런히 세워야 하지만 여기는 사람이 쓴 말이라 자간만 벌어진다 (원작).
          ★ 자리글에는 **화면으로 알 수 없는 것만** 적는다: 비워도 된다는 것과, 그때 무슨 일이
            일어나는가. 라벨이 이미 「방 만들기」라 나머지는 다시 말할 필요가 없다 (원작).
        */}
        <div className="bl-label" style={{ marginBottom: 5 }}>제목</div>
        <input
          className="bl-field"
          value={name}
          maxLength={MAX_ROOM_NAME_LEN}
          autoFocus
          placeholder="비우면 번호로 부른다"
          aria-label="방 제목"
          style={{ fontSize: 15 }}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            // 치고 나서 마우스로 버튼을 찾아가게 두지 않는다 (원작)
            if (e.key === 'Enter' && ok) {
              playSfx('clank');
              submit();
            }
          }}
        />
        <div style={{ margin: '6px 0 14px', textAlign: 'right' }}>
          <span className="bl-label">
            {name.length} / {MAX_ROOM_NAME_LEN}
          </span>
        </div>

        <div className="bl-label" style={{ marginBottom: 5 }}>방 번호</div>
        <input
          className="bl-field bl-mono"
          value={code}
          inputMode="numeric"
          maxLength={6}
          aria-label="방 번호"
          style={{ fontSize: 17, letterSpacing: '0.18em', textAlign: 'center', marginBottom: 16 }}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && ok) {
              playSfx('clank');
              submit();
            }
          }}
        />

        {error ? (
          <p className="bl-alert" role="alert" style={{ marginBottom: 12 }}>
            {error}
          </p>
        ) : null}

        <button
          type="button"
          className="bl-btn bl-btn--go bl-btn--wide bl-edge"
          data-sfx="clank"
          disabled={!ok}
          onClick={submit}
        >
          {busy ? '만드는 중…' : '방 만들기'} <ArrowIcon />
        </button>
        <button
          type="button"
          className="bl-btn bl-btn--wide bl-edge"
          style={{ marginTop: 8 }}
          disabled={busy}
          onClick={() => setCode(randomRoomCode())}
        >
          다른 번호 뽑기
        </button>
      </div>
    </div>
  );
}

/**
 * 「코드로 입장」 — 목록에 없는 방으로 **건너뛰는** 한 칸짜리 폼.
 *
 * ★ 등록소를 거치지 않는다. 방은 목록이 아니라 번호로 열리기 때문이다 (같은 번호를 친
 *   사람끼리 같은 DO 에 모인다 — worker/src/index.ts 의 idFromName). 그래서 목록이 통째로
 *   죽어 있어도 이 길은 산다. 만들기와 껍데기를 나눈 이유도 그것이다: 하는 일이 다르다.
 */
function CodeDialog({
  initial,
  onChange,
  onClose,
  onSubmit,
}: {
  initial: string;
  onChange?: (v: string) => void;
  onClose: () => void;
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = useState(initial);
  const ok = ROOM_CODE_RE.test(code);

  const set = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    onChange?.(digits);
  };

  // Esc 는 창에 건다 — 판 안쪽에만 걸면 초점이 밖으로 나간 순간 안 먹는다 (CreateDialog 와 같다)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="bl-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="코드로 입장"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bl-modal bl-edge">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div className="bl-label" style={{ marginBottom: 5 }}>방 번호</div>
            <h3 style={{ margin: 0, fontSize: 17, letterSpacing: '-0.01em' }}>코드로 입장</h3>
          </div>
          <button type="button" className="bl-x" data-sfx="close" aria-label="닫기" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <input
          className="bl-field bl-mono"
          value={code}
          inputMode="numeric"
          maxLength={6}
          autoFocus
          placeholder="숫자 1~6자리"
          aria-label="방 번호"
          style={{ fontSize: 17, letterSpacing: '0.18em', textAlign: 'center', marginBottom: 16 }}
          onChange={(e) => set(e.target.value)}
          onKeyDown={(e) => {
            // 한 칸짜리 폼이다. 치고 나서 마우스로 버튼을 찾아가게 두지 않는다
            if (e.key === 'Enter' && ok) {
              playSfx('clank');
              onSubmit(code);
            }
          }}
        />

        <button
          type="button"
          className="bl-btn bl-btn--go bl-btn--wide bl-edge"
          data-sfx="clank"
          disabled={!ok}
          onClick={() => onSubmit(code)}
        >
          입장하기 <ArrowIcon />
        </button>
      </div>
    </div>
  );
}

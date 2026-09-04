/**
 * 게임 대기방 (/lobby?code=1234) — humanish components/room-lobby.tsx 를 옮긴 화면.
 *
 * ┌─ 원작과 다른 점: **여기는 진짜다** ──────────────────────────────────────┐
 * │ 원작의 대기방은 supabase 의 방 테이블(public_players · lobby_line ·      │
 * │ is_ready)을 읽었다. 이 프로젝트에는 그 테이블이 없다. 대신 **이미 있는   │
 * │ 것**이 있다 — 방 하나짜리 Durable Object 와 그 WebSocket 이다            │
 * │ (worker/src/room-do.ts). 3D 월드가 쓰는 바로 그 방이다.                  │
 * │                                                                          │
 * │   좌석 · 이름     welcome / player_joined / player_left   ← 서버가 준다   │
 * │   말풍선          chat                                    ← 서버가 돌린다 │
 * │   방장            방에서 가장 낮은 좌석                    ← 서버와 같은 규칙│
 * │   게임 시작       broadcast (호스트 좌석만 낼 수 있다)     ← 서버가 막는다 │
 * │                                                                          │
 * │ 그래서 이 화면에 뜨는 사람은 **정말로 그 방에 붙어 있는 사람**이고,       │
 * │ 「게임 시작」을 누르면 그 방의 전원이 같은 순간에 복도로 넘어간다.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 준비 상태를 말로 나르는 이유 ───────────────────────────────────────────┐
 * │ 프로토콜(src/world/mp/protocol.ts)에는 「준비」가 없다. 넣으려면 워커와   │
 * │ 클라를 같이 고치고 워커를 먼저 배포해야 하는데, 그건 이 화면 하나 때문에  │
 * │ 방 계약을 늘리는 일이다. 그래서 준비는 **채팅 한 줄로 말한다** —          │
 * │ '준비 완료' / '준비 해제'. 이미 있는 통로라 서버를 안 건드린다.           │
 * │                                                                          │
 * │ 대신 약점이 하나 있다: 채팅에는 기록이 없어서 **늦게 들어온 사람은 그전에 │
 * │ 오간 준비를 못 듣는다.** 그래서 누가 들어오면 준비한 사람이 스스로 한 번  │
 * │ 더 말한다 (아래 onJoined). 서버가 상태를 들어 주는 날이 오면 이 대목이    │
 * │ 통째로 사라진다 — 그때 지울 곳은 여기 한 군데다.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 소리 (shared/sfx.ts) ───────────────────────────────────────────────────┐
 * │ 이 화면의 소리는 **버튼이 아니라 사건에서 난다.** 준비·시작·말은 서버가   │
 * │ 방 전원에게 돌려줄 때 울린다 — 눌렀는데 서버가 안 받아 줬으면 소리도      │
 * │ 안 나야 맞고, 그래야 옆자리가 준비한 것도 화면을 안 보고 안다.            │
 * │ 누르는 순간의 딸깍은 App 에 달린 위임(shared/UiSfx)이 알아서 낸다.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isHostSeat } from '@/shared/useBroadcastRoom';
import { AccountName } from '@/shared/AccountButton';
import { SfxToggle } from '@/shared/SfxToggle';
import { playSfx } from '@/shared/sfx';
// three.js 를 끌어오지 않으려고 '@/world' 등록부가 아니라 파일을 직접 본다 (로비는 3D 를 안 받는다)
import { WorldConnection, worldWsBase, type WorldEvents } from '@/world/net/connection';
import { ROOM_MAX_PLAYERS, ROOM_START_LINE } from '@/world/mp/constants';
import type { PlayerSnapshot } from '@/world/mp/protocol';
import {
  ArrowLeftIcon,
  Backdrop,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  CrownIcon,
  ExitIcon,
  Panel,
  PlayIcon,
  SeatArt,
} from './console';
import { Launch, LinkBoot } from './live';
import { fetchRooms } from './rooms';
import { warmCast } from '@/lab/cast-warm';

/* ───────────────────────────── 이 방의 약속 ───────────────────────────── */

/** 말풍선이 머무는 시간. 기록이 아니라 지나가는 말이다 (원작 LOBBY_LINE_TTL_MS) */
const LINE_TTL_MS = 6000;
/** 같은 사람이 말하는 최소 간격. 서버 한도(CHAT_MIN_INTERVAL_MS 600ms)보다 넉넉히 잡는다 */
const SAY_COOLDOWN_MS = 1200;

/** 준비를 나르는 두 줄. 이건 발화가 아니라 상태라 말풍선으로 띄우지 않는다 (원작과 같은 취급) */
const READY_LINE = '준비 완료';
const UNREADY_LINE = '준비 해제';

/**
 * 시작 신호. 리더 방송으로 나가고, 이 방의 대기방 전원이 이 문장을 보고 같이 움직인다.
 * 서버가 호스트 좌석만 방송을 내보내게 막으므로(room-do.ts) 아무나 판을 열 수 없다.
 *
 * ★ 문장의 원본은 **워커와 나눠 쓰는 파일**에 있다 (src/world/mp/constants 의 ROOM_START_LINE).
 *   방(DO)도 이 문장을 읽어야 해서다 — 이 방송이 나가면 로비 목록의 그 줄이 「게임 중」으로 바뀐다.
 */
const START_LINE = ROOM_START_LINE;

/**
 * 판이 서는 곳 — **복도**(/world)다. 거기서부터 이야기가 이어진다:
 * 복도 → 열린 격납문 → 중앙 시설 → 검문 → 검증실 → 검문소 (shared/start.ts 머리말).
 *
 * ★ 방 번호를 **그대로 들고 간다.** /play 는 혼자 도는 새 방을 뽑지만(storyStartHref),
 *   여기는 이미 모인 방이 있다 — 같은 번호로 들어가야 대기방에서 만난 사람들이 같은 복도에 선다.
 */
const startHref = (code: string, nick: string) => `/world?code=${code}&nick=${encodeURIComponent(nick)}`;

/**
 * 고를 수 있는 말. 원작은 서버에서 목록을 받았지만(cfg.lines) 여기서는 화면이 들고 있다.
 *
 * ★ 규칙을 말하는 줄을 넣지 않는다. 인원·AI 수·역할을 입에 올리는 순간 그게 안내문이 되고,
 *   대기방에서 이미 판이 시작된다 (PLANNING §3 I1).
 */
const LINES = ['잘 부탁한다', '조금만 기다려', '자리 있나', '한 판만 더', '누가 사람이지', 'ㅋㅋㅋ', '금방 온다', '나 나간다'];

const ERROR_TEXT: Record<string, string> = {
  version_mismatch: '클라이언트와 서버 버전이 다르다. 새로고침해 보라',
  room_full: `방이 가득 찼다 (최대 ${ROOM_MAX_PLAYERS}명)`,
  bad_request: '방 번호나 닉네임이 잘못됐다',
  // 들어온 뒤에 오는 유일한 이유다 (protocol.ts 의 ErrorCode). 방장이 자리를 비웠다
  kicked: '방장이 내보냈다',
  // 내보내진 **계정**이 다시 문을 두드렸다 (room-do.ts 의 밴 명부). 방이 다 비면 풀린다
  banned: '이 방에서 내보내진 계정이다 — 방이 새로 서기 전에는 못 들어간다',
  connection_failed: '서버에 연결하지 못했다 — 워커(npm run worker:dev)가 떠 있나?',
};

/** 화면이 쓰는 만큼의 사람. 좌표·애니메이션은 대기방의 관심사가 아니다 */
interface Seat {
  id: string;
  seat: number;
  nickname: string;
  /** 서명된 입장권으로 들어온 사람인가 — 이름에 점을 붙이는 데만 쓴다 (protocol.ts 의 authed) */
  authed?: boolean;
}
const toSeat = (p: PlayerSnapshot): Seat => ({ id: p.id, seat: p.seat, nickname: p.nickname, authed: p.authed });

/* ═══════════════════════════════ 화면 ═══════════════════════════════ */

export function Waitroom({ code, nickname }: { code: string; nickname: string }) {
  const navigate = useNavigate();

  const [status, setStatus] = useState<'connecting' | 'in' | 'error'>('connecting');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  /** 지금 떠 있는 말풍선. 사람마다 마지막 한 줄만 든다 — 쌓이지 않는다 */
  const [lines, setLines] = useState<Record<string, { text: string; at: number }>>({});
  /** 준비했다고 말한 사람들 */
  const [ready, setReady] = useState<string[]>([]);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  /** 시작 방송을 받았다 — 카운트다운이 돌고, 다 세면 복도로 넘어간다 (live.tsx 의 Launch) */
  const [launching, setLaunching] = useState(false);

  /** 이 방의 제목. 등록소에 적힌 값이다 — 없으면 (코드로 그냥 만든 방) 머리말은 번호만 세운다 */
  const [title, setTitle] = useState<string | null>(null);

  const conn = useRef<WorldConnection | null>(null);
  /** 콜백 안에서 "내가 준비했나"를 보려면 ref 여야 한다 — 소켓은 한 번만 열리고 콜백은 그때 굳는다 */
  const myReady = useRef(false);
  const selfIdRef = useRef<string | null>(null);

  /*
   * 방 제목을 한 번 읽는다 (등록소 — features/lobby/rooms.ts).
   *
   * ★ 소켓으로 받지 않는다. 제목을 welcome 에 실으려면 방 계약(protocol.ts)을 늘려야 하고,
   *   그러면 워커를 먼저 배포해야 하는 짐이 영구히 남는다 — 판에 아무 영향이 없는 글자 하나 때문에.
   * ★ 실패하면 그냥 없는 채로 둔다. 제목은 장식이고, 이 화면의 일은 방에 붙는 것이다.
   */
  useEffect(() => {
    let alive = true;
    void fetchRooms().then((snap) => {
      if (alive && snap.status === 'ok') setTitle(snap.rooms.find((r) => r.code === code)?.name ?? null);
    });
    return () => {
      alive = false;
    };
  }, [code]);

  /* ── 방에 붙는다 ── */
  useEffect(() => {
    if (!nickname.trim()) {
      setStatus('error');
      setErrorText('닉네임이 없다 — 로비에서 먼저 이름을 정하라');
      return;
    }

    const events: WorldEvents = {
      onWelcome: (id, players) => {
        selfIdRef.current = id;
        setSelfId(id);
        setSeats(players.map(toSeat));
        setStatus('in');
        setErrorText(null);
      },
      onJoined: (p) => {
        setSeats((cur) => (cur.some((s) => s.id === p.id) ? cur : [...cur, toSeat(p)]));
        playSfx('join'); // 자리가 하나 찼다 — 좌석판을 안 보고 있어도 안다
        /*
         * 새로 온 사람에게 다시 말해 준다 — 채팅에는 기록이 없어서 그 전에 한 말은 못 듣는다.
         * 여럿이 동시에 들어오면 서버의 채팅 간격 제한(600ms)에 걸리므로 조금씩 흩어서 보낸다.
         */
        if (myReady.current) {
          const jitter = 250 + Math.random() * 700;
          setTimeout(() => {
            if (myReady.current) conn.current?.sendChat(READY_LINE);
          }, jitter);
        }
      },
      onLeft: (id) => {
        playSfx('leave');
        setSeats((cur) => cur.filter((s) => s.id !== id));
        setReady((cur) => cur.filter((r) => r !== id));
        setLines((cur) => {
          if (!(id in cur)) return cur;
          const next = { ...cur };
          delete next[id];
          return next;
        });
      },
      onMoved: () => {}, // 대기방은 좌표를 쓰지 않는다
      onChat: (id, _nick, text) => {
        // 준비는 상태다 — 말풍선으로 흘리지 않고 좌석에 붙인다 (파일 머리말)
        if (text === READY_LINE || text === UNREADY_LINE) {
          const on = text === READY_LINE;
          // 준비가 **서버에 걸렸을 때** 확인음이 난다 (파일 머리말의 소리 규칙)
          playSfx(on ? 'ready' : 'click');
          if (id === selfIdRef.current) myReady.current = on;
          setReady((cur) => (on ? (cur.includes(id) ? cur : [...cur, id]) : cur.filter((r) => r !== id)));
          return;
        }
        /*
         * 서버가 찍은 ts 가 아니라 **받은 순간**을 적는다. 말풍선의 수명은 "내가 이 말을 본 지
         * 얼마나 됐나"라서, 브라우저 시계가 서버보다 몇 초 어긋나 있으면 뜨자마자 사라지거나
         * 영영 안 걷힌다. 순서를 다투는 값이 아니라 이쪽이 맞다.
         */
        playSfx('talk');
        setLines((cur) => ({ ...cur, [id]: { text, at: Date.now() } }));
      },
      onBroadcast: (text) => {
        // 리더가 판을 열었다. 방 전원이 같은 순간에 같은 문장을 받는다 — 다 같이 넘어간다
        /*
         * 바로 넘어가지 않고 **셋을 센다** (live.tsx 의 Launch).
         * 방송은 방 전원에게 같은 순간에 닿으므로(room-do.ts 의 broadcast 는 보낸 사람에게도
         * 간다) 세 화면의 3·2·1 이 함께 돈다 — 혼자 세는 숫자는 시간 낭비지만 같이 세는
         * 숫자는 출발선이다. 격납문 소리는 다 센 순간에 난다.
         */
        if (!text.startsWith(START_LINE)) return;
        /*
         * 판이 열렸다. **여기서 성격 다섯을 짓기 시작한다** (src/lab/cast-warm.ts).
         * 이 방 사람들은 이제 복도부터 걸어서 검문소까지 간다 — 그 몇 분이 생성 시간을
         * 통째로 덮는다. 거기 도착해서 짓기 시작하면 문 앞에서 다시 기다려야 한다.
         * 크레딧이 나가는 호출이지만 판당 한 번이고, 어차피 판이 열렸으면 반드시 필요한 값이다.
         */
        warmCast();
        setLaunching(true);
      },
      onError: (c) => {
        setStatus('error');
        setErrorText(ERROR_TEXT[c] ?? c);
      },
      onClose: () => {
        setStatus('error');
        setErrorText('연결이 끊겼다');
      },
    };

    const c = new WorldConnection();
    conn.current = c;
    c.connect(worldWsBase(), code, nickname.trim(), events);
    return () => {
      c.close();
      conn.current = null;
      myReady.current = false;
    };
  }, [code, nickname, navigate]);

  /*
   * 지나간 말을 걷는 시계. **떠 있는 말이 있을 때만 돈다** — 빈 대기방에서 초당 두 번씩
   * 다시 그릴 이유가 없다 (원작 useLineTick 과 같은 이유).
   * 지우기까지 여기서 한다: 남겨 두면 걷힌 말 때문에 시계가 영영 돌게 된다.
   */
  const [, retick] = useState(0);
  const hasLines = Object.keys(lines).length > 0;
  useEffect(() => {
    if (!hasLines) return;
    const t = setInterval(() => {
      setLines((cur) => {
        const now = Date.now();
        const kept = Object.entries(cur).filter(([, v]) => now - v.at < LINE_TTL_MS);
        return kept.length === Object.keys(cur).length ? cur : Object.fromEntries(kept);
      });
    }, 500);
    return () => clearInterval(t);
  }, [hasLines]);

  /*
   * 쿨다운이 끝나면 화면이 **스스로 깨어난다.** 이게 없으면 남은 시간을 렌더 중에 재기만 하고
   * 다시 그릴 계기가 없어서, 준비를 한 번 누른 뒤로 대화 버튼이 영영 잠겨 있었다.
   * 식는 동안만 돈다 — 다 식으면 0 으로 놓아 스스로 멎는다.
   */
  useEffect(() => {
    if (cooldownUntil === 0) return;
    const t = setInterval(() => {
      if (Date.now() >= cooldownUntil) setCooldownUntil(0);
      else retick((n) => n + 1);
    }, 250);
    return () => clearInterval(t);
  }, [cooldownUntil]);

  /* ── 이 방의 상태 ── */
  const bySeat = useMemo(() => new Map(seats.map((s) => [s.seat, s])), [seats]);
  const mine = selfId ? seats.find((s) => s.id === selfId) ?? null : null;
  /** 서버와 **같은 규칙**을 쓴다 — 방에서 가장 낮은 좌석이 방장이다 (shared/useBroadcastRoom) */
  const isHost = isHostSeat(seats.map((s) => s.seat), mine?.seat);
  const hostSeat = seats.length > 0 ? Math.min(...seats.map((s) => s.seat)) : null;
  const seated = seats.length;
  const iAmReady = selfId !== null && ready.includes(selfId);

  /**
   * 지금 시작할 수 없는 이유. 없으면 null.
   * 문구가 한 곳에서만 나온다 — 여러 군데로 갈리면 눌러 보고 나서야 다른 말을 듣게 된다 (원작 START_BLOCK_MESSAGE).
   */
  const blocked: string | null =
    seated < 2
      ? '두 명은 있어야 시작한다'
      : seats.some((s) => s.seat !== hostSeat && !ready.includes(s.id))
        ? '전원이 준비해야 시작한다'
        : null;

  const cooling = cooldownUntil > Date.now();

  const say = useCallback((text: string) => {
    if (!conn.current?.sendChat(text)) return;
    setCooldownUntil(Date.now() + SAY_COOLDOWN_MS);
  }, []);

  const toggleReady = () => {
    const next = !iAmReady;
    // 내 표시는 서버가 되돌려주는 줄로 켜진다 — 채팅이 로컬 에코를 안 하는 것과 같은 규칙이다
    say(next ? READY_LINE : UNREADY_LINE);
  };

  const leave = () => {
    conn.current?.close();
    navigate('/lobby');
  };

  /* ── 그린다 ── */
  return (
    <div className="bl">
      <Backdrop />

      <header className="bl-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          {/*
            ★ 이 화살표도 **나가기와 같은 동작이다** (원작). 링크로 두면 "로비로 돌아간다"는 같은 뜻의
              조작이 소켓을 닫는 것과 안 닫는 것으로 갈린다 — 화면에는 그 차이가 안 보인다.
          */}
          <button type="button" className="bl-navbtn" data-sfx="close" onClick={leave}>
            <ArrowLeftIcon /> 로비
          </button>
          <span style={{ width: 1, height: 16, background: 'rgba(111,211,255,0.25)' }} />
          <h1 className="bl-logo" style={{ margin: 0 }}>ROOM #{code}</h1>
          {/* 제목이 있으면 번호 **옆에** 선다 — 번호를 밀어내지 않는다. 초대장은 여전히 번호다 */}
          {title ? (
            <span className="bl-title bl-top__wide" title={title}>
              {title}
            </span>
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <CopyCodeButton code={code} />
          <span className="bl-label bl-top__wide" style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--bl-line)' }}>
            <span className="bl-dot" />
            {seated} / {ROOM_MAX_PLAYERS} 접속중
          </span>
          {/*
            ★ 이름 자리는 **로비의 계정 칩과 같은 부품이다** (shared/AccountButton 의
              AccountName). 두 벌로 갈리면 방에 들어가는 순간 같은 이름이 다른 크기·다른
              색으로 다시 그려져서, 같은 앱인데 화면이 갈아끼워진 것처럼 보인다 (원작 top-bar).

            여기는 **메뉴를 달지 않는다.** 방 안에서 나가는 문은 「로비」 하나여야 한다 —
              소켓을 닫는 길이 둘로 갈리면 어느 쪽이 방을 떠난 것인지 화면에 안 보인다.
          */}
          <span className="bl-who bl-top__wide">
            <AccountName name={mine?.nickname ?? nickname} size={20} />
          </span>
          <SfxToggle className="bl-navbtn" />
        </div>
      </header>

      <div className="bl-body bl-wake">
        <main className="bl-main">
          {/*
            ★ 실패 문구는 **좌석 목록 밖**이다 (원작 2026-08-07). 안에 두면 아래를 보고 있을 때
              뜬 글이 화면 밖에 있어서, 누른 것은 안 먹었는데 이유는 안 보이는 상태가 된다.
          */}
          {errorText ? (
            <p className="bl-alert" role="alert">
              {errorText}
            </p>
          ) : null}

          <Panel title={`참가자 ${seated}/${ROOM_MAX_PLAYERS}`} className="bl-grow">
            <ul className="bl-seats">
              {Array.from({ length: ROOM_MAX_PLAYERS }, (_, i) => i + 1).map((n) => {
                const p = bySeat.get(n) ?? null;
                const line = p ? lines[p.id] : undefined;
                const fresh = line !== undefined && Date.now() - line.at < LINE_TTL_MS;
                const settled = p != null && ready.includes(p.id);
                return (
                  <li
                    key={n}
                    className={[
                      'bl-seat',
                      'bl-edge',
                      p == null ? 'bl-seat--empty' : '',
                      /*
                       * 빈칸 클래스가 떨어지는 순간 이 클래스가 붙고, CSS 애니메이션이 한 번 돈다
                       * (live.css 의 .bl-arrive). 상태를 따로 안 들고도 「방금 앉았다」가 보인다 —
                       * 처음 붙을 때는 세 칸이 차례로 켜지는 것처럼 보이는데, 그것도 맞는 그림이다.
                       */
                      p != null ? 'bl-arrive' : '',
                      p != null && p.id === selfId ? 'bl-seat--me' : '',
                      settled ? 'bl-seat--ready' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-label={
                      p
                        ? `${n}번 자리 ${p.nickname}${p.authed ? ' 확인된 이름' : ''}${settled ? ' 준비 완료' : ''}`
                        : `${n}번 빈자리`
                    }
                  >
                    <SeatArt />
                    {/* 빈 자리만 훑는다 — 이 방이 아직 사람을 기다리고 있다는 표시 (live.css) */}
                    {p == null ? <span className="bl-scan" aria-hidden /> : null}
                    <span className="bl-seat__num">{String(n).padStart(2, '0')}</span>
                    {/* 방장은 왕관 하나로 말한다 — 「host」 네모 태그는 이름만큼 눈에 띄었다 (원작) */}
                    {p != null && p.seat === hostSeat ? (
                      <span className="bl-seat__host" title="방장">
                        <CrownIcon />
                      </span>
                    ) : null}
                    {/*
                      내보내기 (원작 humanish 의 /api/room/kick). **방장에게만, 남의 자리에만** 뜬다 —
                      서버도 같은 규칙으로 한 번 더 본다 (room-do.ts 의 kick). 화면에서 감추는 것은
                      실수를 줄이는 것이지 권한이 아니다.
                      로그인한 사람을 내보내면 **계정째 적힌다** — 같은 계정으로는 방이 다 비기
                      전에 못 돌아온다 (room-do.ts 의 밴 명부). 게스트는 소켓만 끊긴다.
                    */}
                    {isHost && p != null && p.seat !== hostSeat ? (
                      <button
                        type="button"
                        className="bl-seat__kick"
                        data-sfx="deny"
                        title="내보내기"
                        aria-label={`${p.nickname} 내보내기`}
                        onClick={() => conn.current?.sendKick(p.id)}
                      >
                        <CloseIcon />
                      </button>
                    ) : null}
                    {fresh && line ? <span className="bl-bubble">{line.text}</span> : null}
                    {settled ? <span className="bl-stamp">READY</span> : null}
                    <span className="bl-plate">
                      {/*
                        ★ 확인된 이름에만 붙는 점 (2026-08-30). 이게 없으면 로그인의 값어치가
                          화면에 하나도 안 보인다 — 게스트는 남의 이름을 그대로 쳐 넣을 수 있고,
                          그러면 두 이름이 똑같이 생겼다. 서버가 서명으로 확인한 쪽에만 표를 낸다
                          (worker/src/room-do.ts 의 authed). 「이 이름은 진짜 그 사람 것」까지만
                          말하고, 인간인지 AI 인지는 말하지 않는다.
                      */}
                      {p?.authed ? (
                        <span title="계정으로 확인된 이름" style={{ color: 'var(--bl-line)', marginRight: 4 }}>
                          ◈
                        </span>
                      ) : null}
                      <span style={{ color: p == null ? 'var(--bl-faint)' : p.id === selfId ? 'var(--bl-line)' : 'var(--bl-ink)' }}>
                        {p ? p.nickname : '빈자리'}
                      </span>
                    </span>
                    {settled ? <span className="bl-holo" aria-hidden /> : null}
                  </li>
                );
              })}
            </ul>
          </Panel>
        </main>

        {/*
          ★ 좁은 화면에서 **숨기지 않는다** (원작 2026-08-07). 준비 · 시작 · 대화 · 나가기가 전부
            여기 살아서, 감추면 폰에서는 방에 들어와도 누를 것이 하나도 없다. 좌석 아래로 눕는다.
        */}
        <aside className="bl-side bl-side--keep">
          <Panel title="대화하기">
            <div className="bl-lines">
              {LINES.map((l) => (
                <button
                  key={l}
                  type="button"
                  className="bl-btn bl-line bl-edge"
                  disabled={status !== 'in' || cooling}
                  onClick={() => say(l)}
                >
                  {l}
                </button>
              ))}
            </div>
            {cooling ? (
              <p className="bl-label" aria-live="polite">
                {Math.ceil((cooldownUntil - Date.now()) / 1000)}초 뒤에 다시 말할 수 있다
              </p>
            ) : null}
          </Panel>

          <Panel title="시작">
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span className="bl-label">{seated}명</span>
                <span className="bl-label">정원 {ROOM_MAX_PLAYERS}</span>
              </div>
              {/* 눈금 한 칸 = 자리 하나. 칸 수는 정원에서 온다 (원작) */}
              <div className="bl-pips" aria-hidden>
                {Array.from({ length: ROOM_MAX_PLAYERS }, (_, i) => (
                  <span key={i} className={`bl-pip${i < seated ? ' bl-pip--on' : ''}`} />
                ))}
              </div>
            </div>

            {isHost ? (
              <div>
                {/*
                  ★ 못 누를 때는 **이유를 적는다.** 회색 버튼만 두면 방장은 자기 화면이 고장 난 줄 안다.
                  ★ 방장에게는 준비 버튼이 없다 — 이 버튼이 그 자리다 (원작 2026-08-07 결정).
                */}
                <button
                  type="button"
                  className="bl-btn bl-btn--go bl-btn--wide bl-edge"
                  disabled={status !== 'in' || blocked !== null}
                  onClick={() => conn.current?.sendBroadcast(START_LINE, 'announce')}
                >
                  게임 시작 <PlayIcon />
                </button>
                {blocked ? (
                  <p className="bl-label" style={{ marginTop: 8, textAlign: 'center' }} aria-live="polite">
                    {blocked}
                  </p>
                ) : null}
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  className={`bl-btn bl-btn--wide bl-edge${iAmReady ? ' bl-btn--go' : ''}`}
                  disabled={status !== 'in' || cooling}
                  onClick={toggleReady}
                >
                  {iAmReady ? <CheckIcon /> : null} {iAmReady ? '준비 완료' : '준비'}
                </button>
                <p className="bl-label" style={{ marginTop: 8, textAlign: 'center' }} aria-live="polite">
                  {/* 방장이 왜 안 누르는지가 여기서도 보여야 한다 — 대개 내가 안 눌렀다 */}
                  {blocked ?? '방장이 시작하기를 기다리는 중…'}
                </p>
              </div>
            )}

            <button type="button" className="bl-btn bl-btn--out bl-btn--wide bl-edge" data-sfx="close" onClick={leave}>
              <ExitIcon /> 방 나가기
            </button>
          </Panel>
        </aside>
      </div>

      {/*
        ★ 두 겹의 막은 **화면 맨 끝**에 둔다. 위에 두면 좌석판보다 먼저 낭독되고, 붙는 중에도
          「참가자 0/3」을 먼저 읽게 된다 — 지금 벌어지는 일은 접속이지 빈 좌석이 아니다.
      */}
      <LinkBoot code={code} status={status} seat={mine?.seat ?? null} onCancel={leave} />
      {launching ? <Launch onDone={() => navigate(startHref(code, nickname))} /> : null}
    </div>
  );
}

/**
 * 입장 번호를 넘기는 버튼. **번호를 글자로 크게 띄우는 자리는 두지 않는다** (원작) —
 * 이미 들어온 사람에게 번호는 읽을 것이 아니라 넘길 것이라, 머리말의 ROOM #1234 와 이 버튼이면 충분하다.
 * 복사에 실패해도 오류를 띄우지 않는다. 주소창의 ?code= 가 같은 값이라 막다른 길이 아니다.
 */
function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* https 가 아닌 곳에는 clipboard API 가 없다 */
    }
  };
  return (
    <button type="button" className="bl-btn bl-edge" style={{ padding: '6px 11px' }} onClick={() => void copy()}>
      <CopyIcon /> {copied ? '복사됨' : '초대 주소'}
    </button>
  );
}

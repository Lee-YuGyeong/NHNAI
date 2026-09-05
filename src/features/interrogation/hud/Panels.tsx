/**
 * 판 위의 판들 — 시계 · 채팅 · 기록 요약 · 결과 모달 · 대기 · 끝 화면.
 * 전부 서버가 준 상태(gameSlice)를 그리기만 한다. 값을 만들지 않는다.
 *
 * ★ **상단 줄(방 번호 · 국면 · 남은 초 · 테스트 n/3 · 격리 n/2)과 좌석판(SUBJECTS 카드)은 걷었다**
 *   (2026-09-05 사용자: "이거 카드는 안보여도돼. 머리위에 의심도만 보이면 돼" · "방 1234 … 격리 0/2
 *   이것도 안보이게"). 의심도는 이제 몸 위의 막대 하나로만 읽는다 (scene/SuspicionBar).
 *   카드에 달려 있던 지목·동조·철회 단추도 같이 사라졌다 — 눈금을 움직이는 것은 **관리 AI 가 사람들의
 *   말을 읽는 것**이고(2026-09-05 사용자: "AI 가 사람들이 하는 말을 보고 의심도를 올려",
 *   worker/src/game/agents.ts 의 readTalk), 말 속의 지목은 서버가 알아서 읽는다(runtime 의 accusationIn).
 *   걷어낸 판은 git 31b8829 이전에 있다.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
/* 대화창이 새 말을 따라갈지 — 규칙은 /arena 와 한 곳을 본다. 두 벌로 두면 반드시 어긋난다 */
import { followsBottom } from '@/features/arena/feedscroll';
import { GAME_MAX_HUMANS, GAME_MIN_HUMANS, type GameOutcome, type GameRole, type GameSeat, type GameStateWire } from '@/world/mp/game-protocol';
import type { TrialResultWire } from '@/world/mp/protocol';
import { BODIES, type BodyId } from '@/world/mp/bodies';
import type { ChatEntry } from '../interrogationSlice';
import { ResultSummary, TEST_TITLE } from './ResultTable';

export const ROLE_LABEL: Record<GameRole, string> = { human: '사람', designer: 'AI 설계자', ai: 'AI' };

/** 남은 초 — 서버 시각(phaseEndsAt)에서 매초 다시 센다 */
export function useCountdown(endsAt: number | null): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (endsAt === null) {
      setLeft(null);
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [endsAt]);
  return left;
}

/**
 * 미니 게임의 남은 초 — 위 가운데 큰 숫자, 30 29 28 … (2026-09-05 사용자: "실제 게임할때 몇초 남았는지
 * 위에 보이게" · "대화 40초는 안 보여도 돼. 미니게임 30초만"). 그래서 **시험 국면에만** 서되,
 * **마지막 대화**는 예외다 (같은 날 사용자: "마지막 대화 때에는 남은 시간을 보여줘" — 의심도 100 이
 * 안 나오면 시간이 차서 닫히는데, 시계가 없으면 그 끝이 예고 없이 온다. InterrogationFeature 의 렌더).
 * 상단줄의 12px `30s` 는 몸을 움직이며 읽기엔 너무 작았다. /trial 이 같은 요청으로 얻은 모양
 * (44px · 마지막 10초는 붉게)을 그대로 옮긴다 — 두 화면에서 같은 게임을 하니 시계도 같아야 한다.
 * 기준 시각은 상단줄과 같은 phaseEndsAt 이다. 내 시계가 서버보다 늦으면 31 로 시작할 수 있어
 * 시험 길이(maxSeconds)로 눌러 둔다 — 첫 숫자는 늘 30 이다.
 */
export function BigClock({ endsAt, maxSeconds, urgentBelow = 10 }: { endsAt: number | null; maxSeconds: number; urgentBelow?: number }) {
  const raw = useCountdown(endsAt);
  if (raw === null) return null;
  const left = Math.min(raw, Math.ceil(maxSeconds));
  return (
    <div aria-live="off" className={`ig-clock${left <= urgentBelow ? ' urgent' : ''}`}>
      {left}
      <span>초</span>
    </div>
  );
}

/* ─────────────────────────────── 채팅 ─────────────────────────────── */

/** 채팅 판에 그리는 줄 — 사람(과 좌석)이 한 말뿐이다 (Chat 머리말 ★). 저장소의 다른 줄은 여기서 걸러진다 */
export function chatOnly(feed: readonly ChatEntry[]): ChatEntry[] {
  return feed.filter((l) => (l.kind ?? 'chat') === 'chat');
}

/**
 * 「지훈으로」·「시우로」·「소율로」 — 이름 끝 글자에 받침이 있으면 「으로」, 없거나 ㄹ 이면 「로」.
 * 좌석 이름은 늘 한글 세 글자지만(koreanNames), 로비 닉네임이 들어와도 안 깨지게 한글이 아니면 「로」로 둔다.
 */
export function withRo(name: string): string {
  const code = name.charCodeAt(name.length - 1);
  const tail = code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 : 0;
  return `${name}${tail > 0 && tail !== 8 ? '으로' : '로'}`;
}

/**
 * 방의 대화 「구역 통신」 — 판 하나에 머리띠 · 로그 · 입력줄.
 *
 * 생김새는 /arena 의 통신판(ArenaFeature 의 .comms)을 그대로 옮긴 것이다
 * (2026-09-04 사용자: "채팅 디자인 who is human 에서" · **디자인만**).
 * 옮겨 온 것은 셋이다 — 살아 있다는 표시가 붙은 머리띠 · 말한 이를 가리키는 색점 ·
 * 지난 말을 읽으려 올려 두면 안 끌어내리는 규칙. 색만 이 화면의 것이다 (interrogation.css).
 *
 * ★ **대화만 보인다** (2026-09-05 사용자: "대화창은 대화만 보이게" — 「[시험 2/3] … 30초.」 지시문과
 *   「발언권 지급 — …」 을 빼 달라고). 저장소(interrogationSlice)에는 관리 AI 의 방송(leader) · 판의
 *   소식(system) · 의심도의 오르내림(delta)이 그대로 쌓이지만, 이 판은 kind 가 chat 인 줄만 그린다.
 *   지시문은 화면 위 안내판(.ig-order)과 관리 AI 의 목소리가 이미 전하고, 의심도는 몸 위 막대가 보인다 —
 *   같은 것을 채팅에 한 번 더 적으면 대화가 장부가 된다. 결(줄 전체를 물들이던 색)은 그래서 이제 안 쓰인다.
 */
export function Chat({
  feed,
  mySeatId,
  myName,
  markId,
  disabled,
  talk,
  onSend,
  onComposing,
}: {
  feed: ChatEntry[];
  mySeatId: string | null;
  /**
   * 이 판에서 내가 쓰는 이름 — 입력칸이 「지훈으로 말하기」로 선다 (2026-09-05 사용자: "내 이름을 몰라서
   * 엔터로 말하기 말고 (내이름)으로 말하기로"). 좌석 이름은 판이 열릴 때 서버가 지어 주는데
   * (worker 의 pickKoreanNames), 1인칭이라 내 머리 위 이름표는 나만 못 본다 — 내가 누구로 말하는지
   * 알 곳이 여기밖에 없었다. 좌석이 없으면(로비) null 이고, 그때는 예전대로 키를 안내한다.
   */
  myName: string | null;
  /** 내가 겨누고 있는 좌석 — 그 좌석의 말에는 색점이 호박으로 켜진다 (몸 위 이름표와 같은 규칙) */
  markId: string | null;
  disabled: boolean;
  /** 내 남은 발언권 — 판이 도는 동안만 수. 0 이면 「말하기」가 잠기고, null 이면 세지 않는다(로비) */
  talk: number | null;
  onSend: (text: string) => void;
  onComposing: (v: boolean) => void;
}) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** 새 말을 따라 내려갈지 — 지난 말을 보려고 올려 둔 사람은 안 끌어내린다 (feedscroll.ts) */
  const [stick, setStick] = useState(true);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick) el.scrollTop = el.scrollHeight;
  }, [feed.length, stick]);

  /*
   * 판이 사라질 때는 **치던 중이 아니라고 알린다** — 미니 게임이 시작되면 이 판이 통째로 내려가는데
   * (InterrogationFeature 의 렌더), 초점을 쥔 입력창이 DOM 에서 빠질 때 브라우저는 blur 를 안 쏜다.
   * 그러면 composing 이 참인 채로 남아 시행 내내 몸이 안 움직인다 — 여기가 갇히던 자리다.
   */
  useEffect(() => () => onComposing(false), [onComposing]);

  // Enter 로 입력창을 잡는다 — 3D 에 포인터가 잠겨 있으면 먼저 푼다 (WorldFeature 와 같은 버릇)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Enter' || e.repeat) return;
      const el = inputRef.current;
      if (!el || document.activeElement === el) return;
      e.preventDefault();
      if (document.pointerLockElement) document.exitPointerLock();
      el.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 지갑이 비었다 — 판은 서 있되 입력만 잠긴다. 남의 말은 계속 읽어야 다음 시험에서 무엇을 되찾을지 안다
  const broke = talk !== null && talk <= 0;
  const locked = disabled || broke;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || locked) return;
    onSend(t);
    setText('');
  };

  return (
    <div className="ig-chat">
      <div className="ig-commhd">
        {/* 켜져 있다는 표시 하나 — 이 방이 살아서 떠들고 있다 */}
        <i aria-hidden className="live" />
        <span className="ttl">구역 통신</span>
        {/* 올려 둔 것을 잊으면 **대화가 멎은 것처럼 보인다** — 새 말은 오는데 화면이 안 움직이니까.
            발언권 수보다 앞에 선다: 수는 오른쪽 끝에 붙박이고, 버튼이 그 왼쪽으로 끼어든다 */}
        {stick ? null : (
          <button
            type="button"
            className="tolatest"
            onClick={() => {
              const el = listRef.current;
              if (el) el.scrollTop = el.scrollHeight;
              setStick(true);
            }}
          >
            지난 대화 · 최신 ↓
          </button>
        )}
        {/*
          남은 발언권 — 한 마디에 하나 (game-protocol 의 TALK). 셋 아래로 내려오면 조명색으로 켜지고,
          비면 붉게 선다: 다음 시험이 이 수를 되돌려 준다는 것을 머리띠가 말해 준다.
          머리띠의 오른쪽 끝에 선다 (2026-09-05 사용자: 라벨 옆이 아니라 우측에).
        */}
        {talk !== null ? (
          <span className={`talk${talk <= 0 ? ' none' : talk <= 2 ? ' low' : ''}`} title="남은 발언권 — 한 마디에 하나, 시험에서 버틴 3초마다 하나">
            발언권 <b>{talk}</b>
          </span>
        ) : null}
      </div>
      <div
        className="ig-feed"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setStick(followsBottom(el.scrollHeight, el.scrollTop, el.clientHeight));
        }}
      >
        {chatOnly(feed).map((l, i) => {
          const mine = l.id === mySeatId;
          return (
            <p key={`${l.ts}-${i}`} className={`ig-line chat${mine ? ' me' : ''}${l.id === markId ? ' marked' : ''}`}>
              <i aria-hidden className="pip" />
              <span>
                <b>{l.name}</b>
                {l.text}
              </span>
            </p>
          );
        })}
      </div>
      <form className="ig-input" onSubmit={submit}>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => onComposing(true)}
          onBlur={() => onComposing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
          }}
          placeholder={disabled ? '기록 공개 중 — 입력이 잠긴다' : broke ? '발언권이 없다 — 다음 시험에서 버틴 만큼 받는다' : myName ? `${withRo(myName)} 말하기` : 'Enter 로 말하기'}
          disabled={locked}
          maxLength={200}
        />
        <button type="submit" disabled={locked || !text.trim()}>
          말하기
        </button>
      </form>
    </div>
  );
}

/* ─────────────────────────────── 시험 안내판 ─────────────────────────────── */

/**
 * 시험마다 화면이 그리는 요약 — **목표 한 문장과 키뿐이다** (2026-09-05 사용자: "정말 필요한 정보만
 * 플레이어가 보기 쉽게"). 시험 개시 방송은 걷었으므로(2026-09-06 「미니게임하는 시간에는 모두 tts 없애줘」,
 * runtime.openTest) **이 안내판이 시험을 여는 유일한 말이다** — 모르는 게임이 오면 서버의 긴 지시문
 * (currentTest.instruction)을 fallback 으로 편다. 조작키는 여기 키캡으로만
 * 선다 — 발치 줄(.ig-foot)은 내 수치만 센다 (InterrogationFeature 의 hud).
 */
const TEST_GUIDE: Record<string, { goal: string; keys: [string, string][] }> = {
  stopline: { goal: '붉은 정지선에 정확히 멈춰 서라 — 3회', keys: [['W', '달리기'], ['S', '브레이크']] },
  fall: { goal: '머리 위 낙하물을 피하라', keys: [['WASD', '이동']] },
  colorhunt: { goal: '목표색 구슬만 주워라 — 조명이 색을 속인다', keys: [['E', '줍기'], ['WASD', '이동']] },
  platform: { goal: '발판을 건너 도착까지 — 떨어지면 출발로', keys: [['W', '전진'], ['Space', '점프']] },
  disc: { goal: '도는 원판 위에서 밀려나지 말고 버텨라', keys: [['WASD', '걷기'], ['Shift', '달리기']] },
  seesaw: { goal: '판자의 무게중심을 축에 맞춰라 — 상자가 놓이면 반대쪽으로', keys: [['WASD', '걷기'], ['Shift', '달리기']] },
  tower: { goal: '탑 위 발판에서 버텨라 — 무게가 몰리면 기울고, 오래 서면 닳는다', keys: [['WASD', '걷기'], ['Space', '점프'], ['E', '밀치기']] },
  bar: { goal: '바닥을 쓸며 도는 봉을 뛰어넘어라 — 맞으면 넘어져 밀려난다', keys: [['WASD', '걷기'], ['Space', '점프']] },
};

/**
 * 시험 안내판 — 큰 시계 바로 아래. 이름 · 목표 · 키캡 세 줄로 서고, 읽을 시간이 지나면 흐려진다
 * (CSS 의 ig-orderdim — 경기장을 가리는 판은 읽힌 뒤 물러난다). 모르는 게임이 오면 서버 지시문을
 * 그대로 편다 — 안내가 없는 것보단 길다.
 */
export function TestOrder({ game, round, fallback }: { game: string; round: number; fallback: string }) {
  const guide = TEST_GUIDE[game];
  return (
    <div className="ig-order">
      <p className="ttl">
        {TEST_TITLE[game] ?? game} · {round}회차
      </p>
      <p className="goal">{guide?.goal ?? fallback}</p>
      {guide ? (
        <p className="keys">
          {guide.keys.map(([k, label]) => (
            <span key={k}>
              <kbd>{k}</kbd> {label}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────── 기록 요약 · 결과 모달 ─────────────────────────────── */

/*
 * 오른쪽 위에 서던 기록판(RecordPanel — 마지막 시험의 원자료 표)은 걷었다 (2026-09-05 사용자: "1시 방향의 기록 리스트
 * 없애줘"). 기록은 7초 모달의 요약(ResultSummary)으로만 보고, 눈금은 몸 위 막대가 말한다.
 */

/**
 * 기록 공개 모달 — 끝 화면(.ig-endpanel)과 같은 모따기 판이다: 머리띠 · 표 · 발치.
 * 표가 곧 내용이고, 글은 **범례 한 줄**뿐이다 (2026-09-05 사용자: "정말 필요한 정보만") — 예전의
 * 석 줄 설명(전환 직후 오차 · 오차 방향 · 적응 곡선의 정의)은 7초 안에 표를 읽어야 할 눈을 뺏었다.
 * 판정 낱말이 없는 것은 그대로다 (ResultTable 머리말 — 시스템은 판정하지 않는다).
 */
export function ResultModal({
  result,
  nameOf,
  mySeatId,
  endsAt,
  gained,
}: {
  result: TrialResultWire;
  nameOf: (id: string) => string;
  mySeatId: string | null;
  endsAt: number | null;
  /** 이 시험이 준 발언권 (game_talk 의 gained) — 표의 마지막 열 */
  gained?: Record<string, number>;
}) {
  const left = useCountdown(endsAt);
  // 발치의 막대는 켜지는 순간 남은 시간만큼 한 번에 빠진다 — 머리띠의 숫자와 같은 endsAt (EndScreen 과 같은 버릇)
  const [showMs] = useState(() => (endsAt === null ? 0 : Math.max(0, endsAt - Date.now())));
  return (
    <div className="ig-result" role="dialog" aria-label="기록 공개">
      <div className="ig-sheet" style={{ ['--show' as string]: `${showMs}ms` }}>
        <div className="hd">
          <i aria-hidden className="live" />
          <span className="ttl">기록 공개 · RECORD</span>
          {left !== null ? <span className="clock">{left}초</span> : null}
        </div>
        <div className="bd">
          <p className="ig-title">
            {TEST_TITLE[result.game]} <span>{result.round}회차</span>
          </p>
          {/*
            요약만 (2026-09-05 사용자: "간단하게 몇 초 안 맞았냐 · 몇 등 · 발언권 몇 개, 대충 통계만"). 7초 모달은
            읽는 자리가 아니라 보는 자리다. 상세 표를 들던 오른쪽 위 기록판은 같은 날 걷었다.
          */}
          <ResultSummary result={result} nameOf={nameOf} mySeatId={mySeatId} gained={gained} />
          <p className="ig-note">
            <span className="k">발언권</span>버틴 3초마다 하나 — 다음 대화에서 쓴다
            <span className="k">상세 기록</span>모달이 걷히면 오른쪽 기록판에
          </p>
        </div>
        <div className="ft">
          <span className="ftx">전원 입력 잠금 — 같은 순간, 같은 기록</span>
          {endsAt !== null ? (
            <span aria-hidden className="prog">
              <i />
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── 대기 ─────────────────────────────── */

export function LobbyPanel({
  wire,
  players,
  selfId,
  myBody = null,
  reject,
  onStart,
}: {
  wire: GameStateWire;
  players: Record<string, string>;
  selfId: string | null;
  /** 서버가 뽑아 준 내 몸 — 로비에선 아직 3D 화면이 없으니 여기서 미리 알려 준다 (mp/bodies.ts) */
  myBody?: BodyId | null;
  reject: string | null;
  onStart: (fillTo: number) => void;
}) {
  const online = Object.keys(players).length;
  const isHost = !!selfId && wire.hostId === selfId;
  const [fillTo, setFillTo] = useState(Math.max(GAME_MIN_HUMANS, online));
  const canStart = isHost && online >= 1;
  const body = myBody ? BODIES[myBody] : null;
  return (
    <div className="ig-lobby">
      <h2>소집 대기</h2>
      <p>
        실제 플레이어 {GAME_MIN_HUMANS}~{GAME_MAX_HUMANS}명 + AI 1좌석. 사람이 모자라면 대역이 채운다 — 판이 열리면 좌석이 섞이고 전원 새로 받은 이름으로만 불린다.
      </p>
      {body ? (
        <p>
          내 몸: <b>{body.name}</b> · Shift+W 달리기 · Space 점프{body.heavy ? ' — 비만이라 달리기가 느리고 점프가 낮다' : ''}
        </p>
      ) : null}
      <ul>
        {Object.entries(players).map(([id, nick]) => (
          <li key={id} className={id === wire.hostId ? 'host' : undefined}>
            {nick}
            {id === selfId ? ' (나)' : ''}
            {id === wire.hostId ? ' · 방장' : ''}
          </li>
        ))}
      </ul>
      <div className="ig-actions">
        {isHost ? (
          <>
            <label>
              총 인원{' '}
              <select value={fillTo} onChange={(e) => setFillTo(Number(e.target.value))}>
                {Array.from({ length: GAME_MAX_HUMANS - GAME_MIN_HUMANS + 1 }, (_, i) => GAME_MIN_HUMANS + i)
                  .filter((n) => n >= online)
                  .map((n) => (
                    <option key={n} value={n}>
                      {n}명 (대역 {Math.max(0, n - online)})
                    </option>
                  ))}
              </select>
            </label>
            <button type="button" disabled={!canStart} onClick={() => onStart(fillTo)}>
              시작
            </button>
          </>
        ) : (
          <p>방장이 시작하길 기다리는 중…</p>
        )}
      </div>
      {reject ? <p className="ig-err">{reject}</p> : null}
      <p>같은 방 번호(?code=)로 들어오면 같은 판이다. 화면을 클릭하면 마우스로 둘러본다.</p>
    </div>
  );
}

/* ─────────────────────────────── 끝 ─────────────────────────────── */

/** 머리띠의 시계 — 00:30 처럼 자리를 고정해 덜덜 떨지 않게 (역할 카드의 시계와 같은 얼굴) */
function mmss(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/** 「사람이었다」·「설계자였다」 — 끝 글자에 받침이 있으면 「이었다」, 없으면 「였다」 */
function wasCopula(word: string): string {
  const code = word.charCodeAt(word.length - 1);
  const hangul = code >= 0xac00 && code <= 0xd7a3;
  return hangul && (code - 0xac00) % 28 !== 0 ? '이었다' : '였다';
}

/**
 * 판정 종료 판 — 역할 카드(RoleBriefing, 「배정 통보」)와 **같은 판이 하나 더 켜지는 것**이다 (2026-09-05 사용자:
 * "게임 끝나면 보여주는 승리 이런것도 디자인에 맞게"). 머리띠 → 판정 → 내 결과 → 정체표 → 발치. 모따기 ·
 * 스캔라인 · 왼쪽 세로선 · 위 가장자리 헤어라인은 통신판의 그것이다 (interrogation.css 의 .ig-end).
 *
 * 색은 둘뿐이다 (docs/role-card/README.md 의 표). 판의 색(--rc)은 **이긴 진영**이 정한다 — 사람 진영이면 이
 * 화면의 조명색(--amber), AI 면 비상등(--signal). 관리 AI 의 마지막 방송도 같은 갈림이다 (runtime.ts 의
 * readout / alarm). 내 결과 칩만 따로 물든다 — 이겼으면 조명색, 졌으면 비상등. 그래서 AI 가 이긴 붉은 판
 * 위에서 살아남은 설계자의 「개인 승리」 칩만 호박으로 켜진다. 예전의 초록(#8fbf87)은 이 화면의 팔레트에
 * 없는 색이라 뺐다.
 *
 * 머리띠의 시계와 발치의 막대는 서버가 로비로 되돌리는 순간(GAME_ENDED_MS)을 센다 — 판이 걷히면 「소집 대기」가
 * 선다. 재접속이라 game_ended 를 못 받았으면(endsAt null) 시계 없이 선다. 「다시 — 새 판」은 그 전에 먼저
 * 걷고 싶을 때 쓴다 — **누르면 그 자리에서 새 판이 열린다** (서버는 끝 화면 중에도 방장의 시작을 받는다).
 * 방장이 아니면 단추가 없다: 눌러도 서버가 거절할 뿐이고, 그 사유는 이 판에 가려 보이지도 않는다.
 */
export function EndScreen({
  outcome,
  roles,
  seats,
  mySeatId,
  myRole,
  endsAt,
  onLeave,
}: {
  outcome: GameOutcome;
  roles: Record<string, GameRole> | null;
  seats: GameSeat[];
  mySeatId: string | null;
  myRole: GameRole | null;
  /** 스스로 방을 나가는 시각(내 시계) — 없으면 시계·막대 없이 선다 */
  endsAt: number | null;
  /** 방을 나간다 — 단추로도, 시계가 다 가서도 (InterrogationFeature 의 onLeave) */
  onLeave: () => void;
}) {
  const humansWon = outcome.winner === 'humans';
  const iWon = myRole === 'designer' ? mySeatId !== null && outcome.designersWon.includes(mySeatId) : myRole === 'ai' ? !humansWon : humansWon;
  const left = useCountdown(endsAt);
  // 막대는 켜지는 순간 남은 시간만큼 한 번에 빠진다 — 머리띠의 숫자와 같은 endsAt 을 보니 어긋나지 않는다
  const [showMs] = useState(() => (endsAt === null ? 0 : Math.max(0, endsAt - Date.now())));
  const aiName = seats.find((s) => s.id === outcome.aiId)?.name ?? outcome.aiId;
  const mine = myRole === null ? null : iWon ? (myRole === 'designer' && !humansWon ? '개인 승리' : '승리') : '패배';
  const foiled = myRole === 'designer' && !humansWon && !iWon;
  return (
    <div
      className="ig-end"
      role="dialog"
      aria-label="판정 종료"
      style={{ ['--rc' as string]: humansWon ? 'var(--amber)' : 'var(--signal)', ['--show' as string]: `${showMs}ms` }}
    >
      <div className="ig-endpanel">
        <div aria-hidden className="shine" />

        <div className="hd">
          <i aria-hidden className="live" />
          <span className="ttl">판정 종료 · VERDICT</span>
          {left !== null ? <span className="clock">{mmss(left)}</span> : null}
        </div>

        <div className="bd">
          {/* 「판정」 kicker 는 뺐다 — 머리띠가 이미 「판정 종료」다. 같은 낱말이 두 번 서면 어느 쪽도 안 읽힌다 */}
          <p className="name">{humansWon ? '사람 진영 승리' : 'AI 승리'}</p>
          <p className="tagline">{outcome.reason}</p>
          <p className="reveal">
            표식 없는 AI 는 <b>{aiName}</b> 이었다
          </p>

          {myRole && mine ? (
            <div className={`mine ${iWon ? 'won' : 'lost'}`}>
              <span className="who">
                나는 <b>{ROLE_LABEL[myRole]}</b>
                {wasCopula(ROLE_LABEL[myRole])}
              </span>
              <span className="chip">{mine}</span>
              {foiled ? <small>격리돼 개인 승리가 무산됐다</small> : null}
            </div>
          ) : null}

          <div className="rule" aria-hidden>
            ▪
          </div>

          <ul className="roster">
            {seats.map((s) => {
              const r = roles?.[s.id];
              return (
                <li key={s.id} className={`${r ? `is-${r}` : 'is-unknown'}${s.isolated ? ' isolated' : ''}${s.id === mySeatId ? ' me' : ''}`}>
                  <b>{s.name}</b>
                  <span className="role">{r ? ROLE_LABEL[r] : '?'}</span>
                  <span className="tags">
                    {s.isolated ? <em>격리</em> : null}
                    {s.id === mySeatId ? <em className="me">나</em> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="ft">
          <span className="ftx">{endsAt !== null ? '시간이 다 되면 방을 나간다' : '판이 끝났다'}</span>
          <button type="button" className="leave" onClick={onLeave}>
            방 나가기
          </button>
          {endsAt !== null ? (
            <span aria-hidden className="prog">
              <i />
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

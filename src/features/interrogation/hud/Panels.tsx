/**
 * 판 위의 판들 — 상단 줄 · 좌석판(의심도 · 지목) · 채팅 · 기록 요약 · 결과 모달 · 대기 · 설계자 조작 · 끝 화면.
 * 전부 서버가 준 상태(gameSlice)를 그리기만 한다. 값을 만들지 않는다.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
/* 대화창이 새 말을 따라갈지 — 규칙은 /arena 와 한 곳을 본다. 두 벌로 두면 반드시 어긋난다 */
import { followsBottom } from '@/features/arena/feedscroll';
import {
  GAME_MAX_HUMANS,
  GAME_MIN_HUMANS,
  GAME_TEST_ORDER,
  type GameOutcome,
  type GameRole,
  type GameSeat,
  type GameStateWire,
} from '@/world/mp/game-protocol';
import type { TrialResultWire } from '@/world/mp/protocol';
import { BODIES, type BodyId } from '@/world/mp/bodies';
import type { ChatEntry } from '../interrogationSlice';
import { ResultTable, TEST_TITLE } from './ResultTable';

export const PHASE_LABEL: Record<GameStateWire['phase'], string> = {
  lobby: '소집 중',
  briefing: '배역 통보',
  discussion: '토론 · 지목',
  test: '물리 테스트',
  result: '기록 공개',
  ended: '판정 종료',
};

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

/* ─────────────────────────────── 상단 줄 ─────────────────────────────── */

export function TopBar({ wire, roomCode }: { wire: GameStateWire; roomCode: string }) {
  const left = useCountdown(wire.phaseEndsAt);
  const alive = wire.seats.filter((s) => !s.isolated).length;
  const isolated = wire.seats.length - alive;
  return (
    <div className="ig-top">
      <span>방 {roomCode}</span>
      <span className={wire.phase === 'test' ? 'ig-phase-test' : undefined}>
        <b>{PHASE_LABEL[wire.phase]}</b>
        {wire.currentTest ? ` · ${TEST_TITLE[wire.currentTest.game]} ${wire.currentTest.round}회차` : ''}
      </span>
      {left !== null ? <span className="ig-timer">{left}s</span> : null}
      {/* 차례표가 셋으로 고정이라 「몇째 중 몇」이 읽힌다 — 판이 언제 끝나는지가 첫 화면부터 보인다 (GAME_TEST_ORDER) */}
      <span>
        테스트 {wire.testsDone}/{GAME_TEST_ORDER.length}
      </span>
      <span>
        격리 {isolated}/{wire.quota}
      </span>
    </div>
  );
}

/**
 * 미니 게임의 남은 초 — 위 가운데 큰 숫자, 30 29 28 … (2026-09-05 사용자: "실제 게임할때 몇초 남았는지
 * 위에 보이게" · "대화 40초는 안 보여도 돼. 미니게임 30초만"). 그래서 **시험 국면에만** 선다.
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

/* ─────────────────────────────── 좌석판 ─────────────────────────────── */

export function Board({
  wire,
  mySeatId,
  aiId,
  onAccuse,
  onWithdraw,
}: {
  wire: GameStateWire;
  mySeatId: string | null;
  /** 설계자에게만 온 AI 의 좌석 — 표시는 나에게만 */
  aiId: string | null;
  onAccuse: (id: string) => void;
  onWithdraw: () => void;
}) {
  const myTarget = mySeatId ? wire.accusations[mySeatId] : undefined;
  const meAlive = !!mySeatId && !wire.seats.find((s) => s.id === mySeatId)?.isolated;
  const canAct = meAlive && (wire.phase === 'discussion' || wire.phase === 'test');
  const nameOf = (id: string) => wire.seats.find((s) => s.id === id)?.name ?? id;
  const accusersOf = (id: string) => Object.entries(wire.accusations).filter(([, t]) => t === id).map(([by]) => by);

  return (
    <div className="ig-board">
      <h3>
        <span>SUBJECTS</span>
        <span>의심도</span>
      </h3>
      {wire.seats.map((s) => {
        const v = wire.suspicion[s.id] ?? 0;
        const accusers = accusersOf(s.id);
        const mine = myTarget === s.id;
        return (
          <div key={s.id} className={`ig-seat${s.id === mySeatId ? ' me' : ''}${s.isolated ? ' isolated' : ''}${accusers.length ? ' accused' : ''}`}>
            <div className="ig-seat-name">
              <span>
                {s.name}
                {s.id === mySeatId ? ' (나)' : ''}
                {s.revealed ? <span className={`ig-tag${s.revealed === 'ai' ? ' ai' : ''}`}> · {ROLE_LABEL[s.revealed]}</span> : null}
                {!s.revealed && aiId === s.id ? <span className="ig-tag ai"> · AI</span> : null}
              </span>
              {accusers.length ? <small>지목: {accusers.map(nameOf).join(', ')}</small> : null}
              <div className={`ig-gauge${v >= 70 ? ' hot' : ''}`}>
                <i style={{ width: `${v}%` }} />
              </div>
            </div>
            <span className="ig-seat-val">{Math.round(v)}%</span>
            {s.id === mySeatId || s.isolated ? (
              <span />
            ) : (
              <button type="button" className={mine ? 'on' : undefined} disabled={!canAct} onClick={() => (mine ? onWithdraw() : onAccuse(s.id))}>
                {mine ? '철회' : accusers.length ? '동조' : '지목'}
              </button>
            )}
          </div>
        );
      })}
      <div className="ig-acc">지목 +8 · 동조 +5 · 몰이 가산 · 철회 −8 · 해명 판정 ±10. 100%면 즉시 격리.</div>
    </div>
  );
}

/* ─────────────────────────────── 채팅 ─────────────────────────────── */

/**
 * 방의 대화 「구역 통신」 — 판 하나에 머리띠 · 로그 · 입력줄.
 *
 * 생김새는 /arena 의 통신판(ArenaFeature 의 .comms)을 그대로 옮긴 것이다
 * (2026-09-04 사용자: "채팅 디자인 who is human 에서" · **디자인만**).
 * 옮겨 온 것은 넷이다 — 살아 있다는 표시가 붙은 머리띠 · 말한 이를 가리키는 색점 ·
 * 판을 뒤집는 말(관리 AI · 판의 소식 · 의심도)을 줄 전체로 물들이는 결 ·
 * 지난 말을 읽으려 올려 두면 안 끌어내리는 규칙. 색만 이 화면의 것이다 (interrogation.css).
 */
export function Chat({
  feed,
  mySeatId,
  markId,
  disabled,
  onSend,
  onComposing,
}: {
  feed: ChatEntry[];
  mySeatId: string | null;
  /** 내가 겨누고 있는 좌석 — 그 좌석의 말에는 색점이 호박으로 켜진다 (몸 위 이름표와 같은 규칙) */
  markId: string | null;
  disabled: boolean;
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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText('');
  };

  return (
    <div className="ig-chat">
      <div className="ig-commhd">
        {/* 켜져 있다는 표시 하나 — 이 방이 살아서 떠들고 있다 */}
        <i aria-hidden className="live" />
        <span className="ttl">구역 통신</span>
        {/* 올려 둔 것을 잊으면 **대화가 멎은 것처럼 보인다** — 새 말은 오는데 화면이 안 움직이니까 */}
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
      </div>
      <div
        className="ig-feed"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setStick(followsBottom(el.scrollHeight, el.scrollTop, el.clientHeight));
        }}
      >
        {feed.map((l, i) => {
          const kind = l.kind ?? 'chat';
          /*
           * 결이 붙은 줄(관리 AI · 판의 소식 · 의심도)에는 **이름을 안 붙인다** — 본문이 대개
           * 좌석 번호로 시작해서, 이름까지 붙으면 누가 말하고 누가 걸렸는지가 안 갈린다.
           * 말하는 쪽은 색이 가른다 (/arena 통신판과 같은 규칙).
           */
          const toned = kind !== 'chat';
          const mine = l.id === mySeatId;
          return (
            <p key={`${l.ts}-${i}`} className={`ig-line ${kind}${mine ? ' me' : ''}${l.id === markId ? ' marked' : ''}`}>
              <i aria-hidden className="pip" />
              <span>
                {toned ? (
                  l.text
                ) : (
                  <>
                    <b>{l.name}</b>
                    {l.text}
                  </>
                )}
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
          placeholder={disabled ? '기록 공개 중 — 입력이 잠긴다' : 'Enter 로 말하기'}
          disabled={disabled}
          maxLength={200}
        />
        <button type="submit" disabled={disabled || !text.trim()}>
          말하기
        </button>
      </form>
    </div>
  );
}

/* ─────────────────────────────── 기록 요약 · 결과 모달 ─────────────────────────────── */

export function RecordPanel({ result, nameOf, mySeatId }: { result: TrialResultWire; nameOf: (id: string) => string; mySeatId: string | null }) {
  return (
    <div className="ig-record">
      <h3>
        RECORD · {TEST_TITLE[result.game]} {result.round}회차
      </h3>
      <ResultTable result={result} nameOf={nameOf} mySeatId={mySeatId} />
    </div>
  );
}

export function ResultModal({ result, nameOf, mySeatId, endsAt }: { result: TrialResultWire; nameOf: (id: string) => string; mySeatId: string | null; endsAt: number | null }) {
  const left = useCountdown(endsAt);
  return (
    <div className="ig-result" role="dialog" aria-label="기록 공개">
      <div className="ig-sheet">
        <p className="ig-eyebrow">
          <span>COGNITION DIVISION · RECORD</span>
          <span>{left !== null ? `${left}s` : ''}</span>
        </p>
        <p className="ig-title">
          {TEST_TITLE[result.game]} · {result.round}회차 기록
        </p>
        <ResultTable result={result} nameOf={nameOf} mySeatId={mySeatId} />
        <p className="ig-note">
          무리 평균 대비 편차만 있다. 시스템은 판정하지 않는다 — 붉은 값은 평균에서 표준편차 1.5배 넘게 먼 것을 표시했을 뿐이다.
          <br />
          전환 직후 오차: 조건이 바뀐 직후의 오차. 오차 방향: 시행마다 초과(+)·미달(−). 적응 곡선: 시행별 |오차| — 사람은 내려간다.
        </p>
        <p className="ig-lock">전원 입력 잠금 — 같은 순간, 같은 기록.</p>
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
        실제 플레이어 {GAME_MIN_HUMANS}~{GAME_MAX_HUMANS}명 + AI 1좌석. 사람이 모자라면 대역이 채운다 — 판이 열리면 좌석이 섞이고 전원 SUBJECT 번호로만 불린다.
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

/* ─────────────────────────────── 설계자 조작 ─────────────────────────────── */

export function DesignerPanel({ seats, mySeatId, tamperLeft, phase, onTamper }: { seats: GameSeat[]; mySeatId: string | null; tamperLeft: number; phase: GameStateWire['phase']; onTamper: (target: string, direction: 'suspicious' | 'normal') => void }) {
  const [target, setTarget] = useState('');
  const alive = seats.filter((s) => !s.isolated);
  const can = tamperLeft > 0 && phase !== 'result' && phase !== 'ended' && !!target;
  return (
    <div className="ig-designer">
      <h3>DESIGNER · 기록 조작 {tamperLeft > 0 ? '1회 남음' : '사용함'}</h3>
      <p>다음 테스트 결과의 공개본 하나를 바꾼다. 조작 여부는 아무도 모른다 — 대상 본인도.</p>
      <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={tamperLeft <= 0}>
        <option value="">대상…</option>
        {alive.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.id === mySeatId ? ' (나)' : ''}
          </option>
        ))}
      </select>
      <button type="button" disabled={!can} onClick={() => onTamper(target, 'suspicious')} title="기계처럼 보이게 — 전환 직후 오차가 사라지고 곡선이 평평해진다">
        튀게
      </button>
      <button type="button" disabled={!can} onClick={() => onTamper(target, 'normal')} title="사람처럼 보이게 — 무리 평균 근처로 당긴다">
        평범하게
      </button>
    </div>
  );
}

/* ─────────────────────────────── 끝 ─────────────────────────────── */

export function EndScreen({
  outcome,
  roles,
  seats,
  mySeatId,
  myRole,
  onAgain,
}: {
  outcome: GameOutcome;
  roles: Record<string, GameRole> | null;
  seats: GameSeat[];
  mySeatId: string | null;
  myRole: GameRole | null;
  onAgain: () => void;
}) {
  const humansWon = outcome.winner === 'humans';
  const iWon = myRole === 'designer' ? mySeatId !== null && outcome.designersWon.includes(mySeatId) : myRole === 'ai' ? !humansWon : humansWon;
  const tone = iWon ? '#8fbf87' : humansWon ? '#ffca8e' : '#ff3320';
  return (
    <div className="ig-end" style={{ ['--tone' as string]: tone }}>
      <div className="ig-sheet">
        <p className="ig-eyebrow">COGNITION DIVISION · VERDICT</p>
        <p className="ig-title">{humansWon ? '사람 진영 승리' : 'AI 승리'}</p>
        <p>{outcome.reason}</p>
        {myRole ? (
          <p>
            나는 <b>{ROLE_LABEL[myRole]}</b>이었다 — {iWon ? '이겼다.' : '졌다.'}
            {myRole === 'designer' && !humansWon && !iWon ? ' (격리돼 개인 승리가 무산됐다)' : ''}
          </p>
        ) : null}
        <ul>
          {seats.map((s) => {
            const r = roles?.[s.id];
            return (
              <li key={s.id} className={r ? `ig-role-${r}` : undefined}>
                <b>{s.name}</b>
                {r ? ROLE_LABEL[r] : '?'}
                {s.isolated ? ' · 격리' : ''}
                {s.id === mySeatId ? ' · 나' : ''}
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={onAgain}>
          다시 — 새 판
        </button>
      </div>
    </div>
  );
}

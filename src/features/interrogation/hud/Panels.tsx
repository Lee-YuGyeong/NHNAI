/**
 * 판 위의 판들 — 상단 줄 · 좌석판(의심도 · 지목) · 채팅 · 기록 요약 · 결과 모달 · 대기 · 설계자 조작 · 끝 화면.
 * 전부 서버가 준 상태(gameSlice)를 그리기만 한다. 값을 만들지 않는다.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  GAME_MAX_HUMANS,
  GAME_MIN_HUMANS,
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
      <span>테스트 {wire.testsDone}</span>
      <span>
        격리 {isolated}/{wire.quota}
      </span>
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

export function Chat({
  feed,
  mySeatId,
  disabled,
  hushed,
  onSend,
  onClaim,
  onComposing,
}: {
  feed: ChatEntry[];
  mySeatId: string | null;
  disabled: boolean;
  hushed: boolean;
  onSend: (text: string) => void;
  onClaim: (text: string) => void;
  onComposing: (v: boolean) => void;
}) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed.length]);

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
  const claim = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onClaim(t);
    setText('');
  };

  return (
    <div className={`ig-chat${hushed ? ' hushed' : ''}`}>
      <div className="ig-feed" ref={listRef}>
        {feed.map((l, i) => (
          <p key={`${l.ts}-${i}`} className={`ig-line ${l.kind ?? 'chat'}${l.id === mySeatId ? ' me' : ''}`}>
            {l.kind === 'chat' || l.kind === 'leader' ? <b>{l.name}</b> : null}
            {l.text}
          </p>
        ))}
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
        <button type="button" className="claim" disabled={disabled || !text.trim()} onClick={claim} title="이 문장을 관리 AI 가 기록과 대조해 판정한다 (일치 −10 · 불일치 +10)">
          주장
        </button>
      </form>
      <div className="ig-hint">「주장」은 관리 AI 가 공개 기록과 대조한다 — 일치 −10, 거짓 해명 +10.</div>
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

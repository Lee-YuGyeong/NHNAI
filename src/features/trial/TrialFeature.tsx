/**
 * 물리 미니게임 방 — /trial. 정지선(?game=stopline, 기본)과 낙하 생존(?game=fall). 색 사냥은 아직.
 * 방 번호는 ?code= 로 받는다(없으면 '1234' — /world 와 같은 개발 편의 기본값). 복도의 살아있는
 * WS 를 이어받지 않고 새로 연다(TrialConnection 머리말) — `idFromName(roomCode)`가 같은
 * RoomDO 로 보내주므로 로스터는 그대로 이어진다.
 *
 * 화면은 심문소 홀(StopLineScene)이 꽉 채우고, 전광판·기록은 그 위에 얹힌다 — 3D 방 안에서 판이 도는
 * 느낌이어야 한다(2026-09-04 사용자: "내가 원한 건 3D 방에 glb 같은 걸 추가해서 미니게임 하는 것").
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BackToRoot } from '@/shared/BackToRoot';
import { loadGuestNick } from '@/shared/guest';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { STOPLINE_MAX_ATTEMPTS, TRIAL_PHASE_MS, TRIAL_SUMMARY_MS } from '@/world/mp/constants';
import type { AnimState, PlayerSnapshot, TrialGame } from '@/world/mp/protocol';
import { remotePlayers } from '@/world/net/remote-players';
import { FallScene } from './games/fall/FallScene';
import { fallState } from './games/fall/fallState';
import { StopLineScene } from './games/stop-line/StopLineScene';
import { runnerState } from './games/stop-line/runnerState';
import { laneForAi } from './games/stop-line/track';
import { TrialConnection, worldWsBase } from './net/TrialConnection';
import { ScoreboardLog } from './scoreboard/ScoreboardLog';
import { Summary } from './scoreboard/Summary';
import { trialActions, trialSelectors } from './trialSlice';

export function TrialFeature() {
  const dispatch = useAppDispatch();
  const [params] = useSearchParams();
  const roomCode = params.get('code') ?? '1234';
  const wantGame: TrialGame = params.get('game') === 'fall' ? 'fall' : 'stopline';
  const nickname = useMemo(() => loadGuestNick() || `테스터${Math.floor(100 + Math.random() * 900)}`, []);

  const status = useAppSelector(trialSelectors.selectStatus);
  const errorText = useAppSelector(trialSelectors.selectErrorText);
  const selfId = useAppSelector(trialSelectors.selectSelfId);
  const roster = useAppSelector(trialSelectors.selectRoster);
  const game = useAppSelector(trialSelectors.selectGame);
  const round = useAppSelector(trialSelectors.selectRound);
  const roundStartAt = useAppSelector(trialSelectors.selectRoundStartAt);
  const roundDurationMs = useAppSelector(trialSelectors.selectRoundDurationMs);
  const myHits = useAppSelector(trialSelectors.selectMyHits);
  const myAttempts = useAppSelector(trialSelectors.selectMyAttempts);
  const history = useAppSelector(trialSelectors.selectHistory);
  const liveResult = useAppSelector(trialSelectors.selectLiveResult);

  const [tab, setTab] = useState<'live' | 'log'>('live');
  /** 요약 — 판이 끝나면 10초만 (TRIAL_SUMMARY_MS). 지나면 「다시 하기」 */
  const [summaryUntil, setSummaryUntil] = useState(0);
  const [aiIds, setAiIds] = useState<string[]>([]);
  const [locked, setLocked] = useState(false);
  /** 피격 연출 — 화면 가장자리가 붉게 번쩍인다 */
  const [flash, setFlash] = useState(0);
  /** 남은 시간 표시용 1초 시계 (시간제 게임만) */
  const [clock, setClock] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement>(null);
  const connRef = useRef<TrialConnection | null>(null);
  if (connRef.current === null) connRef.current = new TrialConnection();
  // 연결 콜백의 클로저는 연결 시점에 굳는다 — 내 id 는 ref 로 본다
  const selfIdRef = useRef<string | null>(null);
  selfIdRef.current = selfId;

  /** AI 좌석은 서버 메시지(trial_running/waypoints)에 처음 등장할 때 알게 된다 — 레인은 번호로 고정 */
  const seeParticipant = useCallback((id: string) => {
    const lane = laneForAi(id);
    if (lane === null) return;
    runnerState.setLane(id, lane);
    setAiIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  useEffect(() => {
    dispatch(trialActions.reset());
    runnerState.clear();
    fallState.clear();
    remotePlayers.clear();
    setAiIds([]);
    dispatch(trialActions.connecting());

    const seat = (p: PlayerSnapshot) => runnerState.setLane(p.id, p.seat - 1);
    const conn = connRef.current!;
    conn.connect(worldWsBase(), roomCode, nickname, wantGame, {
      onWelcome: (id, players) => {
        const now = performance.now();
        for (const p of players) {
          seat(p);
          if (p.id !== id) remotePlayers.add(p, now);
        }
        dispatch(trialActions.welcomed({ selfId: id, players: players.map((p) => ({ id: p.id, nickname: p.nickname })) }));
      },
      onJoined: (p) => {
        seat(p);
        remotePlayers.add(p, performance.now());
        dispatch(trialActions.playerJoined({ id: p.id, nickname: p.nickname }));
      },
      onLeft: (id) => {
        remotePlayers.remove(id);
        runnerState.remove(id);
        dispatch(trialActions.playerLeft(id));
      },
      onMoved: (id, x, z, y, heading, anim) => remotePlayers.move(id, x, z, y, heading, anim, performance.now()),
      onHistory: (results) => dispatch(trialActions.historyReceived(results)),
      onRoundStart: (g, r, startAt, durationMs) => {
        runnerState.resetAll();
        fallState.clear();
        dispatch(trialActions.roundStarted({ game: g, round: r, startAt, durationMs: durationMs ?? null }));
      },
      onRunning: (id, startAt) => {
        seeParticipant(id);
        // 내 것은 W 를 누른 순간 이미 로컬로 달리기 시작했다 (TrialRig) — 서버 시각으로 덮어쓰면 한 프레임 튄다
        if (id !== selfIdRef.current) runnerState.running(id, startAt);
      },
      onWaypoints: (id, brakeAt, brakePos, stopAt, stopPos) => {
        seeParticipant(id);
        runnerState.braking(id, brakePos, stopPos, brakeAt, stopAt);
        dispatch(trialActions.attemptRecorded(id));
      },
      onSnapshot: (msg) => {
        for (const a of msg.ai) seeParticipant(a.id);
        fallState.push(msg);
      },
      onHit: (id) => {
        dispatch(trialActions.hitRecorded(id));
        if (id === selfIdRef.current) setFlash(Date.now());
      },
      onResult: (result) => dispatch(trialActions.resultReceived(result)),
      onError: (code) => dispatch(trialActions.errorOccurred(code)),
      onClose: () => dispatch(trialActions.closed()),
    });

    return () => conn.close();
  }, [dispatch, roomCode, nickname, wantGame, seeParticipant]);

  // 판이 끝나면(결과가 오면) 요약을 10초 — 도중엔 아무것도 화면을 가리지 않는다
  useEffect(() => {
    if (liveResult) setSummaryUntil(Date.now() + TRIAL_SUMMARY_MS);
  }, [liveResult]);

  // 남은 시간 · 요약 카운트다운 — 0.5초마다
  useEffect(() => {
    if (roundDurationMs === null && !summaryUntil) return;
    const id = window.setInterval(() => setClock(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [roundDurationMs, summaryUntil]);

  // 마우스 잠금 — WorldFeature 와 같이 화면의 뿌리 div 에 건다. 잠긴 동안만 시야가 돈다 (TrialRig)
  useEffect(() => {
    const sync = () => setLocked(document.pointerLockElement !== null && document.pointerLockElement === rootRef.current);
    document.addEventListener('pointerlockchange', sync);
    return () => {
      document.removeEventListener('pointerlockchange', sync);
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }, []);
  const lock = () => {
    const el = rootRef.current;
    if (!el || document.pointerLockElement === el) return;
    try {
      const p = el.requestPointerLock() as unknown;
      if (p instanceof Promise) p.catch(() => {});
    } catch {
      /* 브라우저가 거절했다 — 시야만 못 돌릴 뿐 W/S 는 된다 */
    }
  };

  const restart = useCallback(() => {
    setSummaryUntil(0);
    connRef.current?.rejoin(wantGame);
  }, [wantGame]);
  const onAccel = useCallback(() => connRef.current?.sendAccel(), []);
  const onBrake = useCallback(() => connRef.current?.sendBrake(), []);
  const sendMove = useCallback((x: number, z: number, y: number, heading: number, anim: AnimState) => connRef.current?.sendMove(x, z, y, heading, anim), []);

  const others = useMemo(() => Object.keys(roster).filter((id) => id !== selfId).map((id) => ({ id })), [roster, selfId]);

  const secondsLeft = roundDurationMs === null ? 0 : Math.max(0, Math.ceil((roundStartAt + roundDurationMs - clock) / 1000));
  const over = liveResult !== null || (round > 0 && roundDurationMs !== null && secondsLeft === 0);
  const summaryLeft = Math.max(0, Math.ceil((summaryUntil - clock) / 1000));
  const showSummary = liveResult !== null && summaryLeft > 0;
  /** 20초 구간 — 바닥 결이 바뀌는 데만 쓴다. 값(마찰·중력)은 서버만 안다 */
  const phase = round === 0 ? 1 : Math.min(3, Math.floor(Math.max(0, clock - roundStartAt) / TRIAL_PHASE_MS) + 1);
  const hud =
    status === 'connecting'
      ? '연결하는 중…'
      : status === 'error'
        ? `연결 실패: ${errorText}`
        : round === 0
          ? '판이 열리길 기다리는 중…'
          : over
            ? '끝났다'
            : game === 'fall'
              ? `맞음 ${myHits} — WASD 로 피해라. 바닥 그림자가 진해지면 온다`
              : myAttempts >= STOPLINE_MAX_ATTEMPTS
                ? '시행 다 썼다'
                : `시행 ${myAttempts}회 — W 달리기 · S 브레이크 · 붉은 선에 멈춰라`;
  const title = (game ?? wantGame) === 'fall' ? '낙하 생존' : '정지선';
  const flashing = Date.now() - flash < 350;

  return (
    <div ref={rootRef} onClick={lock} style={{ position: 'fixed', inset: 0, background: '#101d31', overflow: 'hidden' }}>
      {(game ?? wantGame) === 'fall' ? (
        <FallScene roster={others} aiIds={aiIds} sendMove={sendMove} />
      ) : (
        <StopLineScene
          myId={selfId}
          roster={others}
          aiIds={aiIds}
          phase={phase}
          gameKey={roundStartAt}
          myAttempts={myAttempts}
          onAccel={onAccel}
          onBrake={onBrake}
          sendMove={sendMove}
        />
      )}
      {/* 피격 — 가장자리가 붉게 번쩍인다 (기록은 서버가 이미 했다, 이건 몸으로 느끼는 것) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          boxShadow: 'inset 0 0 120px 40px rgba(255, 51, 32, 0.55)',
          opacity: flashing ? 1 : 0,
          transition: flashing ? 'none' : 'opacity 0.5s ease',
        }}
      />

      {/* 머리말 — 방 이름 · 탭 */}
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
        <BackToRoot />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--dust)', letterSpacing: '0.1em' }}>{title} // 방 {roomCode}</span>
      </div>
      {/* 남은 시간 — 위 가운데에 큰 숫자 (2026-09-04 사용자: "남은 시간도 위에 숫자로"). 마지막 10초는 붉게 */}
      {round > 0 && roundDurationMs !== null && !over ? (
        <div
          aria-live="off"
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: 'var(--font-mono)',
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: secondsLeft <= 10 ? 'var(--signal)' : 'var(--linen)',
            textShadow: '0 2px 12px rgba(0,0,0,0.9)',
            pointerEvents: 'none',
            lineHeight: 1,
          }}
        >
          {secondsLeft}
          <span style={{ fontSize: 14, marginLeft: 6, color: 'var(--dust)' }}>초</span>
        </div>
      ) : null}
      <nav style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => setTab('live')} aria-pressed={tab === 'live'}>
          진행
        </button>
        <button type="button" onClick={() => setTab('log')} aria-pressed={tab === 'log'}>
          기록 ({history.length})
        </button>
      </nav>

      {/* 발밑 안내 — 잠금 전에는 클릭을 청한다 */}
      <p
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 18,
          margin: 0,
          textAlign: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color: status === 'error' ? 'var(--signal)' : 'var(--linen)',
          textShadow: '0 1px 8px rgba(0,0,0,0.9)',
          pointerEvents: 'none',
        }}
      >
        {hud}
        {!locked && status === 'connected' && !over ? <span style={{ display: 'block', color: 'var(--dust)', fontSize: 12, marginTop: 4 }}>화면을 클릭하면 마우스로 둘러볼 수 있다</span> : null}
      </p>
      {over && !showSummary && status === 'connected' ? (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 60, display: 'flex', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={restart} style={{ padding: '10px 18px' }}>
            다시 하기
          </button>
        </div>
      ) : null}

      {/* 기록 탭 — 지난 판까지 전부. 참가자 강조·등급 라벨 없음 */}
      {tab === 'log' ? (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'absolute', top: 56, right: 12, width: 380, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto', opacity: 0.92 }}
        >
          <ScoreboardLog history={history} roster={roster} />
        </div>
      ) : null}

      {/* 판이 끝났을 때 10초 — 짧은 요약. 그 뒤엔 「다시 하기」와 기록 탭 */}
      {tab === 'live' && showSummary && liveResult ? (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(8, 6, 4, 0.6)' }}
        >
          <Summary result={liveResult} roster={roster} title={title} secondsLeft={summaryLeft} />
        </div>
      ) : null}
    </div>
  );
}

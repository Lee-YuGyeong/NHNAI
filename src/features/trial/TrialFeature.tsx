/**
 * 물리 미니게임 방 — /trial. 정지선(?game=stopline, 기본) · 낙하 생존(?game=fall) · 색 사냥(?game=colorhunt) · 움직이는 플랫폼(?game=platform) ·
 * 회전 원판(?game=disc) · 무게 중심 다리(?game=seesaw) · 무너지는 타워 생존(?game=tower).
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
import type { BodyId } from '@/world/mp/bodies';
import { HUNT_LIGHT_RAMP_MS, SEESAW_TILT_MAX, STOPLINE_MAX_ATTEMPTS, TRIAL_PHASE_MS, TRIAL_SUMMARY_MS } from '@/world/mp/constants';
import type { AnimState, PlayerSnapshot, TrialGame } from '@/world/mp/protocol';
import { remotePlayers } from '@/world/net/remote-players';
import { ColorHuntScene } from './games/color-hunt/ColorHuntScene';
import { huntState, softLight } from './games/color-hunt/huntState';
import { DiscScene } from './games/disc/DiscScene';
import { discState } from './games/disc/discState';
import { FallScene } from './games/fall/FallScene';
import { SeesawScene } from './games/seesaw/SeesawScene';
import { TowerScene } from './games/tower/TowerScene';
import { towerState } from './games/tower/towerState';
import { TOWER_N, slabIndexAt } from '@/world/mp/tower';
import { seesawState } from './games/seesaw/seesawState';
import { PlatformScene } from './games/platform/PlatformScene';
import { platformState } from '@/features/interrogation/scene/platformState';
import { PAD_START_Z } from '@/world/mp/platform';
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
  const wantGame: TrialGame =
    params.get('game') === 'fall'
      ? 'fall'
      : params.get('game') === 'colorhunt'
        ? 'colorhunt'
        : params.get('game') === 'platform'
          ? 'platform'
          : params.get('game') === 'disc'
            ? 'disc'
            : params.get('game') === 'seesaw'
              ? 'seesaw'
              : params.get('game') === 'tower'
                ? 'tower'
                : 'stopline';
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
  const myFalls = useAppSelector(trialSelectors.selectMyFalls);
  const discOmega = useAppSelector(trialSelectors.selectDiscOmega);
  const seesawTilt = useAppSelector(trialSelectors.selectSeesawTilt);
  const towerHud = useAppSelector(trialSelectors.selectTowerHud);
  const myAttempts = useAppSelector(trialSelectors.selectMyAttempts);
  const myPicks = useAppSelector(trialSelectors.selectMyPicks);
  const hunt = useAppSelector(trialSelectors.selectHunt);
  const history = useAppSelector(trialSelectors.selectHistory);
  const liveResult = useAppSelector(trialSelectors.selectLiveResult);

  const [tab, setTab] = useState<'live' | 'log'>('live');
  /** 요약 — 판이 끝나면 10초만 (TRIAL_SUMMARY_MS). 지나면 「다시 하기」 */
  const [summaryUntil, setSummaryUntil] = useState(0);
  const [aiIds, setAiIds] = useState<string[]>([]);
  /** 서버가 입장 때 뽑아 준 내 몸(군인) — 3인칭 게임에서 SelfAvatar 가 입는다 */
  const [myBody, setMyBody] = useState<BodyId | null>(null);
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
    huntState.clear();
    discState.clear();
    seesawState.clear();
    towerState.clear();
    remotePlayers.clear();
    setAiIds([]);
    setMyBody(null);
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
        setMyBody(players.find((p) => p.id === id)?.body ?? null);
        fallState.setSelf(id); // 낙하 생존 — 서버가 적분한 내 높이를 스냅샷에서 골라낸다
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
      onRoundStart: (g, r, startAt, durationMs, pace) => {
        runnerState.resetAll();
        fallState.clear();
        huntState.clear();
        discState.clear();
        seesawState.clear();
        towerState.clear();
        // 움직이는 플랫폼 — 발판 열은 platformState 가 서버와 같은 함수로 그린다 (interrogation/scene/platformState)
        if (g === 'platform') platformState.start(startAt, pace);
        else platformState.clear();
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
        // 움직이는 플랫폼의 봇은 y(발판 위 · 공중)가 실린다 — platformState 가 보간해 PlatformScene 이 그린다
        if (platformState.active) platformState.pushBots(msg.at, msg.ai);
      },
      onHit: (id) => {
        dispatch(trialActions.hitRecorded(id));
        if (id === selfIdRef.current) setFlash(Date.now());
      },
      onColorhunt: (msg) => {
        huntState.sync(msg);
        dispatch(trialActions.colorhuntSynced({ light: msg.light, target: msg.target, targetHex: msg.targetHex }));
      },
      onPicked: (id, objectId) => {
        huntState.picked(objectId);
        dispatch(trialActions.pickRecorded(id));
      },
      onOrb: (orb) => huntState.orb(orb),
      onDisc: (msg) => {
        // 회전 원판 — AI 좌석은 여기 처음 등장한다. 자리는 discState(가변), 각속도만 슬라이스(HUD)
        for (const p of msg.players) if (p.id.startsWith('SUBJECT_')) seeParticipant(p.id);
        discState.push(msg);
        dispatch(trialActions.discSynced(msg.omega));
      },
      onSeesaw: (msg) => {
        // 무게 중심 다리 — AI 좌석은 여기 처음 등장한다. 자리는 seesawState(가변), 기울기만 슬라이스(HUD 계기)
        for (const p of msg.players) if (p.id.startsWith('SUBJECT_')) seeParticipant(p.id);
        seesawState.push(msg);
        dispatch(trialActions.seesawSynced(msg.phi));
      },
      onTower: (msg) => {
        // 무너지는 타워 — AI 좌석은 여기 처음 등장한다. 자리는 towerState(가변), HUD 지도(발판 상태 · 내 발판)만 슬라이스
        for (const p of msg.players) if (p.id.startsWith('SUBJECT_')) seeParticipant(p.id);
        towerState.push(msg);
        const me = msg.players.find((p) => p.id === selfIdRef.current);
        dispatch(trialActions.towerSynced({ slabs: towerState.slabStates(), mine: me && me.f === 0 ? slabIndexAt(me.x, me.z) : -1 }));
      },
      onSlip: (id, vx, vz, ms) => {
        // 움직이는 플랫폼 — 내 발이 밀린 것만 내 몸에 건다. 남의 미끄러짐은 그 사람 화면이 그린다
        if (id === selfIdRef.current) platformState.pushSlip(vx, vz, ms);
      },
      onFell: (id) => {
        dispatch(trialActions.fellRecorded(id));
        if (id === selfIdRef.current) setFlash(Date.now());
      },
      onResult: (result) => {
        platformState.clear();
        dispatch(trialActions.resultReceived(result));
      },
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
  const onPick = useCallback((objectId: number) => connRef.current?.sendPick(objectId), []);
  /** 낙하 생존 — Space. 몸의 높이는 서버가 적분한다 (DodgeRig) */
  const onJump = useCallback(() => connRef.current?.sendJump(), []);
  const sendMove = useCallback((x: number, z: number, y: number, heading: number, anim: AnimState) => connRef.current?.sendMove(x, z, y, heading, anim), []);

  const others = useMemo(() => Object.keys(roster).filter((id) => id !== selfId).map((id) => ({ id })), [roster, selfId]);
  const othersNamed = useMemo(() => Object.entries(roster).filter(([id]) => id !== selfId).map(([id, nickname]) => ({ id, nickname })), [roster, selfId]);
  const sendWalk = useCallback((x: number, z: number) => connRef.current?.sendWalk(x, z), []);
  const sendPush = useCallback((hx: number, hz: number) => connRef.current?.sendPush(hx, hz), []);

  const secondsLeft = roundDurationMs === null ? 0 : Math.max(0, Math.ceil((roundStartAt + roundDurationMs - clock) / 1000));
  const over = liveResult !== null || (round > 0 && roundDurationMs !== null && secondsLeft === 0);
  const summaryLeft = Math.max(0, Math.ceil((summaryUntil - clock) / 1000));
  const showSummary = liveResult !== null && summaryLeft > 0;
  /** 20초 구간 — 바닥 결이 바뀌는 데만 쓴다. 값(마찰)은 서버만 안다 */
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
              : game === 'platform'
                ? '움직이는 발판을 건너라 — W 앞으로 · Space 점프 · 발판 한가운데에 내려라. 떨어지면 출발로 돌아간다'
              : game === 'tower'
                ? `낙하 ${myFalls}회 · 밀림 ${myHits}회 — 발판 가운데에 서라. 무게가 몰리면 기울어 무너진다. WASD 걷기 · Shift 달리기 · Space 밀치기`
              : game === 'seesaw'
                ? `낙하 ${myFalls}회 · 기울기 ${Math.abs((seesawTilt * 180) / Math.PI).toFixed(0)}° — 무리의 무게중심을 축에 맞춰라. 상자가 떨어지면 반대쪽으로. WASD 걷기 · Shift 달리기`
              : game === 'disc'
                ? `낙하 ${myFalls}회 · 회전 ${Math.abs(discOmega).toFixed(1)} rad/s ${discOmega > 0 ? '↻' : discOmega < 0 ? '↺' : ''} — 원판 위에서 버텨라. WASD 걷기 · Shift 달리기`
              : game === 'colorhunt'
                ? hunt
                  ? `주움 ${myPicks} — 「${hunt.target}」 구슬만 E 로 주워라. 헷갈리면 견본판 앞으로`
                  : '지시를 기다리는 중…'
                : myAttempts >= STOPLINE_MAX_ATTEMPTS
                  ? '시행 다 썼다'
                  : `시행 ${myAttempts}회 — W 달리기 · S 브레이크 · 붉은 선에 멈춰라`;
  const shownGame = game ?? wantGame;
  const title =
    shownGame === 'fall'
      ? '낙하 생존'
      : shownGame === 'colorhunt'
        ? '색 사냥'
        : shownGame === 'platform'
          ? '움직이는 플랫폼'
          : shownGame === 'disc'
            ? '회전 원판 생존'
            : shownGame === 'seesaw'
              ? '무게 중심 다리'
              : shownGame === 'tower'
                ? '무너지는 타워'
                : '정지선';
  const flashing = Date.now() - flash < 350;

  return (
    <div ref={rootRef} onClick={lock} style={{ position: 'fixed', inset: 0, background: '#101d31', overflow: 'hidden' }}>
      {shownGame === 'fall' ? (
        <FallScene myBody={myBody} roster={others} aiIds={aiIds} sendMove={sendMove} sendJump={onJump} />
      ) : shownGame === 'colorhunt' ? (
        <ColorHuntScene myBody={myBody} roster={others} aiIds={aiIds} sendMove={sendMove} onPick={onPick} />
      ) : shownGame === 'platform' ? (
        <PlatformScene myBody={myBody} roster={others} aiIds={aiIds} teleport={{ x: 0, z: PAD_START_Z, key: `platform-${roundStartAt}` }} sendMove={sendMove} />
      ) : shownGame === 'disc' ? (
        <DiscScene selfId={selfId} myBody={myBody} roster={othersNamed} aiIds={aiIds} sendWalk={sendWalk} />
      ) : shownGame === 'seesaw' ? (
        <SeesawScene selfId={selfId} myBody={myBody} roster={othersNamed} aiIds={aiIds} sendWalk={sendWalk} />
      ) : shownGame === 'tower' ? (
        <TowerScene selfId={selfId} myBody={myBody} roster={othersNamed} aiIds={aiIds} sendWalk={sendWalk} sendPush={sendPush} />
      ) : (
        <StopLineScene
          myId={selfId}
          myBody={myBody}
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
      {/* 색 사냥 — 방이 통째로 조명색에 물든다(multiply). 흰 조명이면 항등이라 안 보인다. HUD 는 이 위에 그려져 안 물든다 */}
      {shownGame === 'colorhunt' && hunt ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            mixBlendMode: 'multiply',
            background: softLight(hunt.light),
            transition: `background ${HUNT_LIGHT_RAMP_MS}ms ease`,
          }}
        />
      ) : null}
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
      {/* 색 사냥 — 목표색. 스와치는 **기준광 원색**이다(조명 밖 UI): 맵 안 견본판(조명색)과의 대비가 「조명이 색을 바꿨다」를 가르친다 */}
      {round > 0 && shownGame === 'colorhunt' && hunt && !over ? (
        <div
          aria-live="polite"
          style={{
            position: 'absolute',
            top: 64,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            borderRadius: 999,
            background: 'rgba(0,0,0,0.65)',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--linen)',
            pointerEvents: 'none',
          }}
        >
          <span aria-hidden style={{ width: 15, height: 15, borderRadius: '50%', background: hunt.targetHex, boxShadow: '0 0 0 2px rgba(255,255,255,0.25)' }} />
          목표 「{hunt.target}」
        </div>
      ) : null}
      {/* 무게 중심 다리 — 기울기 계기. 판자 모양의 막대가 서버 기울기만큼 기운다(0.01rad 단위). 눈에 보이는 값이라 비밀이 아니다.
          +u(붉은 끝, 화면 오른쪽)가 올라가면 양수. 상한(SEESAW_TILT_MAX)에 가까우면 붉어진다 */}
      {round > 0 && shownGame === 'seesaw' && !over ? (
        <div aria-hidden style={{ position: 'absolute', top: 66, left: '50%', transform: 'translateX(-50%)', width: 160, height: 44, pointerEvents: 'none' }}>
          <svg viewBox="-80 -22 160 44" width={160} height={44} style={{ overflow: 'visible' }}>
            <line x1={-72} y1={0} x2={72} y2={0} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
            <g transform={`rotate(${(-seesawTilt * 180) / Math.PI})`}>
              <rect x={-70} y={-3} width={140} height={6} rx={2} fill={Math.abs(seesawTilt) > SEESAW_TILT_MAX * 0.8 ? 'var(--signal)' : 'var(--linen)'} />
              <rect x={-70} y={-3} width={8} height={6} fill="#5ff0ff" />
              <rect x={62} y={-3} width={8} height={6} fill="#ff4d3a" />
            </g>
            <polygon points="0,4 -6,14 6,14" fill="var(--dust)" />
          </svg>
        </div>
      ) : null}
      {/* 무너지는 타워 — 발판 지도 (UX Pilot 시안 「TowerSurvival - GameHUD」): 5×5 칸이 상태대로 — 성함(강판) · 경고(앰버 깜박) · 떨어짐(빈 점선).
          내가 선 칸은 흰 점. 전부 눈에 보이는 값이다 — 마찰은 없다(P8) */}
      {round > 0 && shownGame === 'tower' && towerHud && !over ? (
        <div aria-hidden style={{ position: 'absolute', top: 60, right: 12, padding: '8px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(95,184,232,0.3)', pointerEvents: 'none' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--dust)', marginBottom: 6 }}>
            타워 상태 · 남은 발판 {towerHud.slabs.filter((v) => v <= 1).length}/{towerHud.slabs.length}
          </div>
          <svg viewBox={`0 0 ${TOWER_N * 18} ${TOWER_N * 18}`} width={TOWER_N * 18} height={TOWER_N * 18}>
            {towerHud.slabs.map((v, i) => {
              const cx = (i % TOWER_N) * 18;
              // 화면의 위가 −z(먼 쪽) — 격자의 j 가 클수록 아래
              const cy = (TOWER_N - 1 - Math.floor(i / TOWER_N)) * 18;
              const fill = v === 0 ? '#2b313a' : v === 1 ? '#e8b34a' : 'transparent';
              const stroke = v === 0 ? 'rgba(95,184,232,0.6)' : v === 1 ? '#e8b34a' : 'rgba(255,255,255,0.18)';
              return (
                <g key={i}>
                  <rect x={cx + 2} y={cy + 2} width={14} height={14} rx={2} fill={fill} stroke={stroke} strokeWidth={1} strokeDasharray={v >= 2 ? '2 2' : undefined} opacity={v === 1 ? 0.55 + 0.45 * Math.abs(Math.sin(clock / 120)) : 1} />
                  {i === towerHud.mine ? <circle cx={cx + 9} cy={cy + 9} r={3} fill="#ffffff" /> : null}
                </g>
              );
            })}
          </svg>
        </div>
      ) : null}
      {/* 무너지는 타워 — 내가 선 발판에 경고가 떴다: 붕괴 임박 띠 (UX Pilot 시안). 옆 발판으로 옮길 시간은 TOWER_WARN_MS */}
      {round > 0 && shownGame === 'tower' && towerHud && towerHud.mine >= 0 && towerHud.slabs[towerHud.mine] === 1 && !over ? (
        <div
          aria-live="assertive"
          style={{
            position: 'absolute',
            top: 66,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '6px 16px',
            borderRadius: 8,
            background: 'rgba(255,77,58,0.18)',
            border: '1px solid var(--signal)',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--signal)',
            pointerEvents: 'none',
            opacity: 0.6 + 0.4 * Math.abs(Math.sin(clock / 110)),
          }}
        >
          ⚠ 위험: 발판 붕괴 임박 — 옆 발판으로
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
      {/* (색 사냥 오버레이보다 뒤에 그려져 요약은 조명에 안 물든다) */}
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

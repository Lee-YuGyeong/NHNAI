/**
 * 검문소 (/interrogation) — 「인간인 척」 판 (PLANNING.md). 2026-09-04 사용자: "예전 게임 내용 다 버려도 되니까
 * 내가 새로 짜놓은 게임으로 다 반영해줘" — 리더가 지시문을 짜던 시행판(features/arena)은 /arena 에 남고,
 * 이 라우트는 통째로 새 판이다.
 *
 *   여러 사람(3~8) + AI 1좌석 + AI 설계자 0~2 → 배역 통보 → 토론 · 실시간 지목 ⇄ 물리 테스트 → 결과 모달 …
 *   → 의심도 100% 는 즉시 격리 → 격리가 총원 절반이면 끝.
 *
 * 판의 진실은 전부 서버(worker/src/game/runtime.ts)에 있다. 이 화면은 방(RoomDO)에 붙어 상태를 받아 그리고,
 * 사람의 입력(지목 · 채팅 · 주장 · 조작 · 물리 테스트 키)을 보낼 뿐이다. 누가 AI 인지 이 화면은 모른다 —
 * 좌석은 전부 SUBJECT nn 이고 채팅 · 이동도 좌석 id 로 온다 (src/world/mp/game-protocol.ts 머리말).
 *
 * 방 번호는 ?code= (없으면 '1234' — /world · /trial 과 같은 개발 편의 기본값). 같은 번호면 같은 판이다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BackToRoot } from '@/shared/BackToRoot';
import { broadcastAnnounce } from '@/shared/broadcast';
import { loadGuestNick } from '@/shared/guest';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { GAME_ENDED_MS, GAME_TEST_MS, type GameSeat } from '@/world/mp/game-protocol';
import type { AnimState, PlayerSnapshot } from '@/world/mp/protocol';
import { spawnFor } from '@/world/mp/spawn';
import { remotePlayers } from '@/world/net/remote-players';
import { RoleBriefing } from './RoleBriefing';
import { gameActions, gameSelectors } from './interrogationSlice';
import { PROLOGUE, prologueLines } from './prologue';
import { prefetchPrologue, resetPrologueVoice, speakPrologueLine, stopPrologue } from './prologueVoice';
import { DialogueBox } from '@/features/world/DialogueBox';
import type { ChatLine } from '@/features/world/worldSlice';
import { BigClock, Chat, DesignerPanel, EndScreen, LobbyPanel, RecordPanel, ResultModal } from './hud/Panels';
import { GameConnection, worldWsBase, type GameIncoming } from './net/GameConnection';
import { HallScene } from './scene/HallScene';
import type { Teleport } from './scene/FreeRig';
import type { BodyId } from '@/world/mp/bodies';
// 낙하 생존의 낙하물 상태도 /trial 과 같은 모듈 하나 — 화면은 달라도 게임은 하나다 (FallStage 머리말)
import { fallState } from '@/features/trial/games/fall/fallState';
import { EXECUTION_MS, executioner } from './scene/executionerStore';
import { platformState } from './scene/platformState';
import { PAD_START_Z } from '@/world/mp/platform';
import { runnerState } from './scene/stopline/runnerState';
// 색 사냥의 구슬 상태·오버레이 색은 /trial 과 같은 모듈이다 — 화면은 달라도 게임은 하나다 (huntState 머리말)
import { huntState, softLight } from '@/features/trial/games/color-hunt/huntState';
// 회전 원판도 같은 모듈 하나 — 원판 각도와 몸의 자리가 여기 들어간다 (discState 머리말)
import { discState } from '@/features/trial/games/disc/discState';
import './interrogation.css';

/** 좌석의 기본 자리 — 홀 가운데 좌석 원 위 (spawn.ts). 판이 열릴 때 전원이 여기서 시작한다 */
function seatSpot(seat: GameSeat, total: number): { x: number; z: number } {
  return spawnFor(seat.seat, Math.max(total, 1));
}

export function InterrogationFeature() {
  const dispatch = useAppDispatch();
  const [params] = useSearchParams();
  const roomCode = params.get('code') ?? '1234';
  const nickname = useMemo(() => loadGuestNick() || `테스터${Math.floor(100 + Math.random() * 900)}`, []);

  const status = useAppSelector(gameSelectors.selectStatus);
  const errorText = useAppSelector(gameSelectors.selectErrorText);
  const selfId = useAppSelector(gameSelectors.selectSelfId);
  const players = useAppSelector(gameSelectors.selectPlayers);
  const wire = useAppSelector(gameSelectors.selectWire);
  const me = useAppSelector(gameSelectors.selectMe);
  const feed = useAppSelector(gameSelectors.selectFeed);
  const test = useAppSelector(gameSelectors.selectTest);
  const myAttempts = useAppSelector(gameSelectors.selectMyAttempts);
  const myHits = useAppSelector(gameSelectors.selectMyHits);
  const myPicks = useAppSelector(gameSelectors.selectMyPicks);
  const myLand = useAppSelector(gameSelectors.selectMyLandings, (a, b) => a.landings === b.landings && a.centers === b.centers && a.misses === b.misses && a.finished === b.finished);
  const myFalls = useAppSelector(gameSelectors.selectMyFalls);
  const discOmega = useAppSelector(gameSelectors.selectDiscOmega);
  const hunt = useAppSelector(gameSelectors.selectHunt);
  const latestResult = useAppSelector(gameSelectors.selectLatestResult);
  const roles = useAppSelector(gameSelectors.selectRoles);
  const outcome = useAppSelector(gameSelectors.selectOutcome);
  const endedAt = useAppSelector(gameSelectors.selectEndedAt);
  const reject = useAppSelector(gameSelectors.selectReject);

  const [locked, setLocked] = useState(false);
  const [composing, setComposing] = useState(false);
  const [bubbleTick, setBubbleTick] = useState(0);
  const [showRole, setShowRole] = useState(false);
  const [teleport, setTeleport] = useState<Teleport | null>(null);
  /** 로비에서 받은 내 몸 (welcome). 판이 열리면 좌석의 body 가 이긴다 — 같은 값이다 */
  const [lobbyBody, setLobbyBody] = useState<BodyId | null>(null);
  /** 격리됐지만 아직 홀에 남아 총을 맞는 중인 좌석 — EXECUTION_MS 뒤 빠진다 (scene/executionerStore) */
  const [dying, setDying] = useState<Set<string>>(() => new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  const connRef = useRef<GameConnection | null>(null);
  if (connRef.current === null) connRef.current = new GameConnection();
  /** 콜백 클로저는 연결 시점에 굳는다 — 프레임마다 바뀌는 것은 ref 로 본다 */
  const meRef = useRef(me);
  meRef.current = me;
  const testRef = useRef(test);
  testRef.current = test;
  const seatsRef = useRef<GameSeat[]>([]);
  const phaseRef = useRef<string>('lobby');
  /**
   * 머리 위 막대가 프레임마다 읽는 눈금 — 값이 아니라 **함수**로 씬에 준다 (SeatAvatar 머리말).
   * 의심도는 자주 움직이는데 값으로 넘기면 그때마다 아바타가 memo 를 뚫고 다시 그려진다.
   */
  const suspicionRef = useRef<Record<string, number>>({});
  suspicionRef.current = wire?.suspicion ?? {};
  const getSuspicion = useCallback((id: string) => suspicionRef.current[id] ?? 0, []);

  const phase = wire?.phase ?? 'lobby';
  const seats = wire?.seats ?? [];
  const mySeatId = me?.seatId ?? null;
  const mySeat = seats.find((s) => s.id === mySeatId) ?? null;
  /** 내 몸 — 달리기 속도·점프 높이가 여기서 갈린다 (mp/bodies.ts, FreeRig) */
  const myBody: BodyId | null = mySeat?.body ?? lobbyBody;
  const nameOf = useCallback((id: string) => (id === 'LEADER' ? '관리 AI' : (seats.find((s) => s.id === id)?.name ?? id)), [seats]);

  /* ─────────────────────────────── 연결 ─────────────────────────────── */

  useEffect(() => {
    dispatch(gameActions.reset());
    remotePlayers.clear();
    runnerState.clear();
    fallState.clear();
    executioner.reset();
    platformState.clear();
    huntState.clear();
    discState.clear();
    dispatch(gameActions.connecting());

    const conn = connRef.current!;
    const now = () => performance.now();
    const addPlayer = (p: PlayerSnapshot) => remotePlayers.add(p, now());

    const onMessage = (msg: GameIncoming) => {
      switch (msg.t) {
        case 'chat': {
          dispatch(gameActions.chatReceived({ id: msg.id, name: msg.nickname, text: msg.text, ts: msg.ts, kind: 'chat' }));
          if (msg.id !== meRef.current?.seatId) {
            remotePlayers.bubble(msg.id, msg.text, now());
            setBubbleTick((n) => n + 1);
          }
          return;
        }
        case 'game_state': {
          const prevPhase = phaseRef.current;
          phaseRef.current = msg.state.phase;
          seatsRef.current = msg.state.seats;
          dispatch(gameActions.stateReceived(msg.state));
          // 판이 열렸다 — 남의 몸을 좌석으로 다시 세운다 (로비의 플레이어 id 는 여기서 사라진다)
          if (msg.state.phase !== 'lobby' && msg.state.phase !== 'ended') {
            const total = msg.state.seats.length;
            const seatIds = new Set(msg.state.seats.map((s) => s.id));
            remotePlayers.each((p) => {
              if (!seatIds.has(p.id)) remotePlayers.remove(p.id);
            });
            for (const s of msg.state.seats) {
              if (s.id === meRef.current?.seatId || remotePlayers.get(s.id)) continue;
              const spot = seatSpot(s, total);
              addPlayer({ id: s.id, seat: s.seat, nickname: s.name, x: spot.x, z: spot.z, y: 0, heading: 0, anim: 'idle', body: s.body });
              runnerState.setLane(s.id, s.seat - 1);
            }
          }
          if (prevPhase !== 'briefing' && msg.state.phase === 'briefing') setShowRole(true);
          return;
        }
        case 'game_role': {
          dispatch(gameActions.roleReceived(msg));
          // 내 좌석이 정해졌다 — 좌석 원 위 내 자리로 옮기고, 남의 목록에서 나를 뺀다
          remotePlayers.remove(msg.seatId);
          const seat = seatsRef.current.find((s) => s.id === msg.seatId);
          if (seat) {
            const spot = seatSpot(seat, seatsRef.current.length);
            setTeleport({ x: spot.x, z: spot.z, key: `seat-${msg.seatId}` });
            runnerState.setLane(msg.seatId, seat.seat - 1);
          }
          if (phaseRef.current === 'briefing') setShowRole(true);
          return;
        }
        case 'game_suspicion':
          dispatch(gameActions.suspicionReceived(msg));
          return;
        case 'game_isolated': {
          dispatch(gameActions.isolatedReceived(msg));
          /*
           * 무대 위 처형자가 그 몸을 쏜다 (scene/Executioner) — 몸은 EXECUTION_MS 동안 홀에 남았다가(dying) 사라진다.
           * 판은 그대로다: 격리는 서버가 이미 했고 좌석판도 지금 바뀐다. 내 화면의 연출만 그 뒤를 따른다.
           * 내가 격리됐으면 몸이 없으니 내 마지막 좌표를 쏜다.
           */
          const id = msg.id;
          executioner.execute(id, id === meRef.current?.seatId ? { ...myPos.current } : null);
          setDying((d) => new Set(d).add(id));
          window.setTimeout(() => {
            remotePlayers.remove(id);
            setDying((d) => {
              const n = new Set(d);
              n.delete(id);
              return n;
            });
          }, EXECUTION_MS);
          return;
        }
        case 'game_leader':
          dispatch(gameActions.leaderReceived(msg));
          dispatch(broadcastAnnounce({ text: msg.text, kind: msg.kind, ts: msg.ts }));
          return;
        case 'game_verdict':
          dispatch(gameActions.verdictReceived(msg));
          return;
        case 'game_ended':
          dispatch(gameActions.endedReceived(msg));
          return;
        case 'game_reject':
          dispatch(gameActions.rejected(msg.why));
          return;
        case 'game_tamper_ok':
          dispatch(gameActions.tamperOk(msg.left));
          return;
        case 'trial_round_start': {
          dispatch(gameActions.testStarted({ game: msg.game, round: msg.round, startAt: msg.startAt, durationMs: msg.durationMs }));
          runnerState.resetAll();
          fallState.clear();
          huntState.clear();
          discState.clear();
          // 움직이는 플랫폼 — 발판 열이 서고(platformState), 전원이 출발 발판 위에서 시작한다 (좌석 번호로 나란히)
          if (msg.game === 'platform') {
            const seat = seatsRef.current.find((s) => s.id === meRef.current?.seatId);
            const x = seat ? -0.6 + ((seat.seat - 1) % 4) * 0.4 : 0;
            platformState.start(msg.startAt, msg.pace, { x, z: PAD_START_Z });
            setTeleport({ x, z: PAD_START_Z, key: `platform-${msg.startAt}` });
          } else platformState.clear();
          return;
        }
        case 'trial_landed':
          dispatch(gameActions.landingRecorded({ id: msg.id, pad: msg.pad, center: msg.center, missed: msg.missed }));
          return;
        case 'trial_running':
          // 내 것은 W 를 누른 순간 이미 로컬로 달리기 시작했다 (StopRig)
          if (msg.id !== meRef.current?.seatId) runnerState.running(msg.id, msg.startAt);
          return;
        case 'trial_stopline_waypoints':
          runnerState.braking(msg.id, msg.brakePos, msg.stopPos, msg.brakeAt, msg.stopAt);
          dispatch(gameActions.attemptRecorded(msg.id));
          return;
        case 'trial_snapshot': {
          fallState.push(msg);
          const at = now();
          for (const a of msg.ai) {
            const p = remotePlayers.get(a.id);
            if (!p) continue;
            const moved = Math.hypot(p.pose.x - a.x, p.pose.z - a.z) > 0.03;
            const heading = moved ? Math.atan2(a.x - p.pose.x, a.z - p.pose.z) : p.pose.heading;
            // y — 움직이는 플랫폼의 봇은 발판 위(0.5)에 서고 뛴다. 다른 게임은 안 실려 0
            remotePlayers.move(a.id, a.x, a.z, a.y ?? 0, heading, moved ? 'walk' : 'idle', at);
          }
          return;
        }
        case 'trial_disc': {
          /*
           * 회전 원판 — 이 게임만은 **사람의 자리도 서버가 적분한다** (원판이 실어 나르고 미끄러뜨리는 양이
           * 숨은 마찰계수에서 나온다, P8). 그래서 player_moved 가 안 오고, 남의 몸은 여기서 remotePlayers 로
           * 밀어 넣는다 — 홀의 다른 국면과 같은 길이라 이름표와 의심도 막대가 그대로 따라온다 (SeatAvatar).
           * 원판 각도(theta)는 discState 가 들고 DiscStage · DiscRig 가 프레임마다 읽는다.
           */
          discState.push(msg);
          dispatch(gameActions.discSynced(msg.omega));
          const at = now();
          for (const b of msg.players) {
            if (b.id === meRef.current?.seatId) {
              // 내 몸은 DiscRig 가 그린다. 자리만 적어 둔다 — 원판 위에서 격리되면 처형자가 겨눌 곳이다
              myPos.current.x = b.x;
              myPos.current.z = b.z;
              continue;
            }
            remotePlayers.move(b.id, b.x, b.z, b.y, b.h, b.m === 2 ? 'run' : b.m === 1 ? 'walk' : 'idle', at);
          }
          return;
        }
        case 'trial_fell':
          dispatch(gameActions.fellRecorded(msg.id));
          return;
        case 'trial_hit':
          dispatch(gameActions.hitRecorded(msg.id));
          return;
        case 'trial_colorhunt':
          // 색 사냥 — 시작·조명 전환의 전체 동기화. 구슬·견본판은 huntState(가변), 조명·목표는 슬라이스
          huntState.sync(msg);
          dispatch(gameActions.colorhuntSynced({ light: msg.light, target: msg.target, targetHex: msg.targetHex }));
          return;
        case 'trial_picked':
          huntState.picked(msg.objectId);
          dispatch(gameActions.pickRecorded(msg.id));
          return;
        case 'trial_orb':
          huntState.orb(msg.orb);
          return;
        case 'trial_result':
          dispatch(gameActions.resultReceived(msg.result));
          platformState.clear();
          discState.clear();
          // 정지선 레일에서 내려온다 — 내 좌석 자리로
          {
            const seat = seatsRef.current.find((s) => s.id === meRef.current?.seatId);
            if (seat) {
              const spot = seatSpot(seat, seatsRef.current.length);
              setTeleport({ x: spot.x, z: spot.z, key: `result-${msg.result.endedAt}` });
            }
          }
          return;
        default:
          return;
      }
    };

    conn.connect(worldWsBase(), roomCode, nickname, {
      onWelcome: (id, list) => {
        for (const p of list) if (p.id !== id) addPlayer(p);
        // 내 몸 — 서버가 입장 때 뽑아 준 군인. 판이 열리면 좌석(GameSeat.body)이 같은 값을 다시 준다
        setLobbyBody(list.find((p) => p.id === id)?.body ?? null);
        dispatch(gameActions.welcomed({ selfId: id, players: list.map((p) => ({ id: p.id, nickname: p.nickname })) }));
      },
      onJoined: (p) => {
        if (phaseRef.current === 'lobby') addPlayer(p);
        dispatch(gameActions.playerJoined({ id: p.id, nickname: p.nickname }));
      },
      onLeft: (id) => {
        if (phaseRef.current === 'lobby') remotePlayers.remove(id);
        dispatch(gameActions.playerLeft(id));
      },
      onMoved: (id, x, z, y, heading, anim) => {
        // 정지선은 레일 타임라인이, 회전 원판은 서버 스냅샷이 그린다 — 두 출처로 그리면 몸이 두 자리를 오간다
        if (testRef.current?.game === 'stopline' || testRef.current?.game === 'disc') return;
        remotePlayers.move(id, x, z, y, heading, anim, now());
      },
      onMessage,
      onError: (code) => dispatch(gameActions.errorOccurred(code)),
      onClose: () => dispatch(gameActions.closed()),
    });
    return () => conn.close();
  }, [dispatch, roomCode, nickname]);

  /* ─────────────────────────────── 마우스 잠금 ─────────────────────────────── */

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
    if (!el || document.pointerLockElement === el || composing) return;
    try {
      const p = el.requestPointerLock() as unknown;
      if (p instanceof Promise) p.catch(() => {});
    } catch {
      /* 거절됐다 — 시야만 못 돌릴 뿐 키는 된다 */
    }
  };
  /* ─────────────────────────────── 프롤로그 ─────────────────────────────── */

  /*
   * 판이 열리고 첫 토론이 시작되면 대본(prologue.ts)이 화면 아래 비주얼 노벨식 대화창(DialogueBox)으로 한 줄씩 흐른다 —
   * 피실험자 셋의 웅성거림과 정부 통제실의 방송, 얼굴은 그 좌석의 군인 클로즈업. 구역 통신(채팅)은 따로 그대로다.
   * **화면에서만** 난다: 서버 · 관리 AI · 의심도 어느 것도 이 줄을 모른다. 같은 판(startedAt)에서는 한 번만.
   * 줄을 한꺼번에 건네면 상자가 제 박자(타자 · 머무름)로 차례로 찍는다 — 클릭하면 넘어간다. 로비로 돌아오면 비운다.
   */
  const [prologue, setPrologue] = useState<ChatLine[]>([]);
  const prologuePlayed = useRef<number | null>(null);
  /**
   * 지금 그 줄을 읽고 있나 — 상자에 건네면 **다 읽을 때까지 상자가 붙잡는다** (DialogueBox 의 speaking).
   * 박자를 여기서 세지 않는 이유가 이것이다: 상자가 이미 줄을 넘기는 주인이라, 두 곳에서 세면 어긋난다.
   */
  const [prologueSpeaking, setPrologueSpeaking] = useState(false);
  const startedAt = wire?.startedAt ?? null;
  const testsDone = wire?.testsDone ?? 0;
  useEffect(() => {
    if (phase === 'lobby') {
      setPrologue([]);
      return;
    }
    if (phase !== 'discussion' || testsDone !== 0 || startedAt === null) return;
    if (prologuePlayed.current === startedAt) return;
    prologuePlayed.current = startedAt;
    /*
     * 소리는 미리 받아 둔다 — 합성 왕복이 300~800ms 라, 줄이 뜬 뒤에 받기 시작하면 첫 줄만
     * 자막이 먼저 뜨고 소리가 뒤늦게 붙는다 (prologueVoice 머리말).
     */
    resetPrologueVoice();
    prefetchPrologue(PROLOGUE);
    setPrologue(prologueLines(seatsRef.current, startedAt));
  }, [phase, testsDone, startedAt]);

  /**
   * 상자가 한 줄을 띄웠다 — 그 줄을 읽는다.
   *
   * 줄의 key 가 `prologue-<씨앗>-<번호>` 라(prologue.ts 의 prologueLines) 번호로 대본을 되찾는다.
   * 상자가 넘기는 주인이고 여기는 소리만 얹는다 — 읽는 동안 speaking 을 세워 두면 상자가 기다린다.
   */
  const onPrologueLine = useCallback((key: string) => {
    const i = Number(key.slice(key.lastIndexOf('-') + 1));
    const line = Number.isInteger(i) ? PROLOGUE[i] : undefined;
    if (!line) return;
    setPrologueSpeaking(true);
    void speakPrologueLine(line).finally(() => setPrologueSpeaking(false));
  }, []);

  // 화면을 떠나는데 통제실이 계속 말하고 있으면 안 된다
  useEffect(() => () => stopPrologue(), []);

  // 판이 떠 있는 동안은 잠금을 푼다 — 결과 모달 · 끝 화면 · 역할 카드 · 대기
  const modalUp = phase === 'result' || phase === 'ended' || phase === 'lobby' || showRole;
  useEffect(() => {
    if (modalUp && document.pointerLockElement) document.exitPointerLock();
  }, [modalUp]);

  /* ─────────────────────────────── 보내기 ─────────────────────────────── */

  const conn = connRef.current;
  /** 내 마지막 좌표 — 내가 격리될 때 처형자가 겨눌 자리 */
  const myPos = useRef({ x: 0, z: 4 });
  const sendMove = useCallback(
    (x: number, z: number, y: number, heading: number, anim: AnimState) => {
      myPos.current.x = x;
      myPos.current.z = z;
      conn.sendMove(x, z, y, heading, anim);
    },
    [conn],
  );
  const onAccel = useCallback(() => conn.sendAccel(), [conn]);
  const onBrake = useCallback(() => conn.sendBrake(), [conn]);
  const onPick = useCallback((objectId: number) => conn.sendPick(objectId), [conn]);
  const onWalk = useCallback((x: number, z: number) => conn.sendWalk(x, z), [conn]);
  const onSend = useCallback((text: string) => conn.sendChat(text), [conn]);
  const onStart = useCallback(
    (fillTo: number) => {
      dispatch(gameActions.clearReject());
      conn.game({ t: 'game_start', fillTo });
    },
    [conn, dispatch],
  );
  const onTamper = useCallback((target: string, direction: 'suspicious' | 'normal') => conn.game({ t: 'game_tamper', target, direction }), [conn]);

  /* ─────────────────────────────── 낙하 피격 번쩍임 ─────────────────────────────── */
  const [flashKey, setFlashKey] = useState(0);
  const hitsSeen = useRef(0);
  useEffect(() => {
    if (myHits > hitsSeen.current) setFlashKey((k) => k + 1);
    hitsSeen.current = myHits;
  }, [myHits]);

  /* ─────────────────────────────── 그리기 ─────────────────────────────── */

  const inGame = phase !== 'lobby';
  const others = useMemo(
    () =>
      inGame
        ? seats.filter((s) => s.id !== mySeatId && (!s.isolated || dying.has(s.id))).map((s) => ({ id: s.id }))
        : Object.keys(players)
            .filter((id) => id !== selfId)
            .map((id) => ({ id })),
    [inGame, seats, mySeatId, players, selfId, dying],
  );
  /** 내가 지금 겨누고 있는 좌석 — 그 몸의 이름표에 👉 가 붙는다. 단추는 없다: 말에서 읽어 낸 지목이다 (runtime 의 accusationIn) */
  const markId = mySeatId ? (wire?.accusations[mySeatId] ?? null) : null;
  const spawn = useMemo(() => (mySeat ? seatSpot(mySeat, seats.length) : { x: 0, z: 4 }), [mySeat, seats.length]);
  const hud =
    status === 'connecting'
      ? '연결하는 중…'
      : status === 'error'
        ? `연결 실패: ${errorText} — 워커(npm run worker:dev)가 떠 있어야 한다`
        : phase === 'test' && test
          ? test.game === 'stopline'
            ? `W 달리기 · S 브레이크 · 붉은 선에 정확히 서라 (시행 ${myAttempts})`
            : test.game === 'fall'
              ? `떨어지는 것을 피하라 — WASD (피격 ${myHits})`
              : test.game === 'platform'
                ? myLand.finished
                  ? `완주 — 도착 발판에서 기다려라 (착지 ${myLand.landings} · 정중앙 ${myLand.centers} · 실패 ${myLand.misses})`
                  : `움직이는 발판을 건너라 — W 앞으로 · Space 점프 · 떨어지면 출발로 (착지 ${myLand.landings} · 정중앙 ${myLand.centers} · 실패 ${myLand.misses})`
                : test.game === 'disc'
                  ? `도는 원판 위에서 버텨라 — WASD 걷기 · Shift 달리기 (낙하 ${myFalls}회 · 회전 ${Math.abs(discOmega).toFixed(1)} rad/s ${discOmega > 0 ? '↻' : discOmega < 0 ? '↺' : ''})`
                  : hunt
                    ? `「${hunt.target}」 구슬만 E 로 주워라 (주움 ${myPicks}) — 헷갈리면 견본판과 대조하라`
                    : '지시된 색의 구슬을 E 로 주워라'
          : phase === 'discussion'
            ? 'WASD 이동 · Enter 로 말하기 — 관리 AI 가 그 말을 읽는다'
            : '';

  return (
    <div ref={rootRef} className="ig-root" onClick={lock}>
      {/* 프롤로그 대화창 — 화면 아래 가운데, 채팅 판과 별개 (prologue.ts). 줄이 다 지나면 상자가 스스로 사라진다.
          speaking · onLine 을 준다 = **소리는 이쪽이 낸다** (DialogueBox 의 speaking 머리말). 상자는 줄을
          넘기는 주인이고 여기는 그 줄을 읽고 「아직 읽는 중」이라고만 알린다 — 그래야 한 줄이 끝나야 다음 줄이 뜬다 */}
      <DialogueBox
        messages={prologue}
        selfId={null}
        touch={false}
        speaking={prologueSpeaking}
        onLine={onPrologueLine}
      />
      <HallScene
        mySeatId={mySeatId}
        myBody={myBody}
        myLane={mySeat ? mySeat.seat - 1 : 0}
        others={others}
        getSuspicion={getSuspicion}
        markId={markId}
        bubbleTick={bubbleTick}
        test={phase === 'test' && test ? { game: test.game, round: test.round } : null}
        myAttempts={myAttempts}
        spawn={spawn}
        teleport={teleport}
        composing={composing}
        paused={modalUp}
        onAccel={onAccel}
        onBrake={onBrake}
        onPick={onPick}
        onWalk={onWalk}
        sendMove={sendMove}
      />

      {/* 색 사냥 — 방이 통째로 조명색에 물든다(multiply). 흰 조명이면 항등. HUD(.ig-hud)는 이 뒤에 그려져 안 물든다 */}
      {phase === 'test' && test?.game === 'colorhunt' && hunt ? <div aria-hidden className="ig-huntlight" style={{ background: softLight(hunt.light) }} /> : null}

      {flashKey > 0 ? <div key={flashKey} className="ig-hitflash" /> : null}

      <div className="ig-hud" onClick={(e) => e.stopPropagation()}>
        <div className="ig-corner">
          <BackToRoot />
        </div>
        {/* 미니 게임 30초만 큰 숫자로 — 토론은 시계 없이 간다 (사용자, BigClock 머리말) */}
        {wire && phase === 'test' ? <BigClock endsAt={wire.phaseEndsAt} maxSeconds={(test?.durationMs ?? GAME_TEST_MS) / 1000} /> : null}
        {phase === 'test' && wire?.currentTest ? <div className="ig-order">{wire.currentTest.instruction}</div> : null}
        {/* 색 사냥 — 목표색. 스와치는 **기준광 원색**(조명 밖 UI): 맵 안 견본판(조명색)과의 대비가 「조명이 색을 바꿨다」를 가르친다 */}
        {phase === 'test' && test?.game === 'colorhunt' && hunt ? (
          <div className="ig-hunttarget" aria-live="polite">
            <span aria-hidden className="swatch" style={{ background: hunt.targetHex }} />
            목표 「{hunt.target}」
          </div>
        ) : null}

        {/*
          * 좌석 카드(SUBJECTS)는 없다 — 눈금은 **머리 위 막대**가 말한다 (scene/SuspicionBar, 2026-09-05 사용자:
          * "카드는 안보여도돼. 머리위에 의심도만 보이면 돼"). 단추로 지목하는 짓도 같이 사라졌다:
          * 눈금을 움직이는 것은 **관리 AI 가 사람들의 말을 읽는 것**이다 (worker/src/game/agents.ts 의 readTalk).
          */}
        {inGame && latestResult && phase !== 'result' ? <RecordPanel result={latestResult} nameOf={nameOf} mySeatId={mySeatId} /> : null}
        {me?.role === 'designer' && wire && inGame && phase !== 'ended' ? (
          <DesignerPanel seats={seats} mySeatId={mySeatId} tamperLeft={me.tamperLeft} phase={phase} onTamper={onTamper} />
        ) : null}

        {/*
         * 미니 게임이 도는 동안은 판이 **통째로 내려간다** (2026-09-04 사용자: "미니 게임할때는
         * 채팅창 안보이게 · 끝나면 다시 채팅할수있게"). 흐리게만 두던 것으로는 모자랐다 —
         * 시행은 몸으로 하는 판이라 손이 WASD·E 위에 있는데, 판이 서 있으면 Enter 한 번에 그 손이
         * 입력창으로 끌려간다. 쌓인 말은 안 잃는다: 로그는 gameSlice 에 그대로 남아 있어서
         * 시행이 끝나면 하던 대화가 그 자리에서 다시 뜬다.
         */}
        {phase !== 'test' ? (
          <Chat
            feed={feed}
            mySeatId={mySeatId}
            markId={markId}
            disabled={status !== 'connected' || phase === 'result' || phase === 'ended' || (inGame && !mySeatId)}
            onSend={onSend}
            onComposing={setComposing}
          />
        ) : null}

        {hud ? (
          <p className="ig-foot">
            {hud}
            {!locked && status === 'connected' && !modalUp ? ' · 화면을 클릭하면 마우스로 둘러본다' : ''}
          </p>
        ) : null}

        {wire && phase === 'lobby' ? <LobbyPanel wire={wire} players={players} selfId={selfId} myBody={myBody} reject={reject} onStart={onStart} /> : null}
        {reject && phase !== 'lobby' ? <p className="ig-banner alarm">{reject}</p> : null}
        {phase === 'result' && latestResult ? <ResultModal result={latestResult} nameOf={nameOf} mySeatId={mySeatId} endsAt={wire?.phaseEndsAt ?? null} /> : null}
        {phase === 'ended' && outcome ? (
          <EndScreen
            outcome={outcome}
            roles={roles}
            seats={seats}
            mySeatId={mySeatId}
            myRole={me?.role ?? null}
            endsAt={endedAt === null ? null : endedAt + GAME_ENDED_MS}
            onAgain={() => window.location.reload()}
          />
        ) : null}
      </div>

      {showRole && me && me.role !== 'ai' ? (
        <RoleBriefing role={me.role} body={myBody} aiName={me.aiId ? nameOf(me.aiId) : null} onDone={() => setShowRole(false)} />
      ) : null}
    </div>
  );
}

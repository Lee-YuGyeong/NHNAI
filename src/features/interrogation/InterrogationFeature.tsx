/**
 * 검문소 (/interrogation) — 「인간인 척」 판 (PLANNING.md). 2026-09-04 사용자: "예전 게임 내용 다 버려도 되니까
 * 내가 새로 짜놓은 게임으로 다 반영해줘" — 리더가 지시문을 짜던 시행판(features/arena)은 /arena 에 남고,
 * 이 라우트는 통째로 새 판이다.
 *
 *   여러 사람(3~8) + AI 1좌석 + AI 설계자 1~2 → 배역 통보 → 토론 · 실시간 지목 ⇄ 물리 테스트 → 결과 모달 …
 *   → 의심도 100% 는 즉시 격리 → 격리가 총원 절반이면 끝.
 *
 * 판의 진실은 전부 서버(worker/src/game/runtime.ts)에 있다. 이 화면은 방(RoomDO)에 붙어 상태를 받아 그리고,
 * 사람의 입력(지목 · 채팅 · 주장 · 물리 테스트 키)을 보낼 뿐이다. 누가 AI 인지 이 화면은 모른다 —
 * 좌석은 전부 SUBJECT nn 이고 채팅 · 이동도 좌석 id 로 온다 (src/world/mp/game-protocol.ts 머리말).
 *
 * 방 번호는 ?code= (없으면 '1234' — /world · /trial 과 같은 개발 편의 기본값). 같은 번호면 같은 판이다.
 * 이름은 ?nick= (없으면 저장된 게스트 이름) — 「게임 시작」이 여기로 곧장 걸리면서 대기방에서 쓰던
 * 이름을 같이 들고 온다 (2026-09-05, shared/start.ts · lobby/Waitroom 의 startHref).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BackToRoot } from '@/shared/BackToRoot';
import { broadcastAnnounce } from '@/shared/broadcast';
import { loadGuestNick } from '@/shared/guest';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { GAME_DISCUSSION_MS, GAME_MAX_HUMANS, GAME_TEST_MS, GAME_TEST_COUNT, type GameSeat } from '@/world/mp/game-protocol';
import type { AnimState, PlayerSnapshot } from '@/world/mp/protocol';
import { spawnFor } from '@/world/mp/spawn';
import { remotePlayers } from '@/world/net/remote-players';
import { RoleBriefing } from './RoleBriefing';
import { gameActions, gameSelectors } from './interrogationSlice';
import { PROLOGUE, castSubjects, prologueLineOf, prologueLines } from './prologue';
import { prefetchPrologue, prologueClipMs, prologueLagMs, resetPrologueVoice, speakPrologueLine, stopPrologue } from './prologueVoice';
import { DialogueBox } from '@/features/world/DialogueBox';
import type { ChatLine } from '@/features/world/worldSlice';
import { BigClock, Chat, EndScreen, LobbyPanel, ResultModal, TestOrder, withRo } from './hud/Panels';
import { SelfSuspicion } from './hud/SelfSuspicion';
import { CardDock, CardOffer, CardReveal, CompelBar } from './hud/Cards';
import type { CardItem } from '@/world/mp/game-protocol';
import { GameConnection, worldWsBase, type GameIncoming } from './net/GameConnection';
import { HallScene } from './scene/HallScene';
import type { Teleport } from './scene/FreeRig';
import type { BodyId } from '@/world/mp/bodies';
// 낙하 생존의 낙하물 상태도 /trial 과 같은 모듈 하나 — 화면은 달라도 게임은 하나다 (FallStage 머리말)
import { fallState } from '@/features/trial/games/fall/fallState';
import { EXECUTION_MS, executioner } from './scene/executionerStore';
import { platformState } from './scene/platformState';
import { selfBubble } from './scene/selfBubble';
import { PAD_START_Z, startSlot } from '@/world/mp/platform';
import { runnerState } from './scene/stopline/runnerState';
// 색 사냥의 구슬 상태·오버레이 색은 /trial 과 같은 모듈이다 — 화면은 달라도 게임은 하나다 (huntState 머리말)
import { huntState, softLight } from '@/features/trial/games/color-hunt/huntState';
// 회전 원판도 같은 모듈 하나 — 원판 각도와 몸의 자리가 여기 들어간다 (discState 머리말)
import { discState } from '@/features/trial/games/disc/discState';
// 무게 중심 다리도 같다 — 판자 기울기와 몸의 판자 좌표가 여기 들어간다 (seesawState 머리말)
import { seesawState, worldOf as seesawWorldOf } from '@/features/trial/games/seesaw/seesawState';
import './interrogation.css';

/** 좌석의 기본 자리 — 홀 가운데 좌석 원 위 (spawn.ts). 판이 열릴 때 전원이 여기서 시작한다 */
function seatSpot(seat: GameSeat, total: number): { x: number; z: number } {
  return spawnFor(seat.seat, Math.max(total, 1));
}

/**
 * 들어오면 바로 판이 열린다 — 홀에 서는 몸은 넷: 나 + 대역 둘 + AI 한 좌석 (2026-09-05 사용자: "들어가면 4인으로
 * 바로 플레이되게"). 몸이 넷(mp/bodies.ts 의 BODY_IDS)이라 넷이면 전원이 서로 다른 몸을 입는다.
 * 서버의 fillTo 는 **사람 쪽 좌석 수**다(runtime.start — AI 는 그 위에 얹힌다). 그래서 보낼 때 하나를 뺀다.
 * 둘이 같이 들어오면 사람이 대역 자리를 차지한다 — 넷은 그대로다. 예전처럼 소집 대기를 보려면 ?lobby.
 *
 * ★ 여럿이 같이 넘어왔으면(?party=) **다 붙을 때까지 기다렸다가** 연다 — 자리 수도 그 수만큼이다
 *   (아래 party · PARTY_WAIT_MS). 혼자 들어온 길은 예전 그대로 곧장 열린다.
 */
const AUTO_SEATS = 4;
/** 끝 화면이 서 있는 시간 — 다 가면 스스로 방을 나간다 (onLeave). 정체표를 읽을 만큼만 */
const END_LEAVE_MS = 15_000;

/**
 * 일행을 여기까지만 기다린다 (ms). 대기방의 「게임 시작」은 전원을 같은 순간에 보내므로 소켓은 몇 초 안에
 * 다 붙는다 — 이 시간은 **안 오는 사람**을 위한 것이다 (창을 닫았거나 길을 잃었거나). 다 지나면 있는
 * 사람끼리 열고, 빈자리는 대역이 앉는다 (§9 "일부 참가자를 NPC 로 대체하는 폴백").
 */
const PARTY_WAIT_MS = 10_000;


export function InterrogationFeature() {
  const dispatch = useAppDispatch();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const roomCode = params.get('code') ?? '1234';
  // 주소에 실려 온 이름이 먼저다 — 대기방에서 앉아 있던 그 이름이라야 옆자리가 같은 사람으로 본다.
  // 한 번 정하면 안 바꾼다(deps []): 판이 도는 중에 이름이 갈리면 서버가 다른 사람으로 받는다
  const nickFromUrl = params.get('nick')?.trim() ?? '';
  const nickname = useMemo(
    () => nickFromUrl || loadGuestNick() || `테스터${Math.floor(100 + Math.random() * 900)}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /**
   * 같이 넘어온 사람 수 — 대기방의 「게임 시작」이 주소에 실어 보낸다 (lobby/Waitroom 의 startHref).
   * 판이 열릴 때 **사람 자리를 그만큼 연다**: 소켓은 한 사람씩 붙는데 판은 첫 사람이 붙는 그 순간
   * 열려서(AUTO_SEATS 자동 시작), 자리가 셋뿐이면 넷째부터는 앉을 곳이 없다. 아직 안 붙은 자리는
   * 대역이 지키고 있다가 그 사람이 도착하면 내준다 (worker/src/game/runtime.ts 의 rebind).
   * 없으면 1 — /play 나 주소로 혼자 들어온 길이다.
   */
  const party = Math.min(GAME_MAX_HUMANS, Math.max(1, Number(params.get('party')) || 1));

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
  const hunt = useAppSelector(gameSelectors.selectHunt);
  const latestResult = useAppSelector(gameSelectors.selectLatestResult);
  const roles = useAppSelector(gameSelectors.selectRoles);
  const outcome = useAppSelector(gameSelectors.selectOutcome);
  const endedAt = useAppSelector(gameSelectors.selectEndedAt);
  const reject = useAppSelector(gameSelectors.selectReject);
  const myTalk = useAppSelector(gameSelectors.selectMyTalk);
  const talkGained = useAppSelector(gameSelectors.selectTalkGained);
  const cards = useAppSelector(gameSelectors.selectCards);
  const cardNote = useAppSelector(gameSelectors.selectCardNote);
  const cardReveal = useAppSelector(gameSelectors.selectCardReveal);

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
  // 낙하 생존 — 스냅샷의 air 에서 **내 좌석**의 높이를 골라낸다. 판 안의 id 는 좌석 id 다 (SUBJECT_nn)
  useEffect(() => {
    fallState.setSelf(mySeatId);
  }, [mySeatId]);

  /* ─────────────────────────────── 연결 ─────────────────────────────── */

  useEffect(() => {
    dispatch(gameActions.reset());
    remotePlayers.clear();
    selfBubble.clear();
    runnerState.clear();
    fallState.clear();
    executioner.reset();
    platformState.clear();
    huntState.clear();
    discState.clear();
    seesawState.clear();
    dispatch(gameActions.connecting());

    const conn = connRef.current!;
    const now = () => performance.now();
    const addPlayer = (p: PlayerSnapshot) => remotePlayers.add(p, now());

    const onMessage = (msg: GameIncoming) => {
      switch (msg.t) {
        case 'chat': {
          dispatch(gameActions.chatReceived({ id: msg.id, name: msg.nickname, text: msg.text, ts: msg.ts, kind: 'chat' }));
          // 말풍선 — 남의 말은 그 몸에, 내 말은 내 머리 위에 (selfBubble, 2026-09-05 사용자). 둘 다 bubbleTick 으로 다시 그린다
          if (msg.id !== meRef.current?.seatId) remotePlayers.bubble(msg.id, msg.text, now());
          else selfBubble.set(msg.text, now());
          setBubbleTick((n) => n + 1);
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
        case 'game_talk':
          dispatch(gameActions.talkReceived(msg));
          return;
        case 'game_cards':
          dispatch(gameActions.cardsReceived({ offer: msg.offer, items: msg.items }));
          return;
        case 'game_card_used':
          dispatch(gameActions.cardUsed({ by: msg.by, item: msg.item, target: msg.target, text: msg.text }));
          return;
        case 'game_compelled':
          dispatch(gameActions.compelledReceived({ by: msg.by, target: msg.target, verdict: msg.verdict, text: msg.text, delta: msg.delta }));
          return;
        case 'trial_round_start': {
          dispatch(gameActions.testStarted({ game: msg.game, round: msg.round, startAt: msg.startAt, durationMs: msg.durationMs }));
          runnerState.resetAll();
          fallState.clear();
          huntState.clear();
          discState.clear();
          seesawState.clear();
          // 움직이는 플랫폼 — 발판 열이 서고(platformState), 전원이 출발 발판 위 2×2 자리에서 시작한다 (좌석 번호로, platform.ts startSlot)
          if (msg.game === 'platform') {
            const seat = seatsRef.current.find((s) => s.id === meRef.current?.seatId);
            const home = seat ? startSlot(seat.seat - 1) : { x: 0, z: PAD_START_Z };
            platformState.start(msg.startAt, msg.pace, home);
            setTeleport({ ...home, key: `platform-${msg.startAt}` });
          } else platformState.clear();
          return;
        }
        case 'trial_landed':
          dispatch(gameActions.landingRecorded({ id: msg.id, pad: msg.pad, center: msg.center, missed: msg.missed }));
          return;
        case 'trial_slip':
          // 움직이는 플랫폼 — 착지한 내 발이 밀렸다. 발판 마찰은 숨은 값이고 결과만 온다(P8)
          if (msg.id === meRef.current?.seatId) platformState.pushSlip(msg.vx, msg.vz, msg.ms);
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
            // h 가 실려 오면 그대로 — 토론 중 **몸을 안 돌리고 물러서는** 대역은 이동 방향에서 뽑으면
            // 앞으로 걷는 것으로 그려진다 (docs/SUSPICION.md 「봇도 굳고 뒤로 걷는다」). 안 실려 오면 예전대로 이동 방향에서
            const heading = a.h ?? (moved ? Math.atan2(a.x - p.pose.x, a.z - p.pose.z) : p.pose.heading);
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
          // 각속도는 화면에 안 선다 — 10Hz 스냅샷마다 저장소를 건드리면 HUD 전체가 그만큼 다시 그려진다 (discState 가 프레임마다 읽는다)
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
        case 'trial_seesaw': {
          // 무게 중심 다리 — 원판과 같은 규칙: 사람의 자리도 서버가 적분한다(판이 기울면 미끄러지는 양이 숨은 μ 에서 나온다, P8).
          // 자리는 판자 좌표(u · v)로 오고, 월드 자리는 기울기로 푼다 (seesawState.worldOf). 남의 몸은 remotePlayers 로
          seesawState.push(msg);
          const at = now();
          for (const b of msg.players) {
            const w = seesawWorldOf(b.u, b.v, msg.phi, b.f === 1);
            if (b.id === meRef.current?.seatId) {
              myPos.current.x = w.x;
              myPos.current.z = w.z;
              continue;
            }
            remotePlayers.move(b.id, w.x, w.z, w.y, b.h, b.m === 2 ? 'run' : b.m === 1 ? 'walk' : 'idle', at);
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
          seesawState.clear();
          // 무대가 걷혔다 — 원판(0.75m)·발판(0.5m) 위에 있던 남의 몸을 바닥에 내려놓는다. 안 그러면 다음 샘플이 올 때까지
          // 허공에 서 있다 (remotePlayers.settle 머리말, 2026-09-05 사용자)
          remotePlayers.settle(now());
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
        // 정지선은 레일 타임라인이, 회전 원판 · 무게 중심 다리는 서버 스냅샷이 그린다 — 두 출처로 그리면 몸이 두 자리를 오간다
        if (testRef.current?.game === 'stopline' || testRef.current?.game === 'disc' || testRef.current?.game === 'seesaw') return;
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
   * 서버로 가는 것은 방송이 걷힐 때의 「끝났다」 한 마디뿐이다 (onPrologueShowing) — 그때까지 대역과
   * AI 참가자는 말하지 않는다 (2026-09-05 사용자: 「프롤로그가 끝나기 전까지는 AI 참가자가 대화 못 치게」).
   * 줄을 한꺼번에 건네면 상자가 제 박자(타자 · 머무름)로 차례로 찍는다 — 클릭하면 넘어간다. 로비로 돌아오면 비운다.
   */
  const [prologue, setPrologue] = useState<ChatLine[]>([]);
  const prologuePlayed = useRef<number | null>(null);
  /**
   * 지금 그 줄을 읽고 있나 — 상자에 건네면 **다 읽을 때까지 상자가 붙잡는다** (DialogueBox 의 speaking).
   * 박자를 여기서 세지 않는 이유가 이것이다: 상자가 이미 줄을 넘기는 주인이라, 두 곳에서 세면 어긋난다.
   */
  const [prologueSpeaking, setPrologueSpeaking] = useState(false);
  /**
   * 방송(프롤로그 대화창)이 화면에 서 있는가 — 서 있는 동안 채팅 판을 내린다 (2026-09-05 사용자:
   * "방송할때는 채팅창 안보이게 · 방송 다 끝난다음에 채팅창 보이게"). /arena 의 commsHushed 와 같은 갈림이다.
   * 줄을 건네는 순간 미리 세운다: 상자의 onShowing 은 첫 줄이 뜬 **다음**에야 와서, 그 한 박자에
   * 판이 섰다 내려가면 깜빡인다. 내리는 쪽은 상자가 말한다 — 마지막 줄이 여운(LINGER_MS)까지
   * 지나 사라질 때 onShowing(false) 로 온다. 그래야 자막이 남아 있는 동안 판이 도로 서지 않는다.
   */
  const [prologueUp, setPrologueUp] = useState(false);
  /**
   * 방송이 한 번 섰다가 사라진 것을 봤나 — 그때 서버에 「끝났다」를 올린다 (game_prologue_done).
   *
   * 상자는 마운트 때 한 번 onShowing(false) 로 「안 서 있다」를 알린다. 그것까지 끝으로 치면 판이
   * 열리기도 전에 대역들이 말문을 연다 — **선 것을 본 뒤의 내려감**만 끝이다. 두 번 올려도 서버는
   * 같은 좌석으로 한 번만 세지만(prologueSeen), 안 보낸 것과 두 번 보낸 것은 뜻이 다르니 여기서 잠근다.
   */
  const prologueReported = useRef(false);
  /** 소리가 스피커에 닿기까지의 늦음(ms) — 자막을 그만큼 늦게 연다 (prologueVoice 의 prologueLagMs) */
  const [prologueLag, setPrologueLag] = useState(0);
  const startedAt = wire?.startedAt ?? null;
  /**
   * **서버가 판을 붙잡고 있는가** — 대본을 트는 조건은 이것 하나다 (GameStateWire.prologue).
   *
   * 여기를 「첫 토론이고 시험이 없으면」으로 두면 화면이 서버와 어긋난다: 방송이 끝난 뒤
   * 새로고침하면 대본을 처음부터 다시 트는데 서버의 40초는 이미 돌고 있고, 워커가 되살린
   * 판도 첫 토론으로 보여 같은 일이 난다. 둘 다 방송이 대화와 겹치는 자리다
   * (2026-09-05 사용자: 「지금 프롤로그를 껴서 겹치거든」).
   */
  const prologueDue = wire?.prologue ?? false;
  useEffect(() => {
    if (phase === 'lobby') {
      setPrologue([]);
      setPrologueUp(false);
      return;
    }
    if (!prologueDue || startedAt === null) return;
    if (prologuePlayed.current === startedAt) return;
    prologuePlayed.current = startedAt;
    /*
     * 소리는 미리 받아 둔다 — 합성 왕복이 300~800ms 라, 줄이 뜬 뒤에 받기 시작하면 첫 줄만
     * 자막이 먼저 뜨고 소리가 뒤늦게 붙는다 (prologueVoice 머리말).
     */
    /*
     * 배역(몸)을 먼저 적는다 — 목소리가 얼굴(몸)의 성별을 따르기 때문이다 (prologueVoice 의 voicesForCast).
     * 아래 prologueLines 와 같은 씨앗이라 얼굴 · 목소리 · 여자 목소리 섞기까지 네 화면이 같은 것을 본다.
     */
    resetPrologueVoice(castSubjects(seatsRef.current, startedAt), startedAt);
    prefetchPrologue(PROLOGUE);
    /*
     * 소리가 스피커에 닿기까지의 늦음 — 자막을 그만큼 늦게 연다 (DialogueBox 의 voiceLagMs).
     * 판이 열릴 때 한 번 잰다: 장치가 판 도중에 바뀌는 일은 드물고, 줄마다 다시 재면 같은
     * 대본 안에서 자막이 들쭉날쭉해진다.
     */
    setPrologueLag(prologueLagMs());
    prologueReported.current = false;
    setPrologueUp(true);
    setPrologue(prologueLines(seatsRef.current, startedAt));
  }, [phase, prologueDue, startedAt]);

  /**
   * 상자가 서고 사라지는 것 — 채팅 판을 올리고 내리는 갈림이자(prologueUp), **서버에 알리는 방송의 끝**이다.
   *
   * 대본은 화면에서만 나지만 「끝났다」 한 마디는 서버에 간다 (game-protocol 의 game_prologue_done):
   * 그때까지 대역과 AI 참가자는 말하지 않고, 첫 토론의 40초도 그때부터 센다 (runtime 의 prologueHold).
   * 대본을 아예 안 받은 화면(판 도중에 들어온 사람)은 알리지 않는다 — 기다리는 쪽도 그 사람은 안 센다.
   */
  const onPrologueShowing = useCallback((showing: boolean) => {
    setPrologueUp(showing);
    if (showing || prologuePlayed.current === null || prologueReported.current) return;
    prologueReported.current = true;
    connRef.current?.game({ t: 'game_prologue_done' });
  }, []);

  /**
   * 상자가 한 줄을 띄웠다 — 그 줄을 읽는다.
   *
   * 상자가 넘기는 주인이고 여기는 소리만 얹는다 — 읽는 동안 speaking 을 세워 두면 상자가 기다린다.
   */
  const onPrologueLine = useCallback((key: string) => {
    const line = prologueLineOf(key);
    if (!line) return;
    setPrologueSpeaking(true);
    void speakPrologueLine(line).finally(() => setPrologueSpeaking(false));
  }, []);

  /**
   * 그 줄의 소리가 몇 ms 인가 — 상자가 **타자 속도를 여기 맞춘다** (DialogueBox 의 voiceMsOf).
   * 미리 받아 둔 것만 안다: 아직이면 null 이고, 그 줄은 글자 기준으로 찍힌다.
   */
  const prologueVoiceMs = useCallback((key: string) => {
    const line = prologueLineOf(key);
    return line ? prologueClipMs(line) : null;
  }, []);

  // 화면을 떠나는데 통제실이 계속 말하고 있으면 안 된다
  useEffect(() => () => stopPrologue(), []);

  /**
   * 내가 격리됐다 — 처형자가 겨누고 있고 몸은 곧 넘어간다 (scene/Downed). 그 순간부터 **한 발짝도 안 움직인다**:
   * 서버는 이미 내 이동을 안 받고(runtime 의 onMove), 화면에서만 걷는 시체가 남으면 총알이 빈자리를 쏜다.
   */
  const iAmOut = !!mySeat?.isolated;
  /*
   * 배역 카드는 통보 국면(briefing)에만 선다 — 국면이 지나면 내린다.
   *
   * 카드가 **뜰 수 없었을 때**가 갇히던 자리다: 좌석을 못 받은 사람은 me 가 없어 카드가 아예 안
   * 그려지는데(아래 렌더의 me && role !== 'ai'), showRole 은 켜진 채로 남았다. 그 값이 modalUp →
   * paused 로 이어져 판이 끝날 때까지 몸도 시야도 얼어 있었다 — 화면엔 아무 판도 없이, 이유도 없이
   * (2026-09-05 사용자: "움직여지는 사람이 있고 안움직여지는 방이 있어").
   */
  useEffect(() => {
    if (phase !== 'briefing') setShowRole(false);
  }, [phase]);
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
  /** 낙하 생존 — Space. 몸의 높이는 서버가 적분한다 (FreeRig sendJump) */
  const onJump = useCallback(() => conn.sendJump(), [conn]);
  const onSend = useCallback((text: string) => conn.sendChat(text), [conn]);
  const onCardPick = useCallback((index: number) => conn.sendCardPick(index), [conn]);
  const onCardUse = useCallback((item: CardItem, target?: string) => conn.sendCardUse(item, target), [conn]);
  /* 뒤집은 카드는 3.5초 보여 주고 도크로 들어간다 */
  useEffect(() => {
    if (!cardReveal) return;
    const t = window.setTimeout(() => dispatch(gameActions.clearCardReveal()), 3_500);
    return () => window.clearTimeout(t);
  }, [cardReveal, dispatch]);
  /* 카드 알림은 6초 뒤 스스로 진다 — 로그에는 남아 있다 */
  useEffect(() => {
    if (!cardNote) return;
    const t = window.setTimeout(() => dispatch(gameActions.clearCardNote()), 6_000);
    return () => window.clearTimeout(t);
  }, [cardNote, dispatch]);
  const onStart = useCallback(
    (fillTo: number) => {
      dispatch(gameActions.clearReject());
      conn.game({ t: 'game_start', fillTo });
    },
    [conn, dispatch],
  );

  /*
   * 소집 대기 없이 연다 (AUTO_SEATS 머리말) — 다만 **일행이 다 붙은 뒤에**. 서버가 방장이라 한 사람
   * (wire.hostId)만 보낸다: 둘이 같이 들어와도 판은 하나만 열리고, 그때 방에 있는 사람은 전원 좌석을 받는다
   * (runtime.start 의 roster).
   *
   * 「다 붙은 뒤에」가 이 효과의 전부다 (2026-09-05 사용자: "다 들어오면 배역 통보를 하게 하면 되는거아니야?").
   * 예전엔 첫 사람이 붙는 그 순간 열었다 — 대기방의 전원이 같은 순간에 넘어와도 소켓은 한 사람씩 붙으므로,
   * 1초 늦은 사람은 시작 명부에 없어 좌석을 못 받았다. 늦은 사람을 뒤에서 끼워 넣는 길(worker 의 rebind)도
   * 그대로 두지만, 애초에 **기다렸다 열면 그 경주가 없다.** 기다리는 수는 대기방이 실어 보낸 party 다.
   *
   * 안 오는 사람이 하나 있다고 판이 영영 안 열리면 안 된다 — 첫 사람이 붙은 뒤 PARTY_WAIT_MS 가 지나면
   * 있는 사람끼리 연다 (그 빈자리는 대역이 앉는다, §9). 기다리는 동안 화면은 몇 명이 왔는지 말해 준다(hud).
   *
   * 로비에 들어설 때마다 **한 번**이다: 거절되면(reject) 소집 대기 판이 그대로 서고, 판이 끝나 로비로
   * 돌아오면(GAME_ENDED_MS 뒤) 다시 한 번 연다 — 다만 판이 끝나면 다들 방을 나가므로(onLeave) 보통은 그 전에 떠나 있다.
   */
  const keepLobby = params.get('lobby') !== null;
  const hostId = wire?.hostId ?? null;
  const autoSent = useRef(false);
  /** 일행을 그만 기다리고 열 시각 — 로비에 처음 선 순간부터 센다 */
  const waitUntil = useRef<number | null>(null);
  const humansOnline = wire?.humansOnline ?? 0;
  /** 아직 안 온 사람이 있어 기다리는 중인가 — 발치 줄이 이 값을 읽는다 */
  const waitingParty = phase === 'lobby' && !keepLobby && !reject && humansOnline > 0 && humansOnline < party;
  useEffect(() => {
    if (phase !== 'lobby') {
      autoSent.current = false;
      waitUntil.current = null;
      return;
    }
    if (keepLobby || status !== 'connected' || !selfId || hostId !== selfId || autoSent.current) return;
    const open = () => {
      autoSent.current = true;
      onStart(Math.max(AUTO_SEATS - 1, party));
    };
    if (waitUntil.current === null) waitUntil.current = Date.now() + PARTY_WAIT_MS;
    const left = waitUntil.current - Date.now();
    if (humansOnline >= party || left <= 0) return open();
    // 아직 덜 왔다 — 남은 시간만큼만 기다린다. 그 사이 누가 더 붙으면 이 효과가 다시 돌며 위에서 걸린다
    const t = setTimeout(open, left);
    return () => clearTimeout(t);
  }, [phase, status, selfId, hostId, keepLobby, party, humansOnline, onStart]);
  /*
   * 판이 끝나면 **방을 나간다** (2026-09-05 사용자: "게임 승리하거나 패배하면 방 나가게 해줘"). 끝 화면이
   * END_LEAVE_MS 서고 나면 스스로 나가고, 「방 나가기」 단추는 그걸 앞당긴다. 예전의 「다시 — 새 판」(방장이 그
   * 자리에서 새 판을 청하던 것)은 걷었다 — 판이 끝난 방에 남아 다음 판을 기다리는 길은 이제 없다. 돌아가는 곳은
   * 대기방에서 왔으면 방 목록(/lobby), 이야기(/interrogation?from=central)로 왔으면 메인(/main)이다.
   * 서버는 GAME_ENDED_MS 뒤 스스로 로비로 접는다 (runtime 의 resetToLobby) — 나간 뒤의 일이라 여기선 안 본다.
   */
  const onLeave = useCallback(() => {
    conn.close();
    navigate(params.get('from') === 'central' ? '/main' : '/lobby');
  }, [conn, navigate, params]);
  const endScreenUp = phase === 'ended' && !!outcome && dying.size === 0;
  const leaveAt = endScreenUp && endedAt !== null ? endedAt + END_LEAVE_MS : null;
  useEffect(() => {
    if (leaveAt === null) return;
    const t = window.setTimeout(onLeave, Math.max(0, leaveAt - Date.now()));
    return () => window.clearTimeout(t);
  }, [leaveAt, onLeave]);

  /* ─────────────────────────────── 피격 번쩍임 ─────────────────────────────── */
  const [flashKey, setFlashKey] = useState(0);
  const hitsSeen = useRef(0);
  useEffect(() => {
    if (myHits > hitsSeen.current) setFlashKey((k) => k + 1);
    hitsSeen.current = myHits;
  }, [myHits]);
  /*
   * 처형 — **내가 맞을 때마다** 같은 붉은 판이 한 번 번쩍인다 (낙하 생존의 피격과 같은 .ig-hitflash).
   * 3인칭이라 총알이 내 몸에 박히는 것은 뒤에서 보이는데, 그것만으로는 「저 몸이 맞았다」에 그친다 —
   * 화면이 같이 붉어져야 맞은 것이 나다.
   */
  useEffect(() => {
    let seen = -Infinity;
    return executioner.subscribe(() => {
      const e = executioner.get();
      if (e.phase !== 'fire' || e.targetId !== meRef.current?.seatId || e.shotAt === seen) return;
      seen = e.shotAt;
      setFlashKey((k) => k + 1);
    });
  }, []);

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
  /*
   * 발치 줄 — 시험 중에는 **내 수치만** 센다 (2026-09-05 사용자: "정말 필요한 정보만 플레이어가 보기
   * 쉽게"). 목표와 조작키는 위의 시험 안내판(TestOrder)이 이미 말했다 — 같은 문장을 아래에 또 늘어놓던
   * 것을 걷었고, 원판의 rad/s·회전 방향처럼 눈으로 이미 보이는 값도 뺐다 (discOmega 는 이제 여기 안 선다).
   */
  const hud =
    // 좌석을 못 받은 사람 — 판이 열린 뒤에 왔다 (worker 의 rebind). 왜 아무것도 안 되는지 한 줄로는 말해 준다
    status === 'connected' && inGame && !mySeatId
      ? '이 판엔 자리가 없다 — 구경 중. 다음 판은 처음부터 앉는다'
      : status === 'connecting'
        ? '연결하는 중…'
        : status === 'error'
          ? `연결 실패: ${errorText} — 워커(npm run worker:dev)가 떠 있어야 한다`
          : phase === 'test' && test
            ? test.game === 'stopline'
              ? `시행 ${myAttempts} / 3`
              : test.game === 'fall'
                ? `피격 ${myHits}`
                : test.game === 'platform'
                  ? myLand.finished
                    ? `완주 — 도착 발판에서 대기 · 착지 ${myLand.landings} · 정중앙 ${myLand.centers}`
                    : `착지 ${myLand.landings} · 정중앙 ${myLand.centers} · 실패 ${myLand.misses}`
                  : test.game === 'disc' || test.game === 'seesaw'
                    ? `낙하 ${myFalls}회`
                    : `주움 ${myPicks}`
            : phase === 'discussion'
              ? mySeat
                ? `WASD 이동 · Enter — ${withRo(mySeat.name)} 말하기 · 관리 AI 가 그 말을 읽는다`
                : 'WASD 이동 · Enter 로 말하기 — 관리 AI 가 그 말을 읽는다'
              : waitingParty
                ? `일행을 기다리는 중 — ${humansOnline} / ${party} 도착. 다 오면 배역이 통보된다`
                : phase === 'lobby' && !keepLobby && !reject
                  ? '판을 여는 중 — 좌석을 섞고 대역이 앉는다…'
                  : '';

  return (
    <div ref={rootRef} className="ig-root" onClick={lock}>
      {/* 프롤로그 대화창 — 화면 아래 가운데, 채팅 판과 별개 (prologue.ts). 줄이 다 지나면 상자가 스스로 사라진다.
          speaking · onLine 을 준다 = **소리는 이쪽이 낸다** (DialogueBox 의 speaking 머리말). 상자는 줄을
          넘기는 주인이고 여기는 그 줄을 읽고 「아직 읽는 중」이라고만 알린다 — 그래야 한 줄이 끝나야 다음 줄이 뜬다.
          skin="terminal" = 옆 「구역 통신」판과 같은 검은 모따기 판·호박 선·모노 라벨 (2026-09-05 사용자: /world 의 청록 프레임은 이 홀과 안 어울린다) */}
      <DialogueBox
        messages={prologue}
        selfId={null}
        touch={false}
        speaking={prologueSpeaking}
        onShowing={onPrologueShowing}
        onLine={onPrologueLine}
        voiceMsOf={prologueVoiceMs}
        voiceLagMs={prologueLag}
        skin="terminal"
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
        paused={modalUp || iAmOut}
        onAccel={onAccel}
        onBrake={onBrake}
        onPick={onPick}
        onWalk={onWalk}
        onJump={onJump}
        sendMove={sendMove}
      />

      {/* 색 사냥 — 방이 통째로 조명색에 물든다(multiply). 흰 조명이면 항등. HUD(.ig-hud)는 이 뒤에 그려져 안 물든다 */}
      {phase === 'test' && test?.game === 'colorhunt' && hunt ? <div aria-hidden className="ig-huntlight" style={{ background: softLight(hunt.light) }} /> : null}

      {flashKey > 0 ? <div key={flashKey} className="ig-hitflash" /> : null}

      <div className="ig-hud" onClick={(e) => e.stopPropagation()}>
        <div className="ig-corner">
          <BackToRoot />
        </div>
        {/*
          * 위 가운데 기둥 — 시계 · 시험 안내판 · (색 사냥의) 목표색이 **한 기둥(.ig-testcol)으로 쌓인다**.
          * 저마다 top 값으로 서던 것을 걷었다 — 하나가 커지면 아래가 겹치던 자리다 (예전 .ig-clock 머리말의 50→104→142).
          * 시계는 미니 게임 30초와 **마지막 대화 40초**만 큰 숫자로 — 나머지 토론은 시계 없이 간다 (사용자, BigClock 머리말).
          * 안내판은 서버 지시문 전체가 아니라 요약이다 (TestOrder 머리말). key=startAt: 시험마다 흐려짐이 처음부터 돈다.
          */}
        {phase === 'test' ? (
          <div key={test?.startAt ?? 'test'} className="ig-testcol">
            {wire ? <BigClock endsAt={wire.phaseEndsAt} maxSeconds={(test?.durationMs ?? GAME_TEST_MS) / 1000} /> : null}
            {test ? <TestOrder game={test.game} round={test.round} fallback={wire?.currentTest?.instruction ?? ''} /> : null}
            {/* 색 사냥 — 목표색. 스와치는 **기준광 원색**(조명 밖 UI): 맵 안 견본판(조명색)과의 대비가 「조명이 색을 바꿨다」를 가르친다 */}
            {test?.game === 'colorhunt' && hunt ? (
              <div className="ig-hunttarget" aria-live="polite">
                <span aria-hidden className="swatch" style={{ background: hunt.targetHex }} />
                목표 「{hunt.target}」
              </div>
            ) : null}
          </div>
        ) : phase === 'discussion' && wire && wire.testsDone >= GAME_TEST_COUNT ? (
          /*
           * 마지막 대화 — 토론 중 **여기만** 큰 시계가 선다 (2026-09-05 사용자: "마지막 대화 때에는 남은 시간을
           * 보여줘. 위쪽 가운데에 크게" · "의심도 100인 대상이 없으면 갑자기 끝나는 것처럼 느껴지니까").
           * 이 40초가 다 가면 서버가 그 자리에서 판을 닫는다(runtime 의 advance → hardCap) — 앞의 토론들은
           * 시험이 이어받아 끝나는 느낌이 없지만, 마지막은 예고 없이 닫히면 끝이 아니라 고장으로 읽힌다.
           * 시계 밑 한 줄이 그 예고다.
           */
          <div className="ig-testcol">
            <BigClock endsAt={wire.phaseEndsAt} maxSeconds={GAME_DISCUSSION_MS / 1000} />
            <div className="ig-lastcall">마지막 대화 — 시간이 다 되면 판정</div>
          </div>
        ) : null}

        {/*
          * 좌석 카드(SUBJECTS)는 없다 — 눈금은 **머리 위 막대**가 말한다 (scene/SuspicionBar, 2026-09-05 사용자:
          * "카드는 안보여도돼. 머리위에 의심도만 보이면 돼"). 단추로 지목하는 짓도 같이 사라졌다:
          * 눈금을 움직이는 것은 **관리 AI 가 사람들의 말을 읽는 것**이다 (worker/src/game/agents.ts 의 readTalk).
          */}
        {/*
         * 미니 게임이 도는 동안은 판이 **통째로 내려간다** (2026-09-04 사용자: "미니 게임할때는
         * 채팅창 안보이게 · 끝나면 다시 채팅할수있게"). 흐리게만 두던 것으로는 모자랐다 —
         * 시행은 몸으로 하는 판이라 손이 WASD·E 위에 있는데, 판이 서 있으면 Enter 한 번에 그 손이
         * 입력창으로 끌려간다. 쌓인 말은 안 잃는다: 로그는 gameSlice 에 그대로 남아 있어서
         * 시행이 끝나면 하던 대화가 그 자리에서 다시 뜬다.
         *
         * 프롤로그 방송이 서 있는 동안(prologueUp)도 같은 이유로 내린다 (2026-09-05 사용자:
         * "방송할때는 채팅창 안보이게 · 방송 다 끝난다음에 채팅창 보이게") — 화면 아래에 방송
         * 자막과 채팅 판이 겹쳐 서고, Enter 가 손을 입력창으로 끌고 간다. 방송이 다 지나가면
         * (상자가 스스로 사라지면) 판이 그 자리에 다시 선다.
         */}
        {phase !== 'test' && !prologueUp ? (
          <Chat
            feed={feed}
            mySeatId={mySeatId}
            myName={mySeat?.name ?? null}
            markId={markId}
            disabled={status !== 'connected' || phase === 'result' || phase === 'ended' || (inGame && !mySeatId)}
            talk={inGame ? myTalk : null}
            onSend={onSend}
            onComposing={setComposing}
          />
        ) : null}

        {/* 내 의심도 — 발치 줄 위의 고정 계기 (hud/SelfSuspicion 머리말). 좌석이 있을 때만, 끝 화면에서는 걷는다.
            프롤로그 대화창이 서 있는 동안도 걷는다 — 같은 자리(화면 아래 가운데)에 상자가 서서 계기와 안내줄이 상자 위로
            비쳤다 (2026-09-05 사용자: "시나리오 나올 때는 WASD · 의심도 텍스트 안 나오게"). 대본이 흐르는 동안은
            움직이지도 말하지도 못하니 둘 다 아직 할 말이 없다 */}
        {inGame && mySeatId && phase !== 'ended' && !prologueUp ? <SelfSuspicion getValue={() => getSuspicion(mySeatId)} /> : null}
        {/* 시험 중의 발치 줄은 수치판(.stat)이다 — 안내 문장일 때보다 크고 밝게, 숫자는 자리를 안 떤다 */}
        {hud && !prologueUp ? (
          <p className={`ig-foot${phase === 'test' ? ' stat' : ''}`}>
            {hud}
            {!locked && status === 'connected' && !modalUp ? ' · 화면을 클릭하면 마우스로 둘러본다' : ''}
          </p>
        ) : null}

        {/* 소집 대기 판은 ?lobby 로 들어왔거나 자동 시작이 거절됐을 때만 선다 — 나머지는 판이 열리는 한순간뿐이다 */}
        {wire && phase === 'lobby' && (keepLobby || reject) ? <LobbyPanel wire={wire} players={players} selfId={selfId} myBody={myBody} reject={reject} onStart={onStart} /> : null}
        {reject && phase !== 'lobby' ? <p className="ig-banner alarm">{reject}</p> : null}
        {/*
          * 카드 (hud/Cards 머리말). 고르는 판은 **토론이 열린 뒤** 선다 — 결과 모달(7초)과 같은 자리에 겹쳐 서지 않도록.
          * 서버의 고를 시간(CARD.offerMs 45초)은 결과가 난 순간부터라 토론에 들어와도 넉넉히 남는다.
          * 쥔 카드는 오른쪽 아래에 늘 보이고, 토론 중에만 눌린다 (runtime 의 cardUse 가 토론 밖은 거절한다).
          */}
        {cardReveal && phase !== 'test' && !prologueUp ? (
          <CardReveal key={cardReveal.ts} item={cardReveal.item} />
        ) : cards.offer && phase === 'discussion' && !prologueUp ? (
          <CardOffer count={cards.offer} onPick={onCardPick} />
        ) : null}
        {inGame && mySeatId && phase !== 'ended' && phase !== 'test' && !prologueUp ? (
          <CardDock items={cards.items} seats={seats} mySeatId={mySeatId} canUse={phase === 'discussion' && !wire?.compelled} onUse={onCardUse} />
        ) : null}
        {wire?.compelled && phase === 'discussion' ? <CompelBar compelled={wire.compelled} mySeatId={mySeatId} nameOf={nameOf} /> : null}
        {cardNote && phase !== 'test' ? (
          <p key={cardNote.ts} className={`ig-cardnote ${cardNote.tone}`}>
            {cardNote.text}
          </p>
        ) : null}
        {phase === 'result' && latestResult ? (
          <ResultModal
            result={latestResult}
            nameOf={nameOf}
            mySeatId={mySeatId}
            endsAt={wire?.phaseEndsAt ?? null}
            gained={talkGained?.game === latestResult.game ? talkGained.gained : undefined}
          />
        ) : null}
        {/*
          * 끝 화면은 **처형이 다 끝나야 선다** (2026-09-05 사용자: "로봇 총쏨 → 나 맞고 쓰러짐 → 패배 보여줌
          * 이 순서로"). 서버는 격리와 판의 끝을 같은 순간에 보내므로(worker 의 checkIsolation) 여태는
          * 총성 위로 이 판이 그대로 덮였다 — 관리 AI 가 겨누는 것도, 내가 넘어가는 것도 아무도 못 봤다.
          * dying 은 격리된 몸이 홀에 남아 있는 동안만 차 있다 (EXECUTION_MS — 조준 · 세 발 · 넘어짐 · 한 박자).
          */}
        {endScreenUp && outcome ? (
          <EndScreen outcome={outcome} roles={roles} seats={seats} mySeatId={mySeatId} myRole={me?.role ?? null} endsAt={leaveAt} onLeave={onLeave} />
        ) : null}
      </div>

      {showRole && me && me.role !== 'ai' ? (
        <RoleBriefing role={me.role} body={myBody} aiName={me.aiId ? nameOf(me.aiId) : null} onDone={() => setShowRole(false)} />
      ) : null}
    </div>
  );
}

/**
 * 3D 월드 화면 — 방 번호를 치면 창고 라운지에서 같이 걸어다닌다.
 * humanish 의 app/world/page.tsx 를 "입장 → 걷기 → 말풍선" 만 남기고 줄인 것.
 *
 * 흐름: 방 번호 + 닉네임 → 워커(Durable Object)에 WebSocket → welcome 이 오면 씬을 띄운다.
 *
 * 조작: WASD/화살표 이동 · 마우스 시야 · Space 점프 · 1 화남 · 2 동의 · Enter 말하기 · ESC 잠깐 멈춤(화면 클릭으로 복귀).
 * 폰: 왼쪽 조이스틱 · 오른쪽 드래그 시야 · ⤒ 점프 · 💬 말하기.
 *
 * ★ 데스크톱은 「마우스가 잠기면 논다 / 풀리면 멈춘다」 위에 서 있다. iOS 에는 포인터 잠금이
 *   없으므로 터치에서는 "판이 안 떠 있으면 곧 걷는 중"이다 (playing).
 * ★ 잠금은 **「입장」 클릭 그 순간**에 잡는다 — 캔버스가 아니라 폼과 월드를 다 감싸는 뿌리 div 에.
 *   브라우저는 사용자 제스처(≈5초) 안에서만 잠금을 주는데, 첫 방문은 청크·에셋 로딩이 그보다 길어
 *   캔버스가 뜬 뒤엔 이미 늦다. 뿌리 div 는 폼→월드로 바뀌어도 같은 DOM 노드라(두 갈래 다 같은 자리의 div) 잠금이 살아남고,
 *   씬이 뜨면 이미 잠긴 채라 클릭 없이 곧장 걷고 챕터가 시작된다.
 */

import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BackToRoot } from '@/shared/BackToRoot';
import { NotePad } from '@/shared/NotePad';
import { saveGuestNick } from '@/shared/guest';
import { broadcastAnnounce } from '@/shared/broadcast';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  MAPS,
  NICK_MAX_LEN,
  ROOM_CODE_RE,
  ROOM_MAX_PLAYERS,
  SpeakButton,
  TouchControls,
  WorldConnection,
  worldWsBase,
  WorldScene,
  getTouchMode,
  type MapDef,
  type MapId,
  preloadAsset,
  remotePlayers,
  spawnFor,
  subscribeTouchMode,
  watchPointerKind,
  type WorldEvents,
} from '@/world';
import { backstepJudge } from './backstep';
import { Bgm } from './Bgm';
import { useBlackout } from './blackout';
import { CENTRAL_ARMED_UNITS, CENTRAL_UNITS } from './CentralChapterScene';

/** 경비 대사의 초상 — 중앙 시설의 총 든 경비(CENTRAL_ARMED_UNITS)는 enforcer, 나머지는 기존 로봇 */
function guardPortrait(nick: string): ChatLine['portrait'] {
  const i = CENTRAL_UNITS.indexOf(nick);
  return i >= 0 && CENTRAL_ARMED_UNITS.includes(i) ? 'enforcer' : 'robot';
}

/**
 * 의심도 100 의 사수 — 중앙 시설이면 **순찰 중인 총 든 경비 중 나와 가장 가까운 놈**이 맡는다 (2026-08-30 사용자: 새 로봇이 나오지 말 것).
 * 챕터 2 검문 중이면 검문 경비(0번)는 빼고 고른다 — 검문 걸음과 겹치면 둘 다 망가진다. 후보가 없으면 undefined → 출입구에서 새 몸
 */
function nearestArmedUnit(): { index: number; name: string } | undefined {
  const c2 = chapter2.get();
  const busy = c2.phase !== 'idle' && c2.phase !== 'done' ? 0 : -1;
  const me = playerAt();
  let best: { index: number; d: number } | null = null;
  for (const index of CENTRAL_ARMED_UNITS) {
    if (index === busy) continue;
    const b = bystanders.at(`agent:${index}`);
    if (!b) continue;
    const d = Math.hypot(b.x - me.x, b.z - me.z);
    if (!best || d < best.d) best = { index, d };
  }
  return best ? { index: best.index, name: CENTRAL_UNITS[best.index] ?? `UNIT-${best.index}` } : undefined;
}
import { Chapter1Scene } from './Chapter1Scene';
import { ChoiceHud } from './ChoiceHud';
import { NoticeHud } from './NoticeHud';
import { ObjectiveHud } from './ObjectiveHud';
import { ProbeHud } from './ProbeHud';
import { SyncHud } from './SyncHud';
import { SyncTremor } from './SyncTremor';
import { chapter1 } from './chapter1';
import { chapter2 } from './chapter2';
import { RECHECK_SHOOTER, chapter3 } from './chapter3';
import { interrogation } from './interrogation';
import { DialogueBox } from './DialogueBox';
import { dossier } from './dossier';
import { Enforcer } from './Enforcer';
import { DamageHud } from './DamageHud';
import { DefeatHud } from './DefeatHud';
import { Downed } from './Downed';
import { EnforcerHud } from './EnforcerHud';
import { HealthHud } from './HealthHud';
import { enforcer } from './enforcerStore';
import { ScanHud } from './ScanHud';
import { scan } from './scan';
import { SelfChatLog } from './SelfChatLog';
import { StatusPanel } from './StatusPanel';
import { worldActions, worldSelectors, type ChatLine } from './worldSlice';
import { bystanders } from '@/world/mp/bystanders';
import { playerAt, resetSensor } from '@/world/mp/sensor';
import { comms } from '@/world/mp/comms';
import { doors } from '@/world/mp/doors';
import { identity } from '@/world/mp/identity';
import { THRESHOLD_LINES, judgeLine, suspicion, type Threshold } from '@/world/mp/suspicion';
import { health } from '@/world/mp/health';
import { sync } from '@/world/mp/sync';
import { DOWN_MARK, team } from '@/world/mp/team';

/** SYNC 글리치를 곁의 AI 가 봤을 때 그가 묻는 말 — 목소리도 이 상수에서 뽑는다 (tools/voice-cast.json sources.blocks) */
const GLITCH_SEEN = '방금 움직임은 무엇이지?';

const ERROR_TEXT: Record<string, string> = {
  version_mismatch: '클라이언트와 서버 버전이 다르다. 새로고침해 보라',
  room_full: `방이 가득 찼다 (최대 ${ROOM_MAX_PLAYERS}명)`,
  bad_request: '방 번호나 닉네임이 잘못됐다',
  // 대기방에서 내보내진 계정이 월드 문으로 돌아왔다 — 문은 하나다 (room-do.ts 의 밴 명부)
  banned: '이 방에서 내보내진 계정이다 — 방이 새로 서기 전에는 못 들어간다',
  connection_failed: '서버에 연결하지 못했다 — 워커(npm run worker:dev)가 떠 있나?',
};

/**
 * 화면 좌하단(7시 방향)으로 흐르는 대화 줄 수. humanish 와 같은 값 —
 * 여덟이 한 바퀴 도는 동안 앞사람 말이 안 밀려 나가는 최소치. 오래된 줄일수록 흐리다.
 */

let hasLockedOnce = false;

/**
 * 마우스를 잡는다 (el = 화면의 뿌리 div). 실패하면 잠시 뒤 다시 두드린다.
 * 크롬은 ESC 로 푼 잠금을 곧바로 다시 잡아주지 않는다(≈1.25초) — 튕길 때마다 간격을 두고 두 번 더 시도한다.
 * 클릭 제스처가 만료됐고 이 문서에서 잠금을 잡아 본 적도 없으면 거절이 뻔하므로 보내지 않는다.
 */
function requestLock(el: Element, tries = 3, delayMs = 1400): void {
  if (document.pointerLockElement === el) return;

  const activation = navigator.userActivation;
  if (activation && !activation.isActive && !hasLockedOnce) return;

  const onError = () => {
    document.removeEventListener('pointerlockchange', onSettled);
    if (tries > 1 && el.isConnected) window.setTimeout(() => requestLock(el, tries - 1, delayMs), delayMs);
  };
  const onSettled = () => {
    document.removeEventListener('pointerlockerror', onError);
    if (document.pointerLockElement) hasLockedOnce = true;
  };
  document.addEventListener('pointerlockerror', onError, { once: true });
  document.addEventListener('pointerlockchange', onSettled, { once: true });

  try {
    const p = el.requestPointerLock() as unknown;
    if (p instanceof Promise) p.catch(() => {});
  } catch {
    /* 이벤트 쪽에서 재시도한다 */
  }
}

/**
 * 수첩에 적히는 방 이름 (shared/NotePad).
 *
 * MAPS[map].title 을 그대로 쓰지 않는다 — 그건 루트 목록에 세우는 **라우트 이름**이라
 * (「3D 월드」·「창고 3D 맵」) 이야기 안에서 부르는 이름이 아니다. 수첩의 줄은 나중에 내가
 * 읽을 글이므로 그 방에 서 있던 사람이 쓰는 말이어야 한다.
 */
const NOTE_ROOM: Record<MapId, string> = {
  corridor: '복도',
  warehouse: '격납고',
  central: '중앙 시설',
  interrogation: '심문소',
  recheck: '재검실',
};

/** map: 배경 맵 (기본 복도). /warehouse 는 같은 화면에 map="warehouse" 다 (features/warehouse). children 은 씬에 얹는 것 (WorldScene children) */
export function WorldFeature({ map = 'corridor', children }: { map?: MapId; children?: ReactNode } = {}) {
  const mapDef: MapDef = MAPS[map];
  const dispatch = useAppDispatch();
  const quality = useAppSelector(worldSelectors.selectQuality);
  const status = useAppSelector(worldSelectors.selectStatus);
  const errorText = useAppSelector(worldSelectors.selectErrorText);
  const roomCode = useAppSelector(worldSelectors.selectRoomCode);
  const nickname = useAppSelector(worldSelectors.selectNickname);
  const self = useAppSelector(worldSelectors.selectSelf);
  const roster = useAppSelector(worldSelectors.selectRoster);
  const bubbleTick = useAppSelector(worldSelectors.selectBubbleTick);
  const messages = useAppSelector(worldSelectors.selectMessages);
  const selfId = useAppSelector(worldSelectors.selectSelfId);

  /** 잠금을 거는 대상 — 폼일 때도 월드일 때도 같은 DOM 노드다 (머리말 ★) */
  const rootRef = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState(false);
  /** 이 방에서 한 번이라도 잠금을 잡은 적이 있나 — 멈춤 중 대화 기록 표시와 안내 문구가 이걸 본다 */
  const [everLocked, setEverLocked] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  /**
   * 주소로 곧장 들어온 길인가 — 「게임 시작 테스트」와 무대 이동(복도 → 중앙 시설)이 이 길이다.
   * 그럴 땐 폼 대신 **검은 화면**을 들고 있다가 씬이 뜨면 밝아진다 (앞 무대의 암전이 그대로 이어지게).
   * 첫 렌더부터 알아야 폼이 한 프레임 스치지 않는다 — 그래서 주소를 여기서 직접 읽는다.
   */
  const [arriving, setArriving] = useState(() => {
    if (typeof window === 'undefined') return false;
    const sp = new URLSearchParams(window.location.search);
    return ROOM_CODE_RE.test((sp.get('code') ?? '').trim()) && (sp.get('nick') ?? '').trim() !== '';
  });
  /** 한 마디 하는 중인가. 잠금은 그대로 둔 채 입력줄에 포커스만 준다 */
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const lineRef = useRef<HTMLInputElement>(null);

  const touchMode = useSyncExternalStore(subscribeTouchMode, getTouchMode, () => false);
  useEffect(() => watchPointerKind(), []);

  // 잠금 상태의 단일 출처 — 브라우저 이벤트. 씬이 아직 없을 때(접속 중) 잡힌 잠금도 여기로 들어온다
  useEffect(() => {
    const sync = () => setLocked(document.pointerLockElement !== null && document.pointerLockElement === rootRef.current);
    sync();
    document.addEventListener('pointerlockchange', sync);
    return () => document.removeEventListener('pointerlockchange', sync);
  }, []);
  /*
   * 미리 받아 둔다 — **총 든 몸은 복도에서부터** (2026-09-01 사용자: "챕터 1 → 챕터 2 로 넘어갈 때 총 든 GLB 캐릭터가 안 보인다").
   * enforcer.glb(2.0MB)와 소총(2.3MB)은 중앙 시설에 들어서는 **그 순간에** 처음 요청됐다. 경비 여섯은 한 Suspense 안에
   * 같이 있어서(CentralChapterScene) 그 둘이 오는 동안 여섯 다 화면에 없다 — 문턱을 넘자마자 빈 홀을 보게 된다.
   * 복도에서 걷는 동안 받아 두면 넘어가는 순간 이미 캐시에 있다.
   */
  useEffect(() => {
    preloadAsset('robot');
    preloadAsset('enforcer');
    preloadAsset('enforcer_rifle');
  }, []);

  const connRef = useRef<WorldConnection | null>(null);
  if (connRef.current === null) connRef.current = new WorldConnection();
  const conn = connRef.current;

  /** WS 콜백 — 좌표는 remotePlayers(가변 Map)로, 멤버십·말풍선 신호만 Redux 로 */
  const events = useMemo<WorldEvents>(
    () => ({
      onWelcome: (selfId, players) => {
        remotePlayers.clear();
        const now = performance.now();
        for (const p of players) if (p.id !== selfId) remotePlayers.add(p, now);
        dispatch(worldActions.welcomed({ selfId, players }));
      },
      onJoined: (player) => {
        remotePlayers.add(player, performance.now());
        dispatch(worldActions.playerJoined(player));
      },
      onLeft: (id) => {
        remotePlayers.remove(id);
        dispatch(worldActions.playerLeft(id));
      },
      onMoved: (id, x, z, y, heading, anim) => remotePlayers.move(id, x, z, y, heading, anim, performance.now()),
      onChat: (id, nickname, text, ts) => {
        // 팀원이 쓰러졌다는 표식 — 대화창엔 안 띄우고 생존 명부에만 적는다 (mp/team.ts)
        if (text === DOWN_MARK) {
          team.down(id);
          return;
        }
        remotePlayers.bubble(id, text, performance.now());
        dispatch(worldActions.chatReceived({ id, nickname, text, ts }));
      },
      // 방송은 서버가 전원에게 같은 내용으로 되돌려준 것이다 — 여기서만 소리로 넘긴다.
      // 리더를 돌리는 클라도 로컬로 먼저 읽지 않는다 (그러면 사람마다 시작 시각이 갈린다).
      onBroadcast: (text, kind, ts) => dispatch(broadcastAnnounce({ text, kind, ts })),
      onError: (code) => dispatch(worldActions.setStatus({ status: 'error', errorText: ERROR_TEXT[code] ?? code })),
      onClose: () => dispatch(worldActions.setStatus({ status: 'error', errorText: '연결이 끊겼다' })),
    }),
    [dispatch],
  );

  /** 접속한다 — 이 화면의 폼으로 오든, 로비(/main)가 만든 주소로 오든 같은 길이다 */
  const connect = useCallback(
    (codeRaw: string, nickRaw: string) => {
      const code = codeRaw.trim();
      const nick = nickRaw.trim().slice(0, NICK_MAX_LEN);
      if (!ROOM_CODE_RE.test(code)) {
        dispatch(worldActions.setStatus({ status: 'error', errorText: '방 번호는 숫자 1~6자리' }));
        return;
      }
      if (!nick) {
        dispatch(worldActions.setStatus({ status: 'error', errorText: '닉네임을 입력하라' }));
        return;
      }
      saveGuestNick(nick); // 어느 문으로 들어와도 게스트 닉네임은 하나로 남는다 (로그인 없음)
      resetSensor(); // 새 방에선 의심도 0 부터
      /*
       * 이 몸의 식별번호·정비 구역은 **복도에 들어올 때만** 새로 뽑는다 — 복도→중앙 시설 이동도 같은 connect() 를 타기 때문에,
       * 여기서 무조건 뽑으면 복도에서 정비 명판을 읽어 둔 게 문턱을 넘는 순간 지워진다 (2026-08-30 확인).
       */
      if (map === 'corridor') identity.assign();
      comms.reset(); // 통신은 맑은 상태부터 — 무대별 값은 chapter1.enter 가 다시 잡는다
      scan.reset();
      chapter1.enter(map); // 복도면 처음부터, 중앙 시설이면 도착 단계부터 (모듈 상태라 맵을 옮겨도 이어진다)
      chapter2.enter(map); // 중앙 시설이 아니면 처음으로
      chapter3.enter(map); // 재검실이 아니면 처음으로
      sync.reset(); // 새 몸은 98 부터
      health.reset(); // 체력도 처음부터
      team.reset();
      conn.close();
      remotePlayers.clear();
      setSceneReady(false);
      setComposing(false);
      setEverLocked(false);
      dispatch(worldActions.left());
      dispatch(worldActions.setStatus({ status: 'connecting' }));
      conn.connect(worldWsBase(), code, nick, events);
      // 지금이 「입장」 클릭(또는 로비의 클릭) 제스처 안이다 — 씬을 기다리면 만료된다. 접속 중 커서가 사라지는 건 감수한다
      if (!touchMode && rootRef.current) requestLock(rootRef.current);
    },
    [conn, dispatch, events, map, touchMode],
  );

  const enter = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      connect(roomCode, nickname);
    },
    [connect, nickname, roomCode],
  );

  /**
   * 로비가 보낸 주소(/world?code=1234&nick=…)로 왔으면 폼 없이 바로 들어간다.
   * humanish 의 「친구가 보낸 /world?code=ABCD 링크」 패턴 (components/require-login.tsx 주석) —
   * 다만 여기는 로그인이 없어서 게스트 닉네임이 주소에 같이 실려 온다.
   * 딱 한 번만 시도한다 — 「나가기」 뒤에 주소가 남아 있어도 다시 끌려 들어가지 않게.
   * ★ 이 "한 번"은 마운트 한 번이다. 화면을 떠나는 정리(아래 소켓 닫기)에서 표식을 되돌려야 한다 —
   *   안 그러면 dev StrictMode 가 마운트→정리→마운트를 흉내낼 때 첫 소켓은 닫히고 두 번째 마운트는
   *   "이미 들어갔다"고 건너뛰어 「접속 중…」에 영영 멈춘다.
   */
  const [params] = useSearchParams();
  const autoEntered = useRef(false);
  useEffect(() => {
    if (autoEntered.current) return;
    autoEntered.current = true;
    const code = (params.get('code') ?? '').trim();
    const nick = (params.get('nick') ?? '').trim().slice(0, NICK_MAX_LEN);
    if (code) dispatch(worldActions.setRoomCode(code));
    if (nick) dispatch(worldActions.setNickname(nick));
    if (ROOM_CODE_RE.test(code) && nick) connect(code, nick);
  }, [params, dispatch, connect]);

  const leave = useCallback(() => {
    setArriving(false); // 나가면 검은 화면을 걷고 폼을 돌려준다
    if (document.pointerLockElement) document.exitPointerLock();
    conn.close();
    remotePlayers.clear();
    setSceneReady(false);
    setComposing(false);
    setEverLocked(false);
    dispatch(worldActions.left());
  }, [conn, dispatch]);

  // 화면을 떠나면 소켓도 닫는다. 자동 입장 표식도 같이 되돌린다 — 다시 마운트되면 주소로 다시 들어간다
  useEffect(() => () => {
    conn.close();
    remotePlayers.clear();
    autoEntered.current = false;
  }, [conn]);

  // 접속에 실패했으면 폼을 다시 만져야 한다 — 커서를 돌려준다
  useEffect(() => {
    if (status === 'error' && document.pointerLockElement) document.exitPointerLock();
  }, [status]);

  const live = status === 'live' && self !== null;
  /** 쓰러졌나 — 다리와 시야가 멈추고(paused) 카메라는 Downed 가 눕힌다. 패배 판은 DefeatHud */
  const dead = useSyncExternalStore(health.subscribe, () => health.get().dead, () => false);
  /**
   * 장이 닫히는 암전이 올랐나 (챕터 1·2·3 중 어느 것이든). 여기서 쓰는 곳은 배경음악 하나다 —
   * 화면이 어두워지는 동안 곡도 같이 재워, 라우트가 바뀌는 프레임에 소리가 잘리지 않게 한다.
   * 암전을 **그리는** 것은 NoticeHud 다 (거기는 챕터마다 길이가 달라 셋을 따로 본다).
   */
  const blackout = useBlackout();
  /** 코어 트리거 뒤(락다운·숨기기) — 배경음악이 바뀐다 (MapDef.lockdownBgm). 무대를 옮기면 chapter1.enter 가 되돌린다 */
  const lockdown = useSyncExternalStore(
    chapter1.subscribe,
    () => {
      const ph = chapter1.get().phase;
      return ph === 'lockdown' || ph === 'hide';
    },
    () => false,
  );
  const paused = dead; // 이 화면에는 걷기를 멈추는 판이 없다 — 쓰러졌을 때만 멈춘다
  // 쓰러지면 팀원들에게 알린다 — 채팅 표식 한 줄 (받는 쪽은 대화창에 안 띄운다, mp/team.ts)
  useEffect(() => {
    if (dead && live) conn.sendChat(DOWN_MARK);
  }, [dead, live, conn]);
  /** 지금 걷는 중인가 — 터치에는 잠금이 없으므로 판이 안 떠 있으면 곧 걷는 중 */
  const playing = live && (touchMode ? !paused : locked);

  useEffect(() => {
    if (locked) setEverLocked(true);
  }, [locked]);

  // 브라우저가 잠금을 풀었다(ESC) — 말하던 중이면 그 한 마디를 무른다. '풀렸다'는 변화라 직전 값과 비교한다
  const wasLocked = useRef(false);
  useEffect(() => {
    const justUnlocked = wasLocked.current && !locked;
    wasLocked.current = locked;
    if (!justUnlocked || !composing) return;
    setComposing(false);
    setDraft('');
  }, [locked, composing]);

  /**
   * **T 로 대사를 넘길 때** (대화창의 onSkip) — 상자가 지금 줄을 넘기고, 여기서 대본의 다음 줄을 당긴다.
   * 안 당기면 다음 줄은 제 시각에 매달려 있어 넘긴 만큼 그대로 정적이 된다.
   *
   * 세 대본이 이 화면 하나를 나눠 쓴다 (복도·중앙 시설·재검실). 지금 누구 차례인지는 대본이 안다 —
   * 앞당길 줄이 없는 대본은 아무것도 안 하고 false 를 주므로 차례로 물어보면 된다.
   */
  const skipLine = useCallback(() => {
    if (chapter1.skip()) return;
    if (chapter2.skip()) return;
    chapter3.skip();
  }, []);

  const resumeWalking = useCallback(() => {
    if (touchMode || !rootRef.current) return; // iOS 에는 포인터 잠금이 없다
    requestLock(rootRef.current);
  }, [touchMode]);

  // 씬이 뜨면 한 번 더 두드린다 — 「입장」에서 잡은 잠금이 로딩 중 ESC 등으로 풀렸을 때의 뒷길 (제스처가 없으면 조용히 건너뛴다)
  useEffect(() => {
    if (!live || !sceneReady) return;
    const id = requestAnimationFrame(() => resumeWalking());
    return () => cancelAnimationFrame(id);
  }, [live, sceneReady, resumeWalking]);

  // Enter 로 한 마디 한다. preventDefault 가 없으면 그 keydown 이 입력줄로 흘러간다
  useEffect(() => {
    if (!live || composing) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
      e.preventDefault();
      setComposing(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live, composing]);

  // iOS 는 사용자 제스처와 같은 작업 안에서 부른 focus() 만 소프트 키보드를 올린다 — layout 효과
  useLayoutEffect(() => {
    if (composing) lineRef.current?.focus();
  }, [composing]);

  const navigate = useNavigate();

  /** 아직 서 있는 팀원 수 — 명부(나 제외) 중 쓰러졌다는 표식을 안 보낸 사람. 0 이고 내가 쓰러졌으면 처음으로 (DefeatHud) */
  const teamVersion = useSyncExternalStore(team.subscribe, team.version, () => 0);
  const alive = useMemo(() => team.alive(roster.map((r) => r.id)), [roster, teamVersion]);
  /**
   * 처음부터 다시 시작 — 이야기·의심도·체력·팀 생존을 지우고 복도 처음으로. 복도면 같은 방에 다시 들어가고,
   * 다른 맵이면 복도(/world)로 길을 바꾼다 (자동 입장). 같은 방 번호라 남들과 계속 같이 논다
   */
  const restart = useCallback(() => {
    chapter1.reset();
    chapter3.reset();
    health.reset();
    team.reset();
    enforcer.reset();
    scan.reset();
    identity.assign();
    resetSensor();
    const nick = self?.nickname ?? nickname;
    if (map === 'corridor') connect(roomCode, nick);
    else navigate(`/world?code=${encodeURIComponent(roomCode)}&nick=${encodeURIComponent(nick)}`);
  }, [map, connect, navigate, roomCode, self?.nickname, nickname]);
  /**
   * 챕터 대본의 대사 출구 — 내 화면에만 찍힌다 (서버로 안 간다). 내 대사(self)는 내 id 로 넣어 내 초상 테가 붙게.
   * 복도 끝 문턱에 닿으면(onTransit) 중앙 시설(/central)로 길을 바꾼다 — 같은 방 번호·닉네임으로 다시 들어간다.
   */
  useEffect(() => {
    const emitLine = (line: { nickname: string; text: string; portrait: ChatLine['portrait']; self: boolean; thought?: boolean }) => {
      // thought = 소리 내지 않은 속마음 — 대화창이 다르게 그린다 (worldSlice ChatLine.thought)
      dispatch(worldActions.chatReceived({ id: line.self ? (selfId ?? 'me') : `chapter:${line.nickname}`, nickname: line.nickname, text: line.text, ts: Date.now(), portrait: line.portrait, thought: line.thought }));
    };
    chapter1.bind(
      emitLine,
      self?.nickname ?? nickname,
      map === 'corridor' ? () => navigate(`/central?code=${encodeURIComponent(roomCode)}&nick=${encodeURIComponent(self?.nickname ?? nickname)}`) : null,
      // 락다운이 끝나면 챕터 2 가 이어받는다 — 검문·행동 분석·검증실 앞까지 (중앙 시설에서만)
      map === 'central' ? () => chapter2.start() : null,
    );
    /*
     * 챕터 2 의 끝 — 검증실 문이 열리고 암전 → **재검실(/recheck, 챕터 3)**. 심문소는 그 뒤다
     * (2026-08-30 사용자: 복도 → 중앙 시설 → 재검실 → 심문소).
     * 두 콜백의 목적지가 같고 **시점만 다르다**: 정상 진행은 줄까지 다 서고 나서, detain 은 감독이 그 자리에서 끊고 바로.
     * detain 콜백이 없으면 헌법(director.allowMoves)이 그 무브를 아예 목록에서 뺀다 — 갈 곳 없는 무브는 주지 않는다.
     */
    const toRecheck = () =>
      navigate(`/recheck?code=${encodeURIComponent(roomCode)}&nick=${encodeURIComponent(self?.nickname ?? nickname)}`);
    chapter2.bind(emitLine, self?.nickname ?? nickname, toRecheck, toRecheck);
    // 챕터 3 의 끝 — 방면이든 사격이든 결국 심문소로 간다
    // ?from=central — 검문소가 이 표식을 보고 「게임 시작」 버튼 없이 암전에서 바로 판을 연다
    // 넷째 인자는 **감독의 목소리**다. 감독은 문장을 그 자리에서 지어서 클립을 미리 못 굽는다 —
    // 방송으로 보내면 리더와 같은 목소리로 그 자리에서 합성된다 (features/tts). 자막은 안 딸려 온다:
    // 글자는 위 emitLine 이 이미 대화창에 찍었고, /recheck 는 제 자막을 그리는 화면이다 (tts/scope.ts).
    chapter3.bind(
      emitLine,
      self?.nickname ?? nickname,
      () => navigate('/interrogation?from=central'),
      (text) => dispatch(broadcastAnnounce({ text })),
    );
    // 개발 전용 — 헤드리스 확인 스크립트가 챕터를 밀어 본다 (포인터 잠금이 없는 환경)
    if (import.meta.env.DEV) {
      const w = window as unknown as { __chapter?: unknown; __chapter2?: unknown; __chapter3?: unknown; __doors?: unknown; __sync?: unknown; __scan?: unknown; __identity?: unknown; __comms?: unknown; __suspicion?: unknown; __interrogation?: unknown; __dossier?: unknown };
      w.__chapter = chapter1;
      w.__chapter2 = chapter2;
      w.__chapter3 = chapter3;
      // 기록 — 대질이 왜 나왔는지 확인할 때. 시연 전에 앞말을 심어 두는 데도 쓴다 (tools/director-shot.mjs)
      w.__dossier = dossier;
      // 문을 손으로 열어 보는 손잡이 — 열린 문 뒤(문간)를 확인 스크립트가 찍을 수 있게 (tools/world-shots.mjs)
      w.__doors = doors;
      w.__sync = sync;
      w.__scan = scan;
      w.__identity = identity;
      w.__comms = comms;
      w.__suspicion = suspicion;
      // 감시·추궁 — 따라붙은 개체에 대한 대응(report)을 확인 스크립트가 밀어 본다
      w.__interrogation = interrogation;
    }
  }, [dispatch, selfId, self?.nickname, nickname, map, roomCode, navigate]);

  // 감시 AI 의 추궁 — 대사는 로봇 초상으로 내 화면에만. 중앙 시설에만 에이전트가 있다 (복도는 빈 인트로 무대)
  useEffect(() => {
    const units = map === 'central' ? CENTRAL_UNITS : null;
    if (!units) return;
    // 추궁하러 다가오는 건 총 든 경비 (2026-08-30 사용자)
    interrogation.bind(
      (line) => {
        dispatch(worldActions.chatReceived({ id: `guard:${line.nickname}`, nickname: line.nickname, text: line.text, ts: Date.now(), portrait: guardPortrait(line.nickname) }));
      },
      units,
      CENTRAL_ARMED_UNITS,
    );
    if (import.meta.env.DEV) (window as unknown as { __interrogation?: unknown }).__interrogation = interrogation;
    return () => interrogation.unbind();
  }, [map, dispatch]);

  /**
   * 뒷걸음 판정기 — 물러선 한 장면을 AI 가 보고 의심도를 정한다 (features/world/backstep.ts).
   * 고정 규칙(초당 +5)이 길을 비킨 것도 공포로 치던 것을 고친 자리 (2026-08-30 사용자)
   */
  useEffect(() => {
    const off = backstepJudge.bind();
    if (import.meta.env.DEV) (window as unknown as { __backstep?: unknown }).__backstep = backstepJudge;
    return off;
  }, []);

  // 씬이 뜨면 챕터가 저절로 시작된다 — 복도에서만. 잠금을 기다리지 않는다(잠금은 「입장」에서 이미 잡혔거나, 거절됐더라도 대사는 흘러야 한다)
  useEffect(() => {
    if (map === 'corridor' && live && sceneReady) chapter1.start();
    // 재검실은 이야기 중간에 끌려 들어온 자리다 — 들어서는 순간 챕터 3 이 열린다
    if (map === 'recheck' && live && sceneReady) chapter3.start();
  }, [map, live, sceneReady]);

  // 무장 심문 AI — 판정(100) 뒤 의심도를 0 으로 되돌린다 (소프트 게임 오버: 제거되고 다시 시작)
  useEffect(() => {
    enforcer.bind(
      (line) => dispatch(worldActions.chatReceived({ id: 'enforcer', nickname: line.nickname, text: line.text, ts: Date.now(), portrait: 'enforcer' })),
      () => {
        resetSensor();
        health.down('제압'); // 제압 완료 — 체력이 남았어도 쓰러진다 → 패배 (DefeatHud 가 처음으로 돌린다)
      },
    );
    if (import.meta.env.DEV) {
      const w = window as unknown as { __enforcer?: unknown; __health?: unknown; __team?: unknown };
      w.__enforcer = enforcer;
      w.__health = health;
      w.__team = team;
    }
    return () => enforcer.unbind();
  }, [dispatch]);

  /**
   * 의심도 문턱 — 시스템(A-01)의 한 마디를 **내 화면에만** 찍는다 (서버로 안 간다).
   * 100 이면 사격: 중앙 시설은 순찰 중인 총 든 경비가(nearestArmedUnit), **재검실은 검증대 뒤의 그 개체가**
   * (2026-09-01 사용자: "심문자가 결국 검출자고 사살할 능력을 가졌다 — 100 이면 그 자리에서 쏘면 된다"),
   * 경비가 아무도 없는 맵은 출입구에서 새 몸이 들어온다.
   */
  const onThreshold = useCallback(
    (level: Threshold) => {
      dispatch(worldActions.chatReceived({ id: 'system', nickname: 'A-01', text: THRESHOLD_LINES[level], ts: Date.now(), portrait: 'system' }));
      const near = map === 'central' ? nearestArmedUnit() : map === 'recheck' ? RECHECK_SHOOTER : undefined;
      /*
       * 40 감시가 붙는다 · 60 다가와 훑는다 · 80 시설이 나를 지목한다(AgentRobot 이 suspicion 을 직접 읽어 돌아본다) · 100 쏜다.
       * 앞의 둘은 **순찰 개체가 있는 중앙 시설의 연출**이다 — 재검실에는 붙일 감시도, 다가올 개체도 없다(하나뿐인 개체가
       * 이미 검증대 뒤에서 나를 보고 있다). 그 방에서 올라간 의심도는 마지막 문턱에서 총으로 갚는다
       */
      if (level === 40 && map === 'central' && near) interrogation.watchFrom(near.index);
      else if (level === 60 && map === 'central' && near && scan.ready()) scan.begin(near.index, near.name);
      else if (level === 80) sync.shock(12, '긴장');
      else if (level === 100) enforcer.dispatch(near);
    },
    [dispatch, map],
  );

  /**
   * 문턱 연출은 **저장소에 하나만** 건다 (mp/suspicion.bindCross) — 대본·추궁·스캔 어디서 올리든 같은 일이 일어난다.
   * 예전엔 bump 의 반환값을 부르는 쪽이 각자 챙겨서, 검문에서 틀려 100 을 넘어도 사격이 안 왔다 (2026-08-30)
   */
  useEffect(() => {
    suspicion.bindCross(onThreshold);
    return () => suspicion.bindCross(null);
  }, [onThreshold]);

  /**
   * 감시가 붙는 순간 — 조력자가 대응을 **딱 한 번** 알려 준다 (chapter1.advise → interrogation.report).
   * 붙는 자리가 둘이라(문턱 40 · 추궁이 끝났는데 아직 의심스러울 때) 저장소의 변화를 보고 잡는다.
   */
  useEffect(() => {
    let had = interrogation.get().watch !== null;
    return interrogation.subscribe(() => {
      const now = interrogation.get().watch !== null;
      if (now && !had) chapter1.advise('watch');
      had = now;
    });
  }, []);

  /**
   * SYNC 의 두 이음새 — ① 의심도가 한 번에 5 이상 오르면 긴장으로 동기화가 떨어진다.
   * ② 글리치를 곁의 AI 가 봤으면 그가 묻고 의심도가 오른다 ("방금 움직임은 무엇이지?"). 이름은 이 맵의 에이전트 중 하나
   */
  useEffect(() => {
    const units = map === 'central' ? CENTRAL_UNITS : null;
    sync.bind((seen) => {
      if (!seen || !units) return;
      dispatch(worldActions.chatReceived({ id: 'guard:sync', nickname: units[0], text: GLITCH_SEEN, ts: Date.now(), portrait: guardPortrait(units[0]) }));
      suspicion.bump(8, '돌발');
    });
    const unsub = suspicion.subscribe(() => {
      const last = suspicion.get().last;
      if (last && last.delta >= 5 && performance.now() - last.at < 50) sync.shock(Math.min(6, last.delta * 0.5), '긴장');
    });
    // 패턴 스캔의 대사 — 판정(의심도)은 scan.ts 가 직접 하고, 문턱 연출은 bindCross 가 받는다
    scan.bind((line) => dispatch(worldActions.chatReceived({ id: `guard:${line.nickname}`, nickname: line.nickname, text: line.text, ts: Date.now(), portrait: guardPortrait(line.nickname) })));
    return () => {
      unsub();
      sync.bind(null);
      scan.unbind();
    };
  }, [map, dispatch, onThreshold]);

  const sendLine = useCallback(() => {
    const text = draft.trim();
    if (text) {
      conn.sendChat(text);
      // 이 구역은 내가 한 말을 **전부** 기억한다 (dossier.ts). 안쪽 검문의 감독이 이걸 읽고 앞말과 대질한다
      dossier.say(text);
      // 챕터 2 의 질문이 걸려 있으면 그 답이다. 경비 AI 가 답을 기다리는 중이면 그쪽이 판정한다 (LLM). 아니면 말투 판정
      // 감시가 붙어 있으면 이 한 마디가 **상태 보고**일 수 있다 (interrogation.report — 조력자가 알려 준 대응)
      const judged =
        chapter2.answerText(text) || chapter3.answerText(text) || interrogation.answer(text) || interrogation.report(text) ? null : judgeLine(text);
      if (judged) suspicion.bump(judged[0], judged[1]);
    }
    setDraft('');
    setComposing(false);
    lineRef.current?.blur();
  }, [conn, draft]);

  const spawn = useMemo(() => (self ? spawnFor(self.seat, ROOM_MAX_PLAYERS) : { x: 0, z: 0 }), [self]);

  /* ─────────────────────────────── 입장 폼 ─────────────────────────────── */

  if (!live) {
    // 이야기로 들어온 길 — 앞 무대의 암전을 그대로 들고 접속을 기다린다 (폼은 안 띄운다)
    if (arriving && status !== 'error') {
      return (
        <div ref={rootRef} key="root" style={{ position: 'fixed', inset: 0, background: '#000', display: 'grid', placeItems: 'center' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.34em', color: '#1d2a34' }}>LINK …</span>
        </div>
      );
    }
    return (
      <div ref={rootRef} key="root">
        <main style={{ padding: 64, maxWidth: 360 }}>
          <BackToRoot />
          <h2>{mapDef.title}</h2>
          <p style={{ color: '#888', fontSize: 13 }}>{mapDef.blurb}</p>
          <form onSubmit={enter} style={{ display: 'grid', gap: 8, marginTop: 16 }}>
            <input
              value={roomCode}
              inputMode="numeric"
              placeholder="방 번호 (숫자)"
              maxLength={6}
              onChange={(e) => dispatch(worldActions.setRoomCode(e.target.value.replace(/\D/g, '')))}
            />
            <input
              value={nickname}
              placeholder="닉네임"
              maxLength={NICK_MAX_LEN}
              onChange={(e) => dispatch(worldActions.setNickname(e.target.value))}
            />
            <button type="submit" disabled={status === 'connecting'} style={{ padding: 10 }}>
              {status === 'connecting' ? '접속 중…' : '입장'}
            </button>
          </form>
          {status === 'error' && errorText ? <p style={{ color: '#d2796a', fontSize: 13 }}>{errorText}</p> : null}
          <p style={{ color: '#666', fontSize: 12, marginTop: 24, lineHeight: 1.6 }}>
            WASD 이동 · 마우스 시야 · Space 점프 · 1 화남 · 2 동의 · Enter 말하기 · ESC 잠깐 멈춤
          </p>
        </main>
      </div>
    );
  }

  /* ─────────────────────────────── 월드 ─────────────────────────────── */

  return (
    <div ref={rootRef} key="root" style={{ position: 'fixed', inset: 0, background: '#07050a', overflow: 'hidden', touchAction: 'manipulation', overscrollBehavior: 'none' }}>
      <WorldScene
        conn={conn}
        spawn={spawn}
        roster={roster}
        bubbleTick={bubbleTick}
        composing={composing}
        paused={paused}
        quality={quality}
        map={map}
        onReady={() => setSceneReady(true)}
      >
        {map === 'corridor' ? <Chapter1Scene /> : null}
        {mapDef.enforcerSpawn ? <Enforcer spawn={mapDef.enforcerSpawn} /> : null}
        <SyncTremor />
        {/* 쓰러진 머리를 벽 밖으로 — 맵의 충돌판을 준다 (2026-09-01) */}
        <Downed resolve={mapDef.resolveColliders} />
        {children}
      </WorldScene>
      <EnforcerHud />
      <DamageHud />
      <HealthHud />
      <DefeatHud alive={alive} onRestart={restart} />
      <ObjectiveHud />
      <NoticeHud />
      <ScanHud />
      {/* 화면 가운데 판독 눈금 — 복도에서 단말·벽을 들여다보는 동안만 뜬다 (probe.ts) */}
      <ProbeHud />
      {/* 문 앞의 두 갈래 — 「문을 연다 / 열지 않는다」 (chapter1.state.choice · E/Q 또는 단추) */}
      <ChoiceHud />

      {/*
        DIRECTOR 판(판정 하나를 펼쳐 보이던 시연용 창)은 **지웠다** — 화면에서 뺀 데 이어 컴포넌트(DirectorHud.tsx)와
        그 css 까지 (2026-09-01 사용자: "이거 없애 줘. 뭔지는 모르겠지만"). 판정 기록 자체는 directorLog 에 그대로 쌓인다.
      */}

      {/* 왼쪽 위 상태 패널 — 방 · AI SUSPICION · SYNC · 목표 (uxpilot 디자인, hud.css). 글리치 효과는 SyncHud. 배경음악 볼륨은 나가기 아래 */}
      <StatusPanel roomCode={roomCode} nickname={self.nickname} count={roster.length + 1} capacity={ROOM_MAX_PLAYERS} />
      <SyncHud />
      {/*
        장이 닫히는 암전에는 곡도 같이 재운다 (fade — features/world/blackout 의 useBlackout).
        문턱마다 라우트가 바뀌면서 소리가 뚝 끊기던 자리다. 특히 재검실 → 인지 검증실은
        다음 무대에 배경음악이 아예 없어서(MAPS.warehouse), 끊긴 자리가 그대로 무음으로 이어졌다.
      */}
      {/*
        머리줄 — 오른쪽 위 한 줄에 **음량 · 나가기** 를 모은다 (방·이름은 상태 패널이 보여 준다).
        걷는 동안 시야를 가리지 않게 작게.

        ★ 음량 손잡이가 여기로 왔다 (2026-09-02 사용자: "음량 조절하는 걸 나가기 버튼의 왼쪽에").
          여태 Bgm 이 제 발로 `right:12 / top:44` 에 섰는데, 그 아래(top 61)가 접힌 수첩의
          [메모] 자리라 **정확히 겹쳐서 수첩을 다시 펼 수 없었다.** 오른쪽 위에 무엇이 서는지는
          한 부품이 알 수 없는 일이라, 이제 자리는 이 줄이 정한다 (features/world/Bgm 머리말).
      */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, zIndex: 30, pointerEvents: 'none' }}>
        {mapDef.bgm ? (
          <Bgm src={lockdown && mapDef.lockdownBgm ? mapDef.lockdownBgm : mapDef.bgm} fade={blackout > 0} />
        ) : null}
        <button type="button" onClick={leave} style={{ pointerEvents: 'auto', fontSize: 12, padding: '4px 10px', background: 'rgba(0,0,0,0.55)', color: '#ddd', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6 }}>
          나가기
        </button>
      </div>

      {/*
        관찰 수첩 — 오른쪽 변. 왼쪽으로 대화가 흐르는 동안 오른쪽에는 내가 적는다 (shared/NotePad).
        N 으로 여닫고, 적은 줄에는 이 방 이름이 붙는다. 방을 옮겨도 수첩은 한 권이라 복도에서 적은
        번호를 검문소에서 그대로 읽는다. 잠금·조작·판정에는 아무것도 안 건드린다.
      */}
      <NotePad room={NOTE_ROOM[map]} touch={touchMode} />

      {/*
        대화 — 걷는 중엔 화면 아래 **1인칭 대화창**(DialogueBox)에 한 줄씩 타자로 찍힌다 (2026-08-29 참고 이미지, 비주얼 노벨식).
        ESC 로 멈춘 상태(커서가 자유로울 때)엔 전체 기록을 휠로 굴려 읽는다 — 스스로 잠금을 풀지는 않는다.
        폰에서는 조이스틱(좌하단 ~140px)과 겹치지 않게 위로 올린다.
      */}
      {!touchMode && everLocked && !locked ? (
        messages.length > 0 ? (
          <ChatLog messages={messages} />
        ) : null
      ) : (
        <>
          <DialogueBox messages={messages} selfId={selfId} touch={touchMode} lifted={composing && !touchMode} onSkip={skipLine} />
          {/* 내가 친 말 — 대화창이 아니라 화면 로그로 */}
          <SelfChatLog messages={messages} selfId={selfId} touch={touchMode} lift={composing && !touchMode ? 54 : 0} />
        </>
      )}

      {/*
        마우스가 안 잡혀 있는 동안 — 화면 어디를 클릭해도 잡는다 (버튼·기록·볼륨은 위에 떠 있어 그대로 눌린다).
        「입장」에서 잡은 잠금이 거절됐거나(제스처 밖에서 들어온 경우) 걷다가 ESC 로 멈춘 경우 둘 다다. 대사는 잠금과 무관하게 흐른다.
      */}
      {!touchMode && sceneReady && !locked ? (
        <div
          onClick={resumeWalking}
          style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, pointerEvents: 'auto', cursor: 'pointer' }}
        >
          <span style={{ fontSize: 13, color: '#ccc', background: 'rgba(0,0,0,0.6)', padding: '10px 16px', borderRadius: 8 }}>
            {everLocked ? '잠깐 멈춤 — 화면을 클릭하면 계속' : '화면을 클릭하면 마우스로 조작'}
          </span>
        </div>
      ) : null}

      {/*
        한 줄 입력 — Enter 로 열리고, 보내면 바로 닫힌다.
        자리는 화면 맨 아래, **대화창(DialogueBox) 아래** — 입력줄이 열리면 대화창이 그 높이(--dlg-lift)만큼 올라가 자리를 내준다
        (2026-08-30 사용자: 같은 자리에 두면 대사를 가리고, 대사 위에 두는 것도 어색하다 — 입력은 아래가 자연스럽다).
      */}
      {composing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendLine();
          }}
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
            transform: 'translateX(-50%)',
            width: 'min(520px, 90vw)',
            zIndex: 45,
          }}
        >
          <input
            ref={lineRef}
            value={draft}
            maxLength={200}
            placeholder="한 마디… (Enter 보내기 · 빈 줄이면 닫기)"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setDraft('');
                setComposing(false);
                lineRef.current?.blur();
              }
            }}
            onBlur={() => {
              // 폰에서 키보드를 내리면 닫는다 (데스크톱은 잠금이 유지되므로 blur 가 거의 안 온다)
              if (touchMode) setComposing(false);
            }}
            style={{ width: '100%', padding: '10px 14px', fontSize: 14, borderRadius: 4, border: '1px solid rgba(111,211,255,0.7)', boxShadow: '0 0 12px rgba(111,211,255,0.25)', background: 'rgba(4,12,22,0.82)', color: '#eaf6ff', outline: 'none' }}
          />
        </form>
      ) : null}

      {/* 앞 무대의 암전을 이어받은 검은 막 — 씬이 뜨면 밝아진다 */}
      {arriving ? <ArrivalFade ready={sceneReady} /> : null}

      {/* 폰: 조이스틱 · 시야 드래그 · 점프 · 말하기 */}
      {touchMode && playing && !composing ? <TouchControls /> : null}
      {touchMode && live && !composing ? <SpeakButton onSpeak={() => setComposing(true)} /> : null}
    </div>
  );
}

/**
 * 도착 페이드 — 씬이 준비될 때까지는 그냥 검은 막이고, 준비되면 1.4초에 걸쳐 걷힌다.
 * 같은 엘리먼트라 `ready` 가 뒤집히는 순간 애니메이션이 시작된다 (막을 새로 끼우면 한 프레임 깜박인다).
 */
function ArrivalFade({ ready }: { ready: boolean }) {
  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 70,
          background: '#000',
          pointerEvents: 'none',
          ...(ready ? { animation: 'world-arrive 1.4s ease-out both' } : { opacity: 1 }),
        }}
      />
      <style>{'@keyframes world-arrive { from { opacity: 1; } to { opacity: 0; } }'}</style>
    </>
  );
}

/* ─────────────────────────────── 대화 목록 ─────────────────────────────── */

function ChatLog({ messages }: { messages: readonly ChatLine[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  // 열릴 때·새 줄이 올 때 맨 아래로
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  return (
    <div
      style={{
        position: 'absolute',
        left: 24,
        bottom: 96,
        width: 'min(46rem, 60vw)',
        maxHeight: '45vh',
        overflowY: 'auto',
        zIndex: 25,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(4,12,22,0.7)',
        border: '1px solid rgba(111,211,255,0.35)',
        pointerEvents: 'auto',
      }}
    >
      <p style={{ margin: '0 0 6px', fontSize: 10, letterSpacing: '0.14em', color: '#6fa8c8' }}>대화 기록 · {messages.length}</p>
      {messages.map((m) => (
        <ChatLineRow key={m.key} line={m} opacity={1} />
      ))}
      <div ref={endRef} />
    </div>
  );
}

function ChatLineRow({ line, opacity }: { line: ChatLine; opacity: number }) {
  return (
    <p style={{ margin: 0, maxWidth: 'min(46rem, 60vw)', fontSize: 12, lineHeight: 1.45, color: '#d4d4d4', textShadow: '0 1px 4px rgba(0,0,0,0.9)', opacity, wordBreak: 'break-word' }}>
      <span style={{ fontWeight: 700, color: '#8fd6ff' }}>{line.nickname}</span> <span style={{ color: '#e5eef7' }}>{line.text}</span>
    </p>
  );
}

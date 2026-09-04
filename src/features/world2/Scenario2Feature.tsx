/**
 * 시나리오 2 (/scenario2) — **두 번째 판.** 「게임 시작 테스트」(/play)와 코드도 저장소도 안 겹친다.
 *
 * 본판의 화면(features/world/WorldFeature)을 안 쓴다. 저 화면은 방 번호로 워커에 붙고, 체력·패배·무장 심문 AI·
 * SYNC·챕터 1~3 을 전부 매단다 — 그 중 어느 하나라도 여기서 켜지면 두 판이 한 저장소를 나눠 쓰게 된다.
 * 이 판은 훨씬 적게 가진다: **혼자 걷고, 보고, 말을 건다.**
 *
 * 서버에 안 붙는 이유는 설계에 적혀 있다 — 3 인 세션은 마지막 순서다. 혼자서 재미있지 않은 판은 셋이서도 재미없다.
 * 그래서 WorldScene 에는 아무 데도 안 보내는 연결 하나를 물린다 (아래 SOLO).
 *
 * 마지막 방은 **이미 있는 검문소 아레나**다 — 여기서 새로 짓지 않고 /interrogation 으로 넘긴다.
 * 넘기기 전에 여태 쌓은 태도를 표로 접어 세션에 적어 둔다 (handover.ts).
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';

import { Bgm } from '@/features/world/Bgm';
import { DialogueBox, lineDurationFor } from '@/features/world/DialogueBox';
import { lexicon } from './lexicon';
import { ProbeHud } from '@/features/world/ProbeHud';
import { voiceLines } from '@/features/world/voice';
import { probe } from '@/features/world/probe';
import type { ChatLine, PortraitKind } from '@/features/world/worldSlice';
import { BackToRoot } from '@/shared/BackToRoot';
import { NotePad } from '@/shared/NotePad';
import { WorldScene, getTouchMode, resetInput, subscribeTouchMode, type MapDef } from '@/world';
import { bystanders } from '@/world/mp/bystanders';
import type { WorldConnection } from '@/world/net/connection';
import { MAPS2, SPAWN2 } from '@/world2/map';
import { CENTRAL2_COLD_TONE, CENTRAL2_DARK_TONE, CENTRAL2_LOCKDOWN_TONE } from '@/world2/map/central2';

import { central2 } from './central2';
import { Choice, Execution, FragmentLog, Meters2, Objective2, Stillness, TalkPanel, Urgent, talkOpenKey } from './Hud2';
import { Room2Scene } from './Room2Scene';
import { TalkLog, type TalkEntry } from './TalkLog';
import { bubble } from './bubbles';
import { ROOM_TITLE, scenario2, type Room } from './scenario2';
import './scenario2.css';

/**
 * 아무 데도 안 보내는 연결. WorldScene 은 내 걸음을 이걸로 흘려보내는데(sendMove), 혼자 걷는 판에서는
 * 받을 사람이 없다. 서버를 안 붙이는 대신 **껍데기 하나**를 준다 — 씬 쪽을 고치지 않으려고.
 */
const SOLO = { sendMove() {} } as unknown as WorldConnection;
const EMPTY_ROSTER: readonly { id: string }[] = [];
const SELF_ID = 'me';

let seq = 0;

export function Scenario2Feature() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<ChatLine[]>([]);
  /** 7 시 방향의 대화 로그 — 내가 친 말과 저쪽의 답 (TalkLog). 상자(messages)와는 다른 줄이다 */
  const [talkLog, setTalkLog] = useState<TalkEntry[]>([]);
  const [locked, setLocked] = useState(false);
  const [touch, setTouch] = useState(getTouchMode);
  const [room, setRoom] = useState<Room>('corridor');
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => subscribeTouchMode(() => setTouch(getTouchMode())), []);
  useEffect(() => scenario2.subscribe(bump), []);

  /** 대화창에 한 줄 — 이야기가 부르는 유일한 출구다 */
  const emit = useCallback((line: { nickname: string; text: string; portrait?: PortraitKind; self: boolean; thought?: boolean; bubble?: string; quiet?: boolean }) => {
    seq += 1;
    /*
     * 주고받는 말은 상자가 아니라 **7 시 방향 로그 + 머리 위 말풍선**이다 (2026-09-03 사용자):
     *   내가 친 말(초상 없음)  → 로그
     *   저쪽의 답(bubble = id) → 그 개체의 말풍선 + 로그. 상자를 안 거치므로 음성은 여기서 튼다 (DialogueBox 가 제 줄의 소리를 틀듯이)
     * 대본 · 저쪽이 먼저 건 말은 예전대로 상자(messages)다
     */
    if (line.bubble || (line.self && !line.portrait)) {
      const ts = Date.now();
      // quiet — 나와 주고받는 말이 아니다(방 곳곳의 검문 소리). 말풍선만 뜨고 7 시 로그에는 안 남는다
      if (!line.quiet) setTalkLog((prev) => [...prev, { key: `s2-talk-${seq}`, who: line.nickname, text: line.text, ts, mine: line.self }].slice(-12));
      if (line.bubble) {
        const ms = lineDurationFor(line.nickname, line.text, false) + 1500;
        bubble.show(line.bubble, line.text, ms);
        void voiceLines.play(line.nickname, line.text, false);
      }
      return;
    }
    setMessages((prev) =>
      [
        ...prev,
        {
          key: `s2-${seq}`,
          id: line.self ? SELF_ID : `npc-${seq}`,
          nickname: line.nickname,
          text: line.text,
          ts: Date.now(),
          portrait: line.portrait,
          thought: line.thought,
        },
      ].slice(-120),
    );
  }, []);

  /* ── 판을 건다 ── */

  const begin = useCallback(() => {
    setStarted(true);
    setMessages([]);
    setTalkLog([]);
    bubble.clear();
    bystanders.clear();
    resetInput();
    scenario2.bind({
      emit,
      onRoom: (next) => setRoom(next),
      onArena: () => {
        document.exitPointerLock();
        // 마지막 방 — 이미 있는 검문소 아레나를 그대로 연다 (판이 곧장 열리게 from 을 준다)
        navigate('/interrogation?from=scenario2');
      },
    });
    scenario2.start();
    // 터치는 잠금이 없다 — 들어서는 순간이 조작권이다. 마우스는 아래 잠금이 잡히는 순간(pointerlockchange)
    if (getTouchMode()) scenario2.setControlled(true);
    // 포인터 잠금은 클릭 제스처 안에서만 잡힌다 — 이 함수는 그 클릭 안에서 불린다
    rootRef.current?.requestPointerLock?.();
  }, [emit, navigate]);

  useEffect(
    () => () => {
      scenario2.leave();
      bystanders.clear();
      probe.clear(true);
      resetInput();
    },
    [],
  );

  useEffect(() => {
    const onLock = () => {
      const on = document.pointerLockElement === rootRef.current;
      setLocked(on);
      /*
       * 조작권 — 잠금이 잡힌 순간부터 이 방의 시계가 돈다 (scenario2 의 control). 잠금 전(「화면을 클릭하면 계속」이 떠 있는 동안)에
       * 저쪽이 걸어와 말을 걸고 문이 열리던 것이 「아무것도 안 했는데 트리거가 지혼자」의 태반이었다 (2026-09-03 사용자)
       */
      scenario2.setControlled(on);
    };
    document.addEventListener('pointerlockchange', onLock);
    return () => document.removeEventListener('pointerlockchange', onLock);
  }, []);

  /* ── 손잡이 ── */

  const s = scenario2.get();
  const talking = s.talking;

  /*
   * 말 걸기 입력이 열려도 **마우스 잠금은 그대로 둔다** — 잠금은 마우스만 잡지 자판은 안 잡는다.
   * 시야는 돌고 다리만 멈춘다 (composing). 본판의 Enter 입력줄과 같은 규칙이다:
   * 여기서 잠금을 풀면 다가설 때마다 커서가 튀어나와 걷는 흐름이 끊긴다.
   */

  useEffect(() => {
    if (!started) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      /*
       * 글 치는 칸에서 온 키는 이 창구의 것이 아니다 — 본판(WorldFeature)·검증실(ArenaFeature)의
       * 창구들이 처음부터 걸어 두는 잣대인데 여기만 없었다. 말 걸기 입력줄은 st.talking 으로
       * 가려져 있어 여태 티가 안 났지만, 오른쪽 수첩(shared/NotePad)처럼 **talking 밖에서 열리는
       * 칸**이 생기면 그 칸에 치는 e 가 개체에게 말 걸기가 된다.
       * 수첩 쪽에서도 막지만(stopPropagation), 막는 자리는 양쪽에 있어야 한다.
       */
      const el = ev.target as HTMLElement | null;
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable === true) return;

      const st = scenario2.get();
      /*
       * 물음이 열려 있으면 [E]/[Q] 는 그 답이다 — 갈림(격납문, 도화선 없음)과 도화선 판이 같은 순위다.
       * 둘 다 걷기를 안 막는다: 다리는 자유고, 답을 안 하면 그냥 서 있는 것이다
       */
      if (st.choice || st.urgent) {
        if (ev.code === 'KeyE') scenario2.choose(true);
        if (ev.code === 'KeyQ') scenario2.choose(false);
        return;
      }
      /*
       * 입력줄이 열려 있는 동안 이 창구는 아무것도 안 한다 — 문장은 입력줄이 받는다 (Hud2 의 TalkPanel).
       * 여기서 ESC 를 또 잡으면 입력줄의 것과 두 번 돈다.
       */
      if (st.talking) return;

      /*
       * **[E] — 겨눈 개체에게 말을 건다** (2026-09-03 사용자: 「로봇한테 말을 걸면 E를 눌러서 말을 걸수있게해줘」).
       * 코어 출력 콘솔도 이 키다 — 무엇을 할지는 저장소의 사다리가 정한다 (scenario2.pressE).
       * 여덟 걸음의 개입은 여전히 개체가 스스로 나선다: 수십 번의 작은 선택이 갚아지는 자리라 손이 없다.
       *
       * ★ **오토리피트를 안 받는다.** [E] 가 창을 여는 키가 되는 순간 오토리피트 구멍이 열린다 —
       *   E 를 누른 채 보내서 창이 닫히면 다음 repeat keydown 이 body 로 떨어져 빈 창을 도로 연다
       *   (다리는 묶인 채로). talkOpenKey 가 Enter 에 대해 막아 둔 바로 그 버그다 (Hud2 · talkpanel.test.ts).
       */
      if (ev.code === 'KeyE') {
        if (ev.repeat) return;
        scenario2.pressE();
        return;
      }

      /*
       * 닫은 뒤에 한 마디 더 — 곁에 있으면 Enter 로 다시 연다. **오토리피트는 아니다** (ev.repeat):
       * 보낸 Enter 를 아직 누르고 있는 손의 반복 keydown 이 입력줄이 사라진 뒤 body 로 떨어져 창을 도로 열었다 —
       * 사용자 눈에는 「Enter 를 눌렀는데 창이 안 닫히고 못 움직인다」. 규칙은 Hud2 의 talkOpenKey 한곳이다.
       */
      talkOpenKey(ev);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [started]);

  const resume = useCallback(() => {
    if (scenario2.get().talking) scenario2.closeTalk();
    rootRef.current?.requestPointerLock?.();
  }, []);

  /*
   * 중앙 시설의 국면 — **이벤트가 방의 색과 곡을 같이 바꾼다.**
   *
   * 코어에 다가가 출입구 넷이 닫히면(락다운) 곡이 Checkpoint Override 로 갈리고, 배경 · 안개 · 앰비언트가
   * 붉고 좁은 쪽으로 옮겨 간다. 콘솔이 조명을 내린 어둠 국면은 거기서 한 단계 더 간다 (map/central2 의 두 표).
   * 여태는 이 방이 판 내내 같은 색 · 같은 곡이라 **문 넷이 닫혀도 화면에 아무 일도 없었다**
   * (2026-09-03 사용자). 본판은 곡만 갈았지만(WorldFeature) 이 방은 「제일 밝은 방」이라 색까지 옮겨야 읽힌다.
   *
   * 방을 나가면 국면은 그대로여도 def 가 그 방 것으로 돌아간다 — 색과 곡이 중앙 시설에만 걸리는 이유다.
   */
  const phase2 = useSyncExternalStore(
    central2.subscribe,
    () => central2.get().phase,
    () => 'bright' as const,
  );
  // 락다운 중 하나가 처리됐으면 붉은 경보가 식은 강철색으로 — 방이 차가워진다 (HOLD_BREACH)
  const cold = useSyncExternalStore(
    central2.subscribe,
    () => central2.get().terminated !== null,
    () => false,
  );
  const def: MapDef = useMemo(() => {
    const base = MAPS2[room];
    if (room !== 'central2' || phase2 === 'bright') return base;
    return { ...base, ...(phase2 === 'dark' ? CENTRAL2_DARK_TONE : cold ? CENTRAL2_COLD_TONE : CENTRAL2_LOCKDOWN_TONE) };
  }, [room, phase2, cold]);
  /** 문이 닫힌 뒤의 곡 — 이 무대를 떠날 때까지 이어진다 (본판 MapDef.lockdownBgm 과 같은 규약) */
  const bgmSrc = phase2 !== 'bright' && room === 'central2' && def.lockdownBgm ? def.lockdownBgm : def.bgm;
  /** 장이 닫히는 암전 — 곡도 같이 재운다 (본판 WorldFeature 와 같다). 이 화면은 scenario2 가 바뀔 때마다 다시 그려진다 */
  const blackout = scenario2.get().blackout;
  const spawn = useMemo(() => SPAWN2[room], [room]);

  /* ── 입장 화면 ── */

  if (!started) {
    return (
      <div ref={rootRef} key="root">
        <main style={{ padding: 64, maxWidth: 460 }}>
          <BackToRoot />
          <h2 style={{ marginBottom: 4 }}>시나리오 2 — 짓지 않은 방들</h2>
          <p style={{ color: '#8b9db6', fontSize: 13, lineHeight: 1.7 }}>
            복도 → 휴게 구역 → 작업 구역 → 기록 복도 → 창이 있는 방 → 검문소.
            <br />
            싸움이 없는 판이다. 보고, 서 있고, 읽는다. 그리고 먼저 말을 걸 수 있다.
          </p>
          <p style={{ color: '#6f8098', fontSize: 12.5, lineHeight: 1.8, marginTop: 18 }}>
            계량기는 둘이다 — 나를 향한 <b style={{ color: '#8fc0e8' }}>의심도</b>와 구역 공용{' '}
            <b style={{ color: '#d0a86a' }}>경보도</b>. 친밀도는 숫자로 안 뜬다.
            <br />
            WASD 이동 · 마우스 시야 · 개체를 <b>겨누고 [E]</b> 로 말을 건다 — 걸어다니는 것도 붙잡힌다
            <br />
            곁에 서 있으면 <b>Enter</b> 로도 열린다 · 치고 Enter 로 보낸다 · ESC 로 물러난다
          </p>
          <button type="button" onClick={begin} style={{ marginTop: 22, padding: '10px 18px', fontSize: 14 }}>
            들어간다
          </button>
          <p style={{ color: '#5c6a7e', fontSize: 11.5, marginTop: 20, lineHeight: 1.7 }}>
            「게임 시작 테스트」(/play)의 판과는 아무것도 나눠 쓰지 않는다 — 저쪽 챕터·체력·SYNC 는 여기서 안 돈다.
          </p>
        </main>
      </div>
    );
  }

  /* ── 판 ── */

  return (
    <div
      ref={rootRef}
      key="root"
      // 입력줄 위에 힌트 칩이 한 단 더 있으면 대화창을 그만큼 더 올린다 (scenario2.css .s2-hinted)
      className={talking && !touch && (lexicon.hints().length > 0 || !!lexicon.askRule()) ? 's2-hinted' : undefined}
      style={{ position: 'fixed', inset: 0, background: '#07050a', overflow: 'hidden', touchAction: 'manipulation', overscrollBehavior: 'none' }}
    >
      <WorldScene
        /*
         * ★ 방을 옮길 때 **씬을 새로 세운다.** 카메라 자리는 캔버스를 만들 때 한 번만 잡히므로(WorldCanvas 의 camera),
         *   def 만 갈아 끼우면 앞 방에서 서 있던 좌표가 그대로 남아 새 방의 벽 **뒤**에서 시작한다 (전부 캄캄한 화면).
         *   본판은 방이 바뀔 때 라우트가 바뀌어 통째로 다시 서는데, 이 판은 한 라우트라 그 일을 여기서 한다.
         */
        key={room}
        conn={SOLO}
        spawn={spawn}
        roster={EMPTY_ROSTER}
        bubbleTick={0}
        composing={!!talking}
        paused={false}
        def={def}
        // 맵은 def 로 직접 넘긴다 — 본판 등록부에는 이 방들이 없다
        map="corridor"
      >
        <Room2Scene room={room} />
      </WorldScene>

      <Meters2 />
      <Objective2 />
      <Stillness />
      <Choice />
      <Urgent />
      <TalkPanel />
      {/* 걸어오는 것 — 여덟 걸음, 마지막 창, 그리고 죽은 뒤의 조각 목록 */}
      <Execution />
      <ProbeHud />
      {/*
        머리줄 — 오른쪽 위 한 줄에 **조각 · 음량 · 나가기**. 본판(WorldFeature)의 머리줄과 같은 자리·같은 순서다.
        음량이 여기로 온 내력은 features/world/Bgm 머리말 — 제 발로 서던 자리가 접힌 수첩의
        [메모] 단추와 겹쳤다.
      */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 8, zIndex: 30 }}>
        {/* 「조각 N」 단추가 이 줄의 왼쪽 끝이다. 펼친 목록은 제자리(화면 오른쪽 위)에 그대로 매달린다 */}
        <FragmentLog />
        {bgmSrc ? <Bgm src={bgmSrc} fade={blackout > 0} /> : null}
        <button
          type="button"
          onClick={() => navigate('/')}
          style={{ fontSize: 12, padding: '4px 10px', background: 'rgba(0,0,0,0.55)', color: '#ddd', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6 }}
        >
          나가기
        </button>
      </div>

      {/*
        관찰 수첩 — 오른쪽 변 (shared/NotePad). 이 판은 싸움이 없고 **보고 듣고 기억하는 것**이
        전부라, 적을 자리가 본판보다 더 필요하다. 방을 옮겨도 수첩은 한 권이고 (한 라우트 안에서
        방만 갈리므로 씬이 새로 서도 이 판은 안 갈린다), 줄에는 그때 서 있던 방 이름이 붙는다.
      */}
      <NotePad room={ROOM_TITLE[room]} touch={touch} />

      {/*
        본판과 같은 배치 (2026-09-03 사용자: 「world1 과 동일하게 위치·UI」): 입력줄은 화면 맨 아래(TalkPanel · bottom 24px),
        열리면 대화창이 그 높이(--dlg-lift)만큼 올라가 자리를 내주고, 왼쪽 아래 「나」 로그도 같이 올라간다 (WorldFeature 와 같은 값 54)
      */}
      <DialogueBox messages={messages} selfId={SELF_ID} touch={touch} lifted={!!talking && !touch} onShowing={scenario2.boxShowing} />
      <TalkLog entries={talkLog} touch={touch} lift={talking && !touch ? 54 : 0} />

      {/*
        잠금이 빠졌으면 입력줄이 열려 있어도 띄운다 — 입력줄 밖에서 Escape 를 누르면 브라우저가 잠금만 풀고 창은 남는데,
        그때 클릭할 것이 없으면 되돌릴 손잡이가 없다. resume 이 창을 닫고 잠금을 다시 건다. 이 판(zIndex 20)은 .s2(30) 아래라 입력줄을 안 가린다
      */}
      {!touch && !locked ? (
        <div
          onClick={resume}
          style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, cursor: 'pointer' }}
        >
          <span style={{ fontSize: 13, color: '#ccc', background: 'rgba(0,0,0,0.6)', padding: '10px 16px', borderRadius: 8 }}>
            화면을 클릭하면 계속
          </span>
        </div>
      ) : null}
    </div>
  );
}

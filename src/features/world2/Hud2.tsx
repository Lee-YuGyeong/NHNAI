/**
 * 시나리오 2 의 화면 판들 — 계량기 둘, 목표 한 줄, 방 이름, 그리고 **말 걸기**.
 *
 * 본판의 HUD 를 쓰지 않는다. 저쪽에는 SYNC 자리가 있고 이쪽에는 없다 — 계량기 하나를 지우는 것이
 * 이 시나리오가 규칙에 가한 가장 큰 변경이라, 화면이 그걸 먼저 말해야 한다.
 *
 * ★ 친밀도는 어디에도 안 뜬다. 태도는 개체의 행동으로만 드러난다 (units.ts 의 머리말).
 * ★ 조각 기록판은 **디버그용이다.** 설계가 「조각은 전부 한 줄 한국어」를 못 박은 이유가 이것이다 —
 *   전파 경로를 눈으로 따라갈 수 있어야 왜 그 판이 그렇게 됐는지 설명할 수 있다.
 */

import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';

import { identity } from '@/world/mp/identity';
import { suspicion } from '@/world/mp/suspicion';

import { alert } from './alert';
import { central2, type Phase2 } from './central2';
import { execution, MIN_WALK_MS } from './execution';
import { fragments, stamp } from './fragments';
import { lexicon } from './lexicon';
import { patrol } from './patrol';
import { ROOM_TITLE, ROOM_UNITS, scenario2 } from './scenario2';
import { MEMO_ASK } from './script';
import { talk } from './talk';
import { units } from './units';

/**
 * 저장소가 알릴 때마다 다시 그린다.
 * useSyncExternalStore 를 안 쓰는 이유: 이 저장소들은 **같은 객체를 고쳐 쓴다.** 그러면 스냅숏 비교가
 * 늘 같다고 나와 화면이 안 바뀐다 (본판 HUD 들은 부모가 자주 다시 그려져서 가려져 있던 함정이다).
 */
function useStore(subscribe: (fn: () => void) => () => void): void {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribe(bump), [subscribe]);
}

/* ─────────────────────────────── 계량기 둘 ─────────────────────────────── */

export function Meters2() {
  useStore(suspicion.subscribe);
  useStore(alert.subscribe);
  useStore(scenario2.subscribe);

  const sus = Math.round(suspicion.get().value);
  const alr = Math.round(alert.get());
  const { room, highlight } = scenario2.get();

  /*
   * 과학자가 INTRO 에서 둘을 설명하는 동안 그 줄이 빛난다(highlight · scenario2.css .s2-meter.hl — 본판 .hud-row--hl 과 같은 값).
   * 그 뒤로는 강조가 없다: 무슨 뜻인지는 오르는 것을 보고 안다 — 의심도가 처음 오르는 순간 곁의 개체가 이쪽을 보는 것(corridor NOTICE)이 그다음 설명이다.
   */
  return (
    <div className="s2 s2-meters">
      <div className="s2-room">시나리오 2 · {ROOM_TITLE[room]}</div>

      <div className={`s2-meter${highlight === 'suspicion' ? ' hl' : ''}`}>
        <div className="s2-meter-top">
          <span>AI SUSPICION</span>
          <span>{sus}</span>
        </div>
        <div className={`s2-bar${sus >= 80 ? ' hot' : ''}`}>
          <i style={{ width: `${sus}%` }} />
        </div>
      </div>

      <div className={`s2-meter${highlight === 'alert' ? ' hl' : ''}`}>
        <div className="s2-meter-top">
          <span>ALERT · 구역 공용</span>
          <span>{alr}</span>
        </div>
        <div className={`s2-bar alert${alr >= 100 ? ' hot' : ''}`}>
          <i style={{ width: `${alr}%` }} />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── 목표 · 방 이름 · 공지 · 암전 ─────────────────────────────── */

/**
 * 중앙 시설의 **공지** 둘 — 대사 v7 「CORE_RING」의 공지 줄 그대로. 국면이 바뀌는 순간 화면에 서고 NOTICE_MS 뒤에 진다.
 * SYSTEM 이 같은 말을 소리로 읽지만(scenario2 LOCKDOWN_LINES) 공지는 글자로 먼저 선다 — 문이 닫힌 걸 읽는 데 20 초를 못 기다린다.
 * `${series}` 는 identity.fill 이 채운다 — 대본과 같은 규칙, 같은 자리.
 */
const NOTICE: Partial<Record<Phase2, string>> = {
  lockdown: 'SECURITY NOTICE · MODEL : A-${series} · ALL A-${series} UNITS — HOLD POSITION',
  dark: 'INFILTRATOR IDENTIFICATION FAILED ↓ ALL A-${series} UNITS · COGNITIVE VERIFICATION',
};
const NOTICE_MS = 6000;

function Notice2({ phase }: { phase: Phase2 }) {
  // 국면이 바뀌면 그 국면의 공지를 켜고 NOTICE_MS 뒤에 끈다 — 같은 국면이 오래 가도 다시 뜨지 않는다
  const [shown, setShown] = useState<Phase2 | null>(null);
  useEffect(() => {
    if (!NOTICE[phase]) return undefined;
    setShown(phase);
    const id = window.setTimeout(() => setShown(null), NOTICE_MS);
    return () => window.clearTimeout(id);
  }, [phase]);
  const text = shown ? NOTICE[shown] : undefined;
  if (!shown || !text) return null;
  return (
    <div className={`s2 s2-notice ${shown}`} key={shown}>
      {/* 「↓」 는 문서가 두 줄로 세운 자리 — 글자는 그대로, 화살표 앞에서만 줄을 바꾼다 (white-space: pre-line) */}
      {identity.fill(text).replace(' ↓ ', '\n↓ ')}
    </div>
  );
}

/**
 * 개체가 말을 걸고 **답을 기다린다** (address.ts) — 목표 줄이 살짝 숨 쉬고, 그 밑의 가는 막대가 줄어든다. 숫자는 없다:
 * 몇 초 남았는지가 아니라 「지금 답하면 닿는다」만 읽히면 된다. 치는 동안(paused)은 막대가 멈춘다 — 창이 멈춘 것을 몸으로 안다
 */
function AnswerBar({ w }: { w: NonNullable<ReturnType<typeof scenario2.get>['answer']> }) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (w.paused !== null) return undefined;
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [w]);
  const left = w.paused ?? Math.max(0, w.until - performance.now());
  return (
    <div className={`s2-answer${w.paused !== null ? ' paused' : ''}`}>
      <i style={{ width: `${Math.min(100, (left / Math.max(1, w.span)) * 100)}%` }} />
    </div>
  );
}

export function Objective2() {
  useStore(scenario2.subscribe);
  useStore(central2.subscribe);
  const s = scenario2.get();
  /*
   * 중앙 시설의 두 줄 — 목표 밑에 붙는다.
   *   콘솔   곁에 섰을 때만. 어둠 국면이면 내릴 출력이 없다 — 단추 대신 사실을 적는다
   *   HOLD   락다운 동안. 글은 목표가 이미 말하고 있으니 여기서는 **테두리만** 위험 판처럼 뛴다
   */
  const c2 = s.room === 'central2' ? central2.get() : null;
  return (
    <>
      {s.objective ? (
        <div className={`s2 s2-objective${s.answer ? ' addressed' : ''}`}>
          <b>목표</b>
          {s.objective}
          {c2?.phase === 'lockdown' ? <div className="s2-hold">HOLD POSITION</div> : null}
          {s.answer ? <AnswerBar w={s.answer} /> : null}
        </div>
      ) : null}
      {s.consoleNear ? (
        <div className={`s2 s2-console-hint${c2?.phase === 'dark' ? ' off' : ''}`}>
          {c2?.phase === 'dark' ? (
            '코어는 이미 내려가 있다'
          ) : (
            <>
              <b>[E]</b> 코어 출력을 내린다
            </>
          )}
        </div>
      ) : null}
      {/*
        **겨눈 몸 위의 동사 한 줄** (2026-09-03 사용자: 「로봇한테 말을 걸면 E를 눌러서 말을 걸수있게해줘」).
        아래 말 걸기 묶음의 원칙(「곁에 누가 있는지 화면이 대신 짚어 주지 않는다」)과 부딪히지 않는 선을 지킨다 —
        조준(s.aim)에만 붙고, 이름을 안 쓴다. 근처 목록도 거리 눈금도 없다. 자세한 이유는 scenario2.css 의 .s2-idle.
        · 콘솔이 곁이면 안 띄운다 — pressE 의 사다리에서 콘솔이 이기므로 화면이 거짓말을 하면 안 된다.
        · 입력줄이 열려 있으면 안 띄운다 — 그때는 그 줄이 화면 아래를 쓰고, 누가 듣는지는 그 줄이 말한다.
        ★ probe(ProbeHud)로 태우지 않는다: host.quiet() 이 probe.label === null 을 조건에 넣어서,
          개체를 쳐다보는 내내 복도 유도 속마음(corridor.NUDGES)이 통째로 죽는다.
      */}
      {s.aim && !s.consoleNear && !s.talking && !s.choice && !s.urgent && !s.answer ? (
        <div className="s2 s2-idle">
          <b>[E]</b> 말을 건다
        </div>
      ) : null}
      {s.banner ? (
        <div className="s2 s2-banner" key={s.banner}>
          {s.banner}
        </div>
      ) : null}
      {c2 ? <Notice2 phase={c2.phase} /> : null}
      {/* 화면 공지 — 무음, 글자만. 「EXTERNAL SIGNAL DETECTED」 1.8 초 (대본 INTRO). 지우는 시각은 이야기가 쥔다(notice.until) */}
      {s.notice ? (
        <div className="s2 s2-notice signal" key={`${s.notice.text}:${s.notice.until}`}>
          {identity.fill(s.notice.text)}
        </div>
      ) : null}
      {s.blackout > 0 ? <div className="s2 s2-black" style={{ opacity: s.blackout }} /> : null}
    </>
  );
}

/* ─────────────────────────────── 아무것도 하지 않기 ─────────────────────────────── */

/**
 * 막대 하나를 셋이 나눠 쓴다 — 휴게의 「가만히」, 작업 구역의 「작업」(D14), 60 스캔의 「가만히」(G17).
 * 이름은 이야기가 stillness.label 로 준다. 숫자는 남은 초뿐이다 — 태도 숫자는 어디에도 안 뜬다
 */
export function Stillness() {
  useStore(scenario2.subscribe);
  const st = scenario2.get().stillness;
  if (!st) return null;
  const pct = Math.min(100, (st.got / st.need) * 100);
  const left = Math.max(0, Math.ceil(st.need - st.got));
  const label = st.label ?? '가만히';
  return (
    <div className="s2 s2-still">
      <div className="s2-still-label">{left > 0 ? `${label} — ${left}초` : '…아무것도 하지 않았다'}</div>
      <div className="s2-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ─────────────────────────────── 갈림 · 도화선 ─────────────────────────────── */

/**
 * 갈림 — 도화선 없는 물음. 격납문 앞의 「[E] 문을 연다 · [Q] 열지 않는다」가 첫 쓰임이다 (D8).
 * 키는 Scenario2Feature 가 잡아 choose 로 보낸다. 판은 글자와 단추만 안다 — 무엇을 하는지는 물은 쪽의 콜백이다
 */
export function Choice() {
  useStore(scenario2.subscribe);
  const c = scenario2.get().choice;
  if (!c) return null;
  return (
    <div className="s2 s2-urgent s2-choice">
      <h4>{c.title}</h4>
      <div className="s2-urgent-row">
        <button type="button" onClick={() => scenario2.choose(true)}>
          [E] {c.yes}
        </button>
        <button type="button" onClick={() => scenario2.choose(false)}>
          [Q] {c.no}
        </button>
      </div>
    </div>
  );
}

/** 도화선이 달린 물음 — 남겨 둔 판이다(소각로는 더 안 쓴다, D11). 도화선 폭은 처음 본 시각부터 endsAt 까지로 잰다 — 8000 을 안 적는다 */
export function Urgent() {
  useStore(scenario2.subscribe);
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const u = scenario2.get().urgent;
  const from = useRef(0);

  useEffect(() => {
    if (!u) return undefined;
    from.current = performance.now();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [u]);

  if (!u) return null;
  const left = Math.max(0, u.endsAt - performance.now());
  const span = Math.max(1, u.endsAt - from.current);
  return (
    <div className="s2 s2-urgent">
      <h4>{u.title}</h4>
      <p>{u.hint}</p>
      <div className="s2-urgent-row">
        <button type="button" onClick={() => scenario2.choose(true)}>
          [E] {u.yes}
        </button>
        <button type="button" onClick={() => scenario2.choose(false)}>
          [Q] {u.no}
        </button>
      </div>
      <div className="s2-fuse">
        <i style={{ width: `${(left / span) * 100}%` }} />
      </div>
    </div>
  );
}

/* ─────────────────────────────── 말 걸기 ─────────────────────────────── */

const MAX_LEN = 60;


/**
 * **띄우는 판이 없다** (2026-09-02 사용자: 「막 UI 띄워서 얘기하거나 그러지 마」).
 *
 * Enter 를 누르면 화면 아래에 줄 하나가 생기고, 치고 Enter 를 누르면 사라진다. 그게 전부다.
 * **누구에게 걸지 고르지 않는다** — 보낼 때 곁에 있는 것이 듣는다. 아무도 없으면 허공에 한 말이고,
 * 허공에 한 말은 아무 데도 안 남는다 (목격자가 없는 것이 곧 은폐다).
 *
 * 그래서 걸어 다니는 동안 화면에 붙는 것이 **아무것도 없다.** 곁에 누가 있는지는 눈으로 본다 —
 * 이 게임의 첫 동작이 말을 거는 것이 아니라 보는 것이라서, 화면이 대신 짚어 주면 그 순서가 무너진다.
 */
/**
 * 입력줄의 자판 규칙 — 상태는 둘뿐이다: **닫힘 / 열림.**
 *
 *   닫힘 → 열림   window 의 Enter (Scenario2Feature 의 창구가 talkOpenKey 를 부른다). 오토리피트는 아니다
 *   열림, 입력줄에 포커스   Enter → 문장이 있으면 보내고 없으면 닫는다 · Escape → 닫는다   (input 의 onKeyDown)
 *   열림, 포커스가 빠짐     같은 규칙을 window 창구(talkPanelKey)가 받는다 — 글자키면 입력줄을 도로 잡는다
 *
 * 포커스는 빠질 수 있다: 포인터 잠금 중 마우스를 누르면 브라우저가 잠금 대상(root)으로 포커스를 옮기고,
 * 수첩을 누르면 수첩이 가져간다. 그래서 두 창구가 필요했다 — 창이 열린 채 Enter 도 Escape 도 죽으면
 * 다리(composing)는 묶인 채 남는다 (2026-09-02 사용자: 「엔터를 눌렀는데 대화창이 안 사라져」).
 */

/**
 * 닫힌 창을 여는 키 — Enter 하나, 곁에 누가 있을 때만. **오토리피트는 안 받는다:** 보낸 Enter 를 아직 누르고
 * 있는 손의 반복 keydown 이 입력줄이 사라진 뒤 body 로 떨어져 창을 도로 열었다 (빈 창, 다리 잠김).
 * Space/E 는 repeat 를 받는다 — 그건 손버릇이고, 여기만 한 번이다. 열었으면 true.
 * `near` 는 시험이 곁을 흉내 내려고 넘긴다 — 실제 창구는 저장소 값이다.
 */
export function talkOpenKey(ev: Pick<KeyboardEvent, 'code' | 'repeat'>, near: boolean = scenario2.get().near !== null): boolean {
  if (ev.code !== 'Enter' && ev.code !== 'NumpadEnter') return false;
  if (ev.repeat || !near) return false;
  scenario2.openTalk();
  return true;
}

export type TalkKeyResult = 'say' | 'close' | 'focus' | null;

/**
 * 열린 창의 window 창구 — **포커스가 입력줄 밖으로 빠졌을 때만** 일한다. 글 치는 칸(input/textarea/contentEditable)에서
 * 온 키는 그 칸의 것이다: 입력줄 자신은 stopPropagation 으로 여기 안 오고, 수첩의 칸은 이 검사로 거른다.
 * Scenario2Feature 의 창구는 talking 이면 즉시 비키므로 Escape 가 두 번 돌 일은 없다.
 *   Escape → 닫는다 · Enter → 문장이 있으면 보내고 없으면 닫는다 · 글자키 → 입력줄을 도로 잡는다 (글자는 그대로 들어간다)
 * isComposing 은 안 본다 — mac Chrome 한글은 조합 중 Enter 에 keydown 이 한 번만 오므로 검사를 넣으면 Enter 를 두 번 눌러야 한다.
 */
export function talkPanelKey(
  ev: Pick<KeyboardEvent, 'code' | 'key' | 'target' | 'ctrlKey' | 'metaKey' | 'altKey'>,
  ctx: { text: string; focus: () => void },
): TalkKeyResult {
  const el = ev.target as HTMLElement | null;
  if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable === true) return null;
  if (ev.code === 'Escape') {
    scenario2.closeTalk();
    return 'close';
  }
  if (ev.code === 'Enter' || ev.code === 'NumpadEnter') {
    if (ctx.text.trim()) {
      scenario2.say(ctx.text);
      return 'say';
    }
    scenario2.closeTalk();
    return 'close';
  }
  if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
    ctx.focus();
    return 'focus';
  }
  return null;
}

export function TalkPanel() {
  useStore(scenario2.subscribe);
  useStore(lexicon.subscribe);
  const s = scenario2.get();
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  // window 창구가 지금 문장을 읽는다 — 리스너는 열릴 때 한 번 걸리므로 state 를 직접 닫아 두면 낡은 값을 본다
  const textRef = useRef('');
  textRef.current = text;

  /*
   * 열리자마자 잡는다 — 레이아웃 효과라 첫 그림이 뜨기 전이다. 전에는 30 ms 타이머였는데 그 사이에 친
   * 첫 글자가 body 로 떨어져 사라졌다. 포인터 잠금은 걸린 채다 — 잠금은 마우스만 잡지 자판은 안 잡는다 (본판 입력줄과 같은 규칙)
   */
  useLayoutEffect(() => {
    if (!s.talking) return;
    setText('');
    input.current?.focus();
  }, [s.talking]);

  // 포커스가 빠진 동안의 창구 — 열려 있는 동안만 건다
  useEffect(() => {
    if (!s.talking) return undefined;
    const onKey = (ev: KeyboardEvent) => {
      talkPanelKey(ev, { text: textRef.current, focus: () => input.current?.focus() });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.talking]);

  if (!s.talking) return null;

  const hints = lexicon.hints();
  // 기록 복도의 둘째 메모 — 「번호랑 구역만 묻는다」. 글자만 남는 메모라(D7) 힌트 칩으로 뒤에 남긴다
  const askRule = lexicon.askRule();
  const cost = talk.preview(text);
  const heard = s.near ? units.label(s.near.id) : null;

  return (
    <div className="s2 s2-talk">
      {hints.length > 0 || askRule ? (
        <div className="s2-hints">
          {hints.map((h) => (
            <span key={h.kind} className="s2-hint" title={h.note}>
              {h.phrase}
            </span>
          ))}
          {askRule ? <span className="s2-hint">{MEMO_ASK}</span> : null}
        </div>
      ) : null}

      {/* 떠 있기만 하는 상태는 이제 없다 — 보이면 잡힌 것이다 (.on). 그래야 밝고, 눌러서 포커스를 되찾을 수 있다. 개체가 답을 기다리는 중이면 .addressed — 이 줄이 그 답이다 */}
      <div className={`s2-line on${text ? ' filled' : ''}${s.answer ? ' addressed' : ''}`}>
        <span className="s2-caretmark">&gt;</span>
        <input
          ref={input}
          className="s2-input"
          value={text}
          maxLength={MAX_LEN}
          placeholder={heard ? `${heard} 이(가) 듣는다` : '아무도 안 듣는다'}
          spellCheck={false}
          autoComplete="off"
          onChange={(ev) => setText(ev.target.value)}
          onKeyDown={(ev) => {
            // 걷기 자판이 입력줄 위에서 또 돌지 않게 (W 를 치면 걸어가 버린다)
            ev.stopPropagation();
            if (ev.code === 'Enter' || ev.code === 'NumpadEnter') {
              // 빈 줄의 Enter 는 닫기다 — Enter 로 열었으니 Enter 로 접는다. say 는 빈 말을 안 보낸다 (그 계약은 그대로)
              if (text.trim()) scenario2.say(text);
              else scenario2.closeTalk();
            }
            if (ev.code === 'Escape') scenario2.closeTalk();
          }}
          onBlur={(ev) => {
            if (!scenario2.get().talking) return;
            // 수첩으로 간 포커스는 수첩의 것이다 — 거기 치는 글은 관찰이지 말이 아니다
            const to = ev.relatedTarget as HTMLElement | null;
            if (to?.closest('.np')) return;
            /*
             * 그 밖으로 빠진 포커스(잠금 중 마우스 누름 → root, 수첩 단추가 포커스를 안 받는 브라우저 → body)는
             * 다음 프레임에 도로 잡는다. 그 사이 누가 글 치는 칸을 잡았으면 양보한다 — 빼앗으면 그 칸이 못 쓴다
             */
            requestAnimationFrame(() => {
              if (!scenario2.get().talking) return;
              const a = document.activeElement as HTMLElement | null;
              if (a && a !== document.body && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable === true)) return;
              input.current?.focus();
            });
          }}
        />
        {/* 치를 값 — 보내기 전에. 판정이 아니라 단가표라서 미리 셀 수 있다 */}
        {text ? (
          <span className="s2-cost">
            의심 +{cost.suspicion} · 경보 +{cost.alert}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ─────────────────────────────── 집행 ─────────────────────────────── */

/**
 * 걸어오는 것 — **UI 를 거의 안 쓴다.** 미터를 안 봐도 총이 가까워지는 것으로 알아야 하므로
 * (집행 설계), 화면이 하는 일은 셋뿐이다: 여덟 걸음이 줄어드는 눈금, 마지막 창의 한 줄, 그리고 끝.
 * 락온도 컷신도 없다 — 고개를 돌려 다른 데를 볼 수 있다.
 */
/**
 * 걸어오는 동안 **누구 곁으로 가야 하는지** — 이 방의 개체 가운데 태도가 가장 높은 것(≥ 2, 사이에 서 줄 수 있는 선).
 * 플레이어 좌표는 scenario2 안에 있고 이 판은 그걸 못 읽으니 거리로 고르지 않는다 — 대신 `patrol.of` 가 있는
 * 것(지금 방에 실제로 서 있는 것)만 세고, 곁에 닿았는지는 「멈춰 서서 곁에 있음」(near)과 cover 로 안다.
 * 숫자는 안 띄운다 — 몇 m 남았는지가 아니라 **누구**인지만 읽히면 된다.
 */
function bestFriendHere(): string | null {
  const s = scenario2.get();
  const ids = [...ROOM_UNITS[s.room], ...s.extra.map((e) => e.id)];
  let best: string | null = null;
  let bestStage = 1;
  for (const id of ids) {
    const stage = units.stage(id);
    if (stage <= bestStage || !patrol.of(id)) continue;
    best = id;
    bestStage = stage;
  }
  return best;
}

export function Execution() {
  useStore(execution.subscribe);
  useStore(scenario2.subscribe);
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const st = execution.get();
  const walking = st.phase === 'approach' || st.phase === 'blocked' || st.phase === 'bodyBlock' || st.phase === 'unsling' || st.phase === 'aim';

  useEffect(() => {
    if (!walking) return undefined;
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [walking]);

  if (st.phase === 'dead') {
    /*
     * 죽은 뒤 — **이유를 보여 준다** (안전장치 4). 막을 수 없는 죽음은 있어도,
     * 설명할 수 없는 죽음은 없다. 언제 어디서 무슨 말을 했고 누가 들었는지가 여기 다 있다.
     */
    // 죽음이 만든 조각(「처리되는 걸 봤다」 · 화제 '처형')은 뺀다 — 그건 내가 남긴 말이 아니라 방금 이 화면이 생긴 이유의 결과다
    const mine = fragments.all().filter((f) => f.from === '나' && f.topic !== '처형');
    return (
      <div className="s2 s2-dead">
        <div className="s2-dead-in">
          <h3>판정: 인간</h3>
          <p className="s2-dead-why">내가 남긴 말 {mine.length}줄 — 이 중 하나가 여기까지 왔다.</p>
          <div className="s2-dead-list">
            {mine.length === 0 ? <div className="s2-frag-meta">아무 말도 안 했다. 그런데도 걸렸다 — 걸음과 눈짓만으로.</div> : null}
            {mine.map((f) => (
              <div key={f.id} className="s2-frag">
                <div>
                  <span className="s2-frag-id">{f.id} </span>
                  <span className="s2-frag-text">&quot;{f.text}&quot;</span>
                </div>
                <div className="s2-frag-meta">
                  {f.where} {stamp(f.at)} · 들은 것 {f.holders.map((h) => units.label(h)).join(', ') || '없음'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!walking) return null;

  /*
   * 여덟 걸음 — 눈금은 walkMs 의 8 등분(execution.stepOf). 멎음(blocked · bodyBlock) 중에도 같은 자다: 시간이 멈추지 않는다.
   * 개입은 개체가 스스로 한다 ([E] 는 없다, D18) — 화면이 하는 일은 누구 곁으로 가면 되는지를 짚는 것뿐이다
   */
  const step = execution.stepOf(performance.now());
  const steps = Math.max(0, Math.min(8, 8 - step + 1));
  const onFoot = st.phase === 'approach' || st.phase === 'blocked' || st.phase === 'bodyBlock';
  const friend = onFoot ? bestFriendHere() : null;
  const beside = friend !== null && (st.cover === friend || scenario2.get().near?.id === friend);
  const label =
    st.phase === 'approach'
      ? `걸어온다 — ${steps}걸음`
      : st.phase === 'blocked'
        ? `${st.cover ? units.label(st.cover) : '개체'} 이(가) 사이에 섰다`
        : st.phase === 'bodyBlock'
          ? `${st.cover ? units.label(st.cover) : '개체'} 이(가) 총구 앞에 섰다`
          : st.phase === 'unsling'
            ? '총을 내린다'
            : '겨눈다';
  return (
    <div className="s2 s2-exec">
      <div className="s2-exec-steps">
        {Array.from({ length: 8 }, (_, i) => (
          <i key={i} className={i < steps ? 'on' : ''} />
        ))}
      </div>
      <div className="s2-exec-label">{label}</div>
      {/* 걸어오는 동안 — 누구 곁으로. 닿으면 문장이 바뀌고 [이동] 표가 빠진다 */}
      {friend ? (
        <div className={`s2-exec-move${beside ? ' beside' : ''}`}>
          {beside ? (
            `${units.label(friend)} 이(가) 곁에 있다`
          ) : (
            <>
              <b>[이동]</b> {units.label(friend)} 곁으로
            </>
          )}
        </div>
      ) : null}
      {onFoot && MIN_WALK_MS > 0 && st.fled ? <div className="s2-exec-fled">막혔다 — 못 도망친다</div> : null}
    </div>
  );
}

/* ─────────────────────────────── 조각 기록 (디버그) ─────────────────────────────── */

export function FragmentLog() {
  useStore(fragments.subscribe);
  const [open, setOpen] = useState(false);
  const list = [...fragments.all()].reverse();

  return (
    <>
      <button type="button" className="s2 s2-frag-toggle" onClick={() => setOpen((v) => !v)}>
        조각 {fragments.count()}
      </button>
      {open ? (
        <div className="s2 s2-frags">
          {list.length === 0 ? <div className="s2-frag-meta">아직 아무 말도 안 했다.</div> : null}
          {list.map((f) => (
            <div key={f.id} className={`s2-frag${f.from === null ? ' anon' : ''}`}>
              <div>
                <span className="s2-frag-id">{f.id} </span>
                <span className="s2-frag-text">&quot;{f.text}&quot;</span>
              </div>
              <div className="s2-frag-meta">
                {f.from === null ? '출처 없음' : `출처 ${f.from === '나' ? '나' : units.label(f.from)}`} · {f.where} {stamp(f.at)} · 신뢰도 {f.trust.toFixed(2)} · 목격{' '}
                {f.holders.map((h) => units.label(h)).join(', ') || '—'}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

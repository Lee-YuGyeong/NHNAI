/**
 * 살아 있는 콘솔 — 로비를 **웹 페이지가 아니라 켜져 있는 기계**로 만드는 부품들.
 *
 * ┌─ 무엇이 부족했나 (2026-08-30) ───────────────────────────────────────────┐
 * │ 모양(모따기 · 주사선 · 청록 테)은 이미 게임의 것이었는데, 화면이          │
 * │ **아무 것도 안 하고 있었다.** 시간도 안 가고, 방금 뭘 눌렀는지 아무 데도  │
 * │ 안 남고, 방에 붙는 동안에도 대기방은 그냥 비어 있었다.                    │
 * │                                                                          │
 * │   시간   구역 시계가 1초마다 돈다 (2098년)                                │
 * │   기록   내가 한 조작이 로그로 쌓인다 — **진짜 있었던 일만** 적는다        │
 * │   접속   대기방에 붙는 동안 링크 시퀀스가 뜬다 (진짜 이벤트에 맞춰 켜진다) │
 * │   진입   시작 방송이 오면 카운트다운을 세고 넘어간다 (방 전원이 동시에)    │
 * │   신원   요원 카드가 신분증이 된다 (닉네임 · 지문 · 상태)               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ★ **지어낸 것을 움직이지 않는다.** 「접속자 1,204명」 같은 가짜 지표나 저 혼자 흐르는
 *   구역 통신 로그를 넣으면 화면은 확실히 그럴듯해진다. 그런데 이 저장소는 없는 승패를
 *   지어내지 않기로 한 판이다 (rooms.ts · HistoryPanel 머리말). 그래서 여기서 움직이는
 *   것은 셋뿐이다 — **시계**(진짜 시계다), **내 조작**(내가 진짜로 했다),
 *   **방의 사건**(서버가 진짜로 보냈다).
 *
 * ★ 소리는 여기서 만들지 않는다. 누르는 소리도 사건의 소리도 **shared/sfx.ts** 한 곳이
 *   맡는다 (App 에 걸린 shared/UiSfx 의 위임). 이 파일은 그중 카운트다운의 박자만 빌려 쓴다 —
 *   같은 화면에 소리 내는 장치가 둘이면 볼륨 손잡이도 둘이 된다.
 *
 * 스타일은 lobby.css 가 아니라 **live.css** 에 따로 둔다. 이유는 그 파일 머리말에 적었다.
 */

import { useEffect, useCallback, useRef, useState, type ReactNode } from 'react';
import { ZONE_YEAR } from '@/shared/era';
import { playSfx } from '@/shared/sfx';
import { Panel } from './console';
import './live.css';

/* ═══════════════════════════════ 조용한 묶음 ═══════════════════════════════ */

/**
 * 테를 두르지 않는 곁다리 묶음 (2026-08-31 사용자: "디자인 너무 똑같은 것만 많은 거 아니야?").
 *
 * ┌─ 무엇이 똑같았나 ────────────────────────────────────────────────────────┐
 * │ 로비 한 화면에 **테 두른 판이 넷**이었다 — 요원 · 최근 방 · 열린 방 ·     │
 * │ 기록. 넷 다 같은 모따기, 같은 청록 1px 테, 같은 이름표였다. 게다가 그      │
 * │ 재질(.bl-edge)은 판만 쓰는 게 아니라 버튼 · 입력칸 · 방 한 줄 · 좌석까지   │
 * │ 열일곱 군데가 같이 쓴다. 그래서 **읽을 것과 누를 것이 같아 보이고**,       │
 * │ 본문(열린 방)과 곁다리(요원 · 최근 방)가 같은 무게로 선다 — 눈이 어디부터  │
 * │ 봐야 할지 정할 근거가 화면에 없다.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ★ 고치는 방향은 **재질을 하나 더 만드는 것이 아니라 쓰는 곳을 줄이는 것**이다.
 *   새 테를 발명하면 똑같은 것이 넷에서 다섯이 될 뿐이다. 곁다리에서 테를 걷으면
 *   테 두른 상자가 화면에 **하나**만 남고, 그 하나가 저절로 주인공이 된다.
 *
 * 남는 것은 라벨 한 줄과 위쪽 가는 선뿐이다 — 묶음이라는 것만 말하고 물러선다.
 */
export function Quiet({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bl-quiet">
      <span className="bl-quiet__tab">{title}</span>
      {children}
    </section>
  );
}

/* ═══════════════════════════════ 구역 시계 ═══════════════════════════════ */

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 구역 시각. **내 시계에서 연도만 갈아 끼운 값이다** — 월·일·시·분·초는 진짜 지금이다.
 *
 * 시각을 통째로 지어내지 않는 이유: 옆에 놓인 「3분 전」(최근 방)과 어긋나면 둘 중 하나는
 * 거짓말이 된다. 연도 하나만 옮기면 **내 시간 위에 이야기가 얹힌다** — 밤에 접속한 사람은
 * 구역에서도 밤이다.
 */
export function zoneStamp(now: Date): string {
  return `${ZONE_YEAR}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/** 1초마다 도는 시계. 멈춘 숫자는 그림이지만 도는 숫자는 기계다 */
export function ZoneClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="bl-clock bl-mono" aria-label={`구역 시각 ${zoneStamp(now)}`}>
      <i aria-hidden />
      {zoneStamp(now)}
    </span>
  );
}

/* ═══════════════════════════════ 한 자씩 찍기 ═══════════════════════════════ */

/** 한 글자에 드는 시간. 한글은 한 자가 한 낱말만큼 무거워서 로마자보다 느리게 찍어야 읽힌다 */
const TYPE_MS = 42;
/** 마침표 · 말줄임의 점 하나. **여기서 뜸을 들인다** — 이 게임의 문장은 점에서 숨을 쉰다 */
const TYPE_DOT_MS = 190;
/** 줄을 바꾸기 전. 한 호흡 쉬어야 두 줄이 두 문장으로 읽힌다 */
const TYPE_BR_MS = 380;

/**
 * 한 조각. 글자 그대로거나, 흐린 글자(.dim)거나, 강조(em)거나, 줄바꿈이다.
 * 원래 마크업이 `2098. <span className="dim">…</span><br/>` 과
 * `누가 <em>인간</em>인가?` 였으니 이 넷이면 다 적는다 — em 은 이 화면에서 **하나뿐인
 * 따뜻한 색**(앰버)이라 태그를 그대로 내야 lobby.css 의 규칙이 걸린다.
 */
export type TypedPart = string | { dim: string } | { em: string } | 'br';

const partText = (p: TypedPart): string => (p === 'br' ? '\n' : typeof p === 'string' ? p : 'dim' in p ? p.dim : p.em);

/**
 * 제목이 **한 자씩 찍힌다** (2026-08-30 사용자 지시).
 *
 * ┌─ 왜 이게 화면을 게임으로 만드나 ─────────────────────────────────────────┐
 * │ 다 적힌 글은 **문서**고, 지금 적히는 글은 **누가 보내는 전문**이다.       │
 * │ 브리핑 화면의 제목이 찍히기 시작하면 읽는 사람은 자동으로 기다리게 되고,  │
 * │ 그 몇 초가 「이 구역에 방금 접속했다」는 느낌을 만든다. 로비의 다른 것들과 │
 * │ 같은 수법이다 — 접속 시퀀스도 카운트다운도 **기다림을 보여 주는 장치**다. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 지키는 것 ──────────────────────────────────────────────────────────────┐
 * │ 낭독기는 다 적힌 글을 **한 번에** 읽는다 (.bl-sr 에 통글이 들어 있고,     │
 * │   찍히는 쪽은 aria-hidden 이다). 한 글자씩 읽어 주는 화면은 고문이다.     │
 * │ 모션을 꺼 둔 사람에게는 **처음부터 다 적혀 있다** — 효과만 빠지고 글은    │
 * │   그대로다.                                                              │
 * │ **자리를 처음부터 다 잡는다.** 다 적힌 글을 보이지 않게 한 벌 깔고        │
 * │   (.bl-typed__ghost) 그 위에 찍히는 글을 겹친다 — 아래를 보라.            │
 * │ 화면에 들어왔을 때 시작한다 (start) — 안 보이는 데서 혼자 다 찍고 있으면  │
 * │   굴려서 왔을 때는 그냥 적혀 있는 글이다.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ 글자가 움직이던 것 (2026-08-30 사용자: "이게 생기면서 글자가 움직여") ──┐
 * │ br 만 미리 넣어 두면 **줄 수**는 지켜지지만 **줄의 길이**는 안 지켜진다.  │
 * │ 「AI만 출입할 수 있는 구역이 생겼다...」 는 큰 글자라, 찍히다가 어느       │
 * │ 순간 한 줄에서 두 줄로 접힌다 — 그때 제목이 한 줄만큼 키를 키우고,        │
 * │ .bl-scene 이 align-content: space-between 이라 그 아래 전부가 한꺼번에    │
 * │ 밀린다. 커서가 붙었다 떨어지는 것만으로도 줄 끝이 흔들린다.               │
 * │                                                                          │
 * │ 그래서 **다 적힌 글을 한 벌 먼저 깐다.** 안 보이지만(visibility:hidden)   │
 * │ 자리는 차지하므로 제목은 첫 프레임부터 마지막 크기다. 찍히는 글은 그      │
 * │ 위에 절대 위치로 겹친다 — 같은 폭에서 같은 규칙으로 접히니 글자가 어긋날  │
 * │ 일도 없다. 움직이는 것은 글자뿐이고 판은 처음부터 가만히 있는다.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * @param ms     한 글자에 드는 시간. **표지의 제목은 느리게 찍는다** — 본문 제목의 속도로
 *               치면 여덟 자가 0.3초에 끝나서 찍히는 줄도 모르고 지나간다. 제목은 문장이
 *               아니라 한 장면이라 또박또박 와야 한다.
 * @param onDone 다 찍힌 순간 한 번. 표지는 이걸 받아 **그 다음 것들을 올린다** (title sequence).
 */
export function Typed({
  parts,
  start = true,
  ms = TYPE_MS,
  onDone,
}: {
  parts: TypedPart[];
  start?: boolean;
  ms?: number;
  onDone?: () => void;
}) {
  const plain = parts.map(partText).join('');
  // jsdom 에는 matchMedia 가 없다 — 없으면 움직이는 쪽으로 둔다 (Intro.tsx 의 RoleSlides 와 같은 규칙)
  const still =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const [n, setN] = useState(0);

  useEffect(() => {
    if (!start) return;
    if (still) {
      setN(plain.length);
      return;
    }
    if (n >= plain.length) return;
    const ch = plain[n];
    const wait = ch === '\n' ? TYPE_BR_MS : ch === '.' ? TYPE_DOT_MS : ms;
    const t = setTimeout(() => setN((k) => k + 1), wait);
    return () => clearTimeout(t);
  }, [start, still, n, plain, ms]);

  const done = n >= plain.length;

  /** 조각 하나를 글자 그대로 그린다. 유령(다 적힌 한 벌)과 잉크(찍히는 글)가 같이 쓴다 */
  const draw = (p: TypedPart, i: number, text: string): ReactNode => {
    if (p === 'br') return <br key={`b${i}`} />;
    if (typeof p === 'string') return <span key={i}>{text}</span>;
    if ('dim' in p)
      return (
        <span key={i} className="dim">
          {text}
        </span>
      );
    return <em key={i}>{text}</em>;
  };

  /*
   * 다 찍혔다고 알린다 — **한 번만.** 콜백이 매 렌더 새로 와도 다시 부르면 안 되고(ref),
   * 이미 알린 뒤에 다시 알리면 표지가 두 번 올라온다(fired).
   */
  const doneCb = useRef(onDone);
  doneCb.current = onDone;
  const fired = useRef(false);
  useEffect(() => {
    if (!done || fired.current) return;
    fired.current = true;
    doneCb.current?.();
  }, [done]);
  const nodes: ReactNode[] = [];
  let end = 0;
  let caret = false;
  parts.forEach((p, i) => {
    const text = partText(p);
    const from = end;
    end += text.length;
    if (p === 'br') {
      nodes.push(draw(p, i, text));
    } else {
      const shown = text.slice(0, Math.max(0, Math.min(text.length, n - from)));
      if (shown) nodes.push(draw(p, i, shown));
    }
    // 커서는 **지금 찍고 있는 조각 뒤**에 선다 — 늘 맨 끝에 두면 아직 안 온 줄에서 깜빡인다
    if (!caret && !done && n <= end) {
      nodes.push(<i key={`c${i}`} className="bl-caret" aria-hidden />);
      caret = true;
    }
  });

  return (
    <span className="bl-typed">
      {/* 낭독기 몫 — 통글 한 번 (파일 머리말) */}
      <span className="bl-sr">{plain}</span>
      {/* 자리를 잡는 유령. 안 보이되 처음부터 마지막 크기다 */}
      <span className="bl-typed__ghost" aria-hidden>
        {parts.map((p, i) => draw(p, i, partText(p)))}
      </span>
      {/* 그 위에 겹치는 잉크. 같은 폭이라 같은 자리에서 접힌다 */}
      <span className="bl-typed__ink" aria-hidden>
        {nodes}
      </span>
    </span>
  );
}

/* ═══════════════════════════════ 구역 로그 ═══════════════════════════════ */

/** 로그가 들고 있는 줄 수. 넘치면 오래된 것부터 버린다 — 여기는 기록소가 아니라 창이다 */
const LOG_MAX = 40;

export interface LogLine {
  id: number;
  at: number;
  text: string;
  /** 'go' 는 넘어간 일, 'warn' 은 막힌 일. 색만으로 말하지 않게 글도 같이 적는다 */
  tone?: 'go' | 'warn';
}

/**
 * 이 화면에서 **실제로 일어난 일**을 적는 로그.
 *
 * 원작(humanish)에는 이런 판이 없다. 여기 새로 두는 이유는 하나다 — 로비에서 유일하게
 * 정직하게 움직일 수 있는 것이 「내가 방금 한 조작」이라서. 가짜 구역 통신을 흘리는 대신
 * 진짜 발자국을 적으면, 화면은 살아 있으면서 거짓말은 하지 않는다.
 */
export function useConsoleLog(): { lines: LogLine[]; log: (text: string, tone?: LogLine['tone']) => void } {
  const [lines, setLines] = useState<LogLine[]>([]);
  const seq = useRef(0);
  const log = useCallback((text: string, tone?: LogLine['tone']) => {
    seq.current += 1;
    const line: LogLine = { id: seq.current, at: Date.now(), text, tone };
    setLines((cur) => [...cur, line].slice(-LOG_MAX));
  }, []);
  return { lines, log };
}

export function SystemLog({ lines }: { lines: LogLine[] }) {
  const box = useRef<HTMLDivElement | null>(null);
  // 새 줄은 아래에 쌓인다 — 늘 마지막 줄이 보여야 방금 무슨 일이 있었는지 읽힌다
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <Panel title="구역 로그">
      <div className="bl-log" ref={box} role="log" aria-label="구역 로그" aria-live="off">
        {lines.length === 0 ? <p className="bl-note">기동 대기</p> : null}
        {lines.map((l) => (
          <p key={l.id} className={`bl-log__line${l.tone ? ` bl-log--${l.tone}` : ''}`}>
            <span className="bl-log__t">
              {pad(new Date(l.at).getHours())}:{pad(new Date(l.at).getMinutes())}:{pad(new Date(l.at).getSeconds())}
            </span>
            {l.text}
          </p>
        ))}
      </div>
    </Panel>
  );
}

/* ═══════════════════════════════ 세션 지문 ═══════════════════════════════ */

/**
 * 닉네임에서 뽑은 네 자리 지문 (FNV-1a).
 *
 * ★ 이것은 **신원이 아니다.** 같은 이름이면 같은 값이 나오는 순수 함수이고, 서버로 나가지도
 *   저장되지도 않는다 — 화면에만 뜬다. 정체와 얽힌 값을 클라이언트에 늘리지 않기 위해서다
 *   (PLANNING §3 I1: 이 값을 모으면 인간을 특정할 수 있는가 → 이름만으로 뽑히니 새 정보가 없다).
 *   하는 일은 하나다: 내 이름 옆에 **기계가 매긴 번호**를 붙여 신분증처럼 보이게 하는 것.
 */
export function sessionSig(nick: string): string | null {
  const s = nick.trim();
  if (!s) return null;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `SIG-${h.toString(16).toUpperCase().padStart(8, '0').slice(-4)}`;
}

/* ═══════════════════════════════ 링크 시퀀스 ═══════════════════════════════ */

/** 다 붙은 뒤 시퀀스가 남아 있는 시간. 마지막 줄이 켜지는 걸 보고 걷힌다 */
const BOOT_LINGER_MS = 700;
/** 이만큼 기다려도 응답이 없으면 **나가는 길을 연다** (아래 머리말) */
const BOOT_SLOW_MS = 5000;

/**
 * 대기방에 붙는 동안 뜨는 접속 시퀀스.
 *
 * ┌─ 왜 가짜 진행바가 아닌가 ────────────────────────────────────────────────┐
 * │ 세 줄이 켜지는 시점은 **진짜 사건**이다:                                  │
 * │   링크 요청  소켓을 연 순간 (이 화면이 마운트되면서 실제로 열었다)        │
 * │   구역 응답  서버의 welcome 이 도착한 순간                                │
 * │   좌석 배정  그 welcome 이 알려준 내 자리 번호 — 숫자까지 진짜다          │
 * │ 그래서 서버가 느리면 시퀀스도 느리다. 채워지는 시늉을 하는 막대가 아니라  │
 * │ **정말 기다리는 화면**이고, 그게 기다림을 견딜 만하게 만든다.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * 실패는 여기서 그리지 않는다 — 화면 본문의 붉은 줄(.bl-alert)이 이미 그 자리다.
 * 같은 사고를 두 군데서 말하면 어느 쪽을 읽어야 할지 모르게 된다.
 *
 * ┌─ 막이 사람을 가두면 안 된다 ─────────────────────────────────────────────┐
 * │ 소켓이 **에러도 안 내고 그냥 안 열리는** 경우가 있다 (워커가 안 떴을 때,  │
 * │ 프록시가 삼킬 때). 그러면 onError 도 onClose 도 안 오고 status 는 영영    │
 * │ 'connecting' 이라, 이 막이 화면을 덮은 채 안 걷힌다 — 나가는 버튼까지     │
 * │ 가려서 새로고침 말고는 길이 없다. 그래서 5초가 지나면 **막 안에** 돌아가는 │
 * │ 길과 짚이는 이유를 같이 낸다. 기다리는 것을 멈추지는 않는다 — 그 사이에   │
 * │ 응답이 오면 그대로 이어진다.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function LinkBoot({
  code,
  status,
  seat,
  onCancel,
}: {
  code: string;
  status: 'connecting' | 'in' | 'error';
  seat: number | null;
  onCancel: () => void;
}) {
  const [gone, setGone] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (status !== 'in') return;
    const t = setTimeout(() => setGone(true), BOOT_LINGER_MS);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    if (status !== 'connecting') return;
    const t = setTimeout(() => setSlow(true), BOOT_SLOW_MS);
    return () => clearTimeout(t);
  }, [status]);

  if (gone || status === 'error') return null;
  const linked = status === 'in';

  const steps: { label: string; value: string; on: boolean }[] = [
    { label: '링크 요청', value: `ROOM #${code}`, on: true },
    { label: '구역 응답', value: linked ? '확인' : '대기중…', on: linked },
    { label: '좌석 배정', value: seat === null ? '—' : `${String(seat).padStart(2, '0')}번`, on: seat !== null },
  ];

  return (
    <div className="bl-boot" role="status" aria-label="접속 중">
      <div className="bl-boot__box bl-edge">
        <span className="bl-boot__scan" aria-hidden />
        <span className="bl-label">ESTABLISHING LINK</span>
        <ol className="bl-boot__steps">
          {steps.map((s) => (
            <li key={s.label} className={`bl-boot__step${s.on ? ' bl-boot__step--on' : ''}`}>
              <i aria-hidden />
              <span>{s.label}</span>
              <b className="bl-mono">{s.value}</b>
            </li>
          ))}
        </ol>
        {slow && !linked ? (
          <div className="bl-boot__slow">
            <p className="bl-note">
              응답이 없다. 워커가 떠 있나 — <code className="bl-mono">npm run worker:dev</code>
            </p>
            <button type="button" className="bl-btn bl-edge" onClick={onCancel}>
              로비로 돌아가기
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ═══════════════════════════════ 진입 카운트다운 ═══════════════════════════════ */

/** 몇부터 세나. 셋이면 숨 한 번 — 넷이면 기다림이 되고 둘이면 못 본다 */
const LAUNCH_FROM = 3;
/** 한 칸의 길이 */
const LAUNCH_STEP_MS = 800;

/**
 * 시작 방송이 오면 도는 카운트다운.
 *
 * ★ **이 지연은 연출이지 대기가 아니다** — 그리고 방 전원이 같은 순간에 같은 방송을 받으므로
 *   (worker/src/room-do.ts 의 broadcast 는 보낸 사람에게도 간다) 세 화면의 3·2·1 이 함께 센다.
 *   혼자 노는 화면에서는 이런 숫자가 시간 낭비지만, 같이 세는 숫자는 **출발선**이다.
 */
export function Launch({ onDone }: { onDone: () => void }) {
  const [left, setLeft] = useState(LAUNCH_FROM);
  // 콜백이 매 렌더 새로 와도 시계가 다시 시작하면 안 된다 — 셈은 한 번만 돈다
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (left <= 0) {
      /*
       * 문이 열리는 소리는 **여기서** 난다 — 방송이 온 순간이 아니라 셋을 다 센 순간이다.
       * (원래 Waitroom 의 onBroadcast 가 냈다. 0.75초짜리 소리라 카운트다운 앞에 두면
       *  숫자가 아직 3인데 문이 다 열려 버린다.)
       */
      playSfx('start');
      done.current();
      return;
    }
    playSfx('click');
    const t = setTimeout(() => setLeft((n) => n - 1), LAUNCH_STEP_MS);
    return () => clearTimeout(t);
  }, [left]);

  return (
    <div className="bl-launch" role="alertdialog" aria-label="구역 진입">
      <div className="bl-launch__body">
        <span className="bl-label">SECTOR GATE</span>
        <strong className="bl-launch__num bl-mono" key={left} aria-hidden>
          {left > 0 ? left : '진입'}
        </strong>
        <p className="bl-launch__line">전원 구역으로 진입한다</p>
        <span className="bl-launch__bar" aria-hidden>
          <i style={{ animationDuration: `${LAUNCH_FROM * LAUNCH_STEP_MS}ms` }} />
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════ 신분증 한 줄 ═══════════════════════════════ */

/** 요원 카드의 한 줄 — 이름표와 값. 신분증처럼 왼쪽에 항목, 오른쪽에 값 */
export function IdRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bl-id__row">
      <span className="bl-label">{label}</span>
      <span className="bl-mono">{children}</span>
    </div>
  );
}

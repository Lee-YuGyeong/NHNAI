/**
 * /voice — 아홉이 한꺼번에 떠드는 방을 재현해 본다 (docs/VOICE.md).
 *
 * 이 화면이 있는 이유는 **귀로만 확인되는 것들이 있어서**다. 발언권(두 줄 겹침)과 지각 폐기는
 * 단위 시험이 규칙을 지키지만, 「두 줄이 겹쳤을 때 알아들을 수 있는가」는 시험이 답하지 못한다.
 * 그 값(concurrent 2)이 이 게임에서 분위기가 아니라 기능이라 여기서 들어 보고 정한다.
 *
 * ── 모의(mock)가 기본이다 ──
 *
 * 크레딧을 쓰지 않고 도는 갈래를 기본으로 둔다. 발언권·지각 폐기·자기 말 무음은 **어떤 소리가
 * 나느냐와 무관한** 규칙이라, 목소리가 진짜일 필요가 없다. 그리고 이 화면은 같은 상황을 수십 번
 * 반복해 보는 자리다 — 그 한 번 한 번이 크레딧이면 아무도 반복하지 않게 된다.
 *
 * 모의의 소리는 **명부 번호로 음높이를 만든 짧은 톤**이다. 진짜 관로에서는 좌석을 가르는 것이
 * 서버가 고른 목소리뿐이고 브라우저는 아무것도 안 하지만(webAudio.ts), 모의에는 서버가 없어서
 * 그 자리를 톤이 대신한다. **이건 흉내지 규칙이 아니다** — webAudio 에 이런 코드가 생기면 P11 위반이다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audioContext, masterOut } from '@/features/tts/engine';
import { FLOOR_LIMITS } from './floor';
import { DISCUSSION_LINES } from './lines';
import { assignVoices } from './roster';
import { type Heard, type SeatLine, type VoicePorts, createRoomVoice } from './roomVoice';
import { webAudioPorts } from './webAudio';

/** 캐스팅 화면(/tts)과 **같은 줄**을 쓴다 — 고른 소리가 겹쳐 들릴 때를 이어서 판단하는 흐름이라 */
const SAMPLES = DISCUSSION_LINES;

type Mode = 'mock' | 'real';

interface Row {
  key: string;
  seat: number;
  text: string;
  verdict: Heard;
}

/** 모의 관문 — 명부 번호로 음높이를 만든 짧은 톤. 크레딧을 안 쓴다 (머리말) */
function mockPorts(): VoicePorts {
  return {
    async fetchClip(token) {
      // 서버 왕복을 흉내 낸다 — 이게 없으면 발언권이 늘 비어 있어서 겹침이 안 보인다
      await new Promise((r) => setTimeout(r, 250 + Math.random() * 350));
      return token;
    },
    play(seat, clip) {
      const ctx = audioContext();
      const v = Number(String(clip).replace(/\D/g, '').slice(-1)) || seat;
      return new Promise((resolve) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 160 + v * 55; // 명부 번호 = 음높이 (흉내)
        gain.gain.value = 0.0001;
        osc.connect(gain).connect(masterOut());
        const now = ctx.currentTime;
        const dur = 1.6;
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.start(now);
        osc.stop(now + dur);
        osc.onended = () => {
          osc.disconnect();
          resolve();
        };
      });
    },
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
  };
}

/** 진짜 관문 — 워커에서 토큰을 받아(개발 전용) /api/tts/clip 으로 굴린다 */
function realPorts(voiceOf: (seat: number) => number): VoicePorts {
  const web = webAudioPorts();
  return {
    ...web,
    async fetchClip(spec) {
      // spec 은 `${seat}|${text}` — 진짜 판에서는 서버가 이미 서명해서 보내 준다
      const [seatStr, ...rest] = String(spec).split('|');
      const res = await fetch('/api/tts/clip/mint', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ v: voiceOf(Number(seatStr)), text: rest.join('|') }),
      });
      if (!res.ok) {
        const said = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(said?.error ?? `mint HTTP ${res.status}`);
      }
      const { clip } = (await res.json()) as { clip: string };
      return web.fetchClip(clip);
    },
  };
}

export function VoiceFeature() {
  const [mode, setMode] = useState<Mode>('mock');
  const [seatCount, setSeatCount] = useState(9);
  const [selfSeat, setSelfSeat] = useState<number | null>(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState({ playing: 0, waiting: 0 });
  const nth = useRef(0);

  const seats = useMemo(() => Array.from({ length: seatCount }, (_, i) => i + 1), [seatCount]);
  /** 판마다 새로 섞인다 — 좌석 수를 바꾸면 새 판이다 */
  const voices = useMemo(() => assignVoices(seats), [seats]);

  const voiceOf = useCallback((seat: number) => voices.get(seat) ?? 0, [voices]);

  const voice = useMemo(
    () => createRoomVoice(mode === 'mock' ? mockPorts() : realPorts(voiceOf)),
    [mode, voiceOf],
  );

  useEffect(() => {
    voice.setSelfSeat(selfSeat);
  }, [voice, selfSeat]);

  // 발언권이 차고 비는 것을 눈으로 본다 — 겹침이 실제로 2 에서 멎는지가 여기서 보인다
  useEffect(() => {
    const t = setInterval(() => setStats(voice.stats()), 100);
    return () => clearInterval(t);
  }, [voice]);

  const say = useCallback(
    (seat: number, text: string) => {
      const id = `l${nth.current++}`;
      const line: SeatLine = {
        id,
        seat,
        text,
        ts: Date.now(),
        clip: mode === 'mock' ? `tok-${voiceOf(seat)}` : `${seat}|${text}`,
      };
      const verdict = voice.hear(line);
      setRows((r) => [{ key: id, seat, text, verdict }, ...r].slice(0, 24));
    },
    [voice, mode, voiceOf],
  );

  /** 아홉이 한꺼번에 친다 — 이 화면의 본론 */
  const burst = useCallback(() => {
    audioContext().resume().catch(() => undefined); // 자물쇠를 사용자 제스처 안에서 연다
    seats.forEach((seat, i) => {
      setTimeout(() => say(seat, SAMPLES[i % SAMPLES.length]), i * 120);
    });
  }, [seats, say]);

  return (
    <div className="voice">
      <style>{CSS}</style>
      <h1>좌석별 목소리 — 방 울림 시연</h1>
      <p className="voice__note">
        규칙은 <code>docs/VOICE.md</code>. 여기서 보는 것은 <b>두 줄 겹침</b>이 알아들을 만한가와,
        아홉이 몰아칠 때 무엇이 조용히 지나가는가다.
      </p>

      <div className="voice__bar">
        <label>
          갈래{' '}
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="mock">모의 (크레딧 안 씀)</option>
            <option value="real">진짜 (/api/tts/clip · 크레딧)</option>
          </select>
        </label>
        <label>
          좌석{' '}
          <select value={seatCount} onChange={(e) => setSeatCount(Number(e.target.value))}>
            {[3, 5, 7, 9].map((n) => (
              <option key={n} value={n}>
                {n}명
              </option>
            ))}
          </select>
        </label>
        <label>
          내 좌석{' '}
          <select
            value={selfSeat ?? 0}
            onChange={(e) => setSelfSeat(Number(e.target.value) || null)}
          >
            <option value={0}>없음</option>
            {seats.map((s) => (
              <option key={s} value={s}>
                {String(s).padStart(2, '0')}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={burst}>
          아홉이 한꺼번에 떠든다
        </button>
        <button type="button" onClick={() => { voice.reset(); setRows([]); }}>
          판 새로
        </button>
      </div>

      <div className="voice__floor">
        발언권 <b>{stats.playing}</b>/{FLOOR_LIMITS.concurrent} · 대기 <b>{stats.waiting}</b>/
        {FLOOR_LIMITS.waiting}
        {voice.silenced() && <span className="voice__off"> · 음성 계통 정지</span>}
      </div>

      <div className="voice__seats">
        {seats.map((s) => (
          <button
            key={s}
            type="button"
            className={s === selfSeat ? 'voice__seat voice__seat--me' : 'voice__seat'}
            onClick={() => say(s, SAMPLES[(s - 1) % SAMPLES.length])}
          >
            SUBJECT {String(s).padStart(2, '0')}
            {/*
              명부 번호를 띄우는 것은 **이 화면뿐**이다. 진짜 판에서 이 값은 클라이언트로
              내려가지 않는다 (docs/VOICE.md §3) — 여기서는 순열이 판마다 섞이는지 눈으로 본다
            */}
            <em>목소리 {voiceOf(s)}</em>
            {s === selfSeat && <em>나 — 안 들림</em>}
          </button>
        ))}
      </div>

      <ol className="voice__log">
        {rows.map((r) => (
          <li key={r.key} data-verdict={r.verdict}>
            <b>{String(r.seat).padStart(2, '0')}</b>
            <span>{r.text}</span>
            <em>{VERDICT[r.verdict] ?? r.verdict}</em>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** 판정을 사람 말로 — 「왜 조용했나」가 이 화면의 절반이다 */
const VERDICT: Record<string, string> = {
  play: '소리',
  self: '내 말 — 나만 무음',
  'no-clip': '토큰 없음 — 글자만',
  silenced: '음성 정지 — 방 전체',
  'too-long': '너무 길다 — 글자만',
  'too-late': '늦었다 — 버림',
  'queue-full': '대기줄 참 — 글자만',
  duplicate: '같은 줄',
};

const CSS = `
.voice { max-width: 60rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; color: #dfe6ee;
  font: 400 15px/1.7 ui-sans-serif, system-ui, sans-serif; }
.voice h1 { font-size: 1.35rem; letter-spacing: .02em; margin: 0 0 .5rem; }
.voice__note { color: #8fa0b3; margin: 0 0 1.5rem; }
.voice__note code { color: #b9c8d8; }
.voice__bar { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center;
  padding: .85rem 1rem; border: 1px solid #24313f; border-radius: .5rem; background: #0e151d; }
.voice__bar label { color: #8fa0b3; font-size: .85rem; }
.voice__bar select, .voice__bar button { background: #16202b; color: #dfe6ee;
  border: 1px solid #2b3a4a; border-radius: .3rem; padding: .35rem .6rem; font: inherit; font-size: .85rem; }
.voice__bar button { cursor: pointer; }
.voice__bar button:hover { background: #1e2b39; }
.voice__floor { margin: 1rem 0; color: #8fa0b3; font-size: .9rem; }
.voice__floor b { color: #dfe6ee; }
.voice__off { color: #d98a6a; }
.voice__seats { display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); gap: .5rem; }
.voice__seat { display: flex; flex-direction: column; gap: .15rem; text-align: left; cursor: pointer;
  background: #0e151d; border: 1px solid #24313f; border-radius: .4rem; padding: .6rem .7rem;
  color: #dfe6ee; font: inherit; font-size: .82rem; letter-spacing: .04em; }
.voice__seat:hover { border-color: #3a5069; }
.voice__seat--me { border-color: #45607d; background: #121c27; }
.voice__seat em { color: #6f8296; font-style: normal; font-size: .74rem; letter-spacing: 0; }
.voice__log { list-style: none; margin: 1.5rem 0 0; padding: 0; }
.voice__log li { display: grid; grid-template-columns: 2.2rem 1fr auto; gap: .6rem; align-items: baseline;
  padding: .4rem .2rem; border-bottom: 1px solid #1a242f; font-size: .87rem; }
.voice__log b { color: #6f8296; font-weight: 400; }
.voice__log em { font-style: normal; font-size: .76rem; color: #6f8296; }
.voice__log li[data-verdict="play"] em { color: #7fa88c; }
.voice__log li[data-verdict="self"] em { color: #7f93a8; }
.voice__log li[data-verdict="too-late"] em,
.voice__log li[data-verdict="queue-full"] em,
.voice__log li[data-verdict="too-long"] em { color: #b08a5e; }
.voice__log li[data-verdict="silenced"] em { color: #d98a6a; }
`;

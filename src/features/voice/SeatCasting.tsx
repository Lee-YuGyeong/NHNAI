/**
 * 좌석 명부 캐스팅 — /tts 안에 서는 칸 (docs/VOICE.md §3).
 *
 * 이 게임에서 고르는 것은 **리더 하나가 아니라 아홉**이고, 고르는 기준도 다르다:
 * 배역에 어울리는 목소리가 아니라 **서로 구별되는 목소리 아홉**이다. 좌석에는 인격이
 * 없어서(순열이 판마다 섞는다) 「이 목소리는 과학자답다」 같은 판단이 낄 자리가 없다.
 *
 * ★ 시청은 **게임이 실제로 낼 조리법**으로 낸다 (/api/tts/seat-audition → seat-voice.ts 의
 *   MODEL · FORMAT · SEAT_SETTINGS 그대로). 이 화면의 위쪽(리더 방송)은 stability 0.85 ·
 *   style 0 · 22kHz · 확성기 필터로 들려주는데, 그 소리로 아홉을 고르면 **게임이 한 번도
 *   내지 않는 소리를 기준으로 고른 것**이 된다. 이 저장소가 이미 밟은 함정이다
 *   (2026-08-30 「/tts 소리가 게임과 다르다」).
 *
 * 폴더가 features/voice 인 것은 §8 때문이다 — 좌석 규칙은 방송 규칙과 한 폴더에 두지 않는다.
 * 화면에만 /tts 에 얹는다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { audioContext, masterOut } from '@/features/tts/engine';
import { DISCUSSION_LINES } from './lines';
import { ROSTER_SIZE } from './roster';

export interface AccountVoice {
  id: string;
  name: string;
  category: string;
}

/** 짜다 만 명부가 새로고침에 날아가면 아홉을 처음부터 다시 듣게 된다 */
const SAVE_KEY = 'voice.seatRoster';

function load(): AccountVoice[] {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const list = raw ? (JSON.parse(raw) as AccountVoice[]) : [];
    return Array.isArray(list) ? list.slice(0, ROSTER_SIZE) : [];
  } catch {
    return [];
  }
}

let source: AudioBufferSourceNode | null = null;

/** 시청 한 줄 — 게임과 같은 관로. 폴백은 **일부러 없다**(다른 목소리를 듣고 고르게 된다) */
async function auditionSeat(voiceId: string, text: string): Promise<void> {
  const res = await fetch('/api/tts/seat-audition', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ voiceId, text }),
  });
  if (!res.ok) {
    const said = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(said?.error ?? `HTTP ${res.status}`);
  }
  const ctx = audioContext();
  const buf = await ctx.decodeAudioData(await res.arrayBuffer());
  if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
  try {
    source?.stop();
  } catch {
    /* 이미 끝났다 */
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(masterOut()); // 좌석 음성은 필터가 없다 — 마스터로 곧장 간다 (webAudio.ts 와 같다)
  source = src;
  src.start();
}

export function SeatCasting({ voices }: { voices: AccountVoice[] | null }) {
  const [roster, setRoster] = useState<AccountVoice[]>(load);
  const [picked, setPicked] = useState('');
  const [lineIdx, setLineIdx] = useState(0);
  const [said, setSaid] = useState<{ state: 'idle' | 'loading' | 'ok' | 'fail'; why?: string }>({ state: 'idle' });
  const [copied, setCopied] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(roster));
    } catch {
      /* 사파리 프라이빗 등 — 저장은 편의지 기능이 아니다 */
    }
  }, [roster]);

  const line = DISCUSSION_LINES[lineIdx % DISCUSSION_LINES.length];

  const hear = useCallback(
    (voiceId: string) => {
      const my = ++seq.current;
      setSaid({ state: 'loading' });
      void auditionSeat(voiceId, line)
        .then(() => seq.current === my && setSaid({ state: 'ok' }))
        .catch((e: unknown) =>
          seq.current === my && setSaid({ state: 'fail', why: e instanceof Error ? e.message : String(e) }),
        );
    },
    [line],
  );

  const add = () => {
    const v = voices?.find((x) => x.id === picked);
    if (!v || roster.some((r) => r.id === v.id) || roster.length >= ROSTER_SIZE) return;
    setRoster((r) => [...r, v]);
  };

  const envLine = `ELEVENLABS_SEAT_VOICE_IDS=${roster.map((r) => r.id).join(',')}`;

  return (
    <section style={{ marginTop: 32, borderTop: '1px solid #333', paddingTop: 16 }}>
      <h3>좌석 명부 캐스팅 — 이 게임의 아홉</h3>
      <p style={{ opacity: 0.7, fontSize: 13 }}>
        고르는 기준은 <strong>서로 구별되는 목소리 아홉</strong>이다. 좌석에는 인격이 없다 —
        목소리는 판마다 좌석에 균등 순열로 배정되므로(<code>P11</code>), 「이 목소리는 누구답다」는
        판단이 낄 자리가 없다. 성별 · 연령 · 음높이를 흩어 놓되, <strong>발성값은 아홉이 전부 같다</strong>.
        <br />
        <strong>[좌석 소리로 듣기]</strong> 는 위쪽 리더 방송과 <strong>다른 조리법</strong>이다 — 게임이
        실제로 낼 소리(원음 · 44kHz · stability 0.5)로 들려준다. 위 버튼들로 고르면 게임이 한 번도
        내지 않는 소리를 기준으로 고르게 된다. 같은 목소리·같은 줄은 캐시가 받아 A/B 는 공짜다.
        <br />
        <code>SEAT_VOICE_DEV=1</code> 이 있어야 이 칸이 돈다 (없으면 404).
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
        <select value={picked} style={{ flex: 1 }} disabled={!voices?.length} onChange={(e) => setPicked(e.target.value)}>
          <option value="">계정 목소리에서 고른다…</option>
          {voices?.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
              {v.category ? ` — ${v.category}` : ''}
            </option>
          ))}
        </select>
        <button onClick={() => picked && hear(picked)} disabled={!picked}>
          좌석 소리로 듣기
        </button>
        <button onClick={add} disabled={!picked || roster.length >= ROSTER_SIZE || roster.some((r) => r.id === picked)}>
          명부에 넣기
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, opacity: 0.75 }}>
        <button onClick={() => setLineIdx((i) => i + 1)}>다음 줄 ▸</button>
        <span>“{line}”</span>
      </div>
      {said.state === 'loading' && <div style={{ fontSize: 13, opacity: 0.8 }}>⋯ 합성 중</div>}
      {said.state === 'ok' && <div style={{ fontSize: 13, opacity: 0.8 }}>♪ 좌석 조리법으로 재생했다</div>}
      {said.state === 'fail' && (
        <div style={{ fontSize: 13, color: '#e08a6a' }}>
          ⚠ {said.why} — 워커가 떠 있는지, <code>SEAT_VOICE_DEV=1</code> 인지 확인한다 (시청은 일부러 폴백이 없다)
        </div>
      )}

      <h4 style={{ margin: '16px 0 4px' }}>
        명부 {roster.length}/{ROSTER_SIZE}
      </h4>
      {roster.length === 0 && (
        <p style={{ opacity: 0.6, fontSize: 13 }}>
          비어 있다 — 아홉을 채우기 전까지 참가자 음성은 <strong>방 전체가 무음</strong>이다. 고장이 아니라
          설계대로다(일부 좌석만 소리가 나면 그게 정답표가 된다).
        </p>
      )}
      {roster.map((v, i) => (
        <div key={v.id} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '2px 0', fontSize: 14 }}>
          <span style={{ width: 24, opacity: 0.5 }}>{i}</span>
          <span style={{ flex: 1 }}>{v.name}</span>
          <button onClick={() => hear(v.id)}>듣기</button>
          <button onClick={() => setRoster((r) => r.filter((x) => x.id !== v.id))}>빼기</button>
        </div>
      ))}

      {roster.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(envLine).then(() => setCopied(true));
              }}
            >
              {copied ? '복사됨 ✓' : '.dev.vars 줄 복사'}
            </button>
            <span style={{ opacity: 0.6, fontSize: 13 }}>
              붙여 넣고 <code>npm run worker:dev</code> 를 다시 띄우면 <code>/voice</code> 의 진짜 갈래가 산다
            </span>
          </div>
          <code
            style={{
              display: 'block',
              marginTop: 6,
              padding: '6px 8px',
              background: '#111',
              borderRadius: 4,
              fontSize: 12,
              wordBreak: 'break-all',
            }}
          >
            {envLine}
          </code>
          {roster.length < ROSTER_SIZE && (
            <p style={{ opacity: 0.6, fontSize: 13 }}>
              아직 {ROSTER_SIZE - roster.length}개 모자란다 — 모자란 채로 넣으면 그 방은 통째로 조용하다.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

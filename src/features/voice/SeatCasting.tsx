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
import { ROSTER_SIZE, SEAT_GENDERS, genderOf } from './roster';

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

/** 워커에 실제로 들어간 명부 한 자리 (GET /api/tts/seats) */
interface LiveSeat {
  index: number;
  id: string;
  name: string;
  /** 계정 목록에서 이름을 찾았나. 못 찾았으면 그 좌석은 합성에서 503 이 된다 */
  known: boolean;
}

export function SeatCasting({ voices }: { voices: AccountVoice[] | null }) {
  const [roster, setRoster] = useState<AccountVoice[]>(load);
  const [picked, setPicked] = useState('');
  const [lineIdx, setLineIdx] = useState(0);
  const [said, setSaid] = useState<{ state: 'idle' | 'loading' | 'ok' | 'fail'; why?: string }>({ state: 'idle' });
  const [copied, setCopied] = useState(false);
  const seq = useRef(0);
  /** 지금 워커가 쓰고 있는 명부 — null 은 아직 안 물어봤거나 개발 스위치가 꺼진 것 */
  const [live, setLive] = useState<{ state: 'loading' | 'off' | 'done'; seats: LiveSeat[] }>({
    state: 'loading',
    seats: [],
  });

  const reloadLive = useCallback(() => {
    setLive((p) => ({ ...p, state: 'loading' }));
    void fetch('/api/tts/seats')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { seats: LiveSeat[] }) => setLive({ state: 'done', seats: d.seats }))
      .catch(() => setLive({ state: 'off', seats: [] }));
  }, []);

  useEffect(reloadLive, [reloadLive]);

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

      {/*
        ── 지금 워커에 들어간 명부 ──
        ELEVENLABS_SEAT_VOICE_IDS 를 이미 채운 뒤에는 이게 본론이다. 아래 「새로 짜기」는
        명부를 처음 만들 때 쓰는 자리고, 이미 넣었다면 여기서 아홉을 하나씩 들어 보면 된다.
        id 만으로는 무엇이 들어갔는지 알 수 없어서 워커가 계정 목록에서 이름을 맞춰 준다.
      */}
      <div style={{ margin: '12px 0 20px', padding: '10px 12px', border: '1px solid #2b3a4a', borderRadius: 6 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <strong style={{ fontSize: 14 }}>지금 워커에 들어간 명부</strong>
          <button onClick={reloadLive} style={{ fontSize: 12 }}>
            다시 읽기
          </button>
          {live.state === 'done' && (
            <span style={{ opacity: 0.65, fontSize: 13 }}>
              {live.seats.length}/{ROSTER_SIZE}
              {live.seats.length === ROSTER_SIZE ? ' — 다 찼다' : ' — 모자라면 방 전체가 무음이다'}
            </span>
          )}
        </div>

        {live.state === 'loading' && <div style={{ opacity: 0.6, fontSize: 13 }}>⋯ 읽는 중</div>}
        {live.state === 'off' && (
          <div style={{ opacity: 0.7, fontSize: 13 }}>
            못 읽었다 — 워커가 떠 있는지, <code>SEAT_VOICE_DEV=1</code> 인지 확인한다.
          </div>
        )}
        {live.state === 'done' && live.seats.length === 0 && (
          <div style={{ opacity: 0.7, fontSize: 13 }}>
            <code>ELEVENLABS_SEAT_VOICE_IDS</code> 가 비어 있다. 아래에서 아홉을 짜서 넣는다.
          </div>
        )}
        {live.seats.map((s) => (
          <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '2px 0', fontSize: 14 }}>
            <span style={{ width: 22, opacity: 0.5 }}>{s.index}</span>
            {/* 성별은 표시일 뿐이다 — 배정은 이 값을 안 본다 (roster.ts 의 SEAT_GENDERS) */}
            <span style={{ width: 22, opacity: 0.6 }}>{genderOf(s.index)}</span>
            <span style={{ flex: 1, color: s.known ? undefined : '#e08a6a' }}>
              {s.known ? s.name : `${s.id.slice(0, 10)}… — 계정에 없는 id`}
            </span>
            <button onClick={() => hear(s.id)}>듣기</button>
          </div>
        ))}
        {live.state === 'done' && live.seats.length > 0 && (
          <p style={{ opacity: 0.55, fontSize: 12, margin: '8px 0 0' }}>
            성별 표시는 <code>roster.ts</code> 의 <code>SEAT_GENDERS</code> 다(앞 다섯 남 · 뒤 넷 여).
            <strong> 배정은 이 값을 보지 않는다</strong> — 판마다 균등 순열이라 성별은 좌석에 저절로
            흩어진다. 명부를 갈아 끼우면 그 표도 같이 고쳐야 화면이 거짓말을 안 한다.
            {live.seats.some((s) => !s.known) && (
              <>
                <br />
                <span style={{ color: '#e08a6a' }}>
                  계정에 없는 id 가 있다 — 그 좌석은 합성에서 503 이 되고, 그러면 방 전체가 조용해진다.
                </span>
              </>
            )}
          </p>
        )}
      </div>

      <h4 style={{ margin: '0 0 4px' }}>명부 새로 짜기</h4>
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
        짜는 중 {roster.length}/{ROSTER_SIZE}
        <span style={{ fontWeight: 400, opacity: 0.55, fontSize: 13, marginLeft: 8 }}>
          목표 구성: {SEAT_GENDERS.filter((g) => g === '남').length}남 ·{' '}
          {SEAT_GENDERS.filter((g) => g === '여').length}여
        </span>
      </h4>
      {roster.length === 0 && (
        <p style={{ opacity: 0.6, fontSize: 13 }}>
          비어 있다 — 아홉을 채우기 전까지 참가자 음성은 <strong>방 전체가 무음</strong>이다. 고장이 아니라
          설계대로다(일부 좌석만 소리가 나면 그게 정답표가 된다).
        </p>
      )}
      {roster.map((v, i) => (
        <div key={v.id} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '2px 0', fontSize: 14 }}>
          <span style={{ width: 22, opacity: 0.5 }}>{i}</span>
          {/* 이 자리에 넣기로 한 성별 — 넣는 순서가 SEAT_GENDERS 와 맞는지 보면서 채운다 */}
          <span style={{ width: 22, opacity: 0.6 }}>{genderOf(i)}</span>
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

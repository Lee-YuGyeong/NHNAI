/**
 * 오프닝 자막 화자 셋 — /tts 에서 목소리를 고르고 대사를 들어 보는 자리.
 *
 * 시작 장면 대본(`start_speak.txt`)이 아직 없어서 (2026-09-05 사용자: 「~처럼 넣을 건데」),
 * 이 칸은 **대사를 그 자리에서 쳐 볼 수 있게** 만들었다. 대본이 오면 붙여 넣고 바로 듣고,
 * 확정되면 openingSpeakers.ts 의 sample 을 그것으로 갈아 끼운다.
 *
 * ★ 소리는 **관제 방송 관로를 타지 않는다.** 저쪽(LeaderTones)은 broadcastAnnounce 로 큐에
 *   넣어 시설 방송 음색(pa — 확성기 대역 + 큰 홀 잔향)까지 입히는데, 피실험자는 그 방에 선
 *   사람이라 원음이어야 한다. /world 의 사람 화자가 fx 'none' 인 것과 같다.
 *   그래서 여기서는 워커에서 받아 마스터로 곧장 낸다.
 *
 * 모델·화질도 방송과 다르다 — 방송은 지연이 곧 기능이라 flash·22kHz 인데, 오프닝은 한 번
 * 구워 두고 쓰는 자막이라 품질 쪽(multilingual_v2 · 44kHz)이 맞다. 대본 클립을 굽는
 * tools/voice-lines.mjs 와 같은 값이다 — 여기서 고른 소리가 거기서 구워질 소리여야 한다.
 */

import { useCallback, useRef, useState } from 'react';
import { audioContext, masterOut } from './engine';
import { OPENING_CAST, OPENING_SETTINGS } from './openingSpeakers';

export interface AccountVoice {
  id: string;
  name: string;
  category: string;
}

/** 대본 클립과 같은 조리법 — voice-lines.mjs 가 굽는 값 (voice-cast.json 의 model·format) */
const MODEL = 'eleven_multilingual_v2';
const FORMAT = 'mp3_44100_64';

let source: AudioBufferSourceNode | null = null;

/** 소리가 **끝날 때** resolve — 셋을 순서대로 들으려면 시작이 아니라 끝을 알아야 한다 */
async function speak(voiceId: string, text: string): Promise<void> {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, kind: 'readout', voiceId, settings: OPENING_SETTINGS, model: MODEL, format: FORMAT }),
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
  src.connect(masterOut()); // 필터 없음 — 방에 선 사람의 목소리다
  source = src;
  await new Promise<void>((resolve) => {
    src.onended = () => {
      src.disconnect();
      resolve();
    };
    src.start();
  });
}

export function OpeningCast({ voices }: { voices: AccountVoice[] | null }) {
  /** 화자별 목소리 — 기본은 openingSpeakers.ts 에 적힌 것 */
  const [picked, setPicked] = useState<Record<string, string>>(() =>
    Object.fromEntries(OPENING_CAST.map((s) => [s.id, s.voiceId])),
  );
  /** 화자별 대사 — 대본이 오면 여기 붙여 넣는다 */
  const [lines, setLines] = useState<Record<string, string>>(() =>
    Object.fromEntries(OPENING_CAST.map((s) => [s.id, s.sample])),
  );
  const [now, setNow] = useState<string | null>(null);
  const [said, setSaid] = useState<{ state: 'idle' | 'ok' | 'fail'; why?: string }>({ state: 'idle' });
  const seq = useRef(0);

  const hear = useCallback(
    async (speakerId: string) => {
      const my = ++seq.current;
      setNow(speakerId);
      setSaid({ state: 'idle' });
      try {
        await speak(picked[speakerId], lines[speakerId]);
        if (seq.current === my) {
          setNow(null);
          setSaid({ state: 'ok' });
        }
      } catch (e: unknown) {
        if (seq.current !== my) return;
        setNow(null);
        setSaid({ state: 'fail', why: e instanceof Error ? e.message : String(e) });
      }
    },
    [picked, lines],
  );

  /** 셋을 순서대로 — 장면은 한 줄씩이 아니라 이어서 들어야 선다 */
  const hearScene = useCallback(async () => {
    const my = ++seq.current;
    for (const s of OPENING_CAST) {
      if (seq.current !== my) return;
      setNow(s.id);
      try {
        await speak(picked[s.id], lines[s.id]);
      } catch (e: unknown) {
        if (seq.current !== my) return;
        setNow(null);
        setSaid({ state: 'fail', why: e instanceof Error ? e.message : String(e) });
        return;
      }
    }
    if (seq.current !== my) return;
    setNow(null);
    setSaid({ state: 'ok' });
  }, [picked, lines]);

  /** 바꾼 목소리를 openingSpeakers.ts 에 적을 수 있게 — 이건 환경 변수가 아니라 소스다 */
  const changed = OPENING_CAST.filter((s) => picked[s.id] !== s.voiceId);

  return (
    <section style={{ marginTop: 32, borderTop: '1px solid #333', paddingTop: 16 }}>
      <h3 style={{ marginBottom: 4 }}>오프닝 자막 화자 — 피실험자 셋</h3>
      <p style={{ opacity: 0.7, fontSize: 13, marginTop: 0 }}>
        게임 시작 장면에서 자막과 함께 나갈 목소리다. <strong>방에 앉는 좌석 아홉과는 다른
        물건이다</strong> — 저쪽은 익명이라 목소리가 단서가 되면 안 되지만(<code>P11</code>),
        이 셋은 이름을 달고 나오는 화자라 <strong>서로 다른 목소리인 것이 목적</strong>이다.
        <br />
        시설 방송 필터를 안 입힌 <strong>원음</strong>으로 난다(방에 선 사람이다). 모델·화질은
        대본 클립을 굽는 값과 같다 — 여기서 고른 소리가 곧 구워질 소리다.
        <br />
        <span style={{ opacity: 0.75 }}>
          대사는 아직 <strong>임시</strong>다. <code>start_speak.txt</code> 가 오면 아래 칸에 붙여
          넣어 듣고, 확정되면 <code>openingSpeakers.ts</code> 에 적는다.
        </span>
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0' }}>
        <button onClick={() => void hearScene()}>▶ 장면 전체 (셋 순서대로)</button>
        {said.state === 'ok' && <span style={{ fontSize: 13, opacity: 0.7 }}>♪ 재생했다</span>}
        {said.state === 'fail' && (
          <span style={{ fontSize: 13, color: '#e08a6a' }}>
            ⚠ {said.why} — 워커·키·크레딧을 확인한다
          </span>
        )}
      </div>

      {OPENING_CAST.map((s) => (
        <div
          key={s.id}
          style={{
            border: '1px solid #2b3a4a',
            borderRadius: 6,
            padding: '10px 12px',
            margin: '8px 0',
            outline: now === s.id ? '2px solid #6cf' : 'none',
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 15 }}>
              {now === s.id ? '♪ ' : ''}
              {s.label}
            </strong>
            <span style={{ fontSize: 12, opacity: 0.5 }}>{s.gender}</span>
            {picked[s.id] !== s.voiceId && (
              <span style={{ fontSize: 12, color: '#d9b06a' }}>기본과 다르게 골랐다</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0' }}>
            <select
              value={picked[s.id]}
              style={{ flex: 1 }}
              disabled={!voices?.length}
              onChange={(e) => setPicked((p) => ({ ...p, [s.id]: e.target.value }))}
            >
              {/* 계정 목록을 못 받았어도 기본값은 고를 수 있어야 한다 — 워커가 꺼져 있어도 화면은 선다 */}
              {!voices?.some((v) => v.id === s.voiceId) && <option value={s.voiceId}>{s.voiceName}</option>}
              {voices?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <button onClick={() => void hear(s.id)}>▶ 듣기</button>
          </div>

          <textarea
            value={lines[s.id]}
            rows={2}
            style={{ width: '100%', font: 'inherit', fontSize: 13, boxSizing: 'border-box' }}
            onChange={(e) => setLines((p) => ({ ...p, [s.id]: e.target.value }))}
          />
        </div>
      ))}

      {changed.length > 0 && (
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
          바꾼 목소리는 <code>src/features/tts/openingSpeakers.ts</code> 의 <code>voiceId</code> 에 적는다
          (환경 변수가 아니다 — 오프닝은 배포 설정이 아니라 작품의 내용이라, 사람마다 다르게
          들리면 안 된다):
          <code
            style={{
              display: 'block',
              marginTop: 4,
              padding: '6px 8px',
              background: '#111',
              borderRadius: 4,
              whiteSpace: 'pre-wrap',
            }}
          >
            {changed.map((s) => `${s.label}: ${picked[s.id]}`).join('\n')}
          </code>
        </div>
      )}
    </section>
  );
}

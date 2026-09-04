/**
 * 관리 AI 세 톤 — /tts 의 본론 (PLANNING §4.1).
 *
 * 관리 AI 는 **한 존재**지만 하는 일이 셋이다: 시험을 열고(announce), 기록을 읽고(readout),
 * 격리를 알린다(alarm). 여태 셋은 발성값(stability · style · speed)만 달랐다 — 같은 성대로
 * 톤만 바꾼 것이라, 경보가 「조금 급하게 읽는 안내 방송」에 머물렀다.
 *
 * 이 칸은 셋을 **따로 듣고 따로 고르는** 자리다. 듣는 길은 실제 방송과 **같은 관로**다:
 * broadcastAnnounce → 큐(ttsSlice) → TtsPlayer → engine → /api/tts. 그래서 여기서 들은 소리가
 * 곧 판에서 날 소리다 — 갈래마다 다른 조리법(VOICE_SETTINGS)과 시설 방송 필터(pa)까지 그대로 탄다.
 *
 * ★ **셋을 다르게 두는 것이 기본이 아니다.** 다른 목소리 셋이면 한 시설에서 세 시스템이
 *   말하는 것처럼 들린다. 비워 두면 기본 하나를 같이 쓰고, 그게 대개 맞다. 굳이 가른다면
 *   alarm 이 값이 싸다 — 격리는 판에 몇 번 없고, 그때 목소리가 바뀌는 것은 「다른 계통이
 *   끼어들었다」로 읽혀 오히려 산다.
 */

import { useCallback, useEffect, useState } from 'react';
import { broadcastAnnounce, type BroadcastKind } from '@/shared/broadcast';
import { useAppDispatch } from '@/store/hooks';
import { setFx, setVoiceId } from './engine';

export interface AccountVoice {
  id: string;
  name: string;
  category: string;
}

/** 워커가 갈래마다 실제로 쓰는 것 (GET /api/tts/leader) */
interface Tone {
  kind: BroadcastKind;
  id: string;
  name: string;
  known: boolean;
  /** 갈래 전용을 따로 넣었나 — false 면 기본 하나를 같이 쓴다 */
  own: boolean;
  /** 어디서 온 목소리인가 — 갈래 전용 · 기본 환경 변수 · 소스에 적힌 것 */
  source?: 'kind' | 'env' | 'default';
  settings: Record<string, number>;
  envVar: string;
}

/**
 * 갈래마다 무슨 일을 하는 자리인지 + 그 일에 해당하는 실제 문장.
 * 톤은 문장과 떼어 놓고 고를 수가 없다 — 「경보」를 안내 문장으로 들으면 급한지 알 수 없다.
 */
const TONES: Record<BroadcastKind, { label: string; what: string; line: string }> = {
  announce: {
    label: '개시 · 고지',
    what: '시험을 열고 조건을 알린다. 감정 없이, 또박또박',
    line: '낙하 시험을 개시한다. 전원 중앙 발판으로 이동하라.',
  },
  readout: {
    label: '기록 해설 · 판정',
    what: '편차를 짚어 읽는다. 토론에 불을 붙이는 자리라 평평해야 한다',
    line: '기록을 공개한다. 무리 평균 1.8미터, 전환 직후 3초 구간의 편차가 가장 크다.',
  },
  alarm: {
    label: '격리 경보',
    what: '의심도 100. 판에서 몇 번 없고, 그때 방이 조용해진다',
    line: '격리. SUBJECT 05 의 의심도가 100에 도달했다.',
  },
};

const ORDER: BroadcastKind[] = ['announce', 'readout', 'alarm'];

export function LeaderTones({ voices }: { voices: AccountVoice[] | null }) {
  const dispatch = useAppDispatch();
  const [tones, setTones] = useState<{ state: 'loading' | 'off' | 'done'; list: Tone[]; why?: string }>({
    state: 'loading',
    list: [],
  });
  /** 화면에서 고른 것 — 아직 환경 변수로 안 넘어간 값이다 */
  const [picked, setPicked] = useState<Partial<Record<BroadcastKind, string>>>({});
  const [copied, setCopied] = useState(false);

  const reload = useCallback(() => {
    setTones((p) => ({ ...p, state: 'loading' }));
    void fetch('/api/tts/leader')
      .then(async (r) => {
        if (r.ok) return (await r.json()) as { tones: Tone[] };
        const said = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(said?.error ?? `HTTP ${r.status}`);
      })
      .then((d) => setTones({ state: 'done', list: d.tones }))
      .catch((e: unknown) =>
        setTones({ state: 'off', list: [], why: e instanceof Error ? e.message : String(e) }),
      );
  }, []);

  useEffect(reload, [reload]);

  /**
   * 그 갈래를 **실제 방송 관로로** 들어 본다.
   * 고른 목소리를 엔진에 얹고(setVoiceId) 그 갈래로 방송을 보낸다 — 안 얹으면 워커 기본으로
   * 읽어서, 고른 소리가 아니라 지금 쓰는 소리를 듣고 고르게 된다.
   * 음색은 시설 방송(pa)으로 못박는다. 관리 AI 는 그 음색이 제 소리다 (docs/VOICE.md §8).
   */
  const hear = (kind: BroadcastKind) => {
    setFx('pa');
    setVoiceId(picked[kind] || undefined);
    dispatch(broadcastAnnounce({ text: TONES[kind].line, kind }));
  };

  /** 고른 것만 환경 변수 줄로 — 안 고른 갈래는 기본을 쓰라고 비워 둔다 */
  const envLines = ORDER.filter((k) => picked[k])
    .map((k) => `${tones.list.find((t) => t.kind === k)?.envVar ?? ''}=${picked[k]}`)
    .join('\n');

  return (
    <section style={{ marginTop: 8 }}>
      <h3 style={{ marginBottom: 4 }}>관리 AI 세 톤 — 따로 듣고 따로 고른다</h3>
      <p style={{ opacity: 0.7, fontSize: 13, marginTop: 0 }}>
        관리 AI 는 한 존재지만 하는 일이 셋이다(<code>PLANNING §4.1</code>). 여태 셋은{' '}
        <strong>발성값만 다르고 목소리는 하나</strong>였다 — 같은 성대로 톤만 바꾼 것이라 경보가
        「조금 급하게 읽는 안내 방송」에 머물렀다. 여기서 갈래마다 갈아 들어 보고, 필요하면 따로 세운다.
        <br />
        누르면 <strong>실제 방송 관로</strong>로 나간다(큐 → 재생기 → 워커) — 갈래별 조리법과 시설
        방송 음색까지 그대로라, 여기서 들은 소리가 곧 판에서 날 소리다.
      </p>

      {tones.state === 'off' && (
        <p style={{ fontSize: 13, opacity: 0.75 }}>
          워커에 못 물었다 — <code>npm run worker:dev</code> 가 떠 있는지 확인한다.
          <br />
          <span style={{ opacity: 0.6 }}>사유: {tones.why}</span>
        </p>
      )}

      {tones.state === 'done' &&
        ORDER.map((kind) => {
          const t = tones.list.find((x) => x.kind === kind);
          const meta = TONES[kind];
          return (
            <div
              key={kind}
              style={{ border: '1px solid #2b3a4a', borderRadius: 6, padding: '10px 12px', margin: '8px 0' }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 15 }}>{meta.label}</strong>
                <code style={{ fontSize: 12, opacity: 0.5 }}>{kind}</code>
                {/* 발성값 — 갈래를 가르는 것이 목소리가 아니라 이 숫자들이라는 게 보여야 한다 */}
                <span style={{ fontSize: 12, opacity: 0.5 }}>
                  {t && `안정 ${t.settings.stability} · 연기 ${t.settings.style} · 속도 ${t.settings.speed}`}
                </span>
              </div>
              <div style={{ fontSize: 12, opacity: 0.6, margin: '2px 0 6px' }}>{meta.what}</div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <select
                  value={picked[kind] ?? ''}
                  style={{ flex: 1 }}
                  disabled={!voices?.length}
                  onChange={(e) => setPicked((p) => ({ ...p, [kind]: e.target.value }))}
                >
                  <option value="">워커가 지금 쓰는 것</option>
                  {voices?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <button onClick={() => hear(kind)}>▶ 이 톤으로</button>
              </div>

              <div style={{ fontSize: 12, opacity: 0.6 }}>
                지금:{' '}
                {!t || !t.id ? (
                  <span style={{ color: '#e08a6a' }}>목소리가 없다 — ELEVENLABS_VOICE_ID 를 채운다</span>
                ) : (
                  <>
                    <strong>{t.known ? t.name : `${t.id.slice(0, 10)}… (계정에 없는 id)`}</strong>
                    {t.source === 'kind'
                      ? ' — 이 갈래 전용'
                      : t.source === 'default'
                        ? ' — 소스의 기본값 (openingSpeakers 와 같은 이유로 여기 적혀 있다)'
                        : ' — 기본 환경 변수를 같이 쓴다'}
                  </>
                )}
              </div>
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>“{meta.line}”</div>
            </div>
          );
        })}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
        <button onClick={reload} style={{ fontSize: 12 }}>
          워커에 다시 묻기
        </button>
        <span style={{ opacity: 0.55, fontSize: 12 }}>
          환경 변수를 고쳤으면 워커를 다시 띄운 뒤 눌러서 반영됐는지 본다
        </span>
      </div>

      {envLines && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(envLines).then(() => setCopied(true));
            }}
          >
            {copied ? '복사됨 ✓' : '환경 변수 줄 복사'}
          </button>
          <code
            style={{
              display: 'block',
              marginTop: 6,
              padding: '6px 8px',
              background: '#111',
              borderRadius: 4,
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {envLines}
          </code>
          <p style={{ opacity: 0.55, fontSize: 12, marginTop: 4 }}>
            <strong>셋 다 채우지 않아도 된다</strong> — 비운 갈래는 기본(<code>ELEVENLABS_VOICE_ID</code>)을
            쓴다. 셋을 전부 다르게 두면 한 시설에서 세 시스템이 말하는 것처럼 들린다.
          </p>
        </div>
      )}
    </section>
  );
}

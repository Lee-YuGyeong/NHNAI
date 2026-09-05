import { useEffect, useRef, useState } from 'react';
import { BackToRoot } from '@/shared/BackToRoot';
import { broadcastAnnounce, broadcastMute, type BroadcastKind } from '@/shared/broadcast';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  AUDITION_ROLES,
  castNameOf,
  gameVoiceOf,
  lineOf,
  loadGameManifest,
  playGameClip,
  speakAudition,
  stopAudition,
  toneOf,
  type AuditionRole,
  type GameManifest,
} from './audition';
import { getFx, lastSpeech, setFx, setVoiceId, voiceName } from './engine';
import { ttsActions, ttsSelectors } from './ttsSlice';
/*
 * 좌석 명부 캐스팅 — 이 화면의 나머지는 **리더 방송**(관리 AI)이고, 저 칸은 **참가자 아홉**이다.
 * 폴더가 features/voice 인 것은 좌석 규칙을 방송 규칙과 섞지 않기 위해서다 (docs/VOICE.md §8) —
 * 두 쪽의 조리법도 폴백 원칙도 정면으로 다르다. 화면에만 여기 얹는다.
 */
import { SeatCasting } from '@/features/voice/SeatCasting';
import { LeaderTones } from './LeaderTones';
import { OpeningCast } from './OpeningCast';

/**
 * 방송 파이프라인 테스트 화면 — 여기서 보낸 방송도 실제 게임과 같은 경로를 탄다:
 * `broadcastAnnounce` → 큐(ttsSlice) → 전역 재생기(TtsPlayer) → 엔진(engine.ts).
 */

/**
 * 관리 AI 방송 샘플 — 「인간인 척」이 실제로 내보낼 세 갈래다 (PLANNING §4.1:
 * 테스트 설계 · 기록 해설 · 주장 판정). 옛 판의 「전 노드는 중앙 라인에 정렬한다」류는
 * 이 게임에 없는 세계라 걷어냈다 — 톤을 고르는 자리에서 남의 게임 문장을 들으면
 * 고른 목소리가 실제 방송에서 어떻게 들릴지 알 수 없다.
 */
const SAMPLES: Array<{ kind: BroadcastKind; text: string }> = [
  { kind: 'announce', text: '낙하 시험을 개시한다. 전원 중앙 발판으로 이동하라.' },
  { kind: 'announce', text: '조건이 변경되었다. 이번 구간의 마찰 계수는 공개하지 않는다.' },
  { kind: 'readout',  text: '기록을 공개한다. 무리 평균 1.8미터, 전환 직후 3초 구간의 편차가 가장 크다.' },
  { kind: 'readout',  text: '주장 판정. SUBJECT 03 의 해명은 기록과 일치한다.' },
  { kind: 'alarm',    text: '격리. SUBJECT 05 의 의심도가 100에 도달했다.' },
  // 길이 캡 확인용 — 예산(cap.ts)을 넘겨서 끝난 문장까지만 읽히는지 들어본다
  {
    kind: 'announce',
    text:
      '전원에게 고지한다. 이번 시험부터 조건값은 어떤 경우에도 공개하지 않으며, ' +
      '기록은 무리 평균 대비 편차로만 제시된다. 시스템은 아무도 판정하지 않는다 — ' +
      '의심도를 움직이는 것은 전적으로 여러분의 발언과 지목이다.',
  },
];

const KIND_LABEL: Record<BroadcastKind, string> = { announce: '방송', readout: '판독', alarm: '경보' };

interface VoiceOption { id: string; name: string; category: string }

/** /api/tts/library 가 추려 주는 모양 (worker/src/tts.ts handleTtsLibrary) */
interface LibraryVoice {
  id: string;
  name: string;
  ownerId: string;
  previewUrl: string;
  gender: string;
  age: string;
  accent: string;
  descriptive: string;
  useCase: string;
}

const AGE_LABEL: Record<string, string> = { young: '젊음', middle_aged: '중년', old: '노년' };
const GENDER_LABEL: Record<string, string> = { male: '남', female: '여' };

export function TtsFeature() {
  const dispatch = useAppDispatch();
  const text = useAppSelector(ttsSelectors.selectText);
  const current = useAppSelector(ttsSelectors.selectCurrent);
  const queue = useAppSelector(ttsSelectors.selectQueue);
  const muted = useAppSelector(ttsSelectors.selectMuted);
  const [voice, setVoice] = useState<string | null | undefined>(undefined);
  const [spoken, setSpoken] = useState(lastSpeech);
  const [fx, setFxOn] = useState(getFx);
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);
  const [picked, setPicked] = useState('');
  /** 배역별 현재 줄 번호 — 게임과 후보가 **같은 줄**을 읽어야 A/B 가 성립한다. '다음 줄'로만 넘어간다 */
  const [lineIdx, setLineIdx] = useState<Record<string, number>>({});
  const [heard, setHeard] = useState<{
    role: string;
    src: '게임' | '후보';
    line: string;
    raw: boolean;
    state: 'loading' | 'played' | 'failed' | 'missing';
  } | null>(null);
  /** 필터를 뺀 원음으로 듣기 — "가벼워진 게 필터 탓인가"를 가르는 진단 토글 (사람 둘은 원래 필터가 없다) */
  const [rawMode, setRawMode] = useState(false);
  /** 연타 방어 — 앞선 시청의 결과가 늦게 도착해 새 시청의 '합성 중'을 덮지 않게 */
  const auditionSeq = useRef(0);
  /** 게임이 실제로 쓰는 목소리 표시용 — 기준은 cast 가 아니라 manifest(실제 구운 것)다 */
  const [gameVoices, setGameVoices] = useState<GameManifest | null>(null);
  useEffect(() => {
    void loadGameManifest().then(setGameVoices);
  }, []);

  /* 후보 찾기 — Voice Library. 검색은 공짜(합성이 아니다), 미리듣기는 정적 mp3 재생이다 */
  const [libQuery, setLibQuery] = useState('');
  const [libGender, setLibGender] = useState('');
  const [libAge, setLibAge] = useState('');
  const [lib, setLib] = useState<{ state: 'idle' | 'loading' | 'failed' | 'done'; voices: LibraryVoice[] }>({
    state: 'idle',
    voices: [],
  });
  const [copied, setCopied] = useState('');
  /** 라이브러리 → 계정 추가 상태. 아홉을 넣는 동안 어느 것을 이미 넣었는지 놓치지 않게 */
  const [added, setAdded] = useState<Record<string, 'adding' | 'ok' | 'fail'>>({});
  /** 미리듣기 — 원음 그대로(필터 없음), 한 번에 하나 */
  const previewRef = useRef<HTMLAudioElement | null>(null);

  const searchLibrary = () => {
    const qs = new URLSearchParams();
    if (libQuery.trim()) qs.set('search', libQuery.trim());
    if (libGender) qs.set('gender', libGender);
    if (libAge) qs.set('age', libAge);
    setLib({ state: 'loading', voices: [] });
    void fetch(`/api/tts/library?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { voices: LibraryVoice[] }) => setLib({ state: 'done', voices: d.voices }))
      .catch(() => setLib({ state: 'failed', voices: [] }));
  };

  const preview = (v: LibraryVoice) => {
    stopAudition(); // 시청 소리와 겹치면 어느 쪽을 듣는지 모른다
    previewRef.current?.pause();
    if (!v.previewUrl) return;
    const a = new Audio(v.previewUrl);
    previewRef.current = a;
    void a.play().catch(() => undefined);
  };

  /**
   * 라이브러리 보이스를 계정에 넣는다 (좌석 명부용). 성공하면 목소리 목록을 다시 받아
   * 아래 「좌석 명부 캐스팅」 드롭다운에 바로 뜨게 한다 — 다시 불러오지 않으면 방금 넣은
   * 것을 못 골라서, 아홉을 채우는 동안 화면을 계속 새로고침하게 된다.
   */
  const addToAccount = (v: LibraryVoice) => {
    setAdded((p) => ({ ...p, [v.id]: 'adding' }));
    void fetch('/api/tts/library/add', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ownerId: v.ownerId, voiceId: v.id, name: v.name }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(() => fetch('/api/tts/voices'))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { voices: VoiceOption[] }) => {
        setVoices(d.voices);
        setAdded((p) => ({ ...p, [v.id]: 'ok' }));
      })
      .catch(() => setAdded((p) => ({ ...p, [v.id]: 'fail' })));
  };

  /** 캐스팅에 필요한 셋 — voice-cast.json 의 library 항목 모양 그대로 */
  const copyCasting = (v: LibraryVoice) => {
    void navigator.clipboard
      .writeText(JSON.stringify({ voiceId: v.id, libraryName: v.name, ownerId: v.ownerId }))
      .then(() => setCopied(v.id));
  };

  const hear = (role: AuditionRole, src: '게임' | '후보') => {
    const line = lineOf(role, lineIdx[role.id] ?? 0);
    const my = ++auditionSeq.current;
    const raw = rawMode;
    setHeard({ role: role.label, src, line, raw, state: 'loading' });
    const run = src === '게임' ? playGameClip(role.id, line, raw) : speakAudition(role.id, line, picked, raw);
    void run.then((state) => {
      if (auditionSeq.current === my) setHeard({ role: role.label, src, line, raw, state });
    });
  };

  // 소리로만 비교되는 종류의 선택이라 손잡이를 화면에 둔다.
  // 캐시가 필터 이전 소리를 들고 있어서 껐다 켰다 해도 크레딧이 들지 않는다.
  const pickMode = (preset: 'pa' | 'robot' | 'none') => {
    setFxOn(preset);
    setFx(preset);
  };

  /** 음색 손잡이 — 라벨과 설명을 한자리에 둔다 (버튼이 셋이라 style 을 세 번 적지 않게) */
  const MODES = [
    { id: 'none' as const, label: '원본 목소리', why: '합성한 소리 그대로 (필터 없음)' },
    { id: 'pa' as const, label: '시설 방송', why: '확성기 대역 → 큰 방 잔향 — /world 의 SYSTEM 과 같은 소리 (심문소 기본)' },
    { id: 'robot' as const, label: '로봇 음색', why: '확성기 대역 → 링모드 → 비트크러시 → 창고 잔향' },
  ];

  // 목소리를 바꾸면 캐시가 갈리므로 **다시 합성한다 = 크레딧이 나간다.**
  // 필터 토글과 달리 이건 공짜가 아니다. 한 번 들은 조합은 그 뒤로 공짜다.
  const pickVoiceId = (id: string) => {
    setPicked(id);
    setVoiceId(id || undefined);
  };

  // 브라우저마다 잡히는 목소리가 다르다 — 무엇으로 읽고 있는지 여기서 확인한다
  useEffect(() => { void voiceName().then(setVoice); }, []);

  // 계정이 쓸 수 있는 목소리 — 워커가 키를 쥔 채로 물어봐서 내려 준다
  useEffect(() => {
    void fetch('/api/tts/voices')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { voices: VoiceOption[] }) => setVoices(d.voices))
      .catch(() => setVoices([]));
  }, []);

  // 폴백은 조용히 일어난다. 들여다보지 않으면 Web Speech 소리를 듣고
  // "ElevenLabs 가 별로네" 하고 오판하게 된다 — 그래서 화면에 띄운다.
  useEffect(() => {
    const t = setInterval(() => setSpoken(lastSpeech()), 500);
    return () => clearInterval(t);
  }, []);

  const send = (t: string, kind: BroadcastKind = 'announce') => dispatch(broadcastAnnounce({ text: t, kind }));

  return (
    <main style={{ padding: 64, maxWidth: 640 }}>
      <BackToRoot />
      <h2>TTS — 관리 AI 방송 · 좌석 목소리</h2>
      <p style={{ opacity: 0.7 }}>
        이 화면은 <strong>두 가지</strong>다. 「인간인 척」의 소리는 성격이 정반대인 두 갈래로 나뉜다
        (<code>docs/VOICE.md</code> §8):
      </p>
      <table style={{ opacity: 0.8, fontSize: 13, borderCollapse: 'collapse', marginBottom: 12 }}>
        <tbody>
          <tr>
            <td style={{ padding: '2px 12px 2px 0', whiteSpace: 'nowrap' }}>🔊 <strong>관리 AI</strong></td>
            <td style={{ padding: '2px 0' }}>
              시설 방송 <strong>하나</strong>. 정체가 비밀이 아니라 목소리가 튀어도 잃을 게 없다 —
              안 되면 브라우저 음성으로라도 읽는다.
            </td>
          </tr>
          <tr>
            <td style={{ padding: '2px 12px 2px 0', whiteSpace: 'nowrap' }}>👥 <strong>참가자</strong></td>
            <td style={{ padding: '2px 0' }}>
              방에 앉은 <strong>아홉</strong>. 한 좌석만 소리가 다르면 그게 정답표가 되므로,
              안 되면 <strong>방 전체가 조용해진다</strong>. 아래 「좌석 명부 캐스팅」이 그 아홉을 고르는 자리다.
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ opacity: 0.7, fontSize: 13 }}>
        폴백 목소리:{' '}
        {voice === undefined ? '확인 중…' : (voice ?? '한국어 목소리 없음 — 브라우저 기본으로 읽는다')}
      </p>
      {/* 지금 나는 소리가 어느 쪽인지 — 목소리를 고르려면 이걸 먼저 알아야 한다 */}
      <div
        style={{
          padding: '8px 12px',
          marginBottom: 12,
          borderRadius: 6,
          background: { none: '#333', elevenlabs: '#1d4a2b', fallback: '#4a1d1d' }[spoken.by],
        }}
      >
        {spoken.by === 'none' && '○ 아직 읽은 것이 없다 — 방송을 하나 보내 보면 어느 쪽인지 나온다'}
        {spoken.by === 'elevenlabs' && '● ElevenLabs 로 읽었다'}
        {spoken.by === 'fallback' && `⚠ Web Speech 로 읽었다 (ElevenLabs 실패: ${spoken.reason})`}
      </div>

      <LeaderTones voices={voices} />

      <h3 style={{ marginBottom: 4 }}>🔊 관리 AI 방송 — 손으로 보내 보기</h3>
      <p style={{ opacity: 0.6, fontSize: 13, marginTop: 0 }}>
        보낸 방송은 전역 큐에 쌓여 순서대로 재생되고, 경보는 재생 중인 방송을 끊고 맨 앞에 선다.
        기본 음색은 <strong>시설 방송</strong>이다 — 관리 AI 는 시스템임을 모두가 알고 시작하므로
        참가자와 <strong>달라야</strong> 한다(방송인지 발언인지 귀로 갈려야 토론이 안 엉킨다).
        <br />
        <strong>이 칸의 소리로 좌석 아홉을 고르면 안 된다</strong> — 조리법이 다르다(아래 캐스팅 칸).
      </p>
      {/* 음색은 말로 합의가 안 되고 귀로 고르는 것이라, 갈아 듣는 손잡이를 화면에 둔다 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => pickMode(m.id)}
            style={{ fontWeight: fx === m.id ? 'bold' : 'normal', outline: fx === m.id ? '2px solid #6cf' : 'none' }}
          >
            {m.label}
          </button>
        ))}
        <span style={{ opacity: 0.6, fontSize: 13 }}>{MODES.find((m) => m.id === fx)?.why}</span>
      </div>

      {/* 목소리 A/B. 필터 세 가지와 곱해진다 — 같은 문장을 갈아 들어보고 고르는 자리다. */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <label htmlFor="voice">목소리</label>
        <select
          id="voice"
          value={picked}
          style={{ flex: 1 }}
          disabled={!voices?.length}
          onChange={(e) => pickVoiceId(e.target.value)}
        >
          <option value="">워커 기본 목소리 (ELEVENLABS_VOICE_ID)</option>
          {voices?.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}{v.category ? ` — ${v.category}` : ''}
            </option>
          ))}
        </select>
      </div>
      {voices?.length === 0 && (
        <p style={{ opacity: 0.6, fontSize: 13, marginTop: -8 }}>
          목소리 목록을 못 받았다 — 워커가 떠 있는지, 키에 '음성 읽기' 권한이 있는지 확인한다.
        </p>
      )}
      <p style={{ opacity: 0.6, fontSize: 13 }}>
        필터는 껐다 켜도 공짜다(캐시가 필터 이전 소리를 들고 있다). <strong>목소리를 바꾸면 다시 합성한다 —
        크레딧이 나간다.</strong> 한 번 들은 조합은 그 뒤로 공짜다.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={text}
          placeholder="방송할 문장"
          style={{ flex: 1 }}
          onChange={(e) => dispatch(ttsActions.setText(e.target.value))}
        />
        <button onClick={() => send(text)} disabled={!text}>방송</button>
        <button onClick={() => dispatch(broadcastMute())}>{muted ? '음소거 해제' : '음소거'}</button>
      </div>
      <h3>샘플 방송</h3>
      {SAMPLES.map(({ kind, text: t }) => (
        <button key={t} style={{ display: 'block', margin: '4px 0' }} onClick={() => send(t, kind)}>
          [{KIND_LABEL[kind]}] {t}
        </button>
      ))}
      {/*
        ── 옛 판 도구 ──
        과학자 · 정부요원 · UNIT-07 은 「인간인 척」에 없는 인물들이다. 그래도 지우지 않는 이유는
        /world · /scenario2 가 **아직 그 대본과 구운 클립으로 돌기 때문**이다 — 저 화면들을 손볼 때
        여전히 필요한 도구다. 다만 이 화면의 본론이 아니므로 접어 둔다.
      */}
      <details style={{ marginTop: 24, opacity: 0.75 }}>
        <summary style={{ cursor: 'pointer', fontSize: 14 }}>
          배역 시청 — <strong>옛 판(/world · /scenario2) 전용</strong>. 이 게임과는 무관하다
        </summary>
      <p style={{ opacity: 0.7, fontSize: 13 }}>
        과학자 · 정부요원 · UNIT-07 은 「인간인 척」에 없다. 저 화면들이 아직 구운 클립으로 돌아서
        남겨 둔 도구다. <strong>후보 소리</strong>는 위 「관리 AI 방송」의 목소리 드롭다운에서 고른
        후보로 읽는다.
        <br />
        <strong>게임 소리</strong>는 지금 게임이 트는 구운 클립 그대로다(공짜). 어느 목소리로 구워졌는지는
        배역 줄 끝의 <strong>게임:</strong> 에 적혀 있다 — <strong>(임시)</strong> 는 캐스팅표의 한국어
        보이스가 계정에 없어 fallback 영어 보이스로 구운 것이다. <strong>후보 소리</strong>는 위 목소리 드롭다운에서 고른 후보로 같은 줄을 같은
        조리법(모델·발성·필터·화질)으로 실시간 합성한다. 같은 줄을 번갈아 누르는 것이 A/B 다.
        승자는 <code>tools/voice-cast.json</code> 에 적고 <code>node tools/voice-lines.mjs</code> 로 굽는다.
      </p>
      <div style={{ margin: '4px 0 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => setRawMode((v) => !v)}
          style={{ fontWeight: rawMode ? 'bold' : 'normal', outline: rawMode ? '2px solid #6cf' : 'none' }}
        >
          {rawMode ? '원음으로 듣는 중 — 필터 끔' : '필터 끄고 원음으로 듣기'}
        </button>
        <span style={{ opacity: 0.6, fontSize: 13 }}>
          가벼워진 게 필터 탓인지 가른다. 배속은 그대로 — 한 번에 한 변수만.
          사람 배역(과학자·정부요원)은 원래 필터가 없어 같은 소리다 — 갈리는 것은 경비 둘이다.
        </span>
      </div>
      {AUDITION_ROLES.map((r) => {
        const game = gameVoiceOf(gameVoices, r.id);
        return (
          <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0' }}>
            <span style={{ width: 150 }}>{r.label}</span>
            <button onClick={() => hear(r, '게임')}>게임 소리</button>
            {/* 목소리를 안 고르면 워커 기본(리더 방송 목소리)으로 읽어 버린다 — 그 소리를 듣고 고르면 안 된다 */}
            <button onClick={() => hear(r, '후보')} disabled={!picked} title={picked ? '' : '위 목소리 드롭다운에서 후보를 먼저 고른다'}>
              후보 소리
            </button>
            <button onClick={() => setLineIdx((p) => ({ ...p, [r.id]: (p[r.id] ?? 0) + 1 }))}>다음 줄 ▸</button>
            <span style={{ opacity: 0.6, fontSize: 13 }} title={`캐스팅 목표: ${castNameOf(r.id)}`}>
              게임: {game ? `${game.name}${game.source === 'fallback' ? ' (임시)' : ''}` : '…'}
            </span>
            {/* 지금 걸린 음색 — 목소리와 달리 숫자라, 안 보이면 무엇을 듣고 있는지 파일을 열어야 안다 */}
            <span style={{ opacity: 0.45, fontSize: 12 }} title="voice-cast.json 의 fx·playRate — 대역 · 재생 배속. 필터가 없는 배역은 「원음」이다 (사람 둘)">
              {toneOf(r.id)}
            </span>
          </div>
        );
      })}
      {heard && (
        <div style={{ opacity: 0.85, fontSize: 13, marginTop: 4 }}>
          {heard.state === 'loading' && `⋯ [${heard.role} · ${heard.src}${heard.raw ? ' · 원음' : ''}] "${heard.line}"`}
          {heard.state === 'played' && `♪ [${heard.role} · ${heard.src}${heard.raw ? ' · 원음' : ''}] "${heard.line}"`}
          {heard.state === 'missing' && `⚠ [${heard.role}] 이 줄의 클립이 없다 — node tools/voice-lines.mjs 로 굽는다`}
          {/* 후보 시청은 폴백이 없다 — Web Speech 로 읽어 주면 다른 목소리를 듣고 고르게 된다 */}
          {heard.state === 'failed' &&
            (heard.src === '후보'
              ? `⚠ [${heard.role}] 합성 실패 — 워커·키·크레딧을 확인한다 (시청은 일부러 폴백이 없다)`
              : `⚠ [${heard.role}] 클립을 못 틀었다 — public/world/voice/ 파일을 확인한다`)}
        </div>
      )}
      </details>
      <h3 style={{ marginBottom: 4 }}>후보 찾기 — Voice Library</h3>
      <p style={{ opacity: 0.7, fontSize: 13, marginTop: 0 }}>
        한국어 보이스만 검색된다. 좌석 아홉을 여기서 찾는다 — <strong>미리듣기</strong>로 훑고,
        쓸 만하면 <strong>[계정에 추가]</strong> 를 누른 뒤 아래 캐스팅 칸에서 게임 조리법으로
        확인한다. 라이브러리 id 는 <strong>그대로 못 쓴다</strong> — 계정에 넣어야 쓸 수 있는 id 가 나온다.
        <br />
        <span style={{ opacity: 0.7 }}>
          (<strong>캐스팅 복사</strong>는 옛 판용이다 — <code>voice-cast.json</code> 의 library 항목 모양.)
        </span>
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <input
          value={libQuery}
          placeholder="예: deep, calm, documentary…"
          style={{ flex: 1 }}
          onChange={(e) => setLibQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && searchLibrary()}
        />
        <select value={libGender} onChange={(e) => setLibGender(e.target.value)}>
          <option value="">성별 전체</option>
          <option value="male">남</option>
          <option value="female">여</option>
        </select>
        <select value={libAge} onChange={(e) => setLibAge(e.target.value)}>
          <option value="">나이 전체</option>
          <option value="young">젊음</option>
          <option value="middle_aged">중년</option>
          <option value="old">노년</option>
        </select>
        <button onClick={searchLibrary} disabled={lib.state === 'loading'}>
          {lib.state === 'loading' ? '검색 중…' : '검색'}
        </button>
      </div>
      {lib.state === 'failed' && (
        <p style={{ opacity: 0.6, fontSize: 13 }}>검색 실패 — 워커가 떠 있는지, 키 권한을 확인한다.</p>
      )}
      {lib.state === 'done' && lib.voices.length === 0 && (
        <p style={{ opacity: 0.6, fontSize: 13 }}>결과 없음 — 키워드를 줄이거나 필터를 풀어 본다.</p>
      )}
      {lib.voices.map((v) => (
        <div key={v.id} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0' }}>
          <button onClick={() => preview(v)} disabled={!v.previewUrl}>미리듣기</button>
          <button onClick={() => copyCasting(v)}>{copied === v.id ? '복사됨 ✓' : '캐스팅 복사'}</button>
          {/* 라이브러리 id 는 그대로 합성에 못 쓴다 — 계정에 넣어야 쓸 수 있는 id 가 나온다.
              아홉 번 반복할 일이라 여기서 누르게 한다 (SEAT_VOICE_DEV=1 일 때만 산다) */}
          <button onClick={() => addToAccount(v)} disabled={added[v.id] === 'adding'}>
            {added[v.id] === 'ok' ? '추가됨 ✓' : added[v.id] === 'adding' ? '추가 중…' : '계정에 추가'}
          </button>
          <span style={{ fontSize: 14 }}>
            {v.name}
            <span style={{ opacity: 0.55, fontSize: 12, marginLeft: 8 }}>
              {[GENDER_LABEL[v.gender] ?? v.gender, AGE_LABEL[v.age] ?? v.age, v.descriptive, v.useCase]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        </div>
      ))}
      <OpeningCast voices={voices} />

      {/*
        참가자 좌석 아홉은 **지금 쓰지 않는다** (2026-09-04 사용자: 「참여자 목소리는 안 넣어도 돼」).
        지우지 않고 접어 둔다 — 규칙(P11)과 관로는 docs/VOICE.md 에 그대로 살아 있고,
        되살릴 일이 생기면 여기 한 줄을 펴면 된다.
      */}
      <details style={{ marginTop: 24, opacity: 0.75 }}>
        <summary style={{ cursor: 'pointer', fontSize: 14 }}>
          참가자 좌석 아홉 — <strong>지금은 안 쓴다</strong> (docs/VOICE.md)
        </summary>
        <SeatCasting voices={voices} />
      </details>
      <h3>상태</h3>
      <div>재생 중: {current ? `[${KIND_LABEL[current.kind]}] ${current.text}` : '—'}</div>
      <div>
        대기 {queue.length}건
        {queue.length > 0 ? ` — ${queue.map((q) => `[${KIND_LABEL[q.kind]}] ${q.text}`).join(' / ')}` : ''}
      </div>
    </main>
  );
}

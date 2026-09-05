/**
 * 리더 방송 음성 합성 — **워커에서만**. ElevenLabs 키는 브라우저로 절대 안 나간다 (PLANNING §4.2).
 *
 *   POST /api/tts  { text, kind?, voiceId? }  → audio/mpeg 바이트
 *
 * 브라우저는 이 바이트를 받아 WebAudio 로 굴린다. **로봇 음색은 여기서 만들지 않는다** —
 * ko-KR 로봇 목소리를 파는 API 는 없어서(어느 업체든 사람 목소리다) 기계 소리는
 * 브라우저의 필터 체인이 만든다. 워커가 할 일은 "감정 없이 또박또박 읽은 한국어"를
 * 가져오는 것까지다.
 *
 * 응답 본문은 버퍼링하지 않고 그대로 흘려보낸다 — 워커가 오디오를 통째로 들고 있을 이유가 없다.
 */

import { BROADCAST_KINDS, type BroadcastKind } from '../../src/shared/broadcast-kind';

const API = 'https://api.elevenlabs.io/v1/text-to-speech';

/** 지연 75ms 급. 방송이 한두 문장이라 품질 모델을 쓸 이유가 없다 */
const MODEL = 'eleven_flash_v2_5';

/**
 * 22kHz/32kbps — 일부러 낮게 잡는다.
 * 어차피 브라우저에서 확성기 대역(300~3400Hz)으로 밴드패스를 먹일 거라 위쪽 대역은 버려진다.
 * 낮은 쪽이 내려받기도 빠르고, 요금제 등급을 타지 않는 포맷이다.
 */
const FORMAT = 'mp3_22050_32';

/**
 * 글자 수 천장 — **크레딧 방어용**이지 문장을 다듬는 가위가 아니다.
 * 다듬는 건 클라이언트가 이미 한다 (features/tts/cap.ts, 가장 긴 announce 예산이 165자).
 * 여기서는 버그나 폭주가 요금으로 새는 것만 막는다. 넘으면 자르지 않고 거절한다 —
 * 말이 중간에 잘려 나가느니 안 나가는 게 낫다.
 */
const MAX_CHARS = 300;

/**
 * 종류별 발성. ElevenLabs 의 stability 는 **높을수록 단조롭다** —
 * 보통은 단점으로 치는 값인데, 감정 없는 관제 방송에는 그게 정확히 우리가 원하는 것이다.
 * style 0 = 연기하지 않는다.
 */
const VOICE_SETTINGS: Record<BroadcastKind, Record<string, number>> = {
  announce: { stability: 0.85, similarity_boost: 0.75, style: 0, speed: 0.95 },
  readout: { stability: 0.9, similarity_boost: 0.75, style: 0, speed: 1.0 },
  // 경보만 조금 풀어 준다. 완전히 단조로우면 급한 소리로 안 들린다
  alarm: { stability: 0.7, similarity_boost: 0.75, style: 0.3, speed: 1.1 },
};

/**
 * 본문으로 받는 모델 — 배역 시청(/tts)용이다. 대본 클립은 voice-lines.mjs 가
 * eleven_multilingual_v2 로 굽는데, 방송 기본인 flash 로 들려주면 다른 소리를 듣고 고르게 된다.
 * 목록에 없는 모델은 조용히 기본으로 — 상류 요금 등급을 본문이 정하게 두지 않는다.
 */
const MODELS = ['eleven_flash_v2_5', 'eleven_multilingual_v2'];

/**
 * 본문으로 받는 포맷 — 역시 배역 시청용이다. 대본 클립은 44.1kHz/64kbps(voice-cast 의 format)로
 * 굽는데, 방송 기본(22/32)으로 후보를 들려주면 게임 클립보다 탁한 소리로 비교하게 된다
 * (2026-08-30 — "/tts 소리가 게임과 다르다"의 한 갈래). 목록 밖은 조용히 기본으로.
 */
const FORMATS = ['mp3_22050_32', 'mp3_44100_64'];

/**
 * 본문 settings 의 축별 허용 범위. 배역 시청이 대본 화자의 발성(voice-cast.json 의 settings)
 * 그대로 듣는 자리라 종류(kind) 발성만으로는 부족하다. 값은 믿지 않고 축마다 자른다 —
 * 요금이 아니라 소리를 지키는 것이다 (speed 0.7~1.2 는 ElevenLabs 가 받는 범위).
 * 모르는 축은 버린다 — 상류 API 로 임의 필드를 흘리는 통로가 되면 안 된다.
 */
const SETTING_RANGE: Record<string, [number, number]> = {
  stability: [0, 1],
  similarity_boost: [0, 1],
  style: [0, 1],
  speed: [0.7, 1.2],
};

/** 종류 기본값 위에 본문 settings 를 얹는다 (잘라서) */
function toneSettings(tone: BroadcastKind, settings: Record<string, unknown> | undefined): Record<string, number> {
  const out = { ...VOICE_SETTINGS[tone] };
  if (!settings || typeof settings !== 'object') return out;
  for (const [axis, [lo, hi]] of Object.entries(SETTING_RANGE)) {
    const v = settings[axis];
    if (typeof v === 'number' && Number.isFinite(v)) out[axis] = Math.min(hi, Math.max(lo, v));
  }
  return out;
}

export interface TtsEnv {
  /** 로컬은 .dev.vars, 배포는 wrangler secret */
  ELEVENLABS_API_KEY?: string;
  /** 기본 목소리. 요청의 voiceId 가 있으면 그쪽이 이긴다 (/tts 화면에서 목소리를 갈아 보려고) */
  ELEVENLABS_VOICE_ID?: string;
  /**
   * 갈래별 목소리 — 비우면 위의 기본을 쓴다 (PLANNING §4.1 의 세 가지 일).
   *
   * 관리 AI 는 **한 존재**지만 하는 일이 셋이다: 시험을 열고(announce), 기록을 읽고(readout),
   * 격리를 알린다(alarm). 여태 셋은 발성값(stability · style · speed)만 달랐다 — 같은 성대로
   * 톤만 바꾼 것이라, 경보가 「급하게 읽는 안내 방송」에 머물렀다.
   *
   * ★ **비워 두는 것이 기본이고, 그게 대개 맞다.** 셋을 다른 목소리로 두면 한 시설에서
   *   세 시스템이 말하는 것처럼 들린다. 갈아 끼우는 건 그 대가를 알고 하는 선택이다 —
   *   특히 alarm 만 따로 세우는 쪽이 값이 싸다(격리는 판에 몇 번 없고, 그때 톤이 바뀌는 것은
   *   「다른 계통이 끼어들었다」로 읽혀 오히려 산다).
   */
  ELEVENLABS_VOICE_ID_ANNOUNCE?: string;
  ELEVENLABS_VOICE_ID_READOUT?: string;
  ELEVENLABS_VOICE_ID_ALARM?: string;
}

/** 갈래별 목소리를 담은 환경 변수 이름 — 화면과 워커가 같은 표를 본다 */
export const KIND_VOICE_VAR: Record<BroadcastKind, string> = {
  announce: 'ELEVENLABS_VOICE_ID_ANNOUNCE',
  readout: 'ELEVENLABS_VOICE_ID_READOUT',
  alarm: 'ELEVENLABS_VOICE_ID_ALARM',
};

interface TtsBody {
  text?: string;
  kind?: BroadcastKind;
  voiceId?: string;
  /** 배역 시청용 — 대본 화자의 발성(voice-cast.json 의 settings). 축별로 잘라서 쓴다 */
  settings?: Record<string, unknown>;
  /** 배역 시청용 — MODELS 에 있는 것만. 그 밖은 기본(flash) */
  model?: string;
  /** 배역 시청용 — FORMATS 에 있는 것만. 그 밖은 기본(22/32) */
  format?: string;
}

/**
 * 방송이 쓸 목소리 하나.
 *
 * ELEVENLABS_VOICE_ID 는 **하나**를 담는 자리인데, 좌석 명부 아홉을 여기에 쉼표로 이어 넣는
 * 오해가 실제로 났다 (2026-09-04 사용자). 그대로 상류에 넘기면 "id1,id2,…" 가 보이스 id 로
 * 가서 방송이 통째로 400 이 된다 — **좌석을 채우려다 방송을 죽이는** 모양이다.
 * 쉼표가 있으면 첫 번째만 쓴다. 명부 쪽은 seat-voice.ts 의 seatVoiceIds 가 같은 값을 읽는다.
 */
function firstId(raw: string | undefined): string | undefined {
  return (raw ?? '').split(',')[0]?.trim() || undefined;
}

/**
 * 관리 AI 목소리 — **Ethan - Deep** (2026-09-05 사용자).
 *
 * ┌─ 왜 환경 변수가 아니라 여기 적나 ─────────────────────────────────────────┐
 * │ 관리 AI 의 목소리는 **작품의 내용**이지 배포 설정이 아니다. 시설이 말하는   │
 * │ 소리는 누가 띄운 판이든 같아야 한다 — 환경 변수에만 두면 넣은 사람과 안 넣은 │
 * │ 사람이 다른 게임을 하게 되고, 실제로 그 자리를 여러 번 밟았다 (2026-09-04~05:│
 * │ 좌석 아홉이 이 자리에 들어가 관리 AI 가 남의 클론 목소리로 말했다).         │
 * │                                                                            │
 * │ 오프닝 화자 셋(features/tts/openingSpeakers.ts)을 소스에 적은 것과 같은 이유고,│
 * │ 대본 배역(tools/voice-cast.json)이 예전부터 그렇게 해 온 방식이다.          │
 * │ 목소리 id 는 비밀이 아니다 — 계정 안의 이름표다. 비밀은 키뿐이다.           │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * 환경 변수가 있으면 **그쪽이 이긴다** — 다른 계정으로 돌리거나 잠깐 갈아 볼 때를 위해
 * 문은 열어 둔다. 여는 것은 선택이고, 안 열면 이 목소리다.
 *
 * Ethan 은 이 저장소에서 「낮고 진중한 남성」으로 이미 한 번 골린 목소리다
 * (voice-cast.json 의 과학자 — 2026-08-30 사용자가 /tts 후보 찾기에서 직접 고른 것).
 */
const LEADER_VOICE = 'K349x43DIDecCYoQWw7U';

/**
 * 이 갈래가 쓸 목소리. 갈래 전용 → 기본 환경 변수 → 위의 Ethan 순으로 떨어진다.
 * (위 머리말의 쉼표 방어가 여기 그대로 걸린다 — 어느 자리든 목록이 들어오면 첫 번째만 쓴다)
 */
export function broadcastVoiceId(env: TtsEnv, kind: BroadcastKind): string {
  const perKind = {
    announce: env.ELEVENLABS_VOICE_ID_ANNOUNCE,
    readout: env.ELEVENLABS_VOICE_ID_READOUT,
    alarm: env.ELEVENLABS_VOICE_ID_ALARM,
  }[kind];
  return firstId(perKind) ?? firstId(env.ELEVENLABS_VOICE_ID) ?? LEADER_VOICE;
}

export async function handleTts(request: Request, env: TtsEnv): Promise<Response> {
  if (request.method !== 'POST') return fail('POST 만 받는다', 405);
  if (!env.ELEVENLABS_API_KEY) {
    return fail('ELEVENLABS_API_KEY 가 없다 — 로컬은 .dev.vars, 배포는 wrangler secret 으로 넣는다', 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('본문이 JSON 이 아니다', 400);
  }

  const { text, kind, voiceId, settings, model, format } = (body ?? {}) as TtsBody;

  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return fail('text 가 비었다', 400);
  if (clean.length > MAX_CHARS) return fail(`text 가 너무 길다 (${clean.length}자 > ${MAX_CHARS}자)`, 400);

  // 모르는 종류는 거절하지 않고 일반 방송으로 읽는다 — 소리가 안 나는 것보다 낫다
  const tone = kind && BROADCAST_KINDS.includes(kind) ? kind : 'announce';

  // 「보이스가 없다」 503 은 없앴다 — 목소리가 소스에 있어서(LEADER_VOICE) 빌 수가 없다
  const voice = voiceId ?? broadcastVoiceId(env, tone);

  const upstream = await fetch(`${API}/${encodeURIComponent(voice)}?output_format=${format && FORMATS.includes(format) ? format : FORMAT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'xi-api-key': env.ELEVENLABS_API_KEY },
    body: JSON.stringify({
      text: clean,
      model_id: model && MODELS.includes(model) ? model : MODEL,
      voice_settings: toneSettings(tone, settings),
    }),
  });

  if (!upstream.ok) {
    // 조용히 삼키지 않는다 — 키·보이스·크레딧 중 무엇이 막혔는지는 저쪽 본문에만 적혀 있다
    const detail = await upstream.text();
    // 로그에도 남긴다 — 사유를 본문에 실어 보내도 부르는 쪽이 전부 조용히 넘기므로
    // (TtsPlayer 는 폴백으로, 프롤로그는 무음으로), wrangler 터미널에는 502 만 벽처럼 찍혔다
    console.error(`[tts] elevenlabs ${upstream.status} (${tone}/${voice}): ${detail.slice(0, 300)}`);
    return fail(`elevenlabs ${upstream.status}: ${detail.slice(0, 300)}`, 502);
  }

  return new Response(upstream.body, {
    headers: {
      'content-type': 'audio/mpeg',
      // 같은 문장은 같은 소리다. 브라우저가 다시 받지 않게 해서 크레딧을 아낀다
      'cache-control': 'public, max-age=86400',
    },
  });
}

/**
 * 지금 워커가 갈래마다 쓰는 목소리 — /tts 의 「관리 AI 세 톤」 칸.
 *
 * 화면이 제 손에 든 값을 그리면 **워커가 실제로 쓰는 것과 어긋나도 모른다.** 환경 변수를
 * 넣고 재시작을 안 했거나, 갈래 전용을 비워 둬서 기본으로 떨어지는 경우가 그렇다 —
 * 둘 다 「분명히 골랐는데 소리가 그대로」로 나타나고, 화면만 보면 원인을 알 수 없다.
 * 그래서 **워커에게 직접 묻는다.**
 *
 * 목소리 id 는 비밀이 아니라(계정 안의 이름표다) 개발 스위치 뒤에 두지 않는다 —
 * 좌석 명부(seat-voice.ts)와 다른 점이다. 저쪽은 판마다 섞는 배정표라 안 내려보낸다.
 */
export async function handleTtsLeader(request: Request, env: TtsEnv): Promise<Response> {
  if (request.method !== 'GET') return fail('GET 만 받는다', 405);

  const names: Record<string, string> = {};
  if (env.ELEVENLABS_API_KEY) {
    const up = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
    });
    if (up.ok) {
      const data = (await up.json()) as { voices?: { voice_id: string; name: string }[] };
      for (const v of data.voices ?? []) names[v.voice_id] = v.name;
    }
  }

  const tones = BROADCAST_KINDS.map((kind) => {
    const own = firstId(
      { announce: env.ELEVENLABS_VOICE_ID_ANNOUNCE, readout: env.ELEVENLABS_VOICE_ID_READOUT, alarm: env.ELEVENLABS_VOICE_ID_ALARM }[
        kind
      ],
    );
    const id = broadcastVoiceId(env, kind);
    return {
      kind,
      id,
      name: names[id] ?? '',
      known: id in names,
      /** 갈래 전용을 따로 넣었나, 기본 하나를 같이 쓰나 — 「골랐는데 안 바뀐다」가 여기서 갈린다 */
      own: Boolean(own),
      /**
       * 어디서 온 목소리인가 — 'kind'(갈래 전용) · 'env'(기본 환경 변수) · 'default'(소스).
       * 「환경 변수를 넣었는데 왜 그대로지」와 「아무것도 안 넣었는데 왜 소리가 나지」가
       * 여기서 갈린다. 둘 다 화면만 보면 알 수 없는 자리다.
       */
      source: own ? 'kind' : firstId(env.ELEVENLABS_VOICE_ID) ? 'env' : 'default',
      settings: VOICE_SETTINGS[kind],
      envVar: KIND_VOICE_VAR[kind],
    };
  });

  return new Response(JSON.stringify({ tones }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * 계정이 쓸 수 있는 목소리 목록 — /tts 의 A/B 용.
 *
 * 상류 응답을 그대로 흘리지 않는다. 거기에는 공유 설정·소유자 식별자·요금 배수까지
 * 들어 있어서, 화면에 필요 없는 계정 정보가 브라우저로 새 나간다. 셋만 추려 보낸다.
 */
export async function handleTtsVoices(request: Request, env: TtsEnv): Promise<Response> {
  if (request.method !== 'GET') return fail('GET 만 받는다', 405);
  if (!env.ELEVENLABS_API_KEY) return fail('ELEVENLABS_API_KEY 가 없다', 503);

  const upstream = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
  });
  if (!upstream.ok) {
    const detail = await upstream.text();
    return fail(`elevenlabs ${upstream.status}: ${detail.slice(0, 300)}`, 502);
  }

  const data = (await upstream.json()) as {
    voices?: { voice_id: string; name: string; category?: string }[];
  };
  const voices = (data.voices ?? []).map((v) => ({
    id: v.voice_id,
    name: v.name,
    category: v.category ?? '',
  }));

  return new Response(JSON.stringify({ voices }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * Voice Library 검색 — /tts 의 "후보 찾기" 용. 계정에 추가하기 전에 훑는 자리라
 * 상류는 shared-voices(공유 라이브러리)다.
 *
 * 쿼리는 셋만 통과시킨다(search·gender·age). 언어는 ko 로 못 박는다 — 이 게임의
 * 대사는 한국어고, 열어 두면 이 프록시가 범용 라이브러리 브라우저가 된다.
 * 응답도 상류를 그대로 흘리지 않는다 — 필요한 것만 추린다. ownerId 를 남기는 이유는
 * 캐스팅(voice-cast.json 의 library 항목)과 계정 추가 API 가 그걸 요구해서다.
 */
export async function handleTtsLibrary(request: Request, env: TtsEnv): Promise<Response> {
  if (request.method !== 'GET') return fail('GET 만 받는다', 405);
  if (!env.ELEVENLABS_API_KEY) return fail('ELEVENLABS_API_KEY 가 없다', 503);

  const q = new URL(request.url).searchParams;
  const up = new URLSearchParams({ language: 'ko', page_size: '20' });
  for (const key of ['search', 'gender', 'age'] as const) {
    const v = (q.get(key) ?? '').trim();
    if (v) up.set(key, v);
  }

  const upstream = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${up}`, {
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
  });
  if (!upstream.ok) {
    const detail = await upstream.text();
    return fail(`elevenlabs ${upstream.status}: ${detail.slice(0, 300)}`, 502);
  }

  const data = (await upstream.json()) as {
    voices?: {
      voice_id: string;
      name: string;
      public_owner_id: string;
      preview_url?: string;
      gender?: string;
      age?: string;
      accent?: string;
      descriptive?: string;
      use_case?: string;
    }[];
  };
  const voices = (data.voices ?? []).map((v) => ({
    id: v.voice_id,
    name: v.name,
    ownerId: v.public_owner_id,
    previewUrl: v.preview_url ?? '',
    gender: v.gender ?? '',
    age: v.age ?? '',
    accent: v.accent ?? '',
    descriptive: v.descriptive ?? '',
    useCase: v.use_case ?? '',
  }));

  return new Response(JSON.stringify({ voices }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function fail(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

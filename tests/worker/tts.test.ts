/**
 * 방송 합성 프록시 — 상류로 나가기 **전에** 걸러야 하는 것들.
 *
 * vitest.config.ts 는 "서버 동작을 목으로 흉내 내면 로컬만 초록불이 된다"고 경고한다.
 * 그래서 서버를 흉내 내지 않는다 — `handleTts` 는 (Request, Env) → Response 인 순수 함수라
 * 그대로 부른다. 목으로 막는 것은 **ElevenLabs 로 나가는 fetch 하나뿐**이고, 이유는
 * 흉내가 아니라 돈이다. 테스트가 진짜로 합성을 시키면 실행할 때마다 크레딧이 나간다.
 *
 * 그래서 여기서 제일 중요한 검사는 "몇 번 응답하나"가 아니라
 * **거절해야 할 요청에서 fetch 가 아예 안 불렸나** 다. 글자 수 천장이 새면 요금이 샌다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleTts, handleTtsLibrary, handleTtsVoices, type TtsEnv } from '../../worker/src/tts';

/** 보이스 ID 는 실제 모양(ASCII)으로 둔다 — 한글로 두면 경로 인코딩에 걸려 테스트만 깨진다 */
const ENV: TtsEnv = { ELEVENLABS_API_KEY: 'test-key-절대-새면-안-된다', ELEVENLABS_VOICE_ID: '21m00Tcm4TlvDq8ikWAM' };
const PICKED = 'pNInz6obpgDQGcFmaJgB';

/** 상류를 대신하는 가짜 — 무엇으로 불렸는지 들여다보려고 호출을 모아 둔다 */
let calls: { url: string; init: RequestInit }[] = [];

function stubUpstream(res: () => Response) {
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(res());
  });
}

const ok = () => new Response(new Uint8Array([0xff, 0xfb, 0x00]), { status: 200 });

const post = (body: unknown) =>
  new Request('https://x/api/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/** 상류로 보낸 요청 본문 */
const sent = () => JSON.parse(calls[0].init.body as string);

beforeEach(() => {
  calls = [];
  stubUpstream(ok);
});
afterEach(() => vi.unstubAllGlobals());

describe('거절 — 상류를 부르지 않아야 한다', () => {
  it('POST 가 아니면 405', async () => {
    const res = await handleTts(new Request('https://x/api/tts'), ENV);
    expect(res.status).toBe(405);
    expect(calls).toHaveLength(0);
  });

  it('키가 없으면 503 — 본문을 읽기도 전에 막는다', async () => {
    const res = await handleTts(post({ text: '안녕' }), { ELEVENLABS_VOICE_ID: 'v' });
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it('본문이 JSON 이 아니면 400', async () => {
    const res = await handleTts(post('{{{'), ENV);
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('읽을 게 없으면 400 — 공백만 있는 것도 빈 것이다', async () => {
    const res = await handleTts(post({ text: '   \n ' }), ENV);
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('천장(300자)을 넘으면 자르지 않고 400 — 여기가 새면 요금이 샌다', async () => {
    const res = await handleTts(post({ text: '가'.repeat(301) }), ENV);
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  /**
   * 예전에는 여기서 503 이었다 — 「보이스가 없다」. 이제 관리 AI 목소리가 **소스에** 있어서
   * (worker/src/tts.ts 의 LEADER_VOICE = Ethan, 2026-09-05 사용자) 그 상태가 존재하지 않는다.
   * 환경 변수를 비워 두는 것이 정상이고, 그때도 시설은 말한다 — 넣은 사람과 안 넣은 사람이
   * 다른 게임을 하지 않게 하려는 것이 그 변경의 요지였다.
   */
  it('환경 변수가 비어도 말한다 — 목소리가 소스에 있다', async () => {
    stubUpstream(() => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } }));
    const res = await handleTts(post({ text: '안녕' }), { ELEVENLABS_API_KEY: 'k' });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    // 상류로 간 것이 그 목소리인가 — 기본값이 조용히 바뀌면 시설 목소리가 통째로 바뀐다
    expect(calls[0].url).toContain('K349x43DIDecCYoQWw7U');
  });

  it('키는 어떤 응답에도 실려 나가지 않는다', async () => {
    stubUpstream(() => new Response('상류가 화났다', { status: 401 }));
    for (const req of [
      new Request('https://x/api/tts'),
      post('{{{'),
      post({ text: '' }),
      post({ text: '가'.repeat(301) }),
      post({ text: '정상 문장이다.' }),
    ]) {
      const body = await (await handleTts(req, ENV)).text();
      expect(body).not.toContain(ENV.ELEVENLABS_API_KEY);
    }
  });
});

describe('통과 — 상류로 무엇을 보내나', () => {
  it('오디오를 그대로 흘려보낸다', async () => {
    const res = await handleTts(post({ text: '전 노드는 중앙 라인에 정렬한다.' }), ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xfb, 0x00]));
  });

  it('키는 헤더로 가고 URL 에는 없다', async () => {
    await handleTts(post({ text: '안녕하다.' }), ENV);
    expect((calls[0].init.headers as Record<string, string>)['xi-api-key']).toBe(ENV.ELEVENLABS_API_KEY);
    expect(calls[0].url).not.toContain(ENV.ELEVENLABS_API_KEY!);
    expect(calls[0].url).toContain(ENV.ELEVENLABS_VOICE_ID!);
  });

  it('공백을 정리한 문장을 보낸다 — 큐에 담긴 것과 같은 문장이어야 한다', async () => {
    await handleTts(post({ text: '  두 칸   띄었다.\n다음 줄이다.  ' }), ENV);
    expect(sent().text).toBe('두 칸 띄었다. 다음 줄이다.');
  });

  it('경보는 안내 방송보다 빠르게 읽는다', async () => {
    await handleTts(post({ text: '경보다.', kind: 'alarm' }), ENV);
    const alarm = sent().voice_settings;
    calls = [];
    await handleTts(post({ text: '안내다.', kind: 'announce' }), ENV);
    expect(alarm.speed).toBeGreaterThan(sent().voice_settings.speed);
  });

  it('모르는 종류는 거절하지 않고 일반 방송으로 읽는다 — 소리가 안 나는 것보다 낫다', async () => {
    await handleTts(post({ text: '안녕하다.', kind: '없는종류' }), ENV);
    const unknown = sent().voice_settings;
    calls = [];
    await handleTts(post({ text: '안녕하다.', kind: 'announce' }), ENV);
    expect(unknown).toEqual(sent().voice_settings);
  });

  it('본문의 voiceId 가 기본 목소리를 이긴다 — /tts 에서 목소리를 갈아 듣는 자리다', async () => {
    await handleTts(post({ text: '안녕하다.', voiceId: PICKED }), ENV);
    expect(calls[0].url).toContain(PICKED);
    expect(calls[0].url).not.toContain(ENV.ELEVENLABS_VOICE_ID!);
  });
});

/**
 * 배역 시청 — /tts 가 대본 화자의 발성(voice-cast.json 의 settings)과 모델을 실어 보낸다.
 * 이게 안 통과되면 시청에서 들은 소리와 구워진 클립의 소리가 달라져, 고른 목소리를 믿을 수 없다.
 */
describe('배역 발성 — 본문 settings·model', () => {
  it('본문 settings 가 종류 기본값을 이긴다', async () => {
    await handleTts(post({ text: '안녕하다.', settings: { stability: 0.55, style: 0.2 } }), ENV);
    expect(sent().voice_settings.stability).toBe(0.55);
    expect(sent().voice_settings.style).toBe(0.2);
    // 안 보낸 축은 종류 기본값 그대로
    expect(sent().voice_settings.similarity_boost).toBe(0.75);
  });

  it('범위를 벗어난 값은 자른다 — 소리가 깨지는 것을 막는다', async () => {
    await handleTts(post({ text: '안녕하다.', settings: { speed: 5, stability: -1 } }), ENV);
    expect(sent().voice_settings.speed).toBe(1.2);
    expect(sent().voice_settings.stability).toBe(0);
  });

  it('모르는 축·숫자 아닌 값은 상류로 흘리지 않는다', async () => {
    await handleTts(post({ text: '안녕하다.', settings: { use_speaker_boost: true, hacked: 1, stability: '높게' } }), ENV);
    expect(sent().voice_settings.hacked).toBeUndefined();
    expect(sent().voice_settings.use_speaker_boost).toBeUndefined();
    expect(sent().voice_settings.stability).toBe(0.85); // 문자열은 무시 → announce 기본
  });

  it('목록에 있는 모델은 그대로, 그 밖은 기본으로', async () => {
    await handleTts(post({ text: '안녕하다.', model: 'eleven_multilingual_v2' }), ENV);
    expect(sent().model_id).toBe('eleven_multilingual_v2');
    calls = [];
    await handleTts(post({ text: '안녕하다.', model: 'eleven_v3_비싼거' }), ENV);
    expect(sent().model_id).toBe('eleven_flash_v2_5');
  });

  it('목록에 있는 포맷은 그대로, 그 밖은 기본으로 — 클립(44.1/64)과 같은 화질로 비교해야 한다', async () => {
    await handleTts(post({ text: '안녕하다.', format: 'mp3_44100_64' }), ENV);
    expect(calls[0].url).toContain('output_format=mp3_44100_64');
    calls = [];
    await handleTts(post({ text: '안녕하다.', format: 'pcm_44100_고급' }), ENV);
    expect(calls[0].url).toContain('output_format=mp3_22050_32');
  });
});

describe('목소리 목록 — /api/tts/voices', () => {
  const get = () => new Request('https://x/api/tts/voices');

  /** 상류가 실제로 돌려주는 모양 — 화면에 필요 없는 것이 잔뜩 섞여 있다 */
  const upstreamVoices = {
    voices: [
      {
        voice_id: 'v1',
        name: 'The Combat Veteran',
        category: 'professional',
        sharing: { free_users_allowed: false, rate: 2, owner_id: 'someone-else' },
        settings: { stability: 0.5 },
      },
    ],
  };

  it('POST 는 받지 않는다', async () => {
    const res = await handleTtsVoices(new Request('https://x/api/tts/voices', { method: 'POST' }), ENV);
    expect(res.status).toBe(405);
    expect(calls).toHaveLength(0);
  });

  it('키가 없으면 503', async () => {
    const res = await handleTtsVoices(get(), {});
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it('셋만 추려 보낸다 — 상류 응답을 그대로 흘리면 계정 정보가 새 나간다', async () => {
    stubUpstream(() => new Response(JSON.stringify(upstreamVoices), { status: 200 }));
    const { voices } = await (await handleTtsVoices(get(), ENV)).json();
    expect(voices).toEqual([{ id: 'v1', name: 'The Combat Veteran', category: 'professional' }]);

    // 소유자·요금 배수·공유 설정은 브라우저로 가지 않는다
    const body = JSON.stringify(voices);
    for (const leaked of ['owner_id', 'someone-else', 'free_users_allowed', 'settings']) {
      expect(body).not.toContain(leaked);
    }
  });

  it('키는 헤더로만 가고 응답에는 없다', async () => {
    stubUpstream(() => new Response(JSON.stringify(upstreamVoices), { status: 200 }));
    const body = await (await handleTtsVoices(get(), ENV)).text();
    expect((calls[0].init.headers as Record<string, string>)['xi-api-key']).toBe(ENV.ELEVENLABS_API_KEY);
    expect(body).not.toContain(ENV.ELEVENLABS_API_KEY);
  });

  it('상류가 실패하면 502 로 바꾸되 사유는 남긴다', async () => {
    stubUpstream(() => new Response('{"detail":"missing_permissions"}', { status: 401 }));
    const res = await handleTtsVoices(get(), ENV);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain('missing_permissions');
  });
});

/**
 * 후보 찾기 — /api/tts/library. 공유 라이브러리 검색의 프록시라
 * 여기서 지킬 것은 "무엇이 상류로 가고, 무엇이 브라우저로 오는가"다.
 */
describe('후보 찾기 — /api/tts/library', () => {
  const get = (qs = '') => new Request(`https://x/api/tts/library${qs}`);

  const upstreamShared = {
    voices: [
      {
        voice_id: 'sv1',
        name: '깊은 목소리',
        public_owner_id: 'owner-hash',
        preview_url: 'https://cdn/preview.mp3',
        gender: 'male',
        age: 'middle_aged',
        accent: 'standard',
        descriptive: 'calm',
        use_case: 'narrative_story',
        rate: 2,
        free_users_allowed: false,
        featured: true,
      },
    ],
  };

  it('POST 는 받지 않고, 키가 없으면 503 — 상류를 부르지 않는다', async () => {
    expect((await handleTtsLibrary(new Request('https://x/api/tts/library', { method: 'POST' }), ENV)).status).toBe(405);
    expect((await handleTtsLibrary(get(), {})).status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it('언어는 ko 로 못 박고, 허용한 쿼리(search·gender·age)만 상류로 간다', async () => {
    stubUpstream(() => new Response(JSON.stringify(upstreamShared), { status: 200 }));
    await handleTtsLibrary(get('?search=deep&gender=male&age=middle_aged&language=en&page_size=999&hack=1'), ENV);
    const sent = new URL(calls[0].url).searchParams;
    expect(sent.get('language')).toBe('ko');
    expect(sent.get('page_size')).toBe('20');
    expect(sent.get('search')).toBe('deep');
    expect(sent.get('gender')).toBe('male');
    expect(sent.get('age')).toBe('middle_aged');
    expect(sent.get('hack')).toBeNull();
  });

  it('필요한 필드만 추려 보낸다 — 요금 배수·공유 설정은 브라우저로 가지 않는다', async () => {
    stubUpstream(() => new Response(JSON.stringify(upstreamShared), { status: 200 }));
    const { voices } = await (await handleTtsLibrary(get(), ENV)).json();
    expect(voices).toEqual([
      {
        id: 'sv1',
        name: '깊은 목소리',
        ownerId: 'owner-hash', // 캐스팅(voice-cast.json)과 계정 추가 API 가 요구한다
        previewUrl: 'https://cdn/preview.mp3',
        gender: 'male',
        age: 'middle_aged',
        accent: 'standard',
        descriptive: 'calm',
        useCase: 'narrative_story',
      },
    ]);
    const body = JSON.stringify(voices);
    for (const leaked of ['rate', 'free_users_allowed', 'featured']) expect(body).not.toContain(leaked);
  });

  it('키는 헤더로만 가고, 상류 실패는 502 로 바꾸되 사유는 남긴다', async () => {
    stubUpstream(() => new Response('{"detail":"missing_permissions"}', { status: 401 }));
    const res = await handleTtsLibrary(get(), ENV);
    expect((calls[0].init.headers as Record<string, string>)['xi-api-key']).toBe(ENV.ELEVENLABS_API_KEY);
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).toContain('missing_permissions');
    expect(body).not.toContain(ENV.ELEVENLABS_API_KEY);
  });
});

describe('상류가 실패하면', () => {
  it('502 로 바꾸되 사유는 삼키지 않는다 — 키·보이스·크레딧 중 무엇인지 저쪽 본문에만 있다', async () => {
    stubUpstream(() => new Response('{"detail":"voice_not_found"}', { status: 404 }));
    const res = await handleTts(post({ text: '안녕하다.' }), ENV);
    expect(res.status).toBe(502);
    const { error } = await res.json();
    expect(error).toContain('404');
    expect(error).toContain('voice_not_found');
  });
});

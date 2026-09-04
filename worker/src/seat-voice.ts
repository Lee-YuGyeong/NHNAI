/**
 * 참가자 좌석 음성 — 서명된 클립 토큰 + 엣지 캐시 (docs/VOICE.md §5, §6).
 *
 *   GET /api/tts/clip?c=<토큰>   → audio/mpeg
 *
 * `tts.ts`(리더 방송)와 **한 파일에 두지 않는다.** 두 쪽의 폴백 원칙이 정면으로 반대라서다
 * (docs/VOICE.md §8): 방송은 「침묵보다는 나쁜 목소리가 낫다」이고, 참가자는 「한 좌석만
 * 다른 목소리로 들리느니 방 전체가 조용한 편이 낫다」이다. 섞어 두면 읽는 사람이 매번
 * 어느 쪽 규칙인지 판단해야 한다.
 *
 * ── 왜 POST 가 아니라 서명된 GET 인가 ──
 *
 * ① **돈.** 방 안 아홉 명이 같은 줄을 각자 합성하면 한 줄에 크레딧이 아홉 번 나간다.
 *    토큰 문자열이 아홉 명에게 **똑같이** 나가므로 URL 도 같고, 엣지 캐시가 여덟 번을
 *    받아낸다 — 한 줄에 합성 한 번.
 * ② **같은 방에 있게 하려고.** 아홉 번의 왕복이 제각각이면 클라이언트마다 누가 먼저
 *    말한 것처럼 들리는지가 달라진다. 같은 판을 보는 사람들이 다른 방에 있게 된다.
 * ③ **예산을 위조 불가능하게.** 지금의 POST /api/tts 는 누구나 아무 문장이나 밀어 넣을 수
 *    있다 — 콘솔에서 반복하면 그대로 크레딧이다. 여기서는 **DO 가 서명한 문장만** 합성된다.
 *    그래서 §6 의 방당 예산이 클라이언트의 선의에 기대지 않는다.
 *
 * ★ 미리 굽지 않는다. AI 참가자의 대사는 서버가 만드니 중계 **전에** 클립을 구워 둘 수도
 *   있는데, 그러면 그 줄만 캐시가 이미 더워져 있어서 남들보다 빨리 소리가 나기 시작한다.
 *   「쟤는 항상 반 박자 빠르게 들려」가 곧 AI 표다 (P11). 토큰은 chat 릴레이 그 시점에만 만든다.
 */

const API = 'https://api.elevenlabs.io/v1/text-to-speech';

/** 지연이 곧 기능이다 — 발언권의 지각 폐기가 8초라(features/voice/floor.ts) 품질 모델을 쓸 여유가 없다 */
const MODEL = 'eleven_flash_v2_5';

/**
 * 방송(22kHz/32kbps)보다 높다. 저쪽은 브라우저에서 확성기 대역으로 밴드패스를 먹여 위쪽을
 * 어차피 버리지만, 참가자 목소리는 **필터가 없는 원음**이라 그 대역이 그대로 들린다.
 * 대본 클립(tools/voice-cast.json 의 format)과 같은 값이다.
 */
const FORMAT = 'mp3_44100_64';

/**
 * 발성 — **9석 전부 같은 한 벌이다** (docs/VOICE.md §3).
 *
 * 목소리마다 발성을 다듬고 싶어지지만, 그러면 「이 자리는 유난히 또박또박하다」가 생기고
 * 그건 좌석 순열로도 못 지운다. 다른 것은 성대뿐이어야 한다.
 *
 * 방송용 값(tts.ts 의 VOICE_SETTINGS)과 다른 이유: 저쪽은 감정 없는 관제 방송이라
 * stability 0.85 · style 0 으로 **일부러 단조롭게** 만든다. 이쪽은 방에서 사람이 하는
 * 말이라 그 톤이면 전원이 안내 방송처럼 들린다.
 */
const SEAT_SETTINGS: Record<string, number> = {
  stability: 0.5,
  similarity_boost: 0.8,
  style: 0.15,
  speed: 1.0,
};

/**
 * 한 줄 글자 상한 — 클라이언트(features/voice/floor.ts 의 maxChars)가 이미 걸러 보내지만,
 * 여기서도 막는다. 저쪽은 소리를 다듬는 규칙이고 이쪽은 요금이 새는 것을 막는 천장이다.
 * 넘으면 자르지 않고 거절한다 — 자르면 읽은 사람과 들은 사람이 다른 주장을 갖게 된다.
 */
const MAX_CHARS = 120;

/** 토큰 수명. 짧게 둔다 — 발언권이 8초 안에 안 틀면 어차피 버리는 줄이다 */
export const CLIP_TTL_MS = 10 * 60_000;

export interface SeatVoiceEnv {
  ELEVENLABS_API_KEY?: string;
  /**
   * 좌석 목소리 명부 — ElevenLabs voice id 를 쉼표로 나열한다 (docs/VOICE.md §3).
   * 순서가 곧 명부 번호(0부터)다. 아홉 개를 채우는 것이 기본이고, 모자라면 그 방은
   * 조용해진다 — 일부 좌석만 소리가 나는 것보다 낫다(P11).
   */
  ELEVENLABS_SEAT_VOICE_IDS?: string;
  /**
   * 관리 AI 방송 목소리 **하나**(worker/src/tts.ts). 여기 쉼표로 여럿이 들어 있으면
   * 명부로도 읽어 준다 (seatVoiceIds 머리말) — 흔한 오해라 막지 않고 받아 준다.
   */
  ELEVENLABS_VOICE_ID?: string;
  /**
   * 클립 토큰 서명 열쇠. 없으면 ELEVENLABS_API_KEY 에서 파생한다 —
   * 키가 있어야 합성이 되니, 이렇게 두면 **새 실패 지점이 생기지 않는다.**
   * 따로 돌리고 싶을 때만 채운다.
   */
  TTS_CLIP_SECRET?: string;
  /**
   * '1' 이면 /voice 시연 화면이 토큰을 직접 받아 갈 수 있다 (handleSeatClipMint).
   *
   * **기본은 꺼짐이고, 배포에서는 켜지 않는다.** 켜면 브라우저가 아무 문장이나 서명받을 수
   * 있어서, 이 파일이 애초에 막으려던 「콘솔에서 크레딧 태우기」가 다시 열린다.
   * 게임 본체(RoomDO)가 서면 토큰은 거기서 나오고 이 자리는 사라진다.
   */
  SEAT_VOICE_DEV?: string;
}

/** 토큰이 실어 나르는 것. 좌석 번호도, 역할도 없다 — 워커는 누가 말하는지 알 필요가 없다 */
export interface ClipPayload {
  /** 명부에서의 자리 번호 (features/voice/roster.ts 의 VoiceIndex) */
  v: number;
  /** 읽을 문장 */
  t: string;
  /** 만료 시각 (epoch ms) */
  x: number;
}

/* ─────────────────────────── 서명 ─────────────────────────── */

const enc = new TextEncoder();

function secretOf(env: SeatVoiceEnv): string | null {
  return env.TTS_CLIP_SECRET || env.ELEVENLABS_API_KEY || null;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Uint8Array {
  const p = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(p + '='.repeat((4 - (p.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * 클립 토큰을 만든다 — **RoomDO 가 chat 을 중계하는 그 시점에** 부른다.
 * 같은 문장·같은 목소리·같은 만료면 같은 문자열이라, 방 전체가 같은 URL 을 두드린다.
 */
export async function mintClip(payload: ClipPayload, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

/** 토큰을 읽는다. 서명이 틀렸거나 만료됐거나 모양이 깨졌으면 null — 이유는 알려주지 않는다 */
export async function readClip(token: string, secret: string, now: number): Promise<ClipPayload | null> {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  let ok = false;
  try {
    // crypto.subtle.verify 는 상수 시간이다 — 직접 문자열 비교하면 타이밍이 샌다
    ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64url(sig), enc.encode(body));
  } catch {
    return null; // base64 가 깨졌다
  }
  if (!ok) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(unb64url(body)));
  } catch {
    return null;
  }

  const p = payload as ClipPayload;
  if (!p || typeof p.v !== 'number' || !Number.isInteger(p.v) || p.v < 0) return null;
  if (typeof p.t !== 'string' || !p.t.trim()) return null;
  if (typeof p.x !== 'number' || p.x < now) return null;
  return p;
}

/* ─────────────────────────── 방당 예산 ─────────────────────────── */

/**
 * 한 판에 소리로 낼 수 있는 글자 수 (docs/VOICE.md §6).
 *
 * 토론 가능 시간이 한 판에 2~4분이고 동시 2겹이라 실제 소비는 2,500자 남짓이다.
 * 그 1.5배쯤으로 둔다 — 정상적인 판은 여기 닿지 않고 폭주만 걸린다.
 */
export const CLIP_BUDGET_CHARS = 4_000;

export interface ClipBudget {
  /** 이 줄을 소리로 낼 수 있나. 낼 수 있으면 예산에서 깎고 true */
  take(chars: number): boolean;
  spent(): number;
  /** 이미 바닥났나 — 방에 「음성 계통 정지」를 한 번만 알리려고 본다 */
  exhausted(): boolean;
}

export function createClipBudget(limit: number = CLIP_BUDGET_CHARS): ClipBudget {
  let spent = 0;
  let off = false;

  return {
    take(chars) {
      /*
       * ★ 한 번 바닥나면 **그대로 잠근다.** 남은 예산과 줄 길이를 매번 비교하면, 예산
       * 끝물에 긴 줄만 떨어지고 짧은 줄은 계속 울어서 **「말 짧게 하는 자리만 소리가 난다」**는
       * 편향이 생긴다. 그건 좌석이 아니라 말버릇을 타는 편향이지만, 방에서는 좌석 편향과
       * 구별되지 않는다 — 「쟤만 계속 들린다」로 읽힌다 (P11).
       * 꺼질 때는 방 전체가 같은 줄부터 같이 꺼져야 한다.
       */
      if (off) return false;
      if (spent + chars > limit) {
        off = true;
        return false;
      }
      spent += chars;
      return true;
    },
    spent: () => spent,
    exhausted: () => off,
  };
}

/* ─────────────────────────── 엔드포인트 ─────────────────────────── */

/**
 * 개발용 경로를 열었나 (SEAT_VOICE_DEV).
 *
 * `=== '1'` 로 못박아 뒀더니 실제로 걸렸다 (2026-09-04): 켠 줄 알았는데 안 켜져서 화면에는
 * 「워커가 떠 있는지 확인한다」만 뜨고, 워커는 멀쩡히 떠 있었다. 켜는 값이 한 글자만
 * 달라도(true · yes · 따옴표) 같은 증상이라, **원인이 값에 있다는 걸 화면으로는 알 수가 없다.**
 *
 * 이건 로컬 개발 스위치지 보안 경계가 아니다 — 배포에 안 넣는 것이 경계다. 그러니 느슨하게
 * 받고, 대신 **끄는 쪽을 명시적으로** 둔다(빈 값 · 0 · false 는 꺼짐).
 */
function devOpen(raw: string | undefined): boolean {
  const v = (raw ?? '').trim().replace(/^["']|["']$/g, '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function splitIds(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 명부를 어디서 읽었나 — 화면이 「옮기는 게 낫다」를 말해 주려고 (handleSeatRoster) */
export type RosterSource = 'seat-ids' | 'voice-id' | 'none';

/**
 * 명부 — 순서가 곧 번호다.
 *
 * ★ `ELEVENLABS_VOICE_ID` 에 쉼표로 여럿을 넣어 둔 경우도 명부로 읽는다 (2026-09-04 사용자).
 *   그 변수는 원래 **관리 AI 방송 목소리 하나**를 담는 자리다. 거기에 아홉을 넣는 것은
 *   자연스러운 오해다 — 이름이 「보이스 아이디」니까. 못 읽은 척하고 방을 조용하게 두는 것보다
 *   읽어 주고 **화면에서 옮기라고 말하는** 편이 낫다.
 *
 *   하나만 있으면 명부로 치지 않는다. 그건 원래 용도(방송 목소리 하나) 그대로다.
 */
export function seatVoiceIds(env: SeatVoiceEnv): string[] {
  const own = splitIds(env.ELEVENLABS_SEAT_VOICE_IDS);
  if (own.length > 0) return own;
  const shared = splitIds(env.ELEVENLABS_VOICE_ID);
  return shared.length > 1 ? shared : [];
}

export function rosterSource(env: SeatVoiceEnv): RosterSource {
  if (splitIds(env.ELEVENLABS_SEAT_VOICE_IDS).length > 0) return 'seat-ids';
  if (splitIds(env.ELEVENLABS_VOICE_ID).length > 1) return 'voice-id';
  return 'none';
}

export async function handleSeatClip(
  request: Request,
  env: SeatVoiceEnv,
  ctx: { waitUntil(p: Promise<unknown>): void },
): Promise<Response> {
  if (request.method !== 'GET') return fail('GET 만 받는다', 405);
  if (!env.ELEVENLABS_API_KEY) return fail('ELEVENLABS_API_KEY 가 없다', 503);

  const secret = secretOf(env);
  if (!secret) return fail('서명 열쇠가 없다', 503);

  const token = new URL(request.url).searchParams.get('c') ?? '';
  if (!token) return fail('클립 토큰이 없다', 400);

  const clip = await readClip(token, secret, Date.now());
  // 서명이 안 맞거나 만료됐다. 왜인지는 알려주지 않는다 — 위조를 다듬는 데 쓰인다
  if (!clip) return fail('클립 토큰이 유효하지 않다', 403);

  const text = clip.t.replace(/\s+/g, ' ').trim();
  if (text.length > MAX_CHARS) return fail(`text 가 너무 길다 (${text.length}자 > ${MAX_CHARS}자)`, 400);

  const roster = seatVoiceIds(env);
  const voice = roster[clip.v];
  if (!voice) {
    // 명부가 비었거나 짧다 → 이 방은 조용해진다. 일부 좌석만 소리가 나는 것보다 낫다 (P11)
    return fail('좌석 목소리 명부가 없다 — ELEVENLABS_SEAT_VOICE_IDS 를 채운다', 503);
  }

  /*
   * 엣지 캐시. 방 안 아홉 명이 같은 URL 을 두드리므로, 먼저 도착한 하나만 상류로 나간다.
   * 키는 요청 URL 이고 그 안에 문장·목소리가 서명된 채로 들어 있으니 충돌하지 않는다.
   */
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  const upstream = await fetch(`${API}/${encodeURIComponent(voice)}?output_format=${FORMAT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'xi-api-key': env.ELEVENLABS_API_KEY },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: SEAT_SETTINGS }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    return fail(`elevenlabs ${upstream.status}: ${detail.slice(0, 300)}`, 502);
  }

  const res = new Response(upstream.body, {
    headers: {
      'content-type': 'audio/mpeg',
      // 토큰 수명과 맞춘다 — 만료된 토큰의 소리를 캐시가 들고 있을 이유가 없다
      'cache-control': `public, max-age=${Math.floor(CLIP_TTL_MS / 1000)}`,
    },
  });
  ctx.waitUntil(cache.put(request, res.clone()));
  return res;
}

/**
 * 지금 워커에 들어간 명부를 돌려준다 (/tts 의 「설정된 명부」) — **개발에서만.**
 *
 * 진짜 판에서 배정표는 클라이언트로 **절대 안 내려간다**(docs/VOICE.md §3, P8 과 같은 태도).
 * 브라우저가 받는 것은 어느 목소리인지 알 수 없는 서명 토큰뿐이다. 그래서 이 경로도
 * SEAT_VOICE_DEV 뒤에 둔다 — 명부를 채운 뒤 「제대로 들어갔나」를 눈으로 보는 자리일 뿐이다.
 *
 * id 만 돌려주면 무엇을 넣었는지 알 수 없어서, 계정 목록에서 이름을 맞춰 같이 준다.
 * 이름을 못 맞춘 id 는 **계정에 없는 것**이다 — 그 좌석은 합성에서 503 이 되고, 그러면
 * 방이 통째로 조용해진다. 그 사실이 화면에 보여야 고칠 수 있다.
 */
export async function handleSeatRoster(request: Request, env: SeatVoiceEnv): Promise<Response> {
  if (!devOpen(env.SEAT_VOICE_DEV)) return fail('없는 경로다 — SEAT_VOICE_DEV 가 꺼져 있다', 404);
  if (request.method !== 'GET') return fail('GET 만 받는다', 405);

  const ids = seatVoiceIds(env);
  const names: Record<string, string> = {};
  if (env.ELEVENLABS_API_KEY && ids.length > 0) {
    const up = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
    });
    if (up.ok) {
      const data = (await up.json()) as { voices?: { voice_id: string; name: string }[] };
      for (const v of data.voices ?? []) names[v.voice_id] = v.name;
    }
  }

  return new Response(
    JSON.stringify({
      source: rosterSource(env),
      seats: ids.map((id, index) => ({ index, id, name: names[id] ?? '', known: id in names })),
    }),
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
}

/**
 * 시연용 토큰 발급 (/voice) — **개발에서만.**
 *
 * 진짜 판에서 토큰은 RoomDO 가 chat 을 중계하며 만든다(§5). 그런데 그 게임이 아직 없어서,
 * 이게 없으면 워커 관로를 **끝까지 굴려 볼 방법이 없다** — 서명·캐시·명부가 실제로 맞물리는지
 * 확인하지 못한 채로 다음 단계를 쌓게 된다.
 *
 * SEAT_VOICE_DEV 가 '1' 이 아니면 404 다. 있는 줄도 모르게 두는 편이 맞다.
 */
export async function handleSeatClipMint(request: Request, env: SeatVoiceEnv): Promise<Response> {
  if (!devOpen(env.SEAT_VOICE_DEV)) return fail('없는 경로다 — SEAT_VOICE_DEV 가 꺼져 있다', 404);
  if (request.method !== 'POST') return fail('POST 만 받는다', 405);

  const secret = secretOf(env);
  if (!secret) return fail('서명 열쇠가 없다 — ELEVENLABS_API_KEY 나 TTS_CLIP_SECRET 이 필요하다', 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('본문이 JSON 이 아니다', 400);
  }

  const { v, text } = (body ?? {}) as { v?: unknown; text?: unknown };
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return fail('v 가 명부 번호가 아니다', 400);
  const clean = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (!clean) return fail('text 가 비었다', 400);
  if (clean.length > MAX_CHARS) return fail(`text 가 너무 길다 (${clean.length}자 > ${MAX_CHARS}자)`, 400);

  const clip = await mintClip({ v, t: clean, x: Date.now() + CLIP_TTL_MS }, secret);
  return new Response(JSON.stringify({ clip }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * 좌석 목소리 시청 (/tts 의 명부 캐스팅) — **개발에서만.**
 *
 * 명부를 짜는 동안에는 ELEVENLABS_SEAT_VOICE_IDS 가 아직 비어 있어서 명부 번호로는 부를 수가
 * 없다(닭과 달걀). 그래서 voice id 를 직접 받는다.
 *
 * ★ 중요한 것은 **이 게임이 실제로 낼 소리로 듣는 것**이다. 같은 파일의 MODEL · FORMAT ·
 *   SEAT_SETTINGS 를 그대로 쓴다 — 방송용 조리법(tts.ts: stability 0.85 · style 0 · 22kHz ·
 *   확성기 필터)으로 들려주면 게임이 안 내는 소리를 듣고 아홉을 고르게 된다.
 *   이 저장소가 이미 한 번 밟은 함정이다 (2026-08-30 「/tts 소리가 게임과 다르다」).
 *
 * 같은 목소리·같은 문장은 캐시가 받는다 — A/B 는 같은 줄을 몇 번이고 갈아 듣는 일이라,
 * 한 번 한 번이 크레딧이면 아무도 반복하지 않게 된다.
 */
export async function handleSeatAudition(
  request: Request,
  env: SeatVoiceEnv,
  ctx: { waitUntil(p: Promise<unknown>): void },
): Promise<Response> {
  if (!devOpen(env.SEAT_VOICE_DEV)) return fail('없는 경로다 — SEAT_VOICE_DEV 가 꺼져 있다', 404);
  if (request.method !== 'POST') return fail('POST 만 받는다', 405);
  if (!env.ELEVENLABS_API_KEY) return fail('ELEVENLABS_API_KEY 가 없다', 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('본문이 JSON 이 아니다', 400);
  }
  const { voiceId, text } = (body ?? {}) as { voiceId?: unknown; text?: unknown };
  if (typeof voiceId !== 'string' || !voiceId.trim()) return fail('voiceId 가 비었다', 400);
  const clean = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (!clean) return fail('text 가 비었다', 400);
  if (clean.length > MAX_CHARS) return fail(`text 가 너무 길다 (${clean.length}자 > ${MAX_CHARS}자)`, 400);

  // POST 는 본문이 캐시 열쇠가 못 된다 — 목소리·문장으로 가짜 GET 열쇠를 만든다
  const key = new Request(
    `https://seat-audition.local/${encodeURIComponent(voiceId)}/${encodeURIComponent(clean)}`,
  );
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;

  const upstream = await fetch(`${API}/${encodeURIComponent(voiceId)}?output_format=${FORMAT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'xi-api-key': env.ELEVENLABS_API_KEY },
    body: JSON.stringify({ text: clean, model_id: MODEL, voice_settings: SEAT_SETTINGS }),
  });
  if (!upstream.ok) {
    const detail = await upstream.text();
    return fail(`elevenlabs ${upstream.status}: ${detail.slice(0, 300)}`, 502);
  }

  const res = new Response(upstream.body, {
    headers: { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=86400' },
  });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

/**
 * 라이브러리 보이스를 계정에 넣는다 — **개발에서만.**
 *
 * 공유 라이브러리의 voice id 는 그대로 합성에 못 쓴다. 계정에 'Add to My Voices' 를 해야
 * 쓸 수 있는 id 가 나오고, 명부(ELEVENLABS_SEAT_VOICE_IDS)에 들어가는 것은 **그 id** 다.
 * 아홉 번 반복할 일이라 화면에서 누르게 한다.
 */
export async function handleLibraryAdd(request: Request, env: SeatVoiceEnv): Promise<Response> {
  if (!devOpen(env.SEAT_VOICE_DEV)) return fail('없는 경로다 — SEAT_VOICE_DEV 가 꺼져 있다', 404);
  if (request.method !== 'POST') return fail('POST 만 받는다', 405);
  if (!env.ELEVENLABS_API_KEY) return fail('ELEVENLABS_API_KEY 가 없다', 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('본문이 JSON 이 아니다', 400);
  }
  const { ownerId, voiceId, name } = (body ?? {}) as Record<string, unknown>;
  if (typeof ownerId !== 'string' || !ownerId.trim()) return fail('ownerId 가 비었다', 400);
  if (typeof voiceId !== 'string' || !voiceId.trim()) return fail('voiceId 가 비었다', 400);
  const label = typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : `SEAT ${voiceId.slice(0, 6)}`;

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/voices/add/${encodeURIComponent(ownerId)}/${encodeURIComponent(voiceId)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'xi-api-key': env.ELEVENLABS_API_KEY },
      body: JSON.stringify({ new_name: label }),
    },
  );
  if (!upstream.ok) {
    const detail = await upstream.text();
    return fail(`elevenlabs ${upstream.status}: ${detail.slice(0, 300)}`, 502);
  }
  // 상류가 주는 새 voice_id 가 곧 명부에 넣을 값이다
  const data = (await upstream.json().catch(() => ({}))) as { voice_id?: string };
  return new Response(JSON.stringify({ id: data.voice_id ?? '', name: label }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function fail(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

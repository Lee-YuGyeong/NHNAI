/**
 * 배역 시청 — /tts 의 배역 버튼이 **구워질 클립과 같은 조리법**을 쓰는지.
 *
 * 소리 자체(WebAudio 체인)는 여기서 못 듣는다. 지키는 것은 바깥 약속들이다:
 * voice-cast.json 과의 연결(화자 id·발성·모델), 워커 천장(300자), 줄 순환.
 * 이게 깨지면 시청에서 들은 소리와 구운 클립의 소리가 달라져, 고른 목소리를 믿을 수 없다.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../../../public/world/voice/manifest.json';
import cast from '../../../tools/voice-cast.json';
import {
  AUDITION_ROLES,
  auditionBody,
  castNameOf,
  clipKeyOf,
  gameClipOf,
  gameVoiceOf,
  lineOf,
  toneOf,
  type GameManifest,
} from '@/features/tts/audition';

describe('배역 목록', () => {
  it('네 배역 — 과학자·정부요원·경비 둘 (2026-08-30 사용자가 고르는 대상)', () => {
    expect(AUDITION_ROLES.map((r) => r.id)).toEqual(['scientist', 'agent', 'unit07', 'unit12']);
  });

  it('배역 id 는 cast 의 화자다 — 화자 이름이 바뀌면 여기가 먼저 알린다', () => {
    for (const r of AUDITION_ROLES) expect(cast.speakers).toHaveProperty(r.id);
  });

  it('줄은 둘 이상 — 한 줄만 듣고 고르면 다른 말투에서 무너지는 목소리를 못 거른다', () => {
    for (const r of AUDITION_ROLES) expect(r.lines.length).toBeGreaterThanOrEqual(2);
  });

  it('모든 줄이 워커 천장(300자) 안이다 — 넘으면 자르지 않고 거절당해 소리가 안 난다', () => {
    for (const r of AUDITION_ROLES)
      for (const line of r.lines) {
        expect(line.trim().length).toBeGreaterThan(0);
        expect(line.length).toBeLessThanOrEqual(300);
      }
  });
});

describe('lineOf — 누를 때마다 다음 줄', () => {
  const role = AUDITION_ROLES[0];

  it('차례로 돌고, 끝까지 가면 처음으로 온다', () => {
    expect(lineOf(role, 0)).toBe(role.lines[0]);
    expect(lineOf(role, 1)).toBe(role.lines[1]);
    expect(lineOf(role, role.lines.length)).toBe(role.lines[0]);
  });
});

describe('auditionBody — 워커로 나가는 본문', () => {
  it('발성과 모델을 cast 에서 그대로 싣는다', () => {
    const body = auditionBody('scientist', '통신 연결됐습니다.', 'v123');
    expect(body.settings).toEqual(cast.speakers.scientist.settings);
    expect(body.model).toBe(cast.model);
    expect(body.voiceId).toBe('v123');
    expect(body.text).toBe('통신 연결됐습니다.');
  });

  it('빈 voiceId 는 싣지 않는다 — 워커 기본 목소리(ELEVENLABS_VOICE_ID)로 읽게', () => {
    expect(auditionBody('agent', '여기는 지휘부.', '').voiceId).toBeUndefined();
  });

  it('kind 를 싣지 않는다 — settings 가 네 축을 전부 덮으니 종류 발성이 낄 자리가 없다', () => {
    expect(auditionBody('unit07', '정지.', 'v')).not.toHaveProperty('kind');
  });

  it('배역마다 제 발성이다 — 경비 둘도 settings 는 각자 것', () => {
    expect(auditionBody('unit07', '정지.', 'v').settings).toEqual(cast.speakers.unit07.settings);
    expect(auditionBody('unit12', '정지.', 'v').settings).toEqual(cast.speakers.unit12.settings);
  });
});

describe('castNameOf — 캐스팅 목표 표시', () => {
  it('cast 에 배정된 목소리 이름을 그대로 돌려준다', () => {
    expect(castNameOf('scientist')).toBe(cast.speakers.scientist.voice.name);
  });
});

describe('auditionBody — 포맷', () => {
  it('클립과 같은 포맷을 싣는다 — 안 실으면 방송용(22/32)으로 와서 탁하게 비교된다', () => {
    expect(auditionBody('scientist', '통신 연결됐습니다.', 'v').format).toBe(cast.format);
  });
});

/**
 * 게임 소리 — "게임과 같은 소리"의 기준은 cast 가 아니라 manifest(실제 구운 것)다.
 * 2026-08-30 시청이 게임과 다르게 들린 주범: 클립이 전부 fallback 보이스로 구워져 있었다.
 */
describe('게임 클립 찾기', () => {
  const m: GameManifest = {
    speakers: { unit07: { voice: { name: 'Freaky and Frenzy Robot', source: 'fallback' } } },
    lines: { 'unit07|정지. 식별 코드.': { file: 'unit07-abc.mp3' } },
  };

  it('열쇠는 화자|문장 그대로 — voice-lines.mjs 가 굽는 모양', () => {
    expect(clipKeyOf('unit07', '정지. 식별 코드.')).toBe('unit07|정지. 식별 코드.');
  });

  it('있으면 파일, 없으면 null', () => {
    expect(gameClipOf(m, 'unit07', '정지. 식별 코드.')).toBe('unit07-abc.mp3');
    expect(gameClipOf(m, 'unit07', '없는 대사다.')).toBeNull();
    expect(gameClipOf(null, 'unit07', '정지. 식별 코드.')).toBeNull();
  });

  it('배역의 게임 목소리 — manifest 가 없거나 화자가 없으면 null', () => {
    expect(gameVoiceOf(m, 'unit07')?.name).toBe('Freaky and Frenzy Robot');
    expect(gameVoiceOf(m, 'scientist')).toBeNull();
    expect(gameVoiceOf(null, 'unit07')).toBeNull();
  });
});

describe('실제 manifest 와의 약속', () => {
  it('시청 줄 전부에 구운 클립이 있다 — 깨지면 게임 소리 버튼이 침묵한다 (대본을 고치면 다시 굽는다)', () => {
    const real = manifest as unknown as GameManifest;
    for (const r of AUDITION_ROLES)
      for (const line of r.lines) {
        expect(gameClipOf(real, r.id, line), `${r.id}|${line}`).toBeTruthy();
      }
  });

  it('네 배역 모두 manifest 에 목소리가 적혀 있다 — 화면의 "게임:" 표시가 비지 않는다', () => {
    const real = manifest as unknown as GameManifest;
    for (const r of AUDITION_ROLES) expect(gameVoiceOf(real, r.id), r.id).toBeTruthy();
  });

  /*
   * fx·gain 은 한 벌이다 — cast(만드는 곳)와 manifest(게임이 읽는 곳).
   * manifest 는 voice-lines.mjs 가 cast 에서 복사해 굽지만, 음색만 고칠 때는 굽지 않고
   * 손으로 두 곳을 고친다(합성 크레딧이 안 드니까) — 그때 한 곳만 고치면 /tts 와 게임이
   * 다른 소리를 낸다 (2026-08-30 경비 지지직 줄이기에서 실제로 밟을 뻔한 갈래).
   */
  it('배역의 fx·gain·playRate 가 cast 와 manifest 에서 같다 — 손으로 고칠 땐 두 곳을 같이 고친다', () => {
    const real = manifest as unknown as {
      speakers: Record<string, { fx: unknown; gain?: unknown; playRate?: unknown }>;
    };
    const src = cast.speakers as unknown as Record<string, { fx: unknown; gain?: unknown; playRate?: unknown }>;
    for (const r of AUDITION_ROLES) {
      expect(real.speakers[r.id].fx, `${r.id}.fx`).toEqual(src[r.id].fx);
      expect(real.speakers[r.id].gain ?? 1, `${r.id}.gain`).toEqual(src[r.id].gain ?? 1);
      // 재생 속도가 어긋나면 음높이가 다른 소리를 듣고 고르게 된다 (기본은 재생부의 1.1)
      expect(real.speakers[r.id].playRate ?? 1.1, `${r.id}.playRate`).toEqual(src[r.id].playRate ?? 1.1);
    }
  });
});

describe('toneOf — 지금 걸린 음색을 한 줄로', () => {
  it('걸린 축을 다 적는다 — 화면에서 무엇을 듣고 있는지 보이게', () => {
    expect(toneOf('unit07')).toBe('380~3200Hz · 1.1배');
  });

  it('필터가 없는 배역은 대역을 안 적는다 — 안 거는 필터를 건 것처럼 보이면 안 된다', () => {
    expect(toneOf('scientist')).toBe('원음 · 1배');
    expect(toneOf('agent')).toBe('원음 · 1.1배');
  });

  it('안 건 축은 안 적는다 — 0 으로 적으면 건 것처럼 보인다', () => {
    for (const id of ['scientist', 'agent', 'unit07'] as const)
      for (const axis of ['저역', '중역', '포화', '회선']) expect(toneOf(id), `${id}/${axis}`).not.toContain(axis);
  });

  it('배속을 안 적은 배역은 재생부 기본(1.1)을 적는다', () => {
    expect(toneOf('unit07')).toContain('1.1배');
  });
});

/**
 * 과학자의 무게 — "목소리에 deep 한 걸 더" (2026-08-31 사용자).
 *
 * 처음엔 필터로 냈다: 대역의 아래턱을 내려(low) 재료를 남기고, 그 위를 선반으로 들어 올리고(deep),
 * 올린 만큼 출력을 낮춰(gain) 천장에 안 눌리게. 그 셋은 **무전기 대역이 깎아 먹은 것을 되돌리는**
 * 장치였다 — 무전기를 걷은 지금은 깎이는 것이 없으니 되돌릴 것도 없다 (2026-09-01 사용자).
 * 남은 무게 손잡이는 하나, 음높이를 내리는 재생 배속이다 — 그마저 한 단계 되돌려 1.0 이다
 * (2026-09-02 사용자: deep 한 단계만 올려). 손잡이는 남아 있고, 지금은 원음 자리에 있다.
 */
describe('과학자 — 낮게 깔린 목소리', () => {
  /*
   * 음높이와 말 속도는 한 손잡이에 묶여 있다 — playRate 는 둘을 같이 움직인다(AudioBufferSourceNode).
   * 그래서 음높이를 내리면 말이 느려지고, 느려진 만큼은 **클립을 빠르게 구워**(settings.speed,
   * ElevenLabs 쪽이라 음높이가 안 변한다) 갚아야 한다. 곱이 1 아래로 내려가면
   * "너무 늦어 답답하다"(2026-08-30 사용자)로 되돌아간다.
   */
  it('재생 배속이 1 이다 — 한 반음 내렸던 것(0.94)을 한 단계 되돌렸다 (2026-09-02 사용자), 기본 1.1 로는 안 올린다', () => {
    expect(cast.speakers.scientist.playRate).toBe(1);
  });

  it('느려진 만큼은 굽는 속도로 갚는다 — 합성 속도 x 재생 배속이 1 아래로 안 내려간다', () => {
    const { playRate, settings } = cast.speakers.scientist;
    expect(playRate * settings.speed).toBeGreaterThanOrEqual(1);
  });
});

/**
 * 사람 목소리에는 필터가 없다 — 둘 다 통신 너머에서 말하지만 **소리에는 그 필터를 안 입힌다**
 * (2026-09-01 사용자: 과학자 → 정부요원). 대역·중역 봉우리·송신기 포화·회선 잡음을 차례로
 * 줄여 보다가 통째로 걷었다.
 *
 * 프리셋과 함께 **대역(low·high)까지** 지웠는지 본다: 프리셋만 되돌리는 것으로는 소리가
 * 안 돌아오게. 남은 필터는 기계 것(robot)과 시설 방송(pa)뿐이다.
 */
describe('사람 배역 — 필터 없음', () => {
  it('과학자·정부요원 둘 다 원음이다 — 사람 목소리에 남은 필터는 없다', () => {
    for (const id of ['scientist', 'agent'] as const) {
      const fx = cast.speakers[id].fx as Record<string, unknown>;
      expect(fx.preset, id).toBe('none');
      // 대역까지 지운다 — 프리셋만 되돌려도 소리가 돌아오지 않게
      for (const axis of ['low', 'high']) expect(fx[axis], `${id}.${axis}`).toBeUndefined();
    }
  });

  it('게인이 1 이다 — 선반으로 올린 만큼 낮추던 보정이라, 올릴 것이 없어지면 같이 사라진다', () => {
    expect(cast.speakers.scientist.gain).toBe(1);
    expect(cast.speakers.agent.gain).toBe(1);
  });
});

/**
 * 무전기가 아무 데도 없다 — 화자에도, 체인에도 (2026-09-01 사용자: 과학자 → 정부요원 → 배선).
 *
 * 프리셋 하나만 보면 된다: comm 가지 자체가 없어졌으니 그 이름을 적으면 소리가 필터 없이 나간다
 * (chainFor 의 else). 그래도 **화자 쪽에서** 잠근다 — 되돌리려는 사람이 제일 먼저 손대는 자리가
 * 여기고, 여기서 막히면 배선이 없다는 것도 같이 알게 된다.
 */
describe('무전기 없음 — 화자와 배선 양쪽', () => {
  it('comm 을 적은 화자가 하나도 없다', () => {
    for (const [id, sp] of Object.entries(cast.speakers)) expect((sp.fx as { preset: string }).preset, id).not.toBe('comm');
  });

  it('무전기 축이 어느 화자에도 안 남아 있다 — 읽는 코드가 없으니 적으면 조용히 무시된다', () => {
    for (const [id, sp] of Object.entries(cast.speakers)) {
      const f = sp.fx as Record<string, unknown>;
      for (const axis of ['deep', 'deepAt', 'presence', 'presenceAt', 'drive', 'hiss', 'hissAt', 'squelch'])
        expect(f[axis], `${id}.${axis}`).toBeUndefined();
    }
  });

  it('두 재생부에 무전기 배선이 없다 — 체인도 회선 잡음도', () => {
    for (const f of ['src/features/tts/audition.ts', 'src/features/world/voice.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toContain("'comm'");
      expect(src, f).not.toContain('radioBed');
    }
  });
});

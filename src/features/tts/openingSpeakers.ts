/**
 * 오프닝 자막의 화자 — **피실험자 셋** (게임 시작 장면).
 *
 * ┌─ 좌석 아홉과 헷갈리면 안 된다 ────────────────────────────────────────────┐
 * │ 방에 앉는 아홉(features/voice, docs/VOICE.md)은 **익명**이다. 목소리가     │
 * │ 누구인지 한 글자도 흘리면 안 되고(P11), 그래서 판마다 순열로 섞고 발성값도 │
 * │ 아홉이 똑같다.                                                            │
 * │                                                                           │
 * │ 여기 셋은 **정반대다.** 오프닝 자막에 이름을 달고 나오는 화자라, 서로 다른  │
 * │ 목소리인 것이 곧 목적이다 — 자막이 넘어갈 때 누가 말하는지 귀로 갈려야      │
 * │ 장면이 선다. 판별과 아무 상관이 없으므로 P11 은 여기 걸리지 않는다.        │
 * │                                                                           │
 * │ 그래서 계보도 다르다: 좌석 명부(환경 변수)가 아니라 **대본 배역**          │
 * │ (tools/voice-cast.json 의 과학자·정부요원처럼) 쪽이다. 목소리 id 를 이     │
 * │ 파일에 그대로 적는 이유가 그것이다 — 배포 설정이 아니라 **작품의 내용**이라 │
 * │ 저장소에 남아야 하고, 환경 변수로 빼면 사람마다 다른 오프닝을 듣게 된다.    │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * (목소리 id 는 비밀이 아니다 — 계정 안의 이름표다. voice-cast.json 이 이미 같은 값을
 *  저장소에 두고 있고, 키만 .dev.vars 에 있다.)
 *
 * ★ **대사는 아직 임시다.** 시작 장면 대본(`start_speak.txt`)이 오면 그걸로 갈아 끼운다
 *   (2026-09-05 사용자). 지금 여기 있는 줄은 **목소리를 고르기 위한 샘플**이지 최종 대사가
 *   아니다 — 길이와 결만 실제와 비슷하게 맞춰 뒀다. /tts 에서 줄을 직접 쳐 볼 수도 있다.
 */

/** 목소리 id 는 2026-09-05 사용자가 지정했다 (ElevenLabs 계정의 한국어 professional) */
export interface OpeningSpeaker {
  id: string;
  /** 자막에 뜰 이름 */
  label: string;
  /** ElevenLabs voice id */
  voiceId: string;
  /** 그 목소리가 어떤 소리인지 — 화면에서 고를 때 보이는 이름 */
  voiceName: string;
  gender: '남' | '여';
  /** 임시 샘플 대사 — start_speak.txt 가 오면 갈아 끼운다 */
  sample: string;
}

export const OPENING_CAST: OpeningSpeaker[] = [
  {
    id: 'subject-1',
    label: '피실험자 01',
    voiceId: '4JJwo477JUAx3HV0T7n7',
    voiceName: 'Yohan Koo — Encouraging, Clear and Airy',
    gender: '남',
    sample: '여기가 어디인지도 안 알려주고 데려왔습니다.',
  },
  {
    id: 'subject-2',
    label: '피실험자 02',
    voiceId: 'hfY9LTyBpmCf5bUstZlU',
    voiceName: 'Sumi — Warm, Meditative, Soft',
    gender: '여',
    sample: '저는 아무것도 한 게 없어요. 검사만 받으면 되는 거죠?',
  },
  {
    id: 'subject-3',
    label: '피실험자 03',
    voiceId: 'airYK6ydeWdrJg6gyZA3',
    voiceName: 'Jeong-Ah — Versatile Korean Female',
    gender: '여',
    sample: '이 중에 하나가 사람이 아니라는 거잖아요. 그 말이잖아요.',
  },
];

/**
 * 발성 — 셋이 같은 한 벌이다.
 *
 * 좌석 아홉과 **같은 이유가 아니다.** 저쪽은 「자리마다 다르면 그게 단서가 된다」라서
 * 묶었고(P11), 여기는 그냥 **한 장면**이라서다 — 같은 방에서 같은 순간에 하는 말이
 * 서로 다른 녹음 상태로 들리면 장면이 흩어진다. 목소리(성대)만 다르고 연기 폭은 같다.
 *
 * 관제 방송(worker/src/tts.ts 의 VOICE_SETTINGS)보다 풀어 둔다: 저쪽은 감정 없는 안내라
 * stability 0.85 · style 0 인데, 이쪽은 겁먹은 사람들이 하는 말이라 그 값이면 전원이
 * 안내 방송처럼 들린다.
 */
export const OPENING_SETTINGS: Record<string, number> = {
  stability: 0.45,
  similarity_boost: 0.8,
  style: 0.25,
  speed: 1.0,
};

export function speakerOf(id: string): OpeningSpeaker | undefined {
  return OPENING_CAST.find((s) => s.id === id);
}

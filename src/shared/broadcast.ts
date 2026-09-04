import { createAction } from '@reduxjs/toolkit';

/**
 * 리더 방송 계약 — feature 간 직접 import 없이 방송을 보내는 유일한 통로.
 *
 * 어느 feature 든(라운드 진행·규정판·월드) 리더의 방송 문장을 소리로 내보내고 싶으면
 * 이 액션을 dispatch 하면 된다. tts feature 가 받아 큐에 쌓고 순서대로 읽는다.
 * 받는 쪽 구현(엔진·재생기)은 전부 `src/features/tts/` 안에 있다.
 *
 * 종류(kind) — 생략하면 'announce':
 * - 'announce' 일반 방송 — 온 순서대로 읽는다
 * - 'readout'  판독 발표 — 대기 순서는 announce 와 같다 (자막·연출을 다르게 쓸 자리)
 * - 'alarm'    긴급 경보 — 재생 중이던 방송을 끊고 맨 앞에 선다 (폐기·위반 경보용)
 */
export type { BroadcastKind } from './broadcast-kind';
import type { BroadcastKind } from './broadcast-kind';

/**
 * `ts` 는 **서버가 찍은 시각**이다. 방에서 중계돼 온 방송에만 붙는다.
 * 붙어 있으면 "전원이 같은 순간에 듣는 방송"이라는 뜻이고, 큐가 그걸 다르게 다룬다
 * (재생 중이던 것을 끊고 먼저 나가며, 너무 늦으면 아예 읽지 않는다).
 * 혼자 도는 화면(/rules·/arena·/lab)이 직접 부를 때는 없다.
 */
export const broadcastAnnounce =
  createAction<{ text: string; kind?: BroadcastKind; ts?: number }>('broadcast/announce');

/**
 * 방송 음소거 — 인자 생략은 토글. 켜면 재생·대기·유입이 전부 끊긴다.
 *
 * 방송이 나가는 화면이면 끄는 수단도 그 화면에 있어야 한다. 음소거를 여기 둔 이유는
 * `broadcastAnnounce` 와 같다 — 보내는 쪽이 tts feature 를 import 하지 않게 하려고.
 */
export const broadcastMute = createAction<boolean | undefined>('broadcast/mute');

/**
 * **지금 읽고 있는 방송 한 줄을 끊는다** — 대사 스킵(T)이 부르는 곳 (features/world/DialogueBox).
 *
 * 자막만 넘기면 목소리는 앞 줄을 계속 읽는다. 상자는 제 클립만 끊을 수 있어서(voiceLines.stop),
 * 소리를 방송으로 내는 화면은 여기로 끊어 줘야 한다 — 그래야 「넘겼다」가 눈과 귀에서 같은 뜻이 된다.
 *
 * 끊는 것은 **읽고 있는 한 줄뿐**이다. 대기 중인 것은 그대로 남아 곧바로 이어진다 — 한 번 누른 것은 한 줄이다.
 * 음소거와 같은 이유로 여기 둔다: 방송을 보내는 화면이 tts feature 를 import 하지 않게.
 */
export const broadcastSkip = createAction('broadcast/skip');

/**
 * 방송 볼륨 (0~1). 음소거와 달리 **끄는 수단이 아니라 크기 손잡이**다 —
 * /world 의 배경음악 손잡이와 같은 자리에 같은 모양으로 선다.
 * 0 이어도 방송은 자막으로 계속 지나간다 (음소거와 같은 약속).
 */
export const broadcastVolume = createAction<number>('broadcast/volume');

/**
 * 방송이 꺼져 있는가. 구현 슬라이스를 import 하지 않고 모양으로만 읽는다
 * (RootState 가 이 모양을 만족한다 — tts feature 가 등록부에 있는 한).
 */
export const selectBroadcastMuted = (s: { tts: { muted: boolean } }) => s.tts.muted;

/** 방송 볼륨 (0~1). selectBroadcastMuted 와 같은 방식으로 모양만 읽는다 */
export const selectBroadcastVolume = (s: { tts: { volume: number } }) => s.tts.volume;

/**
 * 지금 읽고 있는 방송 — 없으면 null. 자막을 제 화면 문법으로 그리고 싶은 화면이 읽는다
 * (심문소는 이걸 /world 의 대화창으로 낸다). 큐가 아니라 **한 문장**인 이유는,
 * 이게 곧 "지금 리더가 하는 말"이기 때문이다 — 대기 중인 것은 아직 한 말이 아니다.
 */
export const selectBroadcastNow = (s: { tts: { current: { text: string; kind: BroadcastKind } | null } }) => s.tts.current;

/**
 * 리더가 아직 말하는 중인가 — 읽고 있거나, 읽을 것이 남았거나.
 *
 * **연출을 낭독에 맞추려는 화면이 읽는다.** 심문소의 브리핑이 그렇다: 지시문을 다 듣기 전에
 * 카운트다운이 시작되면 판이 지시 도중에 돈다.
 *
 * 길이를 재서 기다리지 않고 이 신호를 쓰는 이유:
 * - 합성 길이는 **셀 수 없다.** 원격 합성이 끝나야 알 수 있는데 연출은 그 전에 시작한다.
 * - 글자 수 어림(cap.ts 의 초당 5.5자)은 자막 어림(DialogueBox 의 타자 속도)과 **2배 넘게** 벌어진다.
 *   실측: 76자 지시문이 자막은 9.0초, 소리는 13.8초다.
 * - 무엇보다 이 신호는 **모든 경우에 맞다** — ElevenLabs 든 폴백이든 음소거든 네트워크가 끊겼든,
 *   "말이 끝났다"의 정의가 하나다. 어림은 경우마다 따로 틀린다.
 *
 * 대기(queue)까지 세는 것은 경보 때문이다. 지시문 뒤에 경보가 끼어들면 그것도 리더의 말이고,
 * 그 말이 끝나기 전에 판이 시작되면 같은 문제가 그대로 난다.
 *
 * **이걸로만 기다리면 안 된다.** 방송이 아예 안 나가면(빈 문장·엔진 정지) 영영 거짓이라
 * 연출이 멈춘다. 쓰는 쪽이 천장을 같이 둬야 한다.
 */
export const selectBroadcastSpeaking = (s: { tts: { current: unknown; queue: readonly unknown[] } }): boolean =>
  s.tts.current !== null || s.tts.queue.length > 0;

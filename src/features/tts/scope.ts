/**
 * 새 방송 장치를 켜 둘 화면 목록.
 *
 * `broadcastAnnounce` 는 원래도 여러 화면이 쓰고 있었다 (/rules·/arena·/world).
 * 그 화면들은 **내가 만든 게 아니고**, 엔진을 갈아끼우면서 목소리만 바뀌었다 —
 * 남의 화면 소리를 말도 없이 바꾼 셈이고, 게다가 그쪽이 돌 때마다 크레딧이 나간다.
 *
 * 그래서 아직 손보는 중인 장치(원격 합성·로봇 음색·자막)는 내 화면에서만 켠다.
 * 목록 밖 화면은 **소리를 잃지 않는다** — 폴백(Web Speech)으로 예전과 똑같이 읽는다.
 * 기능을 빼는 게 아니라 내 변경 이전으로 돌려놓는 것이다.
 *
 * 넓힐 때는 여기 한 줄을 더한다. 그전에 그 화면 담당자와 이야기가 되어 있어야 한다.
 *
 * /interrogation 은 켠다. 여기는 리더가 **지시문과 판독을 방송으로만** 내보내고
 * 그걸로 판이 돌아가는 자리라, 목소리가 분위기가 아니라 기능이다.
 *
 * 주의: /interrogation 과 /arena 는 **같은 컴포넌트**(ArenaFeature)다. 그래도 갈리는
 * 것은 여기가 컴포넌트가 아니라 경로를 보기 때문이고, 그게 맞다 — /arena 는 내 화면이
 * 아니다. 같은 판인데 소리가 다르게 들리면 그건 고장이 아니라 이 목록의 결과다.
 *
 * /recheck 도 켠다 — **같은 이유다.** 재검실은 감독(UNIT-04)이 그 자리에서 지은 질문과
 * 판정으로만 굴러가는 방이고(features/world/chapter3.ts), 그 대사는 LLM 이 만들어서
 * 미리 구울 수가 없다. 미리 구운 클립(world/voice)이 못 닿는 유일한 화자라, 여기서
 * 원격 합성을 안 켜면 **묻는 쪽이 영영 무음**이다. 다른 화면과 달리 이 목록에 드는 것이
 * 소리를 바꾸는 게 아니라 없던 소리를 만드는 일이다.
 *
 * ★ 목소리는 **리더와 같은 것**이다 (기본 ELEVENLABS_VOICE_ID). 감독 전용 목소리를
 *   따로 세우는 것은 나중 일이고(2026-08-31 사용자: "일단은 리더 목소리랑 같은 걸로"),
 *   지금 급한 것은 이 방이 말을 하느냐다.
 */
const VOICE_ROUTES = ['/lab', '/tts', '/interrogation', '/recheck'];

/** 이 경로에서 새 방송 장치를 켜나 */
export function inVoiceScope(pathname: string): boolean {
  return VOICE_ROUTES.includes(pathname);
}

/**
 * 자막을 **제 화면 문법으로 직접 그리는** 경로. 전역 띠(BroadcastBanner)는 여기서 접는다.
 * /interrogation 은 리더의 말을 /world 와 같은 대화창(DialogueBox)으로 낸다 —
 * 같은 문장이 띠와 상자에 두 번 뜨면 어느 쪽을 읽어야 할지 모르게 된다.
 * 자막이 사라지는 게 아니라 자리를 옮기는 것이다.
 *
 * /recheck 도 마찬가지다 — 감독의 말은 이미 대화창에 한 줄씩 찍히고 있다. 소리만 방송으로
 * 나갈 뿐이라, 띠까지 뜨면 같은 문장이 화면에 두 번 선다.
 */
const OWN_SUBTITLE_ROUTES = ['/interrogation', '/recheck'];

export function drawsOwnSubtitle(pathname: string): boolean {
  return OWN_SUBTITLE_ROUTES.includes(pathname);
}

/**
 * 검문소 (/interrogation) — 이야기의 마지막 무대이자, 시행(/arena)과 **같은 판**이다:
 * 배경은 창고 홀, 개체 5개가 배회하며 페르소나(/api/lab/cast)로 저희끼리 떠들고(Enter 로 끼어든다),
 * 리더가 시행을 설계해 방송(TTS)하고 기록으로 판정한다. 화면·로직은 전부 features/arena/ArenaFeature 가 쥔다 —
 * 게임을 고칠 일이 있으면 그쪽을 고친다. 두 라우트가 같이 바뀐다.
 *
 * ★ 두 갈래로 들어온다 (2026-08-30):
 *   ① 이야기 — 복도(/world) → 중앙 시설(/central) → 검증실 문 → 암전 → `/interrogation?from=central`.
 *      이땐 「게임 시작」 버튼 없이 암전이 걷히면서 판이 곧장 열린다 (ArenaFeature autoStart).
 *   ② 로비의 「검문소 (판만)」 — 이야기를 안 거치고 판만. 첫 화면은 **게임 시작 버튼 하나뿐이다**
 *      (2026-08-29 사용자 결정) — 조작법·판 설명·즉석 시행 목록은 뺐고, 개체 머리 위 이름표도 시작 전에는 안 뜬다.
 *
 * 버튼 하나만 남은 화면에서도 무대 위 리더는 **격납고 홀(/warehouse)의 시연 순서를 그대로 돈다** — 화남 · 조준 ·
 * 발사 · 제자리걷기. 표는 features/warehouse/LeaderRobot 의 leaderShowAction 한 곳, 켜고 끄는 것은 ArenaFeature 의 getLeaderAction.
 *
 * ★ 3D 디지털 심문소 맵(world/map/interrogation.tsx)은 이 라우트가 아니다 — 지금 어느 라우트에도 안 걸려 있다.
 *   띄우려면 이 파일을 `return <WorldFeature map="interrogation" />` 로 바꾸거나 새 라우트를 하나 준다.
 */

import { useSearchParams } from 'react-router-dom';

import { ArenaFeature } from '@/features/arena/ArenaFeature';

export function InterrogationFeature() {
  const [params] = useSearchParams();
  /*
   * 이야기를 거쳐 온 길이면 버튼 없이 판이 곧장 열린다. 길은 둘이다 —
   * 본판의 중앙 시설(from=central)과 시나리오 2 의 창이 있는 방(from=scenario2, features/world2).
   * 시나리오 2 는 이 무대를 **자기 마지막 방으로 빌려 쓴다** — 판 자체는 여기 것 그대로다.
   */
  const from = params.get('from');
  return <ArenaFeature autoStart={from === 'central' || from === 'scenario2'} />;
}

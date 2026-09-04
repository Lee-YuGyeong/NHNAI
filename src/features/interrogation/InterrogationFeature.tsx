/**
 * 검문소 (/interrogation) — 이야기의 마지막 무대이자, 시행(/arena)과 **같은 판**이다:
 * 배경은 창고 홀, 개체 5개가 배회하며 페르소나(/api/lab/cast)로 저희끼리 떠들고(Enter 로 끼어든다),
 * 리더가 시행을 설계해 방송(TTS)하고 기록으로 판정한다. 화면·로직은 전부 features/arena/ArenaFeature 가 쥔다 —
 * 게임을 고칠 일이 있으면 그쪽을 고친다. 두 라우트가 같이 바뀐다.
 *
 * ★ 두 갈래로 들어온다 (2026-08-30) — 그런데 **둘 다 버튼 없이 곧장 연다** (2026-09-04
 *   사용자: "게임 시작 버튼 없애고 바로 게임 시작되게"):
 *   ① 이야기 — 복도(/world) → 중앙 시설(/central) → 검증실 문 → 암전 → `/interrogation?from=central`.
 *      ArenaFeature 의 autoStart — 인계 서류(HandoverCard) · 챕터 방송 · 암전 커튼이 딸려 온다.
 *   ② 로비의 「검문소 (판만)」 — 이야기를 안 거치고 판만. 예전엔 여기서만 게임 시작 버튼을
 *      보여줬지만(2026-08-29 결정) 이제 그 버튼도 없앤다 — 대신 ArenaFeature 의 skipButton 을
 *      쓴다: **버튼만 없앨 뿐, 인계 서류·챕터 방송은 붙이지 않는다.** ①의 트리밍을 그대로
 *      들고 오면 이야기를 거치지 않은 사람에게 "CHAPTER 4 인지검증실" 같은 없는 서류가 뜬다
 *      (2026-09-04 확인된 회귀 — autoStart 하나로 둘을 묶었더니 이 화면이 같이 떴다).
 *
 * (첫 화면에서도 무대 위 리더는 **격납고 홀(/warehouse)의 시연 순서를 그대로 돈다** — 화남 ·
 * 조준 · 발사 · 제자리걷기. 표는 features/warehouse/LeaderRobot 의 leaderShowAction 한 곳,
 * 켜고 끄는 것은 ArenaFeature 의 getLeaderAction.)
 *
 * ★ 3D 디지털 심문소 맵(world/map/interrogation.tsx)은 이 라우트가 아니다 — 지금 어느 라우트에도 안 걸려 있다.
 *   띄우려면 이 파일을 `return <WorldFeature map="interrogation" />` 로 바꾸거나 새 라우트를 하나 준다.
 */

import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ArenaFeature } from '@/features/arena/ArenaFeature';
import { RoleBriefing } from './RoleBriefing';

export function InterrogationFeature() {
  const [params] = useSearchParams();
  const from = params.get('from');
  const fromStory = from === 'central' || from === 'scenario2';

  /*
   * 역할 카드는 판이 열리는 순간(ArenaFeature 의 onStart — autoStart 든 skipButton 이든
   * 마운트 직후) 바로 뜬다. humanish 의 카드처럼 몇 초 보여주고 스스로 걷힌다(RoleBriefing 의
   * 자동 닫힘 타이머) — "게임 시작"에 해당하는 확인 버튼을 기다리지 않는다(2026-09-04 사용자).
   */
  const [showRole, setShowRole] = useState(false);
  const handleStart = useCallback(() => setShowRole(true), []);

  return (
    <>
      {/* 배경은 특수인공지능대응센터 홀(world/map/govcenter) — 2026-09-04 사용자 참고 이미지. 판·판정은 격납고 홀과 같다 */}
      <ArenaFeature autoStart={fromStory} skipButton={!fromStory} onStart={handleStart} map="govcenter" />
      {showRole && <RoleBriefing onDone={() => setShowRole(false)} />}
    </>
  );
}

/**
 * 게임 시작 테스트 (/play) — 판의 입구. 화면이 없다: 방 번호·닉네임을 지어 **검문소(/interrogation)** 로 곧장 넘긴다.
 * 루트의 붉은 케이스는 이 라우트를 거치지 않고 같은 주소로 바로 건다 (shared/start.ts 머리말).
 * 이 라우트는 주소를 그대로 눌러 들어오는 길 — 북마크·확인 스크립트용이다.
 *
 * ★ 성격 미리 짓기(warmCast)를 여기서 뺐다 (2026-09-05). 그 값을 받아 가는 화면은 /arena 인데
 *   이 문은 이제 검문소로 곧장 간다 — 아무도 안 쓸 값에 크레딧이 나가고 있었다.
 */

import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';

import { storyStartHref } from '@/shared/start';

export function PlayFeature() {
  const href = useMemo(() => storyStartHref(), []);
  return <Navigate to={href} replace />;
}

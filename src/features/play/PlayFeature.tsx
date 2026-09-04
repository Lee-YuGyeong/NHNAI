/**
 * 게임 시작 테스트 (/play) — 이야기의 입구. 화면이 없다: 방 번호·닉네임을 지어 복도(/world)로 곧장 넘긴다.
 * 로비의 케이스는 이 라우트를 거치지 않고 같은 주소로 바로 건다 (포인터 잠금 제스처, shared/start.ts 머리말).
 * 이 라우트는 주소를 그대로 눌러 들어오는 길 — 북마크·확인 스크립트용이다.
 */

import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';

import { warmCast } from '@/lab/cast-warm';
import { storyStartHref } from '@/shared/start';

export function PlayFeature() {
  const href = useMemo(() => {
    // 이 주소를 연 것이 곧 게임 시작이다 — 배역부터 짓기 시작한다 (src/lab/cast-warm.ts).
    // 복도에서 검문소까지 걸어오는 동안 지어지므로, 문 앞에서 「여섯을 모으는 중」을 안 본다
    warmCast();
    return storyStartHref();
  }, []);
  return <Navigate to={href} replace />;
}

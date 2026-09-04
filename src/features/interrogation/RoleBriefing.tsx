/**
 * 브리핑 — /interrogation 이 열리자마자 뜨는 첫 화면. "입장 → 브리핑 → …"(PLANNING §1.2)의
 * 그 브리핑이다: 내 배역이 **사람**인지 **AI 설계자**인지, 이 화면에서 처음이자 마지막으로
 * 통보받는다(§1.1 "브리핑 화면에서 준다. … 이후 화면에서 추가로 알려주는 절차는 없다").
 *
 * 카드 생김새는 /intro 의 배역 소개(RoleCard·ROLES, features/lobby/Intro.tsx)를 그대로 가져다
 * 쓴다 — 사용자 지시대로 "huminish 역할 카드랑 똑같이" 뜨게 하려면 카드를 새로 그리지 않고
 * 같은 컴포넌트를 재사용하는 것이 유일하게 어긋나지 않는 방법이다.
 *
 * 배역 배정은 아직 자리가 없다 — 서버(worker/src/trial)에 진짜 다인원 로스터와 정체표가
 * 붙기 전까지는 이 화면이 §1.1의 표(실제 플레이어 수 → AI 설계자 상한)를 그대로 클라이언트에서
 * 굴려 채운다. TRIAL_PARTY(이 방의 시행 참가 인원, lab/personas)를 "실제 플레이어 수" 자리에
 * 대신 넣는다 — 진짜 배정이 붙으면 rollMyRole 을 그 응답으로 바꿔치면 된다.
 */
import { useState } from 'react';
import { TRIAL_PARTY } from '@/lab/personas';
import { ArrowIcon, Backdrop } from '@/features/lobby/console';
import { ROLES, RoleCard, type RoleDef } from '@/features/lobby/Intro';
import '@/features/lobby/lobby.css';

/** AI 설계자 상한 — PLANNING §1.1 표 그대로 (3명→0 · 4~5명→1 · 6~8명→2) */
function designerCap(partySize: number): number {
  if (partySize <= 3) return 0;
  if (partySize <= 5) return 1;
  return 2;
}

/**
 * 이 판의 내 배역을 굴린다 — §1.1: 상한 안에서 설계자 수를 0부터 균등 랜덤으로 뽑고,
 * 그 수만큼의 자리가 파티 인원 중 무작위로 설계자가 된다("인원을 알아도 실제 설계자 수는
 * 알 수 없다"). 내가 그 자리에 들 확률은 뽑힌 설계자 수를 파티 인원으로 나눈 값이다.
 */
function rollMyRole(partySize: number): RoleDef {
  const cap = designerCap(partySize);
  const designerCount = Math.floor(Math.random() * (cap + 1));
  const iAmDesigner = Math.random() < designerCount / partySize;
  const title = iAmDesigner ? 'AI 설계자' : '사람';
  return ROLES.find((r) => r.title === title)!;
}

export function RoleBriefing({ onEnter }: { onEnter: () => void }) {
  // 마운트 시 한 번만 굴린다 — 다시 렌더될 때마다 배역이 바뀌면 브리핑이 아니라 뽑기가 된다
  const [role] = useState<RoleDef>(() => rollMyRole(TRIAL_PARTY));

  return (
    <div className="bl">
      <Backdrop />
      <main className="rb-stage">
        <div className="rb-card">
          <p className="bl-label" style={{ textAlign: 'center' }}>
            브리핑 — 당신의 역할
          </p>
          <ul className="bl-slides__stack bl-slides__stack--still">
            <li className={`bl-slide bl-slide--on bl-edge${role.human ? ' bl-role--human' : ''}`}>
              <RoleCard r={role} />
            </li>
          </ul>
          <button type="button" className="bl-btn bl-btn--go bl-btn--wide bl-edge" data-sfx="clank" onClick={onEnter}>
            입장하기 <ArrowIcon />
          </button>
        </div>
      </main>
    </div>
  );
}

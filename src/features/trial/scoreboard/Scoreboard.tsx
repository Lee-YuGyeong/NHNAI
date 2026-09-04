/**
 * 전광판 — 참가자 전원의 기록을 한 화면에 나열한다. 무리 평균이 항상 같이 보인다(상대평가의
 * 원리, PLANNING P2). props 에는 "의심" · "이상치" 같은 판정을 실을 자리가 애초에 없다 —
 * TrialResultWire 에 그런 필드가 없으므로 이 컴포넌트가 오용할 수도 없다.
 */
import type { TrialResultWire } from '@/world/mp/protocol';
import './scoreboard.css';

function fmtM(n: number | undefined): string {
  return typeof n === 'number' ? `${n.toFixed(2)}m` : '—';
}

export function Scoreboard({ result, roster }: { result: TrialResultWire; roster: Record<string, string> }) {
  const label = (id: string) => roster[id] ?? id;

  return (
    <div className="trial-scoreboard">
      <header className="trial-scoreboard__head">
        ROUND {result.round}
      </header>

      <section>
        <div className="trial-scoreboard__row trial-scoreboard__row--mean">
          <span>전환 직후 오차</span>
          <span>무리 평균 {fmtM(result.groupMean.transitionError)}</span>
        </div>
        {result.players.map((p) => (
          <div className="trial-scoreboard__row" key={p.id}>
            <span>{label(p.id)}</span>
            <span>{fmtM(p.transitionError)}</span>
          </div>
        ))}
      </section>

      <section>
        <div className="trial-scoreboard__section-title">적응 곡선 (시행 1 → 2 → 3, |오차|)</div>
        {result.players.map((p) => (
          <div className="trial-scoreboard__row" key={p.id}>
            <span>{label(p.id)}</span>
            <span>{p.adaptationCurve.map((v) => v.toFixed(2)).join(' → ')}</span>
          </div>
        ))}
      </section>

      <section>
        <div className="trial-scoreboard__section-title">오차 방향 (초과 + / 미달 −)</div>
        {result.players.map((p) => (
          <div className="trial-scoreboard__row" key={p.id}>
            <span>{label(p.id)}</span>
            <span>{p.errorDirection.map((d) => (d >= 0 ? '+' : '−')).join(' ')}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

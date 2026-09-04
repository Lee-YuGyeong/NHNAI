/**
 * 기록 표 — 무리 평균과 각자의 값을 **원자료 그대로** (PLANNING §3). 「의심」·「이상치」 같은 판정 칸은 없다 —
 * TrialResultWire 에 그런 필드가 없으므로 이 표가 오용할 수도 없다. 전환 직후 오차와 오차 방향은 별도 열로 강조한다 (P3 · P4).
 *
 * 무리 평균에서 표준편차 1.5 배 넘게 먼 값만 붉게 칠한다 — 해석은 여전히 사람 몫이고, 이건 눈이 갈 자리를 표시한 것뿐이다.
 */
import type { TrialResultWire } from '@/world/mp/protocol';

/** 테스트마다 기록의 열 이름 — worker/src/game/agents.ts 의 METRIC_LABEL 과 같은 말 */
const LABEL: Record<string, string> = {
  stopError: '정지 오차(m)',
  brakeTiming: '브레이크(잔여 m)',
  transitionError: '전환 직후',
  hitCount: '피격',
  survivalTime: '첫 피격(s)',
  unnecessaryMoves: '헛움직임',
  minDistanceAvoid: '회피 여유(m)',
  accuracy: '정답률',
  wrongPicks: '오답',
  hesitationMs: '머뭇(ms)',
};

export const TEST_TITLE: Record<string, string> = { stopline: '정지선', fall: '낙하 생존', colorhunt: '색 사냥' };

function fmt(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 100) return v.toFixed(0);
  return v.toFixed(2);
}

export function ResultTable({ result, nameOf, mySeatId }: { result: TrialResultWire; nameOf: (id: string) => string; mySeatId: string | null }) {
  const keys = Object.keys(result.groupMean).filter((k) => k !== 'transitionError');
  const far = (k: string, v: number | null | undefined) => {
    const m = result.groupMean[k];
    const sd = result.groupStdDev[k];
    return typeof v === 'number' && Number.isFinite(v) && typeof m === 'number' && typeof sd === 'number' && sd > 0 && Math.abs(v - m) > 1.5 * sd;
  };
  const farT = (v: number | null | undefined) => far('transitionError', v);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="ig-table">
        <thead>
          <tr>
            <th>SUBJECT</th>
            {keys.map((k) => (
              <th key={k}>{LABEL[k] ?? k}</th>
            ))}
            <th>전환 직후 오차</th>
            <th>오차 방향</th>
            <th>적응 곡선</th>
          </tr>
        </thead>
        <tbody>
          <tr className="mean">
            <td>무리 평균</td>
            {keys.map((k) => (
              <td key={k}>{fmt(result.groupMean[k])}</td>
            ))}
            <td>{fmt(result.groupMean.transitionError)}</td>
            <td />
            <td />
          </tr>
          {result.players.map((p) => (
            <tr key={p.id} className={p.id === mySeatId ? 'me' : undefined}>
              <td>{nameOf(p.id)}</td>
              {keys.map((k) => (
                <td key={k} className={far(k, p.metrics[k]) ? 'hi' : undefined}>
                  {fmt(p.metrics[k])}
                </td>
              ))}
              <td className={farT(p.transitionError) ? 'hi' : undefined}>{fmt(p.transitionError)}</td>
              <td className="dir">{p.errorDirection.length ? p.errorDirection.map((d) => (d >= 0 ? '+' : '−')).join('') : '—'}</td>
              <td>{p.adaptationCurve.length ? p.adaptationCurve.map((v) => fmt(v)).join('→') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

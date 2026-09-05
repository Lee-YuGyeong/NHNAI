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
  picks: '선택',
  jumps: '점프',
  landingRate: '착지 성공률',
  centerRate: '중앙 착지율',
  misses: '실패',
  meanOffset: '중심 오차(m)',
  recoveryMs: '균형 회복(ms)',
  finishMs: '완주(ms)',
  walked: '이동(m)',
  falls: '낙하',
  meanRadius: '평균 반지름(m)',
  radiusStd: '반지름 편차(m)',
  reactionMs: '반응(ms)',
  slideTotal: '미끄러짐(m)',
  slipM: '착지 밀림(m)',
  meanAirMs: '체공(ms)',
};

export const TEST_TITLE: Record<string, string> = { stopline: '정지선', fall: '낙하 생존', colorhunt: '색 사냥', platform: '움직이는 플랫폼', disc: '회전 원판' };

function fmt(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 100) return v.toFixed(0);
  return v.toFixed(2);
}

export function ResultTable({
  result,
  nameOf,
  mySeatId,
  gained,
}: {
  result: TrialResultWire;
  nameOf: (id: string) => string;
  mySeatId: string | null;
  /** 이 시험이 준 발언권 — 있으면 마지막 열. 판정 낱말은 아니다: 「얼마나 버텼나」를 초 대신 마디로 적은 것이다 */
  gained?: Record<string, number>;
}) {
  const keys = Object.keys(result.groupMean).filter((k) => k !== 'transitionError');
  // 같은 이름의 지표라도 시험마다 뜻이 다르다 — 낙하 생존은 첫 피격, 회전 원판은 첫 낙하 (둘 다 「버틴 초」라 발언권이 한 눈금으로 잰다)
  const labelOf = (k: string) => (k === 'survivalTime' && result.game === 'disc' ? '첫 낙하(s)' : (LABEL[k] ?? k));
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
              <th key={k}>{labelOf(k)}</th>
            ))}
            <th>전환 직후 오차</th>
            <th>오차 방향</th>
            <th>적응 곡선</th>
            {gained ? <th>발언권</th> : null}
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
            {gained ? <td /> : null}
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
              {gained ? <td className="talk">{typeof gained[p.id] === 'number' ? `+${gained[p.id]}` : '—'}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 기록 표 — 무리 평균과 각자의 값을 **원자료 그대로** (PLANNING §3). 「의심」·「이상치」 같은 판정 칸은 없다 —
 * TrialResultWire 에 그런 필드가 없으므로 이 표가 오용할 수도 없다. 전환 직후 오차와 오차 방향은 별도 열로 강조한다 (P3 · P4).
 *
 * 무리 평균에서 표준편차 1.5 배 넘게 먼 값만 붉게 칠한다 — 해석은 여전히 사람 몫이고, 이건 눈이 갈 자리를 표시한 것뿐이다.
 */
import { GAME_TEST_MS, heldSecondsFor } from '@/world/mp/game-protocol';
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

/* ─────────────────────────────── 요약 — 결과 모달이 그리는 것 ─────────────────────────────── */

/** 시험마다 「버틴 시간」이 무엇인지 · 곁들일 수 하나 (2026-09-05 사용자: "몇 초 안 맞았냐 · 몇 등 · 발언권 몇 개, 대충 통계만") */
const SUMMARY: Record<string, { held: string; extra?: { metric: string; label: string; fmt: (v: number) => string } }> = {
  fall: { held: '안 맞고 버틴 시간', extra: { metric: 'hitCount', label: '피격', fmt: (v) => `${v.toFixed(0)}회` } },
  platform: { held: '도착하고 남긴 시간', extra: { metric: 'finishMs', label: '도착', fmt: (v) => `${(v / 1000).toFixed(1)}초` } },
  disc: { held: '안 떨어지고 버틴 시간', extra: { metric: 'falls', label: '낙하', fmt: (v) => `${v.toFixed(0)}회` } },
};

/**
 * 결과 모달의 요약 표 — SUBJECT · 버틴 시간 · 곁들인 수 하나 · 등수 · 발언권.
 * 상세 지표(전환 직후 오차 · 방향 · 적응 곡선)는 여기 없다 — 모달은 7초라 표를 읽을 시간이 아니다.
 * 원자료는 모달이 걷힌 뒤 옆에 서는 기록판(RecordPanel → ResultTable)에 그대로 남는다.
 * 등수는 버틴 시간으로 — 같으면 같은 등수(1 · 1 · 3). 판정 낱말은 여기도 없다.
 */
export function ResultSummary({
  result,
  nameOf,
  mySeatId,
  gained,
}: {
  result: TrialResultWire;
  nameOf: (id: string) => string;
  mySeatId: string | null;
  gained?: Record<string, number>;
}) {
  const spec = SUMMARY[result.game];
  const full = GAME_TEST_MS / 1000;
  const rows = result.players.map((p) => ({ p, held: heldSecondsFor(result.game, p.metrics, GAME_TEST_MS) }));
  const sorted = [...rows].sort((a, b) => (b.held ?? -1) - (a.held ?? -1));
  const rankOf = (id: string) => {
    const i = sorted.findIndex((r) => r.p.id === id);
    const held = sorted[i]?.held ?? null;
    return sorted.findIndex((r) => (r.held ?? null) === held) + 1;
  };
  const heldText = (v: number | null) => (v === null ? '—' : v >= full ? `끝까지 (${full}초)` : `${v.toFixed(1)}초`);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="ig-table ig-summary">
        <thead>
          <tr>
            <th>SUBJECT</th>
            <th>{spec?.held ?? '버틴 시간'}</th>
            {spec?.extra ? <th>{spec.extra.label}</th> : null}
            <th>등수</th>
            <th>발언권</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ p, held }) => {
            const extra = spec?.extra;
            const ex = extra ? p.metrics[extra.metric] : undefined;
            const exText = extra && typeof ex === 'number' && Number.isFinite(ex) ? extra.fmt(ex) : '—';
            const rank = rankOf(p.id);
            return (
              <tr key={p.id} className={p.id === mySeatId ? 'me' : undefined}>
                <td>{nameOf(p.id)}</td>
                <td className={held !== null && held >= full ? 'full' : undefined}>{heldText(held)}</td>
                {extra ? <td>{exText}</td> : null}
                <td className={rank === 1 ? 'top' : undefined}>{rank}등</td>
                <td className="talk">{gained && typeof gained[p.id] === 'number' ? `+${gained[p.id]}` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

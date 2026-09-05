/**
 * 기록의 요약 표 — 결과 모달이 쓴다. 「의심」·「이상치」 같은 판정 칸은 없다 (PLANNING §3) — TrialResultWire 에 그런
 * 필드가 없으므로 이 표가 오용할 수도 없다.
 *
 * 원자료를 열마다 늘어놓던 상세 표(ResultTable)와 그것을 들던 오른쪽 위 기록판은 2026-09-05 에 걷었다
 * (사용자: "1시 방향의 기록 리스트 없애줘"). 열 이름 표(LABEL)와 소수점 서식(fmt)도 같이 갔다 — 되살릴 일이
 * 생기면 그 커밋 직전 판에 있다.
 */
import { GAME_TEST_MS, heldSecondsFor } from '@/world/mp/game-protocol';
import type { TrialResultWire } from '@/world/mp/protocol';


export const TEST_TITLE: Record<string, string> = { stopline: '정지선', fall: '낙하 생존', colorhunt: '색 사냥', platform: '움직이는 플랫폼', disc: '회전 원판', seesaw: '무게 중심 다리', tower: '무너지는 타워' };



/* ─────────────────────────────── 요약 — 결과 모달이 그리는 것 ─────────────────────────────── */

/** 시험마다 「버틴 시간」이 무엇인지 · 곁들일 수 하나 (2026-09-05 사용자: "몇 초 안 맞았냐 · 몇 등 · 발언권 몇 개, 대충 통계만") */
const SUMMARY: Record<string, { held: string; extra?: { metric: string; label: string; fmt: (v: number) => string } }> = {
  fall: { held: '안 맞고 버틴 시간', extra: { metric: 'hitCount', label: '피격', fmt: (v) => `${v.toFixed(0)}회` } },
  platform: { held: '도착하고 남긴 시간', extra: { metric: 'finishMs', label: '도착', fmt: (v) => `${(v / 1000).toFixed(1)}초` } },
  disc: { held: '안 떨어지고 버틴 시간', extra: { metric: 'falls', label: '낙하', fmt: (v) => `${v.toFixed(0)}회` } },
  seesaw: { held: '안 떨어지고 버틴 시간', extra: { metric: 'falls', label: '낙하', fmt: (v) => `${v.toFixed(0)}회` } },
  tower: { held: '안 떨어지고 버틴 시간', extra: { metric: 'falls', label: '낙하', fmt: (v) => `${v.toFixed(0)}회` } },
};

/**
 * 결과 모달의 요약 표 — SUBJECT · 버틴 시간 · 곁들인 수 하나 · 등수 · 발언권.
 * 상세 지표(전환 직후 오차 · 방향 · 적응 곡선)는 여기 없다 — 모달은 7초라 표를 읽을 시간이 아니다.
 * 상세 표(ResultTable)와 그것을 들던 오른쪽 위 기록판(RecordPanel)은 2026-09-05 에 걷었다 — 사용자: "기록 리스트 없애줘".
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
            <th>이름</th>
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

/**
 * 판이 끝났을 때 10초 보여 주는 **짧은** 요약 — 참가자 전원을 한 표에, 핵심 지표 셋만 (2026-09-04 사용자:
 * "요약본 (길면 안돼) 다른 사람들꺼까지 보는"). 무리 평균 줄이 맨 아래 같이 선다(PLANNING P2).
 * 판정 라벨 · 강조색 · 순위 없음. 자세한 것(적응 곡선 · 오차 방향)은 기록 탭의 Scoreboard 에 있다.
 */
import type { TrialGame, TrialResultWire } from '@/world/mp/protocol';
import './scoreboard.css';

interface Col {
  key: string;
  label: string;
  unit: string;
  digits: number;
}

const COLS: Record<TrialGame, Col[]> = {
  stopline: [
    { key: 'meanAbsError', label: '정지 오차', unit: 'm', digits: 2 },
    { key: 'transitionError', label: '바닥 바뀐 직후', unit: 'm', digits: 2 },
    { key: 'attempts', label: '시행', unit: '회', digits: 0 },
  ],
  fall: [
    { key: 'minDistanceAvoid', label: '벗어난 거리', unit: 'm', digits: 2 },
    { key: 'unnecessaryMoves', label: '헛움직임', unit: '회', digits: 0 },
    { key: 'hitCount', label: '충돌', unit: '회', digits: 0 },
  ],
  colorhunt: [{ key: 'accuracy', label: '정답률', unit: '', digits: 2 }],
};

function fmt(v: unknown, unit: string, digits: number): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(digits)}${unit}` : '—';
}

export function Summary({ result, roster, title, secondsLeft }: { result: TrialResultWire; roster: Record<string, string>; title: string; secondsLeft: number }) {
  const cols = COLS[result.game] ?? COLS.stopline;
  const label = (id: string) => roster[id] ?? id;
  return (
    <div className="trial-summary">
      <header className="trial-summary__head">
        <span>{title} — 기록 공개</span>
        <span>{secondsLeft}s</span>
      </header>
      <table className="trial-summary__table">
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.players.map((p) => (
            <tr key={p.id}>
              <td>{label(p.id)}</td>
              {cols.map((c) => (
                <td key={c.key}>{fmt(p.metrics[c.key], c.unit, c.digits)}</td>
              ))}
            </tr>
          ))}
          <tr className="trial-summary__mean">
            <td>무리 평균</td>
            {cols.map((c) => (
              <td key={c.key}>{fmt(result.groupMean[c.key], c.unit, c.digits)}</td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="trial-summary__foot">시스템은 판정하지 않는다 — 누가 이상한지는 토론에서.</p>
    </div>
  );
}

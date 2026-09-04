/**
 * 로그 탭 — 지금까지 끝난 판 전부를 오래된 순으로 늘어놓는다. 여러 판이 겹쳐야 패턴이
 * 보인다는 게 이 화면이 있는 이유다(사용자 스펙: "여러 판이 겹쳐야 패턴이 보이므로 누적 조회가
 * 필수"). trial_history 로 재접속·새로고침을 넘어 백필된다(worker/src/trial/history.ts).
 */
import type { TrialResultWire } from '@/world/mp/protocol';
import { Scoreboard } from './Scoreboard';
import './scoreboard.css';

export function ScoreboardLog({ history, roster }: { history: TrialResultWire[]; roster: Record<string, string> }) {
  if (history.length === 0) {
    return <p className="trial-scoreboard-log__empty">아직 끝난 판이 없다.</p>;
  }
  return (
    <div className="trial-scoreboard-log">
      {history.map((r, i) => (
        <Scoreboard key={`${r.game}-${r.round}-${i}`} result={r} roster={roster} />
      ))}
    </div>
  );
}

/**
 * 전광판 — 참가자 전원의 기록을 한 화면에 나열한다. 무리 평균이 항상 같이 보인다(상대평가의
 * 원리, PLANNING P2). props 에는 "의심" · "이상치" 같은 판정을 실을 자리가 애초에 없다 —
 * TrialResultWire 에 그런 필드가 없으므로 이 컴포넌트가 오용할 수도 없다.
 *
 * 게임마다 보여 줄 지표와 그 이름이 다르다(SPEC). 값이 없는 칸(위협을 한 번도 안 받은 사람의 회피 거리 등)은
 * 서버가 NaN → 와이어에서 null 로 온다 — '—' 로 비워 둔다. 0 으로 채우면 「완벽」으로 읽힌다.
 */
import type { TrialGame, TrialResultWire } from '@/world/mp/protocol';
import './scoreboard.css';

interface Row {
  key: string;
  label: string;
  unit: string;
  digits: number;
}

interface Spec {
  /** 맨 위에 무리 평균과 같이 서는 핵심 지표 */
  primary: Row;
  rows: Row[];
  curveLabel: string;
  dirLabel: string;
}

const SPEC: Record<TrialGame, Spec> = {
  stopline: {
    primary: { key: 'transitionError', label: '바닥이 바뀐 직후의 오차', unit: 'm', digits: 2 },
    rows: [
      { key: 'meanAbsError', label: '정지 오차 평균 (|오차|)', unit: 'm', digits: 2 },
      { key: 'stopError', label: '마지막 정지 오차 (초과 + / 미달 −)', unit: 'm', digits: 2 },
      { key: 'attempts', label: '시행', unit: '회', digits: 0 },
    ],
    curveLabel: '적응 곡선 (시행 순서대로, |오차|)',
    dirLabel: '오차 방향 (초과 + / 미달 −)',
  },
  fall: {
    primary: { key: 'minDistanceAvoid', label: '낙하 지점에서 벗어난 거리', unit: 'm', digits: 2 },
    rows: [
      { key: 'transitionError', label: '중력이 바뀐 직후의 회피 거리', unit: 'm', digits: 2 },
      { key: 'unnecessaryMoves', label: '불필요한 이동', unit: '회', digits: 0 },
      { key: 'hitCount', label: '충돌', unit: '회', digits: 0 },
      { key: 'survivalTime', label: '첫 충돌까지', unit: '초', digits: 1 },
    ],
    curveLabel: '회피 거리 추이 (위협 1 → 2 → 3 …)',
    dirLabel: '회피 방향 (크게 + / 딱 맞게 −)',
  },
  colorhunt: {
    primary: { key: 'hesitationMs', label: '조명이 바뀐 뒤 첫 선택까지', unit: 'ms', digits: 0 },
    rows: [
      { key: 'accuracy', label: '정답률', unit: '', digits: 2 },
      { key: 'transitionError', label: '전환 창(3초) 오답 비율', unit: '', digits: 2 },
      { key: 'wrongPicks', label: '오답', unit: '회', digits: 0 },
      { key: 'picks', label: '선택', unit: '회', digits: 0 },
    ],
    curveLabel: '선택 간격 추이 (차단 구간, 초)',
    dirLabel: '오답 방향 (합류색 + / 무관한 색 −)',
  },
  platform: {
    primary: { key: 'centerRate', label: '발판 중앙 착지율', unit: '', digits: 2 },
    rows: [
      { key: 'landingRate', label: '착지 성공률', unit: '', digits: 2 },
      { key: 'meanOffset', label: '중심에서 벗어난 거리', unit: 'm', digits: 2 },
      { key: 'recoveryMs', label: '착지 후 균형 회복', unit: 'ms', digits: 0 },
      { key: 'misses', label: '점프 실패', unit: '회', digits: 0 },
      { key: 'jumps', label: '점프', unit: '회', digits: 0 },
      { key: 'finishMs', label: '완주까지', unit: 'ms', digits: 0 },
    ],
    curveLabel: '착지 오차 추이 (점프 1 → 2 → 3 …, m)',
    dirLabel: '오차 방향 (일찍 + / 늦게 −)',
  },
  disc: {
    primary: { key: 'walked', label: '이동거리 (원판 위에서 걸은 거리)', unit: 'm', digits: 1 },
    rows: [
      { key: 'radiusStd', label: '자리 흔들림 (반지름 편차)', unit: 'm', digits: 2 },
      { key: 'meanRadius', label: '평균 반지름 (축에서)', unit: 'm', digits: 2 },
      { key: 'reactionMs', label: '회전이 바뀐 뒤 반응까지', unit: 'ms', digits: 0 },
      { key: 'transitionError', label: '바닥이 바뀐 직후 미끄러진 거리', unit: 'm', digits: 2 },
      { key: 'slideTotal', label: '미끄러진 거리 합', unit: 'm', digits: 2 },
      { key: 'falls', label: '낙하', unit: '회', digits: 0 },
    ],
    curveLabel: '미끄러진 거리 추이 (에피소드 1 → 2 → 3 …, m)',
    dirLabel: '미끄러진 뒤 자리 (바깥으로 밀림 + / 안쪽으로 고침 −)',
  },
};

function fmt(v: unknown, unit: string, digits: number): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(digits)}${unit}` : '—';
}

const GAME_LABEL: Record<TrialGame, string> = { stopline: '정지선', fall: '낙하 생존', colorhunt: '색 사냥', platform: '움직이는 플랫폼', disc: '회전 원판' };

export function Scoreboard({ result, roster }: { result: TrialResultWire; roster: Record<string, string> }) {
  const spec = SPEC[result.game] ?? SPEC.stopline;
  const label = (id: string) => roster[id] ?? id;
  const p = spec.primary;
  const when = result.endedAt ? new Date(result.endedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="trial-scoreboard">
      <header className="trial-scoreboard__head">
        {GAME_LABEL[result.game] ?? result.game} {when ? `· ${when}` : ''}
      </header>

      <section>
        <div className="trial-scoreboard__row trial-scoreboard__row--mean">
          <span>{p.label}</span>
          <span>무리 평균 {fmt(result.groupMean[p.key], p.unit, p.digits)}</span>
        </div>
        {result.players.map((pl) => (
          <div className="trial-scoreboard__row" key={pl.id}>
            <span>{label(pl.id)}</span>
            <span>{fmt(pl.metrics[p.key], p.unit, p.digits)}</span>
          </div>
        ))}
      </section>

      {spec.rows.map((r) => (
        <section key={r.key}>
          <div className="trial-scoreboard__row trial-scoreboard__row--mean">
            <span>{r.label}</span>
            <span>무리 평균 {fmt(result.groupMean[r.key], r.unit, r.digits)}</span>
          </div>
          {result.players.map((pl) => (
            <div className="trial-scoreboard__row" key={pl.id}>
              <span>{label(pl.id)}</span>
              <span>{fmt(pl.metrics[r.key], r.unit, r.digits)}</span>
            </div>
          ))}
        </section>
      ))}

      <section>
        <div className="trial-scoreboard__section-title">{spec.curveLabel}</div>
        {result.players.map((pl) => (
          <div className="trial-scoreboard__row" key={pl.id}>
            <span>{label(pl.id)}</span>
            <span>{pl.adaptationCurve.length ? pl.adaptationCurve.map((v) => v.toFixed(2)).join(' → ') : '—'}</span>
          </div>
        ))}
      </section>

      <section>
        <div className="trial-scoreboard__section-title">{spec.dirLabel}</div>
        {result.players.map((pl) => (
          <div className="trial-scoreboard__row" key={pl.id}>
            <span>{label(pl.id)}</span>
            <span>{pl.errorDirection.length ? pl.errorDirection.map((d) => (d >= 0 ? '+' : '−')).join(' ') : '—'}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

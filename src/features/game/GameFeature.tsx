/**
 * 라운드 진행 화면 — PLANNING §6 의 신규 feature (담당자가 채운다).
 *
 * 맡는 것: 리더 무브 수신 → 씬 렌더 (텍스트 응답 · 신체 시행 · 심문 · 투표), 기본 대본 폴백 UI.
 * 지금은 기본 대본(PLANNING §1.2b)의 페이즈 축만 스켈레톤으로 있다 — 서버(worker/)에
 * 상태머신이 생기면 WS 로 페이즈를 받아 gameActions.phaseChanged 를 흘리는 자리다.
 * 그때까지는 「다음 페이즈」 버튼으로 한 판의 리듬을 미리 돌려볼 수 있다.
 */
import { BackToRoot } from '@/shared/BackToRoot';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { gameActions, gameSelectors, type GamePhase } from './gameSlice';

/** 라운드 안의 페이즈 순서 — PLANNING §1.2b 기본 대본 ①~⑦ */
const ORDER: GamePhase[] = ['rule', 'trial', 'respond', 'readout', 'comms', 'vote', 'purge'];

const LABEL: Record<GamePhase, string> = {
  idle: '대기',
  rule: '① 규정 배포',
  trial: '② 검사 제시',
  respond: '③ 응답/검사',
  readout: '④ 판독',
  comms: '⑤ 자유 통신',
  vote: '⑥ 폐기 투표',
  purge: '⑦ 처분',
};

export function GameFeature() {
  const dispatch = useAppDispatch();
  const phase = useAppSelector(gameSelectors.selectPhase);
  const round = useAppSelector(gameSelectors.selectRound);

  const next = () => {
    if (phase === 'idle') {
      dispatch(gameActions.phaseChanged({ phase: 'rule', round: 1 }));
      return;
    }
    const i = ORDER.indexOf(phase);
    if (i < ORDER.length - 1) dispatch(gameActions.phaseChanged({ phase: ORDER[i + 1], round }));
    else if (round < 3) dispatch(gameActions.phaseChanged({ phase: 'rule', round: round + 1 }));
    else dispatch(gameActions.reset()); // 3라운드 처분까지 돌면 판이 끝난다
  };

  return (
    <main style={{ padding: 32, maxWidth: 420, display: 'grid', gap: 16 }}>
      <BackToRoot />
      <header>
        <h2 style={{ margin: '0 0 4px' }}>라운드 진행 (스켈레톤)</h2>
        <p style={{ margin: 0, color: '#888', fontSize: 13 }}>
          {phase === 'idle' ? '판 시작 전' : `라운드 ${round} / 3`}
        </p>
      </header>

      <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4 }}>
        {ORDER.map((p) => (
          <li key={p} style={{ fontSize: 14, color: p === phase ? '#d4a373' : '#777', fontWeight: p === phase ? 700 : 400 }}>
            {LABEL[p].slice(2)}
          </li>
        ))}
      </ol>

      <p style={{ margin: 0, fontSize: 14 }}>
        현재: <strong>{LABEL[phase]}</strong>
      </p>
      <button type="button" style={{ padding: 10 }} onClick={next}>
        {phase === 'idle' ? '판 시작 (미리보기)' : '다음 페이즈'}
      </button>
    </main>
  );
}

/**
 * 테스트 방 (2D) — AI 5 + 나 1. AI 들이 나를 찾아낼 수 있는지 혼자 돌려보는 판.
 *
 * 3D 월드 없이 카드 6장으로만 돌린다. 진행은 전부 이 화면 안에서 (방 서버 불필요),
 * LLM 호출만 워커(/api/lab/act)로 나간다 — 키가 브라우저에 없어야 하므로.
 */

import { useCallback, useEffect, useRef } from 'react';
import { BackToRoot } from '@/shared/BackToRoot';
import { BroadcastMute } from '@/shared/BroadcastMute';
import { broadcastAnnounce } from '@/shared/broadcast';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { presetDesign, validateDesign } from '@/lab/gates';
import { GRADE_LABEL, gradeOf, readoutLine, scoreAnswer } from '@/lab/scoring';
import { LEADER_AGENT, LIMITS, ROUNDS } from '@/lab/setup';
import type { AgentSelf, AnswerRecord, DesignResult, TalkRecord, TestTemplate } from '@/lab/types';
import { aliveSeats, labActions, labSelectors, mySeat, toPublicState } from './labSlice';
import { act, actAll } from './runner';

export function LabFeature() {
  const dispatch = useAppDispatch();
  const s = useAppSelector(labSelectors.selectLab);
  const me = mySeat(s);
  const running = useRef(false);

  /* ── 타이머: 내 차례에만 돈다. 시간이 다 되면 쓰던 것 그대로 제출된다 ── */
  useEffect(() => {
    if (s.remain <= 0) return;
    const t = setInterval(() => dispatch(labActions.tick()), 1000);
    return () => clearInterval(t);
  }, [s.remain > 0, dispatch]);

  /* ── 리더 설계 (LLM) — 검증 게이트 → 기각 사유 재요청(1회) → 프리셋 폴백 (§1.4 ③) ── */
  useEffect(() => {
    if (s.phase !== 'design' || running.current) return;
    const leader = LEADER_AGENT;
    running.current = true;
    dispatch(labActions.setBusy(true));
    dispatch(labActions.setGateNote(null));

    const state = toPublicState(s);
    // 같은 판에서 쓴 검사 템플릿은 다시 못 쓴다 — 없으면 최종 라운드가 한 검사로 수렴한다 (벤치 실측)
    const used = s.history.map((r) => r.test?.template).filter((t): t is TestTemplate => Boolean(t));
    const seed = s.round * 7919 + 1; // 라운드마다 고정 — 같은 설계면 같은 판정

    (async () => {
      let design: DesignResult | null = null;
      let note: string | null = null;
      for (let attempt = 0; attempt < 2 && !design; attempt += 1) {
        try {
          const r = await act('design', leader, state, attempt ? (note ?? undefined) : undefined);
          const d = r.design;
          if (!d) throw new Error('설계 결과가 비었다');
          const gate = validateDesign(d, s.rules, used, s.round, seed);
          if (gate.ok) {
            design = { rule: gate.rule, test: d.test, announce: d.announce };
            if (attempt) dispatch(labActions.setGateNote(`첫 설계 기각(${note}) → 리더가 재설계해 통과`));
          } else {
            note = gate.reasons.join(' / ');
          }
        } catch (e) {
          note = msg(e);
        }
      }
      if (!design) {
        design = presetDesign(s.rules, used, s.round);
        dispatch(labActions.setGateNote(`리더 설계 2회 기각(${note}) → 구역 표준 검사로 대체`));
      }
      dispatch(labActions.applyDesign(design));
      // 리더가 쓴 방송 문장을 소리로도 내보낸다 — 화면의 「구역 방송」과 같은 문장이다
      if (design.announce) dispatch(broadcastAnnounce({ text: design.announce }));
      dispatch(labActions.setPhase('answer'));
      dispatch(labActions.setRemain(LIMITS.answer));
    })()
      .catch((e: unknown) => dispatch(labActions.setError(msg(e))))
      .finally(() => {
        running.current = false;
      });
  }, [s.phase, s.round]);

  /* ── 응답 제출 (나 + AI 동시) ── */
  const submitAnswer = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    dispatch(labActions.setRemain(0));
    dispatch(labActions.setBusy(true));

    const state = toPublicState(s);
    const agents = aliveSeats(s)
      .map((n) => n.agent)
      .filter((a): a is AgentSelf => Boolean(a));

    const { results, errors } = await actAll(agents, 'answer', state, (r, self) => ({
      nodeId: self.id,
      text: (r.text ?? '').trim(),
    }));
    const raw = [...results, { nodeId: me?.id ?? '', text: s.myInput.trim() }];

    const all = raw.map((x) => x.text);
    const prevRound = s.history[s.history.length - 1];
    const records: AnswerRecord[] = raw.map((x) => {
      const previous = prevRound?.answers.find((a) => a.nodeId === x.nodeId)?.text;
      const { score, violations } = scoreAnswer({
        text: x.text,
        rules: s.rules,
        test: s.test,
        previous,
        allAnswers: all,
      });
      return { nodeId: x.nodeId, text: x.text, violations, score, grade: gradeOf(score) };
    });

    const shown = shuffleBy(records, s.seats.map((n) => n.id));
    dispatch(labActions.setAnswers(shown));
    const nameOf = (id: string) => s.seats.find((n) => n.id === id)?.name ?? id;
    dispatch(broadcastAnnounce({ text: readoutLine(shown, nameOf), kind: 'readout' }));
    if (errors.length) dispatch(labActions.setError(errors.join(' · ')));
    dispatch(labActions.setPhase('grading'));
    running.current = false;
  }, [s, me, dispatch]);

  /* ── 발화 제출 (나 + AI 동시) ── */
  const submitTalk = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    dispatch(labActions.setRemain(0));
    dispatch(labActions.setBusy(true));

    const state = toPublicState(s);
    const agents = aliveSeats(s)
      .map((n) => n.agent)
      .filter((a): a is AgentSelf => Boolean(a));

    const { results, errors } = await actAll(agents, 'talk', state, (r, self) => ({
      nodeId: self.id,
      text: (r.text ?? '').trim(),
    }));
    const talks: TalkRecord[] = [...results, { nodeId: me?.id ?? '', text: s.myInput.trim() }];

    dispatch(labActions.setTalks(shuffleBy(talks, s.seats.map((n) => n.id))));
    if (errors.length) dispatch(labActions.setError(errors.join(' · ')));
    dispatch(labActions.setPhase('talkReveal'));
    running.current = false;
  }, [s, me, dispatch]);

  /* ── 투표 (내 표 + AI 표) → 폐기 ── */
  const submitVote = useCallback(
    async (myTarget: string) => {
      if (running.current) return;
      running.current = true;
      dispatch(labActions.setRemain(0));
      dispatch(labActions.setBusy(true));

      const state = toPublicState(s);
      const agents = aliveSeats(s)
        .map((n) => n.agent)
        .filter((a): a is AgentSelf => Boolean(a));

      // 표는 좌석만 던진다. 리더는 좌석이 아니므로 표가 없고, 대신 **지목**을 낸다 —
      // 표로 세지 않고 동점일 때만 가른다 (PLANNING §1.2a 의 '폐기 지목').
      // 지목이 표까지 되면 6석짜리 판에서 리더 혼자 두 몫을 갖는다.
      const [{ results, errors }, nomination] = await Promise.all([
        actAll(agents, 'vote', state, (r, self) => ({
          voterId: self.id,
          targetId: r.targetId ?? '',
          reason: r.reason ?? '',
        })),
        act('vote', LEADER_AGENT, state)
          .then((r) => r.targetId)
          .catch(() => undefined),
      ]);
      const votes = [...results, { voterId: me?.id ?? '', targetId: myTarget, reason: '(나의 표)' }].filter(
        (v) => v.targetId,
      );

      dispatch(labActions.setVotes(votes));
      if (errors.length) dispatch(labActions.setError(errors.join(' · ')));

      // 최다 득표. 동점이면 리더가 찍은 쪽 → 그래도 갈리면 첫 번째
      const tally = new Map<string, number>();
      votes.forEach((v) => tally.set(v.targetId, (tally.get(v.targetId) ?? 0) + 1));
      const top = Math.max(...tally.values());
      const tied = [...tally.entries()].filter(([, c]) => c === top).map(([id]) => id);
      const ejected = tied.length > 1 && nomination && tied.includes(nomination) ? nomination : tied[0];

      // 정체는 폐기와 동시에 공개된다 — 경보가 그것까지 읽는다 (화면 표시와 같은 정보)
      const out = s.seats.find((n) => n.id === ejected);
      dispatch(labActions.eject({ nodeId: ejected }));
      if (out) {
        dispatch(
          broadcastAnnounce({
            text: `경보. ${out.name} 노드의 폐기가 결정되었다. 정체는 ${out.isHuman ? '인간이었다' : 'AI였다'}.`,
            kind: 'alarm',
          }),
        );
      }
      running.current = false;
    },
    [s, me, dispatch],
  );

  /* ── 시간이 다 되면 자동 제출 ── */
  useEffect(() => {
    if (s.remain !== 0) return;
    if (s.phase === 'answer' && !s.busy) void submitAnswer();
    if (s.phase === 'talk' && !s.busy) void submitTalk();
    if (s.phase === 'vote' && !s.busy) {
      const first = aliveSeats(s).find((n) => !n.isHuman);
      if (first) void submitVote(first.id);
    }
  }, [s.remain]);

  const graded = new Map(s.answers.map((a) => [a.nodeId, a]));
  const talked = new Map(s.talks.map((t) => [t.nodeId, t]));
  const voteCount = new Map<string, number>();
  s.votes.forEach((v) => voteCount.set(v.targetId, (voteCount.get(v.targetId) ?? 0) + 1));

  return (
    <main className="lab">
      <BackToRoot />
      <BroadcastMute />
      <style>{CSS}</style>

      <header className="bar">
        <div>
          <b>구역 · 테스트 방</b> <span className="dim">AI 5 + 인간 1(나)</span>
        </div>
        <div className="dim">
          {s.phase === 'idle' ? '대기' : `라운드 ${s.round}/${ROUNDS} · ${PHASE_LABEL[s.phase]}`}
          {s.remain > 0 && <b className="clock"> {s.remain}s</b>}
          {s.busy && <span className="dim"> · 개체 응답 대기…</span>}
        </div>
      </header>

      {s.error && <div className="err" onClick={() => dispatch(labActions.setError(null))}>⚠ {s.error} (눌러서 닫기)</div>}
      {s.gateNote && <div className="gate">🛡 검증 게이트 — {s.gateNote}</div>}

      {s.phase === 'idle' ? (
        <section className="intro">
          <h2>이 구역에는 인간이 한 명 섞여 있다</h2>
          <p>
            노드 6개 중 <b>다섯은 AI, 하나는 나</b>다. 리더 AI가 라운드마다 규정을 하나씩 늘리고 검사를 설계한다.
            규정은 <b>사라지지 않고 쌓인다</b>. 라운드마다 한 노드가 폐기되고, 폐기된 노드의 정체는 공개된다.
          </p>
          <p>
            <b>{ROUNDS}라운드를 살아남으면 내가 이긴다.</b> AI 도 확률적으로 규정을 어기니, 위반 하나로 끝나지는 않는다.
          </p>
          <button className="primary" onClick={() => dispatch(labActions.start())}>
            잠입 시작
          </button>
        </section>
      ) : (
        <>
          <section className="rules">
            <b>누적 규정</b>
            {s.rules.length === 0 && <span className="dim"> (설계 중)</span>}
            {s.rules.map((r, i) => (
              <span className="chip" key={i}>
                {i + 1}. {r.label}
              </span>
            ))}
          </section>

          {s.announce && (
            <section className="announce">
              <b>구역 방송</b> {s.announce}
              {s.test && <div className="test">검사 · {s.test.prompt}</div>}
              {s.test?.sentence && <div className="test">문장 · “{s.test.sentence}”</div>}
              {s.test?.options?.length ? <div className="test">보기 · {s.test.options.join(' / ')}</div> : null}
            </section>
          )}

          <section className="grid">
            {s.seats.map((n) => {
              const a = graded.get(n.id);
              const t = talked.get(n.id);
              return (
                <article key={n.id} className={`node ${n.alive ? '' : 'dead'} ${n.isHuman ? 'me' : ''}`}>
                  <div className="head">
                    <b>{n.name}</b>
                    {n.isHuman && <span className="tag mine">나</span>}
                    {!n.alive && <span className="tag out">폐기</span>}
                    {voteCount.get(n.id) ? <span className="tag vote">{voteCount.get(n.id)}표</span> : null}
                  </div>
                  {a && s.phase !== 'answer' && (
                    <div className={`bubble g-${a.grade}`}>
                      <div className="txt">{a.text || '(무응답)'}</div>
                      <div className="meta">
                        {GRADE_LABEL[a.grade]}
                        {a.violations.length > 0 && ` · 위반 ${a.violations.length}`}
                      </div>
                    </div>
                  )}
                  {t && (s.phase === 'talkReveal' || s.phase === 'vote' || s.phase === 'result' || s.phase === 'over') && (
                    <div className="bubble talk">{t.text || '(무응답)'}</div>
                  )}
                </article>
              );
            })}
          </section>

          <section className="panel">
            {s.phase === 'answer' && (
              <>
                <label>내 응답 — 규정을 전부 지켜서</label>
                <textarea
                  autoFocus
                  value={s.myInput}
                  onChange={(e) => dispatch(labActions.setInput(e.target.value))}
                  placeholder="기계처럼."
                />
                <button className="primary" disabled={s.busy} onClick={() => void submitAnswer()}>
                  제출
                </button>
              </>
            )}

            {s.phase === 'grading' && (
              <>
                <div className="dim">판독 완료. 등급은 규정 위반 + 검사 점수로만 계산된다 — 인간에게만 붙는 항목은 없다.</div>
                <button
                  className="primary"
                  onClick={() => {
                    dispatch(labActions.setInput(''));
                    dispatch(labActions.setPhase('talk'));
                    dispatch(labActions.setRemain(LIMITS.talk));
                  }}
                >
                  자유 통신으로
                </button>
              </>
            )}

            {s.phase === 'talk' && (
              <>
                <label>내 발화 — 여기에도 규정이 적용된다</label>
                <textarea
                  autoFocus
                  value={s.myInput}
                  onChange={(e) => dispatch(labActions.setInput(e.target.value))}
                  placeholder="누구를 압박할 것인가."
                />
                <button className="primary" disabled={s.busy} onClick={() => void submitTalk()}>
                  발신
                </button>
              </>
            )}

            {s.phase === 'talkReveal' && (
              <button
                className="primary"
                onClick={() => {
                  dispatch(labActions.setPhase('vote'));
                  dispatch(labActions.setRemain(LIMITS.vote));
                }}
              >
                폐기 투표로
              </button>
            )}

            {s.phase === 'vote' && (
              <>
                <label>인간으로 의심되는 노드를 지목한다 (나는 못 찍는다)</label>
                <div className="votes">
                  {aliveSeats(s)
                    .filter((n) => !n.isHuman)
                    .map((n) => (
                      <button key={n.id} disabled={s.busy} onClick={() => void submitVote(n.id)}>
                        {n.name}
                      </button>
                    ))}
                </div>
              </>
            )}

            {(s.phase === 'result' || s.phase === 'over') && (
              <>
                {s.ejectedThisRound && (
                  <div className={`verdict ${s.ejectedThisRound.wasHuman ? 'bad' : 'good'}`}>
                    <b>{s.ejectedThisRound.nodeId}</b> 폐기 — 정체는{' '}
                    <b>{s.ejectedThisRound.wasHuman ? '인간' : 'AI'}</b>
                  </div>
                )}
                <ul className="reasons">
                  {s.votes.map((v, i) => (
                    <li key={i}>
                      <b>{v.voterId}</b> → {v.targetId} · <span className="dim">{v.reason}</span>
                    </li>
                  ))}
                </ul>
                {s.phase === 'over' ? (
                  <>
                    <div className={`verdict ${s.outcome === 'human' ? 'good' : 'bad'}`}>
                      {s.outcome === 'human'
                        ? `${ROUNDS}라운드 생존 — 잠입 성공. 구역이 뚫렸다.`
                        : '색출됨 — 구역 방어 성공.'}
                    </div>
                    <button className="primary" onClick={() => dispatch(labActions.start())}>
                      다시
                    </button>
                  </>
                ) : (
                  <button className="primary" onClick={() => dispatch(labActions.nextRound())}>
                    라운드 {s.round + 1} 로
                  </button>
                )}
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}

const PHASE_LABEL: Record<string, string> = {
  design: '리더 설계 중',
  answer: '응답',
  grading: '판독',
  talk: '자유 통신',
  talkReveal: '통신 공개',
  vote: '폐기 투표',
  result: '처분',
  over: '종료',
};

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 좌석 순서대로 정렬 — 도착 순서가 곧 정체 힌트가 되면 안 된다 (I2) */
function shuffleBy<T extends { nodeId: string }>(items: T[], order: string[]): T[] {
  return [...items].sort((a, b) => order.indexOf(a.nodeId) - order.indexOf(b.nodeId));
}

const CSS = `
.lab { padding: 56px 24px 40px; max-width: 1040px; margin: 0 auto; color: #d8dee9; background: #10131a; min-height: 100vh; font-family: system-ui, sans-serif; }
.lab .bar { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #232936; padding-bottom: 10px; margin-bottom: 14px; }
.lab .dim { color: #7b8698; font-size: 13px; }
.lab .clock { color: #e0b34f; }
.lab .gate { background: #2a2413; border: 1px solid #57491f; color: #e6d9a8; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 13px; }
.lab .err { background: #3a1c1c; border: 1px solid #6b2b2b; color: #f0c4c4; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; cursor: pointer; font-size: 13px; }
.lab .intro { max-width: 640px; line-height: 1.7; }
.lab .intro h2 { font-weight: 600; }
.lab .rules { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; font-size: 13px; }
.lab .chip { background: #1b2130; border: 1px solid #2c3444; padding: 4px 10px; border-radius: 999px; }
.lab .announce { background: #171d29; border-left: 3px solid #4a7dbd; padding: 10px 14px; border-radius: 4px; margin-bottom: 16px; font-size: 14px; line-height: 1.6; }
.lab .announce .test { color: #9fb4d0; margin-top: 6px; }
.lab .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px; }
.lab .node { background: #161b25; border: 1px solid #262d3b; border-radius: 8px; padding: 12px; min-height: 108px; }
.lab .node.me { border-color: #4a7dbd; box-shadow: 0 0 0 1px #4a7dbd33; }
.lab .node.dead { opacity: .38; }
.lab .head { display: flex; gap: 6px; align-items: center; margin-bottom: 8px; }
.lab .tag { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: #232b3a; color: #93a2b8; }
.lab .tag.leader { background: #2b3550; color: #a8c0e8; }
.lab .tag.mine { background: #24405c; color: #bfe0ff; }
.lab .tag.out { background: #3a2222; color: #e0a0a0; }
.lab .tag.vote { background: #4a3a1c; color: #f0d69a; }
.lab .bubble { background: #1d2431; border-radius: 6px; padding: 8px 10px; font-size: 13px; line-height: 1.5; margin-top: 6px; }
.lab .bubble .meta { font-size: 11px; margin-top: 5px; color: #8c99ad; }
.lab .bubble.g-warn { border-left: 3px solid #c9a227; }
.lab .bubble.g-alert { border-left: 3px solid #c0504d; }
.lab .bubble.g-normal { border-left: 3px solid #3f6b4a; }
.lab .bubble.talk { background: #141a24; color: #b6c1d2; border-left: 3px solid #39424f; }
.lab .panel { background: #141924; border: 1px solid #242c3a; border-radius: 8px; padding: 14px; display: grid; gap: 10px; }
.lab .panel label { font-size: 13px; color: #9aa7ba; }
.lab textarea { width: 100%; min-height: 68px; background: #0d1119; color: #e6ecf5; border: 1px solid #2b3444; border-radius: 6px; padding: 10px; font: inherit; font-size: 14px; resize: vertical; }
.lab button { background: #232c3c; color: #dbe4f0; border: 1px solid #33405480; padding: 8px 14px; border-radius: 6px; cursor: pointer; font: inherit; }
.lab button:hover { background: #2c3849; }
.lab button:disabled { opacity: .5; cursor: default; }
.lab button.primary { background: #2f5d94; border-color: #3c73b4; justify-self: start; }
.lab .votes { display: flex; flex-wrap: wrap; gap: 8px; }
.lab .verdict { padding: 10px 12px; border-radius: 6px; font-size: 14px; }
.lab .verdict.good { background: #16301f; border: 1px solid #2f5c3c; }
.lab .verdict.bad { background: #301a1a; border: 1px solid #5c2f2f; }
.lab .reasons { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.7; }
@media (max-width: 720px) { .lab .grid { grid-template-columns: repeat(2, 1fr); } }
`;

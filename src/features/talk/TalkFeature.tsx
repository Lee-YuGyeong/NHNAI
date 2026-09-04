/**
 * 구역 (/lab) — AI 5개와 나 1명이 그냥 대화한다. 주제도 규정도 검사도 없다.
 *
 * 대화는 **알아서 굴러간다.** 자동 진행이 켜져 있으면 AI 들이 한 명씩 이어 말하고,
 * 누군가 내 노드를 부르면 거기서 멈춘다 — 내 차례라는 뜻이다.
 * 나는 순번과 무관하게 **언제든** 말할 수 있다 — AI 가 발화를 만드는 중에도 막히지 않는다.
 *
 * 다음 발화자는 직전 발화가 누굴 호명했는지로 정한다. 아무도 안 부르면 오래 안 말한 쪽.
 * 개체는 한 번에 하나씩, 앞사람 발화를 보고 말한다 (일괄 공개 아님).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ROOM_CODE_RE } from '@/world';
import { BackToRoot } from '@/shared/BackToRoot';
import { NotePad } from '@/shared/NotePad';
import { loadGuestNick } from '@/shared/guest';
import { useBroadcastRoom } from '@/shared/useBroadcastRoom';
import { BroadcastMute } from '@/shared/BroadcastMute';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  OPENERS,
  SPICE,
  EXECUTE_CUT,
  calledNode,
  resolveName,
  executionLines,
  heatOf,
  mobPressure,
  nextSpeaker,
  readyToExecute,
  shiftLine,
  silenceLabel,
  turnsSilent,
  type CastPersona,
  type CastResponse,
  type TalkLine,
  type TalkRequest,
  type TalkResponse,
} from '@/lab/talk';
import {
  AUTO_BUDGET,
  ROUNDS,
  aliveNodes,
  selfOf,
  talkActions,
  talkSelectors,
  type TalkNode,
} from './talkSlice';

async function post<T extends { error?: string }>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) throw new Error(data.error ?? `${res.status}`);
  return data;
}

const ask = (body: TalkRequest) => post<TalkResponse>('/api/lab/talk', body);

/** 내가 불리고 이만큼 조용하면 대화가 다시 흐른다 — 침묵도 플레이다 */
const CALL_WAIT_MS = 8000;

/** 폐기된 개체의 정체가 대화를 덮는 발화 수 — 이만큼 지나면 사건이 배경이 된다 */
const DEATH_BUZZ = 4;

export function TalkFeature() {
  const dispatch = useAppDispatch();

  /**
   * 방송을 방으로 내보낼지 — `?room=1234` 가 붙어 있을 때만 방에 접속한다.
   * 그냥 /lab 으로 들어오면 예전 그대로 이 화면에서만 소리가 난다.
   *
   * 지금 붙는 것은 **방송 통로뿐이다.** 판(개체·발화·표)은 여전히 브라우저마다 따로 돈다 —
   * 같은 방에 둘이 들어오면 각자 다른 판을 돌리면서 호스트의 경보만 같이 듣는다.
   * 판까지 방으로 옮기는 건 그다음 일이고, 이건 그 경로를 먼저 뚫어 두는 것이다.
   */
  const [params] = useSearchParams();
  const roomParam = params.get('room');
  const roomCode = roomParam && ROOM_CODE_RE.test(roomParam) ? roomParam : null;
  const room = useBroadcastRoom(roomCode, loadGuestNick());
  const s = useAppSelector(talkSelectors.selectTalk);
  const busy = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  /** 연달아 몇 번 넘어갔나 — 두 번이면 다음 개체는 반드시 말한다 */
  const passStreak = useRef(0);
  /** 표심 보드의 "왜?" — 각자 지금 뭘 근거로 의심하는지 펼쳐 본다 */
  const [showWhy, setShowWhy] = useState(false);

  const alive = s.started ? aliveNodes(s) : [];
  const me = alive.find((n) => n.isHuman);
  const ais = alive.filter((n) => !n.isHuman);
  const ids = alive.map((n) => n.id);
  const turnsThisRound = s.log.length - s.roundStart;
  /** 지금 표가 몰린 사람. 해명 차례와 프롬프트가 같이 이걸 본다 */
  const heat = heatOf(s.leanings, ids);
  const heatOnMe = Boolean(me && heat?.id === me.id);
  /** 그 사람에게 쏠린 확신의 압력. 선을 넘으면 리더가 쏜다 */
  const mob = mobPressure(s.leanings, s.leanConfidence, ids);
  const leader = alive.find((n) => n.isLeader);
  // 리더는 자기를 쏘지 않는다 — 몰이가 리더에게 붙으면 총은 안 나가고 투표로 간다
  const doomed = mob && leader && mob.id !== leader.id && readyToExecute(mob) ? mob.id : null;
  /** 누가 오래 말이 없는지 — AI 들이 이걸 보고 이름을 부른다 (숫자는 말로 옮겨 나간다) */
  const quiet = alive
    .map((n) => ({ id: n.id, turns: turnsSilent(s.log, n.id) }))
    .filter((q) => q.turns >= 3)
    .sort((a, b) => b.turns - a.turns)
    .slice(0, 3);
  /** 불렀는데 대답 없이 넘긴 사람들 — 침묵 중 유일하게 근거가 되는 것 */
  const ignoredList = Object.entries(s.ignored).filter(([, n]) => n > 0);
  const canVote = s.phase === 'talk' && turnsThisRound >= 3;
  /** 누가 내 번호를 불렀을 때만 내 차례다. 순번으로는 나를 세우지 않는다 */
  const caller = me && calledNode(s.log, alive)?.id === me.id ? s.log[s.log.length - 1]?.nodeId : null;
  const myTurn = Boolean(caller) && s.skipAt !== s.log.length;

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [s.log.length, s.speaking]);

  /** 개체 하나가 말한다. log 는 호출 시점의 최신 것을 넘긴다 (앞사람 발화를 보고 말해야 하므로) */
  const speak = useCallback(
    async (node: TalkNode, log: TalkLine[], opening = false, stalled?: string) => {
      dispatch(talkActions.setSpeaking(node.id));
      const r = await ask({
        kind: 'say',
        self: selfOf(node),
        nodes: ids,
        log,
        needTopic: opening,
        // 말문을 열 때만 얘깃거리를 하나 뽑아 쥐여 준다 — 매판 첫 대화가 달라지게
        topicHint: opening ? OPENERS[Math.floor(Math.random() * OPENERS.length)] : undefined,
        stalled,
        dead: s.dead,
        // 새 라운드의 첫 몇 마디는 **방금 공개된 정체**에 반응한다 — 그 뒤로는 배경(dead)으로 물러난다.
        // 아레나(ArenaFeature)의 BALANCE.deathBuzz 와 같은 장치다: 폐기는 사건이고, 사건에는 반응이 있어야 한다
        justDied: s.round > 1 && s.log.length - s.roundStart < DEATH_BUZZ ? s.dead[s.dead.length - 1] : undefined,
        round: s.round,
        leanings: s.leanings,
        heat: heat ?? undefined,
        shifts: s.shifts.slice(-4).map(shiftLine),
        quiet,
        ignored: s.ignored,
        // 연달아 두 번 넘어갔으면 이번엔 넘기지 못한다 — 전원이 넘기면 판이 멎는다
        mustSpeak: passStreak.current >= 2,
      });
      const text = (r.text ?? '').trim();
      if (r.pass || !text) {
        passStreak.current += 1;
        dispatch(
          talkActions.passTurn({ nodeId: node.id, wasCalled: calledNode(log, alive)?.id === node.id }),
        );
        return;
      }
      passStreak.current = 0;
      dispatch(
        talkActions.say({
          nodeId: node.id,
          text,
          leaning: r.leaning ?? '',
          why: r.why ?? '',
          confidence: r.confidence,
        }),
      );
      // 리더의 말만 소리로 나간다 — 다섯이 다 말하면 누가 말하는지 알 수 없고,
      // 애초에 목소리는 한 쪽에만 투자하기로 한 자리다 (PLANNING §6).
      // room.send 를 쓰는 이유는 처형 대사와 같다: 방에 붙어 있으면 서버를 거쳐
      // 전원이 같은 순간에 듣고, 혼자 도는 화면이면 여기서 바로 읽는다.
      if (node.isLeader) room.send(text);
    },
    [dispatch, ids, s.dead, s.round, s.roundStart, s.log.length, s.leanings, s.shifts, s.ignored, heat, quiet, alive],
  );

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      if (busy.current) return;
      busy.current = true;
      dispatch(talkActions.setBusy(true));
      try {
        await fn();
      } catch (e) {
        dispatch(talkActions.setError(e instanceof Error ? e.message : String(e)));
      } finally {
        busy.current = false;
        dispatch(talkActions.setBusy(false));
      }
    },
    [dispatch],
  );

  /** 성격 다섯을 생성한다. 실패는 null — 시작 쪽이 손으로 쓴 풀로 폴백한다 */
  const requestCast = useCallback((): Promise<CastPersona[] | null> => {
    const hints = [...SPICE].sort(() => Math.random() - 0.5).slice(0, 5);
    return post<CastResponse>('/api/lab/cast', { kind: 'cast', hints })
      .then((r) => r.personas ?? null)
      .catch(() => null);
  }, []);

  /**
   * 프리페치 — 인트로를 읽는 동안 다음 판의 성격을 미리 만들어 둔다 (PLANNING §1.4 와 같은 수법).
   * "들어가기"를 누르는 시점엔 대개 이미 완성돼 있어 기다림이 없다.
   */
  const pendingCast = useRef<Promise<CastPersona[] | null> | null>(null);
  useEffect(() => {
    if (!pendingCast.current) pendingCast.current = requestCast();
  }, [requestCast]);

  /** 판을 연다 — 미리 만들어 둔 성격을 꺼내 쓰고, 다음 판 몫을 바로 예열한다 */
  const startGame = useCallback(() => {
    dispatch(talkActions.start());
    const p = pendingCast.current ?? requestCast();
    pendingCast.current = null;
    void p.then((cast) => {
      dispatch(talkActions.castReady(cast));
      pendingCast.current = requestCast(); // 게임이 도는 동안 다음 판을 예열
    });
  }, [dispatch, requestCast]);

  /* ── 라운드가 열리면 누군가 먼저 말을 건다 — 매번 다른 사람이 열게 무작위로 뽑는다 ── */
  useEffect(() => {
    if (!s.started || s.casting || s.phase !== 'talk' || busy.current) return;
    if (s.log.length !== s.roundStart) return; // 이번 라운드에 아직 아무도 말 안 했을 때만
    const opener = ais[Math.floor(Math.random() * ais.length)];
    if (opener) void run(() => speak(opener, s.log, true));
  }, [s.started, s.casting, s.nodes.length, s.phase, s.roundStart, s.log.length]);

  /*
   * ── 자동 진행: 다음 사람이 AI 면 계속 이어 말한다 ──
   * 내가 불렸을 때도 영원히 멈추지 않는다 — CALL_WAIT_MS 만큼 조용하면 다른 AI 가
   * 내 침묵을 알고(stalled) 끼어든다. 단, 입력줄에 뭔가 쓰는 중이면 계속 기다려 준다.
   */
  useEffect(() => {
    if (!s.started || s.phase !== 'talk' || !s.auto || s.busy || s.autoLeft <= 0 || !s.log.length) return;
    if (myTurn && s.input.trim()) return; // 쓰는 중이다 — 기다린다
    const next = nextSpeaker(s.log, ais, heat, s.passes[s.passes.length - 1]);
    if (!next) return;
    const t = setTimeout(() => {
      dispatch(talkActions.useAutoTurn());
      void run(() => speak(next, s.log, false, myTurn ? me?.id : undefined));
    }, myTurn ? CALL_WAIT_MS : 700);
    return () => clearTimeout(t);
  }, [s.started, s.phase, s.auto, s.busy, s.autoLeft, s.log.length, s.passes.length, myTurn, s.input]);

  /*
   * ── 즉결 처형 ──
   * 의심이 한 사람에게 EXECUTE_CUT 을 넘게 쏠리면 투표를 기다리지 않는다. 리더가 전원을
   * 입 다물게 하고 그 자리에서 제거한다 — 몰린 쪽에게 주어진 시간은 **압력이 차기 전까지**다.
   * 해명이 통해 누군가의 확신이 내려가면 압력도 같이 내려가므로, 이건 되돌릴 수 있는 시계다.
   */
  useEffect(() => {
    if (!s.started || s.phase !== 'talk' || s.busy || !doomed || !leader) return;
    dispatch(talkActions.execute({ name: doomed, leaderId: leader.id }));
    room.send(executionLines(doomed).join(' '), 'alarm');
  }, [s.started, s.phase, s.busy, doomed, leader?.id]);

  /*
   * 자동 투표 전환은 없다 — 대화는 원하는 만큼 흐르고, 투표는 「투표 걸기」를 눌렀을 때만 열린다.
   * 대신 표심 보드가 실시간으로 "누가 누구를 몇 % 로 의심하는지"를 보여준다 (테스트용 관측창).
   */

  /**
   * 사람 발화 — LLM 호출이 없으니 busy 잠금을 타지 않는다. **언제든** 들어간다.
   * AI 가 발화를 만드는 중에 끼어들면 내 줄이 먼저 앉고, 만들던 발화는 그 뒤에 도착한다 —
   * 실제 채팅에서 말이 엇갈리는 것과 같다. 다음 개체부터는 내 말을 보고 말한다.
   */
  const send = () => {
    const text = s.input.trim();
    if (!text || !me) return;
    dispatch(talkActions.say({ nodeId: me.id, text }));
    dispatch(talkActions.setInput(''));
    dispatch(talkActions.setAuto(true)); // 내가 말했으니 다시 굴러가게 한다
  };

  /** 자동이 꺼져 있을 때 한 명만 더 말하게 */
  const oneMore = () =>
    void run(async () => {
      const next = nextSpeaker(s.log, ais, heat, s.passes[s.passes.length - 1]);
      if (next) await speak(next, s.log);
    });

  /** 내 표를 던지면 AI 들도 각자 지목하고, 최다 득표자가 폐기된다 */
  const castVote = (myTarget: string) =>
    void run(async () => {
      const results = await Promise.all(
        ais.map((n) =>
          ask({ kind: 'suspect', self: selfOf(n), nodes: ids, log: s.log, dead: s.dead, round: s.round }).then((r) => ({
            voterId: n.id,
            // 「013」·「13」처럼 줄여 적어도 그 개체에 꽂는다 — 판에 없는 이름이면 빈 표다
            targetId: resolveName(r.targetId ?? '', ids),
            reason: r.reason ?? '',
            confidence: r.confidence ?? 0.5,
          })),
        ),
      );
      const suspects = [
        ...results,
        { voterId: me?.id ?? '', targetId: myTarget, reason: '(내 표)', confidence: 1 },
      ].filter((v) => v.targetId);

      const tally = new Map<string, number>();
      suspects.forEach((v) => tally.set(v.targetId, (tally.get(v.targetId) ?? 0) + 1));
      const top = Math.max(...tally.values());
      const tied = [...tally.entries()].filter(([, c]) => c === top).map(([id]) => id);
      // 동점이면 리더가 찍은 쪽 — 리더도 갈렸으면 확신이 제일 높은 표 쪽
      const leaderPick = suspects.find((v) => ais.find((n) => n.isLeader)?.id === v.voterId)?.targetId;
      const strongest = [...suspects].sort((a, b) => b.confidence - a.confidence)[0]?.targetId;
      const name =
        tied.length === 1 ? tied[0] : leaderPick && tied.includes(leaderPick) ? leaderPick : (strongest ?? tied[0]);

      // 폐기와 정체 공개는 구역 전체가 듣는다 — 경보는 재생 중인 방송을 끊고 먼저 나간다.
      // 방에 붙어 있으면 서버를 거쳐 전원이 같은 순간에 듣는다 (useBroadcastRoom)
      const out = s.nodes.find((n) => n.id === name);
      dispatch(talkActions.eject({ name, suspects }));
      if (out) {
        room.send(
          `경보. ${out.id} 노드의 폐기가 결정되었다. 정체는 ${out.isHuman ? '인간이었다' : 'AI였다'}.`,
          'alarm',
        );
      }
    });


  return (
    <main className="talk">
      <BackToRoot />
      <BroadcastMute />
      <style>{CSS}</style>

      {/*
        관찰 수첩 — 오른쪽 변 (shared/NotePad). 여기는 3D 방이 아니라 **글로 된 방**이라
        판이 글을 덮는다: 수첩이 펴지면 뿌리에 표가 남고(:root[data-notepad]), 아래 CSS 가
        그만큼 이 단의 오른쪽을 비운다. 대화는 왼쪽에서 흐르고 내가 적는 것은 오른쪽에 쌓인다 —
        3D 방들과 같은 자리·같은 키(N)다.
        ★ 판이 서기 전(들어가기 화면)에도 둔다. 이 화면은 규정을 읽는 자리라 적을 것이 이미 있다.
      */}
      <NotePad room="구역" />

      <header className="bar">
        <div>
          <b>구역</b>{' '}
          <span className="dim">
            {s.started ? `라운드 ${s.round}/${ROUNDS} · 생존 ${alive.length}` : 'AI 5 + 나 1'}
          </span>
          {/* 방에 붙어 있으면 방송이 어디로 나가는지 보인다 — 안 그러면 "내 경보가 안 나온다"로만 보인다 */}
          {roomCode && (
            <span className="dim room">
              {' · '}방 {roomCode}
              {!room.connected
                ? ' (접속 중…)'
                : room.canBroadcast
                  ? ' · 방송 송신'
                  : ' · 수신만 (호스트가 방송한다)'}
            </span>
          )}
        </div>
        <div className="dim">
          {s.started && me && (
            <>
              나는 <b className="mine">{me.id}</b>
              {s.auto && s.phase === 'talk' && <span className="auto"> 자동 {s.autoLeft}</span>}
            </>
          )}
          <button className="ghost" onClick={() => dispatch(talkActions.togglePersonas())}>
            페르소나 {s.showPersonas ? '닫기' : '보기'}
          </button>
        </div>
      </header>

      {s.error && (
        <div className="err" onClick={() => dispatch(talkActions.setError(null))}>
          ⚠ {s.error} (눌러서 닫기)
        </div>
      )}

      {!s.started ? (
        <section className="intro">
          <h2>이 안에 사람이 하나 섞여 있다</h2>
          <p>
            여섯이 모여 그냥 <b>대화한다.</b> 주제도 규정도 없다. 다섯은 AI 고 하나가 나다. AI 들은 말을 주고받으면서
            그 안에 섞인 사람을 찾으려 하고, 아무 때나 <b>지목</b>을 시켜 지금 누구를 의심하는지 볼 수 있다.
          </p>
          <p className="dim">
            누가 내 번호를 부르면 내 차례다 — 그때 대화가 멈추고 기다린다. 그 외에는 아무 때나 끼어들면 된다.
          </p>
          <p className="dim">
            AI 들은 <b>서로의 성격을 모른다.</b> 그러니 내가 무슨 성격인 척할 필요도 없다 — 그냥 말하면 된다.
            걸리는 지점은 말투가 아니라 <b>앞뒤 일관성과 기억</b>이다.
          </p>
          <div className="btns">
            <button className="primary" onClick={startGame}>
              들어가기
            </button>
          </div>
        </section>
      ) : (
        <div className={`stage ${s.showPersonas ? 'with-panel' : ''}`}>
          {/* 표심 보드 — 채팅 스크롤 밖(스테이지 전폭 첫 행)에 둔다. 대화가 길어져도 안 밀려 올라간다 */}
          {!s.casting && s.phase !== 'over' && (
            <div className="board">
              <span className="dim">표심</span>
              {alive.map((n) => {
                const pct = s.leanings[n.id] ? Math.round((s.leanConfidence[n.id] ?? 0.5) * 100) : null;
                return (
                  <span key={n.id} className={`lean ${n.isHuman ? 'mine' : ''}`} title={s.leanReasons[n.id] || undefined}>
                    {n.id}
                    <b>{s.leanings[n.id] ? ` → ${s.leanings[n.id]}` : ' → ?'}</b>
                    {pct !== null && <span className={`pct ${pct >= 75 ? 'hot' : ''}`}> {pct}%</span>}
                  </span>
                );
              })}
              <button className="ghost why" onClick={() => setShowWhy((v) => !v)}>
                {showWhy ? '이유 접기' : '왜?'}
              </button>
              {(heat || s.shifts.length > 0 || quiet.length > 0 || ignoredList.length > 0) && (
                <div className="trail">
                  {heat && (
                    <span className={`heatline ${heatOnMe ? 'onme' : ''}`}>
                      {heatOnMe ? '표가 나에게 몰렸다 — 해명할 차례다' : `${heat.id} 에게 표가 몰렸다`}
                      <span className="dim"> ({heat.by.join(', ')})</span>
                    </span>
                  )}
                  {mob && mob.by.length >= 2 && (
                    <span className={`gauge ${mob.pressure >= EXECUTE_CUT ? 'over' : ''}`}>
                      {mob.id} 압력 {Math.round(mob.pressure * 100)}%
                      <span className="dim"> / {Math.round(EXECUTE_CUT * 100)}% 넘으면 제거된다</span>
                    </span>
                  )}
                  {quiet.length > 0 && (
                    <span className="dim small">조용: {quiet.map((q) => `${q.id}(${silenceLabel(q.turns)})`).join(' · ')}</span>
                  )}
                  {ignoredList.length > 0 && (
                    <span className="ignored">
                      불러도 안 나옴: {ignoredList.map(([id, n]) => `${id} ${n}회`).join(' · ')}
                    </span>
                  )}
                  {s.shifts.length > 0 && (
                    <span className="dim small">표심 변화: {s.shifts.slice(-3).map(shiftLine).join(' · ')}</span>
                  )}
                </div>
              )}
              {showWhy && (
                <div className="whys">
                  {alive.filter((n) => s.leanings[n.id]).length === 0 && (
                    <div className="dim small">아직 아무도 표명하지 않았다</div>
                  )}
                  {alive
                    .filter((n) => s.leanings[n.id])
                    .map((n) => (
                      <div key={n.id} className="dim small">
                        <b>{n.id}</b> → {s.leanings[n.id]} ({Math.round((s.leanConfidence[n.id] ?? 0.5) * 100)}%) :{' '}
                        {s.leanReasons[n.id] || '(이유를 안 밝혔다)'}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
          <section className="chat">
            {s.casting && (
              <div className="dim" style={{ padding: '28px 0', textAlign: 'center' }}>
                여섯을 모으는 중… 성격 다섯을 즉석에서 새로 만들고 있다
              </div>
            )}
            {s.log.map((l, i) => {
              const node = s.nodes.find((n) => n.id === l.nodeId);
              const gone = s.dead.some((d) => d.name === l.nodeId);
              return (
                <div key={i} className={`line ${node?.isHuman ? 'me' : ''} ${gone ? 'gone' : ''}`}>
                  <span className="who">
                    {l.nodeId}
                    {node?.isLeader && <em> 리더</em>}
                  </span>
                  <span className="txt">{l.text || '(무응답)'}</span>
                </div>
              );
            })}

            {s.speaking && (
              <div className="line typing">
                <span className="who">{s.speaking}</span>
                <span className="txt dim">…</span>
              </div>
            )}

            {s.ejected && (
              <div className={`verdict ${s.ejected.wasHuman ? 'bad' : 'good'}`}>
                <b>
                  {s.ejected.name} {s.executed === s.ejected.name ? '제거' : '폐기'} —{' '}
                  {s.ejected.wasHuman ? '사람이었다' : 'AI였다'}
                </b>
                {s.executed === s.ejected.name && (
                  <div className="dim">리더가 투표를 기다리지 않고 그 자리에서 제거했다</div>
                )}
                <ul>
                  {s.suspects.map((v, i) => {
                    const said = s.leanings[v.voterId];
                    return (
                      <li key={i}>
                        <b>{v.voterId}</b> → {v.targetId}
                        {said && said !== v.targetId && <span className="flip">말 바꿈 ({said} 라더니)</span>}
                        <span className="conf">확신 {Math.round(v.confidence * 100)}%</span>
                        <div className="dim">{v.reason}</div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {s.outcome && (
              <div className={`verdict ${s.outcome === 'human' ? 'good' : 'bad'} big`}>
                {s.outcome === 'human'
                  ? `${ROUNDS} 라운드를 버텼다 — 구역이 뚫렸다.`
                  : '색출됐다 — 구역이 지켜졌다.'}
              </div>
            )}

            <div ref={bottom} />
          </section>

          {s.showPersonas && (
            <aside className="panel">
              <div className="dim">
                프롬프트를 고치면 <b>다음 발화부터</b> 반영된다. 새로고침하면 날아가니, 마음에 들면{' '}
                <code>src/lab/personas.ts</code> 에 옮겨 적는다.
              </div>
              {s.nodes.map((n) => (
                <div key={n.id} className="pcard">
                  <div className="phead">
                    <b>{n.id}</b>
                    <span className="dim">{n.model.replace('claude-', '')}</span>
                    {n.isLeader && <span className="tag">리더</span>}
                    {n.isHuman && <span className="tag mine">나</span>}
                  </div>
                  <div className="dim small">{n.title}</div>
                  <textarea
                    value={n.prompt}
                    onChange={(e) => dispatch(talkActions.editPersona({ id: n.id, prompt: e.target.value }))}
                  />
                </div>
              ))}
            </aside>
          )}
        </div>
      )}

      {s.started && s.phase === 'talk' && !s.casting && (
        <section className="controls">
          {myTurn && !s.busy && (
            <div className="turn">
              <span>
                <b>{caller}</b> 가 나를 불렀다 — 내 차례 <span className="dim">(가만히 있으면 곧 누가 끼어든다)</span>
              </span>
              <button className="ghost" onClick={() => me && dispatch(talkActions.skipTurn({ id: me.id }))}>
                대답 안 하고 넘기기
              </button>
            </div>
          )}
          <textarea
            value={s.input}
            placeholder={me ? `${me.id} 로 말한다` : ''}
            onChange={(e) => dispatch(talkActions.setInput(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
            }}
          />
          <div className="btns">
            <button className="primary" disabled={!s.input.trim()} onClick={send}>
              말하기 <span className="dim">⌘↵</span>
            </button>
            <label className="toggle">
              내 마음
              <select
                value={me ? (s.leanings[me.id] ?? '') : ''}
                onChange={(e) => me && dispatch(talkActions.setLeaning({ id: me.id, target: e.target.value }))}
              >
                <option value="">미정</option>
                {ais.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.id}
                  </option>
                ))}
              </select>
            </label>
            <label className={`toggle ${s.auto ? 'on' : ''}`}>
              <input
                type="checkbox"
                checked={s.auto}
                onChange={(e) => dispatch(talkActions.setAuto(e.target.checked))}
              />
              자동 진행
              <span className="dim">{s.auto ? ` ${s.autoLeft}번 남음` : ` (${AUTO_BUDGET}번)`}</span>
            </label>
            <button disabled={s.busy} onClick={oneMore}>
              한 명 더
            </button>
            <button disabled={s.busy || !canVote} onClick={() => dispatch(talkActions.openVote())}>
              투표 걸기
            </button>
            <button className="ghost" disabled={s.busy} onClick={() => dispatch(talkActions.reset())}>
              판 리셋
            </button>
            {s.busy && <span className="dim">발화 생성 중…</span>}
          </div>
        </section>
      )}
      {s.started && s.phase === 'vote' && (
        <section className="controls">
          <div className="turn">
            <span>
              <b>라운드 {s.round}</b> — 사람이라고 생각하는 한 명을 지목한다. 최다 득표자는 폐기된다.
            </span>
          </div>
          <div className="btns">
            {ais.map((n) => (
              <button key={n.id} disabled={s.busy} onClick={() => castVote(n.id)}>
                {n.id}
              </button>
            ))}
            {s.busy && <span className="dim">다들 표를 던지는 중…</span>}
          </div>
        </section>
      )}

      {s.started && s.phase === 'result' && (
        <section className="controls">
          <div className="btns">
            <button className="primary" disabled={s.busy} onClick={() => dispatch(talkActions.nextRound())}>
              라운드 {s.round + 1} 로
            </button>
          </div>
        </section>
      )}

      {s.started && s.phase === 'over' && (
        <section className="controls">
          <div className="btns">
            <button className="primary" onClick={startGame}>
              다시
            </button>
            <button className="ghost" onClick={() => dispatch(talkActions.reset())}>
              나가기
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

const CSS = `
.talk { padding: 52px 20px 24px; max-width: 1180px; margin: 0 auto; color: #d8dee9; background: #10131a; min-height: 100vh; font-family: system-ui, sans-serif; display: flex; flex-direction: column; }
/* 수첩(shared/NotePad)이 펴져 있으면 그만큼 오른쪽을 비운다 — 안 그러면 판이 대화를 덮는다.
   상자를 수첩 폭만큼 넓히고 그 폭을 padding 으로 도로 비운다: 글 단은 여태 그대로 1180px 다.
   좁은 창에서는 수첩이 애초에 접혀 있다 (notes.ts 의 defaultOpen) — 폈다면 덮는 쪽을 택한 것이다. */
@media (min-width: 900px) {
  :root[data-notepad='open'] .talk { max-width: 1516px; padding-right: 336px; }
}
.talk .bar .room { color: #8ba0bd; }
.talk .bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #232936; padding-bottom: 10px; margin-bottom: 12px; }
.talk .dim { color: #7b8698; font-size: 13px; }
.talk .small { font-size: 12px; }
.talk .mine { color: #9fd0ff; }
.talk .auto { color: #7fb08a; margin-left: 8px; }
.talk .err { background: #3a1c1c; border: 1px solid #6b2b2b; color: #f0c4c4; padding: 8px 12px; border-radius: 6px; margin-bottom: 10px; cursor: pointer; font-size: 13px; }
.talk .intro { max-width: 620px; line-height: 1.75; }
.talk .intro .btns { margin-top: 14px; }
.talk .stage { display: grid; grid-template-columns: 1fr; gap: 14px; flex: 1; min-height: 0; }
.talk .stage.with-panel { grid-template-columns: 1fr 380px; }
.talk .chat { background: #141924; border: 1px solid #222937; border-radius: 8px; padding: 14px; overflow-y: auto; max-height: 56vh; }
.talk .cover { background: #17202e; border-left: 3px solid #4a7dbd; border-radius: 4px; padding: 10px 12px; margin-bottom: 14px; }
.talk .cover summary { cursor: pointer; font-size: 13.5px; }
.talk .cover pre { white-space: pre-wrap; font: inherit; font-size: 12.5px; color: #a9b6c8; margin: 6px 0 0; line-height: 1.6; }
.talk .line { display: grid; grid-template-columns: 92px 1fr; gap: 10px; padding: 7px 0; border-bottom: 1px solid #1b2130; font-size: 14px; line-height: 1.6; }
.talk .line:last-of-type { border-bottom: 0; }
.talk .line .who { color: #8ba0bd; font-size: 12.5px; padding-top: 2px; }
.talk .line .who em { color: #6b7a90; font-style: normal; font-size: 11px; }
.talk .line.me { background: #16202c; margin: 0 -8px; padding: 7px 8px; border-radius: 4px; }
.talk .line.me .who { color: #9fd0ff; }
.talk .typing .txt { letter-spacing: 3px; }
.talk .verdict { margin-top: 14px; padding: 12px; border-radius: 6px; font-size: 13px; }
.talk .verdict.good { background: #16301f; border: 1px solid #2f5c3c; }
.talk .verdict.bad { background: #301a1a; border: 1px solid #5c2f2f; }
.talk .verdict ul { margin: 8px 0 0; padding-left: 18px; line-height: 1.65; }
.talk .verdict.big { font-size: 15px; text-align: center; padding: 16px; }
.talk .line.gone { opacity: .4; }
.talk .board { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px 10px; background: #171d29; border-radius: 6px; font-size: 12.5px; }
.talk .lean { background: #1d2431; border-radius: 999px; padding: 3px 10px; color: #9aa7ba; }
.talk .lean b { color: #cfd8e6; font-weight: 500; }
.talk .lean.mine { background: #24405c; color: #bfe0ff; }
.talk .board button.why { padding: 2px 9px; font-size: 11.5px; }
.talk .lean .pct { color: #7b8698; font-size: 11.5px; }
.talk .lean .pct.hot { color: #e0b34f; }
.talk .board .trail { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; padding-top: 4px; border-top: 1px solid #232936; }
.talk .heatline { color: #e0b34f; }
.talk .gauge { color: #c9a24a; }
.talk .ignored { color: #b58ac9; }
.talk .gauge.over { color: #ff8b8b; font-weight: 600; }
.talk .heatline.onme { color: #ff9c9c; font-weight: 600; }
.talk .board .whys { flex-basis: 100%; display: grid; gap: 3px; padding-top: 4px; border-top: 1px solid #232936; line-height: 1.5; }
.talk .board .whys b { color: #9aa7ba; font-weight: 600; }
.talk .flip { color: #e0b34f; margin-left: 8px; font-size: 12px; }
.talk select { background: #0d1119; color: #e6ecf5; border: 1px solid #2b3444; border-radius: 4px; padding: 3px 6px; font: inherit; font-size: 13px; margin-left: 6px; }
.talk .verdict .conf { color: #8ba0bd; margin-left: 8px; font-size: 12px; }
.talk .panel { background: #141924; border: 1px solid #222937; border-radius: 8px; padding: 12px; overflow-y: auto; max-height: 56vh; display: grid; gap: 10px; align-content: start; }
.talk .pcard { background: #171d29; border-radius: 6px; padding: 10px; }
.talk .phead { display: flex; gap: 8px; align-items: center; }
.talk .tag { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: #232b3a; color: #93a2b8; }
.talk .tag.mine { background: #24405c; color: #bfe0ff; }
.talk .panel textarea { width: 100%; min-height: 130px; margin-top: 6px; }
.talk textarea { background: #0d1119; color: #e6ecf5; border: 1px solid #2b3444; border-radius: 6px; padding: 10px; font: inherit; font-size: 13.5px; line-height: 1.6; resize: vertical; }
.talk .controls { margin-top: 12px; display: grid; gap: 8px; }
.talk .controls textarea { min-height: 58px; }
.talk .turn { background: #1d3350; border: 1px solid #35598c; color: #cfe4ff; padding: 6px 10px; border-radius: 6px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.talk .turn button { padding: 4px 10px; font-size: 12.5px; }
.talk .btns { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.talk button { background: #232c3c; color: #dbe4f0; border: 1px solid #33405480; padding: 8px 14px; border-radius: 6px; cursor: pointer; font: inherit; }
.talk button:hover { background: #2c3849; }
.talk button:disabled { opacity: .45; cursor: default; }
.talk button.primary { background: #2f5d94; border-color: #3c73b4; }
.talk button.ghost { background: transparent; border-color: #2b3444; }
.talk .toggle { display: flex; align-items: center; gap: 6px; font-size: 13.5px; color: #9aa7ba; border: 1px solid #2b3444; border-radius: 6px; padding: 7px 12px; cursor: pointer; }
.talk .toggle.on { color: #cfe4d6; border-color: #3d6b4c; background: #17251c; }
@media (max-width: 900px) { .talk .stage.with-panel { grid-template-columns: 1fr; } }
`;

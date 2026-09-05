/**
 * 카드 — 미니 게임 1등의 전리품 (2026-09-05 사용자: "1등하면 카드 3개를 선택할 수 있게 하고 각각의 아이템을
 * 고를 수 있게").
 *
 *  · CardOffer  — 세 장이 펼쳐지고 **하나**를 고른다. 서버가 1등에게만 보낸다(game_cards.offer) — 봇이 1등이면
 *                 카드 없는 시험이다. 고르는 시간은 CARD.offerMs 뿐, 안 고르면 그냥 지나간다.
 *  · CardReveal — 방금 뒤집은 한 장. 판의 색이 그 카드의 색으로 바뀌고, REVEAL_MS 뒤 스스로 걷힌다.
 *  · CardDock   — 쥔 카드. 토론 중에만 쓸 수 있다. 지목권·답변 강제권은 상대를 골라야 하고(살아 있는 좌석),
 *                 진정권은 나 자신에게 쓴다.
 *  · CompelBar  — 답변 강제가 걸려 있는 동안 위에 서는 한 줄. 건 사람에게는 「다음 말이 질문」, 걸린 사람에게는
 *                 「다음 말이 답 — 거짓이면 +, 회피하면 +, 진실이면 −」, 나머지에겐 누가 누구를 걸었는지.
 *
 * 겉모습 (2026-09-05 사용자: "미니게임 이길때 카드 3개 나오는거 게임 전반적인 디자인 맞춰서 디자인 수정"):
 * 예전엔 이 판만 말투가 달랐다 — 먹빛 상자 하나에 카드 세 장이 그냥 얹혀 있었다. 지금은 「배정 통보」
 * (RoleBriefing) · 「판정 종료」(EndScreen)와 **같은 판**이 하나 더 켜지는 것이다: 머리띠(켜짐 점 · 모노 라벨 ·
 * 오른쪽 칩) → 본문 → 발치가 한 장의 모따기 판으로 서고, 스캔라인 한 겹이 그 위를 덮고, 켜지는 순간 빛이
 * 한 번 지나간다. 판의 색(--rc)은 고르는 동안 이 화면의 조명색이고, 뒤집은 뒤에는 **그 카드의 색**이다.
 * 값은 전부 interrogation.css 의 .ig-cardpanel 한 벌에 있다.
 *
 * 값을 만들지 않는다 — 카드의 효과(+20 · −20 · 거짓 판정)는 전부 서버 장부의 일이다 (worker/src/game/runtime.ts 의
 * cardUse · settleCompelled, game-protocol 의 CARD).
 */
import { useState } from 'react';
import { CARD, type CardItem, type GameSeat } from '@/world/mp/game-protocol';

/**
 * 뒤집은 카드가 서 있는 시간(ms). 발치의 막대가 이 값으로 줄고, 판을 실제로 걷는 타이머도 이 값을 쓴다
 * (InterrogationFeature 의 clearCardReveal) — 두 군데 적으면 막대가 다 빠진 뒤에도 판이 남는다.
 */
export const REVEAL_MS = 3500;

export const CARD_INFO: Record<CardItem, { title: string; glyph: string; blurb: string; needsTarget: boolean }> = {
  truth: {
    title: '답변 강제권',
    glyph: '‼',
    blurb: `지목한 상대는 내 다음 질문에 답해야 한다. 거짓이면 +${CARD.truthLie} · 얼버무리면 +${CARD.truthEvade} · 진실이면 −${-CARD.truthHonest}`,
    needsTarget: true,
  },
  accuse: { title: '지목권', glyph: '☞', blurb: `지목한 상대의 의심도를 +${CARD.accuseBoost}`, needsTarget: true },
  calm: { title: '진정권', glyph: '☺', blurb: `나에게 걸린 의심도를 −${CARD.calmDrop}`, needsTarget: false },
};

/** 엎어진 카드의 번호 — 뒤집기 전에 이 세 장을 가르는 것은 순서뿐이다 */
const BACK_MARK = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'];

/**
 * 엎어진 세 장 중 하나 — 1등의 선택. **뭔지는 안 보인다** (2026-09-05 사용자: "아이템은 처음에 안 보이게 해서
 * 선택했을 때 보이게"). 서버도 장수만 준다(game_cards.offer 는 number) — 순서는 서버가 섞었다 (runtime 의 dealOrder).
 * 고르면 고른 장만 들리고 나머지는 물러난다. 그 뒤 CardReveal 이 같은 자리에 서서 뒤집어 보인다.
 */
export function CardOffer({ count, onPick }: { count: number; onPick: (index: number) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div className="ig-cardpanel offer" role="dialog" aria-label="전리품 배분">
      <div className="panel">
        <div aria-hidden className="shine" />

        <div className="hd">
          <i aria-hidden className="live" />
          <span className="ttl">전리품 배분 · SPOILS</span>
          <span className="chip">1등</span>
        </div>

        <div className="bd">
          <p className="kicker">시험 1등의 몫</p>
          <p className="name">한 장을 고른다</p>
          <div className="rule" aria-hidden>
            ▪
          </div>
          <div className="row">
            {Array.from({ length: count }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`ig-card back${picked === i ? ' picked' : ''}`}
                disabled={picked !== null}
                onClick={() => {
                  setPicked(i);
                  onPick(i);
                }}
                aria-label={`${i + 1}번째 카드`}
              >
                <span className="idx">{BACK_MARK[i] ?? i + 1}</span>
                <span className="glyph" aria-hidden>
                  ?
                </span>
                <span className="mark">미확인</span>
              </button>
            ))}
          </div>
        </div>

        <div className="ft">
          <span className="ftx">답변 강제권 · 지목권 · 진정권 중 하나 — 뒤집어야 안다</span>
        </div>
      </div>
    </div>
  );
}

/**
 * 방금 뒤집은 카드 — 앞면이 REVEAL_MS 동안 서고 도크로 들어간다 (InterrogationFeature 의 clearCardReveal).
 * 판 전체가 그 카드의 색으로 켜진다: 머리띠의 점 · 왼쪽 세로선 · 윗변 헤어라인 · 발치 막대가 한 색이다.
 * 남은 시간은 말하지 않는다 — 「배정 통보」와 같이 발치의 가는 막대 하나가 줄어들 뿐이다.
 */
export function CardReveal({ item }: { item: CardItem }) {
  const info = CARD_INFO[item];
  return (
    <div
      className={`ig-cardpanel reveal ${item}`}
      aria-live="polite"
      style={{ ['--show' as string]: `${REVEAL_MS}ms` }}
    >
      <div className="panel">
        <div aria-hidden className="shine" />

        <div className="hd">
          <i aria-hidden className="live" />
          <span className="ttl">카드 확보 · ACQUIRED</span>
          <span className="chip">뒤집었다</span>
        </div>

        <div className="bd">
          <div className={`ig-card face ${item}`}>
            <span className="glyph" aria-hidden>
              {info.glyph}
            </span>
            <span className="ttl">{info.title}</span>
            <span className="blurb">{info.blurb}</span>
          </div>
        </div>

        <div className="ft">
          <span className="ftx">토론 중에 오른쪽 아래 「내 카드」에서 꺼내 쓴다</span>
          <span aria-hidden className="prog">
            <i />
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * 쥔 카드 — 오른쪽 아래. 고르는 판과 같은 짜임의 작은 단말이다(머리띠 · 본문), 쓸 상대를 고르는 단계가
 * 카드 밑으로 펼쳐진다.
 */
export function CardDock({
  items,
  seats,
  mySeatId,
  canUse,
  onUse,
}: {
  items: readonly CardItem[];
  seats: readonly GameSeat[];
  mySeatId: string | null;
  canUse: boolean;
  onUse: (item: CardItem, target?: string) => void;
}) {
  const [arming, setArming] = useState<CardItem | null>(null);
  if (items.length === 0) return null;
  const targets = seats.filter((s) => s.id !== mySeatId && !s.isolated);
  return (
    <div className="ig-carddock" aria-label="내 카드">
      <div className="hd">
        <i aria-hidden className="live" />
        <span className="ttl">내 카드</span>
        <span className="chip">{items.length}</span>
      </div>
      <div className="bd">
        {items.map((item, i) => {
          const info = CARD_INFO[item];
          const open = arming === item;
          return (
            <div key={`${item}-${i}`} className={`slot${open ? ' open' : ''}`}>
              <button
                type="button"
                className={`ig-card mini ${item}`}
                disabled={!canUse}
                onClick={() => {
                  if (!info.needsTarget) {
                    onUse(item);
                    return;
                  }
                  setArming(open ? null : item);
                }}
                title={info.blurb}
              >
                <span className="glyph" aria-hidden>
                  {info.glyph}
                </span>
                <span className="ttl">{info.title}</span>
              </button>
              {open ? (
                <div className="targets">
                  <span className="ask">누구에게?</span>
                  {targets.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setArming(null);
                        onUse(item, s.id);
                      }}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        {canUse ? null : <p className="lock">토론 중에만 쓴다</p>}
      </div>
    </div>
  );
}

/** 답변 강제가 걸려 있는 동안 — 위 가운데 한 줄 */
export function CompelBar({
  compelled,
  mySeatId,
  nameOf,
}: {
  compelled: { by: string; target: string; question: string | null };
  mySeatId: string | null;
  nameOf: (id: string) => string;
}) {
  const mine = compelled.by === mySeatId;
  const onMe = compelled.target === mySeatId;
  const text = mine
    ? compelled.question
      ? `${nameOf(compelled.target)} 의 답을 기다린다 — 「${compelled.question}」`
      : `답변 강제권 — 지금 치는 다음 말이 ${nameOf(compelled.target)} 에게 던지는 질문이 된다`
    : onMe
      ? compelled.question
        ? `${nameOf(compelled.by)} 의 질문 「${compelled.question}」 — 다음 말이 답이다. 거짓 +${CARD.truthLie} · 회피 +${CARD.truthEvade} · 진실 −${-CARD.truthHonest}`
        : `${nameOf(compelled.by)} 가 답변 강제권을 걸었다 — 질문이 오면 다음 말로 답해야 한다`
      : compelled.question
        ? `${nameOf(compelled.by)} → ${nameOf(compelled.target)} 「${compelled.question}」 — 답을 기다린다`
        : `${nameOf(compelled.by)} 가 ${nameOf(compelled.target)} 에게 답변 강제권을 걸었다`;
  return <p className={`ig-compel${onMe ? ' onme' : ''}`}>{text}</p>;
}

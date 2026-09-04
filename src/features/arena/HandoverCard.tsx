/**
 * 인계 화면 — 재검실을 나온 암전 위에 뜨는 **한 장의 서류**. 문이 열리기 전에 시설이 내 파일을 넘겨받는 장면이다.
 *
 * 파일 이름이 옆의 handover.ts 와 한 글자도 안 겹치게 HandoverCard 인 것은 macOS 때문이다 —
 * 기본 파일 시스템이 대소문자를 안 가려서 `./Handover` 와 `./handover` 가 같은 파일로 풀린다.
 *
 *      SECTOR 2098 · COGNITION DIVISION            인계 · TRANSFER
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ CHAPTER 3 · 재검                                    종료 │
 *   │   판정  방면 — 인지 검증실로 이관         문답  3회       │
 *   │   기록  [재검실] "…내가 마지막으로 한 말"                 │
 *   │   관측  · 재검을 통과함  · 정비 명판을 읽음               │
 *   ├──────────────────────────────────────────────────────────┤
 *   │ UNIT A38-091 · SECTOR 4 · BUILD 2026            추적 중   │
 *   │   AI SUSPICION  ▮▮▮▮▮▮▯▯▯▯▯▯  62%   → 검증실 인계 +19    │
 *   └──────────────────────────────────────────────────────────┘
 *     선입 개체  A38-206 · A38-072            검증실 내 대기
 *              CHAPTER 4 · 인 지 검 증 실
 *      "이 방에 인간이 하나 있다. 전 개체에 지시한다. 인간을 찾아내라."
 *              문 개방 대기 · 아무 키나 눌러 계속
 *
 * 왜 이게 필요한가 — features/arena/handover 머리말. 요는 하나다: 여기까지 세 장을 지나온 사람과
 * 주소를 직접 연 사람이 **같은 검은 화면**을 보고 있었다.
 *
 * 겉모습은 무대의 HUD 문법을 그대로 쓴다 (features/world/hud.css 의 모따기 판 · 청록 #6fd3ff · 분절 게이지 ·
 * 스캔라인). 이 화면만 다른 옷을 입으면 앞 방에서 걸어 나온 게 아니라 다른 게임의 로딩 화면이 된다.
 * 다만 hud.css 를 import 하지는 않는다 — 그쪽은 무대 위 절대배치(.hud-cluster)에 묶여 있고 여기는 가운데 한 장이라,
 * 값(색·모따기·분절)만 같게 두고 배치는 따로 쓴다.
 *
 * 읽기만 한다: handover.readHandover 가 뜬 기록 한 장을 받아 그린다. 저장소도 판도 안 건드린다.
 */

import { ORIGIN_YEAR } from '@/shared/era';

import { FACILITY_SECTOR, type Handover } from './handover';

const SEGMENTS = 12;

/**
 * order — 이 방의 지시. **리더가 막이 걷히자마자 방송하는 그 문장을 그대로 받는다**
 * (ArenaFeature 의 HUNT_ORDER). 여기 따로 베껴 두지 않는 이유: 한쪽만 고치면 서류에 적힌 지시와
 * 방에서 들리는 지시가 갈라지고, 그러면 이 화면은 앞뒤를 잇는 게 아니라 어긋내는 종이가 된다.
 */
export function HandoverCard({ record, ready, order }: { record: Handover; ready: boolean; order: string }) {
  const filled = Math.round((record.suspicion / 100) * SEGMENTS);
  const tone = record.cover.tone;
  return (
    <div className={`ho ${tone === 'bad' ? 'ho--alert' : ''}`}>
      <p className="ho-eyebrow">
        <span>SECTOR {FACILITY_SECTOR} · COGNITION DIVISION</span>
        <span className="ho-eyebrow__tag">인계 · TRANSFER</span>
      </p>

      <div className="ho-panel">
        {/* ── 앞 장 — 어디서 왔는가 ── */}
        {record.fromChapter ? (
          <section className="ho-sec">
            <h3 className="ho-h">
              <span>CHAPTER 3 · 재검</span>
              <em>종료</em>
            </h3>
            {record.verdict ? (
              <dl className="ho-kv">
                <dt>판정</dt>
                <dd className={record.verdict.grave ? 'grave' : ''}>
                  <b>{record.verdict.label}</b> — {record.verdict.detail}
                </dd>
                {record.rounds > 0 ? (
                  <>
                    <dt>문답</dt>
                    <dd>{record.rounds}회</dd>
                  </>
                ) : null}
              </dl>
            ) : (
              <p className="ho-none">판정 기록 없음 — 절차를 마치지 않고 이관됨</p>
            )}
            {record.lastSaid ? (
              <dl className="ho-kv">
                <dt>진술</dt>
                <dd className="ho-said">
                  <span className="ho-scene">[{record.lastSaid.scene}]</span> “{record.lastSaid.text}”
                </dd>
              </dl>
            ) : null}
            {record.notes.length ? (
              <dl className="ho-kv">
                <dt>관측</dt>
                <dd>
                  <ul className="ho-notes">
                    {record.notes.map((n, i) => (
                      <li key={`${n.scene}:${n.text}:${i}`}>
                        <span className="ho-scene">[{n.scene}]</span> {n.text}
                      </li>
                    ))}
                  </ul>
                </dd>
              </dl>
            ) : null}
          </section>
        ) : (
          <section className="ho-sec">
            <h3 className="ho-h">
              <span>선행 기록</span>
              <em>없음</em>
            </h3>
            {/* 주소를 직접 연 길 — 없는 이야기를 지어내지 않는다. 없다고 적는 것이 이 서류가 하는 말이다 */}
            <p className="ho-none">이관 기록 없음 — 검증실에서 직접 개시</p>
          </section>
        )}

        {/* ── 이 몸 — 무엇을 들고 가는가 ── */}
        <section className="ho-sec">
          <h3 className="ho-h">
            <span>
              UNIT {record.unit}
              {/* 정비 구역은 이 몸의 사정이고, 연식도 그렇다 — 복도의 명판이 적던 두 값이 서류에서 다시 만난다 (shared/era) */}
              <i className="ho-dim"> · SECTOR {record.sector} · BUILD {ORIGIN_YEAR}</i>
            </span>
            <em className={tone}>{record.cover.text}</em>
          </h3>
          <div className="ho-gauge">
            <span className="ho-label">AI SUSPICION</span>
            <span className="ho-seg" aria-hidden="true">
              {Array.from({ length: SEGMENTS }, (_, i) => (
                <i key={i} className={i < filled ? 'on' : ''} />
              ))}
            </span>
            <b>{record.suspicion}%</b>
          </div>
          {/*
            숫자가 판을 바꾼다는 것을 여기서 밝힌다 (handover.carrySuspicion).
            안 적으면 위의 62% 는 지나간 장면의 기념품으로 읽힌다 — 실제로는 다음 방의 출발선인데.
          */}
          <p className="ho-carry">
            {record.carried > 0 ? (
              <>
                검증실 인계 — 리더가 이 개체를 <b>+{record.carried}</b> 에서 본다
              </>
            ) : (
              <>검증실 인계 — 선행 의심 없음</>
            )}
          </p>
        </section>
      </div>

      {/*
        문 안쪽에 이미 서 있는 번호 — 줄에서 내 앞으로 걸어 들어간 개체들이다 (chapter2 의 admitted).
        서류에 적히는 이유: 막이 걷히면 그 번호가 **실제로 이름표로 붙어 있다** (handover 의 buildStoryCast).
        여기서 한 번 읽고 들어가면, 방에 들어서서 알아보는 것이 연출이 아니라 확인이 된다.
      */}
      {record.peers.length ? (
        <p className="ho-peers">
          <span className="ho-label">선입 개체</span>
          {record.peers.map((p) => (
            <b key={p}>{p}</b>
          ))}
          <i>검증실 내 대기</i>
        </p>
      ) : null}

      {/* ── 다음 장 ── */}
      <p className="ho-next">
        <span className="ho-no">CHAPTER 4</span>
        <b className="ho-title">인 지 검 증 실</b>
      </p>
      <p className="ho-order">“{order}”</p>
      <p className="ho-wait">{ready ? '문 개방 · 아무 키나 눌러 계속' : '문 개방 대기…'}</p>
    </div>
  );
}

export const HANDOVER_CSS = `
/* 인계 화면 — 무대 HUD(features/world/hud.css)의 값을 그대로 쓴다: 남색 반투명 모따기 판 · 청록 선 · 분절 게이지 */
.arena .ho { width: min(560px, calc(100vw - 32px)); display: grid; gap: 10px;
  font-family: ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace; color: #6fd3ff;
  text-align: left; animation: ho-in 0.9s ease-out both; }
@keyframes ho-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.arena .ho-eyebrow { margin: 0; display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
  font-size: 10px; letter-spacing: 0.18em; color: rgba(159, 208, 232, 0.55); }
.arena .ho-eyebrow__tag { padding: 2px 8px; color: #9fe0ff; background: rgba(111, 211, 255, 0.1);
  border: 1px solid rgba(111, 211, 255, 0.28); letter-spacing: 0.14em;
  clip-path: polygon(0 4px, 4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%); }

.arena .ho-panel { position: relative; display: grid; gap: 12px; padding: 14px 16px;
  background: rgba(8, 24, 42, 0.78); border-left: 1px solid rgba(111, 211, 255, 0.4);
  clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
  transition: background-color 0.5s, border-color 0.5s; }
.arena .ho-panel::after { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0.35;
  background: linear-gradient(to bottom, rgba(255,255,255,0) 50%, rgba(0,0,0,0.12) 50%); background-size: 100% 3px; }
.arena .ho--alert .ho-panel { background: rgba(38, 8, 8, 0.8); border-left-color: rgba(255, 90, 74, 0.75); }

.arena .ho-sec { display: grid; gap: 7px; }
.arena .ho-sec + .ho-sec { padding-top: 12px; border-top: 1px solid rgba(111, 211, 255, 0.14); }
.arena .ho-h { margin: 0; display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
  font-size: 12px; font-weight: 700; letter-spacing: 0.12em; color: #9fe0ff; }
.arena .ho-h em { font-style: normal; font-size: 11px; letter-spacing: 0.08em; color: rgba(159, 208, 232, 0.6); }
.arena .ho-h em.warn { color: #ffd27a; }
.arena .ho-h em.bad { color: #ff6a5a; }
.arena .ho-dim { font-style: normal; color: rgba(111, 211, 255, 0.4); }

.arena .ho-kv { margin: 0; display: grid; grid-template-columns: 46px 1fr; gap: 4px 10px; align-items: baseline; }
.arena .ho-kv dt { font-size: 10px; letter-spacing: 0.16em; color: rgba(111, 211, 255, 0.45); }
.arena .ho-kv dd { margin: 0; font-family: system-ui, -apple-system, 'Noto Sans KR', sans-serif;
  font-size: 12.5px; line-height: 1.5; color: #cfe6f5; }
.arena .ho-kv dd b { color: #eaf6ff; }
.arena .ho-kv dd.grave b { color: #ff8f80; }
.arena .ho-said { color: #eaf6ff; }
.arena .ho-scene { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 10.5px;
  color: rgba(111, 211, 255, 0.5); margin-right: 4px; }
.arena .ho-notes { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; }
.arena .ho-none { margin: 0; font-family: system-ui, -apple-system, 'Noto Sans KR', sans-serif;
  font-size: 12.5px; color: rgba(159, 208, 232, 0.5); }

.arena .ho-gauge { display: flex; align-items: center; gap: 9px; }
.arena .ho-label { font-size: 10px; letter-spacing: 0.16em; color: rgba(111, 211, 255, 0.45); }
.arena .ho-gauge b { font-size: 13px; color: #eaf6ff; }
.arena .ho-seg { flex: 1; display: flex; gap: 3px; }
.arena .ho-seg i { flex: 1; height: 7px; background: rgba(111, 211, 255, 0.12);
  clip-path: polygon(0 0, 100% 0, 100% 70%, 70% 100%, 0 100%); }
.arena .ho-seg i.on { background: #6fd3ff; box-shadow: 0 0 8px rgba(111, 211, 255, 0.55); }
.arena .ho--alert .ho-seg i.on { background: #ff6a5a; box-shadow: 0 0 8px rgba(255, 106, 90, 0.55); }
.arena .ho-carry { margin: 0; font-family: system-ui, -apple-system, 'Noto Sans KR', sans-serif;
  font-size: 12px; color: rgba(159, 208, 232, 0.7); }
.arena .ho-carry b { color: #ffd27a; }

/* 선입 개체 — 문 안쪽에 이미 서 있는 번호. 판 밖에 두어 「저 문 너머」로 읽히게 한다 */
.arena .ho-peers { margin: 2px 0 0; display: flex; flex-wrap: wrap; align-items: baseline;
  justify-content: center; gap: 4px 8px; }
.arena .ho-peers b { color: #eaf6ff; font-size: 12.5px; letter-spacing: 0.04em; }
.arena .ho-peers b + b::before { content: '·'; margin-right: 8px; color: rgba(111, 211, 255, 0.4); }
.arena .ho-peers i { font-style: normal; font-family: system-ui, -apple-system, 'Noto Sans KR', sans-serif;
  font-size: 11.5px; color: rgba(159, 208, 232, 0.55); }

.arena .ho-next { margin: 6px 0 0; display: flex; align-items: baseline; justify-content: center; gap: 12px; }
.arena .ho-no { font-size: 11px; letter-spacing: 0.3em; color: rgba(111, 211, 255, 0.5); }
.arena .ho-title { font-size: 20px; letter-spacing: 0.16em; color: #eaf6ff;
  text-shadow: 0 0 18px rgba(111, 211, 255, 0.6); }
.arena .ho-order { margin: 0; text-align: center;
  font-family: system-ui, -apple-system, 'Noto Sans KR', sans-serif; font-size: 12.5px; color: #9fb6c8; }
.arena .ho-wait { margin: 4px 0 0; text-align: center; font-size: 11px; letter-spacing: 0.08em;
  color: #56637a; animation: arenawait 2.4s ease-in-out infinite; }
`;

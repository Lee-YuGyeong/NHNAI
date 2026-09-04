/**
 * 검문소의 상태 패널 — 화면 왼쪽 위 (2026-09-03 사용자: "/world 왼쪽에 의심도랑 그런거,
 * 내가 만드는 /interrogation 에 그대로 연결되게 해줘").
 *
 *   SECTOR 2098 · COGNITION · 개체 4/6
 *   ┌ UNIT A38-091 · SECTOR 4         위장 유지 ┐
 *   │ AI SUSPICION 의심도                  37%  │
 *   │ ▮▮▮▮▯▯▯▯▯▯▯▯                              │
 *   │ TRIAL 검사                            2/5 │
 *   │ ━━━━━━━━━━━━━                             │
 *   │ ▸ ORDER · 지시   표식 없는 AI를 찾아내라    │
 *   └───────────────────────────────────────────┘
 *
 * ── 왜 features/world 의 StatusPanel 을 그대로 안 쓰나 ──
 *
 * **생김새는 그대로 쓴다.** 판·게이지·색·모따기가 전부 저쪽 hud.css 의 것이고 이 파일은 클래스만
 * 빌려 온다. 앞 세 장(복도 · 중앙 시설 · 재검실)을 지나온 사람에게 마지막 방만 다른 판이 서면
 * 그 화면은 이어진 것이 아니다 — 이 패널이 여기 서는 이유가 그것이다.
 *
 * **값은 그대로 못 쓴다.** 저쪽은 저장소 넷(mp/suspicion · mp/sync · mp/identity · chapter1)을
 * 직접 읽는데, 이 방에서는 그중 둘이 틀린 값을 가리킨다:
 *
 *   AI SUSPICION  이 방의 의심도는 **리더가 시행 기록으로 매기는 별도의 값**이다.
 *                 무대의 게이지(mp/suspicion)에서 이어받는 것은 3할뿐이고(handover.carrySuspicion),
 *                 그 뒤로 둘은 따로 움직인다. 저쪽을 그리면 화면 숫자와 실제 판정이 갈라진다.
 *   SYNC          이 방에서는 **아무도 동기화를 건드리지 않는다.** 재검실에서 멈춘 값이 그대로
 *                 얼어 있어서, 그리면 죽은 눈금이 하나 붙는다. 그 자리는 이 방에서 살아 있는
 *                 눈금으로 바꾼다 — 검사 진행이다. 몇 번을 넘겼는가가 곧 생존 조건이므로
 *                 (BALANCE.trialsToWin), 여기서는 그게 SYNC 자리에 설 값이다.
 *   OBJECTIVE     챕터 목표가 없다. 대신 **리더의 상시 명령**을 적는다 (HUNT_ORDER). 판이 걸린
 *                 동안의 지시문은 여기 안 온다 — 그때 이 판은 화면에서 비켜서 있다 (away).
 *
 * 그래서 저장소를 안 읽는다 — 값은 전부 밖에서 받는다. 이 파일은 그리기만 한다.
 *
 * ── 머리줄 첫 칸의 「SECTOR」는 시설 이름이다 (2026-09-03) ──
 *
 * 여기 여태 적히던 것은 `SECTOR {정비 구역}` 이었다 (2 · 4 · 7). 그런데 막이 걷히기 직전의 인계
 * 서류는 같은 자리에 `SECTOR 2098 · COGNITION DIVISION` 이라 적고, 판을 닫는 끝 화면도 2098 로
 * 돌아온다. **한 방 안에서 같은 낱말이 두 값을 가리켰다** — 서류를 읽고 고개를 든 사람에게는
 * 구역 번호가 2098 에서 4 로 바뀐 것으로 보인다. 게다가 앞 세 장의 같은 칩은 방 번호였다
 * (`NODE 4242` — features/world/StatusPanel).
 *
 * 그래서 첫 칸은 서류·끝 화면과 같은 값 하나로 두고(handover 의 FACILITY_SECTOR), 이 몸의 정비
 * 구역은 **서류가 적던 그 자리** — UNIT 번호 옆으로 내렸다 (HandoverCard 의 `UNIT … · SECTOR 4`).
 */

import { coverStatus } from '@/features/world/cover';
import '@/features/world/hud.css';

import { FACILITY_SECTOR } from './handover';

/** 저쪽 판과 같은 분절 수 — 눈금이 다르면 같은 게이지로 안 읽힌다 */
const SEGMENTS = 12;

export interface UnitPanelProps {
  /** 이 몸의 식별번호 — 복도에서 읽고 검문에서 답한 그 번호다 (handover.buildStoryCast) */
  unit: string;
  /** 이 몸의 마지막 정비 구역 — 시설 이름이 아니라 **몸의 사정**이라 UNIT 번호 옆에 붙는다 (머리말) */
  sector: number;
  /** 이 방의 내 의심도 0~100 (리더가 매긴 것) */
  suspicion: number;
  /** 동기화가 흔들린 채로 넘어왔나 — 위장 상태 낱말이 이걸 같이 본다 (coverStatus) */
  syncLow: boolean;
  /** 살아 있는 개체 수 / 이 방의 정원 */
  live: number;
  party: number;
  /** 넘긴 검사 / 살아남아야 하는 수 */
  trials: number;
  trialsToWin: number;
  /** 지금 걸린 지시 한 줄 */
  order: string;
  /**
   * 비켜서 있나 — 판이 걸려 있는 동안은 화면을 판에 내준다 (ArenaFeature 의 panelAway).
   *
   * 판이 시키는 글은 화면 위쪽 가운데에 서고 이 판은 왼쪽 위인데, 창이 넓지 않으면 그 상자의
   * 왼쪽 끝이 이 판을 문다 (2026-09-03 사용자: "절대 안 겹치게").
   *
   * **오고 가는 결이 다르다.** 비켜설 때는 그 자리에서 곧장 없어지고, 돌아올 때만 천천히
   * 떠오른다 — 흐려지는 동안 판 위에 남아 있으면 그게 곧 사용자가 본 겹침이다. 그래도 DOM 에서
   * 빼지는 않는다: 판을 뺐다 끼웠다 하면 앞 세 장을 내내 달고 온 계기가 마지막 방에서만
   * 깜빡이는 물건이 된다 (방송 중의 대화창과 같은 처리 — ArenaFeature 의 .comms.hushed).
   */
  away: boolean;
}

export function UnitPanel({ unit, sector, suspicion, syncLow, live, party, trials, trialsToWin, order, away }: UnitPanelProps) {
  const susp = Math.round(suspicion);
  // 색은 저쪽 StatusPanel 과 같은 문턱이다 (50 · 80) — 같은 게이지면 같은 자리에서 물들어야 한다
  const suspColor = susp < 50 ? '#6fd3ff' : susp < 80 ? '#ffb84d' : '#ff5a5a';
  const alert = susp >= 80;
  const lit = Math.round((susp / 100) * SEGMENTS);
  const cover = coverStatus(susp, syncLow);
  const done = Math.min(trials, trialsToWin);
  const left = trialsToWin - done;

  return (
    /* 비켜설 때는 읽는 장치에서도 빠진다 — 화면에서 지운 글을 스크린리더가 계속 읽으면 같은 겹침이다 */
    <div
      className="hud-cluster"
      aria-hidden={away}
      style={{
        opacity: away ? 0 : 1,
        /* 갈 때는 곧장(none), 올 때만 0.12초 뒤에 천천히 — 판의 말이 화면에서 걷히고 나서 뜬다 */
        transition: away ? 'none' : 'opacity 0.3s ease 0.12s',
      }}
    >
      <div className="hud-tag">
        {/* 시설 이름 — 인계 서류 눈썹줄·끝 화면과 같은 값이다 (handover 의 FACILITY_SECTOR) */}
        <span className="hud-tag__room">SECTOR {FACILITY_SECTOR}</span>
        <span className="hud-tag__dim">·</span>
        <span>COGNITION</span>
        <span className="hud-tag__dim">·</span>
        {/* 저쪽의 LINK n/m 자리 — 이 방에서 그 수에 해당하는 것은 **남은 몸**이다. 폐기가 나갈 때마다 준다 */}
        <span>
          개체 {live}/{party}
        </span>
      </div>

      <div className={`hud-panel ${alert ? 'hud-panel--alert' : ''}`}>
        <div className="hud-panel__head">
          <span>
            UNIT <b>{unit}</b>
            {/* 이 몸의 정비 구역 — 인계 서류가 UNIT 옆에 적던 그 자리다 (HandoverCard 의 ho-dim) */}
            <i> · SECTOR {sector}</i>
          </span>
          <em className={cover.tone}>{cover.text}</em>
        </div>

        <div className="hud-row" aria-label={`AI 의심도 ${susp}%`} style={{ color: suspColor }}>
          <div className="hud-row__head">
            <span className="hud-label">
              {susp >= 80 ? 'DETECTION_INC' : 'AI SUSPICION'}
              <em>의심도</em>
            </span>
            <span className="hud-row__right">
              <span className="hud-value">{susp}%</span>
            </span>
          </div>
          <div className="hud-seg">
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <i key={i} className={i < lit ? 'on' : ''} />
            ))}
          </div>
        </div>

        {/*
          SYNC 자리 — 이 방에서는 검사 진행이다 (머리말). 막대는 저쪽 SYNC 와 같은 것을 쓴다.
          색은 남은 수로 간다: 아직 멀면 청록, 한 판 남으면 호박 — 마지막 한 판이 제일 무거운 자리다.
        */}
        <div className="hud-row" aria-label={`검사 ${done}/${trialsToWin}`} style={{ color: left <= 1 ? '#ffd27a' : '#8ff0c8' }}>
          <div className="hud-row__head">
            <span className="hud-label">
              TRIAL
              <em>검사</em>
            </span>
            <span className="hud-row__right">
              <span className="hud-value">
                {done}/{trialsToWin}
              </span>
            </span>
          </div>
          <div className="hud-bar">
            <i style={{ width: `${Math.max(1.5, (done / trialsToWin) * 100)}%` }} />
          </div>
        </div>

        {order ? (
          <div className="hud-objective">
            <span style={{ fontSize: 11 }}>▸</span>
            <div>
              <div className="hud-objective__k">ORDER · 지시</div>
              <div className="hud-objective__v">{order}</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

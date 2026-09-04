/**
 * 상태 패널 — 화면 왼쪽 위. 방 표시 + 모따기 판 하나에 AI SUSPICION(분절 게이지) · SYNC(바) · 목표.
 * uxpilot 디자인(hud.css 머리말)을 옮긴 것 (2026-08-30 사용자: "라벨이 너무 간단하다 — 게임답게, 우리 맵과 어울리게").
 *
 *   NODE 4242 · TESTER · LINK 1/3
 *   ┌ UNIT A17-091              위장 유지 ┐
 *   │ AI SUSPICION 의심도   [+ 응시] 37%  │
 *   │ ▮▮▮▮▯▯▯▯▯▯▯▯                        │
 *   │ SYNC 동기화                     82% │
 *   │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
 *   │ ▸ OBJECTIVE · 지시  복도를 조사하라  │
 *   └─────────────────────────────────────┘
 *
 * 머리줄(2026-08-31 사용자: 라벨을 세계관·게임 분위기에 맞게) — **UNIT** 은 이 몸의 식별번호인데, 복도의 정비 단말을 읽기 전에는
 * ???-??? 다. 내가 아직 내 번호를 모른다는 사실이 화면에 그대로 적혀 있어야 「저걸 읽어야 한다」가 보인다.
 * 오른쪽은 위장 상태 한마디(coverStatus) — 위장 유지 → 주시됨 → 추적 중 → 노출 직전.
 * 그 낱말표는 ./cover 로 나가 있다: 무대를 넘길 때의 인계 기록(features/arena/handover)이 같은 말을 써야 해서다.
 *
 * 의심도 80↑ 또는 SYNC 80↓ 면 판이 붉어지고 라벨이 DETECTION_INC / SYNC_LOSS 로 바뀐다.
 * 저장소(mp/suspicion · mp/sync · chapter1)를 읽기만 한다. 값은 0.5 단위로 잘라 렌더 횟수를 줄인다.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';

import { identity } from '@/world/mp/identity';
import { suspicion, type Reason } from '@/world/mp/suspicion';
import { SYNC_GLITCH, sync } from '@/world/mp/sync';

import { chapter1 } from './chapter1';
import { coverStatus } from './cover';
import './hud.css';

const LABEL: Record<Reason, string> = {
  뒷걸음: '뒷걸음',
  감정: '감정 표현',
  말투: '이상한 대답',
  돌발: '돌발 행동',
  침착: '침착',
  보고: '보고 말투',
};
const SEGMENTS = 12;

const half = (v: number) => Math.round(v * 2) / 2;

export function StatusPanel({ roomCode, nickname, count, capacity }: { roomCode: string; nickname: string; count: number; capacity: number }) {
  const susp = useSyncExternalStore(suspicion.subscribe, () => half(suspicion.get().value), () => 0);
  const syncValue = useSyncExternalStore(sync.subscribe, () => half(sync.get().value), () => 98);
  const objective = useSyncExternalStore(chapter1.subscribe, () => chapter1.get().objective, () => null);
  /*
   * 이 몸의 식별번호 — 복도의 정비 단말을 읽기 전에는 나도 모른다 (mp/identity). 화면이 ???-??? 로 그걸 말해 준다.
   * 저장소가 같은 객체를 고쳐 쓰므로 **문자열 하나**로 골라 읽는다 — 객체째 읽으면 Object.is 가 같다고 보고 안 그린다
   */
  const unit = useSyncExternalStore(identity.subscribe, () => (identity.get().known ? identity.get().unit : null), () => null);
  const highlight = useSyncExternalStore(chapter1.subscribe, () => chapter1.get().highlight, () => null);

  // 사유 칩 — 의심도가 움직인 직후에만 잠깐
  const [note, setNote] = useState<{ text: string; up: boolean; id: number } | null>(null);
  useEffect(
    () =>
      suspicion.subscribe(() => {
        const last = suspicion.get().last;
        if (!last || performance.now() - last.at > 50) return;
        setNote({ text: `${last.delta > 0 ? '+' : '−'} ${LABEL[last.reason]}`, up: last.delta > 0, id: last.at });
      }),
    [],
  );
  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 1600);
    return () => window.clearTimeout(id);
  }, [note]);

  const suspColor = susp < 50 ? '#6fd3ff' : susp < 80 ? '#ffb84d' : '#ff5a5a';
  const syncLow = syncValue < SYNC_GLITCH;
  const syncColor = syncValue >= 90 ? '#8ff0c8' : syncLow ? '#ff6a5a' : '#ffd27a';
  const alert = susp >= 80 || syncLow;
  const lit = Math.round((susp / 100) * SEGMENTS);
  const cover = coverStatus(susp, syncLow);

  return (
    <div className="hud-cluster">
      <div className="hud-tag">
        <span className="hud-tag__room">NODE {roomCode}</span>
        <span className="hud-tag__dim">·</span>
        <span>{nickname.toUpperCase()}</span>
        <span className="hud-tag__dim">·</span>
        <span>
          LINK {count}/{capacity}
        </span>
      </div>

      <div className={`hud-panel ${alert ? 'hud-panel--alert' : ''}`}>
        {/* 머리줄 — 지금 내가 어떤 개체로 보이고 있는가 */}
        <div className="hud-panel__head">
          <span>
            UNIT <b className={unit ? '' : 'hud-panel__id--unknown'}>{unit ?? '???-???'}</b>
          </span>
          <em className={cover.tone}>{cover.text}</em>
        </div>

        <div className={`hud-row ${highlight === 'suspicion' ? 'hud-row--hl' : ''}`} aria-label={`AI 의심도 ${Math.round(susp)}%`} style={{ color: suspColor }}>
          <div className="hud-row__head">
            <span className="hud-label">
              {susp >= 80 ? 'DETECTION_INC' : 'AI SUSPICION'}
              <em>의심도</em>
            </span>
            <span className="hud-row__right">
              {highlight === 'suspicion' ? <span className="hud-hint">◀ 그들의 의심도</span> : null}
              {note ? (
                <span key={note.id} className="hud-chip" style={{ color: note.up ? '#ff9a7a' : '#8fe0c8' }}>
                  {note.text}
                </span>
              ) : null}
              <span className="hud-value">{Math.round(susp)}%</span>
            </span>
          </div>
          <div className="hud-seg">
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <i key={i} className={i < lit ? 'on' : ''} />
            ))}
          </div>
        </div>

        <div className={`hud-row ${highlight === 'sync' ? 'hud-row--hl' : ''}`} aria-label={`동기화 ${Math.round(syncValue)}%`} style={{ color: syncColor }}>
          <div className="hud-row__head">
            <span className="hud-label">
              {syncLow ? 'SYNC_LOSS' : 'SYNC'}
              <em>동기화</em>
            </span>
            <span className="hud-row__right">
              {highlight === 'sync' ? <span className="hud-hint">◀ 몸과의 접속률</span> : null}
              <span className="hud-value">{Math.round(syncValue)}%</span>
            </span>
          </div>
          <div className={`hud-bar ${syncLow ? 'hud-bar--pulse' : ''}`}>
            <i style={{ width: `${Math.max(1.5, syncValue)}%` }} />
          </div>
        </div>

        {objective ? (
          <div className="hud-objective">
            <span style={{ fontSize: 11 }}>▸</span>
            <div>
              <div className="hud-objective__k">OBJECTIVE · 지시</div>
              <div className="hud-objective__v">{objective}</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

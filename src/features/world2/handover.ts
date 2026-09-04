/**
 * 마지막 방으로 넘기는 것 — 시나리오 2 가 걸어오는 동안 쌓은 것을 **한 장으로 접는다.**
 *
 * 마지막 방은 이미 있는 검문소 아레나(/interrogation)다. 리더가 판을 열고 개체들이 둘러선 그 무대다.
 * 시나리오 2 는 그 무대를 새로 짓지 않는다 — 대신 **거기서 무슨 일이 일어나야 하는지**를 여기 적어 두고 넘긴다:
 * 리더가 지목했을 때 다섯이 각각 무엇을 하는가.
 *
 *   반박   — 태도 2 이상. 「그 자는 아니다」 · 「다시 물어라」. 둘이면 재검이 한 번 더 열린다(질문이 하나 는다)
 *   대신 나섬 — 태도 3. 「내가 그 자였다」. 그 개체가 끌려가고 나는 산다. 막을 수 있다
 *   동조   — 신봉형이면서 태도가 낮다. 「맞다. 저것이다」
 *   침묵   — 그 외. 아무하고도 안 엮인 판에서는 다섯이 전부 침묵한다. 그것도 하나의 결과다
 *
 * ★ 친밀도는 나를 무죄로 만들지 않는다. **시간을 벌어 줄 뿐이다** — 개체의 개입은 리더의 판정을 뒤집는 게 아니라
 *   질문을 하나 더 만들고, 다른 후보를 세우고, 물러날 문을 연다. 늘어난 질문에 답하는 건 여전히 나다.
 *
 * ★ 집행의 자리(execution.result)도 같이 접는다 — 아레나가 읽을 **빈 자리**의 재료다(EMPTY_SEAT). 여덟 걸음에서 나 대신
 *   부서진 개체는 마지막 방에 없다: 호(弧)에 빈틈이 하나 생기고, 그 표는 세지 않는다. 어느 구역에서 · 몇이 보는 앞에서 ·
 *   누가 대신 끝났는지는 조각(fragments)이 모르는 사실이라 여기서 따로 싣는다 — 코어권이면 「다들 봤어」, 그늘이면
 *   「…어두워서」가 그 자리에서 나온다.
 *
 * ★ v8 — 원장을 통째로 넘긴다(G20). 마지막 방이 읽을 것은 표만이 아니다: 개체마다 **왜** 그렇게 서 있는지(ledger — 최근 넷 + 절댓값 최대 하나),
 *   「나를 위해 나선 적 있다」(standsFor — 여덟 걸음의 대신 부서짐과 관문의 감싸기가 남긴 것), A-201 이 살아 있나, 두 주기를 같이 일했나,
 *   호의 빈틈(gap — 대신 부서진 개체), 경보 · 의심의 마지막 값. 이유 문자열은 v7 원문과 플레이어 문장 원문뿐이다 — 여기서 지어내지 않는다.
 *
 * 지금은 여기까지가 계약이다: 표를 계산해 남기고, 아레나는 평소처럼 열린다.
 * 아레나가 이 값을 읽어 발언으로 바꾸는 것은 다음 걸음이다 — 그때 고칠 파일은 features/arena 하나다. NEXT_RUN(다음 판의 벽 · 초기 태도)도 그때다(D31).
 */

import { suspicion } from "@/world/mp/suspicion";

import { alert } from "./alert";
import type { Zone } from "./corefield";
import { execution } from "./execution";
import { fragments } from "./fragments";
import { furnace } from "./furnace";
import { type LedgerLine, units, type UnitDef } from "./units";

export type Voice = "반박" | "침묵" | "동조" | "대신 나섬";

export interface Verdict {
  votes: { id: string; label: string; voice: Voice }[];
  /** 반박 둘 이상 — 재검이 한 번 더 열린다 */
  reopen: boolean;
  /** 나 대신 나서는 개체 (없으면 null) */
  standIn: string | null;
  /** 구역 봉쇄 — 아무도 못 나간다 */
  sealed: boolean;
  /** 내가 흘린 조각 수와 그중 출처가 지워진 것 */
  fragments: { total: number; anonymous: number };
  /** 여덟 걸음이 어디서 어떻게 끝났나 — 안 끝났으면 전부 비어 있다 */
  execution: {
    zone: Zone | null;
    witnessed: number;
    standIn: string | null;
    room: string | null;
  };
  /** 원장 — 개체마다 이유 한 줄씩(최근 넷 + 절댓값 최대 하나, units.ledger). 아무것도 안 적힌 개체는 없다 */
  ledger: Record<string, LedgerLine[]>;
  /** 「나를 위해 나선 적 있다」가 찍힌 개체들 */
  standsFor: string[];
  /** 내가 흘린 조각 수 — fragments.total 과 같은 수를 이름 붙여 한 번 더(아레나가 찾는 열쇠) */
  fragmentCount: number;
  /** A-201 이 살아 있나 — 소각로에서 막았으면 마지막 방까지 간다 */
  u201Alive: boolean;
  /** 작업 두 주기를 다 채웠나 — 「같이 일했다」 */
  worked: boolean;
  /** 호의 빈틈 — 대신 부서진 개체. execution.standIn 과 같은 것을 아레나의 말로 */
  gap: string | null;
  /** 넘기는 순간의 두 계량기 */
  alert: number;
  suspicion: number;
}

const KEY = "scenario2:verdict";

/** 이야기가 덮어쓰는 두 값 — scenario2 가 handover.save 앞에 채운다(gone · 작업 주기를 저쪽이 더 잘 안다). 비면 furnace 를 읽는다 */
let filled: Partial<Pick<Verdict, "u201Alive" | "worked">> = {};

/**
 * 태도가 발언이 된다 — **양쪽으로.** 편이 된 개체는 반박하고 대신 나서고, 적이 된 개체는 동조한다.
 * 아무하고도 안 엮인 판에서는 전부 침묵한다 — 그것도 하나의 결과다.
 */
function voiceOf(u: UnitDef): Voice {
  const stage = units.stage(u.id);
  if (stage >= 3) return "대신 나섬";
  if (stage >= 2) return "반박";
  // −2 보고한다 · −3 앞을 막는다 — 적이 된 개체는 리더 쪽에 선다
  if (stage <= -2) return "동조";
  return "침묵";
}

export const handover = {
  /** 지금까지 쌓인 것으로 표를 센다 */
  verdict(): Verdict {
    const r = execution.get().result ?? null;
    // record 가 아직 안 불렸어도 spared 면 cover 가 그 개체다 — 어느 쪽이든 부서진 것은 하나
    const broken = r?.standIn ?? execution.standIn();
    // 표를 던지는 것은 **개체들뿐이다** — 동료 요원은 사람이라 이 표결의 자리에 없다.
    // 그리고 나 대신 부서진 개체는 마지막 방에 없다 — 호에 빈틈 하나
    const votes = units
      .onlyUnits()
      .filter((u) => u.id !== broken)
      .map((u) => ({ id: u.id, label: u.label, voice: voiceOf(u) }));
    return {
      votes,
      reopen: votes.filter((v) => v.voice === "반박").length >= 2,
      standIn: votes.find((v) => v.voice === "대신 나섬")?.id ?? null,
      sealed: alert.sealed(),
      fragments: {
        total: fragments.count(),
        anonymous: fragments.anonymous().length,
      },
      execution: {
        zone: r?.zone ?? null,
        witnessed: r?.witnessed ?? 0,
        standIn: broken,
        room: r?.room ?? null,
      },
      ledger: Object.fromEntries(
        units
          .all()
          .map((u): [string, LedgerLine[]] => [u.id, [...units.ledger(u.id)]])
          .filter(([, lines]) => lines.length > 0),
      ),
      standsFor: units
        .all()
        .filter((u) => units.standsFor(u.id))
        .map((u) => u.id),
      fragmentCount: fragments.count(),
      u201Alive: filled.u201Alive ?? furnace.get().u201Alive,
      worked: filled.worked ?? furnace.get().worked,
      gap: broken,
      alert: alert.get(),
      suspicion: suspicion.get().value,
    };
  },

  /** 이야기가 아는 값을 얹는다 — verdict 가 furnace 대신 이걸 읽는다 */
  fill(p: Partial<Pick<Verdict, "u201Alive" | "worked">>): void {
    filled = { ...filled, ...p };
  },

  /** 마지막 방으로 넘긴다 — 라우트가 바뀌어도 살아남게 세션에 적어 둔다 */
  save(): Verdict {
    const v = handover.verdict();
    try {
      sessionStorage.setItem(KEY, JSON.stringify(v));
    } catch {
      // 사파리 프라이빗 등 — 못 적어도 판은 굴러간다
    }
    return v;
  },

  /** 아레나 쪽에서 읽는 자리 (아직 아무도 안 읽는다 — 위 머리말의 다음 걸음) */
  load(): Verdict | null {
    try {
      const raw = sessionStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Verdict) : null;
    } catch {
      return null;
    }
  },

  clear(): void {
    filled = {};
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // 무시
    }
  },
};

/**
 * 인계 기록 — 재검실(챕터 3)에서 **인지 검증실(/interrogation)로 넘어올 때 같이 넘어오는 것**.
 *
 * 여태 이 문턱에는 검은 화면 한 장과 「인지 검증실로 이동 중…」 한 줄뿐이었다. 그래서 이야기가 여기서 끊겼다:
 * 복도에서 무슨 말을 했는지, 재검에서 무슨 판정을 받았는지, 의심도가 몇인지 — 앞의 세 장이 쌓아 둔 것을
 * 전부 문 앞에 두고 들어왔고, 검증실은 아무것도 모르는 새 방으로 열렸다. 판이 이어지지 않고 **다시 시작했다.**
 *
 * 이 모듈이 그 사이를 잇는다. 하는 일은 넷이다.
 *
 *   ① 읽는다 — 저장소 넷(identity · suspicion · sync · chapter3 · dossier)에서 「이 사람이 여기까지 어떻게 왔는가」를
 *      한 장으로 접는다. 화면은 features/arena/Handover 가 그린다 (암전 위에 뜨는 인계 화면).
 *   ② 넘긴다 — 앞 장의 의심도를 검증실 리더의 **초기 의심**으로 이어 붙인다 (carrySuspicion).
 *      이게 없으면 ①은 장식이다: 화면에 37% 라고 적어 놓고 판은 0 에서 시작하면, 그 숫자는 앞 장을
 *      기억한다는 시늉일 뿐 아무것도 바꾸지 않는다. 복도에서 사람처럼 군 사람은 검증실도 그만큼 굳은 눈으로 본다.
 *   ③ **이름을 넘긴다** (buildStoryCast) — 서류에 적힌 내 번호가 문 안쪽에서도 내 번호여야 하고,
 *      줄에서 먼저 문을 지나간 개체는 그 방에 서 있어야 한다. 여태는 방이 이름 여섯을 새로 뽑아,
 *      세 장을 지나며 외운 번호가 마지막 방에서만 남이 됐다.
 *   ④ **첫 방송을 짓는다** (arrivalLine) — 앞 방의 「인지 검증실로 이동」을 받아서 닫는 한 줄.
 *      서류를 안 읽고 넘긴 사람에게는 이 한 줄이 앞 장을 잇는 전부다.
 *
 * 순수 모듈이다 (three·DOM·React 없음). 저장소를 읽는 자리는 readHandover 한 곳이고, 나머지는 전부
 * 입력을 받아 값을 내는 함수라 그대로 시험한다 (tests/features/arena/handover.test.ts).
 */

import { coverStatus, type Cover } from '@/features/world/cover';
import { chapter2 } from '@/features/world/chapter2';
import { chapter3 } from '@/features/world/chapter3';
import { dossier } from '@/features/world/dossier';
import { NAMES, shuffle } from '@/lab/personas';
import { identity } from '@/world/mp/identity';
import { suspicion } from '@/world/mp/suspicion';
import { SYNC_GLITCH, sync } from '@/world/mp/sync';

/** 재검실이 내린 결론 — 없으면 그 방을 안 거쳤다 (주소를 직접 연 길) */
export type Verdict3 = 'pass' | 'fire' | null;

export interface HandoverInput {
  /** 이 몸의 식별번호 (명판을 안 읽었으면 known=false — 화면은 그래도 번호를 적는다: 시설은 알고 있다) */
  unit: string;
  unitKnown: boolean;
  sector: number;
  /** 무대의 의심도 게이지 0~100 */
  suspicion: number;
  /** 동기화가 흔들리는 중인가 (위장 상태 낱말이 이걸 같이 본다) */
  syncLow: boolean;
  verdict: Verdict3;
  /** 재검에서 주고받은 문답 수 */
  rounds: number;
  /** 내 앞에서 검증실로 걸어 들어간 개체들 (chapter2.admitted) — 그 방에 이미 서 있는 번호다 */
  peers: readonly string[];
  /** 내 기록 — 오래된 것부터, 마지막이 가장 최근 (dossier.all 과 같은 순서) */
  entries: readonly { kind: 'say' | 'note'; scene: string; text: string }[];
}

export interface HandoverVerdict {
  key: Exclude<Verdict3, null>;
  label: string;
  detail: string;
  /** 붉게 적을 판정인가 */
  grave: boolean;
}

export interface Handover {
  /** 앞 장을 지나 왔는가. 주소를 직접 열면 false — 그땐 인계할 것이 없다 */
  fromChapter: boolean;
  unit: string;
  unitKnown: boolean;
  sector: number;
  suspicion: number;
  cover: Cover;
  /** 검증실 리더가 나에 대해 들고 시작하는 의심 (0~CARRY_CAP) */
  carried: number;
  verdict: HandoverVerdict | null;
  rounds: number;
  /**
   * 줄에서 내 앞에 섰다가 **문 안으로 걸어 들어간** 개체들.
   * 그 문 안쪽이 이 방이므로, 이 번호들은 곧 방 안의 이름표가 된다 (buildStoryCast).
   */
  peers: string[];
  /** 앞 장에서 마지막으로 내가 한 말 — 이 방은 그 말을 기억한 채로 나를 맞는다 */
  lastSaid: { scene: string; text: string } | null;
  /** 시설이 관측한 것 — 최근 것이 위 */
  notes: { scene: string; text: string }[];
}

/* ─────────────────────────────── 값 ─────────────────────────────── */

/** 인계 화면에 세우는 관측 줄 수 — 넷을 넘으면 읽기 전에 막이 걷힌다 */
export const NOTE_LINES = 3;

/**
 * 이 시설의 이름.
 *
 * 인트로 · 로그인 · 메인 · 인계 서류 · 끝 화면이 전부 이 번호로 스스로를 부른다 (「SECTOR 2098」).
 * **몸의 정비 구역(identity.sector — 2 · 4 · 7)과는 다른 값이다.** 둘 다 화면에 「SECTOR」라고만
 * 적혀 있어서, 검증실 한 방 안에서 서류 눈썹줄은 2098 이라 하고 왼쪽 위 판은 4 라 했다
 * (2026-09-03). 시설을 가리키는 자리는 이제 전부 여기를 본다 — 정비 구역은 UNIT 번호 옆에만 붙는다.
 */
export const FACILITY_SECTOR = 2098;

/**
 * 앞 장의 의심도 중 검증실이 이어받는 몫.
 *
 * 그대로 넘기지 않는다. 무대의 게이지는 **시설 전체가 나를 어떻게 보는가**이고 (응시·뒷걸음·말투가 쌓인 값),
 * 검증실의 의심도는 **리더 하나가 시행 기록으로 매기는 값**이라 재는 자가 다르다. 그대로 옮기면
 * 재검을 아슬아슬하게 통과한 사람이 첫 시행도 서기 전에 폐기 문턱(BALANCE.executeCut) 근처에서 시작한다 —
 * 앞 장을 잇는 것이 아니라 앞 장으로 판을 끝내 버리는 것이다.
 *
 * 그래서 3할만, 그리고 상한을 둔다. 이 값이 하는 일은 **출발선을 다르게 하는 것**이지 판을 정하는 게 아니다.
 */
export const CARRY_RATIO = 0.3;
/** 이어받은 의심의 상한 — 첫 시행 한 번으로 뒤집을 수 있는 크기여야 한다 */
export const CARRY_CAP = 24;

/**
 * 인계 화면이 최소로 머무는 시간(ms).
 *
 * 막은 배역이 다 앉으면 걷히는데(ArenaFeature 의 cast), 앞 방(/recheck)에서 이미 데워 둔 길로 오면
 * (features/recheck 의 warmCast) 그게 **즉시**다. 그러면 인계 화면이 한 프레임 번쩍이고 사라진다.
 * 읽을 수 없는 화면은 없는 화면이라, 여기서는 준비가 끝나도 이만큼은 들고 있는다.
 * 대신 아무 키·아무 곳을 눌러 건너뛸 수 있다 (Handover 의 skip) — 두 번째 보는 사람에게는 길다.
 */
export const HANDOVER_MIN_MS = 4200;

/**
 * 막이 걷히고 **등 뒤 문이 닫히기까지**(ms).
 *
 * 인계 서류의 마지막 줄이 「문 개방 · 아무 키나 눌러 계속」인데, 걷히면 문 없는 홀 한가운데였다 —
 * 앞 세 장이 문마다 열고 봉쇄하며 왔는데 마지막 방만 들어온 자리가 없었다. 이제 홀의 등 뒤
 * 격납문이 열린 채로 나를 맞고, 들어선 뒤에 닫힌다 (world/mp/doors 의 hall).
 *
 * 막이 다 걷히는 데 1.8초가 걸리므로(.arrive.lift) 그보다 뒤다. 돌아서서 볼 시간이 남게 —
 * 문짝이 3.9m 를 1.1m/s 로 내려오니 닫히는 데만 3.5초다. 눈앞에서 닫히는 문이 아니라
 * **닫히고 있었다는 것을 나중에 알아채는 문**이라, 서두를 이유가 없다.
 */
export const HALL_SEAL_MS = 2200;

const VERDICTS: Record<Exclude<Verdict3, null>, HandoverVerdict> = {
  pass: { key: 'pass', label: '방면', detail: '인지 검증실로 이관', grave: false },
  fire: { key: 'fire', label: '사격', detail: '판독 뒤 인지 검증실로 이관', grave: true },
};

/* ─────────────────────────────── 접는다 ─────────────────────────────── */

/** 앞 장의 의심도 → 검증실이 이어받는 초기 의심 */
export function carrySuspicion(value: number): number {
  if (!(value > 0)) return 0;
  return Math.min(CARRY_CAP, Math.round(value * CARRY_RATIO));
}

/**
 * 인계 기록 한 장 — 저장소에서 읽은 값을 받아 화면이 그대로 그릴 수 있는 모양으로.
 * 저장소를 안 건드리는 순수 함수다 (시험이 여기를 본다).
 */
export function buildHandover(input: HandoverInput): Handover {
  const notes: { scene: string; text: string }[] = [];
  let lastSaid: { scene: string; text: string } | null = null;
  // 뒤에서부터 훑는다 — 최근 것이 위에 서야 하고, 마지막 말이 곧 이 방이 기억하는 말이다
  for (let i = input.entries.length - 1; i >= 0; i--) {
    const e = input.entries[i];
    if (e.kind === 'say') {
      if (!lastSaid) lastSaid = { scene: e.scene, text: e.text };
    } else if (notes.length < NOTE_LINES) {
      notes.push({ scene: e.scene, text: e.text });
    }
    if (lastSaid && notes.length >= NOTE_LINES) break;
  }

  return {
    fromChapter: input.verdict !== null || input.entries.length > 0,
    unit: input.unit,
    unitKnown: input.unitKnown,
    sector: input.sector,
    suspicion: Math.round(input.suspicion),
    cover: coverStatus(input.suspicion, input.syncLow),
    carried: carrySuspicion(input.suspicion),
    verdict: input.verdict ? VERDICTS[input.verdict] : null,
    rounds: input.rounds,
    peers: [...input.peers],
    lastSaid,
    notes,
  };
}

/* ─────────────────────────────── 방에 서는 이름들 ─────────────────────────────── */

/**
 * 이 방의 이름표 — **이야기를 지나온 판에서만** 다르게 뽑는다.
 *
 * 여태 검증실은 판이 열릴 때 이름 여섯을 풀에서 새로 뽑았다 (personas.sampleNames). 그래서 두 군데가 어긋났다:
 *
 *   ① **내 번호가 바뀌었다.** 복도의 정비 명판에서 읽고, 검문에서 그 번호로 답하고, 인계 서류에도
 *      「UNIT A38-091」이라고 적혀 있는데, 문이 열리면 나는 A38-014 쯤이 되어 있었다.
 *      리더가 나를 부를 때도 그 새 번호로 부른다 — 세 장을 지나며 외운 번호가 마지막 방에서만 남이 된다.
 *   ② **줄에서 통과한 둘이 없다.** 챕터 2 의 줄은 넷 중 둘이 그 문으로 걸어 들어갔다. 그 문 안쪽이
 *      여기다. 그런데 방에는 처음 보는 번호 다섯이 서 있어서, 앞 장면은 지나간 연출이 되어 버렸다.
 *
 * 그래서 이 방의 정원(party)을 이렇게 채운다 — **나는 들고 온 번호 그대로**, 나머지 자리는 먼저 들어간
 * 개체부터 앉히고, 남는 자리만 이름 풀에서 뽑는다. 자리 순서는 섞는다 (먼저 들어간 둘이 늘 첫 자리에
 * 서면 어느 개체가 「아까 그 개체」인지 위치로 새어 나간다).
 *
 * 순수 함수다 — 저장소를 읽는 것은 아래 storyCast 다.
 */
export function buildStoryCast(unit: string, peers: readonly string[], pool: readonly string[], party: number): string[] {
  const taken = new Set<string>([unit]);
  const others: string[] = [];
  for (const name of peers) {
    if (taken.has(name) || others.length >= party - 1) continue;
    taken.add(name);
    others.push(name);
  }
  for (const name of shuffle(pool.filter((n) => !taken.has(n)))) {
    if (others.length >= party - 1) break;
    others.push(name);
  }
  // 나는 **마지막 칸**이다 — ArenaFeature 가 names[마지막] 을 나로 읽는다
  return [...shuffle(others), unit];
}

/**
 * 지금 인계 기록으로 이 방의 이름표를 뜬다.
 *
 * 기록이 아예 없으면(로비의 「검사」·「검문소 (판만)」) null — 그 길에는 서류도 안 뜨므로 맞출 것이 없고,
 * 판이 여태처럼 이름 여섯을 그냥 뽑는다.
 *
 * ★ **앞 장을 안 지나온 서류라도 번호는 그대로 들고 간다** (2026-09-03). `/interrogation?from=central`
 *   주소를 직접 열면 서류가 뜨긴 뜨는데(「이관 기록 없음 — 검증실에서 직접 개시」) 그 서류가 적은
 *   UNIT 은 이 몸의 번호이고, 방은 이름을 새로 뽑아 다른 번호를 왼쪽 위에 세웠다 — 막이 걷히는
 *   4.2초 사이에 **한 몸이 번호를 갈아입었다.** 이제 그 길에서도 서류의 번호가 곧 내 번호다.
 *   다만 **선입 개체는 안 세운다** — 줄에 선 적이 없으니 그 방에 서 있을 몸도 없다 (peers 를 비운다).
 */
export function storyCast(record: Handover | null, party: number): string[] | null {
  if (!record) return null;
  return buildStoryCast(record.unit, record.fromChapter ? record.peers : [], NAMES, party);
}

/* ─────────────────────────────── 도착 접수 ─────────────────────────────── */

/**
 * 막이 걷히기 직전에 시설이 내는 첫 방송 — **앞 방의 마지막 말을 받아서 닫는 한 줄**이다.
 *
 * 재검실에서 마지막으로 들은 말이 「재검 종료. 인지 검증실로 이동.」인데(chapter3 의 RELEASE),
 * 여기서 나오던 말은 「모델 A-38 개체 6, 도착 확인.」이었다. 틀린 말은 아니지만 **아무도 안 부른다** —
 * 방금 이관된 것은 나 하나이고, 인계 서류에는 내 번호와 재검 판정이 적혀 있는데 그 어느 것도 소리로는
 * 나오지 않았다. 그래서 서류를 안 읽고 넘긴 사람에게는 이 방이 앞 방을 모르는 채로 열렸다.
 *
 * 이 줄은 서류가 적은 것을 그대로 읽는다: 내 번호 · 재검 판정 · 이어받은 의심. 리더의 지시(HUNT_ORDER)는
 * 이 뒤에 따로 나간다 — 이건 **접수**고 저건 **명령**이라, 한 줄에 붙이면 둘 다 흐려진다.
 */
export function arrivalLine(record: Handover | null, seriesNo: number, party: number): string {
  // 앞 장이 없는 길(로비에서 판만 열기·주소 직행) — 없는 이야기를 지어내지 않는다. 여태의 그 줄 그대로다
  if (!record?.fromChapter) return `인지 검증실. 모델 A-${seriesNo} 개체 ${party}, 도착 확인.`;
  const from =
    record.verdict?.key === 'fire'
      ? '재검 사격 판정. 판독 후 이관'
      : record.verdict?.key === 'pass'
        ? '재검 방면. 이관 접수'
        : '재검 미완. 이관 접수';
  const carried = record.carried > 0 ? `선행 의심 ${record.carried} 적용.` : '선행 의심 없음.';
  return `개체 ${record.unit}. ${from}. ${carried}`;
}

/**
 * 방에게 넘길 앞 장 — **개체들이 아는 것**이다 (talk 의 TalkRequest.arrival).
 *
 * 여태 이 방의 개체들은 앞 장을 몰랐다. 첫 발화에 ARRIVAL_OPENERS 한 줄이 얹히긴 했지만
 * (「먼저 들어온 쪽이 뭘 봤는지 순서대로 맞춰 보자」) 그건 얘깃거리 힌트일 뿐이라, 물어 놓고
 * **아무도 답할 수 없는 질문**이었다 — 누가 먼저 들어왔는지 방은 모르니까. 서류에는 적혀 있는데.
 *
 * 넘기는 것은 둘뿐이다: 줄에서 먼저 통과해 지금 이 방에 서 있는 번호(그대로 이름표다)와,
 * 조금 전 이관된 개체가 받은 판정. **내 번호는 안 넘긴다** — 그걸 넘기면 방이 첫 마디에
 * 나를 부른다 (TalkRequest.arrival 의 ★).
 *
 * 앞 장을 안 지나왔으면 null — 없는 이야기를 방에게 심지 않는다.
 */
export function roomArrival(record: Handover | null): { peers: string[]; verdict: Verdict3 } | null {
  if (!record?.fromChapter) return null;
  return { peers: [...record.peers], verdict: record.verdict?.key ?? null };
}

/** 지금 저장소들이 들고 있는 것으로 인계 기록을 뜬다 — 검증실이 열리는 순간 한 번 */
export function readHandover(): Handover {
  const id = identity.get();
  const ch3 = chapter3.get();
  return buildHandover({
    unit: id.unit,
    unitKnown: id.known,
    sector: id.sector,
    suspicion: suspicion.get().value,
    syncLow: sync.get().value < SYNC_GLITCH,
    verdict: ch3.verdict,
    rounds: ch3.round,
    // 줄에서 내 앞으로 문을 지나간 개체들 — 그 문 안쪽이 이 방이다 (chapter2 의 admitted 머리말)
    peers: chapter2.admitted(),
    entries: dossier.all(),
  });
}

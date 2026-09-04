// @vitest-environment jsdom
/**
 * 인계 화면 — 암전 위에 뜨는 서류 한 장이 **앞 장을 실제로 적고 있는가**.
 *
 * handover.test.ts 가 「무엇이 넘어오는가」를 잠근다면 여기는 「그게 화면에 나오는가」다.
 * 둘을 가르는 이유: 기록은 맞는데 화면이 그중 절반을 안 그리면, 이야기는 여전히 문턱에서 끊긴다.
 *
 * 저장소를 실제로 밀어 넣고 readHandover 로 뜬다 — 챕터 3 과 이 화면 사이의 배선(verdict·dossier·
 * suspicion·identity)이 끊기면 여기서 걸린다. 색·모따기·애니메이션은 안 본다 (CSS 다).
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { HandoverCard } from '@/features/arena/HandoverCard';
import { buildHandover, readHandover, type HandoverInput } from '@/features/arena/handover';
import { dossier } from '@/features/world/dossier';
import { identity } from '@/world/mp/identity';
import { suspicion } from '@/world/mp/suspicion';

const base: HandoverInput = {
  unit: 'A38-091',
  unitKnown: true,
  sector: 4,
  suspicion: 0,
  syncLow: false,
  verdict: null,
  rounds: 0,
  peers: [],
  entries: [],
};

/** 리더가 막이 걷히자마자 내는 그 지시 — 화면은 이 문장을 받아서 적는다 (ArenaFeature 의 HUNT_ORDER) */
const ORDER = '이 방에 인간이 하나 있다. 전 개체에 지시한다. 인간을 찾아내라.';

const show = (input: Partial<HandoverInput>, ready = false) =>
  render(<HandoverCard record={buildHandover({ ...base, ...input })} ready={ready} order={ORDER} />);

describe('인계 화면', () => {
  it('앞 장을 지나왔으면 그 장의 판정과 문답 수를 적는다', () => {
    show({ verdict: 'pass', rounds: 3 });
    expect(screen.getByText(/CHAPTER 3/)).toBeInTheDocument();
    expect(screen.getByText('방면')).toBeInTheDocument();
    expect(screen.getByText('3회')).toBeInTheDocument();
  });

  it('내가 마지막으로 한 말이 그대로 서류에 실린다', () => {
    show({ verdict: 'pass', entries: [{ kind: 'say', scene: '재검실', text: '기억나지 않는다' }] });
    expect(screen.getByText(/기억나지 않는다/)).toBeInTheDocument();
    expect(screen.getByText('[재검실]')).toBeInTheDocument();
  });

  it('이 몸의 번호와 의심도가 다음 장으로 넘어가는 것이 보인다', () => {
    show({ unit: 'A38-137', sector: 2, suspicion: 62 });
    expect(screen.getByText(/A38-137/)).toBeInTheDocument();
    expect(screen.getByText(/· SECTOR 2/)).toBeInTheDocument();
    // 연식도 같이 간다 — 복도의 명판이 「BUILD 2026」이라 적은 그 해다 (shared/era)
    expect(screen.getByText(/· BUILD 2026/)).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
    // 그 숫자가 판을 바꾼다고 화면이 말한다 (handover.carrySuspicion — 62 의 3할)
    expect(screen.getByText('+19')).toBeInTheDocument();
  });

  it('의심도가 0 이면 이어받을 것이 없다고 적는다 — 안 적으면 빈칸이 고장으로 읽힌다', () => {
    show({ suspicion: 0 });
    expect(screen.getByText(/선행 의심 없음/)).toBeInTheDocument();
  });

  it('주소를 직접 열면 없는 이야기를 지어내지 않는다', () => {
    show({});
    expect(screen.getByText(/이관 기록 없음/)).toBeInTheDocument();
    expect(screen.queryByText(/CHAPTER 3/)).not.toBeInTheDocument();
  });

  it('다음 장이 무엇인지, 무슨 지시를 받는지 미리 보여 준다 — 막이 걷히면 그 방이다', () => {
    show({ verdict: 'pass' });
    expect(screen.getByText('CHAPTER 4')).toBeInTheDocument();
    // 리더가 실제로 내는 문장 **그대로** — 베껴 두면 한쪽만 고쳐져 서류와 방송이 갈라진다
    expect(screen.getByText(`“${ORDER}”`)).toBeInTheDocument();
  });

  it('문 안쪽에 이미 서 있는 번호를 적는다 — 막이 걷히면 그 이름표가 실제로 붙어 있다', () => {
    show({ verdict: 'pass', peers: ['A38-206', 'A38-072'] });
    expect(screen.getByText('A38-206')).toBeInTheDocument();
    expect(screen.getByText('A38-072')).toBeInTheDocument();
    expect(screen.getByText(/검증실 내 대기/)).toBeInTheDocument();
  });

  it('줄까지 못 가고 끌려간 판은 그 칸을 아예 안 그린다 — 못 본 개체를 적지 않는다', () => {
    show({ verdict: 'pass' });
    expect(screen.queryByText(/검증실 내 대기/)).not.toBeInTheDocument();
  });

  it('준비가 끝나면 건너뛸 수 있다고 알린다 — 그 전에는 기다리라고 한다', () => {
    const { unmount } = show({ verdict: 'pass' }, false);
    expect(screen.getByText(/문 개방 대기/)).toBeInTheDocument();
    unmount();
    show({ verdict: 'pass' }, true);
    expect(screen.getByText(/아무 키나 눌러 계속/)).toBeInTheDocument();
  });
});

describe('저장소에서 뜬 기록', () => {
  beforeEach(() => {
    dossier.reset();
    suspicion.reset();
    identity.assign();
  });

  it('챕터가 쌓아 둔 것을 그대로 들고 온다 — 배선이 끊기면 여기서 걸린다', () => {
    dossier.at('복도');
    dossier.say('이상 없음. 4 구역으로 복귀한다.');
    dossier.at('재검실');
    dossier.note('재검을 통과함');
    suspicion.bump(48, '응시');

    render(<HandoverCard record={readHandover()} ready order={ORDER} />);
    expect(screen.getByText(/재검을 통과함/)).toBeInTheDocument();
    expect(screen.getByText(/4 구역으로 복귀한다/)).toBeInTheDocument();
    expect(screen.getByText('48%')).toBeInTheDocument();
    expect(screen.getByText(/A\d+-\d+/)).toBeInTheDocument();
  });

  it('아무것도 없는 판에서는 선행 기록 없음이다', () => {
    render(<HandoverCard record={readHandover()} ready order={ORDER} />);
    expect(screen.getByText(/이관 기록 없음/)).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
/**
 * 화면의 **[E] 한 줄** — 겨눈 몸 위에 뜨는 동사 (Hud2 의 Objective2 · scenario2.css 의 .s2-idle).
 *
 * 이 판의 원칙은 「곁에 누가 있는지 화면이 대신 짚어 주지 않는다」다 (Hud2 의 말 걸기 묶음). 그 원칙과
 * 타협한 자리라 **선이 좁고, 그 선을 이 시험이 쥔다**:
 *   ⓐ 겨눔(aim)에만 붙는다 — 곁(near)만 있을 때는 안 뜬다. 근처 목록도 거리 눈금도 없다.
 *   ⓑ **이름을 안 쓴다** — 누구인지는 입력줄을 연 뒤에야 안내문이 말한다 (「보는 것이 먼저」의 순서).
 *   ⓒ 콘솔 · 입력줄 · 물음 판이 열려 있으면 안 뜬다 — pressE 의 사다리에서 그것들이 이기므로
 *     화면이 「[E] 말을 건다」라고 적어 두면 거짓말이 된다.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Objective2 } from '../../../src/features/world2/Hud2';
import { scenario2, type Scene2State } from '../../../src/features/world2/scenario2';

/** 저장소를 이 판의 모양으로 놓고 그린다 — get() 이 돌려주는 것은 고쳐 쓰는 그 객체다 */
function show(patch: Partial<Scene2State>) {
  Object.assign(scenario2.get(), patch);
  return render(<Objective2 />);
}

const AIM = { id: 'bg-rest-5', dist: 2.1 };

beforeEach(() => {
  Object.assign(scenario2.get(), {
    room: 'rest',
    objective: null,
    aim: null,
    near: null,
    talking: false,
    choice: null,
    urgent: null,
    answer: null,
    consoleNear: false,
    banner: null,
    notice: null,
  });
});
afterEach(cleanup);

describe('[E] 한 줄', () => {
  it('★ 겨누면 뜬다 — 그리고 **이름을 안 쓴다**', () => {
    show({ aim: AIM });
    const hint = document.querySelector('.s2-idle');
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toBe('[E] 말을 건다');
    // 겨눈 것이 누구인지는 화면에 안 나온다 — 그게 이 판의 원칙과 타협한 선이다
    expect(hint!.textContent).not.toContain('bg-rest-5');
    expect(hint!.textContent).not.toContain('개체');
  });

  it('곁에 있기만 하면 안 뜬다 — 겨눠야 뜬다', () => {
    show({ near: AIM });
    expect(document.querySelector('.s2-idle')).toBeNull();
  });

  it('입력줄이 열려 있으면 안 뜬다 — 그때는 그 줄이 누가 듣는지 말한다', () => {
    show({ aim: AIM, talking: true });
    expect(document.querySelector('.s2-idle')).toBeNull();
  });

  it('★ 콘솔 곁에서는 안 뜬다 — [E] 사다리에서 콘솔이 이기므로 화면이 거짓말을 하면 안 된다', () => {
    show({ aim: AIM, room: 'central2', consoleNear: true });
    expect(document.querySelector('.s2-idle')).toBeNull();
    // 대신 콘솔의 줄이 뜬다 (같은 동사, 같은 모양)
    expect(screen.getByText(/코어 출력을 내린다/)).toBeTruthy();
  });

  it('물음 판이 열려 있으면 안 뜬다 — 그 [E] 는 「예」다', () => {
    show({ aim: AIM, choice: { title: 't', yes: 'y', no: 'n', onYes() {}, onNo() {} } as Scene2State['choice'] });
    expect(document.querySelector('.s2-idle')).toBeNull();
    cleanup();
    show({ aim: AIM, choice: null, urgent: { title: 't', hint: 'h', yes: 'y', no: 'n', endsAt: 0 } });
    expect(document.querySelector('.s2-idle')).toBeNull();
  });

  it('개체가 답을 기다리는 창이 열려 있으면 안 뜬다 — 그 한 마디는 그 개체의 것이다', () => {
    show({ aim: AIM, answer: { who: 'u104', until: Date.now() + 5000 } as Scene2State['answer'] });
    expect(document.querySelector('.s2-idle')).toBeNull();
  });

  it('목표 줄과 같이 떠도 서로 안 가린다 — 둘은 다른 자리다', () => {
    show({ aim: AIM, objective: '개체를 살펴본다' });
    expect(document.querySelector('.s2-idle')).not.toBeNull();
    expect(document.querySelector('.s2-objective')).not.toBeNull();
  });
});

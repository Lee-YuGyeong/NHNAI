/**
 * 대화창이 새 말을 따라갈지.
 *
 * 두 방향으로 깨진다. 너무 엄하면 바닥에 닿아도 안 따라가 **대화가 멎은 것처럼 보이고**,
 * 너무 헐거우면 지난 말을 읽는 중에 끌어내려 **읽던 자리를 잃는다.**
 * 창을 굴러가게 만들면서 이 언저리에서 이미 한 번 어긋났던 자리라 양쪽을 다 세워 둔다.
 */
import { describe, expect, it } from 'vitest';
import { STICK_EDGE, followsBottom } from '@/features/arena/feedscroll';

/** 보이는 높이 200px 짜리 창에 1000px 이 쌓여 있다 — 바닥은 scrollTop 800 */
const H = 1000;
const VIEW = 200;
const BOTTOM = H - VIEW;

describe('대화창이 새 말을 따라가나', () => {
  it('바닥이면 따라간다', () => {
    expect(followsBottom(H, BOTTOM, VIEW)).toBe(true);
  });

  it('바닥에 거의 닿았으면 따라간다 — 딱 맞을 때만 보면 영영 안 따라간다', () => {
    // 줄 높이가 소수라 바닥에 붙여도 1~2px 이 남는다. 그걸 "안 붙었다"로 보면 창이 굳는다
    expect(followsBottom(H, BOTTOM - 2, VIEW)).toBe(true);
  });

  it('올려서 읽는 중이면 안 따라간다 — 여기가 끌어내리면 안 되는 자리다', () => {
    expect(followsBottom(H, BOTTOM - 300, VIEW)).toBe(false);
  });

  it('맨 위면 당연히 안 따라간다', () => {
    expect(followsBottom(H, 0, VIEW)).toBe(false);
  });

  it('경계는 한 줄보다 넓고 한 화면보다 좁다 — 손가락 하나 폭이다', () => {
    // 너무 좁으면 소수점 때문에 안 붙고, 너무 넓으면 읽는 중에 끌려간다
    expect(STICK_EDGE).toBeGreaterThan(4);
    expect(STICK_EDGE).toBeLessThan(VIEW / 2);
  });

  it('내용이 창보다 짧으면 늘 따라간다 — 굴릴 것이 없다', () => {
    expect(followsBottom(80, 0, VIEW)).toBe(true);
  });
});

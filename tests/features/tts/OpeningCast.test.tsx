// @vitest-environment jsdom
/**
 * 오프닝 자막 화자 셋 (src/features/tts/OpeningCast.tsx · openingSpeakers.ts).
 *
 * 여기서 재는 것 둘:
 *  ① 셋이 **서로 다른 목소리**로 배정돼 있나 — 좌석 아홉과 달리 이건 겹치면 안 되는 게
 *    아니라 **겹치면 장면이 안 서는** 문제다. 자막이 넘어가는데 같은 소리면 누가 말하는지
 *    귀로 못 따라간다.
 *  ② 대본이 오기 전까지 **대사를 그 자리에서 쳐 볼 수 있나** — start_speak.txt 가 아직 없다.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OpeningCast, type AccountVoice } from '@/features/tts/OpeningCast';
import { OPENING_CAST, speakerOf } from '@/features/tts/openingSpeakers';

/** 2026-09-05 사용자가 지정한 셋 */
const ASSIGNED = ['4JJwo477JUAx3HV0T7n7', 'hfY9LTyBpmCf5bUstZlU', 'airYK6ydeWdrJg6gyZA3'];

const VOICES: AccountVoice[] = ASSIGNED.map((id, i) => ({
  id,
  name: `목소리 ${i}`,
  category: 'professional',
}));

describe('openingSpeakers — 배역표', () => {
  it('피실험자가 셋이다', () => {
    expect(OPENING_CAST).toHaveLength(3);
  });

  it('사용자가 지정한 목소리 셋이 그대로 붙어 있다', () => {
    expect(OPENING_CAST.map((s) => s.voiceId)).toEqual(ASSIGNED);
  });

  /** ★ 좌석 아홉과 반대 이유로 겹치면 안 된다 — 겹치면 자막에서 누가 말하는지 귀로 못 따라간다 */
  it('셋이 서로 다른 목소리다', () => {
    expect(new Set(OPENING_CAST.map((s) => s.voiceId)).size).toBe(3);
  });

  it('셋 다 임시 대사를 갖고 있다 — 대본이 오기 전에도 목소리를 고를 수 있어야 한다', () => {
    for (const s of OPENING_CAST) expect(s.sample.trim().length).toBeGreaterThan(0);
  });

  it('id 로 찾을 수 있다', () => {
    expect(speakerOf('subject-2')?.voiceId).toBe('hfY9LTyBpmCf5bUstZlU');
    expect(speakerOf('없는-사람')).toBeUndefined();
  });
});

describe('오프닝 화자 칸', () => {
  it('셋이 저마다 선다', () => {
    render(<OpeningCast voices={VOICES} />);
    expect(screen.getByText('피실험자 01')).toBeInTheDocument();
    expect(screen.getByText('피실험자 02')).toBeInTheDocument();
    expect(screen.getByText('피실험자 03')).toBeInTheDocument();
  });

  it('화자마다 듣기가 있고, 장면 전체를 잇는 단추도 있다', () => {
    render(<OpeningCast voices={VOICES} />);
    expect(screen.getAllByRole('button', { name: /듣기/ })).toHaveLength(3);
    expect(screen.getByRole('button', { name: /장면 전체/ })).toBeInTheDocument();
  });

  it('대사를 그 자리에서 고쳐 쓸 수 있다 — start_speak.txt 가 오면 붙여 넣는 자리다', () => {
    render(<OpeningCast voices={VOICES} />);
    const boxes = screen.getAllByRole('textbox');
    expect(boxes).toHaveLength(3);
    fireEvent.change(boxes[0], { target: { value: '대본에서 가져온 줄' } });
    expect(boxes[0]).toHaveValue('대본에서 가져온 줄');
  });

  it('기본과 다르게 고르면 어디에 적을지 알려준다 — 환경 변수가 아니라 소스다', () => {
    render(<OpeningCast voices={VOICES} />);
    expect(screen.queryByText(/기본과 다르게 골랐다/)).not.toBeInTheDocument();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: ASSIGNED[2] } });
    expect(screen.getByText(/기본과 다르게 골랐다/)).toBeInTheDocument();
    // 바뀐 화자와 그 목소리 id 를 그대로 적어 준다 — 파일에 옮겨 적을 수 있어야 한다
    expect(screen.getByText(`피실험자 01: ${ASSIGNED[2]}`)).toBeInTheDocument();
  });

  /** 워커가 꺼져 있어도 화면은 서야 한다 — 목소리 목록을 못 받는 것은 흔한 상태다 */
  it('계정 목록을 못 받아도 배정된 목소리 이름은 보인다', () => {
    render(<OpeningCast voices={null} />);
    expect(screen.getByText('피실험자 01')).toBeInTheDocument();
    expect(screen.getByText(/Yohan Koo/)).toBeInTheDocument();
  });
});

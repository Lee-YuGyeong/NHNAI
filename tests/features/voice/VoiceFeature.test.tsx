// @vitest-environment jsdom
/**
 * /voice 시연 화면이 실제로 선다 (src/features/voice/VoiceFeature.tsx).
 *
 * 규칙은 roster·floor·roomVoice 시험이 이미 지킨다. 여기서 재는 것은 **화면이 그 규칙을
 * 제대로 비추는가**다 — 특히 「내 좌석은 안 들린다」가 눈에 보이는지. 소리로만 알 수 있는
 * 것을 화면이 안 적어 주면, 내 줄이 조용히 지나간 걸 내가 모른다 (docs/VOICE.md §7).
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceFeature } from '@/features/voice/VoiceFeature';

/** jsdom 에는 WebAudio 가 없다. 이 화면은 제스처 안에서만 문맥을 건드리므로 껍데기면 된다 */
beforeEach(() => {
  vi.stubGlobal(
    'AudioContext',
    class {
      currentTime = 0;
      state = 'running';
      destination = {};
      resume = () => Promise.resolve();
      createGain = () => ({
        gain: { value: 0, exponentialRampToValueAtTime() {} },
        connect: (n: unknown) => n,
        disconnect() {},
      });
      createOscillator = () => ({
        type: '',
        frequency: { value: 0 },
        connect: (n: unknown) => n,
        disconnect() {},
        start() {},
        stop() {},
        onended: null,
      });
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('/voice — 화면이 선다', () => {
  it('좌석 아홉이 서고, 저마다 명부 번호를 단다', () => {
    render(<VoiceFeature />);
    for (let s = 1; s <= 9; s++) {
      expect(screen.getByText(`SUBJECT 0${s}`)).toBeInTheDocument();
    }
  });

  it('좌석마다 목소리가 겹치지 않는다 — 화면에서도 확인된다', () => {
    render(<VoiceFeature />);
    const shown = screen
      .getAllByText(/^목소리 \d$/)
      .map((el) => el.textContent);
    expect(new Set(shown).size).toBe(shown.length);
  });

  it('내 좌석에는 「나 — 안 들림」이 붙는다 (§7)', () => {
    render(<VoiceFeature />);
    const me = screen.getByText('SUBJECT 01').closest('button')!;
    expect(within(me).getByText('나 — 안 들림')).toBeInTheDocument();
  });

  it('발언권 상태를 적는다 — 겹침이 2 에서 멎는지 눈으로 보는 자리', () => {
    render(<VoiceFeature />);
    expect(screen.getByText(/발언권/)).toBeInTheDocument();
  });
});

describe('/voice — 말하면 판정이 남는다', () => {
  it('내 좌석으로 말하면 「내 말 — 나만 무음」으로 적힌다', async () => {
    render(<VoiceFeature />);
    fireEvent.click(screen.getByText('SUBJECT 01').closest('button')!);
    expect(await screen.findByText('내 말 — 나만 무음')).toBeInTheDocument();
  });

  it('좌석 수를 줄이면 그만큼만 선다', () => {
    render(<VoiceFeature />);
    const seatSelect = screen.getByRole('combobox', { name: /^좌석/ });
    fireEvent.change(seatSelect, { target: { value: '3' } });
    expect(screen.queryByText('SUBJECT 09')).not.toBeInTheDocument();
    expect(screen.getByText('SUBJECT 03')).toBeInTheDocument();
  });
});

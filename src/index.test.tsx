import React, { StrictMode } from 'react';
import { act, render } from '@testing-library/react';
import { useRenderProfiler } from './index';

type ProbeProps = {
  enabled?: boolean;
  reportAfterMs?: number;
  logger?: (label: string, payload: unknown) => void;
};

const Probe: React.FC<ProbeProps> = ({ enabled = true, reportAfterMs = 3000, logger }) => {
  useRenderProfiler('Probe', { enabled, reportAfterMs, logger });
  return <div>probe</div>;
};

describe('useRenderProfiler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('does not log when disabled', () => {
    const logger = jest.fn();

    render(<Probe enabled={false} logger={logger} />);

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(logger).not.toHaveBeenCalled();
  });

  it('tracks initial render and rerender counts', () => {
    const logger = jest.fn();
    const nowSpy = jest.spyOn(performance, 'now');
    nowSpy
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(20)
      .mockReturnValueOnce(30)
      .mockReturnValueOnce(50);

    const { rerender } = render(<Probe logger={logger} reportAfterMs={3000} />);
    rerender(<Probe logger={logger} reportAfterMs={3000} />);

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(logger).toHaveBeenCalledTimes(1);
    const [, payload] = logger.mock.calls[0] as [string, { initialRenders: number; rerenders: number; renders: number }];
    expect(payload.initialRenders).toBe(1);
    expect(payload.rerenders).toBe(1);
    expect(payload.renders).toBe(2);
  });

  it('emits delayed aggregate report after timeout', () => {
    const logger = jest.fn();
    const nowSpy = jest.spyOn(performance, 'now');
    nowSpy.mockReturnValueOnce(5).mockReturnValueOnce(9);

    render(<Probe logger={logger} reportAfterMs={3000} />);

    act(() => {
      jest.advanceTimersByTime(2999);
    });
    expect(logger).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(logger).toHaveBeenCalledTimes(1);
    const [label, payload] = logger.mock.calls[0] as [
      string,
      {
        component: string;
        renders: number;
        initialRenders: number;
        rerenders: number;
        totalMs: number;
        avgMs: number;
        minMs: number;
        maxMs: number;
      }
    ];

    expect(label).toBe('[RenderProfiler] Probe');
    expect(payload.component).toBe('Probe');
    expect(payload.renders).toBe(1);
    expect(payload.initialRenders).toBe(1);
    expect(payload.rerenders).toBe(0);
    expect(payload.totalMs).toBe(4);
    expect(payload.avgMs).toBe(4);
    expect(payload.minMs).toBe(4);
    expect(payload.maxMs).toBe(4);
  });

  it('keeps avg, min, and max consistent with totalMs under StrictMode', () => {
    const logger = jest.fn();
    const nowSpy = jest.spyOn(performance, 'now');
    let t = 0;
    nowSpy.mockImplementation(() => {
      t += 10;
      return t;
    });

    render(
      <StrictMode>
        <Probe logger={logger} reportAfterMs={3000} />
      </StrictMode>
    );

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(logger).toHaveBeenCalledTimes(1);
    const [, payload] = logger.mock.calls[0] as [
      string,
      { renders: number; totalMs: number; avgMs: number; minMs: number; maxMs: number }
    ];

    expect(payload.renders).toBeGreaterThan(0);
    expect(payload.avgMs).toBeCloseTo(payload.totalMs / payload.renders, 10);
    expect(payload.minMs).toBeLessThanOrEqual(payload.avgMs);
    expect(payload.avgMs).toBeLessThanOrEqual(payload.maxMs);
  });
});

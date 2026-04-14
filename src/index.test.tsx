import React, { useEffect } from 'react';
import { act, render } from '@testing-library/react';
import {
  RenderProfiler,
  type LogPayload,
  useRenderProfiler,
  withRenderProfiler,
} from './index';

function getSingleRow(log: jest.Mock): LogPayload {
  expect(log).toHaveBeenCalledTimes(1);
  const rows = log.mock.calls[0][0] as LogPayload[];
  expect(rows).toHaveLength(1);
  return rows[0];
}

describe('react-render-profiler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    process.env.NODE_ENV = 'test';
  });

  it('useRenderProfiler aggregates mount and update samples', () => {
    const log = jest.fn();

    const Probe: React.FC = () => {
      const { onRender } = useRenderProfiler('Probe', { reportAfterMs: 100, log });

      useEffect(() => {
        onRender('probe', 'mount', 3, 5, 0, 0);
        onRender('probe', 'update', 7, 9, 0, 0);
      }, [onRender]);

      return <div>probe</div>;
    };

    render(<Probe />);

    act(() => {
      jest.advanceTimersByTime(100);
    });

    const row = getSingleRow(log);
    expect(row.componentName).toBe('Probe');
    expect(row.renders).toBe(2);
    expect(row.mountPhases).toBe(1);
    expect(row.updatePhases).toBe(1);
    expect(row.totalActualMs).toBe(10);
    expect(row.minActualMs).toBe(3);
    expect(row.maxActualMs).toBe(7);
    expect(row.totalBaseMs).toBe(14);
  });

  it('RenderProfiler does not call log when disabled', () => {
    const log = jest.fn();

    render(
      <RenderProfiler id="DisabledProbe" enabled={false} reportAfterMs={50} log={log}>
        <div>child</div>
      </RenderProfiler>,
    );

    act(() => {
      jest.advanceTimersByTime(50);
    });

    expect(log).not.toHaveBeenCalled();
  });

  it('withRenderProfiler supports enabled(props) predicate', () => {
    const log = jest.fn();

    const View: React.FC<{ shouldProfile: boolean }> = () => <div>view</div>;
    const ProfiledView = withRenderProfiler(View, {
      componentName: 'PredicateView',
      enabled: (props) => props.shouldProfile,
      reportAfterMs: 100,
      log,
    });

    const { rerender } = render(<ProfiledView shouldProfile={false} />);
    rerender(<ProfiledView shouldProfile={true} />);

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(log).toHaveBeenCalledTimes(1);
    const row = getSingleRow(log);
    expect(row.componentName).toBe('PredicateView');
    expect(row.renders).toBeGreaterThan(0);
  });

  it('defaults to disabled in production for hook API', () => {
    process.env.NODE_ENV = 'production';

    let enabled = true;
    const Probe: React.FC = () => {
      const result = useRenderProfiler('ProdProbe');
      enabled = result.enabled;
      return null;
    };

    render(<Probe />);
    expect(enabled).toBe(false);
  });
});

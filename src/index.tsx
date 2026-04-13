import React, { useEffect, useRef } from 'react';

type LogPayload = {
  component: string;
  renders: number;
  initialRenders: number;
  rerenders: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
};

export type RenderProfilerOptions = {
  componentName?: string;
  groupByComponent?: boolean;
  reportAfterMs?: number;
  logEachRender?: boolean;
  enabled?: boolean;
  logger?: (label: string, payload: LogPayload) => void;
};

export type RenderProfilerHOCOptions<P> = Omit<RenderProfilerOptions, 'enabled'> & {
  enabled?: boolean | ((props: P) => boolean);
};

type MutableStats = {
  renders: number;
  initialRenders: number;
  rerenders: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  timerId: ReturnType<typeof setTimeout> | null;
};

const defaultLogger = (label: string, payload: LogPayload): void => {
  // Console table keeps output readable when multiple profiled components run.
  // eslint-disable-next-line no-console
  console.table([{ label, ...payload }]);
};

const groupedStatsStore = new Map<string, MutableStats>();

const createEmptyStats = (): MutableStats => ({
  renders: 0,
  initialRenders: 0,
  rerenders: 0,
  totalMs: 0,
  minMs: Number.POSITIVE_INFINITY,
  maxMs: 0,
  timerId: null
});

const scheduleReport = (
  componentName: string,
  stats: MutableStats,
  reportAfterMs: number,
  logger: (label: string, payload: LogPayload) => void
): void => {
  if (stats.timerId) {
    clearTimeout(stats.timerId);
  }

  stats.timerId = setTimeout(() => {
    const avg = stats.renders > 0 ? stats.totalMs / stats.renders : 0;
    const payload: LogPayload = {
      component: componentName,
      renders: stats.renders,
      initialRenders: stats.initialRenders,
      rerenders: stats.rerenders,
      totalMs: Number(stats.totalMs.toFixed(2)),
      avgMs: Number(avg.toFixed(2)),
      minMs: Number((Number.isFinite(stats.minMs) ? stats.minMs : 0).toFixed(2)),
      maxMs: Number(stats.maxMs.toFixed(2))
    };

    logger(`[RenderProfiler] ${componentName}`, payload);
  }, reportAfterMs);
};

export const useRenderProfiler = (
  componentName: string,
  options: RenderProfilerOptions = {}
): void => {
  const {
    groupByComponent = false,
    reportAfterMs = 3000,
    logEachRender = false,
    enabled = true,
    logger = defaultLogger
  } = options;

  const renderStartRef = useRef<number>(0);
  const instanceRenderCountRef = useRef<number>(0);
  const renderGenerationRef = useRef<number>(0);
  const statsRef = useRef<MutableStats>(createEmptyStats());
  if (groupByComponent && !groupedStatsStore.has(componentName)) {
    groupedStatsStore.set(componentName, createEmptyStats());
  }
  const activeStats = groupByComponent ? groupedStatsStore.get(componentName)! : statsRef.current;

  // Record render start during render; count and measure in useEffect so totals match per-render
  // durations. A render-generation token in the effect deps forces the effect to run after every
  // profiled render. Without it, rerenders with the same logger/options leave deps unchanged, so React
  // skips the effect while render-only counting would still advance — producing avg/total/min/max that
  // disagree. Dev Strict Mode can also widen that gap by extra render passes before commit.
  if (enabled) {
    const now = performance.now();
    renderStartRef.current = now;
    renderGenerationRef.current += 1;
  }
  const renderGeneration = renderGenerationRef.current;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const end = performance.now();
    const renderDuration = end - renderStartRef.current;
    const stats = activeStats;

    instanceRenderCountRef.current += 1;
    stats.renders += 1;
    if (instanceRenderCountRef.current === 1) {
      stats.initialRenders += 1;
    } else {
      stats.rerenders += 1;
    }

    stats.totalMs += renderDuration;
    stats.minMs = Math.min(stats.minMs, renderDuration);
    stats.maxMs = Math.max(stats.maxMs, renderDuration);

    if (logEachRender) {
      logger(`[RenderProfiler] ${componentName}#${stats.renders}`, {
        component: componentName,
        renders: stats.renders,
        initialRenders: stats.initialRenders,
        rerenders: stats.rerenders,
        totalMs: Number(stats.totalMs.toFixed(2)),
        avgMs: Number((stats.totalMs / stats.renders).toFixed(2)),
        minMs: Number(stats.minMs.toFixed(2)),
        maxMs: Number(stats.maxMs.toFixed(2))
      });
    }

    scheduleReport(componentName, stats, reportAfterMs, logger);

    return () => {
      if (!groupByComponent && stats.timerId) {
        clearTimeout(stats.timerId);
        stats.timerId = null;
      }
    };
  }, [
    activeStats,
    componentName,
    enabled,
    groupByComponent,
    logEachRender,
    logger,
    reportAfterMs,
    renderGeneration
  ]);
};

export const withRenderProfiler = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options: RenderProfilerHOCOptions<P> = {}
): React.FC<P> => {
  const wrappedName = options.componentName || WrappedComponent.displayName || WrappedComponent.name || 'AnonymousComponent';

  const ProfiledComponent: React.FC<P> = (props) => {
    const { enabled = true, ...restOptions } = options;
    const resolvedEnabled = typeof enabled === 'function' ? enabled(props) : enabled;
    useRenderProfiler(wrappedName, { ...restOptions, enabled: resolvedEnabled });
    return <WrappedComponent {...props} />;
  };

  ProfiledComponent.displayName = `withRenderProfiler(${wrappedName})`;
  return ProfiledComponent;
};

import React, {
  Profiler,
  useCallback,
  useId,
  useMemo,
  type ProfilerOnRenderCallback,
} from 'react';

export type RenderProfilerOptions<P = unknown> = {
  componentName?: string;
  reportAfterMs?: number;
  groupByComponent?: boolean;
  log?: (rows: LogPayload[]) => void;
  enabled?: boolean | ((props: P) => boolean);
};

export type LogPayload = {
  componentName: string;
  renders: number;
  mountPhases: number;
  updatePhases: number;
  totalActualMs: number;
  minActualMs: number;
  maxActualMs: number;
  totalBaseMs: number;
};

type InternalBucket = LogPayload;

const buckets = new Map<string, InternalBucket>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function defaultEnabledByEnv(): boolean {
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production') {
    return false;
  }
  return true;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function touchBucket(key: string, displayName: string): InternalBucket {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = {
      componentName: displayName,
      renders: 0,
      mountPhases: 0,
      updatePhases: 0,
      totalActualMs: 0,
      minActualMs: Number.POSITIVE_INFINITY,
      maxActualMs: 0,
      totalBaseMs: 0,
    };
    buckets.set(key, bucket);
  }
  return bucket;
}

function defaultLogger(rows: LogPayload[]): void {
  const tableRows = rows.map((row) => ({
    component: row.componentName,
    renders: row.renders,
    mounts: row.mountPhases,
    updates: row.updatePhases,
    totalMs: round3(row.totalActualMs),
    minMs: row.renders ? round3(row.minActualMs) : 0,
    maxMs: round3(row.maxActualMs),
    avgMs: row.renders ? round3(row.totalActualMs / row.renders) : 0,
    baseMs: round3(row.totalBaseMs),
  }));

  // eslint-disable-next-line no-console
  console.table(tableRows);
}

function scheduleFlush(reportAfterMs: number, log: (rows: LogPayload[]) => void): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const rows = [...buckets.values()].map((bucket) => ({ ...bucket }));
    buckets.clear();
    if (rows.length) {
      log(rows);
    }
  }, reportAfterMs);
}

function normalizePhase(phase: 'mount' | 'update' | 'nested-update'): 'mount' | 'update' {
  return phase === 'mount' ? 'mount' : 'update';
}

function recordProfilerSample(
  aggregateKey: string,
  displayName: string,
  phase: 'mount' | 'update' | 'nested-update',
  actualDuration: number,
  baseDuration: number,
  reportAfterMs: number,
  log: (rows: LogPayload[]) => void,
): void {
  const bucket = touchBucket(aggregateKey, displayName);
  const normalizedPhase = normalizePhase(phase);

  bucket.renders += 1;
  if (normalizedPhase === 'mount') {
    bucket.mountPhases += 1;
  } else {
    bucket.updatePhases += 1;
  }

  bucket.totalActualMs += actualDuration;
  bucket.minActualMs = Math.min(bucket.minActualMs, actualDuration);
  bucket.maxActualMs = Math.max(bucket.maxActualMs, actualDuration);
  bucket.totalBaseMs += baseDuration;

  scheduleFlush(reportAfterMs, log);
}

function resolveEnabled<P>(options: RenderProfilerOptions<P>, props: P): boolean {
  const { enabled } = options;
  if (enabled === undefined) {
    return defaultEnabledByEnv();
  }
  if (typeof enabled === 'function') {
    return Boolean(enabled(props));
  }
  return enabled;
}

export type RenderProfilerProps = {
  id: string;
  children: React.ReactNode;
} & Omit<RenderProfilerOptions<never>, 'enabled'> & {
  enabled?: boolean;
};

export function RenderProfiler({
  id,
  children,
  reportAfterMs = 500,
  groupByComponent = false,
  log = defaultLogger,
  enabled,
}: RenderProfilerProps): React.ReactElement {
  const instanceId = useId();
  const aggregateKey = groupByComponent ? id : `${id} (${instanceId})`;

  const onRender = useCallback<ProfilerOnRenderCallback>(
    (_profilerId, phase, actualDuration, baseDuration) => {
      recordProfilerSample(
        aggregateKey,
        id,
        phase,
        actualDuration,
        baseDuration,
        reportAfterMs,
        log,
      );
    },
    [aggregateKey, id, log, reportAfterMs],
  );

  const isEnabled = enabled === undefined ? defaultEnabledByEnv() : Boolean(enabled);

  if (!isEnabled) {
    return <>{children}</>;
  }

  return (
    <Profiler id={aggregateKey} onRender={onRender}>
      {children}
    </Profiler>
  );
}

export function useRenderProfiler(
  componentName: string,
  options: Omit<RenderProfilerOptions<never>, 'enabled'> & { enabled?: boolean } = {},
): {
  profilerId: string;
  onRender: ProfilerOnRenderCallback;
  enabled: boolean;
} {
  const { reportAfterMs = 500, groupByComponent = false, log = defaultLogger } = options;
  const instanceId = useId();
  const aggregateKey = useMemo(
    () => (groupByComponent ? componentName : `${componentName} (${instanceId})`),
    [componentName, groupByComponent, instanceId],
  );

  const onRender = useCallback<ProfilerOnRenderCallback>(
    (_id, phase, actualDuration, baseDuration) => {
      recordProfilerSample(
        aggregateKey,
        componentName,
        phase,
        actualDuration,
        baseDuration,
        reportAfterMs,
        log,
      );
    },
    [aggregateKey, componentName, log, reportAfterMs],
  );

  const enabledByOption = useMemo(() => {
    if (options.enabled === undefined) {
      return defaultEnabledByEnv();
    }
    return Boolean(options.enabled);
  }, [options.enabled]);

  return {
    profilerId: aggregateKey,
    onRender,
    enabled: enabledByOption,
  };
}

export function withRenderProfiler<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options: RenderProfilerOptions<P> = {},
): React.FC<P> {
  const fallbackName = WrappedComponent.displayName || WrappedComponent.name || 'Component';
  const wrappedName = options.componentName || fallbackName;

  const Profiled: React.FC<P> = (props) => {
    const { reportAfterMs = 500, groupByComponent = false, log = defaultLogger } = options;

    const instanceId = useId();
    const aggregateKey = groupByComponent ? wrappedName : `${wrappedName} (${instanceId})`;

    const onRender = useCallback<ProfilerOnRenderCallback>(
      (_profilerId, phase, actualDuration, baseDuration) => {
        recordProfilerSample(
          aggregateKey,
          wrappedName,
          phase,
          actualDuration,
          baseDuration,
          reportAfterMs,
          log,
        );
      },
      [aggregateKey, log, reportAfterMs, wrappedName],
    );

    const isEnabled = resolveEnabled(options, props);
    if (!isEnabled) {
      return <WrappedComponent {...props} />;
    }

    return (
      <Profiler id={aggregateKey} onRender={onRender}>
        <WrappedComponent {...props} />
      </Profiler>
    );
  };

  Profiled.displayName = `withRenderProfiler(${wrappedName})`;
  return Profiled;
}

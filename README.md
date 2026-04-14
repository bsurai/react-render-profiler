# React Render Profiler

Profiler helpers built on React's `<Profiler>` callback with debounced aggregation output.

## Install

```bash
npm i react-render-profiler
```

## What It Gives You

- Render samples from React `actualDuration` and `baseDuration`
- Aggregated reporting with debounce (`reportAfterMs`)
- Three integration styles:
  - `withRenderProfiler(Component, options?)`
  - `<RenderProfiler id="...">...</RenderProfiler>`
  - `useRenderProfiler(componentName, options?)`

By default profiling is **disabled in production** (`NODE_ENV === "production"`).

## Usage

### HOC

```tsx
import { withRenderProfiler } from 'react-render-profiler';

const ProfiledCard = withRenderProfiler(ProductCard, {
  componentName: 'ProductCard',
  groupByComponent: true,
  reportAfterMs: 1000,
});
```

### Wrapper Component

```tsx
import { RenderProfiler } from 'react-render-profiler';

export function ProductSection() {
  return (
    <RenderProfiler id="ProductSection" groupByComponent reportAfterMs={1000}>
      <ProductList />
    </RenderProfiler>
  );
}
```

### Hook (manual `<Profiler>` placement)

```tsx
import { Profiler } from 'react';
import { useRenderProfiler } from 'react-render-profiler';

export function CheckoutSidebar() {
  const { profilerId, onRender, enabled } = useRenderProfiler('CheckoutSidebar', {
    reportAfterMs: 1000,
  });

  if (!enabled) {
    return <aside>...</aside>;
  }

  return (
    <Profiler id={profilerId} onRender={onRender}>
      <aside>...</aside>
    </Profiler>
  );
}
```

## API

### `RenderProfilerOptions<P>`

- `componentName?: string`
- `reportAfterMs?: number` (default `500`)
- `groupByComponent?: boolean` (default `false`)
- `log?: (rows: LogPayload[]) => void` (default `console.table` sink)
- `enabled?: boolean | ((props: P) => boolean)`

### `LogPayload`

- `componentName`
- `renders`
- `mountPhases`
- `updatePhases`
- `totalActualMs`
- `minActualMs`
- `maxActualMs`
- `totalBaseMs`

### `withRenderProfiler(Component, options?)`

Wraps a component in `<Profiler>`, supporting `enabled` as boolean or predicate function.

### `RenderProfiler`

Component form:

```tsx
<RenderProfiler id="MySection">{children}</RenderProfiler>
```

### `useRenderProfiler(componentName, options?)`

Returns `{ profilerId, onRender, enabled }` for manual `<Profiler>` usage.

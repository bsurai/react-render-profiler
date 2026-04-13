# React Render Profiler

A tiny profiler helper to measure initial render + rerender timings for React components.

## Install

```bash
npm i react-render-profiler
```

## Why

Use it when you want:

- render count and rerender count per component instance
- approximate commit timing (`render start` -> `useEffect`)
- delayed aggregated reporting to keep console noise low

## Usage (HOC)

```tsx
import { withRenderProfiler } from 'react-render-profiler';
import { ProductCard } from './ProductCard';

export default withRenderProfiler(ProductCard, {
  reportAfterMs: 5000,
  logEachRender: false
});
```

## Actual usage patterns

### 1) Wrap component on export (global for all usages)

```tsx
function MenuItem(props) {
  ...
}

export default withRenderProfiler(MenuItem, {
  componentName: 'MenuItem',
  groupByComponent: true,
  enabled: process.env.NODE_ENV !== 'production',
  reportAfterMs: 5000,
});
```

### 2) Wrap only in one place (recommended for focused profiling)

```tsx
const FooterProfiled = withRenderProfiler(FooterWidget, {
  componentName: 'HomePage:FooterWidget',
  groupByComponent: true,
  enabled: process.env.NODE_ENV !== 'production',
  reportAfterMs: 5000,
});

// Inside ProductPage:
<RecommendationsWidgetProfiled productAlias={product.alias} />
```

## Measure only specific usage

For HOC usage, `enabled` can be a function of component props.  
This lets you measure only specific places/instances and keep others unprofiled.

```tsx
type CardProps = { alias: string; profileRender?: boolean };

const ProductCardProfiled = withRenderProfiler<CardProps>(ProductCard, {
  componentName: 'ProductCard',
  groupByComponent: true,
  enabled: (props) => props.profileRender === true,
});

// Only this usage is measured:
<ProductCardProfiled alias="a" profileRender />

// This usage is ignored by profiler:
<ProductCardProfiled alias="b" />
```

## Usage (Hook)

```tsx
import { useRenderProfiler } from 'react-render-profiler';

export function CheckoutSidebar() {
  useRenderProfiler('CheckoutSidebar', { reportAfterMs: 3000 });
  return <aside>...</aside>;
}
```

## API

### `withRenderProfiler(Component, options?)`

Wraps a component and reports stats to console after inactivity timeout.

### `useRenderProfiler(componentName, options?)`

Hook variant when you do not want to wrap export.

### `options`

- `reportAfterMs` (default `3000`) - report debounce timeout
- `groupByComponent` (default `false`) - aggregate all instances under one component report
- `logEachRender` (default `false`) - emit log on every commit
- `enabled` (default `true`) - disable profiler globally (`boolean`) or for HOC by props (`(props) => boolean`)
- `logger` - custom logger function for integrating with your telemetry

### Typical presets

- **Page/widget profiling**: `{ componentName, groupByComponent: true, enabled: dev, reportAfterMs: 5000 }`
- **Instance-level profiling**: `{ componentName, enabled: (props) => ..., reportAfterMs: 2000-5000 }`

## Notes

- In React StrictMode (development), render/effect invocations can be doubled.
- This helper measures render-to-effect timing, not full browser paint time.

## Report Fields

Each console row includes these fields:

- `label` - logger label, usually `[RenderProfiler] <ComponentName>`
- `component` - component name used for profiling/grouping
- `renders` - total committed renders counted in this profile bucket
- `initialRenders` - number of first renders for mounted instances in this bucket
- `rerenders` - number of subsequent renders (`renders - initialRenders`)
- `totalMs` - sum of measured render durations in milliseconds
- `avgMs` - average render duration (`totalMs / renders`)
- `minMs` - fastest measured render duration in milliseconds
- `maxMs` - slowest measured render duration in milliseconds

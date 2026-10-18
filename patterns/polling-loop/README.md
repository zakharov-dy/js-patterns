# PollingLoop

Periodically refresh asynchronous data without overlapping requests or delivering
results after polling stops. This dependency-free ESM pattern uses a timeout
between operations instead of a fixed repeating interval.

## API

```js
import { PollingLoop } from './PollingLoop.mjs';

const loop = new PollingLoop({
  task: () => fetch('/status').then(response => response.json()),
  intervalMs: 1000,
  onValue: value => console.log(value),
  onError: error => console.error(error),
});
loop.start();
// Later: loop.stop();
```

`task`, `onValue`, and `onError` are required functions. `task` receives no arguments
and may return a synchronous value or a Promise, or throw synchronously.
`intervalMs` must be a finite nonnegative number; zero is allowed. Invalid inputs
throw `TypeError`. Optional `setTimeoutFn` and `clearTimeoutFn` default to
`globalThis.setTimeout` and `globalThis.clearTimeout` and must be functions.
Injected timers must follow the usual asynchronous timeout/clear-timeout contract.

`running` is a read-only boolean, initially `false`. `start()` and `stop()` are
idempotent and return `undefined`.

## Scheduling and restart

The first operation starts in a microtask. Each subsequent operation waits
`intervalMs` after the preceding task settles and its synchronous delivery callback
returns. There is at most one physical task invocation in flight, even across a
stop followed immediately by a start.

`stop()` clears a scheduled timer and invalidates the current run. Pending results
and failures from that run are discarded, even if polling has restarted. A restart
waits for the old task to settle, then begins the replacement run promptly in a
microtask without an interval delay. Stopping before the first microtask prevents
the task from being invoked.

Each current result is delivered once to `onValue`, including `undefined`, `null`,
and other falsy values. Task failures are passed unchanged to `onError`, including
synchronous throws and non-Error rejection values. Ordinary task failures do not
stop polling.

## Callback errors

Delivery callbacks must be synchronous. If either callback throws, the loop stops
and intentionally swallows the callback exception so it cannot escape as an
unhandled rejection. An `onValue` exception is never routed to `onError`.
Callbacks may call `stop()` or `stop(); start()`: the old continuation cannot install
a timer for the invalidated run. If a callback restarts and then throws, the loop
stops, including that replacement run.

## Limitations

There is no AbortController or underlying task cancellation. A never-settling task
blocks further operations, including after restart. Async delivery callbacks are
unsupported: their returned Promises are not awaited or handled. Timers provide a
minimum delay subject to the host scheduler; they are not a fixed-rate clock.
There is no caching, deduplication, freezing, business API integration, or external
dependency.

## Run

```sh
node --test patterns/polling-loop/*.test.mjs
node patterns/polling-loop/example.mjs
```

Tests use injected manual timers and deferred Promises, with no real sleeps. The
example stops itself after three attempts, including one recoverable failure.

## Provenance

The problem was inspired by
`/Users/dmitry/dev/psb.invest.mapp/src/api.1/Internals/IntervalBasedDataSource.ts`,
read only as context. This is an independent, smaller generic implementation; it
does not use that application's source, RxJS, MobX, or business APIs.

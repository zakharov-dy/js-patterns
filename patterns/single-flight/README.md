# Single flight

Parallel callers often request the same expensive operation before its first
execution finishes. `SingleFlight` shares one pending operation per key so those
callers receive the same outcome without starting duplicate work.

## API

```js
import { SingleFlight } from './SingleFlight.mjs';

const flight = new SingleFlight();
const first = flight.run('calculation', () => 6 * 7);
const second = flight.run('calculation', () => 100);
console.log(first === second); // true
console.log(await first); // 42
```

`run(key, task)` returns a Promise. `task` must be a function; otherwise `run`
throws a `TypeError` synchronously, even when that key already has pending work.
The first task runs without arguments. It may return a value, Promise or thenable,
or throw. Values and rejection reasons are preserved, including `undefined`,
`null` and other falsy values.

Keys follow `Map` semantics: primitive keys retain their types, objects compare
by identity, `NaN` matches `NaN`, and `0` matches `-0`. Keys such as `undefined`,
`null`, `0`, `false` and the empty string are supported. Different keys and
different `SingleFlight` instances operate independently.

## Promise identity and scheduling

The first valid call immediately registers and returns a Promise. Every valid
call for that pending key returns that **exact Promise object**; only the first
task executes. `run` is deliberately not an `async` method, which would wrap the
Promise and lose this identity guarantee.

The task starts in a Promise microtask after registration, never inline during
`run`. Synchronous throws therefore become Promise rejections. A task can observe
its already registered flight by calling `run` with the same key.

Fulfillment or rejection removes the key before the returned Promise settles.
A subsequent call starts fresh, even if the previous result was falsy or failed.
Cleanup is part of the returned chain, so it creates no ignored rejecting
`finally()` Promise. Callers still need to handle rejections of the returned
Promise as usual.

## Limitations

There is no settled-value cache, cancellation, retry, TTL, concurrency limit or
cross-instance/process coordination. A task that never settles retains its key
and makes later callers wait indefinitely. Tasks for the same key must represent
equivalent work: later task functions are ignored while the first is pending.
Do not return or await the same flight from inside its own task; that creates a
self-dependency that cannot complete successfully.

## Provenance

The idea was inspired by a per-account `refreshPromise` in
`trevo-wallet/src/services/agents/authorizedAgent.api.ts`: parallel callers share
one pending operation. This implementation was written independently as a generic
keyed pattern. It contains no business code, tokens, HTTP, wallet dependencies or
account behavior.

## Run

No dependencies or package changes are needed. From the repository root:

```sh
node --test patterns/single-flight/*.test.mjs
node patterns/single-flight/example.mjs
```

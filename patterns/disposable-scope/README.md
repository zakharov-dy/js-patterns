# DisposableScope

A dependency-free synchronous resource group. A scope owns cleanup registrations
for one lifetime: register resources as they are acquired, then call `dispose()`
when their owner closes. Reverse release order helps clean up dependent resources
before the resources they depend on.

Requires Node.js 18 or newer for the commands below. The implementation is native
ESM (`.mjs`) and uses no framework or package dependencies.

```js
import { DisposableScope } from './disposable-scope.mjs';

const scope = new DisposableScope();
scope.add(() => console.log('release resource'));
scope.addSubscription({ unsubscribe() { console.log('stop subscription'); } }, 'unsubscribe');

try {
  // Work with the owned resources.
} finally {
  scope.dispose();
}
```

## Contract

- `add(fn)` registers a zero-argument cleanup callback. Callbacks run with
  `undefined` as their supplied receiver (sloppy functions follow JavaScript's
  usual receiver coercion). Bind callbacks yourself when they require a receiver.
- `addSubscription(object, method)` requires an explicit `'unsubscribe'` or
  `'remove'`. It accepts objects or functions with a callable selected method,
  including inherited methods and objects without a prototype. It never guesses
  which method to use, even when both exist. The method is read once at
  registration, captured, and invoked with the original subscription as `this`.
  Later method replacement does not change that registration.
- Both registration methods return `undefined`. Each registration is independent;
  registering the same resource twice schedules two calls. There is no deduplication
  or individual deregistration.
- `dispose()` marks the scope closed before invoking any cleanup. It attempts all
  registered callbacks in LIFO order and removes each registration before calling
  it. Reentrant and repeated disposal do nothing, even after a failed disposal.
  `disposed` is a read-only getter indicating that disposal has begun.
- Registrations after closure, including those made during disposal, execute
  immediately rather than being retained. Such work runs before the next queued
  cleanup; it is not inserted into the LIFO queue.
- Cleanup failures never stop the remaining queued callbacks. After the queue is
  drained, `dispose()` throws an `AggregateError` containing the thrown values in
  release order, even for a single failure or a non-`Error` thrown value.
  An immediately executed late registration also wraps its failure in an
  `AggregateError`. If that error escapes a currently running cleanup, the outer
  disposal includes that aggregate as one error; aggregates are not flattened.
- Invalid callbacks, null/primitive subscriptions, missing/non-callable methods,
  and unsupported method names throw `TypeError` at registration, even after
  closure. No invalid registration is retained. A throwing method getter/proxy
  propagates its original exception at registration, before ownership transfers.

## Run

From the repository root, with no install step:

```sh
node --test patterns/disposable-scope/disposable-scope.test.mjs
node patterns/disposable-scope/example.mjs
```

The example removes an event listener and releases a subscription in a `finally`
block. `npm test` also discovers the contract tests using Node's built-in runner.

## Provenance and boundaries

Independently implemented from the resource-group ownership idea observed in two
private application cleanup helpers and a private on-demand lifetime provider.
Those references grouped callbacks and subscription cleanup under an owner, with
FIFO release and early termination on failure. This implementation deliberately
chooses LIFO release, explicit adapters, permanent closure, and error aggregation.
No private source, identifiers, application behavior, or dependencies are included.

This is a synchronous pattern, not a full lifetime-management framework. Callback
return values are ignored: promises are neither awaited nor observed, and async
cleanup/rejections are unsupported. Supply only synchronous cleanup functions.
There is no cancellation, timeout, automatic garbage-collection cleanup,
reference counting, cache eviction, observation tracking, or delayed release.
The owner decides when to close the scope and handles `AggregateError`.
If both the work in a `try` block and cleanup in `finally` throw, normal JavaScript
semantics let the cleanup exception replace the work exception; preserve both
explicitly in the caller if needed. A callback that never returns prevents later
cleanup; recursively registering more late cleanup can exhaust the call stack.

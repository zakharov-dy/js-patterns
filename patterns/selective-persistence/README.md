# Selective persistence

Persist completed query results and discard transient request states on both save
and restore. A request saved as `pending` has no running request behind it after a
restart; filtering only on save leaves older stored pending/rejected entries intact.
This recipe independently implements that policy with no dependencies or app code.

Run from the repository root (Node.js 22 or newer; no install required):

```sh
node --test patterns/selective-persistence/selective-persistence.test.mjs
node patterns/selective-persistence/example.mjs
```

## Contract

`fulfilledQueries(map)` returns a fresh ordinary object containing only entries
whose own data property `status` is exactly the string `fulfilled`.
`filterPersistedField(value, key)` applies that filter only when `key === 'queries'`.
Every other key passes through unchanged, by identity, including `config`.
Neither function changes its input. Retained entries and their nested data are
shared references: this is a shallow filter, not a clone or deep freeze.

The input contract is an inert JSON-style record with `Object.prototype` or a null
prototype. Invalid query maps (`null`, arrays, primitives, functions, dates, maps,
or objects with custom prototypes) become empty objects. Invalid entries are
removed using the same record check; missing, inherited, accessor, or non-string
statuses do not qualify. This deliberately fails closed for malformed query maps
instead of restoring unusable cache shapes. A fulfilled entry's payload is not
validated: even an entry without `data` passes the status policy.

Only own enumerable string query keys are considered. Symbol and non-enumerable
keys are ignored. Map getters and status getters are skipped without invocation.
Keys such as `__proto__`, `constructor`, and `toString` are preserved as own data
properties without changing the output prototype, including after a JSON round trip.
Proxies and other objects with executable traps are outside the contract; this is
not a general sanitizer for hostile JavaScript objects. Nested payload getters,
cycles, BigInts, and other non-JSON data can still break serialization.

## Redux Persist adapter

[redux-persist-adapter.mjs](./redux-persist-adapter.mjs) accepts the real library
functions through injection, so importing this recipe never requires Redux Persist.
`createQueryTransform(createTransform)` supplies inbound (write) and outbound
(restore) callbacks shaped for Redux Persist's `createTransform`.

Each callback receives **one reducer field's value**, such as the queries map,
plus its field key. It does not receive the Redux root or an object wrapping
`queries`. The transform whitelist selects `queries`; the persist configuration's
separate whitelist selects `queries` and `config`. Config is persisted unchanged.

In a consumer that already has Redux Toolkit and Redux Persist installed:

```js
import { configureStore } from '@reduxjs/toolkit';
import { createTransform, persistReducer, persistStore } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { createPersistedApiReducer } from './redux-persist-adapter.mjs';
// `api` is your existing RTK Query API slice; `otherReducer` is another reducer.

const store = configureStore({
  reducer: {
    [api.reducerPath]: createPersistedApiReducer({
      api, storage, createTransform, persistReducer,
    }),
    other: otherReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({
    // Redux Persist lifecycle actions contain non-serializable callbacks.
    serializableCheck: {
      ignoredActions: [
        'persist/PERSIST', 'persist/REHYDRATE', 'persist/PAUSE',
        'persist/PURGE', 'persist/FLUSH', 'persist/REGISTER',
      ],
    },
  }).concat(api.middleware),
});
const persistor = persistStore(store);
```

`persistReducer` wraps only that API slice reducer. Do not wrap the entire root
with this configuration: the field whitelist and callback keys are relative to
the reducer being persisted. Mutations and subscriptions are excluded. The snippet
shows wiring, not a complete application; arrange your usual rehydration gate and
API setup in the consumer. The tests exercise injection and callbacks without
claiming an end-to-end integration test with Redux Persist or RTK Query.

RTK Query also needs an appropriate `extractRehydrationInfo` implementation to
recognize the matching Redux Persist `REHYDRATE` payload (typically only when its
`key` matches this API's persistence key). Choose that behavior in the consuming
API definition, using the library version's supported rehydration API. Filtering
alone does not make RTK Query adopt persisted cache state, trigger requests, or
restore subscriptions.

## Limits and production decisions

- **Schema and versions:** the adapter's `version: 1` is an example marker, not a
  migration. Validate stored payloads and config, migrate or purge on incompatible
  API/cache schema changes, and test your state reconciler. This filter does not
  validate the full RTK Query entry shape or rewrite stored config.
- **Expiry:** `fulfilled` means a request completed, not that its data is fresh.
  There is no TTL, age check, or eviction policy here. Add timestamps and expiry
  rules separately if stale results are unacceptable.
- **Refetch:** choose rehydration, refetch-on-mount/focus/reconnect, invalidation,
  and offline behavior explicitly. Dropping pending/rejected entries does not
  itself guarantee a new request or eliminate every possible loading bug.
- **Security and scope:** status filtering gives no auth-scope guarantee. Partition
  or clear caches on logout, account/tenant changes, and permission changes.
  Persist only approved data; browser storage is readable by page scripts and is
  neither encryption nor a secure place for credentials or sensitive responses.
  Cache query keys may also contain sensitive arguments.
- **Storage:** handle quota, serialization, corruption, and storage availability
  errors in the consumer. Restoring an invalid map produces an empty map, but
  parse errors and storage failures happen outside these callbacks. Coordinate
  concurrent tabs separately; this policy offers no conflict resolution.

Consumer wiring references: [Redux Persist transforms](https://github.com/rt2zz/redux-persist#transforms)
and [RTK Query persistence and rehydration](https://redux-toolkit.js.org/rtk-query/usage/persistence-and-rehydration).

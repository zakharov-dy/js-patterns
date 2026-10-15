# DataHolder

Loading indicators, cached values, and failures often become unrelated flags.
DataHolder keeps their transitions together in a small synchronous state container.
It can represent a first load or a refresh that keeps the last successful value.

## Contract

Import the named `DataHolder` export from `./DataHolder.mjs` and construct it with
`new DataHolder()`. There are no constructor options.

The read-only properties are `state`, `hasData`, `data`, and `error`. Internal
fields are private; callers change the container through these four methods:

| Operation | State afterwards | Data afterwards | Error afterwards |
| --- | --- | --- | --- |
| Construction | `idle` | Absent (`undefined`) | `undefined` |
| `startLoading()` | `loading` | Retained | `undefined` |
| `setData(value)` | `ready` | Supplied value | `undefined` |
| `setError(error)` | `error` | Retained | Supplied argument |
| `reset()` | `idle` | Absent (`undefined`) | `undefined` |

Every method can be called from any state and returns `undefined`.
`hasData` is an explicit boolean independent of truthiness: `0`, `false`, `''`,
`[]`, and `null` are all valid data. Only `undefined` means data is absent.
`setData(undefined)` throws `TypeError` **before changing any state, data, or error**.
Use `reset()` to remove data.

`setError(error)` accepts **any JavaScript value**, including `Error` objects,
strings, `null`, and `undefined`. It stores the argument verbatim without
validation, wrapping, or throwing it. Calling `setError()` therefore enters
`error` state with an `undefined` error value. Check `state === 'error'` to detect
failure; checking error truthiness would miss valid error arguments. A first-load
failure has no data, while a refresh failure retains the previous data.

## Example

```js
import { DataHolder } from './DataHolder.mjs';

const holder = new DataHolder();
holder.startLoading();
holder.setData(0);
holder.startLoading(); // state: 'loading', hasData: true, data: 0
holder.setError('Refresh failed'); // state: 'error', data: 0
holder.setData(false); // state: 'ready', hasData: true, error: undefined
holder.reset(); // state: 'idle', hasData: false
```

From the repository root, run the complete example and tests with Node.js LTS:

```sh
node patterns/data-holder/example.mjs
npm test
```

No dependency installation is required for either command.

## Limitations

DataHolder does no HTTP, fetching, cancellation, or asynchronous execution.
The caller performs work and reports transitions. It provides no subscriptions,
automatic retries, request ordering, or protection against stale results from
concurrent operations. Data and error values are stored and returned by reference;
their contents are not cloned or frozen. This is an in-memory example, with no
persistence or framework integration.

## Provenance

Independently implemented from the agreed contract, inspired by the idea of
DataHolder state containers used in OPUS/PSB/Alfa. No business code was copied,
and no business source paths or private data are included.

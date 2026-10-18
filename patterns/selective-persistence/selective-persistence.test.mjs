import test from 'node:test';
import assert from 'node:assert/strict';
import { fulfilledQueries, filterPersistedField, createQueryTransform } from './selective-persistence.mjs';
import { createPersistedApiReducer } from './redux-persist-adapter.mjs';

test('write and restore keep only fulfilled queries, including cleanup of legacy storage', () => {
  let callbacks;
  createQueryTransform((inbound, outbound, options) => {
    callbacks = { inbound, outbound };
    assert.deepEqual(options, { whitelist: ['queries'] });
  });
  const input = Object.freeze({
    ready: Object.freeze({ status: 'fulfilled', data: Object.freeze({ answer: 42 }) }),
    waiting: Object.freeze({ status: 'pending' }),
    failed: Object.freeze({ status: 'rejected' }),
    unused: Object.freeze({ status: 'uninitialized' }),
  });
  for (const callback of Object.values(callbacks)) {
    const filtered = callback(input, 'queries');
    assert.deepEqual(Object.keys(filtered), ['ready']);
    assert.notEqual(filtered, input);
    assert.equal(filtered.ready, input.ready);
    assert.equal(input.waiting.status, 'pending');
    assert.deepEqual(callback(JSON.parse(JSON.stringify(input)), 'queries'), filtered);
  }
});

test('unrelated keys pass through by identity, regardless of value shape', () => {
  for (const key of ['config', 'mutations', 'other', '__proto__', undefined]) {
    for (const value of [null, undefined, 1, 'text', [], { queries: { pending: { status: 'pending' } } }]) {
      assert.equal(filterPersistedField(value, key), value);
    }
  }
});

test('malformed maps become fresh empty records', () => {
  for (const value of [null, undefined, [], [ { status: 'fulfilled' } ], true, 3, 'text', () => {}, new Date(), new Map(), Object.create({})]) {
    const result = fulfilledQueries(value);
    assert.deepEqual(result, {});
    assert.notEqual(result, fulfilledQueries(value));
  }
});

test('malformed entries and non-fulfilled statuses are dropped', () => {
  const entries = [null, undefined, [], true, 3, 'fulfilled', {},
    { status: null }, { status: 'FULFILLED' }, { status: new String('fulfilled') },
    Object.assign(new Date(), { status: 'fulfilled' }), Object.create({ status: 'fulfilled' })];
  assert.deepEqual(fulfilledQueries(Object.fromEntries(entries.map((value, index) => [index, value]))), {});
});

test('supports null-prototype maps and entries and preserves special keys through JSON', () => {
  const entry = Object.assign(Object.create(null), { status: 'fulfilled', data: 7 });
  const input = Object.create(null);
  for (const key of ['__proto__', 'constructor', 'prototype', 'toString', '']) input[key] = entry;
  const result = fulfilledQueries(Object.freeze(input));
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.deepEqual(Object.keys(result), Object.keys(input));
  for (const key of Object.keys(input)) {
    assert.equal(Object.hasOwn(result, key), true);
    assert.equal(result[key], entry);
  }
  const restored = fulfilledQueries(JSON.parse(JSON.stringify(result)));
  assert.deepEqual(Object.keys(restored), Object.keys(input));
  assert.equal(Object.getPrototypeOf(restored), Object.prototype);
  assert.equal(Object.hasOwn({}, 'data'), false);
});

test('ignores inherited, symbol, non-enumerable and accessor map entries without calling getters', () => {
  const input = { good: { status: 'fulfilled' } };
  Object.defineProperty(input, 'hidden', { value: input.good });
  Object.defineProperty(input, 'getter', { enumerable: true, get() { throw new Error('must not run'); } });
  input[Symbol('query')] = input.good;
  input.accessorStatus = Object.defineProperty({}, 'status', { get() { throw new Error('must not run'); } });
  assert.deepEqual(fulfilledQueries(input), { good: input.good });
  // A custom-prototype map is rejected, including its own entries.
  assert.deepEqual(fulfilledQueries(Object.assign(Object.create({ inherited: input.good }), { own: input.good })), {});
});

test('filter is idempotent and does not interpret a value as a Redux root', () => {
  const map = { good: { status: 'fulfilled' }, bad: { status: 'pending' } };
  const once = fulfilledQueries(map);
  assert.deepEqual(fulfilledQueries(once), once);
  assert.deepEqual(filterPersistedField({ queries: map }, 'queries'), {});
});

test('adapter persists only the supplied API reducer and whitelists queries/config', () => {
  const api = { reducerPath: 'sampleApi', reducer: () => {} };
  const storage = {};
  const transform = {};
  const persistedReducer = () => {};
  let calls = 0;
  const result = createPersistedApiReducer({
    api,
    storage,
    createTransform(inbound, outbound, options) {
      assert.equal(inbound, filterPersistedField);
      assert.equal(outbound, filterPersistedField);
      assert.deepEqual(options.whitelist, ['queries']);
      return transform;
    },
    persistReducer(config, reducer) {
      calls += 1;
      assert.equal(reducer, api.reducer);
      assert.deepEqual(config, {
        key: api.reducerPath, storage, version: 1,
        whitelist: ['queries', 'config'], transforms: [transform],
      });
      return persistedReducer;
    },
  });
  assert.equal(calls, 1);
  assert.equal(result, persistedReducer);
});

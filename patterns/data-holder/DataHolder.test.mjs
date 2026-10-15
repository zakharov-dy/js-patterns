import assert from 'node:assert/strict';
import test from 'node:test';
import { DataHolder } from './DataHolder.mjs';

function assertHolder(holder, state, data = undefined, error = undefined) {
  assert.equal(holder.state, state);
  assert.equal(holder.hasData, data !== undefined);
  assert.strictEqual(holder.data, data);
  assert.strictEqual(holder.error, error);
}

test('starts idle without data or an error', () => {
  assertHolder(new DataHolder(), 'idle');
});

for (const value of [0, false, '', [], null]) {
  test(`accepts ${JSON.stringify(value)} as data and clears an earlier error`, () => {
    const holder = new DataHolder();
    holder.setError(new Error('First attempt failed'));
    holder.setData(value);
    assertHolder(holder, 'ready', value);
  });
}

test('starts loading without data and clears an earlier error', () => {
  const holder = new DataHolder();
  holder.startLoading();
  assertHolder(holder, 'loading');
  holder.setError(new Error('First attempt failed'));
  holder.startLoading();
  assertHolder(holder, 'loading');
});

test('retains cached data while loading, including on repeated calls', () => {
  const holder = new DataHolder();
  const data = { count: 0 };
  holder.setData(data);
  holder.startLoading();
  assertHolder(holder, 'loading', data);
  holder.startLoading();
  assertHolder(holder, 'loading', data);
});

test('records a first-load error without data and recovers on success', () => {
  const holder = new DataHolder();
  const error = new Error('First attempt failed');
  holder.startLoading();
  holder.setError(error);
  assertHolder(holder, 'error', undefined, error);
  holder.setData('Recovered');
  assertHolder(holder, 'ready', 'Recovered');
});

test('retains cached data on refresh errors and replaces it after recovery', () => {
  const holder = new DataHolder();
  const error = new Error('Refresh failed');
  holder.setData(false);
  holder.startLoading();
  holder.setError(error);
  assertHolder(holder, 'error', false, error);
  holder.startLoading();
  assertHolder(holder, 'loading', false);
  holder.setData(0);
  assertHolder(holder, 'ready', 0);
});

test('stores error arguments verbatim, including null and undefined', () => {
  const holder = new DataHolder();
  holder.setData(null);
  for (const error of [new Error('Failure'), 'Failure', { code: 1 }, 0, false, null, undefined]) {
    holder.setError(error);
    assertHolder(holder, 'error', null, error);
  }
});

const scenarios = [
  ['idle', () => {}],
  ['loading without data', holder => holder.startLoading()],
  ['loading with data', holder => { holder.setData(null); holder.startLoading(); }],
  ['ready', holder => holder.setData(0)],
  ['error without data', holder => holder.setError(new Error('Failure'))],
  ['error with data', holder => { holder.setData(false); holder.setError(new Error('Failure')); }],
];

for (const [name, prepare] of scenarios) {
  test(`reset clears everything from ${name} and permits reuse`, () => {
    const holder = new DataHolder();
    prepare(holder);
    holder.reset();
    assertHolder(holder, 'idle');
    holder.setData('Reused');
    assertHolder(holder, 'ready', 'Reused');
  });

  test(`rejects undefined without changing ${name}`, () => {
    const holder = new DataHolder();
    prepare(holder);
    const { state, data, error } = holder;
    assert.throws(() => holder.setData(undefined), TypeError);
    assertHolder(holder, state, data, error);
  });
}

test('public fields are read-only and instances do not share state', () => {
  const holder = new DataHolder();
  holder.setData(false);
  const error = new Error('Failure');
  holder.setError(error);
  for (const [key, value] of Object.entries({ state: 'ready', hasData: false, data: undefined, error: null })) {
    assert.throws(() => { holder[key] = value; }, TypeError);
    assertHolder(holder, 'error', false, error);
  }
  assertHolder(new DataHolder(), 'idle');
});

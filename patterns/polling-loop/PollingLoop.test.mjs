import test from 'node:test';
import assert from 'node:assert/strict';
import { PollingLoop } from './PollingLoop.mjs';

// Flush the bounded microtask chain; never wait for wall-clock time.
async function flush() {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function clock() {
  let now = 0, nextId = 0;
  const timers = new Map();
  return {
    timers,
    setTimeoutFn(fn, delay) {
      const id = nextId++;
      timers.set(id, { fn, at: now + delay });
      return id;
    },
    clearTimeoutFn(id) { timers.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) { timers.delete(id); timer.fn(); }
      }
    },
  };
}
function setup(options = {}) {
  const time = clock(), values = [], errors = [];
  const loop = new PollingLoop({ task: () => 1, intervalMs: 10,
    onValue: value => values.push(value), onError: error => errors.push(error),
    ...time, ...options });
  return { loop, time, values, errors };
}

test('validates all required functions, timers, and interval', () => {
  const valid = { task() {}, intervalMs: 0, onValue() {}, onError() {} };
  for (const key of ['task', 'onValue', 'onError', 'setTimeoutFn', 'clearTimeoutFn']) {
    for (const value of [null, 1, {}, 'fn']) {
      assert.throws(() => new PollingLoop({ ...valid, [key]: value }), TypeError);
    }
  }
  for (const intervalMs of [undefined, null, -1, NaN, Infinity, -Infinity, '0']) {
    assert.throws(() => new PollingLoop({ ...valid, intervalMs }), TypeError);
  }
  assert.throws(() => new PollingLoop(), TypeError);
  assert.throws(() => new PollingLoop(null), TypeError);
  assert.doesNotThrow(() => new PollingLoop(valid));
});

test('initial state, read-only running, idempotence, and microtask start', async () => {
  let calls = 0;
  const { loop, time } = setup({ task: () => ++calls });
  assert.equal(loop.running, false);
  assert.throws(() => { loop.running = true; }, TypeError);
  loop.stop(); loop.start(); loop.start();
  assert.equal(loop.running, true);
  assert.equal(calls, 0);
  await flush();
  assert.equal(calls, 1);
  assert.equal(time.timers.size, 1);
  loop.start();
  assert.equal(time.timers.size, 1);
  loop.stop(); loop.stop();
  assert.equal(time.timers.size, 0);
  time.advance(100); await flush();
  assert.equal(calls, 1);
});

test('stop before the first microtask prevents invocation; restart runs once', async () => {
  let calls = 0;
  const { loop } = setup({ task: () => ++calls });
  loop.start(); loop.stop();
  await flush();
  assert.equal(calls, 0);
  loop.start(); loop.stop(); loop.start();
  await flush();
  assert.equal(calls, 1);
  loop.stop();
});

test('no overlap and delay starts after settlement and callback return', async () => {
  const pending = deferred();
  let calls = 0, active = 0, maximum = 0;
  const { loop, time, values } = setup({
    task: () => {
      calls++; active++; maximum = Math.max(maximum, active);
      return pending.promise.then(value => { active--; return value; });
    },
    onValue: value => { values.push(value); time.advance(7); assert.equal(time.timers.size, 0); },
  });
  loop.start(); await flush();
  time.advance(1000); await flush();
  assert.equal(calls, 1);
  assert.equal(time.timers.size, 0);
  pending.resolve('ready'); await flush();
  assert.deepEqual(values, ['ready']);
  time.advance(9); await flush(); assert.equal(calls, 1);
  time.advance(1); await flush(); assert.equal(calls, 2);
  assert.equal(maximum, 1);
  loop.stop();
});

for (const outcome of ['resolve', 'reject']) {
  for (const restart of [false, true]) {
    test(`stale ${outcome} suppressed${restart ? ' across restart, which waits then starts promptly' : ' after stop'}`, async () => {
      const pending = deferred();
      let calls = 0;
      const { loop, time, values, errors } = setup({ task: () => ++calls === 1 ? pending.promise : 'fresh' });
      loop.start(); await flush();
      loop.stop();
      if (restart) { loop.start(); loop.start(); }
      time.advance(100); await flush();
      assert.equal(calls, 1);
      pending[outcome]('stale'); await flush();
      assert.deepEqual(values, restart ? ['fresh'] : []);
      assert.deepEqual(errors, []);
      assert.equal(calls, restart ? 2 : 1);
      assert.equal(time.timers.size, restart ? 1 : 0);
      loop.stop();
    });
  }
}

test('sync throws and non-Error rejections are delivered unchanged and polling continues', async () => {
  const reasons = [new Error('sync'), undefined, null, 0, { reason: 'rejected' }];
  let calls = 0;
  const { loop, time, errors, values } = setup({ task: () => {
    const index = calls++;
    if (index === 0) throw reasons[0];
    if (index < reasons.length) return Promise.reject(reasons[index]);
    return 'recovered';
  } });
  loop.start(); await flush();
  for (let i = 0; i < reasons.length; i++) { time.advance(10); await flush(); }
  assert.deepEqual(errors, reasons);
  reasons.forEach((reason, i) => assert.equal(errors[i], reason));
  assert.deepEqual(values, ['recovered']);
  loop.stop();
});

test('every successful falsy result is delivered exactly once, including at zero interval', async () => {
  const results = [undefined, null, false, 0, '', NaN];
  let calls = 0;
  const { loop, time, values, errors } = setup({ intervalMs: 0, task: () => results[calls++] });
  loop.start(); await flush();
  for (let i = 1; i < results.length; i++) { time.advance(0); await flush(); }
  assert.deepEqual(values, results);
  assert.deepEqual(errors, []);
  assert.equal(calls, results.length);
  loop.stop();
});

for (const callback of ['onValue', 'onError']) {
  test(`${callback} exception stops polling and is swallowed without error redelivery`, async () => {
    let deliveries = 0;
    const { loop, time, errors } = setup({
      task: () => callback === 'onError' ? Promise.reject('failure') : 'value',
      [callback]: () => { deliveries++; throw new Error('callback'); },
    });
    loop.start(); await flush();
    assert.equal(loop.running, false);
    assert.equal(deliveries, 1);
    assert.deepEqual(errors, []);
    assert.equal(time.timers.size, 0);
  });
  for (const restart of [false, true]) {
    test(`${callback} may stop${restart ? '/start: replacement starts after callback without stale timer' : ''}`, async () => {
      let calls = 0, deliveries = 0, inCallback = false;
      const { loop, time } = setup({ task: () => {
        assert.equal(inCallback, false);
        calls++;
        if (callback === 'onError') throw 'failure';
        return calls;
      }, [callback]: () => {
        inCallback = true;
        deliveries++;
        if (deliveries === 1) {
          loop.stop();
          if (restart) loop.start();
          assert.equal(calls, 1);
          assert.equal(time.timers.size, 0);
        }
        inCallback = false;
      } });
      loop.start(); await flush();
      assert.equal(calls, restart ? 2 : 1);
      assert.equal(deliveries, calls);
      assert.equal(time.timers.size, restart ? 1 : 0);
      loop.stop();
    });
  }
}

test('callback throwing after stop/start also stops the replacement run', async () => {
  let calls = 0;
  const { loop, time } = setup({ task: () => ++calls, onValue: () => {
    loop.stop(); loop.start(); throw 'callback';
  } });
  loop.start(); await flush();
  assert.equal(calls, 1);
  assert.equal(loop.running, false);
  assert.equal(time.timers.size, 0);
});

test('task can reentrantly stop/start without releasing its physical slot', async () => {
  const pending = deferred();
  let calls = 0;
  const { loop, values } = setup({ task: () => {
    if (++calls === 1) { loop.stop(); loop.start(); return pending.promise; }
    return 'fresh';
  } });
  loop.start(); await flush();
  assert.equal(calls, 1);
  pending.resolve('stale'); await flush();
  assert.equal(calls, 2);
  assert.deepEqual(values, ['fresh']);
  loop.stop();
});

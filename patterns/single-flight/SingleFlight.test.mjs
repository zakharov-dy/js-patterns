import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { SingleFlight } from './SingleFlight.mjs';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((fulfill, fail) => {
    resolve = fulfill;
    reject = fail;
  });
  return { promise, resolve, reject };
}

test('concurrent callers get the exact Promise and only the first task runs', async () => {
  const flight = new SingleFlight();
  const gate = deferred();
  let calls = 0;
  const first = flight.run('key', () => {
    calls += 1;
    return gate.promise;
  });
  assert.ok(first instanceof Promise);
  const callers = Array.from({ length: 20 }, () => flight.run('key', () => {
    assert.fail('a duplicate task ran');
  }));
  callers.forEach((promise) => assert.strictEqual(promise, first));
  assert.equal(calls, 0);
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.strictEqual(flight.run('key', () => assert.fail('pending duplicate')), first);
  const value = {};
  gate.resolve(value);
  for (const result of await Promise.all([first, ...callers])) {
    assert.strictEqual(result, value);
  }
});

test('registration precedes task execution in a microtask', async () => {
  const flight = new SingleFlight();
  let started = false;
  const first = flight.run('key', () => {
    started = true;
    assert.strictEqual(flight.run('key', () => assert.fail('reentrant duplicate')), first);
    return 7;
  });
  assert.equal(started, false);
  assert.equal(await first, 7);
  assert.equal(started, true);
});

test('different keys progress independently', async () => {
  const flight = new SingleFlight();
  const gate = deferred();
  const slow = flight.run('slow', () => gate.promise);
  const fast = flight.run('fast', () => 'done');
  assert.notStrictEqual(slow, fast);
  assert.equal(await fast, 'done');
  assert.strictEqual(flight.run('slow', () => assert.fail('duplicate')), slow);
  gate.resolve('later');
  assert.equal(await slow, 'later');
});

test('falsy keys are distinct and each deduplicates', async () => {
  const flight = new SingleFlight();
  const keys = [undefined, null, 0, false, ''];
  const promises = keys.map((key) => flight.run(key, () => key));
  assert.equal(new Set(promises).size, keys.length);
  keys.forEach((key, index) => {
    assert.strictEqual(flight.run(key, () => assert.fail('duplicate')), promises[index]);
  });
  assert.deepEqual(await Promise.all(promises), keys);
});

test('keys use Map identity including objects, NaN and signed zero', async () => {
  const flight = new SingleFlight();
  const left = {};
  const right = {};
  const first = flight.run(left, () => left);
  const second = flight.run(right, () => right);
  assert.notStrictEqual(first, second);
  assert.strictEqual(flight.run(left, () => null), first);
  const nan = flight.run(NaN, () => 'nan');
  assert.strictEqual(flight.run(Number('invalid'), () => null), nan);
  const zero = flight.run(0, () => 'zero');
  assert.strictEqual(flight.run(-0, () => null), zero);
  assert.deepEqual(await Promise.all([first, second, nan, zero]), [left, right, 'nan', 'zero']);
});

test('fulfillment preserves undefined, null and other falsy values without caching', async () => {
  const flight = new SingleFlight();
  for (const value of [undefined, null, false, 0, '', NaN]) {
    const first = flight.run('key', () => value);
    assert.ok(Object.is(await first, value));
    const next = flight.run('key', () => 'fresh');
    assert.notStrictEqual(next, first);
    assert.equal(await next, 'fresh');
  }
});

test('rejection preserves the exact reason and releases the key', async () => {
  const flight = new SingleFlight();
  for (const reason of [new Error('failure'), {}, undefined, null, false, 0, '']) {
    const gate = deferred();
    const first = flight.run('key', () => gate.promise);
    assert.strictEqual(flight.run('key', () => assert.fail('duplicate')), first);
    const checked = first.then(
      () => assert.fail('expected rejection'),
      (actual) => assert.strictEqual(actual, reason),
    );
    gate.reject(reason);
    await checked;
    const next = flight.run('key', () => 'recovered');
    assert.notStrictEqual(next, first);
    assert.equal(await next, 'recovered');
  }
});

test('synchronous throws become exact rejections and allow recovery', async () => {
  const flight = new SingleFlight();
  for (const reason of [new Error('sync'), undefined, null, false, 0, '']) {
    let first;
    assert.doesNotThrow(() => {
      first = flight.run('key', () => { throw reason; });
    });
    await first.then(
      () => assert.fail('expected rejection'),
      (actual) => assert.strictEqual(actual, reason),
    );
    const next = flight.run('key', () => 'fresh');
    assert.notStrictEqual(next, first);
    assert.equal(await next, 'fresh');
  }
});

test('invalid tasks throw synchronously, even while the key is in flight', async () => {
  const flight = new SingleFlight();
  const invalidTasks = [undefined, null, false, 0, '', {}, Promise.resolve(1)];
  for (const task of invalidTasks) {
    assert.throws(() => flight.run('key', task), TypeError);
  }
  const first = flight.run('key', () => 'valid');
  for (const task of invalidTasks) {
    assert.throws(() => flight.run('key', task), TypeError);
  }
  assert.strictEqual(flight.run('key', () => assert.fail('duplicate')), first);
  assert.equal(await first, 'valid');
});

test('instances do not share in-flight operations', async () => {
  const first = new SingleFlight().run('key', () => 1);
  const second = new SingleFlight().run('key', () => 2);
  assert.notStrictEqual(first, second);
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
});

test('handled failures create no unhandled rejection from cleanup in a child process', () => {
  const moduleUrl = new URL('./SingleFlight.mjs', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--unhandled-rejections=strict', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { SingleFlight } from ${JSON.stringify(moduleUrl)};
    const flight = new SingleFlight();
    const unhandled = [];
    process.on('unhandledRejection', (reason) => unhandled.push(reason));
    for (const task of [() => Promise.reject('async failure'), () => { throw 'sync failure'; }]) {
      const pending = flight.run('key', task);
      assert.strictEqual(flight.run('key', () => 'duplicate'), pending);
      await pending.catch(() => {});
      assert.equal(await flight.run('key', () => 'recovered'), 'recovered');
    }
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
    console.log('cleanup verified');
  `], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.signal, null);
  assert.equal(child.stderr, '');
  assert.match(child.stdout, /cleanup verified/);
});

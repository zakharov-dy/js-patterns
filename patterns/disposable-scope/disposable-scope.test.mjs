import assert from 'node:assert/strict';
import test from 'node:test';
import { DisposableScope } from './disposable-scope.mjs';

test('releases in LIFO order and closes before invoking callbacks', () => {
  const scope = new DisposableScope();
  const calls = [];
  assert.equal(scope.disposed, false);
  scope.add(() => calls.push('first'));
  scope.add(function () {
    assert.equal(this, undefined);
    assert.equal(scope.disposed, true);
    calls.push('second');
    scope.dispose();
  });
  scope.dispose();
  scope.dispose();
  assert.deepEqual(calls, ['second', 'first']);
});

test('empty disposal is idempotent and late callbacks run immediately', () => {
  const scope = new DisposableScope();
  scope.dispose();
  scope.dispose();
  let calls = 0;
  scope.add(() => calls++);
  assert.equal(calls, 1);
  scope.dispose();
  assert.equal(calls, 1);
});

test('attempts all callbacks and aggregates arbitrary thrown values in release order', () => {
  const scope = new DisposableScope();
  const failure = new Error('cleanup');
  const calls = [];
  scope.add(() => calls.push('oldest'));
  scope.add(() => { throw failure; });
  scope.add(() => calls.push('middle'));
  scope.add(() => { throw null; });
  assert.throws(() => scope.dispose(), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [null, failure]);
    return true;
  });
  assert.deepEqual(calls, ['middle', 'oldest']);
  assert.equal(scope.disposed, true);
  assert.doesNotThrow(() => scope.dispose());
});

test('late failures are aggregated synchronously without reopening the scope', () => {
  const scope = new DisposableScope();
  scope.dispose();
  const failure = new Error('late');
  assert.throws(() => scope.add(() => { throw failure; }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [failure]);
    return true;
  });
  assert.doesNotThrow(() => scope.dispose());
});

test('registration during disposal runs immediately and failures do not stop remaining work', () => {
  const scope = new DisposableScope();
  const calls = [];
  const failure = new Error('nested');
  scope.add(() => calls.push('oldest'));
  scope.add(() => {
    calls.push('outer');
    scope.add(() => calls.push('late'));
    scope.add(() => { throw failure; });
  });
  assert.throws(() => scope.dispose(), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors[0].errors, [failure]);
    return true;
  });
  assert.deepEqual(calls, ['outer', 'late', 'oldest']);
});

for (const method of ['unsubscribe', 'remove']) {
  test(`${method} supports inherited methods, captures them, and preserves this`, () => {
    class Subscription {
      calls = 0;
      [method]() { this.calls++; }
    }
    const subscription = new Subscription();
    subscription.hasOwnProperty = null;
    const scope = new DisposableScope();
    scope.addSubscription(subscription, method);
    subscription[method] = () => assert.fail('Must use captured method');
    scope.dispose();
    scope.dispose();
    assert.equal(subscription.calls, 1);
  });
}

test('explicit selection handles ambiguous objects and null prototypes', () => {
  const calls = [];
  const subscription = Object.assign(Object.create(null), {
    unsubscribe() { calls.push('unsubscribe'); },
    remove() { calls.push('remove'); },
  });
  const scope = new DisposableScope();
  scope.addSubscription(subscription, 'remove');
  scope.dispose();
  scope.addSubscription(subscription, 'unsubscribe');
  assert.deepEqual(calls, ['remove', 'unsubscribe']);
});

test('subscription failures are aggregated and other resources still release', () => {
  const scope = new DisposableScope();
  const failure = new Error('subscription');
  let released = false;
  scope.add(() => { released = true; });
  scope.addSubscription({ remove() { throw failure; } }, 'remove');
  assert.throws(() => scope.dispose(), (error) => {
    assert.deepEqual(error.errors, [failure]);
    return true;
  });
  assert.equal(released, true);
});

test('invalid inputs throw TypeError before and after disposal without registering work', () => {
  const scope = new DisposableScope();
  for (const closed of [false, true]) {
    if (closed) scope.dispose();
    for (const invalid of [null, undefined, false, 0, 'callback', {}, []]) {
      assert.throws(() => scope.add(invalid), TypeError);
      assert.throws(() => scope.addSubscription(invalid, 'remove'), TypeError);
    }
    for (const method of [undefined, null, 'dispose', '', Symbol('remove')]) {
      assert.throws(() => scope.addSubscription({ remove() {} }, method), TypeError);
    }
    for (const remove of [undefined, null, true, 'method']) {
      assert.throws(() => scope.addSubscription({ remove }, 'remove'), TypeError);
    }
  }
  assert.doesNotThrow(() => scope.dispose());
});

test('method lookup errors propagate at registration and do not corrupt the scope', () => {
  const scope = new DisposableScope();
  const failure = new Error('getter');
  assert.throws(() => scope.addSubscription({
    get unsubscribe() { throw failure; },
  }, 'unsubscribe'), (error) => error === failure);
  assert.doesNotThrow(() => scope.dispose());
});

test('each registration is owned separately, including duplicate callbacks', () => {
  const scope = new DisposableScope();
  let calls = 0;
  const callback = () => calls++;
  scope.add(callback);
  scope.add(callback);
  scope.dispose();
  assert.equal(calls, 2);
});

import assert from 'node:assert/strict';
import { SingleFlight } from './SingleFlight.mjs';

const flight = new SingleFlight();
let executions = 0;
const calculate = () => {
  executions += 1;
  return 42;
};

const first = flight.run('calculation', calculate);
const shared = flight.run('calculation', calculate);
assert.strictEqual(first, shared);
assert.equal(executions, 0); // Tasks start in a microtask.
assert.deepEqual(await Promise.all([first, shared]), [42, 42]);
assert.equal(executions, 1);

const fresh = flight.run('calculation', calculate);
assert.notStrictEqual(fresh, first);
assert.equal(await fresh, 42);
assert.equal(executions, 2);
console.log('Shared one pending calculation; a later call ran afresh.');

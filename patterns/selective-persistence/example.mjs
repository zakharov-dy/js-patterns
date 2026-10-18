import assert from 'node:assert/strict';
import { filterPersistedField } from './selective-persistence.mjs';

const liveQueries = {
  'item(1)': { status: 'fulfilled', data: { title: 'Sample' } },
  'item(2)': { status: 'pending', requestId: 'in-flight' },
  'item(3)': { status: 'rejected', error: 'Unavailable' },
};
const storedText = JSON.stringify(filterPersistedField(liveQueries, 'queries'));
console.log('Saved:', storedText);

// Older storage may contain requests that will never finish after a restart.
const legacyText = '{"item(1)":{"status":"fulfilled","data":{"title":"Sample"}},"item(2)":{"status":"pending"}}';
const restored = filterPersistedField(JSON.parse(legacyText), 'queries');
assert.deepEqual(Object.keys(restored), ['item(1)']);
assert.equal(liveQueries['item(2)'].status, 'pending');
console.log('Restored:', JSON.stringify(restored));

const config = { online: true };
assert.equal(filterPersistedField(config, 'config'), config);
console.log('Config passes through unchanged.');

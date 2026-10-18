import { PollingLoop } from './PollingLoop.mjs';

let attempt = 0;
const loop = new PollingLoop({
  intervalMs: 20,
  async task() {
    attempt += 1;
    if (attempt === 2) throw new Error('Temporary failure');
    return { attempt, status: 'ready' };
  },
  onValue(value) {
    console.log('Value:', value);
    if (attempt === 3) loop.stop();
  },
  onError(error) { console.log('Retrying after:', error.message); },
});
loop.start();

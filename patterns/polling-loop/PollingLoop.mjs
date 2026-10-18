/** Sequential, settlement-relative polling. stop() does not cancel a pending task. */
export class PollingLoop {
  #task;
  #intervalMs;
  #onValue;
  #onError;
  #setTimeout;
  #clearTimeout;
  #running = false;
  #generation = 0;
  #busy = false;
  #timer = null;

  constructor({ task, intervalMs, onValue, onError,
    setTimeoutFn = globalThis.setTimeout,
    clearTimeoutFn = globalThis.clearTimeout } = {}) {
    for (const [name, fn] of Object.entries({ task, onValue, onError, setTimeoutFn, clearTimeoutFn })) {
      if (typeof fn !== 'function') throw new TypeError(`${name} must be a function`);
    }
    if (typeof intervalMs !== 'number' || !Number.isFinite(intervalMs) || intervalMs < 0) {
      throw new TypeError('intervalMs must be a finite nonnegative number');
    }
    this.#task = task;
    this.#intervalMs = intervalMs;
    this.#onValue = onValue;
    this.#onError = onError;
    this.#setTimeout = setTimeoutFn;
    this.#clearTimeout = clearTimeoutFn;
  }

  get running() { return this.#running; }

  start() {
    if (this.#running) return;
    this.#running = true;
    this.#generation += 1;
    if (!this.#busy) this.#enqueue();
  }

  stop() {
    this.#running = false;
    if (this.#timer !== null) {
      this.#clearTimeout(this.#timer.id);
      this.#timer = null;
    }
  }

  #enqueue() {
    const generation = this.#generation;
    // Reserve the slot before the microtask so repeated starts cannot overlap.
    this.#busy = true;
    queueMicrotask(() => { void this.#operate(generation); });
  }

  #isCurrent(generation) {
    return this.#running && generation === this.#generation;
  }

  async #operate(generation) {
    if (this.#isCurrent(generation)) {
      let value;
      let failed = false;
      try {
        value = await this.#task();
      } catch (error) {
        failed = true;
        value = error;
      }
      if (this.#isCurrent(generation)) {
        try {
          if (failed) this.#onError(value);
          else this.#onValue(value);
        } catch {
          // Callback exceptions are terminal and intentionally swallowed.
          this.stop();
        }
      }
    }
    this.#busy = false;
    if (!this.#running) return;
    if (generation !== this.#generation) {
      this.#enqueue();
    } else {
      this.#timer = { id: this.#setTimeout(() => {
        this.#timer = null;
        if (this.#isCurrent(generation)) this.#enqueue();
      }, this.#intervalMs) };
    }
  }
}

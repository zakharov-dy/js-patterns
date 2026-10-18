/** Owns a group of synchronous cleanup callbacks. */
export class DisposableScope {
  #callbacks = [];
  #disposed = false;

  get disposed() {
    return this.#disposed;
  }

  /** Register a callback, or run it immediately if the scope is closed. */
  add(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('A cleanup callback must be a function');
    }

    if (this.#disposed) {
      try {
        callback();
      } catch (error) {
        throw new AggregateError([error], 'Late cleanup failed');
      }
      return;
    }

    this.#callbacks.push(callback);
  }

  /** Capture an explicitly selected subscription method and its receiver. */
  addSubscription(subscription, method) {
    if (method !== 'unsubscribe' && method !== 'remove') {
      throw new TypeError('Select unsubscribe or remove explicitly');
    }
    if (subscription === null ||
        (typeof subscription !== 'object' && typeof subscription !== 'function')) {
      throw new TypeError('A subscription must be an object or function');
    }

    const cleanup = subscription[method];
    if (typeof cleanup !== 'function') {
      throw new TypeError('The selected subscription method must be a function');
    }

    this.add(() => Reflect.apply(cleanup, subscription, []));
  }

  /** Close once, attempt every callback in reverse order, then report errors. */
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;

    const errors = [];
    while (this.#callbacks.length > 0) {
      const callback = this.#callbacks.pop();
      try {
        callback();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, 'Scope cleanup failed');
    }
  }
}

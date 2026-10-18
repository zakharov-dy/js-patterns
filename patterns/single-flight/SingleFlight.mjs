/** Share one pending operation per key within this instance. */
export class SingleFlight {
  #inFlight = new Map();

  run(key, task) {
    if (typeof task !== 'function') {
      throw new TypeError('task must be a function');
    }

    if (this.#inFlight.has(key)) {
      return this.#inFlight.get(key);
    }

    const promise = Promise.resolve().then(() => task()).then(
      (value) => {
        this.#inFlight.delete(key);
        return value;
      },
      (reason) => {
        this.#inFlight.delete(key);
        throw reason;
      },
    );
    this.#inFlight.set(key, promise);
    return promise;
  }
}

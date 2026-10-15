export class DataHolder {
  #state = 'idle';
  #data = undefined;
  #error = undefined;

  get state() {
    return this.#state;
  }

  get hasData() {
    return this.#data !== undefined;
  }

  get data() {
    return this.#data;
  }

  get error() {
    return this.#error;
  }

  startLoading() {
    this.#state = 'loading';
    this.#error = undefined;
  }

  setData(value) {
    if (value === undefined) {
      throw new TypeError('DataHolder data must not be undefined');
    }

    this.#data = value;
    this.#state = 'ready';
    this.#error = undefined;
  }

  setError(error) {
    this.#state = 'error';
    this.#error = error;
  }

  reset() {
    this.#state = 'idle';
    this.#data = undefined;
    this.#error = undefined;
  }
}

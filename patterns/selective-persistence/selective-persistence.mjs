/** Accept JSON-style records, including dictionaries with a null prototype. */
function isRecord(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Keep own, enumerable query entries with an own data status of "fulfilled".
 * Invalid maps become empty maps; invalid entries are discarded.
 * This is a shallow filter: retained entries are shared, never modified.
 */
export function fulfilledQueries(queries) {
  const result = {};
  if (!isRecord(queries)) return result;

  for (const key of Object.keys(queries)) {
    const descriptor = Object.getOwnPropertyDescriptor(queries, key);
    // Ignore accessors rather than executing them during persistence.
    if (!Object.hasOwn(descriptor, 'value')) continue;
    const entry = descriptor.value;
    if (!isRecord(entry)) continue;
    const status = Object.getOwnPropertyDescriptor(entry, 'status');
    if (!status || !Object.hasOwn(status, 'value') || status.value !== 'fulfilled') continue;

    // Defining a data property also treats "__proto__" as an ordinary query key.
    Object.defineProperty(result, key, {
      value: entry,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

/** Redux Persist transforms receive a slice field's value, not the root state. */
export function filterPersistedField(value, key) {
  return key === 'queries' ? fulfilledQueries(value) : value;
}

/** Inject Redux Persist's createTransform; this module has no runtime dependencies. */
export function createQueryTransform(createTransform) {
  return createTransform(filterPersistedField, filterPersistedField, {
    whitelist: ['queries'],
  });
}

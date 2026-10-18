import { createQueryTransform } from './selective-persistence.mjs';

/**
 * Supply the real Redux Persist functions, storage, and an RTK Query API slice.
 * Mount the returned reducer at api.reducerPath in your existing store.
 */
export function createPersistedApiReducer({ api, storage, persistReducer, createTransform }) {
  return persistReducer(
    {
      key: api.reducerPath,
      storage,
      version: 1,
      whitelist: ['queries', 'config'],
      transforms: [createQueryTransform(createTransform)],
    },
    api.reducer,
  );
}

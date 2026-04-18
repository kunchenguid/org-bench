type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function createStorageKey(namespace: string, key: string): string {
  return `${namespace}:${key}`;
}

export function loadPersistedGameState<T>(
  storage: StorageLike,
  namespace: string,
  key: string,
): T | null {
  const rawValue = storage.getItem(createStorageKey(namespace, key));

  if (rawValue === null) {
    return null;
  }

  return JSON.parse(rawValue) as T;
}

export function savePersistedGameState<T>(
  storage: StorageLike,
  namespace: string,
  key: string,
  state: T,
): void {
  storage.setItem(createStorageKey(namespace, key), JSON.stringify(state));
}

export function clearPersistedGameState(
  storage: StorageLike,
  namespace: string,
  key: string,
): void {
  storage.removeItem(createStorageKey(namespace, key));
}

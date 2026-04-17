type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type NamespacedLocalStore = {
  load: <T>(key: string, fallback: T) => T;
  save: <T>(key: string, value: T) => void;
  remove: (key: string) => void;
};

const getNamespacedKey = (namespace: string, key: string) => `${namespace}:${key}`;

export function createNamespacedLocalStore(
  namespace: string,
  storage: StorageLike = window.localStorage,
): NamespacedLocalStore {
  return {
    load(key, fallback) {
      const value = storage.getItem(getNamespacedKey(namespace, key));

      if (value === null) {
        return fallback;
      }

      try {
        return JSON.parse(value) as typeof fallback;
      } catch {
        return fallback;
      }
    },
    save(key, value) {
      storage.setItem(getNamespacedKey(namespace, key), JSON.stringify(value));
    },
    remove(key) {
      storage.removeItem(getNamespacedKey(namespace, key));
    },
  };
}

export { type NamespacedLocalStore, type StorageLike };

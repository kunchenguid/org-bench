export type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type StorageLike = Pick<Storage, 'getItem' | 'key' | 'length' | 'removeItem' | 'setItem'>;

const STORAGE_SCOPE = 'duel-tcg';

function toScopedKey(namespace: string, key: string): string {
  return `${namespace}:${STORAGE_SCOPE}:${key}`;
}

export function createNamespacedStorage(storage: StorageLike, namespace: string) {
  return {
    clear() {
      const prefix = `${namespace}:${STORAGE_SCOPE}:`;
      const keys: string[] = [];

      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(prefix)) {
          keys.push(key);
        }
      }

      for (const key of keys) {
        storage.removeItem(key);
      }
    },
    get<T extends JsonValue>(key: string): T | null {
      const rawValue = storage.getItem(toScopedKey(namespace, key));
      if (rawValue === null) {
        return null;
      }

      return JSON.parse(rawValue) as T;
    },
    remove(key: string) {
      storage.removeItem(toScopedKey(namespace, key));
    },
    set(key: string, value: JsonValue) {
      storage.setItem(toScopedKey(namespace, key), JSON.stringify(value));
    },
  };
}

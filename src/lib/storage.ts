type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type NamespacedStorage = {
  getKey: (key: string) => string;
  getJson: <T extends JsonValue>(key: string) => T | null;
  getText: (key: string) => string | null;
  remove: (key: string) => void;
  setJson: (key: string, value: JsonValue) => void;
  setText: (key: string, value: string) => void;
};

function joinKey(namespace: string, key: string): string {
  return `${namespace}:${key}`;
}

export function createNamespacedStorage(storage: Storage, namespace: string): NamespacedStorage {
  return {
    getKey(key) {
      return joinKey(namespace, key);
    },
    getJson<T extends JsonValue>(key: string) {
      const value = storage.getItem(joinKey(namespace, key));

      if (value === null) {
        return null;
      }

      return JSON.parse(value) as T;
    },
    getText(key) {
      return storage.getItem(joinKey(namespace, key));
    },
    remove(key) {
      storage.removeItem(joinKey(namespace, key));
    },
    setJson(key, value) {
      storage.setItem(joinKey(namespace, key), JSON.stringify(value));
    },
    setText(key, value) {
      storage.setItem(joinKey(namespace, key), value);
    }
  };
}

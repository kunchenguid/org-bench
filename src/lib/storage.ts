export function buildStorageKey(namespace: string, key: string): string {
  return `${namespace}:${key}`;
}

export function loadJson<T>(namespace: string, key: string): T | null {
  const value = globalThis.localStorage.getItem(buildStorageKey(namespace, key));
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function saveJson(namespace: string, key: string, value: unknown): void {
  globalThis.localStorage.setItem(buildStorageKey(namespace, key), JSON.stringify(value));
}

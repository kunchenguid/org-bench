declare global {
  var __DUEL_TCG_STORAGE_NAMESPACE__: string | undefined;
}

const FALLBACK_NAMESPACE = 'duel-tcg';

export function getStorageNamespace(): string {
  return globalThis.__DUEL_TCG_STORAGE_NAMESPACE__ || FALLBACK_NAMESPACE;
}

export function getStorageKey(key: string): string {
  return `${getStorageNamespace()}:${key}`;
}

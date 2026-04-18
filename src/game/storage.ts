declare global {
  interface Window {
    __DUEL_TCG_STORAGE_NAMESPACE__?: string;
  }
}

const DEFAULT_NAMESPACE = 'google-seed-01:';

export function getStorageNamespace() {
  return window.__DUEL_TCG_STORAGE_NAMESPACE__ || DEFAULT_NAMESPACE;
}

export function storageKey(suffix: string) {
  return `${getStorageNamespace()}${suffix}`;
}

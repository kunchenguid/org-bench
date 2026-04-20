function createStorageHelper(options) {
  const settings = options || {};
  const storage = settings.storage || getDefaultStorage();
  const prefix = resolvePrefix(settings);
  const encounterKey = prefix + ':encounter';

  return {
    getPrefix() {
      return prefix;
    },

    saveEncounter(snapshot) {
      if (!storage || !isPlainObject(snapshot)) {
        return false;
      }

      const payload = {
        version: 1,
        savedAt: new Date().toISOString(),
        snapshot,
      };

      try {
        storage.setItem(encounterKey, JSON.stringify(payload));
        return true;
      } catch (_error) {
        return false;
      }
    },

    loadEncounter() {
      if (!storage) {
        return null;
      }

      try {
        const raw = storage.getItem(encounterKey);
        if (!raw) {
          return null;
        }

        const parsed = JSON.parse(raw);
        if (!isPlainObject(parsed) || !isPlainObject(parsed.snapshot)) {
          return null;
        }

        return parsed.snapshot;
      } catch (_error) {
        return null;
      }
    },

    clearEncounter() {
      if (!storage) {
        return false;
      }

      try {
        storage.removeItem(encounterKey);
        return true;
      } catch (_error) {
        return false;
      }
    },
  };
}

function resolvePrefix(settings) {
  const fallbackPrefix = normalizePrefix(settings.fallbackPrefix) || 'duel-tcg';
  const candidates = [];

  candidates.push(settings.namespace);

  if (Array.isArray(settings.namespaceCandidates)) {
    for (const candidate of settings.namespaceCandidates) {
      candidates.push(candidate);
    }
  }

  for (const candidate of getRuntimeNamespaceCandidates()) {
    candidates.push(candidate);
  }

  for (const candidate of candidates) {
    const normalized = normalizePrefix(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return fallbackPrefix;
}

function getRuntimeNamespaceCandidates() {
  if (typeof window === 'undefined') {
    return [];
  }

  const searchParams = typeof window.location === 'object' && typeof window.location.search === 'string'
    ? new URLSearchParams(window.location.search)
    : null;
  const dataset = typeof document === 'object' && document.documentElement
    ? document.documentElement.dataset
    : null;

  return [
    window.__HARNESS_STORAGE_NAMESPACE__,
    window.HARNESS_STORAGE_NAMESPACE,
    dataset && dataset.storageNamespace,
    searchParams && searchParams.get('storageNamespace'),
  ];
}

function getDefaultStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }

  return null;
}

function normalizePrefix(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createStorageHelper };
}

if (typeof window !== 'undefined') {
  window.createStorageHelper = createStorageHelper;
}

function normalizeStorageNamespace(namespace) {
  return namespace.endsWith(':') ? namespace : `${namespace}:`;
}

function createStorageApi(options) {
  const prefix = normalizeStorageNamespace(options.namespace || 'apple-duel');
  const storage = options.storage;

  function key(name) {
    return `${prefix}${name}`;
  }

  return {
    get(name, fallbackValue = null) {
      const raw = storage.getItem(key(name));

      if (raw == null) {
        return fallbackValue;
      }

      try {
        return JSON.parse(raw);
      } catch (error) {
        return fallbackValue;
      }
    },
    set(name, value) {
      storage.setItem(key(name), JSON.stringify(value));
    },
    remove(name) {
      storage.removeItem(key(name));
    },
  };
}

module.exports = {
  createStorageApi,
  normalizeStorageNamespace,
};

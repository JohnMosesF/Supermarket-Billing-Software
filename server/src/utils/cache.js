const cache = new Map();

export function setCache(key, value, ttl = 30000) {
  const expires = Date.now() + ttl;
  cache.set(key, { value, expires });
}

export function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function clearCache() {
  cache.clear();
}

export function deleteCache(key) {
  cache.delete(key);
}

export function cacheStats() {
  return { size: cache.size };
}

export default { setCache, getCache, clearCache, deleteCache, cacheStats };

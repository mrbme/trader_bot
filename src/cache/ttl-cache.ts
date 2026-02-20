type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export class TtlCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  get = (key: string): T | null => {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  };

  set = (key: string, value: T): void => {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  };

  has = (key: string): boolean => this.get(key) !== null;

  clear = (): void => {
    this.cache.clear();
  };

  size = (): number => {
    this.evictExpired();
    return this.cache.size;
  };

  private evictExpired = (): void => {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  };
}

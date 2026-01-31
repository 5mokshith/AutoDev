export type CacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

export class AsyncTtlCache<T> {
  private readonly map = new Map<string, CacheEntry<T>>();

  async getOrSet(key: string, ttlMs: number, factory: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const existing = this.map.get(key);
    if (existing && existing.expiresAt > now) {
      return existing.value;
    }

    const value = factory().catch((err) => {
      this.map.delete(key);
      throw err;
    });

    this.map.set(key, { expiresAt: now + ttlMs, value });
    return value;
  }

  prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.map.entries()) {
      if (entry.expiresAt <= now) this.map.delete(key);
    }
  }
}

/**
 * Tiny in-process TTL cache for hot public catalog reads.
 * Prefer short TTLs (30–60s); bust on admin writes.
 */
export class TtlCache<T> {
  private entry: { at: number; value: T } | null = null;

  constructor(private readonly ttlMs: number) {}

  get(): T | undefined {
    if (!this.entry) return undefined;
    if (Date.now() - this.entry.at >= this.ttlMs) {
      this.entry = null;
      return undefined;
    }
    return this.entry.value;
  }

  set(value: T) {
    this.entry = { at: Date.now(), value };
  }

  clear() {
    this.entry = null;
  }
}

/** Keyed variant for filtered public lists (surface / category / …). */
export class TtlCacheMap<T> {
  private readonly map = new Map<string, { at: number; value: T }>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at >= this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T) {
    this.map.set(key, { at: Date.now(), value });
  }

  clear() {
    this.map.clear();
  }
}

/** Default for public catalog endpoints (models / styles / voices / …). */
export const CATALOG_TTL_MS = 45_000;

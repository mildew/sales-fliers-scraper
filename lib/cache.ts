import fs from "fs";
import os from "os";
import path from "path";

// Unified cache structure for all flyers
// Every section carries its own `lastUpdated` timestamp so we can
// revalidate by age (TTL), not only by URL/date-marker changes.
export interface UnifiedCache {
  shopNKart?: {
    dateRange: string;
    flyerData: string;
    lastUpdated?: string;
  };
  ion?: {
    dateRange: string;
    flyerData: string;
    lastUpdated?: string;
  };
  marketOfChoice?: {
    pdfDate: string;
    dateRange: string;
    pdfData: string;
    lastUpdated?: string;
  };
  ashlandCoop?: {
    pdfData: string | null;
    pdfFileName: string | null;
    mainFlyerLink: string | null;
    lastUpdated: string;
  };
  albertsons?: {
    publicationId: number;
    name: string;
    dateRange: string;
    pdfUrl: string;
    pdfFileName: string;
    lastUpdated?: string;
  };
  timestamp: string;
}

// How long a cached flyer is trusted before it is re-downloaded, even if its
// URL/date marker hasn't changed. Stores frequently update a flyer in place
// (same file, same date text on the page) mid-week, so age is the only
// reliable way to pick up those updates.
export const FLYER_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// True when a cached section has no timestamp or is older than the TTL.
// Sections written before this fix (or corrupted to empty data) have no
// timestamp, so they are treated as stale and refreshed on the next request.
export function isSectionStale(
  section: { lastUpdated?: string } | null | undefined,
  ttlMs: number = FLYER_CACHE_TTL_MS
): boolean {
  if (!section) {
    return true;
  }
  const lastUpdated = section.lastUpdated;
  if (!lastUpdated) {
    return true;
  }
  const updatedAt = new Date(lastUpdated).getTime();
  if (Number.isNaN(updatedAt)) {
    return true;
  }
  return Date.now() - updatedAt > ttlMs;
}

// The runtime flyer cache lives in a writable temp directory. On serverless
// platforms (Vercel/Lambda) only /tmp is writable - the rest of the
// filesystem is read-only, so writing under public/ throws ENOENT there and
// breaks requests. A cache is ephemeral by nature, so per-instance /tmp is
// exactly right; set FLYER_CACHE_DIR to override the location if needed.
const CACHE_DIR =
  process.env.FLYER_CACHE_DIR || path.join(os.tmpdir(), "sales-fliers-cache");

const CACHE_FILE = "flyers-cache.json";

// Get cache file path
export function getCachePath(): string {
  return path.join(CACHE_DIR, CACHE_FILE);
}

// Get the cache directory path
export function getDownloadsDir(): string {
  return CACHE_DIR;
}

// Ensure cache directory exists. Never throws: on read-only filesystems the
// app simply runs without persistence instead of failing the request.
export function ensureDownloadsDir(): void {
  try {
    const dir = getDownloadsDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (error) {
    console.error("Failed to create cache directory:", error);
  }
}

// Get all cached data
export function getCache(): UnifiedCache | null {
  try {
    const cachePath = getCachePath();
    if (fs.existsSync(cachePath)) {
      const cacheData = fs.readFileSync(cachePath, "utf-8");
      return JSON.parse(cacheData);
    }
  } catch (error) {
    console.error("Failed to read cache:", error);
  }
  return null;
}

// Save entire cache
export function saveCache(data: UnifiedCache): void {
  try {
    ensureDownloadsDir();
    const cachePath = getCachePath();
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Failed to save cache:", error);
  }
}

// Update a specific section of the cache
// Always stamps `lastUpdated` so TTL revalidation works for every section,
// including ones (like shopNKart/ion) that don't set it themselves.
export function updateCacheSection<K extends keyof UnifiedCache>(
  section: K,
  data: UnifiedCache[K]
): void {
  const cache = getCache() || { timestamp: "" };
  if (data && typeof data === "object" && !("lastUpdated" in data)) {
    (data as { lastUpdated: string }).lastUpdated = new Date().toISOString();
  }
  cache[section] = data;
  cache.timestamp = new Date().toISOString();
  saveCache(cache);
}

// Get a specific section of the cache
export function getCacheSection<K extends keyof UnifiedCache>(
  section: K
): UnifiedCache[K] | null {
  const cache = getCache();
  return cache?.[section] ?? null;
}

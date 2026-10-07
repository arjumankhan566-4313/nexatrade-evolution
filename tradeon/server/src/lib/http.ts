/** Simple in-memory rate limiter — ported from legacy src/lib/http.js. */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  const bucket = buckets.get(key)?.filter((t) => now - t < windowMs) ?? [];
  bucket.push(now);
  buckets.set(key, bucket);
  if (buckets.size > 5000) buckets.clear();
  return bucket.length <= limit;
}



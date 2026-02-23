// Basic in-memory rate limiter for Vercel Edge / Serverless
// Note: Memory resets on cold starts. This protects against active warm-instance bot abuse.

type RateLimitRecord = {
    count: number;
    resetTime: number;
};

const cache = new Map<string, RateLimitRecord>();

export function checkRateLimit(ip: string, limit: number = 5, windowMs: number = 60000): { success: boolean; limit: number; remaining: number; reset: number } {
    const now = Date.now();
    let record = cache.get(ip);

    // Filter stale cache entries lazily to prevent memory leaks over long-warm instances
    if (Math.random() < 0.05) {
        cache.forEach((val, key) => {
            if (val.resetTime < now) cache.delete(key);
        });
    }

    if (!record || record.resetTime < now) {
        record = { count: 1, resetTime: now + windowMs };
        cache.set(ip, record);
        return { success: true, limit, remaining: limit - 1, reset: record.resetTime };
    }

    if (record.count >= limit) {
        return { success: false, limit, remaining: 0, reset: record.resetTime };
    }

    record.count += 1;
    cache.set(ip, record);
    return { success: true, limit, remaining: limit - record.count, reset: record.resetTime };
}

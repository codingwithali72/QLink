import Redis from 'ioredis';

// Singleton Redis Client for QLink
// Used for:
// 1. Scan & Share Token Buffer (absorbing 10,000 requests/minute without DB locking)
// 2. Real-time Triage Acuity State caching
// 3. Strict Rate Limiting (WASA requirement)

// Ensure REDIS_URL exists in the environment
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const createRedisClient = () => {
    return new Redis(REDIS_URL, {
        retryStrategy: (times: number) => {
            // Reconnect after
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
        maxRetriesPerRequest: 3,
    });
};

declare global {
    // eslint-disable-next-line no-var
    var prismaRedisGlobal: ReturnType<typeof createRedisClient> | undefined;
}

export const redis = globalThis.prismaRedisGlobal ?? createRedisClient();

if (process.env.NODE_ENV !== 'production') {
    globalThis.prismaRedisGlobal = redis;
}

// -------------------------------------------------------------
// REDIS UTILITY ABSTRACTIONS FOR PHASE 5
// -------------------------------------------------------------

/**
 * Increment a rate limit counter seamlessly.
 * Used to protect ABDM webhooks and Scan & Share endpoints.
 */
export async function incrementRateLimit(key: string, windowSeconds: number): Promise<number> {
    const multi = redis.multi();
    multi.incr(key);
    // Only set expire if it's a new key (TTL will be -1)
    multi.ttl(key);

    const results = await multi.exec();
    if (!results) throw new Error("Redis transaction failed for rate limit");

    const currentCount = results[0][1] as number;
    const ttl = results[1][1] as number;

    if (ttl === -1) {
        await redis.expire(key, windowSeconds);
    }

    return currentCount;
}

/**
 * Push an incoming Scan & Share payload to the buffer queue.
 * Allows instant 200 OK response to Gateway while DB processes it safely.
 */
export async function pushToScanAndShareBuffer(payload: Record<string, unknown>) {
    await redis.lpush('queue:abdm:scan_and_share', JSON.stringify({
        ...payload,
        received_at: new Date().toISOString()
    }));
}

/**
 * Pop from the Scan & Share buffer (Worker usage)
 */
export async function popFromScanAndShareBuffer() {
    return await redis.rpop('queue:abdm:scan_and_share');
}

/**
 * Cache an expensive Clinical Triage state for 5 seconds.
 * Reduces DB load when 100 people are viewing the waiting board.
 */
export async function getCachedTriageBoard(clinicId: string) {
    return await redis.get(`cache:triage_board:${clinicId}`);
}

export async function setCachedTriageBoard(clinicId: string, data: unknown) {
    await redis.setex(`cache:triage_board:${clinicId}`, 5, JSON.stringify(data));
}

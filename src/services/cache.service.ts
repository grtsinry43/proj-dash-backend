import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

export class CacheService {
  async get(key: string) {
    return await redis.get(key);
  }

  async set(key: string, value: any, ttl?: number) {
    return await redis.set(key, value, { ex: ttl });
  }
}

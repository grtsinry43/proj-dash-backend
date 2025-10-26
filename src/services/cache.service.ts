import { Redis } from '@upstash/redis'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
})

export class CacheService {
  async get(key: string) {
    return redis.get(key)
  }

  async set(key: string, value: any, ttl?: number) {
    // Only pass ex option if ttl is defined
    if (ttl !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return redis.set(key, value, { ex: ttl })
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return redis.set(key, value)
  }
}

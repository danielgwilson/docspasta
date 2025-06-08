import { getRedisConnection } from './queue-service'

/**
 * Atomic progress operations to prevent race conditions
 * Uses Redis atomic operations to ensure data consistency
 */

/**
 * Atomically increment progress counters
 */
export async function incrementProgress(
  crawlId: string,
  field: 'discovered' | 'processed' | 'failed' | 'queued',
  amount: number = 1
): Promise<number> {
  const redis = getRedisConnection()
  return await redis.hincrby(`crawl:${crawlId}:progress`, field, amount)
}

/**
 * Atomically mark crawl as complete
 * Returns true if this call marked it complete, false if already completed
 */
export async function markCrawlComplete(crawlId: string): Promise<boolean> {
  const redis = getRedisConnection()
  
  // Use Lua script for atomic check-and-set
  const lua = `
    local status = redis.call('hget', KEYS[1], 'status')
    if status ~= 'completed' then
      redis.call('hset', KEYS[1], 'status', 'completed')
      redis.call('hset', KEYS[1], 'completedAt', ARGV[1])
      redis.call('publish', KEYS[2], ARGV[2])
      return 1
    end
    return 0
  `
  
  const completionEvent = JSON.stringify({
    type: 'completion',
    crawlId,
    status: 'completed',
    timestamp: Date.now()
  })
  
  const result = await redis.eval(
    lua,
    2,
    `crawl:${crawlId}`,
    `crawl:${crawlId}:progress`,
    Date.now().toString(),
    completionEvent
  ) as number
  
  return result === 1
}

/**
 * Atomically update multiple progress fields
 */
export async function updateProgressAtomic(
  crawlId: string,
  updates: {
    processed?: number
    failed?: number
    discovered?: number
    queued?: number
    phase?: string
  }
): Promise<void> {
  const redis = getRedisConnection()
  const multi = redis.multi()
  
  // Convert to string format for Redis
  const updateData: Record<string, string> = {}
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      updateData[key] = value.toString()
    }
  }
  
  multi.hset(`crawl:${crawlId}:progress`, updateData)
  multi.hset(`crawl:${crawlId}:progress`, 'lastUpdate', Date.now().toString())
  
  await multi.exec()
}

/**
 * Get current progress atomically
 */
export async function getProgressAtomic(crawlId: string): Promise<{
  processed: number
  failed: number
  discovered: number
  queued: number
  phase: string
  status: string
}> {
  const redis = getRedisConnection()
  const data = await redis.hgetall(`crawl:${crawlId}:progress`)
  
  return {
    processed: parseInt(data.processed || '0'),
    failed: parseInt(data.failed || '0'),
    discovered: parseInt(data.discovered || '0'),
    queued: parseInt(data.queued || '0'),
    phase: data.phase || 'initializing',
    status: data.status || 'running'
  }
}

/**
 * Batch increment multiple counters atomically
 */
export async function batchIncrementProgress(
  crawlId: string,
  increments: {
    processed?: number
    failed?: number
    discovered?: number
    queued?: number
  }
): Promise<void> {
  const redis = getRedisConnection()
  const multi = redis.multi()
  
  for (const [field, amount] of Object.entries(increments)) {
    if (amount && amount > 0) {
      multi.hincrby(`crawl:${crawlId}:progress`, field, amount)
    }
  }
  
  multi.hset(`crawl:${crawlId}:progress`, 'lastUpdate', Date.now().toString())
  
  await multi.exec()
}
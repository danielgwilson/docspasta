import { createClient } from 'redis'
import type { RedisClientType } from 'redis'

/**
 * Configuration for Redis connection
 */
export interface RedisConfig {
  url?: string
  logPrefix?: string
  connectTimeout?: number
}

/**
 * Execute a function with a Redis connection, ensuring proper cleanup
 * 
 * This function creates a new Redis connection, executes the provided callback,
 * and ensures the connection is always closed, even if an error occurs.
 * 
 * @param callback - Function to execute with the Redis client
 * @param config - Optional Redis configuration
 * @returns Result of the callback function
 * 
 * @example
 * ```typescript
 * const result = await withRedis(async (client) => {
 *   await client.set('key', 'value')
 *   return await client.get('key')
 * })
 * ```
 */
export async function withRedis<T>(
  callback: (client: RedisClientType) => Promise<T>,
  config?: RedisConfig
): Promise<T> {
  const prefix = config?.logPrefix || 'Redis'
  let client: RedisClientType | null = null
  let isConnected = false
  
  try {
    // Get Redis URL from environment
    const redisUrl = config?.url || process.env.REDIS_URL || process.env.KV_URL
    if (!redisUrl) {
      throw new Error('REDIS_URL or KV_URL environment variable is required')
    }
    
    console.log(`🔄 [${prefix}] Creating Redis client...`)
    
    // Create client with connection timeout
    client = createClient({ 
      url: redisUrl,
      socket: {
        connectTimeout: config?.connectTimeout || 5000,
        reconnectStrategy: false as any // Disable reconnect in serverless
      }
    })
    
    // Add error handler
    client.on('error', (err) => {
      console.error(`❌ [${prefix}] Redis client error:`, err)
    })
    
    // Connect to Redis
    await client.connect()
    isConnected = true
    console.log(`✅ [${prefix}] Redis connected`)
    
    // Execute the callback
    const result = await callback(client)
    
    return result
    
  } catch (error) {
    console.error(`❌ [${prefix}] Redis operation failed:`, error)
    throw error
    
  } finally {
    // Always disconnect, even if an error occurred
    if (client && isConnected) {
      try {
        await client.disconnect()
        console.log(`🔌 [${prefix}] Redis disconnected`)
      } catch (disconnectError) {
        console.error(`❌ [${prefix}] Failed to disconnect Redis:`, disconnectError)
      }
    }
  }
}

/**
 * Execute a function with a Redis connection, with automatic retry on connection failure
 * 
 * @param callback - Function to execute with the Redis client
 * @param config - Optional Redis configuration
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Result of the callback function
 */
export async function withRedisRetry<T>(
  callback: (client: RedisClientType) => Promise<T>,
  config?: RedisConfig,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await withRedis(callback, {
        ...config,
        logPrefix: `${config?.logPrefix || 'Redis'} (attempt ${attempt}/${maxRetries})`
      })
    } catch (error) {
      lastError = error as Error
      
      // Don't retry on non-connection errors
      if (!isConnectionError(error)) {
        throw error
      }
      
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000) // Exponential backoff
        console.log(`🔄 Retrying Redis connection in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  
  throw lastError || new Error('Redis connection failed after all retries')
}

/**
 * Check if an error is a connection error
 */
function isConnectionError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return message.includes('connect') || 
           message.includes('econnrefused') || 
           message.includes('timeout') ||
           message.includes('getaddrinfo')
  }
  return false
}

/**
 * Execute a function with Redis, but don't fail if Redis is unavailable
 * 
 * This is useful for non-critical operations where Redis failure shouldn't
 * break the main functionality.
 * 
 * @param callback - Function to execute with the Redis client
 * @param fallback - Value to return if Redis operation fails
 * @param config - Optional Redis configuration
 * @returns Result of the callback or fallback value
 */
export async function withRedisFallback<T>(
  callback: (client: RedisClientType) => Promise<T>,
  fallback: T,
  config?: RedisConfig
): Promise<T> {
  try {
    return await withRedis(callback, config)
  } catch (error) {
    console.warn(`⚠️ [${config?.logPrefix || 'Redis'}] Operation failed, using fallback:`, error)
    return fallback
  }
}
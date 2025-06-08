/**
 * Global Redis mock setup for all vitest tests
 * Provides a comprehensive Upstash Redis-compatible mock
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { vi } from 'vitest'

// Create a comprehensive Redis mock that supports all operations
const createRedisOperations = () => {
  const data = new Map<string, any>()
  const sets = new Map<string, Set<string>>()
  const hashes = new Map<string, Map<string, string>>()
  const lists = new Map<string, any[]>()
  const subscribers = new Map<string, Set<Function>>()
  
  return {
    // Basic operations
    get: vi.fn().mockImplementation((key: string) => {
      return Promise.resolve(data.get(key) || null)
    }),
    
    set: vi.fn().mockImplementation((key: string, value: any) => {
      data.set(key, value)
      return Promise.resolve('OK')
    }),
    
    setnx: vi.fn().mockImplementation((key: string, value: any) => {
      if (!data.has(key)) {
        data.set(key, value)
        return Promise.resolve(1)
      }
      return Promise.resolve(0)
    }),
    
    del: vi.fn().mockImplementation((...keys: string[]) => {
      let deleted = 0
      for (const key of keys) {
        if (data.delete(key)) deleted++
        sets.delete(key)
        hashes.delete(key)
        lists.delete(key)
      }
      return Promise.resolve(deleted)
    }),
    
    exists: vi.fn().mockImplementation((key: string) => {
      return Promise.resolve(data.has(key) ? 1 : 0)
    }),
    
    expire: vi.fn().mockImplementation((key: string, seconds: number) => {
      // In a real test, you might want to implement TTL tracking
      return Promise.resolve(1)
    }),
    
    setex: vi.fn().mockImplementation((key: string, seconds: number, value: any) => {
      data.set(key, value)
      return Promise.resolve('OK')
    }),
    
    // Set operations
    sadd: vi.fn().mockImplementation((key: string, ...members: string[]) => {
      if (!sets.has(key)) {
        sets.set(key, new Set())
      }
      const set = sets.get(key)!
      let added = 0
      for (const member of members) {
        if (!set.has(member)) {
          set.add(member)
          added++
        }
      }
      return Promise.resolve(added)
    }),
    
    sismember: vi.fn().mockImplementation((key: string, member: string) => {
      const set = sets.get(key)
      return Promise.resolve(set?.has(member) ? 1 : 0)
    }),
    
    scard: vi.fn().mockImplementation((key: string) => {
      const set = sets.get(key)
      return Promise.resolve(set?.size || 0)
    }),
    
    smembers: vi.fn().mockImplementation((key: string) => {
      const set = sets.get(key)
      return Promise.resolve(set ? Array.from(set) : [])
    }),
    
    // Hash operations
    hset: vi.fn().mockImplementation((key: string, field: string | Record<string, any>, value?: any) => {
      if (!hashes.has(key)) {
        hashes.set(key, new Map())
      }
      const hash = hashes.get(key)!
      
      if (typeof field === 'string' && value !== undefined) {
        hash.set(field, String(value))
        return Promise.resolve(1)
      } else if (typeof field === 'object') {
        let updated = 0
        for (const [k, v] of Object.entries(field)) {
          hash.set(k, String(v))
          updated++
        }
        return Promise.resolve(updated)
      }
      return Promise.resolve(0)
    }),
    
    hget: vi.fn().mockImplementation((key: string, field: string) => {
      const hash = hashes.get(key)
      return Promise.resolve(hash?.get(field) || null)
    }),
    
    hgetall: vi.fn().mockImplementation((key: string) => {
      const hash = hashes.get(key)
      if (!hash) return Promise.resolve({})
      
      const result: Record<string, string> = {}
      for (const [k, v] of hash.entries()) {
        result[k] = v
      }
      return Promise.resolve(result)
    }),
    
    hincrby: vi.fn().mockImplementation((key: string, field: string, increment: number) => {
      if (!hashes.has(key)) {
        hashes.set(key, new Map())
      }
      const hash = hashes.get(key)!
      const current = parseInt(hash.get(field) || '0')
      const newValue = current + increment
      hash.set(field, String(newValue))
      return Promise.resolve(newValue)
    }),
    
    // List operations
    lpush: vi.fn().mockImplementation((key: string, ...elements: any[]) => {
      if (!lists.has(key)) {
        lists.set(key, [])
      }
      const list = lists.get(key)!
      list.unshift(...elements)
      return Promise.resolve(list.length)
    }),
    
    lrange: vi.fn().mockImplementation((key: string, start: number, stop: number) => {
      const list = lists.get(key) || []
      return Promise.resolve(list.slice(start, stop + 1))
    }),
    
    // Pub/Sub operations
    publish: vi.fn().mockImplementation((channel: string, message: string) => {
      const channelSubs = subscribers.get(channel)
      if (channelSubs) {
        channelSubs.forEach(callback => {
          try {
            callback(channel, message)
          } catch (error) {
            console.error('Mock Redis pub/sub callback error:', error)
          }
        })
      }
      return Promise.resolve(channelSubs?.size || 0)
    }),
    
    subscribe: vi.fn().mockImplementation((channel: string) => {
      if (!subscribers.has(channel)) {
        subscribers.set(channel, new Set())
      }
      return Promise.resolve('OK')
    }),
    
    duplicate: vi.fn().mockImplementation(() => {
      const duplicatedOperations = createRedisOperations()
      
      // Add event emitter functionality for the duplicated instance
      const eventEmitter = {
        listeners: new Map<string, Set<Function>>(),
        
        on: vi.fn().mockImplementation((event: string, callback: Function) => {
          if (!eventEmitter.listeners.has(event)) {
            eventEmitter.listeners.set(event, new Set())
          }
          eventEmitter.listeners.get(event)!.add(callback)
        }),
        
        emit: vi.fn().mockImplementation((event: string, ...args: any[]) => {
          const eventListeners = eventEmitter.listeners.get(event)
          if (eventListeners) {
            eventListeners.forEach(callback => {
              try {
                callback(...args)
              } catch (error) {
                console.error('Mock Redis event callback error:', error)
              }
            })
          }
        })
      }
      
      return {
        ...duplicatedOperations,
        ...eventEmitter,
        
        subscribe: vi.fn().mockImplementation((channel: string) => {
          if (!subscribers.has(channel)) {
            subscribers.set(channel, new Set())
          }
          
          // Register the message callback for this channel
          const messageCallback = (channel: string, message: string) => {
            eventEmitter.emit('message', channel, message)
          }
          subscribers.get(channel)!.add(messageCallback)
          
          // Simulate subscription success
          setTimeout(() => {
            eventEmitter.emit('subscribe', channel, subscribers.get(channel)?.size || 1)
          }, 10)
          return Promise.resolve('OK')
        })
      }
    }),
    
    // Pipeline operations
    pipeline: vi.fn().mockImplementation(() => {
      const commands: Array<() => Promise<any>> = []
      
      const pipelineProxy = new Proxy({}, {
        get: (target, prop: string) => {
          if (prop === 'exec') {
            return async () => {
              const results: Array<[Error | null, any]> = []
              for (const command of commands) {
                try {
                  const result = await command()
                  results.push([null, result])
                } catch (error) {
                  results.push([error as Error, null])
                }
              }
              return results
            }
          }
          
          // Return a function that adds the command to the pipeline
          if (typeof (operations as any)[prop] === 'function') {
            return (...args: any[]) => {
              commands.push(() => (operations as any)[prop](...args))
              return pipelineProxy // Return pipeline for chaining
            }
          }
          
          return undefined
        }
      })
      
      return pipelineProxy
    }),
    
    // Multi/transaction operations
    multi: vi.fn().mockImplementation(() => {
      const commands: Array<() => Promise<any>> = []
      
      return {
        hset: vi.fn().mockImplementation((key: string, field: string | Record<string, any>, value?: any) => {
          commands.push(() => operations.hset(key, field, value))
          return { exec: () => Promise.resolve([[null, 'OK']]) }
        }),
        
        exec: vi.fn().mockImplementation(async () => {
          const results: Array<[Error | null, any]> = []
          for (const command of commands) {
            try {
              const result = await command()
              results.push([null, result])
            } catch (error) {
              results.push([error as Error, null])
            }
          }
          return results
        })
      }
    })
  }
}

// Create the main mock instance
const operations = createRedisOperations()

// Global Redis mock that works for all tests
const mockRedisClient = operations

// Mock the Redis connection
vi.mock('@/lib/crawler/queue-service', async () => {
  const actual = await vi.importActual('@/lib/crawler/queue-service') as any
  
  return {
    ...actual,
    getRedisConnection: vi.fn(() => mockRedisClient),
    getCrawlQueue: vi.fn(() => ({
      add: vi.fn().mockResolvedValue({ id: 'mocked-job-id' }),
      addBulk: vi.fn().mockResolvedValue([{ id: 'bulk-job-1' }, { id: 'bulk-job-2' }]),
      getActive: vi.fn().mockResolvedValue([]),
      getWaiting: vi.fn().mockResolvedValue([]),
      getDelayed: vi.fn().mockResolvedValue([]),
      getCompleted: vi.fn().mockResolvedValue([]),
      getFailed: vi.fn().mockResolvedValue([]),
      close: vi.fn().mockResolvedValue(undefined),
    }))
  }
})

// Export for use in individual tests if needed
export { mockRedisClient }
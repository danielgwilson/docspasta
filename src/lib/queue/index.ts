import { Client } from '@upstash/qstash'
import { z } from 'zod'

// Environment validation
const QStashConfigSchema = z.object({
  QSTASH_URL: z.string().url().optional().default('https://qstash.upstash.io'),
  QSTASH_TOKEN: z.string().min(1, 'QSTASH_TOKEN is required'),
}).refine(
  data => data.QSTASH_TOKEN && data.QSTASH_TOKEN.length > 0,
  {
    message: 'QSTASH_TOKEN is required',
    path: ['QSTASH_TOKEN']
  }
)

type QStashConfig = z.infer<typeof QStashConfigSchema>

/**
 * Singleton QStash client with proper error handling and configuration validation
 */
class QStashClientManager {
  private static instance: Client | null = null
  private static config: QStashConfig | null = null

  static getInstance(): Client {
    if (!this.instance) {
      this.config = QStashConfigSchema.parse({
        QSTASH_URL: process.env.QSTASH_URL,
        QSTASH_TOKEN: process.env.QSTASH_TOKEN,
      })

      this.instance = new Client({
        token: this.config.QSTASH_TOKEN,
        baseUrl: this.config.QSTASH_URL,
      })

      console.log('🚀 QStash client initialized successfully')
    }

    return this.instance
  }

  static getConfig(): QStashConfig {
    if (!this.config) {
      this.getInstance() // Initialize if not already done
    }
    return this.config!
  }

  /**
   * Reset instance (useful for testing)
   */
  static reset(): void {
    this.instance = null
    this.config = null
  }
}

/**
 * Get the configured QStash client instance
 */
export function getQStashClient(): Client {
  return QStashClientManager.getInstance()
}

/**
 * Validate QStash configuration without creating client
 */
export function validateQStashConfig(): QStashConfig {
  return QStashConfigSchema.parse({
    QSTASH_URL: process.env.QSTASH_URL,
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
  })
}

/**
 * Reset QStash client (for testing)
 */
export function resetQStashClient(): void {
  QStashClientManager.reset()
}

export type { QStashConfig }
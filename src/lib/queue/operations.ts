import { getQStashClient } from './index'
import {
  StartCrawlJob,
  ProcessUrlJob,
  FinalizeJob,
  JobPayload,
  QueueConfig,
  QStashError,
  UrlValidationSchema,
} from './types'
import { getCurrentUser } from '@/lib/auth/middleware'
import { NextRequest } from 'next/server'

/**
 * QStash queue operations with proper error handling and security
 */

// Default queue configuration
const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  queueName: 'docspasta-crawl',
  concurrency: 5, // Protect target sites from being overwhelmed
  retries: 3,
  delay: 0,
}

/**
 * Publish a start-crawl job to QStash
 */
export async function publishStartCrawlJob(
  jobData: Omit<StartCrawlJob, 'type' | 'timestamp' | 'retryCount'>,
  config: Partial<QueueConfig> = {}
): Promise<string> {
  const qstash = getQStashClient()
  const queueConfig = { ...DEFAULT_QUEUE_CONFIG, ...config }

  // Validate URL for SSRF protection
  const validatedUrl = UrlValidationSchema.parse(jobData.url)

  const payload: StartCrawlJob = {
    ...jobData,
    url: validatedUrl,
    type: 'start-crawl',
    timestamp: Date.now(),
    retryCount: 0,
  }

  const targetUrl = `${getBaseUrl()}/api/v5/process`
  console.log(`🔗 Publishing to URL: ${targetUrl}`)
  console.log(`📍 BASE_URL env: ${process.env.BASE_URL || 'not set'}`)

  try {
    const result = await qstash.publishJSON({
      url: targetUrl,
      body: payload,
      headers: {
        'Content-Type': 'application/json',
      },
      // Queue configuration
      ...(queueConfig.queueName && { queueName: queueConfig.queueName }),
      ...(queueConfig.concurrency && { concurrency: queueConfig.concurrency }),
      ...(queueConfig.retries && { retries: queueConfig.retries }),
      ...(queueConfig.delay && { delay: queueConfig.delay }),
    })

    console.log(`🚀 Start-crawl job published: ${result.messageId} for job ${payload.jobId}`)
    return result.messageId
  } catch (error) {
    const qstashError = createQStashError(error, 'Failed to publish start-crawl job')
    console.error('❌ Start-crawl job publication failed:', qstashError)
    throw qstashError
  }
}

/**
 * Publish multiple URL processing jobs in batch
 */
export async function publishUrlProcessingBatch(
  jobs: Array<Omit<ProcessUrlJob, 'type' | 'timestamp' | 'retryCount'>>,
  config: Partial<QueueConfig> = {}
): Promise<string[]> {
  if (jobs.length === 0) return []

  const qstash = getQStashClient()
  const queueConfig = { ...DEFAULT_QUEUE_CONFIG, ...config }

  // Validate all URLs for SSRF protection
  const validatedJobs = jobs.map(job => ({
    ...job,
    url: UrlValidationSchema.parse(job.url),
    originalJobUrl: UrlValidationSchema.parse(job.originalJobUrl),
  }))

  const payloads: ProcessUrlJob[] = validatedJobs.map(job => ({
    ...job,
    type: 'process-url' as const,
    timestamp: Date.now(),
    retryCount: 0,
  }))

  try {
    // Use batch publishing for efficiency
    const batchMessages = payloads.map(payload => ({
      url: `${getBaseUrl()}/api/v5/process`,
      body: payload,
      headers: {
        'Content-Type': 'application/json',
      },
      // Queue configuration (note: delay is not supported with batch enqueue)
      ...(queueConfig.queueName && { queueName: queueConfig.queueName }),
      ...(queueConfig.concurrency && { concurrency: queueConfig.concurrency }),
      ...(queueConfig.retries && { retries: queueConfig.retries }),
      // Delay is not supported with enqueue operations
    }))

    const results = await qstash.batchJSON(batchMessages)
    const messageIds = results.map(result => result.messageId)

    console.log(`📦 Batch published ${payloads.length} URL processing jobs for job ${payloads[0]?.jobId}`)
    return messageIds
  } catch (error) {
    const qstashError = createQStashError(error, 'Failed to publish URL processing batch')
    console.error('❌ Batch URL processing publication failed:', qstashError)
    throw qstashError
  }
}

/**
 * Publish a single URL processing job
 */
export async function publishUrlProcessingJob(
  jobData: Omit<ProcessUrlJob, 'type' | 'timestamp' | 'retryCount'>,
  config: Partial<QueueConfig> = {}
): Promise<string> {
  const messageIds = await publishUrlProcessingBatch([jobData], config)
  return messageIds[0]
}

/**
 * Publish a finalize job
 */
export async function publishFinalizeJob(
  jobData: Omit<FinalizeJob, 'type' | 'timestamp' | 'retryCount'>,
  config: Partial<QueueConfig> = {}
): Promise<string> {
  const qstash = getQStashClient()
  const queueConfig = { ...DEFAULT_QUEUE_CONFIG, ...config }

  const payload: FinalizeJob = {
    ...jobData,
    type: 'finalize-job',
    timestamp: Date.now(),
    retryCount: 0,
  }

  try {
    const result = await qstash.publishJSON({
      url: `${getBaseUrl()}/api/v5/process`,
      body: payload,
      headers: {
        'Content-Type': 'application/json',
      },
      // Queue configuration
      ...(queueConfig.queueName && { queueName: queueConfig.queueName }),
      ...(queueConfig.retries && { retries: queueConfig.retries }),
      ...(queueConfig.delay && { delay: queueConfig.delay }),
    })

    console.log(`🏁 Finalize job published: ${result.messageId} for job ${payload.jobId}`)
    return result.messageId
  } catch (error) {
    const qstashError = createQStashError(error, 'Failed to publish finalize job')
    console.error('❌ Finalize job publication failed:', qstashError)
    throw qstashError
  }
}

/**
 * Verify QStash message signature
 */
export async function verifyQStashMessage(
  request: NextRequest
): Promise<{ isValid: boolean; payload?: JobPayload; userId?: string }> {
  try {
    // In development, allow bypassing signature verification
    if (process.env.NODE_ENV === 'development' && !process.env.QSTASH_CURRENT_SIGNING_KEY) {
      console.warn('⚠️ Development mode: Bypassing QStash signature verification')
      
      const body = await request.text()
      if (!body) {
        console.warn('⚠️ Empty request body')
        return { isValid: false }
      }

      // Parse and validate the payload
      let payload: JobPayload
      try {
        const rawPayload = JSON.parse(body)
        payload = JobPayloadSchema.parse(rawPayload)
      } catch (parseError) {
        console.error('❌ Invalid job payload:', parseError)
        return { isValid: false }
      }

      return {
        isValid: true,
        payload,
        userId: payload.userId,
      }
    }

    // Production path: use official QStash Receiver for signature verification
    const { Receiver } = await import('@upstash/qstash/nextjs')
    
    const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY
    const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY
    
    if (!currentSigningKey) {
      console.error('❌ QSTASH_CURRENT_SIGNING_KEY not configured')
      return { isValid: false }
    }
    
    const receiver = new Receiver({
      currentSigningKey,
      nextSigningKey,
    })
    
    const signature = request.headers.get('upstash-signature')
    if (!signature) {
      console.warn('⚠️ Missing upstash-signature header')
      return { isValid: false }
    }
    
    const body = await request.text()
    if (!body) {
      console.warn('⚠️ Empty request body')
      return { isValid: false }
    }
    
    // Verify the signature
    const isValidSignature = await receiver.verify({
      signature,
      body,
    })
    
    if (!isValidSignature) {
      console.warn('⚠️ Invalid QStash signature')
      return { isValid: false }
    }
    
    // Parse and validate the payload
    let payload: JobPayload
    try {
      const rawPayload = JSON.parse(body)
      payload = JobPayloadSchema.parse(rawPayload)
    } catch (parseError) {
      console.error('❌ Invalid job payload:', parseError)
      return { isValid: false }
    }

    // Additional validation: check user exists
    try {
      const user = await getUserById(payload.userId)
      if (!user) {
        console.warn(`⚠️ User not found: ${payload.userId}`)
        return { isValid: false }
      }
    } catch (userError) {
      console.error('❌ User validation failed:', userError)
      return { isValid: false }
    }

    return {
      isValid: true,
      payload,
      userId: payload.userId,
    }
  } catch (error) {
    console.error('❌ Message verification failed:', error)
    return { isValid: false }
  }
}


/**
 * Get base URL for this deployment
 */
function getBaseUrl(): string {
  // Production environment with custom domain
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL
  }
  
  // Vercel deployment (previews and production)
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  
  // Development with tunnel (ngrok, dgw, etc)
  if (process.env.BASE_URL) {
    return process.env.BASE_URL
  }
  
  // Development fallback - requires tunnel for QStash
  if (process.env.NODE_ENV === 'development') {
    console.warn('⚠️ No BASE_URL set for development. QStash cannot reach localhost.')
    console.warn('💡 Set BASE_URL=https://your-tunnel-url.com or use ngrok/dgw')
    return 'http://localhost:3000'
  }
  
  throw new Error('No base URL configured. Set NEXT_PUBLIC_SITE_URL for production.')
}


/**
 * Create standardized QStash error
 */
function createQStashError(error: unknown, message: string): QStashError {
  const qstashError = new Error(message) as QStashError
  qstashError.retryable = false

  if (error instanceof Error) {
    qstashError.message = `${message}: ${error.message}`
    qstashError.stack = error.stack
  }

  // Determine if error is retryable based on the error type
  if (error && typeof error === 'object' && 'status' in error) {
    qstashError.statusCode = error.status as number
    // 5xx errors are generally retryable, 4xx are not
    qstashError.retryable = qstashError.statusCode >= 500
  }

  return qstashError
}

/**
 * Simple user lookup (replace with your actual user service)
 */
async function getUserById(userId: string): Promise<{ id: string } | null> {
  // TODO: Replace with actual user lookup from your auth system
  // For now, just validate the format
  if (userId && userId.length > 0) {
    return { id: userId }
  }
  return null
}

/**
 * Dead Letter Queue handler utilities
 */
export class DLQHandler {
  /**
   * Process a message that has been moved to the dead letter queue
   */
  static async handleDeadMessage(messageId: string, payload: JobPayload, error: string): Promise<void> {
    console.error(`💀 Message ${messageId} moved to DLQ:`, { payload, error })
    
    // TODO: Implement your DLQ handling logic:
    // 1. Log to monitoring service
    // 2. Send alert to team
    // 3. Store in database for manual review
    // 4. Update job status to 'failed'
    
    try {
      // Update job status in database
      // await updateJobStatus(payload.jobId, 'failed', error)
      
      // Send alert (Slack, email, etc.)
      // await sendAlert(`Job ${payload.jobId} failed permanently`, error)
    } catch (handlingError) {
      console.error('❌ Failed to handle dead message:', handlingError)
    }
  }

  /**
   * Retry a message from the dead letter queue
   */
  static async retryDeadMessage(messageId: string, payload: JobPayload): Promise<string> {
    console.log(`🔄 Retrying dead message: ${messageId}`)
    
    // Increment retry count
    const retryPayload = {
      ...payload,
      retryCount: (payload.retryCount || 0) + 1,
      timestamp: Date.now(),
    }
    
    // Re-publish based on job type
    switch (payload.type) {
      case 'start-crawl':
        return await publishStartCrawlJob(retryPayload)
      case 'process-url':
        return await publishUrlProcessingJob(retryPayload)
      case 'finalize-job':
        return await publishFinalizeJob(retryPayload)
      default:
        throw new Error(`Unknown job type: ${(payload as any).type}`)
    }
  }
}
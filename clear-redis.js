import IORedis from 'ioredis'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.test' })
dotenv.config({ path: '.env.local' })

async function clearRedis() {
  const redis = new IORedis(process.env.REDIS_URL)
  
  console.log('🗑️  Clearing Redis database...')
  await redis.flushdb()
  console.log('✅ Redis cleared!')
  
  await redis.quit()
}

clearRedis().catch(console.error)
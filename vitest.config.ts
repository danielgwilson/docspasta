import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    envDir: '.',
    env: {
      NODE_ENV: 'test',
    },
    setupFiles: ['./src/tests/setup-eventsource-mock.ts'],
    testTimeout: 30000, // 30 seconds for integration tests
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  envPrefix: ['UPSTASH_', 'KV_', 'REDIS_', 'DATABASE_', 'POSTGRES_', 'NEON_'],
})
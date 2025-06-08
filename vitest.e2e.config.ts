import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    env: {
      // Load test environment variables
      NODE_ENV: 'test',
    },
    // NO setupFiles - use real Redis for E2E tests
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  envDir: '.',
  envPrefix: ['UPSTASH_', 'KV_', 'REDIS_'],
})
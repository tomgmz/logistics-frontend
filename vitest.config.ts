import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Unit tests (src/**/*.test.ts): rules that need no browser or server.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})

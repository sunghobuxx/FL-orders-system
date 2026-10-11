import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'lib/**/*.test.js'],
  },
})

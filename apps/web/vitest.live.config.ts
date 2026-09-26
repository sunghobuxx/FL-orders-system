import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// 실제 외부 서비스를 부르는 점검용. 평소 `vitest run` 에는 들어가지 않는다(lib/**/*.test.ts 만 포함).
// 실행: pnpm exec vitest run --config vitest.live.config.ts
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  test: { environment: 'node', include: ['lib/**/*.live.ts'], testTimeout: 60_000 },
})

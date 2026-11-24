import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      // The user-event smoke tests take 1-2 s; leave headroom on a busy machine.
      testTimeout: 15_000,
      css: { modules: { classNameStrategy: 'non-scoped' } },
    },
  }),
)

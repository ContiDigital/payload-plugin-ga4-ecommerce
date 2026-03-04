import path from 'path'
import { loadEnv } from 'payload/node'
import { fileURLToPath } from 'url'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default defineConfig(() => {
  loadEnv(path.resolve(dirname, './dev'))

  return {
    plugins: [
      tsconfigPaths({
        ignoreConfigErrors: true,
      }),
    ],
    test: {
      coverage: {
        include: ['src/**/*.ts'],
        provider: 'v8',
        reporter: ['text', 'lcov'],
        thresholds: {
          branches: 50,
          functions: 50,
          lines: 50,
          statements: 50,
        },
      },
      exclude: ['dev/e2e.spec.ts'],
      environment: 'node',
      hookTimeout: 30_000,
      include: ['dev/int.spec.ts', 'src/**/*.spec.ts'],
      testTimeout: 30_000,
    },
  }
})

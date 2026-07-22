import { defineConfig, mergeConfig } from 'vitest/config'
import baseConfig from './vitest.config'

export default mergeConfig(baseConfig, defineConfig({
  test: {
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
    maxConcurrency: 4,
    workers: 4,
    fileParallelism: true,
    testTimeout: 60000,
    hookTimeout: 60000,
    retry: 1,
    bail: 10,
    reporters: ['default', 'hanging-process'],
  },
}))

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'

// Reuse the same cubejs `this` patch the app needs.
import viteConfig from './vite.config'

export default defineConfig({
  plugins: viteConfig.plugins ?? [react()],
  optimizeDeps: viteConfig.optimizeDeps,
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
    include: ['tests/browser/**/*.test.ts'],
  },
})

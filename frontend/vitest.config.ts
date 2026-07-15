import path from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Separate from vite.config.ts (used by `dev`/`build`) rather than merging
// `test` into it — same precedent as backend/vitest.config.ts being its own
// file. Duplicates the '@' alias since vite.config.ts's plugins (tailwindcss)
// aren't needed here and vitest.config.ts's own module type isn't
// guaranteed compatible with every plugin in that file.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // e2e/ is Playwright's own suite (real browser + real backend), not a
    // Vitest include — this config must not try to collect it.
    exclude: ['e2e/**', 'node_modules/**'],
  },
})

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Mirrors tsconfig "paths": ["@/*" -> ["./*", "./src/*"]]. `src/lib`
      // no longer exists (blockTypes, blockOrder, supabase-admin, etc. moved
      // to services/prompt and services/auth) — root lib/ (promptSet.ts) is
      // covered by the general @/* fallback below, same as tsconfig's
      // root-first resolution.
      '@/test': resolve(__dirname, 'test'),
      '@': resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    passWithNoTests: true,
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'dist'],
  },
})

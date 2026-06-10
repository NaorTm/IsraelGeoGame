import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/services/supabase.runtime.test.ts'],
    exclude: ['e2e/**'],
  },
});

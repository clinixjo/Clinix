import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Isolation tests talk to a real Supabase project.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Run suites one at a time — parallel sign-ins across suites hit
    // Supabase Auth's rate limit.
    fileParallelism: false,
  },
});

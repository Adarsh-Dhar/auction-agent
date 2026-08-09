import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    // All test files share ONE SQLite file (test.db), and each file's
    // beforeEach truncates every table. SQLite is single-writer — running
    // files in parallel means one file's truncation can race another
    // file's in-flight test on the same shared database. Forcing
    // sequential file execution trades some wall-clock speed for
    // eliminating that whole class of intermittent failure. (The
    // "database is locked" error this fixes is a symptom of the same root
    // cause — see tests/global-setup.ts for the other half of this fix.)
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**", "app/api/**"],
      exclude: ["lib/seed.ts", "**/*.d.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
})

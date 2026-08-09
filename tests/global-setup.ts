/**
 * Vitest globalSetup — runs ONCE, in a separate process, before any test
 * file starts (as opposed to setupFiles, which runs per test file / per
 * worker).
 *
 * This used to live as a `beforeAll` inside tests/setup.ts, which is a
 * setupFile — meaning it ran once per test file. Vitest runs test files in
 * parallel by default, so every test file's beforeAll was calling
 * `prisma db push --force-reset` against the SAME test.db concurrently,
 * which SQLite serializes via a file lock — several of them would fail
 * with "database is locked" depending on scheduling, and even the ones
 * that "succeeded" were racing a reset against tests that had already
 * started running in another file. Moving it here means the schema is
 * pushed exactly once, before any test touches the database, and the
 * seven previously-redundant pushes disappear entirely (also faster).
 */
import { execSync } from "child_process"

export default function setup() {
  execSync("npx prisma db push --force-reset --skip-generate", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  })
}
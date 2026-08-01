import { defineConfig } from 'vitest/config';

// .mjs extension is required: backend/package.json has no "type": "module",
// so a .js config here would be parsed as CommonJS and fail to load.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    setupFiles: ['./src/test/setup.js'],
    // restoreMocks only restores vi.spyOn()-created mocks to their original
    // implementation — it is a no-op for standalone vi.fn() instances like
    // the query/pool mocks in db/__mocks__/index.js (verified empirically:
    // without mockReset, a vi.fn()'s call history accumulated across tests
    // in the same file). mockReset clears call history AND any queued
    // mockResolvedValueOnce/mockImplementation for every vi.fn() regardless
    // of how it was created, so each test starts from a clean slate.
    restoreMocks: true,
    mockReset: true,
    // KNOWN INTERMITTENT FAILURE — read before trusting a red run.
    //
    // This suite occasionally fails with "Error: Worker exited unexpectedly"
    // (a vitest worker process dying, NOT an assertion failing). Measured
    // 2026-08-01 on the developer's Windows machine, ~1-2 failures per 12
    // full runs.
    //
    // Hypotheses tested and REJECTED — do not retry these without new
    // evidence, they were each measured:
    //   fileParallelism: false ................. no effect (~1 in 7 still)
    //   poolOptions.forks.singleFork: true ..... made it WORSE (3 in 12)
    //   excluding src/startup.test.js .......... 12/12 clean in one sample,
    //       but the same sample size passes ~21% of the time by luck at the
    //       observed base rate, so this was NOT real evidence
    //   leaked child processes from startup.test.js ... checked the process
    //       table directly; no orphaned backend/src/index.js processes exist
    //
    // Most likely cause is host resource contention: the machine was running
    // ~20 concurrent node processes (several Codex runtimes, another
    // project's vite dev server, multiple npx invocations) when the failures
    // were observed. Workers get killed under memory/CPU pressure.
    //
    // Practical guidance: if a run fails with "Worker exited unexpectedly"
    // and no test name is reported, re-run before investigating — and check
    // machine load. A run that fails with an actual named assertion is real.
  },
});

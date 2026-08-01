import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This suite spawns backend/src/index.js as a REAL child process instead of
// importing it — importing it would call server.listen()/initSockets() at
// module load time inside THIS test process, binding a real port (the exact
// reason auth.test.js / projects.test.js never import backend/src/index.js
// either). Because we spawn a fresh Node process per case, the Module._load
// mock bridge in backend/src/test/setup.js does NOT apply here — the child
// runs the real, unmocked backend/src/db/index.js. That is the point: we are
// proving the real migration gate rejects real startup, not a mocked one.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..'); // backend/src/ -> backend/
const indexPath = path.resolve(__dirname, 'index.js');

const STARTUP_TIMEOUT_MS = 15000;

// Port 1 on loopback refuses immediately (ECONNREFUSED) with no timeout wait —
// guarantees runMigrations()'s first pool.query() rejects fast.
const BROKEN_DB_URL = 'postgresql://nouser:nopass@127.0.0.1:1/nodb';

// Distinctive substring from index.js's startup banner (only printed inside
// migrationsReady.then(), i.e. only after a successful migration run).
const BANNER_MARKER = 'Portfolio Backend 啟動成功';

/**
 * Spawns `node backend/src/index.js` with a fully explicit env and waits for
 * it to exit. backend/.env genuinely exists on dev machines, and dotenv
 * (called at the top of index.js) never overwrites a var already present in
 * process.env — so every var this test cares about is set explicitly here
 * rather than relying on (or being contaminated by) the real .env file.
 *
 * `omit` deletes keys that may have been inherited from this test runner's
 * own process.env (e.g. via `{ ...process.env }`) before the child spawns,
 * so a case that wants a variable genuinely ABSENT cannot accidentally
 * inherit it.
 */
function runBackend(envOverrides, { omit = [] } = {}) {
  const env = { ...process.env, ...envOverrides };
  for (const key of omit) delete env[key];

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [indexPath], { cwd: backendRoot, env });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(
        `backend process did not exit within ${STARTUP_TIMEOUT_MS}ms (treated as a hang, not a pass). ` +
        `stdout so far: ${stdout}\nstderr so far: ${stderr}`
      ));
    }, STARTUP_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

describe('Startup gate (REL-01, D-10, D-11)', () => {
  it(
    'rejects startup when migrations cannot run: non-zero exit, no banner, diagnosable [DB] stderr',
    async () => {
      const { code, stdout, stderr } = await runBackend({
        DATABASE_URL: BROKEN_DB_URL,
        SESSION_SECRET: 'startup-test-session-secret',
        NODE_ENV: 'development',
        PORT: '39001',
      });

      // (a) 行程以非零狀態碼結束
      expect(code).not.toBe(0);
      // (b) stdout 不含 startup banner —— server.listen() 從未抵達
      expect(stdout).not.toContain(BANNER_MARKER);
      // (c) stderr 含 [DB] 標籤與遷移失敗字樣 —— 原因可診斷，不是靜默中止
      expect(stderr).toContain('[DB]');
      expect(stderr).toContain('資料庫遷移失敗');
    },
    STARTUP_TIMEOUT_MS + 5000
  );
});

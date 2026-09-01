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
 * (called at the top of index.js) only fills in a key that is NOT already a
 * key on process.env — checked via presence (hasOwnProperty), not
 * truthiness. That means simply omitting a key from `envOverrides` is NOT
 * enough to force it "missing" in the child: dotenv will backfill it from
 * the real .env file the moment the key doesn't exist yet. To reliably
 * simulate "this var is unset", callers must pass it as an explicit empty
 * string (e.g. `SESSION_SECRET: ''`) — the key then already exists on the
 * child's process.env before dotenv.config() runs, so dotenv leaves the
 * empty value alone, and app code's `if (!process.env.X)` guards still see
 * it as falsy. (Discovered empirically: an earlier version of this helper
 * used delete-based omission and the SESSION_SECRET case below silently
 * picked up this machine's real secret from backend/.env instead of testing
 * the missing-var path.)
 */
function runBackend(envOverrides) {
  const env = { ...process.env, ...envOverrides };

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

  it(
    'SESSION_SECRET 不再是啟動閘門 —— 缺少它時擋下啟動的是資料庫，不是 [Startup]',
    async () => {
      // 這條先前斷言的是「缺少 SESSION_SECRET 就中止啟動」。那個閘門連同
      // express-session 一起移除了：該中介層從來沒有被使用（沒有任何一處讀寫
      // req.session、沒有 serializeUser/deserializeUser、所有 passport.authenticate
      // 都帶 { session: false }、只掛 passport.initialize()、OAuth 導轉不含 state），
      // 卻讓每次啟動都噴一行 MemoryStore 的生產環境警告。詳見 src/index.js 的說明。
      //
      // 沒有 session 就沒有 SESSION_SECRET 的用途，強制要求一個沒人讀的環境變數
      // 只會讓部署多一個無意義的失敗點。
      //
      // 新的斷言仍然帶著壞掉的 DATABASE_URL —— 這個測試環境沒有真的資料庫，
      // 行程一定會失敗。重點在於**失敗的理由變了**:以前是 [Startup] 擋在最前面，
      // 現在必須一路走到資料庫才失敗，這正是「session 閘門已經不存在」的證據。
      // SESSION_SECRET: '' 而不是省略，理由見 runBackend 的說明（dotenv 會回填）。
      const { code, stdout, stderr } = await runBackend({
        DATABASE_URL: BROKEN_DB_URL,
        SESSION_SECRET: '',
        NODE_ENV: 'development',
        PORT: '39002',
      });

      expect(code).not.toBe(0);
      expect(stdout).not.toContain(BANNER_MARKER);
      // 走到資料庫才失敗 = 沒有被 session 閘門提前擋下
      expect(stderr).toContain('[DB]');
      expect(stderr).not.toContain('缺少 SESSION_SECRET');
    },
    STARTUP_TIMEOUT_MS + 5000
  );
});

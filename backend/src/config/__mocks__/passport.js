import { vi } from 'vitest';

// Manual mock for backend/src/config/passport.js.
//
// The real module registers each OAuth strategy only when its client
// id/secret env vars are present (backend/src/config/passport.js:64-130).
// In a test environment with no real OAuth credentials configured, calling
// the REAL module's `passport.authenticate('google', ...)` throws "Unknown
// authentication strategy" synchronously at route-registration time (i.e.
// when auth.js is first loaded) for every unconfigured provider. Setting
// fake client-id env vars would dodge that crash but would then attempt a
// real network round-trip with the OAuth provider when the callback route
// is actually hit — not viable in a test. This stand-in replaces the whole
// module instead: `authenticate` always succeeds, attaching a fixed fake
// user, so all four callback routes in auth.js are reachable end-to-end
// with zero OAuth environment variables and zero network calls.
//
// Picked up automatically by `vi.mock('../config/passport')` (resolved
// relative to the test file, Jest/Vitest manual-mock convention: same
// filename, sibling `__mocks__` folder) for any direct ESM import, AND
// consumed directly by the Module._load bridge in
// backend/src/test/setup.js so that auth.js's internal CommonJS
// `require('../config/passport')` resolves to this exact same object —
// mirrors the db mock's dual-path pattern (backend/src/db/__mocks__/index.js).

export const FAKE_OAUTH_USER = { id: 'test-oauth-user-id', role: 'visitor' };

const passportStub = {
  authenticate: vi.fn(() => (req, res, next) => {
    req.user = FAKE_OAUTH_USER;
    next();
  }),
  initialize: vi.fn(() => (req, res, next) => next()),
};

export default passportStub;

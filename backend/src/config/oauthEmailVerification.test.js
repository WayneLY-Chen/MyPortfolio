import { describe, it, expect } from 'vitest';
import { isProviderEmailVerified, isSyntheticEmail } from './oauthEmailVerification.js';

// Every profile sample below is constructed to match the shape documented in
// .planning/phases/02-reliability-hardening/02-PROVIDER-EMAIL-VERIFICATION.md
// — if a provider's signal location ever changes, that document (and these
// samples) is what needs to change first, not this file's assertions.

describe('isProviderEmailVerified (D-18/SEC-07 fact-table-driven signal extraction)', () => {
  describe('unknown provider and synthetic emails', () => {
    it('unknown provider name: false', () => {
      expect(isProviderEmailVerified('unknown-provider', {}, {})).toBe(false);
    });

    it('line profile carrying a synthetic email: false regardless of any other field', () => {
      expect(isProviderEmailVerified('line', { email: 'line_1@noemail.auth' }, {})).toBe(false);
    });

    it('facebook profile carrying a synthetic email: false', () => {
      expect(
        isProviderEmailVerified('facebook', { emails: [{ value: 'fb_123@noemail.auth' }] }, {})
      ).toBe(false);
    });

    it('isSyntheticEmail: recognizes both prefixes and rejects a real-looking address', () => {
      expect(isSyntheticEmail('line_42@noemail.auth')).toBe(true);
      expect(isSyntheticEmail('fb_42@noemail.auth')).toBe(true);
      expect(isSyntheticEmail('real.person@example.com')).toBe(false);
      expect(isSyntheticEmail(undefined)).toBe(true);
      expect(isSyntheticEmail('')).toBe(true);
    });
  });

  describe('google — profile.emails[0].verified (OIDC email_verified claim)', () => {
    it('verified true: true', () => {
      const profile = { emails: [{ value: 'user@gmail.com', verified: true }] };
      expect(isProviderEmailVerified('google', profile, {})).toBe(true);
    });

    it('verified false (e.g. unverified Workspace domain): false', () => {
      const profile = { emails: [{ value: 'user@unverified-domain.com', verified: false }] };
      expect(isProviderEmailVerified('google', profile, {})).toBe(false);
    });

    it('falls back to profile._json.email_verified when emails[0].verified is absent', () => {
      const profile = { emails: [{ value: 'user@gmail.com' }], _json: { email_verified: true } };
      expect(isProviderEmailVerified('google', profile, {})).toBe(true);
    });

    it('no email at all: false (not synthetic-pattern-matched, just absent)', () => {
      expect(isProviderEmailVerified('google', {}, {})).toBe(false);
    });
  });

  describe('github — profile.emails[0].verified, only meaningful with allRawEmails:true', () => {
    it('verified true (allRawEmails:true preserved the real /user/emails flag): true', () => {
      const profile = { emails: [{ value: 'user@users.noreply.github.com', verified: true }] };
      expect(isProviderEmailVerified('github', profile, {})).toBe(true);
    });

    it('verified explicitly false: false', () => {
      const profile = { emails: [{ value: 'user@example.com', verified: false }] };
      expect(isProviderEmailVerified('github', profile, {})).toBe(false);
    });

    it('verified undefined (allRawEmails not set, or library dropped it): conservatively false, not skipped', () => {
      const profile = { emails: [{ value: 'user@example.com' }] };
      expect(isProviderEmailVerified('github', profile, {})).toBe(false);
    });
  });

  describe('line — passport-line-auth never populates profile.email; real email comes from a manually decoded+verified id_token', () => {
    it('real email present, id_token verified email_verified=true: true', () => {
      const profile = { email: 'user@line-real-domain.example', emailVerified: true };
      expect(isProviderEmailVerified('line', profile, {})).toBe(true);
    });

    it('real email present but no confirmed email_verified claim: conservatively false (LINE OIDC email_verified support is unconfirmed per the fact table)', () => {
      const profile = { email: 'user@line-real-domain.example', emailVerified: false };
      expect(isProviderEmailVerified('line', profile, {})).toBe(false);
    });

    it('no email at all (id_token decode failed or absent): false', () => {
      expect(isProviderEmailVerified('line', {}, {})).toBe(false);
    });
  });

  describe('facebook — Graph API email field carries no verified flag at all', () => {
    it('real, non-synthetic email present: still false — no signal exists to trust', () => {
      const profile = { emails: [{ value: 'real.person@example.com' }] };
      expect(isProviderEmailVerified('facebook', profile, {})).toBe(false);
    });
  });
});

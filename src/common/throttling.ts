import { ThrottlerModuleOptions } from '@nestjs/throttler';

const MINUTE = 60_000;

// Two counters: "ip" for every throttled route, and "account" keyed by the
// submitted email, so one account can't be brute-forced from many IPs.
// Storage is in-memory, which is correct only while the API runs as one instance.
export const throttlerOptions: ThrottlerModuleOptions = {
  errorMessage: 'Too many attempts. Please wait a few minutes and try again.',
  throttlers: [
    { name: 'ip', ttl: MINUTE, limit: 60 },
    {
      name: 'account',
      ttl: MINUTE,
      limit: 10_000, // effectively off unless a route sets its own limit
      getTracker: (req) => {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        return email || req.ip;
      },
    },
  ],
};

export const AUTH_LIMITS = {
  login: { ip: { limit: 10, ttl: MINUTE }, account: { limit: 5, ttl: 15 * MINUTE, blockDuration: 15 * MINUTE } },
  signup: { ip: { limit: 5, ttl: 10 * MINUTE } },
  forgotPassword: { ip: { limit: 5, ttl: 15 * MINUTE }, account: { limit: 3, ttl: 60 * MINUTE } },
  resendVerification: { ip: { limit: 3, ttl: 10 * MINUTE } },
  tokenRedeem: { ip: { limit: 10, ttl: 15 * MINUTE } },
  google: { ip: { limit: 20, ttl: MINUTE } },
  // Each test sends a real SMS on the organization's AfroMessage balance.
  testSms: { ip: { limit: 5, ttl: 10 * MINUTE } },
  // Verify widget: anyone can start a session with a publishable key.
  publicVerification: { ip: { limit: 10, ttl: MINUTE } },
  businessLookup: { ip: { limit: 30, ttl: MINUTE } },
};

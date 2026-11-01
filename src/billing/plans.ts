import { Organization, Plan } from '@prisma/client';

// The quota covers live messages we deliver plus completed phone verifications;
// the sandbox has its own separate limits.
export const PLANS: Record<Plan, { name: string; priceEtb: number | null; monthlyQuota: number | null; blurb: string }> = {
  // Telenotify is free and open source (decided 2026-10-24). Every org starts on FREE
  // with a fair-use limit. Owners ask for more on Plan & usage and an operator approves
  // the number in /admin (customMonthlyQuota); the other tiers are ready-made limits an
  // operator can pick. Self-hosting has no limit at all.
  FREE: { name: 'Free', priceEtb: 0, monthlyQuota: 1_000, blurb: 'Free and open source, with a fair-use limit.' },
  STARTER: { name: 'Raised limit', priceEtb: 0, monthlyQuota: 50_000, blurb: 'Granted on request for growing apps.' },
  GROWTH: { name: 'High volume', priceEtb: 0, monthlyQuota: 200_000, blurb: 'Granted on request for busy apps.' },
  BUSINESS: { name: 'Unlimited', priceEtb: 0, monthlyQuota: null, blurb: 'Granted on request, or self-host.' },
};

// null means no limit.
export function monthlyQuota(org: Pick<Organization, 'plan' | 'customMonthlyQuota'>): number | null {
  return org.customMonthlyQuota ?? PLANS[org.plan].monthlyQuota;
}

export function currentPeriod(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

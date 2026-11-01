// Mirrors src/billing/plans.ts in the API; keep both in sync. Telenotify is free and
// open source: every org gets FREE; the others are raised limits granted on request.
export const PLANS = [
  { id: 'FREE', name: 'Free', priceEtb: 0, monthlyQuota: 1_000, blurb: 'Free and open source, with a fair-use limit.' },
  { id: 'STARTER', name: 'Raised limit', priceEtb: 0, monthlyQuota: 50_000, blurb: 'Granted on request for growing apps.' },
  { id: 'GROWTH', name: 'High volume', priceEtb: 0, monthlyQuota: 200_000, blurb: 'Granted on request for busy apps.' },
  { id: 'BUSINESS', name: 'Unlimited', priceEtb: 0, monthlyQuota: null, blurb: 'Granted on request, or self-host.' },
] as const;

export type PlanInfo = (typeof PLANS)[number];

/** Typical bulk SMS price in Ethiopia: AfroMessage charges ETB 0.19838 per 1-part SMS (checked 2026-10-22). */
export const SMS_PRICE_ETB = 0.2;

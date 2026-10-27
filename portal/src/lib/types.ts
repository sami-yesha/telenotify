export interface Me {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
  /** Runs this Telenotify server; can open /admin. */
  isOperator?: boolean;
}

export interface OrgSummary {
  id: string;
  name: string;
  role: 'OWNER' | 'MEMBER';
}

export type PlanId = 'FREE' | 'STARTER' | 'GROWTH' | 'BUSINESS';

export interface Org extends OrgSummary {
  plan: PlanId;
  liveBotConnected: boolean;
  liveBotUsername: string | null;
  status: 'active' | 'suspended';
  suspendedReason: string | null;
  /** Until approved, live sending is capped at unapprovedDailyLimit per day. */
  liveApproved: boolean;
  liveReviewRequestedAt: string | null;
  unapprovedDailyLimit: number;
  businessStatus: BusinessStatus;
}

export type BusinessStatus = 'none' | 'pending' | 'verified' | 'rejected';

export interface BusinessVerification {
  status: BusinessStatus;
  legalName: string | null;
  tin: string | null;
  tradeLicense: string | null;
  website: string | null;
  requestedAt: string | null;
  verifiedAt: string | null;
  rejectReason: string | null;
}

/** GET /v1/public/businesses/:botUsername */
export interface BusinessLookup {
  botUsername: string;
  onTelenotify: boolean;
  verified: boolean;
  legalName?: string | null;
  website?: string | null;
  verifiedSince?: string | null;
}

export interface AdminOrg {
  id: string;
  name: string;
  createdAt: string;
  owners: { email: string; name: string }[];
  status: 'ACTIVE' | 'SUSPENDED';
  suspendedAt: string | null;
  suspendedReason: string | null;
  plan: PlanId;
  planName: string;
  monthlyQuota: number | null;
  liveApprovedAt: string | null;
  liveReviewRequestedAt: string | null;
  liveUseCase: string | null;
  website: string | null;
  business: {
    status: 'NONE' | 'PENDING' | 'VERIFIED' | 'REJECTED';
    legalName: string | null;
    tin: string | null;
    tradeLicense: string | null;
    requestedAt: string | null;
    verifiedAt: string | null;
    rejectReason: string | null;
  };
  liveBotUsername: string | null;
  usedThisMonth: number;
  blocked24h: number;
  reached24h: number;
}

export type EnvName = 'sandbox' | 'live';

export interface EnvironmentInfo {
  type: EnvName;
  keyPrefix: string;
  botConnected: boolean;
  botUsername: string | null;
  eventWebhookUrl: string | null;
  eventSigningSecret: string;
  publishableKey: string | null;
  allowedOrigins: string[];
  /** Live: whether this bot invites people to Telenotify Pass after they verify. */
  passInvite: boolean;
  usage: { messagesToday: number; linkedCustomers: number; dailyMessageLimit?: number; linkedCustomerLimit?: number };
  testCustomers: string[];
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  key?: string;
}

export type MessageStatus = 'QUEUED' | 'SENT' | 'UNDELIVERABLE' | 'FAILED' | 'RECEIVED';

export interface Message {
  id: string;
  to: string;
  direction: 'OUTBOUND' | 'INBOUND';
  status: MessageStatus;
  reason: string | null;
  text: string;
  /** "markdown" when text uses formatting; plainText is the unformatted version. */
  format?: 'plain' | 'markdown';
  plainText?: string;
  error: string | null;
  attempts: number;
  fallback?: MessageFallback | null;
  sentAt: string | null;
  createdAt: string;
}

export interface Customer {
  externalId: string;
  phone: string | null;
  reachable: boolean;
  telegramLinked: boolean;
  telegramUsername: string | null;
  linkedAt: string | null;
  blocked: boolean;
  testCustomer: boolean;
  createdAt: string;
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export interface LinkResult {
  token: string;
  url: string;
  expiresAt: string;
}

export type VerificationStatus = 'PENDING' | 'AWAITING_CONTACT' | 'VERIFIED' | 'FAILED' | 'EXPIRED';

export interface Verification {
  id: string;
  status: VerificationStatus;
  reason: string | null;
  externalId: string | null;
  phone: string | null;
  url: string | null;
  expiresAt: string;
  verifiedAt: string | null;
  createdAt: string;
}

export interface BillingOverview {
  plan: PlanId;
  usage: { used: number; messages: number; verifications: number; quota: number | null; start: string; end: string };
  plans: { id: PlanId; name: string; priceEtb: number | null; monthlyQuota: number | null; blurb: string }[];
}

export interface TeamOverview {
  members: { userId: string; name: string; email: string; role: 'OWNER' | 'MEMBER'; joinedAt: string }[];
  invitations: { id: string; email: string; role: 'OWNER' | 'MEMBER'; expiresAt: string; createdAt: string }[];
}

export interface InvitationPreview {
  orgName: string;
  email: string;
  role: 'OWNER' | 'MEMBER';
  invitedBy: string | null;
}

export type DeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED';

export interface WebhookDelivery {
  id: string;
  event: string;
  status: DeliveryStatus;
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  messageId: string | null;
  payload: Record<string, unknown>;
  attemptLog: { at: string; statusCode?: number; error?: string; durationMs?: number }[];
  deliveredAt: string | null;
  createdAt: string;
}

export interface MessageDetail extends Message {
  telegramMessageId: string | null;
  idempotencyKey: string | null;
  buttons: { text: string; url: string }[][] | null;
  customer: { externalId: string; telegramLinked: boolean; blocked: boolean; telegramUsername: string | null };
  request: Record<string, unknown> | null;
  events: WebhookDelivery[];
}

export interface DayOutcome {
  date: string;
  sent: number;
  undeliverable: number;
  failed: number;
  received: number;
}

export interface Analytics {
  days: number;
  daily: DayOutcome[];
  totals: { sent: number; undeliverable: number; failed: number; received: number; verified: number };
  deliveryRate: number | null;
  reachable: { customers: number; reachable: number; share: number | null };
  smsSaved: { count: number; etb: number; pricePerSmsEtb: number };
}

export interface CustomerDetail {
  customer: Customer & { blockedAt: string | null };
  stats: Partial<Record<MessageStatus, number>>;
  messages: Message[];
  verifications: { id: string; status: VerificationStatus; reason: string | null; phone: string | null; verifiedAt: string | null; createdAt: string }[];
}

export type Locale = 'en' | 'am' | 'om' | 'ti';

export interface MessageTemplate {
  id: string;
  key: string;
  name: string;
  description: string | null;
  variants: Partial<Record<Locale, string>>;
  defaultLocale: Locale;
  format: 'plain' | 'markdown';
  placeholders: string[];
  updatedAt: string;
  createdAt: string;
}

export interface SmsFallbackSettings {
  enabled: boolean;
  provider: 'afromessage';
  /** Sandbox: nothing is sent, results are simulated. */
  simulated: boolean;
  configured: boolean;
  tokenHint: string | null;
  identifierId: string | null;
  senderName: string | null;
  /** Most SMS in any 24 hours; null = no cap. */
  dailyLimit: number | null;
  /** Queued or sent in the last 24 hours (what the limit counts). */
  sentLast24h: number;
  /** Only after saving a new token: what AfroMessage said about it. */
  tokenCheck?: AfroTokenCheck;
}

export interface SmsFallbackHistory {
  items: {
    messageId: string;
    to: string;
    phone: string | null;
    status: 'queued' | 'sent' | 'failed' | 'skipped';
    telegramReason: string | null;
    providerMessageId: string | null;
    error: string | null;
    at: string | null;
  }[];
  /** Pass as ?before= for the next page; null when there are no more. */
  next: string | null;
}

export interface AfroTokenCheck {
  /** false: AfroMessage couldn't be reached, so the token was saved unchecked. */
  verified: boolean;
  balance: string | null;
}

export interface MessageFallback {
  channel: 'sms';
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  error: string | null;
  at: string | null;
}

export type MessageStatus = 'QUEUED' | 'SENT' | 'UNDELIVERABLE' | 'FAILED' | 'RECEIVED';

/** Why a message couldn't be delivered on Telegram. Use your fallback channel for these. */
export type UndeliverableReason = 'not_linked' | 'blocked' | 'chat_gone';
export type FailureReason = 'telegram_unavailable' | 'telegram_rejected';

/** Template languages: English, Amharic, Afaan Oromo, Tigrinya. */
export type Locale = 'en' | 'am' | 'om' | 'ti';

export interface InlineButton {
  text: string;
  url: string;
}

export interface Message {
  id: string;
  /** Your id for the customer. */
  to: string;
  direction: 'OUTBOUND' | 'INBOUND';
  status: MessageStatus;
  priority: 'normal' | 'high';
  /** Template key, when the text came from a template. */
  template: string | null;
  locale: Locale | null;
  reason: UndeliverableReason | FailureReason | null;
  /** As sent: with formatting markers when format is "markdown". */
  text: string;
  format: MessageFormat;
  /** The text without formatting, e.g. to send it by SMS yourself. */
  plainText: string;
  buttons: InlineButton[][] | null;
  idempotencyKey: string | null;
  error: string | null;
  attempts: number;
  /** Set when SMS fallback is on and Telegram couldn't deliver. */
  fallback: MessageFallback | null;
  sentAt: string | null;
  createdAt: string;
}

export interface MessageFallback {
  channel: 'sms';
  /** skipped: the customer has no phone number. */
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  error: string | null;
  at: string | null;
}

export type MessageFormat = 'plain' | 'markdown';

export type LayoutType = 'receipt' | 'alert' | 'reminder' | 'status' | 'info';

/** A ready-made formatted message. */
export interface Layout {
  /** Sets the emoji: receipt ✅, alert ⚠️, reminder ⏰, status 📦, info ℹ️. */
  type: LayoutType;
  title: string;
  /** Replaces the type's emoji; "" for none. */
  emoji?: string;
  /** A paragraph under the title. Formatting allowed. */
  body?: string;
  /** Up to 15 "Label: value" lines. `copy: true` makes the value tap-to-copy. */
  rows?: { label: string; value: string; copy?: boolean }[];
  footer?: string;
}

export interface SendMessageParams {
  /** Your id for the customer (externalId). */
  to: string;
  /** The message text. Send one of `text`, `template` or `layout`. */
  text?: string;
  /**
   * "markdown" turns on formatting in `text`: **bold**, _italic_, ~~strike~~, ||spoiler||,
   * `tap to copy`, [label](https://…), # heading, - list, > quote, >> collapsible quote.
   */
  format?: MessageFormat;
  /** A ready-made formatted message, e.g. a receipt. Send one of `text`, `template` or `layout`. */
  layout?: Layout;
  /** Key of a template created in the portal, e.g. "payment_received". */
  template?: string;
  /** Values for the template's {{placeholders}}. */
  params?: Record<string, string | number>;
  /** Template language. Defaults to the customer's locale, then the template's default. */
  locale?: Locale;
  /** Rows of URL buttons shown under the message. */
  buttons?: InlineButton[][];
  /** Reusing a key returns the original message instead of sending twice. Also makes retries safe. */
  idempotencyKey?: string;
  /** "high" for OTPs and payment/transaction alerts: sent ahead of normal messages. */
  priority?: 'normal' | 'high';
  /** false skips SMS fallback for this message. Only matters when SMS fallback is on. */
  fallback?: boolean;
}

export interface Customer {
  externalId: string;
  phone: string | null;
  /** Preferred template language. */
  locale: Locale | null;
  /** true when a message sent now would go out on Telegram. */
  reachable: boolean;
  telegramLinked: boolean;
  telegramUsername: string | null;
  linkedAt: string | null;
  blocked: boolean;
  testCustomer: boolean;
  createdAt: string;
}

export interface ConnectLink {
  token: string;
  /** t.me link to show as a button or QR code. */
  url: string;
  expiresAt: string;
}

export type VerificationStatus = 'PENDING' | 'AWAITING_CONTACT' | 'VERIFIED' | 'FAILED' | 'EXPIRED';

export interface Verification {
  id: string;
  status: VerificationStatus;
  /** phone_mismatch: the Telegram number differs from `phone`. denied: a Telenotify Pass member tapped "No". */
  reason: 'phone_mismatch' | 'denied' | null;
  /** How it completed: "telegram" (shared their contact with your bot) or "pass" (one tap in Telenotify Pass). */
  method: 'telegram' | 'pass' | null;
  externalId: string | null;
  /** The verified number (normalized, e.g. 251911223344) once VERIFIED. */
  phone: string | null;
  /** t.me link while the verification is open. */
  url: string | null;
  /** Telenotify's hosted verify page for this verification: redirect the person here. */
  hostedUrl: string;
  /** Where the hosted page sends the person when done. */
  returnUrl: string | null;
  expiresAt: string;
  verifiedAt: string | null;
  createdAt: string;
}

/** The signed result from the hosted verify page or the Verify widget. */
export interface VerificationResult {
  id: string;
  status: 'VERIFIED' | 'FAILED';
  /** The verified number, e.g. "251911223344" (null unless VERIFIED). */
  phone: string | null;
  reason: string | null;
  environment: 'sandbox' | 'live';
  iat: number;
  exp: number;
}

export interface CreateVerificationParams {
  /** Hosted verify page: send the person back here when done (?telenotify_verification=…&telenotify_token=…). */
  returnUrl?: string;
  /** Your id for this person; once verified they're also linked for notifications. */
  externalId?: string;
  /** Fail unless the shared Telegram number matches this one. */
  phone?: string;
  /** 1-60, default 10. */
  expiresInMinutes?: number;
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export type EventType =
  | 'message.sent'
  | 'message.undeliverable'
  | 'message.failed'
  | 'message.received'
  | 'customer.linked'
  | 'customer.blocked'
  | 'verification.completed'
  | 'verification.failed'
  | 'webhook.test';

export interface WebhookEvent<T = Record<string, unknown>> {
  id: string;
  event: EventType;
  environment: 'sandbox' | 'live';
  createdAt: string;
  data: T;
}

export interface UpsertCustomerParams {
  phone?: string;
  /** Preferred template language. */
  locale?: Locale;
}

export interface MessageTemplate {
  id: string;
  key: string;
  name: string;
  description: string | null;
  variants: Partial<Record<Locale, string>>;
  defaultLocale: Locale;
  /** Names used as {{placeholders}} across all languages. */
  placeholders: string[];
  createdAt: string;
  updatedAt: string;
}

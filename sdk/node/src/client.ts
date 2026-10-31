import { TelenotifyError } from './errors';
import type {
  ConnectLink,
  CreateVerificationParams,
  Customer,
  Message,
  MessageStatus,
  MessageTemplate,
  Page,
  SendMessageParams,
  UpsertCustomerParams,
  Verification,
} from './types';

export interface TelenotifyOptions {
  /** tn_test_… (sandbox) or tn_live_… (production). Keep it on your server. */
  apiKey: string;
  /** Your Telenotify API address. Defaults to the TELENOTIFY_API_URL environment variable. */
  baseUrl?: string;
  /** Per-request timeout. Default 10 s. */
  timeoutMs?: number;
  /** Retries for network errors, 429 and 5xx on safe requests. Default 2. */
  maxRetries?: number;
  /** Custom fetch (tests, proxies). Defaults to the global fetch. */
  fetch?: typeof fetch;
}

interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Safe to repeat: GETs, and POSTs carrying an idempotency key. */
  retryable?: boolean;
}

export class Telenotify {
  readonly messages: Messages;
  readonly customers: Customers;
  readonly verifications: Verifications;
  readonly templates: Templates;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: TelenotifyOptions) {
    if (!options?.apiKey) throw new Error('Telenotify: apiKey is required');
    this.apiKey = options.apiKey;
    const baseUrl = options.baseUrl ?? process.env.TELENOTIFY_API_URL;
    if (!baseUrl) throw new Error('Telenotify: set baseUrl or the TELENOTIFY_API_URL environment variable');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetchImpl = options.fetch ?? fetch;
    this.messages = new Messages(this);
    this.customers = new Customers(this);
    this.verifications = new Verifications(this);
    this.templates = new Templates(this);
  }

  /** @internal */
  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const attempts = options.retryable ? this.maxRetries + 1 : 1;
    let lastError: TelenotifyError | undefined;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await this.fetchImpl(url, {
          method,
          headers: {
            'x-api-key': this.apiKey,
            'user-agent': 'telenotify-node/0.3.1',
            ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
          },
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (response.ok) return payload as T;

        const raw = payload.message;
        const message = Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' ? raw : `Telenotify API error ${response.status}`;
        lastError = new TelenotifyError(message, response.status, typeof payload.code === 'string' ? payload.code : undefined);
        if (!(response.status === 429 || response.status >= 500)) throw lastError;
      } catch (error) {
        if (error instanceof TelenotifyError && !(error.status === 429 || error.status >= 500)) throw error;
        lastError = error instanceof TelenotifyError ? error : new TelenotifyError((error as Error).message || 'Network error', 0);
      }
      if (attempt < attempts) await sleep(Math.min(4_000, 300 * 2 ** (attempt - 1)));
    }
    throw lastError!;
  }
}

class Messages {
  constructor(private readonly client: Telenotify) {}

  /**
   * Sends a message on Telegram. Check `status`: `UNDELIVERABLE` means use your
   * fallback channel now; `QUEUED` means the result arrives as a webhook event.
   */
  send(params: SendMessageParams): Promise<Message> {
    return this.client.request('POST', '/v1/messages', { body: params, retryable: Boolean(params.idempotencyKey) });
  }

  get(id: string): Promise<Message> {
    return this.client.request('GET', `/v1/messages/${encodeURIComponent(id)}`, { retryable: true });
  }

  list(params: { customer?: string; status?: MessageStatus; cursor?: string; limit?: number } = {}): Promise<Page<Message>> {
    return this.client.request('GET', '/v1/messages', { query: params, retryable: true });
  }
}

class Customers {
  constructor(private readonly client: Telenotify) {}

  /** One-time t.me link that connects this customer to your bot. */
  createLink(externalId: string, options: { phone?: string } = {}): Promise<ConnectLink> {
    return this.client.request('POST', '/v1/customers/link', { body: { externalId, ...options } });
  }

  get(externalId: string): Promise<Customer> {
    return this.client.request('GET', `/v1/customers/${encodeURIComponent(externalId)}`, { retryable: true });
  }

  /** Creates or updates a customer, e.g. to store a phone for phone-based linking or their language. */
  upsert(externalId: string, params: UpsertCustomerParams = {}): Promise<Customer> {
    return this.client.request('PUT', `/v1/customers/${encodeURIComponent(externalId)}`, { body: params, retryable: true });
  }
}

class Verifications {
  constructor(private readonly client: Telenotify) {}

  /** Starts "Verify with Telegram". Send the person to `url`, then poll `get` or wait for the webhook. */
  create(params: CreateVerificationParams = {}): Promise<Verification> {
    return this.client.request('POST', '/v1/verifications', { body: params });
  }

  get(id: string): Promise<Verification> {
    return this.client.request('GET', `/v1/verifications/${encodeURIComponent(id)}`, { retryable: true });
  }
}

class Templates {
  constructor(private readonly client: Telenotify) {}

  /** Templates are managed in the portal; list them to check keys and placeholders. */
  list(): Promise<MessageTemplate[]> {
    return this.client.request('GET', '/v1/templates', { retryable: true });
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

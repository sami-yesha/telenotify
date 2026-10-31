// The few Telenotify API calls the CLI makes. Uses the built-in fetch (Node 18+).

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface ListenSession {
  environment: 'sandbox' | 'live';
  organization: string;
  webhookUrl: string | null;
  cursor: string | null;
  renewEverySeconds: number;
}

export interface CliEvent {
  id: string;
  event: string;
  createdAt: string;
  /** The exact JSON body a webhook delivery sends. */
  body: string;
  /** The x-telenotify-signature header for that body, made by the server with your signing secret. */
  signature: string;
}

export class Api {
  constructor(
    readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 15_000,
  ) {}

  listen(): Promise<ListenSession> {
    return this.call('POST', '/v1/cli/listen');
  }

  events(cursor: string | null): Promise<{ events: CliEvent[]; cursor: string | null }> {
    return this.call('GET', `/v1/cli/events${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
  }

  trigger(event: string): Promise<{ id: string; event: string; sentToWebhookUrl: boolean }> {
    return this.call('POST', '/v1/cli/trigger', { event });
  }

  send(body: Record<string, unknown>): Promise<{ id: string; status: string; reason: string | null; to: string }> {
    return this.call('POST', '/v1/messages', body);
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { 'x-api-key': this.apiKey, 'content-type': 'application/json', 'user-agent': 'telenotify-cli' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ApiError(0, `Can't reach ${this.baseUrl}: ${(error as Error).message}`);
    }
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON (e.g. a proxy error page).
    }
    if (!response.ok) {
      const message = (data as { message?: string | string[] } | null)?.message;
      throw new ApiError(response.status, Array.isArray(message) ? message.join('; ') : message || `HTTP ${response.status}`);
    }
    return data as T;
  }
}

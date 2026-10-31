const SEND_URL = 'https://api.afromessage.com/api/send';
const TIMEOUT_MS = 10_000;

export interface AfroMessageCredentials {
  token: string;
  /** Identifier id from the AfroMessage dashboard; omitted on beta accounts. */
  identifierId?: string | null;
  senderName?: string | null;
}

export class AfroMessageError extends Error {
  constructor(
    message: string,
    /** Network errors and 5xx: worth trying again. Rejections (bad token, no balance) are not. */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

// AfroMessage answers 200 with { acknowledge: "success" | "error", response } for
// accepted and rejected requests alike, so both the HTTP status and the body count.
export async function sendAfroMessage(
  credentials: AfroMessageCredentials,
  to: string,
  message: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ messageId: string | null }> {
  const body: Record<string, string> = { to, message };
  if (credentials.identifierId) body.from = credentials.identifierId;
  if (credentials.senderName) body.sender = credentials.senderName;

  let response: Response;
  try {
    response = await fetchImpl(SEND_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${credentials.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new AfroMessageError(`AfroMessage unreachable: ${(error as Error).message}`, true);
  }

  const raw = await response.text();
  let data: { acknowledge?: string; response?: { message_id?: string; errors?: unknown } } | null = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // Not JSON; reported below.
  }
  if (response.status >= 500) {
    const detail = data?.response?.errors ?? data?.response ?? (raw && raw.length < 200 ? raw.trim() : null);
    const detailStr = detail ? `: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : '';
    throw new AfroMessageError(`AfroMessage error (HTTP ${response.status})${detailStr}`, true);
  }
  if (!response.ok || data?.acknowledge !== 'success') {
    const rawDetail = data?.response?.errors ?? data?.response ?? raw.slice(0, 200);
    const detail = Array.isArray(rawDetail) ? rawDetail.join(', ') : typeof rawDetail === 'string' ? rawDetail : JSON.stringify(rawDetail);
    throw new AfroMessageError(`AfroMessage: ${detail}`, false);
  }
  return { messageId: data.response?.message_id ?? null };
}

/** AfroMessage expects +2519…; our stored numbers are digits only. */
export function toAfroMessageNumber(phone: string): string {
  return phone.startsWith('+') ? phone : `+${phone}`;
}

const BALANCE_URL = 'https://api.afromessage.com/api/balance';

export type TokenCheck = { valid: true; balance: string | null } | { valid: false; reason: string };

// Checks a token without sending an SMS. AfroMessage authenticates before anything
// else, so a 401/403 means the token itself is wrong. Network trouble throws a
// retryable AfroMessageError: the caller decides whether that should block a save.
export async function checkAfroMessageToken(token: string, fetchImpl: typeof fetch = fetch): Promise<TokenCheck> {
  let response: Response;
  try {
    response = await fetchImpl(BALANCE_URL, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    throw new AfroMessageError(`AfroMessage unreachable: ${(error as Error).message}`, true);
  }
  const raw = await response.text();
  if (response.status === 401 || response.status === 403) {
    // e.g. "Unauthorized (401-11) : Invalid token. JWT signature does not match…"
    const detail = raw.replace(/^Unauthorized \([^)]*\)\s*:\s*/, '').split('. ')[0].trim();
    return { valid: false, reason: detail || 'Invalid token' };
  }
  if (!response.ok) throw new AfroMessageError(`AfroMessage error (HTTP ${response.status})`, response.status >= 500);
  return { valid: true, balance: findBalance(raw) };
}

// The balance response isn't documented, so look for a "balance" field anywhere in it.
function findBalance(raw: string): string | null {
  try {
    const search = (value: unknown): unknown => {
      if (!value || typeof value !== 'object') return undefined;
      for (const [key, inner] of Object.entries(value)) {
        if (/balance/i.test(key) && (typeof inner === 'number' || typeof inner === 'string')) return inner;
        const found = search(inner);
        if (found !== undefined) return found;
      }
      return undefined;
    };
    const found = search(JSON.parse(raw));
    return found === undefined ? null : String(found);
  } catch {
    return null;
  }
}

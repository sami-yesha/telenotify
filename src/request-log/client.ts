// Which tool made an API call, read from its User-Agent. Our SDKs and CLI send
// "telenotify-<name>/<version>"; everything else is grouped loosely, keeping the
// tool's own name so operators can see which languages people use without an SDK.
export type ApiClient = 'node' | 'python' | 'cli' | 'http' | 'other';

const OURS: Record<string, ApiClient> = { 'telenotify-node': 'node', 'telenotify-python': 'python', 'telenotify-cli': 'cli' };

// Tools people use to call an API by hand.
const HTTP_TOOLS = /^(curl|PostmanRuntime|insomnia|HTTPie|Wget|Thunder Client|Bruno)(?:\/(\S+))?/i;

export function parseClient(userAgent?: string | null): { client: ApiClient; clientDetail: string | null } {
  const ua = (userAgent ?? '').trim();
  const ours = /^(telenotify-(?:node|python|cli))(?:\/([\w.+-]+))?/i.exec(ua);
  if (ours) return { client: OURS[ours[1].toLowerCase()], clientDetail: ours[2]?.slice(0, 20) ?? null };
  const tool = HTTP_TOOLS.exec(ua);
  if (tool) return { client: 'http', clientDetail: (tool[2] ? `${tool[1]}/${tool[2]}` : tool[1]).slice(0, 40) };
  // The first product token, e.g. "python-requests/2.31.0", "axios/1.7.2", "Go-http-client/2.0".
  const product = /^[^\s(;]+/.exec(ua)?.[0];
  return { client: 'other', clientDetail: product ? product.slice(0, 40) : null };
}

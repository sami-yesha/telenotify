import { Api, ApiError, CliEvent } from './api';
import { color } from './output';

export interface ListenOptions {
  /** Local URL to POST each event to; without it, events are only printed. */
  forward?: string;
  /** Print each event's JSON body too. */
  printJson?: boolean;
  pollMs?: number;
  log?: (line: string) => void;
  signal?: AbortSignal;
}

export interface ForwardResult {
  status?: number;
  error?: string;
  ms: number;
}

// Forwards an event exactly as Telenotify would deliver it: same body, same headers.
export async function forwardEvent(url: string, event: CliEvent, timeoutMs = 10_000): Promise<ForwardResult> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Telenotify-Webhooks/1.0 (cli)',
        'x-telenotify-signature': event.signature,
        'x-telenotify-event-id': event.id,
      },
      body: event.body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.body?.cancel();
    return { status: response.status, ms: Date.now() - started };
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return { error: cause?.code === 'ECONNREFUSED' ? 'connection refused (is your server running?)' : (error as Error).message, ms: Date.now() - started };
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

// Opens a listening session, renews it every 30s and polls for events until aborted.
// Network trouble backs off and retries instead of exiting, since the CLI is meant to
// stay open while you work.
export async function listen(api: Api, options: ListenOptions = {}): Promise<void> {
  const log = options.log ?? ((line: string) => console.log(line));
  const pollMs = options.pollMs ?? 2_000;
  const session = await api.listen();

  log(`${color.green('Ready.')} Listening for ${session.environment === 'live' ? color.red('LIVE') : 'sandbox'} events of ${color.bold(session.organization)}.`);
  if (session.environment === 'live') log(color.yellow('These are real customers’ events. Use a sandbox key while developing.'));
  log(options.forward ? `Forwarding to ${color.bold(options.forward)}, signed with your signing secret.` : 'Printing events only. Add --forward http://localhost:3000/webhooks to send them to your server.');
  if (session.webhookUrl) log(color.dim(`Your webhook URL (${session.webhookUrl}) keeps receiving them too.`));
  log(color.dim('Try it: in another terminal run `npx telenotify trigger message.sent`. Press Ctrl+C to stop.'));

  let cursor = session.cursor;
  let renewedAt = Date.now();
  let failures = 0;

  while (!options.signal?.aborted) {
    try {
      if (Date.now() - renewedAt > session.renewEverySeconds * 1000) {
        await api.listen();
        renewedAt = Date.now();
      }
      const page = await api.events(cursor);
      if (failures > 0) log(color.green('Connected again.'));
      failures = 0;
      for (const event of page.events) {
        const time = new Date(event.createdAt).toLocaleTimeString();
        let result = '';
        if (options.forward) {
          const forwarded = await forwardEvent(options.forward, event);
          result = forwarded.status
            ? ` → ${forwarded.status < 300 ? color.green(String(forwarded.status)) : color.red(String(forwarded.status))} ${color.dim(`${forwarded.ms}ms`)}`
            : ` → ${color.red(forwarded.error ?? 'failed')}`;
        }
        log(`${color.dim(time)}  ${color.cyan(event.event.padEnd(24))} ${color.dim(event.id)}${result}`);
        if (options.printJson) log(JSON.stringify(JSON.parse(event.body), null, 2));
      }
      cursor = page.cursor;
      // A full page means more are waiting: fetch again right away.
      if (page.events.length < 50) await sleep(pollMs, options.signal);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) throw error;
      failures += 1;
      if (failures === 1) log(color.yellow(`Connection problem: ${(error as Error).message}. Retrying…`));
      await sleep(Math.min(30_000, pollMs * 2 ** Math.min(failures, 4)), options.signal);
    }
  }
}

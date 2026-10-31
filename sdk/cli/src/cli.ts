#!/usr/bin/env node
import { createInterface } from 'readline';
import { Api, ApiError } from './api';
import { clearSettings, readSettings, resolve, saveSettings } from './config';
import { listen } from './listen';
import { color } from './output';

const VERSION = '0.1.0';

const EVENTS = [
  'message.sent',
  'message.undeliverable',
  'message.failed',
  'message.received',
  'message.fallback_sent',
  'message.fallback_failed',
  'customer.linked',
  'customer.blocked',
  'verification.completed',
  'verification.failed',
  'webhook.test',
];

const HELP = `${color.bold('telenotify')} ${VERSION}: test your Telenotify integration from your computer

${color.bold('Usage')}
  npx telenotify <command> [options]

${color.bold('Commands')}
  login                       Save your API key (sandbox tn_test_… recommended)
  listen [--forward <url>]    Receive webhook events here, no public URL needed.
                              With --forward, each event is POSTed to your local
                              server with a real x-telenotify-signature header.
  trigger <event>             Send a sample event (see --list)
  send <to> <text>            Send a message, e.g. to the test customer test_linked
  logout                      Forget the saved key

${color.bold('Options')}
  --key <tn_…>                API key (or TELENOTIFY_API_KEY)
  --api-url <url>             API address (or TELENOTIFY_API_URL)
  --print-json                listen: also print each event's body
  --markdown                  send: use **bold**, \`code\` and other formatting
  -h, --help / -v, --version

${color.bold('Example')}
  npx telenotify listen --forward http://localhost:3000/webhooks/telenotify
  npx telenotify trigger message.undeliverable`;

interface Parsed {
  command?: string;
  args: string[];
  flags: Record<string, string | true>;
}

export function parse(argv: string[]): Parsed {
  const parsed: Parsed = { args: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h') parsed.flags.help = true;
    else if (arg === '-v') parsed.flags.version = true;
    else if (arg === '-f') parsed.flags.forward = argv[++i] ?? '';
    else if (arg.startsWith('--')) {
      const [name, inline] = arg.slice(2).split(/=(.*)/s, 2);
      const takesValue = ['key', 'api-url', 'forward'].includes(name);
      parsed.flags[name] = inline ?? (takesValue ? (argv[++i] ?? '') : true);
    } else if (!parsed.command) parsed.command = arg;
    else parsed.args.push(arg);
  }
  return parsed;
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((done) => rl.question(question, (answer) => (rl.close(), done(answer.trim()))));
}

function client(flags: Parsed['flags']): Api {
  const { apiKey, apiUrl } = resolve({ key: flags.key as string | undefined, apiUrl: flags['api-url'] as string | undefined });
  if (!apiKey) throw new UsageError('No API key. Run `npx telenotify login`, or pass --key / set TELENOTIFY_API_KEY.');
  return new Api(apiUrl, apiKey);
}

class UsageError extends Error {}

export async function run(argv: string[], log: (line: string) => void = console.log): Promise<number> {
  const { command, args, flags } = parse(argv);
  if (flags.version) return log(VERSION), 0;
  if (flags.help || !command || command === 'help') return log(HELP), 0;

  switch (command) {
    case 'login': {
      const apiKey = (flags.key as string) || (await ask('Paste your API key (portal → API keys): '));
      if (!/^tn_(test|live)_/.test(apiKey)) throw new UsageError('That doesn’t look like a Telenotify API key (tn_test_… or tn_live_…).');
      const apiUrl = resolve({ apiUrl: flags['api-url'] as string | undefined }).apiUrl;
      await new Api(apiUrl, apiKey).events(null); // checks the key without side effects
      const path = saveSettings({ ...readSettings(), apiKey, apiUrl });
      log(`${color.green('Logged in.')} Key saved to ${path} (readable only by you).`);
      if (apiKey.startsWith('tn_live_')) log(color.yellow('That is a live key. For development, a sandbox key (tn_test_…) is safer.'));
      return 0;
    }
    case 'logout':
      log(clearSettings() ? 'Logged out: the saved key is deleted.' : 'You were not logged in.');
      return 0;
    case 'listen': {
      if (flags.forward === '') throw new UsageError('--forward needs a URL, e.g. --forward http://localhost:3000/webhooks');
      const forward = flags.forward as string | undefined;
      if (forward && !/^https?:\/\//.test(forward)) throw new UsageError('--forward must start with http:// or https://');
      const controller = new AbortController();
      process.once('SIGINT', () => {
        log(color.dim('\nStopped.'));
        controller.abort();
      });
      await listen(client(flags), { forward, printJson: Boolean(flags['print-json']), log, signal: controller.signal });
      return 0;
    }
    case 'trigger': {
      if (flags.list || !args[0]) {
        log(`Events you can trigger:\n${EVENTS.map((e) => `  ${e}`).join('\n')}`);
        return args[0] || flags.list ? 0 : 1;
      }
      const result = await client(flags).trigger(args[0]);
      log(`${color.green('Sent')} ${color.cyan(result.event)} ${color.dim(result.id)}${result.sentToWebhookUrl ? ' (also to your webhook URL)' : ''}`);
      return 0;
    }
    case 'send': {
      const [to, ...words] = args;
      if (!to || words.length === 0) throw new UsageError('Usage: npx telenotify send <customer id> <text>   e.g. send test_linked "Hello 👋"');
      const message = await client(flags).send({ to, text: words.join(' '), ...(flags.markdown ? { format: 'markdown' } : {}) });
      log(`${message.status === 'UNDELIVERABLE' ? color.yellow(message.status) : color.green(message.status)} ${color.dim(message.id)}${message.reason ? ` (${message.reason})` : ''}`);
      return 0;
    }
    default:
      throw new UsageError(`Unknown command "${command}". Run \`npx telenotify --help\`.`);
  }
}

if (require.main === module) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: Error) => {
      const prefix = error instanceof ApiError && error.status === 401 ? 'Invalid or revoked API key. ' : '';
      console.error(color.red(`Error: ${prefix}${error.message}`));
      process.exit(error instanceof UsageError ? 2 : 1);
    },
  );
}

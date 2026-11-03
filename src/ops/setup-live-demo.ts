// Operator command: sets up the "Telenotify Demo" organization that the public live
// demo (examples/live-demo) uses, the same way the portal would, and prints the demo's
// settings. deploy/auto-deploy.sh runs it inside the API container:
//
//   printf '%s' "$BOT_TOKEN" | docker compose exec -T api node dist/ops/setup-live-demo.js
//
// stdin: the demo bot's token (may be empty when the bot is already connected).
// stdout: TELENOTIFY_API_KEY=… and TELENOTIFY_SIGNING_SECRET=… lines, nothing else.
// The organization belongs to the first OPERATOR_EMAILS account (or DEMO_OWNER_EMAIL).
// Live sending still needs an operator's approval in /admin.
import { Environment, PrismaClient, User } from '@prisma/client';
import { encrypt, publishableKey, randomToken, sha256 } from '../common/crypto';
import { TelegramApiClient, TelegramApiError } from '../telegram/telegram-api.client';

const ORG_NAME = 'Telenotify Demo';
const KEY_NAME = 'Live demo';
const log = (line: string) => process.stderr.write(`${line}\n`);

async function main() {
  const demoUrl = (process.env.DEMO_PUBLIC_URL ?? 'https://telenotify-demo.duckdns.org').replace(/\/$/, '');
  const ownerEmail = (process.env.DEMO_OWNER_EMAIL ?? process.env.OPERATOR_EMAILS ?? '').split(',')[0].trim().toLowerCase();
  const botToken = (await readStdin()).trim();
  if (!ownerEmail) throw new Error('Set OPERATOR_EMAILS (or DEMO_OWNER_EMAIL): the demo organization needs an owner.');

  const prisma = new PrismaClient();
  try {
    const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
    if (!owner) throw new Error(`No account for ${ownerEmail}. Sign up in the portal with that email first.`);

    const live = await liveEnvironment(prisma, owner);
    if (botToken) await connectBot(prisma, live, botToken, owner);
    else if (!live.botUsername) throw new Error('The demo has no bot yet: give the bot token from @BotFather.');

    const webhookUrl = `${demoUrl}/api/telenotify/webhook`;
    if (live.eventWebhookUrl !== webhookUrl) {
      await prisma.environment.update({ where: { id: live.id }, data: { eventWebhookUrl: webhookUrl } });
      await audit(prisma, live.orgId, owner, 'webhook.updated', webhookUrl);
      log(`Webhook URL set to ${webhookUrl}`);
    }

    // A fresh key on every run; the previous demo keys stop working.
    const old = await prisma.apiKey.updateMany({ where: { environmentId: live.id, name: KEY_NAME, revokedAt: null }, data: { revokedAt: new Date() } });
    const key = `tn_live_${randomToken(24)}`;
    await prisma.apiKey.create({ data: { environmentId: live.id, name: KEY_NAME, keyHash: sha256(key), prefix: key.slice(0, 12), createdById: owner.id } });
    await audit(prisma, live.orgId, owner, 'api_key.created', KEY_NAME, { environment: 'live', prefix: key.slice(0, 12) });
    log(`Created the "${KEY_NAME}" live API key${old.count ? ` (revoked ${old.count} older one${old.count > 1 ? 's' : ''})` : ''}`);

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: live.orgId } });
    log(org.liveApprovedAt ? 'Live sending is approved.' : `Next: approve "${ORG_NAME}" in /admin so the demo can send.`);

    process.stdout.write(`TELENOTIFY_API_KEY=${key}\nTELENOTIFY_SIGNING_SECRET=${live.eventSigningSecret}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

/** The demo organization's live environment, creating the organization the way the portal does. */
async function liveEnvironment(prisma: PrismaClient, owner: User): Promise<Environment> {
  const existing = await prisma.environment.findFirst({
    where: { type: 'LIVE', org: { name: ORG_NAME, memberships: { some: { userId: owner.id } } } },
  });
  if (existing) {
    log(`Using the existing "${ORG_NAME}" organization`);
    return existing;
  }
  const org = await prisma.organization.create({
    data: {
      name: ORG_NAME,
      memberships: { create: { userId: owner.id, role: 'OWNER' } },
      environments: {
        create: (['SANDBOX', 'LIVE'] as const).map((type) => ({
          type,
          webhookSecret: randomToken(32),
          eventSigningSecret: `whsec_${randomToken(24)}`,
          publishableKey: publishableKey(type),
        })),
      },
    },
    include: { environments: true },
  });
  await audit(prisma, org.id, owner, 'org.created', org.name);
  log(`Created the "${ORG_NAME}" organization, owned by ${owner.email}`);
  return org.environments.find((e) => e.type === 'LIVE')!;
}

// Same steps as connecting a bot in the portal: check the token, point the bot's
// webhook at this API, store the token encrypted.
async function connectBot(prisma: PrismaClient, live: Environment, botToken: string, owner: User) {
  if (botToken === process.env.SANDBOX_BOT_TOKEN) throw new Error('That is the sandbox bot; create a separate bot for the demo.');
  const client = new TelegramApiClient(botToken);
  let username: string;
  try {
    username = (await client.getMe()).username;
  } catch (error) {
    if (error instanceof TelegramApiError) throw new Error(`Telegram rejected the bot token: ${error.description}`);
    throw error;
  }
  const taken = await prisma.environment.findFirst({ where: { botUsername: username, NOT: { id: live.id } } });
  if (taken) throw new Error(`@${username} is already connected to another organization.`);

  const base = required('PUBLIC_BASE_URL').replace(/\/$/, '');
  await client.setWebhook(`${base}/telegram/webhook/${live.id}`, live.webhookSecret);
  await prisma.environment.update({
    where: { id: live.id },
    data: { botTokenEncrypted: encrypt(botToken, required('ENCRYPTION_KEY')), botUsername: username },
  });
  live.botUsername = username;
  await audit(prisma, live.orgId, owner, 'bot.connected', `@${username}`);
  log(`Connected @${username}`);
}

function audit(prisma: PrismaClient, orgId: string, actor: User, action: string, target: string, metadata?: Record<string, string>) {
  return prisma.auditEvent.create({ data: { orgId, actorUserId: actor.id, actorEmail: actor.email, action, target, metadata } });
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

main().catch((error: Error) => {
  log(`Live demo setup failed: ${error.message}`);
  process.exit(1);
});

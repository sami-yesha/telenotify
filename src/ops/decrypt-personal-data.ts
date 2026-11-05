// Rollback for field encryption: turns customers' encrypted personal data back into
// plain values, so a Telenotify version from before encryption can read it again.
// Only for rolling back. The current API encrypts everything again when it starts,
// so stop it first and deploy the older version right after.
//
// On the server (see docs/BACKUPS.md, "Rolling back field encryption"):
//   docker compose -f docker-compose.vps.yml stop api
//   docker compose -f docker-compose.vps.yml run --rm --no-deps api node dist/ops/decrypt-personal-data.js --yes
import { PrismaClient } from '@prisma/client';
import { ENCRYPTED_FIELDS, FieldCipher } from '../prisma/field-encryption';

const BATCH = 500;

export async function decryptPersonalData(prisma: PrismaClient, cipher: FieldCipher): Promise<number> {
  let total = 0;
  for (const [model, fields] of Object.entries(ENCRYPTED_FIELDS)) {
    // Identifiers come from our own constant, never from input.
    const encrypted = Object.entries(fields)
      .map(([field, mode]) => (mode === 'json' ? `("${field}"::text LIKE '"enc:%')` : `("${field}" LIKE 'enc:%')`))
      .join(' OR ');
    const columns = Object.keys(fields).map((f) => `"${f}"`).join(', ');
    for (;;) {
      const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT id, ${columns} FROM "${model}" WHERE ${encrypted} LIMIT ${BATCH}`);
      if (rows.length === 0) break;
      for (const row of rows) {
        const sets: string[] = [];
        const values: unknown[] = [];
        for (const [field, mode] of Object.entries(fields)) {
          const value = row[field];
          if (typeof value !== 'string' || !value.startsWith('enc:')) continue;
          // Json columns decrypt to their JSON text.
          values.push(cipher.decrypt(value));
          sets.push(mode === 'json' ? `"${field}" = $${values.length}::jsonb` : `"${field}" = $${values.length}`);
        }
        if (sets.length === 0) continue;
        values.push(row.id);
        await prisma.$executeRawUnsafe(`UPDATE "${model}" SET ${sets.join(', ')} WHERE id = $${values.length}`, ...values);
        total++;
      }
    }
  }
  return total;
}

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('This decrypts customers\' personal data in the database, for rolling back to a version without encryption.');
    console.error('Stop the API first (it encrypts again on start), then run again with --yes.');
    process.exit(1);
  }
  const cipher = new FieldCipher(process.env.ENCRYPTION_KEY ?? '');
  const prisma = new PrismaClient();
  try {
    const total = await decryptPersonalData(prisma, cipher);
    console.error(`Decrypted ${total} rows. Now deploy the older version; don't start this one again.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Rollback failed: ${(error as Error).message}`);
    process.exit(1);
  });
}

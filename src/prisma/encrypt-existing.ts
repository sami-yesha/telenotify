import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ENCRYPTED_FIELDS, FieldCipher } from './field-encryption';

const BATCH = 500;

// Encrypts rows written before field encryption existed (or by an older version).
// Runs at startup, before the API takes traffic: lookups compare encrypted values,
// so a plain row would otherwise not be found. Idempotent and resumable. Writes
// with raw SQL so `updatedAt` stays as it was.
export async function encryptExistingRows(prisma: PrismaClient, cipher: FieldCipher, logger = new Logger('FieldEncryption')): Promise<number> {
  let total = 0;
  for (const [model, fields] of Object.entries(ENCRYPTED_FIELDS)) {
    // Identifiers come from our own constant, never from input.
    const plain = Object.entries(fields)
      .map(([field, mode]) => (mode === 'json' ? `("${field}"::text NOT LIKE '"enc:%')` : `("${field}" IS NOT NULL AND "${field}" NOT LIKE 'enc:%')`))
      .join(' OR ');
    const columns = Object.keys(fields).map((f) => `"${f}"`).join(', ');
    for (;;) {
      const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT id, ${columns} FROM "${model}" WHERE ${plain} LIMIT ${BATCH}`);
      if (rows.length === 0) break;
      for (const row of rows) {
        const sets: string[] = [];
        const values: unknown[] = [];
        for (const [field, mode] of Object.entries(fields)) {
          const value = row[field];
          if (value === null || value === undefined) continue;
          if (mode === 'json') {
            if (typeof value === 'string' && value.startsWith('enc:')) continue;
            values.push(cipher.encryptJson(value));
            sets.push(`"${field}" = to_jsonb($${values.length}::text)`);
          } else {
            if (String(value).startsWith('enc:')) continue;
            values.push(cipher.encrypt(String(value), mode));
            sets.push(`"${field}" = $${values.length}`);
          }
        }
        if (sets.length === 0) continue;
        values.push(row.id);
        await prisma.$executeRawUnsafe(`UPDATE "${model}" SET ${sets.join(', ')} WHERE id = $${values.length}`, ...values);
        total++;
      }
    }
  }
  if (total) logger.log(`Encrypted personal data in ${total} existing rows`);
  return total;
}

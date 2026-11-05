import { Prisma } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'crypto';

// Encryption at rest for the personal data of the people businesses message
// (Telegram's Bot Developer Terms, 4.4a). Applied to every Prisma query, so the
// rest of the code reads and writes plain values.
//
// - deterministic: the same value always encrypts the same way, so equality
//   lookups, `in` lists and unique constraints keep working. Used for phone
//   numbers and Telegram IDs, which we look up by value.
// - random: a fresh IV each time; can't be looked up by value.
// - json: a Json column, encrypted whole (randomly) and stored as a JSON string.
//
// Keys are derived from ENCRYPTION_KEY, which lives in the server's environment,
// never in the database.
type Mode = 'deterministic' | 'random' | 'json';

export const ENCRYPTED_FIELDS: Record<string, Record<string, Mode>> = {
  Customer: { phone: 'deterministic', telegramChatId: 'deterministic', telegramUsername: 'random' },
  Message: { text: 'random' },
  Verification: { expectedPhone: 'deterministic', phone: 'deterministic', telegramUserId: 'deterministic', telegramChatId: 'deterministic' },
  PassIdentity: { telegramUserId: 'deterministic', chatId: 'deterministic', phone: 'deterministic' },
  WebhookDelivery: { payload: 'json' },
};

const PREFIX = { deterministic: 'enc:d1:', random: 'enc:r1:', json: 'enc:j1:' } as const;
const ENCRYPTED = /^enc:(d1|r1|j1):/;

export class FieldCipher {
  private readonly encKey: Buffer;
  private readonly ivKey: Buffer;

  constructor(keyBase64: string) {
    const master = Buffer.from(keyBase64 ?? '', 'base64');
    if (master.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes, base64-encoded');
    this.encKey = Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'telenotify field encryption', 32));
    this.ivKey = Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'telenotify deterministic iv', 32));
  }

  encrypt(value: string, mode: Mode): string {
    if (ENCRYPTED.test(value)) return value;
    // Deterministic: the IV is a keyed hash of the value (synthetic IV), so it
    // repeats only for the same value.
    const iv = mode === 'deterministic' ? createHmac('sha256', this.ivKey).update(value).digest().subarray(0, 12) : randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return PREFIX[mode] + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
  }

  /** Values without our prefix are returned as they are (rows not yet encrypted). */
  decrypt(value: string): string {
    if (!ENCRYPTED.test(value)) return value;
    const raw = Buffer.from(value.slice(PREFIX.random.length), 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', this.encKey, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  }

  encryptJson(value: unknown): string {
    return this.encrypt(JSON.stringify(value), 'json');
  }

  /** Decrypts every encrypted string in a query result, however deeply nested. */
  decryptResult<T>(value: T): T {
    if (typeof value === 'string') {
      if (!ENCRYPTED.test(value)) return value;
      try {
        const plain = this.decrypt(value);
        return (value.startsWith(PREFIX.json) ? JSON.parse(plain) : plain) as T;
      } catch {
        // Not ours after all (someone typed "enc:d1:…" into a name, say): leave it.
        return value;
      }
    }
    if (Array.isArray(value)) return value.map((v) => this.decryptResult(v)) as T;
    if (isPlainObject(value)) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = this.decryptResult(v);
      return out as T;
    }
    return value;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const relations = new Map<string, Map<string, string>>(
  Prisma.dmmf.datamodel.models.map((m) => [m.name, new Map(m.fields.filter((f) => f.kind === 'object').map((f) => [f.name, f.type]))]),
);
const scalarFields = new Map<string, Set<string>>(Prisma.dmmf.datamodel.models.map((m) => [m.name, new Set(m.fields.filter((f) => f.kind !== 'object').map((f) => f.name))]));

const LOGICAL = new Set(['AND', 'OR', 'NOT']);
const RELATION_FILTERS = new Set(['some', 'every', 'none', 'is', 'isNot']);

// Rewrites query arguments: values written to encrypted fields, and values they're
// compared with, are encrypted. Anything that can't work on ciphertext (contains,
// ordering by value, equality on a random field) throws instead of silently
// matching nothing.
export class ArgsEncryptor {
  constructor(private readonly cipher: FieldCipher) {}

  args(model: string, operation: string, args: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    if (!args || !this.touches(model)) return args;
    const out: Record<string, unknown> = { ...args };
    if (out.where) out.where = this.where(model, out.where);
    if (out.cursor) out.cursor = this.where(model, out.cursor);
    if (out.data) out.data = Array.isArray(out.data) ? out.data.map((d) => this.data(model, d)) : this.data(model, out.data);
    if (operation === 'upsert') {
      out.create = this.data(model, out.create);
      out.update = this.data(model, out.update);
    }
    if (out.include) out.include = this.projection(model, out.include);
    if (out.select) out.select = this.projection(model, out.select);
    if (out.orderBy) this.assertNoOrdering(model, out.orderBy);
    return out;
  }

  // Does this model, or anything reachable from it, have encrypted fields? Cheap
  // enough to compute each time and keeps unrelated queries untouched.
  private touches(model: string, seen = new Set<string>()): boolean {
    if (ENCRYPTED_FIELDS[model]) return true;
    seen.add(model);
    for (const related of relations.get(model)?.values() ?? []) {
      if (!seen.has(related) && this.touches(related, seen)) return true;
    }
    return false;
  }

  private value(model: string, field: string, value: unknown): unknown {
    const mode = ENCRYPTED_FIELDS[model]?.[field];
    if (!mode || value === null || value === undefined) return value;
    if (mode === 'json') return this.cipher.encryptJson(value);
    if (typeof value !== 'string') return value;
    return this.cipher.encrypt(value, mode);
  }

  private where(model: string, where: unknown): unknown {
    if (Array.isArray(where)) return where.map((w) => this.where(model, w));
    if (!isPlainObject(where)) return where;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(where)) {
      const related = relations.get(model)?.get(key);
      if (LOGICAL.has(key)) out[key] = this.where(model, value);
      else if (related) out[key] = this.relationFilter(related, value);
      else if (ENCRYPTED_FIELDS[model]?.[key]) out[key] = this.filter(model, key, value);
      else if (!scalarFields.get(model)?.has(key) && isPlainObject(value)) out[key] = this.where(model, value); // compound unique, e.g. environmentId_externalId
      else out[key] = value;
    }
    return out;
  }

  private relationFilter(model: string, filter: unknown): unknown {
    if (!isPlainObject(filter)) return filter;
    const keys = Object.keys(filter);
    if (keys.length && keys.every((k) => RELATION_FILTERS.has(k))) {
      return Object.fromEntries(Object.entries(filter).map(([k, v]) => [k, this.where(model, v)]));
    }
    return this.where(model, filter); // to-one shorthand: { customer: { phone } }
  }

  private filter(model: string, field: string, filter: unknown): unknown {
    const mode = ENCRYPTED_FIELDS[model][field];
    const equality = (v: unknown) => {
      if (v !== null && mode !== 'deterministic') throw new Error(`${model}.${field} is encrypted and can't be looked up by value`);
      return this.value(model, field, v);
    };
    if (!isPlainObject(filter)) return equality(filter);
    const out: Record<string, unknown> = {};
    for (const [op, v] of Object.entries(filter)) {
      if (op === 'equals') out[op] = equality(v);
      else if (op === 'in' || op === 'notIn') out[op] = (v as unknown[]).map(equality);
      else if (op === 'not') out[op] = isPlainObject(v) ? this.filter(model, field, v) : equality(v);
      else throw new Error(`${model}.${field} is encrypted; "${op}" filters can't work on it`);
    }
    return out;
  }

  private data(model: string, data: unknown): unknown {
    if (Array.isArray(data)) return data.map((d) => this.data(model, d));
    if (!isPlainObject(data)) return data;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const related = relations.get(model)?.get(key);
      if (related) out[key] = this.nestedWrite(related, value);
      else if (ENCRYPTED_FIELDS[model]?.[key]) {
        out[key] = isPlainObject(value) && 'set' in value && ENCRYPTED_FIELDS[model][key] !== 'json' ? { set: this.value(model, key, value.set) } : this.value(model, key, value);
      } else out[key] = value;
    }
    return out;
  }

  // create, connectOrCreate, update, upsert, ... on a relation field.
  private nestedWrite(model: string, ops: unknown): unknown {
    if (!isPlainObject(ops)) return ops;
    const each = <T>(v: T, fn: (x: unknown) => unknown) => (Array.isArray(v) ? v.map(fn) : fn(v));
    const out: Record<string, unknown> = {};
    for (const [op, v] of Object.entries(ops)) {
      switch (op) {
        case 'create':
          out[op] = each(v, (x) => this.data(model, x));
          break;
        case 'createMany':
          out[op] = isPlainObject(v) ? { ...v, data: this.data(model, v.data) } : v;
          break;
        case 'connectOrCreate':
          out[op] = each(v, (x) => (isPlainObject(x) ? { where: this.where(model, x.where), create: this.data(model, x.create) } : x));
          break;
        case 'upsert':
          out[op] = each(v, (x) =>
            isPlainObject(x) ? { ...(x.where ? { where: this.where(model, x.where) } : {}), create: this.data(model, x.create), update: this.data(model, x.update) } : x,
          );
          break;
        case 'update':
        case 'updateMany':
          // To-many: { where, data }. To-one: the data itself, or { where?, data }.
          out[op] = each(v, (x) =>
            isPlainObject(x) && 'data' in x ? { ...(x.where ? { where: this.where(model, x.where) } : {}), data: this.data(model, x.data) } : this.data(model, x),
          );
          break;
        case 'connect':
        case 'disconnect':
        case 'delete':
        case 'deleteMany':
        case 'set':
          out[op] = typeof v === 'boolean' ? v : each(v, (x) => this.where(model, x));
          break;
        default:
          out[op] = v;
      }
    }
    return out;
  }

  // include/select can filter related lists: { messages: { where: { ... } } }.
  private projection(model: string, projection: unknown): unknown {
    if (!isPlainObject(projection)) return projection;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(projection)) {
      const related = relations.get(model)?.get(key);
      if (related && isPlainObject(value)) {
        const nested: Record<string, unknown> = { ...value };
        if (nested.where) nested.where = this.where(related, nested.where);
        if (nested.include) nested.include = this.projection(related, nested.include);
        if (nested.select) nested.select = this.projection(related, nested.select);
        if (nested.orderBy) this.assertNoOrdering(related, nested.orderBy);
        out[key] = nested;
      } else if (key === '_count' && isPlainObject(value) && isPlainObject(value.select)) {
        out[key] = { ...value, select: Object.fromEntries(Object.entries(value.select).map(([k, v]) => [k, isPlainObject(v) && v.where && relations.get(model)?.get(k) ? { ...v, where: this.where(relations.get(model)!.get(k)!, v.where) } : v])) };
      } else out[key] = value;
    }
    return out;
  }

  private assertNoOrdering(model: string, orderBy: unknown) {
    for (const entry of Array.isArray(orderBy) ? orderBy : [orderBy]) {
      if (!isPlainObject(entry)) continue;
      for (const key of Object.keys(entry)) {
        if (ENCRYPTED_FIELDS[model]?.[key]) throw new Error(`${model}.${key} is encrypted and can't be used for ordering`);
      }
    }
  }
}

/** The Prisma extension: encrypt arguments on the way in, decrypt results on the way out. */
export function fieldEncryption(keyBase64: string) {
  const cipher = new FieldCipher(keyBase64);
  const encryptor = new ArgsEncryptor(cipher);
  return Prisma.defineExtension({
    name: 'field-encryption',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(encryptor.args(model, operation, args as Record<string, unknown>) as typeof args);
          return cipher.decryptResult(result);
        },
      },
    },
  });
}

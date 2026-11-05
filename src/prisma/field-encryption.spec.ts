import { ArgsEncryptor, FieldCipher } from './field-encryption';

const key = Buffer.alloc(32, 9).toString('base64');
const cipher = new FieldCipher(key);
const args = new ArgsEncryptor(cipher);
const d = (v: string) => cipher.encrypt(v, 'deterministic');

describe('FieldCipher', () => {
  it('round-trips, and deterministic values are stable while random ones are not', () => {
    expect(cipher.decrypt(d('251911223344'))).toBe('251911223344');
    expect(d('251911223344')).toBe(d('251911223344'));
    expect(d('251911223344')).not.toBe(d('251911223345'));
    const r1 = cipher.encrypt('hello', 'random');
    expect(r1).not.toBe(cipher.encrypt('hello', 'random'));
    expect(cipher.decrypt(r1)).toBe('hello');
    expect(d('251911223344')).toMatch(/^enc:d1:[A-Za-z0-9_-]+$/);
  });

  it('never encrypts twice and passes plain values through on read', () => {
    expect(cipher.encrypt(d('x'), 'deterministic')).toBe(d('x'));
    expect(cipher.decrypt('251911223344')).toBe('251911223344');
  });

  it('decrypts whole results, including nested relations and Json payloads', () => {
    const result = cipher.decryptResult([
      { id: '1', phone: d('2519'), createdAt: new Date(0), customer: { telegramChatId: d('42') }, payload: cipher.encryptJson({ a: [1, 'x'] }) },
    ]);
    expect(result).toEqual([{ id: '1', phone: '2519', createdAt: new Date(0), customer: { telegramChatId: '42' }, payload: { a: [1, 'x'] } }]);
    expect(cipher.decryptResult({ name: 'enc:d1:not-really' })).toEqual({ name: 'enc:d1:not-really' });
  });

  it('rejects a wrong key', () => {
    expect(() => new FieldCipher('short')).toThrow('ENCRYPTION_KEY');
    const other = new FieldCipher(Buffer.alloc(32, 1).toString('base64'));
    expect(() => other.decrypt(d('x'))).toThrow();
  });
});

describe('ArgsEncryptor', () => {
  it('encrypts lookups, including in-lists, not, logical operators and compound filters', () => {
    const out = args.args('Customer', 'findMany', {
      where: { environmentId: 'env', phone: '2519', OR: [{ telegramChatId: { in: ['1', '2'] } }, { telegramChatId: { not: null } }], NOT: { phone: { equals: '3' } } },
    });
    expect(out).toEqual({
      where: { environmentId: 'env', phone: d('2519'), OR: [{ telegramChatId: { in: [d('1'), d('2')] } }, { telegramChatId: { not: null } }], NOT: { phone: { equals: d('3') } } },
    });
  });

  it('follows relations in filters, includes and nested writes', () => {
    const where = args.args('Message', 'findMany', { where: { customer: { phone: '2519' } }, include: { customer: true } });
    expect(where!.where).toEqual({ customer: { phone: d('2519') } });

    const listFilter = args.args('Environment', 'findFirst', { where: { customers: { some: { telegramChatId: '42' } } }, include: { customers: { where: { phone: '1' } } } });
    expect(listFilter).toEqual({ where: { customers: { some: { telegramChatId: d('42') } } }, include: { customers: { where: { phone: d('1') } } } });

    const nested = args.args('Customer', 'create', { data: { externalId: 'u1', phone: '2519', messages: { create: [{ text: 'hi', buttons: [[{ text: 'Open', url: 'https://x' }]] }] } } }) as any;
    expect(nested.data.phone).toBe(d('2519'));
    expect(cipher.decrypt(nested.data.messages.create[0].text)).toBe('hi');
    // Json buttons belong to no encrypted field: left alone.
    expect(nested.data.messages.create[0].buttons).toEqual([[{ text: 'Open', url: 'https://x' }]]);
  });

  it('handles upserts, compound unique keys, updateMany and set', () => {
    const out = args.args('Customer', 'upsert', {
      where: { environmentId_externalId: { environmentId: 'e', externalId: 'u' } },
      create: { environmentId: 'e', externalId: 'u', phone: '1' },
      update: { phone: { set: '2' }, telegramUsername: null },
    }) as any;
    expect(out.create.phone).toBe(d('1'));
    expect(out.update.phone).toEqual({ set: d('2') });
    expect(out.update.telegramUsername).toBeNull();

    const many = args.args('PassIdentity', 'updateMany', { where: { phone: '1' }, data: { chatId: '9' } }) as any;
    expect(many).toEqual({ where: { phone: d('1') }, data: { chatId: d('9') } });
  });

  it('encrypts webhook payloads whole', () => {
    const out = args.args('WebhookDelivery', 'create', { data: { id: 'evt', event: 'message.sent', payload: { to: 'u1', text: 'hi' } } }) as any;
    expect(typeof out.data.payload).toBe('string');
    expect(cipher.decryptResult(out.data.payload)).toEqual({ to: 'u1', text: 'hi' });
  });

  it('refuses queries that cannot work on ciphertext instead of matching nothing', () => {
    expect(() => args.args('Customer', 'findMany', { where: { phone: { contains: '251' } } })).toThrow('"contains" filters');
    expect(() => args.args('Message', 'findFirst', { where: { text: 'hello' } })).toThrow("can't be looked up by value");
    expect(() => args.args('Customer', 'findMany', { orderBy: { phone: 'asc' } })).toThrow('ordering');
    expect(args.args('Message', 'findMany', { where: { text: { not: null } } })).toEqual({ where: { text: { not: null } } });
  });

  it('leaves models without encrypted data alone', () => {
    const input = { where: { email: 'a@b.c' } };
    expect(args.args('User', 'findUnique', input)).toEqual(input);
  });
});

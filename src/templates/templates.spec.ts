import { BadRequestException, NotFoundException } from '@nestjs/common';
import { chooseLocale, MissingParamsError, placeholders, render } from './templates.render';
import { TemplatesService } from './templates.service';

describe('template rendering', () => {
  it('finds placeholders once each, allowing spaces', () => {
    expect(placeholders('Hi {{name}}, {{ amount }} ETB from {{name}}')).toEqual(['name', 'amount']);
  });

  it('fills placeholders, including Amharic text', () => {
    expect(render('ከ{{payer}} {{amount}} ብር ተቀብለዋል።', { payer: 'አበበ', amount: 1250 })).toBe('ከአበበ 1250 ብር ተቀብለዋል።');
  });

  it('refuses to render with missing values', () => {
    expect(() => render('Code {{code}} for {{name}}', { name: 'Sami' })).toThrow(MissingParamsError);
  });

  it('chooses the requested language, then the customer language, then the default', () => {
    const variants = { en: 'E', am: 'A' };
    expect(chooseLocale(variants, 'en', 'am', 'en')).toBe('am');
    expect(chooseLocale(variants, 'en', undefined, 'am')).toBe('am');
    expect(chooseLocale(variants, 'en', 'om', null)).toBe('en');
  });
});

describe('TemplatesService', () => {
  const template = { id: 't1', orgId: 'org-1', key: 'payment_received', name: 'Payment', variants: { en: 'Got {{amount}} ETB', am: '{{amount}} ብር ደርሷል' }, defaultLocale: 'en' };
  const setup = (found: unknown = template) => {
    const prisma = { messageTemplate: { findUnique: jest.fn().mockResolvedValue(found), create: jest.fn() } };
    return { service: new TemplatesService(prisma as any, { record: jest.fn() } as any), prisma };
  };

  it('renders for sending in the preferred language', async () => {
    const { service } = setup();
    await expect(service.renderForSend('org-1', 'payment_received', { amount: 50 }, 'am')).resolves.toEqual({ text: '50 ብር ደርሷል', locale: 'am', templateKey: 'payment_received' });
  });

  it('returns a clear 400 for missing params and 404 for unknown templates', async () => {
    await expect(setup().service.renderForSend('org-1', 'payment_received', {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup(null).service.renderForSend('org-1', 'nope', {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('validates languages and requires the default language text', async () => {
    const { service } = setup();
    const user = { id: 'u1', email: 'a@b.c' } as any;
    await expect(service.create('org-1', user, { key: 'x1', name: 'X', variants: { fr: 'Bonjour' }, defaultLocale: 'en' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create('org-1', user, { key: 'x1', name: 'X', variants: { am: 'ሰላም' }, defaultLocale: 'en' })).rejects.toThrow(/default language/);
  });
});

describe('TemplatesService.renderForSend with formatting', () => {
  it('escapes values so they show literally in a formatted template', async () => {
    const template = { key: 'paid', variants: { en: '**Paid** by {{payer}}' }, defaultLocale: 'en', format: 'MARKDOWN' };
    const prisma = { messageTemplate: { findUnique: jest.fn().mockResolvedValue(template) } };
    const service = new TemplatesService(prisma as any, {} as any);
    const result = await service.renderForSend('org-1', 'paid', { payer: '*Abebe_K*' });
    expect(result).toMatchObject({ format: 'MARKDOWN', text: '**Paid** by \\*Abebe\\_K\\*' });
  });
});

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MessageTemplate, Prisma, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto, UpdateTemplateDto } from './templates.dto';
import { escapeMarkdown } from '../messages/rich-text';
import { chooseLocale, isLocale, MissingParamsError, placeholders, render } from './templates.render';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(orgId: string) {
    const templates = await this.prisma.messageTemplate.findMany({ where: { orgId }, orderBy: { key: 'asc' } });
    return templates.map((t) => this.toView(t));
  }

  async create(orgId: string, actor: User, dto: CreateTemplateDto) {
    const variants = this.cleanVariants(dto.variants, dto.defaultLocale);
    try {
      const template = await this.prisma.messageTemplate.create({
        data: { orgId, key: dto.key, name: dto.name.trim(), description: dto.description?.trim() || null, variants, defaultLocale: dto.defaultLocale, format: toFormat(dto.format) },
      });
      await this.audit.record(orgId, actor, 'template.created', template.key);
      return this.toView(template);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(`A template with key "${dto.key}" already exists`);
      throw error;
    }
  }

  async update(orgId: string, actor: User, id: string, dto: UpdateTemplateDto) {
    const existing = await this.find(orgId, id);
    const defaultLocale = dto.defaultLocale ?? existing.defaultLocale;
    const variants = this.cleanVariants(dto.variants ?? (existing.variants as Record<string, string>), defaultLocale);
    const template = await this.prisma.messageTemplate.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        variants,
        defaultLocale,
        ...(dto.format !== undefined ? { format: toFormat(dto.format) } : {}),
      },
    });
    await this.audit.record(orgId, actor, 'template.updated', template.key);
    return this.toView(template);
  }

  async remove(orgId: string, actor: User, id: string) {
    const existing = await this.find(orgId, id);
    await this.prisma.messageTemplate.delete({ where: { id: existing.id } });
    await this.audit.record(orgId, actor, 'template.deleted', existing.key);
  }

  preview(variants: Record<string, string>, locale: string, params: Record<string, unknown> = {}) {
    const text = variants[locale] ?? '';
    const names = placeholders(text);
    const filled = text.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (match, name: string) => (params[name] ? String(params[name]) : match));
    return { text: filled, placeholders: names, missing: names.filter((n) => !params[n]) };
  }

  // Renders a template for sending. Throws 404 for unknown keys and 400 for missing params.
  async renderForSend(orgId: string, key: string, params: Record<string, unknown> | undefined, ...preferredLocales: (string | null | undefined)[]) {
    const template = await this.prisma.messageTemplate.findUnique({ where: { orgId_key: { orgId, key } } });
    if (!template) throw new NotFoundException(`Template "${key}" not found. Create it in the portal under Templates.`);
    const variants = template.variants as Record<string, string>;
    const locale = chooseLocale(variants, template.defaultLocale, ...preferredLocales);
    // Values fill in literally: a "*" in a customer name must not start bold text.
    const markdown = template.format === 'MARKDOWN';
    const values = markdown && params ? Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v === null || v === undefined ? v : escapeMarkdown(String(v))])) : params;
    try {
      return { text: render(variants[locale], values), format: template.format, locale, templateKey: template.key };
    } catch (error) {
      if (error instanceof MissingParamsError) throw new BadRequestException(`${error.message} (template "${key}", ${locale})`);
      throw error;
    }
  }

  private async find(orgId: string, id: string) {
    const template = await this.prisma.messageTemplate.findFirst({ where: { id, orgId } });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  private cleanVariants(input: Record<string, string>, defaultLocale: string): Record<string, string> {
    const variants: Record<string, string> = {};
    for (const [locale, text] of Object.entries(input ?? {})) {
      if (!isLocale(locale)) throw new BadRequestException(`Unsupported language "${locale}". Use en, am, om or ti.`);
      if (typeof text !== 'string') throw new BadRequestException(`The ${locale} text must be a string`);
      const trimmed = text.trim();
      if (trimmed.length > 4096) throw new BadRequestException(`The ${locale} text is longer than 4096 characters`);
      if (trimmed) variants[locale] = trimmed;
    }
    if (!variants[defaultLocale]) throw new BadRequestException(`Add text for the default language (${defaultLocale})`);
    return variants;
  }

  toView(t: MessageTemplate) {
    const variants = t.variants as Record<string, string>;
    return {
      id: t.id,
      key: t.key,
      name: t.name,
      description: t.description,
      variants,
      defaultLocale: t.defaultLocale,
      format: t.format.toLowerCase() as 'plain' | 'markdown',
      placeholders: [...new Set(Object.values(variants).flatMap(placeholders))],
      updatedAt: t.updatedAt,
      createdAt: t.createdAt,
    };
  }
}

function toFormat(format: string | undefined): 'PLAIN' | 'MARKDOWN' {
  return format === 'markdown' ? 'MARKDOWN' : 'PLAIN';
}

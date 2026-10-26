import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { LOCALES } from './templates.render';

export class CreateTemplateDto {
  @Matches(/^[a-z0-9][a-z0-9_]{1,59}$/, { message: 'key must be 2-60 lowercase letters, numbers or underscores' })
  key!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  // { "en": "...", "am": "..." }
  @IsObject()
  variants!: Record<string, string>;

  @IsIn(LOCALES as unknown as string[])
  defaultLocale!: string;

  @IsOptional()
  @IsIn(['plain', 'markdown'])
  format?: 'plain' | 'markdown';
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsObject()
  variants?: Record<string, string>;

  @IsOptional()
  @IsIn(LOCALES as unknown as string[])
  defaultLocale?: string;

  @IsOptional()
  @IsIn(['plain', 'markdown'])
  format?: 'plain' | 'markdown';
}

export class PreviewTemplateDto {
  @IsObject()
  variants!: Record<string, string>;

  @IsIn(LOCALES as unknown as string[])
  locale!: string;

  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}

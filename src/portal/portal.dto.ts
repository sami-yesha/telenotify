import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LayoutDto } from '../messages/layout.dto';
import { InlineButton } from '../telegram/telegram-api.client';

export class CreateOrgDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}

export class UpdateEnvironmentDto {
  // null clears it.
  @ValidateIf((o) => o.eventWebhookUrl !== null)
  @IsString()
  @MaxLength(2048)
  eventWebhookUrl!: string | null;
}

export class PassInviteDto {
  @IsBoolean()
  enabled!: boolean;
}

export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;
}

export class ConnectBotDto {
  @IsString()
  @IsNotEmpty()
  botToken!: string;
}

export class UpdateSmsFallbackDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  // null removes the saved credentials and turns fallback off.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  token?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  identifierId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(11)
  senderName?: string | null;

  // null removes the cap.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  dailyLimit?: number | null;
}

export class TestSmsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;
}

export class PlaygroundLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalId?: string;
}

export class PlaygroundSendDto {
  @IsString()
  @IsNotEmpty()
  to!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  text?: string;

  @IsOptional()
  @IsIn(['plain', 'markdown'])
  format?: 'plain' | 'markdown';

  @IsOptional()
  @ValidateNested()
  @Type(() => LayoutDto)
  layout?: LayoutDto;

  @IsOptional()
  @IsArray()
  buttons?: InlineButton[][];
}

export class PlaygroundVerifyDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalId?: string;

  @IsOptional()
  @Matches(/^(\+?[0-9 ()-]{9,20})?$/)
  phone?: string;
}

export class CustomerMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  text!: string;
}

export class AllowedOriginsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  origins!: string[];
}

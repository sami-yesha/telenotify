import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { LAYOUT_TYPES, LayoutType } from './rich-text';

export class LayoutRowDto {
  @ApiProperty({ example: 'Amount' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  label!: string;

  @ApiProperty({ example: '1,250 ETB' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  value!: string;

  @ApiPropertyOptional({ description: 'Show the value as tap-to-copy, e.g. a reference number' })
  @IsOptional()
  @IsBoolean()
  copy?: boolean;
}

export class LayoutDto {
  @ApiProperty({ enum: LAYOUT_TYPES, description: 'Sets the emoji: receipt ✅, alert ⚠️, reminder ⏰, status 📦, info ℹ️' })
  @IsIn(LAYOUT_TYPES as unknown as string[])
  type!: LayoutType;

  @ApiProperty({ example: 'Payment received' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional({ description: 'Replaces the type emoji; "" for none', example: '💸' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  emoji?: string;

  @ApiPropertyOptional({ description: 'A paragraph under the title. Formatting allowed.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @ApiPropertyOptional({
    type: [LayoutRowDto],
    example: [
      { label: 'Amount', value: '1,250 ETB' },
      { label: 'Reference', value: 'TX-88-4471', copy: true },
    ],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @ValidateNested({ each: true })
  @Type(() => LayoutRowDto)
  rows?: LayoutRowDto[];

  @ApiPropertyOptional({ example: 'Abebe Pharmacy' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  footer?: string;
}

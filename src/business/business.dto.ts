import { IsNotEmpty, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

export class BusinessVerificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  legalName!: string;

  // Ethiopian TINs are 10 digits.
  @Matches(/^\d{10}$/, { message: 'TIN must be the 10-digit number on your TIN certificate' })
  tin!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  tradeLicense!: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] }, { message: 'website must start with https://' })
  @MaxLength(200)
  website?: string;
}

export class RejectBusinessDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

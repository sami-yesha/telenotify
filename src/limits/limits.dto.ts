import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const MAX_MONTHLY_LIMIT = 100_000_000;

export class RequestLimitDto {
  @IsInt()
  @Min(1)
  @Max(MAX_MONTHLY_LIMIT)
  monthlyLimit!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class ApproveLimitDto {
  @IsInt()
  @Min(1)
  @Max(MAX_MONTHLY_LIMIT)
  monthlyLimit!: number;
}

export class DeclineLimitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class SetLimitDto {
  // null removes the custom limit, back to the plan's.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_MONTHLY_LIMIT)
  monthlyLimit!: number | null;
}

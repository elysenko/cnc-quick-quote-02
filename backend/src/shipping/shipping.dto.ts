import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ShippingCreateDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsIn(['flat', 'perSheet'], { message: 'Rate type must be "flat" or "perSheet".' }) rateType!: string;
  @IsInt() @Min(0) rateCents!: number;
  @IsInt() @Min(0) @Max(90) estDeliveryDays!: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ShippingPatchDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @IsOptional() @IsIn(['flat', 'perSheet']) rateType?: string;
  @IsOptional() @IsInt() @Min(0) rateCents?: number;
  @IsOptional() @IsInt() @Min(0) @Max(90) estDeliveryDays?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

import { Type } from 'class-transformer';
import { IsDefined, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class ShippingAddressDto {
  @IsString() @MinLength(1) @MaxLength(120) fullName!: string;
  @IsOptional() @IsString() @MaxLength(120) company?: string;
  @IsString() @MinLength(1) @MaxLength(160) line1!: string;
  @IsOptional() @IsString() @MaxLength(160) line2?: string;
  @IsString() @MinLength(1) @MaxLength(80) city!: string;
  @IsString() @MinLength(1) @MaxLength(80) region!: string;
  @IsString() @MinLength(1) @MaxLength(24) postcode!: string;
  @IsString() @MinLength(1) @MaxLength(80) country!: string;
  @IsString() @MinLength(1) @MaxLength(40) phone!: string;
}

export class CheckoutSessionDto {
  @IsString() @MinLength(1) shippingMethodId!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress!: ShippingAddressDto;
}

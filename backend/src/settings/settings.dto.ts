import { ArrayNotEmpty, IsArray, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class PricingPatchDto {
  @IsOptional() @IsInt() @Min(0) setupFeeCents?: number;
  @IsOptional() @IsInt() @Min(0) costPerLinearFootCents?: number;
  @IsOptional() @IsInt() @Min(0) perSheetCostCents?: number;
  @IsOptional() @IsInt() @Min(0) handlingFeeCents?: number;
  @IsOptional() @IsInt() @Min(0) costPerBendCents?: number;
  @IsOptional() @IsInt() @Min(0) minimumOrderCents?: number;
  @IsOptional() @IsInt() @Min(1) qtyMin?: number;
  @IsOptional() @IsInt() @Min(1) qtyMax?: number;
}

export class MachinePatchDto {
  @IsOptional() @IsNumber() @Min(0) @Max(100) sheetSpacingMm?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(200) sheetMarginMm?: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'At least one file extension must be allowed.' })
  @Matches(/^\.[a-z0-9]{1,6}$/, {
    each: true,
    message: 'Each extension must look like ".dxf".',
  })
  allowedExtensions?: string[];

  @IsOptional() @IsInt() @Min(1024) maxUploadBytes?: number;
  @IsOptional() @IsNumber() @Min(0.25) @Max(3) animationSpeed?: number;
}

export class CredentialDto {
  @IsString() value!: string;
}

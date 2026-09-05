import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class MaterialCreateDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsNumber() @Min(0) thicknessMm!: number;
  @IsNumber() @Min(1) sheetWidthMm!: number;
  @IsNumber() @Min(1) sheetHeightMm!: number;
  @IsNumber() @Min(0) costMultiplier!: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class MaterialPatchDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @IsOptional() @IsNumber() @Min(0) thicknessMm?: number;
  @IsOptional() @IsNumber() @Min(1) sheetWidthMm?: number;
  @IsOptional() @IsNumber() @Min(1) sheetHeightMm?: number;
  @IsOptional() @IsNumber() @Min(0) costMultiplier?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

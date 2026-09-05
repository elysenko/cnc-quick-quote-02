import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class QuoteCreateDto {
  @IsString() @MinLength(1) drawingId!: string;
  @IsString() @MinLength(1) materialId!: string;

  /** Null/0/negative are rejected here; the configured qtyMin/qtyMax bounds — and the
   * message stating the actual limit — are enforced in QuotesService. */
  @IsInt({ message: 'Enter a whole-number quantity.' })
  @Min(1, { message: 'Enter a quantity of at least 1.' })
  quantity!: number;
}

import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

/** A bend beyond 0–180° is not physically producible, so it is rejected server-side
 * as well as in the editor — the client check is convenience, this one is the rule. */
export class BendCreateDto {
  @IsNumber() startX!: number;
  @IsNumber() startY!: number;
  @IsNumber() endX!: number;
  @IsNumber() endY!: number;

  @IsNumber()
  @Min(0, { message: 'Bend angle must be between 0° and 180°.' })
  @Max(180, { message: 'Bend angle must be between 0° and 180°.' })
  angleDeg!: number;

  @IsIn(['up', 'down'], { message: 'Bend direction must be "up" or "down".' })
  direction!: string;
}

export class BendPatchDto {
  @IsOptional() @IsNumber() startX?: number;
  @IsOptional() @IsNumber() startY?: number;
  @IsOptional() @IsNumber() endX?: number;
  @IsOptional() @IsNumber() endY?: number;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Bend angle must be between 0° and 180°.' })
  @Max(180, { message: 'Bend angle must be between 0° and 180°.' })
  angleDeg?: number;

  @IsOptional() @IsIn(['up', 'down'], { message: 'Bend direction must be "up" or "down".' }) direction?: string;
}

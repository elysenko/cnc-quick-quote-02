import { PartTooLargeError } from '../common/errors';

export interface Placement {
  sheet: number;
  x: number;
  y: number;
}

export interface NestResult {
  cols: number;
  rows: number;
  perSheet: number;
  sheets: number;
  placements: Placement[];
  /** Fraction of total sheet area occupied by part bounding boxes (0..1). */
  utilization: number;
}

/**
 * Axis-aligned row/column nesting on the part's bounding box, packed from the
 * top-left origin of the usable area.
 *
 * Deliberately conservative: it does not shape-fit or rotate parts, so an irregular
 * outline consumes its full bounding box. That over-estimates sheet count for
 * non-rectangular parts, which is the safe direction for a price quote.
 *
 * Spacing is the kerf gap BETWEEN parts, so N parts need (N-1) gaps — hence the
 * `(usable + spacing) / (part + spacing)` form rather than a naive division.
 */
export function computeNesting(
  bboxW: number,
  bboxH: number,
  qty: number,
  sheetW: number,
  sheetH: number,
  spacing: number,
  margin: number,
): NestResult {
  const usableW = sheetW - margin * 2;
  const usableH = sheetH - margin * 2;

  if (bboxW <= 0 || bboxH <= 0) {
    throw new PartTooLargeError('The drawing has no measurable area, so it cannot be nested on a sheet.');
  }
  if (usableW <= 0 || usableH <= 0) {
    throw new PartTooLargeError(
      `The sheet margin of ${margin} mm leaves no usable area on a ${sheetW} × ${sheetH} mm sheet.`,
    );
  }
  if (bboxW > usableW || bboxH > usableH) {
    throw new PartTooLargeError(
      `This part is ${bboxW.toFixed(1)} × ${bboxH.toFixed(1)} mm, which does not fit the ${usableW.toFixed(
        1,
      )} × ${usableH.toFixed(1)} mm usable area of the selected material's sheet. Choose a larger sheet or reduce the part.`,
    );
  }

  const cols = Math.floor((usableW + spacing) / (bboxW + spacing));
  const rows = Math.floor((usableH + spacing) / (bboxH + spacing));
  const perSheet = cols * rows;
  if (perSheet <= 0) {
    throw new PartTooLargeError('This part does not fit the selected material sheet with the configured spacing.');
  }

  const sheets = Math.ceil(qty / perSheet);
  const placements: Placement[] = [];
  for (let i = 0; i < qty; i++) {
    const slot = i % perSheet;
    placements.push({
      sheet: Math.floor(i / perSheet) + 1,
      x: margin + (slot % cols) * (bboxW + spacing),
      y: margin + Math.floor(slot / cols) * (bboxH + spacing),
    });
  }

  const utilization = (bboxW * bboxH * qty) / (sheets * sheetW * sheetH);
  return { cols, rows, perSheet, sheets, placements, utilization };
}

import { Injectable, computed, inject, signal } from '@angular/core';
import { ParamMap } from '@angular/router';
import type { BendLine, Drawing, Material } from '../../core/models';
import { MOCK_BENDS, MOCK_DRAWINGS, MOCK_MATERIALS, MOCK_MACHINE, MOCK_PRICING } from '../../core/mock/fixtures';

export type WizardStep = 'upload' | 'material' | 'bends' | 'review';

export const WIZARD_STEPS: { key: WizardStep; label: string; caption: string }[] = [
  { key: 'upload', label: 'Drawing', caption: 'Upload a DXF' },
  { key: 'material', label: 'Material', caption: 'Material & quantity' },
  { key: 'bends', label: 'Bends', caption: 'Optional bend lines' },
  { key: 'review', label: 'Review', caption: 'Nest, price & issue' },
];

export interface WizardParams {
  drawingId: string;
  materialId: string;
  qty: number;
}

/** Wizard state lives in the URL; this only reads it, applying demo-safe defaults. */
export function readWizardParams(map: ParamMap | null): WizardParams {
  const qty = Number(map?.get('qty'));
  return {
    drawingId: map?.get('drawingId') ?? '',
    materialId: map?.get('materialId') ?? '',
    qty: Number.isFinite(qty) && qty > 0 ? qty : 0,
  };
}

/**
 * Bend geometry drawn in the wizard. The URL carries the bend COUNT so pricing
 * restores on a deep link; the geometry itself is held here for the canvas.
 */
@Injectable({ providedIn: 'root' })
export class QuoteDraftService {
  // MOCK DATA — replace initializer with [] and load via API
  readonly bends = signal<BendLine[]>(MOCK_BENDS);
  // MOCK DATA — replace initializer with [] and load via API
  readonly drawings = signal<Drawing[]>(MOCK_DRAWINGS);
  // MOCK DATA — replace initializer with [] and load via API
  readonly materials = signal<Material[]>(MOCK_MATERIALS);

  readonly pricing = signal(MOCK_PRICING);
  readonly machine = signal(MOCK_MACHINE);
  readonly activeMaterials = computed(() => this.materials().filter((m) => m.isActive));

  drawing(id: string): Drawing | undefined {
    return this.drawings().find((d) => d.id === id) ?? this.drawings()[0];
  }

  material(id: string): Material | undefined {
    return this.activeMaterials().find((m) => m.id === id);
  }

  addBend(bend: BendLine): void {
    this.bends.update((list) => [...list, bend]);
  }

  updateBend(id: string, patch: Partial<BendLine>): void {
    this.bends.update((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  removeBend(id: string): void {
    this.bends.update((list) => list.filter((b) => b.id !== id));
  }
}

export const injectDraft = () => inject(QuoteDraftService);

/** Axis-aligned row/column nesting, mirroring the server-side engine. */
export function nest(
  bboxW: number,
  bboxH: number,
  qty: number,
  sheetW: number,
  sheetH: number,
  spacing: number,
  margin: number,
) {
  const usableW = sheetW - margin * 2;
  const usableH = sheetH - margin * 2;
  const tooLarge = bboxW > usableW || bboxH > usableH;
  const cols = tooLarge ? 0 : Math.floor((usableW + spacing) / (bboxW + spacing));
  const rows = tooLarge ? 0 : Math.floor((usableH + spacing) / (bboxH + spacing));
  const perSheet = Math.max(0, cols * rows);
  const sheets = perSheet > 0 ? Math.ceil(qty / perSheet) : 0;
  const placements = [] as { sheet: number; x: number; y: number }[];
  for (let i = 0; i < qty && perSheet > 0; i++) {
    const sheet = Math.floor(i / perSheet) + 1;
    const slot = i % perSheet;
    placements.push({
      sheet,
      x: margin + (slot % cols) * (bboxW + spacing),
      y: margin + Math.floor(slot / cols) * (bboxH + spacing),
    });
  }
  const utilization = sheets > 0 ? (bboxW * bboxH * qty) / (sheets * sheetW * sheetH) : 0;
  return { tooLarge, perSheet, sheets, placements, utilization };
}

/** Itemised pricing, rounded to integer cents exactly once at the end. */
export function priceQuote(
  cutLengthMmTotal: number,
  sheets: number,
  bends: number,
  multiplier: number,
  cfg: typeof MOCK_PRICING,
) {
  const feet = cutLengthMmTotal / 304.8;
  const cutting = feet * cfg.costPerLinearFootCents;
  const sheetCost = sheets * cfg.perSheetCostCents * multiplier;
  const bending = bends * cfg.costPerBendCents;
  const subtotal = cfg.setupFeeCents + cutting + sheetCost + cfg.handlingFeeCents + bending;
  const total = Math.round(Math.max(cfg.minimumOrderCents, subtotal));
  const breakdown = [
    { label: 'Setup fee', detail: 'Per job', amountCents: Math.round(cfg.setupFeeCents) },
    {
      label: 'Laser cutting',
      detail: `${feet.toFixed(2)} linear ft @ $${(cfg.costPerLinearFootCents / 100).toFixed(2)}/ft`,
      amountCents: Math.round(cutting),
    },
    {
      label: 'Material sheets',
      detail: `${sheets} sheet${sheets === 1 ? '' : 's'} @ $${(cfg.perSheetCostCents / 100).toFixed(2)} × ${multiplier} multiplier`,
      amountCents: Math.round(sheetCost),
    },
    { label: 'Handling', detail: 'Deburr + pack', amountCents: Math.round(cfg.handlingFeeCents) },
    {
      label: 'Bending',
      detail: bends > 0 ? `${bends} bend${bends === 1 ? '' : 's'} @ $${(cfg.costPerBendCents / 100).toFixed(2)}` : 'No bends',
      amountCents: Math.round(bending),
    },
  ];
  if (subtotal < cfg.minimumOrderCents) {
    breakdown.push({
      label: 'Minimum order adjustment',
      detail: `Raised to the $${(cfg.minimumOrderCents / 100).toFixed(2)} minimum`,
      amountCents: Math.round(cfg.minimumOrderCents - subtotal),
    });
  }
  return { total, breakdown, subtotal };
}

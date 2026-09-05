import { Injectable, computed, inject, signal } from '@angular/core';
import { ParamMap } from '@angular/router';
import type { BendLine, Drawing, MachineSettings, Material, PricingSettings } from '../../core/models';
import { ApiService } from '../../core/api.service';
import { DrawingApi, MaterialApi } from '../../core/api/domain.service';

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

/** Wizard state lives in the URL; this only reads it. */
export function readWizardParams(map: ParamMap | null): WizardParams {
  const qty = Number(map?.get('qty'));
  return {
    drawingId: map?.get('drawingId') ?? '',
    materialId: map?.get('materialId') ?? '',
    qty: Number.isFinite(qty) && qty > 0 ? qty : 0,
  };
}

/**
 * Neutral config used only until /api/quote-config resolves. Values mirror the
 * server's schema defaults so the first paint is never wildly wrong; the server's
 * response is authoritative and always overwrites them.
 */
const DEFAULT_PRICING: PricingSettings = {
  setupFeeCents: 0,
  costPerLinearFootCents: 0,
  perSheetCostCents: 0,
  handlingFeeCents: 0,
  costPerBendCents: 0,
  minimumOrderCents: 0,
  qtyMin: 1,
  qtyMax: 1000,
};

const DEFAULT_MACHINE: MachineSettings = {
  sheetSpacingMm: 5,
  sheetMarginMm: 10,
  allowedExtensions: ['.dxf'],
  maxUploadBytes: 5242880,
  animationSpeed: 1,
};

/**
 * Shared state for the new-quote wizard.
 *
 * The drawing, material and quantity selections live in the URL (see
 * readWizardParams); this service holds the SERVER data those ids resolve against —
 * the account's drawings, the active material catalogue, the quoting config, and the
 * bend lines belonging to the selected drawing. Bends are persisted server-side, so
 * a refresh mid-wizard restores them.
 */
@Injectable({ providedIn: 'root' })
export class QuoteDraftService {
  private readonly api = inject(ApiService);
  private readonly drawingApi = inject(DrawingApi);
  private readonly materialApi = inject(MaterialApi);

  readonly bends = signal<BendLine[]>([]);
  readonly drawings = signal<Drawing[]>([]);
  readonly materials = signal<Material[]>([]);
  readonly pricing = signal<PricingSettings>(DEFAULT_PRICING);
  readonly machine = signal<MachineSettings>(DEFAULT_MACHINE);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly activeMaterials = computed(() => this.materials().filter((m) => m.isActive));

  private configLoaded = false;
  private bendsForDrawing = '';

  /** Loads the config, drawings and materials the wizard resolves ids against. */
  async ensureLoaded(): Promise<void> {
    if (this.configLoaded) return;
    this.configLoaded = true;
    this.loading.set(true);
    this.error.set(null);
    try {
      const [config, drawings, materials] = await Promise.all([
        this.api.get<{ pricing: PricingSettings; machine: MachineSettings }>('/quote-config'),
        this.drawingApi.list(),
        this.materialApi.list(),
      ]);
      this.pricing.set(config.pricing);
      this.machine.set(config.machine);
      this.drawings.set(drawings);
      this.materials.set(materials);
    } catch (error) {
      this.configLoaded = false;
      this.error.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  /** Fetches the persisted bend lines for a drawing, once per drawing id. */
  async loadBends(drawingId: string): Promise<void> {
    if (!drawingId || this.bendsForDrawing === drawingId) return;
    this.bendsForDrawing = drawingId;
    try {
      this.bends.set(await this.drawingApi.bends(drawingId));
    } catch {
      this.bends.set([]);
    }
  }

  /** Adds a freshly uploaded drawing to the front of the list without a refetch. */
  registerDrawing(drawing: Drawing): void {
    this.drawings.update((list) => [drawing, ...list.filter((d) => d.id !== drawing.id)]);
  }

  drawing(id: string): Drawing | undefined {
    return this.drawings().find((d) => d.id === id);
  }

  material(id: string): Material | undefined {
    return this.activeMaterials().find((m) => m.id === id);
  }

  async addBend(drawingId: string, bend: Omit<BendLine, 'id' | 'drawingId'>): Promise<BendLine> {
    const created = await this.drawingApi.createBend(drawingId, bend);
    this.bends.update((list) => [...list, created]);
    return created;
  }

  async updateBend(drawingId: string, id: string, patch: Partial<BendLine>): Promise<void> {
    // Applied locally first so dragging stays smooth, then persisted.
    this.bends.update((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    const saved = await this.drawingApi.updateBend(drawingId, id, patch);
    this.bends.update((list) => list.map((b) => (b.id === id ? saved : b)));
  }

  async removeBend(drawingId: string, id: string): Promise<void> {
    await this.drawingApi.deleteBend(drawingId, id);
    this.bends.update((list) => list.filter((b) => b.id !== id));
  }
}

export const injectDraft = () => inject(QuoteDraftService);

/**
 * Axis-aligned row/column nesting, mirroring the server-side engine exactly so the
 * wizard preview matches the issued quote. The server remains authoritative — this
 * only powers the live estimate before the quote is created.
 */
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
  cfg: PricingSettings,
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

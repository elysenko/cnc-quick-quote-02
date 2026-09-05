/**
 * MOCK FIXTURES — preview data only.
 *
 * service_agent: every screen binds these through a typed `signal<T[]>(...)`.
 * Replace the signal initializer with `[]` and load from the API in ngOnInit();
 * this file can then be deleted.
 */
import type {
  BendLine,
  BusinessSettings,
  Drawing,
  IntegrationSetting,
  MachineSettings,
  Material,
  Order,
  PricingSettings,
  Quote,
  SessionUser,
  ShippingMethod,
} from '../models';
import { bracketPaths, flangePaths, rectPath } from '../../shared/workbed/geometry';

export const MOCK_USER: SessionUser = {
  id: 'usr_admin_1',
  email: 'owner@fabworks.example',
  name: 'Dana Ortiz',
  role: 'ADMIN',
};

export const MOCK_MATERIALS: Material[] = [
  { id: 'M1', name: 'Mild Steel 1.5mm', thicknessMm: 1.5, sheetWidthMm: 1220, sheetHeightMm: 2440, costMultiplier: 1.0, isActive: true },
  { id: 'M2', name: 'Aluminium 2mm', thicknessMm: 2, sheetWidthMm: 1220, sheetHeightMm: 2440, costMultiplier: 1.5, isActive: true },
  { id: 'M4', name: 'Stainless 304 1.2mm', thicknessMm: 1.2, sheetWidthMm: 1220, sheetHeightMm: 2440, costMultiplier: 2.1, isActive: true },
  { id: 'M5', name: 'Galvanised 1mm', thicknessMm: 1.0, sheetWidthMm: 1000, sheetHeightMm: 2000, costMultiplier: 0.9, isActive: true },
  { id: 'M3', name: 'Retired Brass 0.9mm', thicknessMm: 0.9, sheetWidthMm: 1000, sheetHeightMm: 2000, costMultiplier: 3.2, isActive: false },
];

export const MOCK_DRAWINGS: Drawing[] = [
  {
    id: 'drw_1',
    filename: 'mount-bracket.dxf',
    sizeBytes: 48213,
    bboxWMm: 100,
    bboxHMm: 100,
    cutLengthMm: 400,
    entityCount: 4,
    createdAt: '2026-09-04T09:12:00Z',
    paths: bracketPaths(100, 100),
  },
  {
    id: 'drw_2',
    filename: 'pump-flange.dxf',
    sizeBytes: 91544,
    bboxWMm: 180,
    bboxHMm: 120,
    cutLengthMm: 1004.4,
    entityCount: 11,
    createdAt: '2026-09-02T15:40:00Z',
    paths: flangePaths(180, 120),
  },
  {
    id: 'drw_3',
    filename: 'cabinet-panel.dxf',
    sizeBytes: 33120,
    bboxWMm: 600,
    bboxHMm: 1200,
    cutLengthMm: 3600,
    entityCount: 4,
    createdAt: '2026-08-28T11:05:00Z',
    paths: [rectPath(0, 0, 600, 1200)],
  },
];

export const MOCK_BENDS: BendLine[] = [
  { id: 'bnd_1', drawingId: 'drw_1', startX: 0, startY: 62, endX: 100, endY: 62, angleDeg: 90, direction: 'up' },
];

// 11 columns × 23 rows fit a 100 mm part on a 1220 × 2440 sheet at 5 mm spacing.
const bracketPlacements = Array.from({ length: 150 }, (_, i) => ({
  sheet: 1,
  x: 10 + (i % 11) * 105,
  y: 10 + Math.floor(i / 11) * 105,
}));

export const MOCK_QUOTES: Quote[] = [
  {
    id: 'q_1042',
    reference: 'Q-1042',
    drawingId: 'drw_1',
    drawingName: 'mount-bracket.dxf',
    materialId: 'M1',
    materialName: 'Mild Steel 1.5mm',
    quantity: 150,
    cutLengthMmTotal: 60000,
    bendCount: 1,
    sheetCount: 1,
    utilization: 0.5039,
    perSheet: 253,
    placements: bracketPlacements,
    breakdown: [
      { label: 'Setup fee', detail: 'Per job', amountCents: 5000 },
      { label: 'Laser cutting', detail: '196.85 linear ft @ $2.50/ft', amountCents: 49213 },
      { label: 'Material sheets', detail: '1 sheet @ $12.00 × 1.0 multiplier', amountCents: 1200 },
      { label: 'Handling', detail: 'Deburr + pack', amountCents: 1500 },
      { label: 'Bending', detail: '1 bend @ $0.75', amountCents: 75 },
    ],
    totalCents: 56988,
    status: 'draft',
    createdAt: '2026-09-04T09:14:00Z',
  },
  {
    id: 'q_1041',
    reference: 'Q-1041',
    drawingId: 'drw_2',
    drawingName: 'pump-flange.dxf',
    materialId: 'M2',
    materialName: 'Aluminium 2mm',
    quantity: 25,
    cutLengthMmTotal: 25110,
    bendCount: 2,
    sheetCount: 1,
    utilization: 0.1815,
    perSheet: 114,
    placements: Array.from({ length: 25 }, (_, i) => ({
      sheet: 1,
      x: 10 + (i % 6) * 185,
      y: 10 + Math.floor(i / 6) * 125,
    })),
    breakdown: [
      { label: 'Setup fee', detail: 'Per job', amountCents: 5000 },
      { label: 'Laser cutting', detail: '82.38 linear ft @ $2.50/ft', amountCents: 20595 },
      { label: 'Material sheets', detail: '1 sheet @ $12.00 × 1.5 multiplier', amountCents: 1800 },
      { label: 'Handling', detail: 'Deburr + pack', amountCents: 1500 },
      { label: 'Bending', detail: '2 bends @ $0.75', amountCents: 150 },
    ],
    totalCents: 29045,
    status: 'ordered',
    createdAt: '2026-09-02T15:44:00Z',
  },
  {
    id: 'q_1039',
    reference: 'Q-1039',
    drawingId: 'drw_3',
    drawingName: 'cabinet-panel.dxf',
    materialId: 'M1',
    materialName: 'Mild Steel 1.5mm',
    quantity: 5,
    cutLengthMmTotal: 18000,
    bendCount: 0,
    sheetCount: 3,
    utilization: 0.4031,
    perSheet: 2,
    placements: [
      { sheet: 1, x: 10, y: 10 },
      { sheet: 1, x: 10, y: 1215 },
      { sheet: 2, x: 10, y: 10 },
      { sheet: 2, x: 10, y: 1215 },
      { sheet: 3, x: 10, y: 10 },
    ],
    breakdown: [
      { label: 'Setup fee', detail: 'Per job', amountCents: 5000 },
      { label: 'Laser cutting', detail: '59.06 linear ft @ $2.50/ft', amountCents: 14764 },
      { label: 'Material sheets', detail: '3 sheets @ $12.00 × 1.0 multiplier', amountCents: 3600 },
      { label: 'Handling', detail: 'Deburr + pack', amountCents: 1500 },
      { label: 'Bending', detail: 'No bends', amountCents: 0 },
    ],
    totalCents: 24864,
    status: 'draft',
    createdAt: '2026-08-28T11:09:00Z',
  },
];

export const MOCK_SHIPPING_METHODS: ShippingMethod[] = [
  { id: 'S1', name: 'Standard courier', rateType: 'flat', rateCents: 1500, estDeliveryDays: 5, isActive: true },
  { id: 'S2', name: 'Pallet freight', rateType: 'perSheet', rateCents: 900, estDeliveryDays: 10, isActive: true },
  { id: 'S3', name: 'Express overnight', rateType: 'flat', rateCents: 4900, estDeliveryDays: 1, isActive: true },
  { id: 'S4', name: 'Local pickup (suspended)', rateType: 'flat', rateCents: 0, estDeliveryDays: 0, isActive: false },
];

export const MOCK_ORDERS: Order[] = [
  {
    id: 'ord_5001',
    quoteId: 'q_1041',
    quoteReference: 'Q-1041',
    orderNumber: 'ORD-2026-5001',
    confirmationNumber: 'CNF-7QK4-2M9X',
    stripeSessionId: 'cs_test_a1b2c3',
    materialName: 'Aluminium 2mm',
    quantity: 25,
    sheetCount: 1,
    subtotalCents: 29045,
    shippingMethodName: 'Standard courier',
    shippingCostCents: 1500,
    totalCents: 30545,
    shippingAddress: {
      fullName: 'Dana Ortiz',
      company: 'Ortiz Fabrication',
      line1: '48 Foundry Road',
      line2: 'Unit 12',
      city: 'Sheffield',
      region: 'South Yorkshire',
      postcode: 'S9 2LR',
      country: 'United Kingdom',
      phone: '+44 114 496 0121',
    },
    status: 'in_production',
    placedAt: '2026-09-02T16:02:00Z',
  },
  {
    id: 'ord_4987',
    quoteId: 'q_1024',
    quoteReference: 'Q-1024',
    orderNumber: 'ORD-2026-4987',
    confirmationNumber: 'CNF-3RD8-8T1P',
    stripeSessionId: 'cs_test_z9y8x7',
    materialName: 'Mild Steel 1.5mm',
    quantity: 60,
    sheetCount: 2,
    subtotalCents: 41200,
    shippingMethodName: 'Pallet freight',
    shippingCostCents: 1800,
    totalCents: 43000,
    shippingAddress: {
      fullName: 'Dana Ortiz',
      company: 'Ortiz Fabrication',
      line1: '48 Foundry Road',
      line2: '',
      city: 'Sheffield',
      region: 'South Yorkshire',
      postcode: 'S9 2LR',
      country: 'United Kingdom',
      phone: '+44 114 496 0121',
    },
    status: 'shipped',
    placedAt: '2026-08-19T10:31:00Z',
  },
];

export const MOCK_PRICING: PricingSettings = {
  setupFeeCents: 5000,
  costPerLinearFootCents: 250,
  perSheetCostCents: 1200,
  handlingFeeCents: 1500,
  costPerBendCents: 75,
  minimumOrderCents: 7500,
  qtyMin: 1,
  qtyMax: 1000,
};

export const MOCK_MACHINE: MachineSettings = {
  sheetSpacingMm: 5,
  sheetMarginMm: 10,
  allowedExtensions: ['.dxf'],
  maxUploadBytes: 5242880,
  animationSpeed: 1,
};

export const MOCK_BUSINESS: BusinessSettings = {
  companyName: 'Foundry Row Metalworks',
  logoUrl: '',
  primaryColor: '#1d4ed8',
  accentColor: '#ea580c',
  contactEmail: 'quotes@foundryrow.example',
  contactPhone: '+44 114 496 0100',
  addressLine1: '48 Foundry Road',
  addressLine2: 'Sheffield, S9 2LR',
  supportHours: 'Mon–Fri, 08:00–17:00 GMT',
  stripePublishableKey: 'pk_test_51NcAbCdEfGhIjKlMnOpQr',
  stripeSecretLast4: '5678',
  stripeWebhookLast4: '9f21',
};

export const MOCK_INTEGRATIONS: IntegrationSetting[] = [
  { key: 'postgresql', label: 'PostgreSQL', kind: 'service', description: 'Primary application database.', configured: true, maskedValue: 'postgres://••••@app-db:5432/cnc' },
  { key: 'minio', label: 'MinIO', kind: 'service', description: 'Object storage service for uploaded drawings.', configured: true, maskedValue: 'http://minio:9000' },
  { key: 'STRIPE_SDK_PYTHON_STRIPE_CHECKOUT_SESSIONS_API_KEY', label: 'Stripe SDK (Python) + Stripe Checkout Sessions', kind: 'integration', description: 'Hosted card payment and webhook events.', configured: false, maskedValue: '' },
  { key: 'RESEND_API_API_KEY', label: 'Resend API', kind: 'integration', description: 'Transactional order-confirmation email.', configured: false, maskedValue: '' },
  { key: 'MINIO_S3_BOTO3_API_KEY', label: 'MinIO / S3 (boto3)', kind: 'integration', description: 'CAD drawing object storage credentials.', configured: false, maskedValue: '' },
  { key: 'REDIS_API_KEY', label: 'Redis', kind: 'integration', description: 'API rate limiting and refresh-token revocation cache.', configured: false, maskedValue: '' },
];

/** Formats integer cents as a display price. */
export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

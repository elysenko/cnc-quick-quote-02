/** Domain models shared across the CNC Quick Quote UI. All money is integer cents. */

export type Role = 'USER' | 'MANAGER' | 'ADMIN';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

export interface Material {
  id: string;
  name: string;
  thicknessMm: number;
  sheetWidthMm: number;
  sheetHeightMm: number;
  costMultiplier: number;
  isActive: boolean;
}

export interface BendLine {
  id: string;
  drawingId: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  angleDeg: number;
  direction: 'up' | 'down';
}

export interface Drawing {
  id: string;
  filename: string;
  sizeBytes: number;
  bboxWMm: number;
  bboxHMm: number;
  cutLengthMm: number;
  entityCount: number;
  createdAt: string;
  /** Ordered outline loops in drawing units (mm), used by the work bed canvas. */
  paths: number[][];
}

export interface BreakdownLine {
  label: string;
  detail: string;
  amountCents: number;
}

export interface Placement {
  sheet: number;
  x: number;
  y: number;
}

export interface Quote {
  id: string;
  reference: string;
  drawingId: string;
  drawingName: string;
  materialId: string;
  materialName: string;
  quantity: number;
  cutLengthMmTotal: number;
  bendCount: number;
  sheetCount: number;
  utilization: number;
  perSheet: number;
  placements: Placement[];
  breakdown: BreakdownLine[];
  totalCents: number;
  status: 'draft' | 'ordered' | 'expired';
  createdAt: string;
}

export interface ShippingMethod {
  id: string;
  name: string;
  rateType: 'flat' | 'perSheet';
  rateCents: number;
  estDeliveryDays: number;
  isActive: boolean;
}

export interface ShippingAddress {
  fullName: string;
  company: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
  phone: string;
}

export interface Order {
  id: string;
  quoteId: string;
  quoteReference: string;
  orderNumber: string;
  confirmationNumber: string;
  stripeSessionId: string;
  materialName: string;
  quantity: number;
  sheetCount: number;
  subtotalCents: number;
  shippingMethodName: string;
  shippingCostCents: number;
  totalCents: number;
  shippingAddress: ShippingAddress;
  status: 'paid' | 'in_production' | 'shipped';
  placedAt: string;
}

export interface PricingSettings {
  setupFeeCents: number;
  costPerLinearFootCents: number;
  perSheetCostCents: number;
  handlingFeeCents: number;
  costPerBendCents: number;
  minimumOrderCents: number;
  qtyMin: number;
  qtyMax: number;
}

export interface MachineSettings {
  sheetSpacingMm: number;
  sheetMarginMm: number;
  allowedExtensions: string[];
  maxUploadBytes: number;
  animationSpeed: number;
}

export interface BusinessSettings {
  companyName: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  contactEmail: string;
  contactPhone: string;
  addressLine1: string;
  addressLine2: string;
  supportHours: string;
  stripePublishableKey: string;
  stripeSecretLast4: string;
  stripeWebhookLast4: string;
}

export interface IntegrationSetting {
  key: string;
  label: string;
  kind: 'service' | 'integration';
  description: string;
  configured: boolean;
  maskedValue: string;
}

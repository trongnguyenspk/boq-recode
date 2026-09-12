export type Brand = string;
export type StarterType = string; // Was: 'DOL' | 'Star-Delta' | 'VFD' | 'Soft-Starter';
export type Unit = 'Cái' | 'Mét' | 'Bộ';

/**
 * Canonical string key used to address a template tier by power.
 *
 * Power is deliberately represented as a string at the domain boundary.  The
 * branded type keeps callers from accidentally using an arbitrary display
 * value (for example `"5.50"`) as a tier key while remaining assignable to
 * normal strings at runtime.
 */
export type PowerKey = string;

/** Values accepted while reading legacy/UI data before normalization. */
export type PowerValue = PowerKey | number;

/** Canonicalize a decimal power value into the key shared by starters/templates. */
export function normalizePowerKey(value: unknown): PowerKey | undefined {
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || value < 0) return undefined;
        return String(value);
    }

    const raw = String(value ?? '')
        .replace(/[\u00a0\u200b-\u200d\ufeff]/g, ' ')
        .trim()
        .replace(',', '.');
    if (!raw || !/^(?:\+?\d+(?:\.\d*)?|\+?\.\d+)$/.test(raw)) return undefined;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return undefined;
    return String(parsed);
}

/**
 * A stable line in a starter template.  `qty` is the legacy field retained by
 * the current UI; `quantity` is accepted by the rebuilt core as a descriptive
 * alias when reading normalized data.
 */
export interface TemplateLine {
    id?: string;
    tierId?: string;
    matchKey: string;
    qty?: number;
    quantity?: number;
    condition?: ComponentCondition;
}

/** A normalized template tier.  Legacy nested maps are still supported by the core. */
export interface TemplateTier {
    id?: string;
    starterType?: StarterType;
    /** Alias used by some workbook adapters. */
    type?: StarterType;
    powerKey?: PowerKey;
    /** Legacy alias accepted by adapters before migration. */
    power?: PowerValue;
    lines?: TemplateLine[];
    /** Alias accepted by workbook/domain adapters. */
    items?: TemplateLine[];
}

export interface Product {
    id: string;
    code: string;
    ibomCode?: string; // Added iBom Code
    description: string;
    brand: Brand;
    unit: Unit;
    price?: number;
    matchKey?: string; // Used for linking generic requirements to specific products
}

export interface StarterConfig {
    id: string;
    type: StarterType;
    /** Canonical storage is a PowerKey; numeric values remain accepted for legacy data/UI. */
    power?: PowerValue; // kW (legacy alias; omitted when `powerKey` is persisted)
    /** Canonical key may be populated by migrated project data. */
    powerKey?: PowerKey;
    /** P1.2 (PA-1): opaque tier selector (free string). Falls back to normalized power when absent. */
    tierKey?: string;
    /** P1.2 (PA-1): free-text display of công suất; hiển thị thôi, KHÔNG dùng để tính toán. */
    powerLabel?: string;
    quantity: number;
    brand: Brand;
    isolator: boolean;
    isolatorBrand?: Brand;
    signals: {
        thermal: boolean;
        ptc: boolean;
        estop: boolean;
        humidity: boolean;
        isolator_BFP: boolean;
        estop_BFP: boolean;
        isolator_estop_FB: boolean;
    };
    loadName?: string; // Note for the load (e.g., "Pump 1")
}

export interface BOMItem {
    id: string;
    starterId: string; // Link back to the starter
    starterName: string; // e.g., "DOL - 5.5kW"
    ibomCode: string; // e.g., IBOM001
    productCode: string;
    description: string;
    brand: Brand;
    unit: Unit;
    quantity: number; // Quantity per starter * Starter Quantity
    matchKey?: string;
    loadName?: string; // Note from Starter
    /** Stable source identity for generated rows; absent on old/manual rows. */
    templateLineId?: string;
    /** Distinguishes generated rows from manually added project rows. */
    source?: 'generated' | 'manual' | 'common';
    /** Quantity before a project override, useful to explain a changed row. */
    defaultQuantity?: number;
}

export interface SummaryItem {
    id: string;
    ibomCode: string; // Added iBom Code
    productCode: string;
    description: string;
    brand: Brand;
    unit: Unit;
    totalQuantity: number;
}

export type ComponentCondition = 'always' | 'isolator' | 'thermal' | 'ptc' | 'estop' | 'humidity' | 'isolator_BFP' | 'estop_BFP' | 'isolator_estop_FB';

// --- Brand model (PLAN-BRAND-MODEL-2026-09-11) ---
// Nhóm thiết bị của một matchKey. Chỉ 4 nhóm đầu phụ thuộc nhãn hiệu (xem brand-policy.ts).
export type DeviceCategory =
    | 'BREAKER'      // MCB / MCCB / ACB / ELCB / RCCB / MPCB / CB
    | 'CONTACTOR'
    | 'THERMAL'      // relay nhiệt
    | 'ISOLATOR'
    | 'DRIVE'        // VFD / soft starter
    | 'CT'           // MCT / PCT
    | 'ACCESSORY'    // estop, timer, đèn báo, nút nhấn…
    | 'CABLE'
    | 'OTHER';

// Khai báo cho MỘT matchKey. `brandSensitive` là NGUỒN SỰ THẬT;
// `category` chỉ để gợi ý mặc định + hiển thị trong Admin.
export interface MatchKeyMeta {
    matchKey: string;
    category: DeviceCategory;
    brandSensitive: boolean;
}

export type MatchKeyMetaMap = Record<string, MatchKeyMeta>;

export interface TemplateItem {
    /** Stable identity used by quantity overrides; legacy rows may omit it. */
    id?: string;
    matchKey: string;
    qty: number;
    condition?: ComponentCondition;
}

export type LogicType = 'APPLY_ALL' | 'SELECT_ONE' | 'DEPENDENT' | 'LOOKUP' | 'UNKNOWN' | 'SIMPLE';

export interface CommonItem {
    ibomCode: string;
    description: string;
    productCode: string;
    brand: string;
    unit: string;
    note: string;
    quantity?: number;
}

export interface CommonGroup {
    id: string;
    logicText: string;
    logicType: LogicType;
    items: CommonItem[];
}

// ============================================
// Validation Types (E2: Validation & Warnings)
// ============================================

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
    id: string;
    severity: ValidationSeverity;
    message: string;
    details?: string;
    starterId?: string;      // Which starter caused this issue
    matchKey?: string;       // Which product matchKey is missing
    field?: string;          // Which field has the issue
    /** Stable machine-readable discriminator for UI/actions and tests. */
    code?: string;
    starterType?: string;
    powerKey?: PowerKey | string;
    templateLineId?: string;
    productCode?: string;
}

/** Diagnostic emitted while expanding source data into BOQ rows. */
export interface BoqDiagnostic extends ValidationIssue {
    code: string;
}

export interface ValidationResult {
    isValid: boolean;           // No errors (warnings allowed)
    hasWarnings: boolean;       // Has warnings
    errors: ValidationIssue[];  // Critical issues that should block export
    warnings: ValidationIssue[]; // Non-critical issues (missing products, etc.)
    infos: ValidationIssue[];   // Informational messages
}

// ============================================
// Project Types (E1: Project Management System)
// ============================================

export interface ProjectMetadata {
    name: string;
    description?: string;
    createdAt: string;      // ISO date string
    updatedAt: string;      // ISO date string
    author?: string;
    tags?: string[];
}

export interface Project {
    id: string;
    metadata: ProjectMetadata;
    starters: StarterConfig[];
    manualItems?: BOMItem[];     // Common items added manually
    bomQuantityOverrides?: Record<string, number>; // User overrides for cable quantities
}

/** Source catalog accepted by the pure BOQ engine. */
export interface BoqCatalog {
    /** Canonical name. */
    products?: Product[];
    /** Legacy name used by the existing application. */
    library?: Product[];
    templates?: Record<string, Record<string, TemplateLine[] | TemplateItem[]>> | TemplateTier[];
    matchKeyMeta?: MatchKeyMetaMap;
    /** Legacy alias used by callers that have not migrated yet. */
    meta?: MatchKeyMetaMap;
}

/** Project source accepted by the pure BOQ engine. */
export interface BoqProjectInput {
    starters: StarterConfig[];
    manualItems?: BOMItem[];
    bomQuantityOverrides?: Record<string, number>;
    /** Alias used by the rebuilt domain model. */
    quantityOverrides?: Record<string, number>;
}

export interface ComputeBoqResult {
    /** Detail after overrides, including diagnostic NOT_FOUND rows for repair. */
    detail: BOMItem[];
    /** Summary derived from detail; missing and zero-quantity rows are excluded. */
    summary: SummaryItem[];
    /** All validation issues, including generation diagnostics. */
    issues: ValidationIssue[];
    /** Generation diagnostics kept separately so the UI can group them. */
    diagnostics: BoqDiagnostic[];
    /** Full validation buckets for existing UI consumers. */
    validation: ValidationResult;
}

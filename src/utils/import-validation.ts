import type { Product, StarterConfig, Brand, StarterType, Unit } from '../types';
import { normalizePowerKey } from '../types';
import { normalizeMatchKey } from './brand-policy';

// P0-4: danh sách mặc định — GIỮ hành vi cũ khi caller không truyền danh sách (test & fallback).
// KHÔNG bỏ whitelist: nó chống injection từ file Excel không tin cậy (xem test có chữ "XSS").
// App truyền danh sách động (brands prop + brand đang có trong library) để không ép nhầm
// OMEGA/brand tuỳ chỉnh về Schneider khi round-trip Excel.
export const DEFAULT_BRANDS: string[] = ['Schneider', 'Mitsubishi', 'LS', 'Hyundai'];
export const DEFAULT_STARTER_TYPES: string[] = ['DOL', 'Star-Delta', 'VFD', 'Soft-Starter'];
const VALID_UNITS: Unit[] = ['Cái', 'Bộ', 'Mét'];

function normalizeImportedText(value: unknown): string {
    return String(value ?? '')
        .replace(/[\u00a0\u200b-\u200d\ufeff]/g, ' ')
        .trim();
}

// So khớp không phân biệt hoa thường + trim; trả về đúng chính tả trong danh sách cho phép.
function matchAllowed(raw: string, allowed: string[]): string | undefined {
    const needle = normalizeImportedText(raw).toLowerCase();
    if (!needle) return undefined;
    return allowed.find(a => normalizeImportedText(a).toLowerCase() === needle);
}

/**
 * Policy used by the detailed import APIs when a file contains a value that
 * is not present in the caller's catalog.  The legacy sanitizers keep their
 * fallback behavior for backwards compatibility; new import flows should use
 * `keep` and let the caller decide whether to add the value or skip the row.
 */
export type UnknownImportValuePolicy = 'fallback' | 'keep' | 'skip';

export type UnknownImportDecision = 'add' | 'fallback' | 'skip' | 'cancel';

/** Parse the explicit choice used by UI import confirmations. */
export function parseUnknownImportDecision(value: unknown): UnknownImportDecision {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'add') return 'add';
    if (normalized === 'fallback') return 'fallback';
    if (normalized === 'skip') return 'skip';
    return 'cancel';
}

export type ImportValidationField = 'Brand' | 'Type' | 'IsolatorBrand';

export interface ImportValidationIssue {
    field: ImportValidationField;
    value: string;
    fallback: string;
    policy: UnknownImportValuePolicy;
    row?: number;
    message: string;
}

export interface SanitizedImportResult<T> {
    value?: T;
    issues: ImportValidationIssue[];
}

export interface SanitizeImportOptions {
    /** Defaults to `keep` for the detailed APIs. */
    unknownBrand?: UnknownImportValuePolicy;
    /** Defaults to `keep` for the detailed APIs. */
    unknownType?: UnknownImportValuePolicy;
}

export interface SanitizedRowsResult<T> {
    records: T[];
    issues: ImportValidationIssue[];
}

function resolveAllowedValue(
    raw: string,
    allowed: string[],
    fallback: string,
    policy: UnknownImportValuePolicy,
    field: ImportValidationField,
    issues: ImportValidationIssue[],
): string | undefined {
    const matched = matchAllowed(raw, allowed);
    if (!raw || matched) return matched ?? fallback;

    issues.push({
        field,
        value: raw,
        fallback,
        policy,
        message: `${field} "${raw}" is not in the allowed catalog`,
    });

    if (policy === 'skip') return undefined;
    if (policy === 'keep') return raw;
    return fallback;
}

/**
 * Validate backup JSON structure to prevent corrupted data or XSS injection
 */
export function validateBackupJSON(backup: any): boolean {
    if (!backup || typeof backup !== 'object') return false;
    if (!backup.version || typeof backup.version !== 'string') return false;
    if (!backup.data || typeof backup.data !== 'object') return false;

    const { data } = backup;
    
    // Check specific keys in data if they exist, must be valid JSON strings
    const keysToCheck = ['commonGroups', 'logicConfig', 'library', 'templates', 'brands', 'projects', 'manualItems', 'bomOverrides', 'matchKeyMeta'];
    for (const key of keysToCheck) {
        if (data[key] !== undefined && data[key] !== null) {
            if (typeof data[key] !== 'string') return false;
            try {
                const parsed = JSON.parse(data[key]);
                // Basic type validations on parsed data
                if (key === 'library' && !Array.isArray(parsed)) return false;
                if (key === 'brands' && !Array.isArray(parsed)) return false;
                if (key === 'templates' && (typeof parsed !== 'object' || Array.isArray(parsed))) return false;
                if (key === 'matchKeyMeta' && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))) return false;
            } catch {
                return false;
            }
        }
    }
    return true;
}

/**
 * Sanitize product data imported from Excel
 */
export function sanitizeProduct(row: any, allowedBrands: string[] = DEFAULT_BRANDS): Product {
    const rawBrand = normalizeImportedText(row['Brand']);
    // P0-4: giữ brand hợp lệ (kể cả OMEGA / brand tuỳ chỉnh) thay vì ép cứng về Schneider.
    const matchedBrand = matchAllowed(rawBrand, allowedBrands);
    if (!matchedBrand && rawBrand) {
        console.warn(`[import] Brand "${rawBrand}" không nằm trong danh sách cho phép → fallback 'Schneider'`);
    }
    const brand: Brand = matchedBrand ?? 'Schneider';

    const rawUnit = normalizeImportedText(row['Unit']);
    // Default unit to Cái if not in validation list
    const unit: Unit = VALID_UNITS.includes(rawUnit as Unit)
        ? (rawUnit as Unit)
        : 'Cái';

    // Chuẩn hóa price: nếu NaN hoặc âm thì gán 0
    const rawPrice = Number(row['Price']);
    const price = (!isNaN(rawPrice) && rawPrice >= 0) ? rawPrice : 0;

    const matchKey = normalizeMatchKey(row['MatchKey']);

    return {
        id: String(row['ID'] || '').trim() || crypto.randomUUID(),
        code: String(row['Code'] || '').trim(),
        ibomCode: String(row['iBomCode'] || '').trim(),
        description: String(row['Description'] || '').trim(),
        brand,
        unit,
        price,
        ...(matchKey ? { matchKey } : {}),
    };
}

/**
 * Sanitize starter config imported from Excel
 */
export function sanitizeStarter(
    row: any,
    allowedTypes: string[] = DEFAULT_STARTER_TYPES,
    allowedBrands: string[] = DEFAULT_BRANDS
): StarterConfig {
    const rawType = normalizeImportedText(row['Type']);
    // P0-4: giữ starter type tuỳ chỉnh hợp lệ thay vì ép cứng về DOL.
    const matchedType = matchAllowed(rawType, allowedTypes);
    if (!matchedType && rawType) {
        console.warn(`[import] Starter type "${rawType}" không hợp lệ → fallback 'DOL'`);
    }
    const type: StarterType = matchedType ?? 'DOL';

    const rawBrand = normalizeImportedText(row['Brand']);
    const matchedBrand = matchAllowed(rawBrand, allowedBrands);
    if (!matchedBrand && rawBrand) {
        console.warn(`[import] Brand "${rawBrand}" không nằm trong danh sách cho phép → fallback 'Schneider'`);
    }
    const brand: Brand = matchedBrand ?? 'Schneider';

    const rawIsolatorBrand = normalizeImportedText(row['IsolatorBrand']);
    const matchedIsolatorBrand = matchAllowed(rawIsolatorBrand, allowedBrands);
    if (!matchedIsolatorBrand && rawIsolatorBrand) {
        console.warn(`[import] Isolator brand "${rawIsolatorBrand}" không nằm trong danh sách cho phép → dùng brand chính`);
    }
    const isolatorBrand: Brand | undefined = matchedIsolatorBrand;

    // PowerKey is the single canonical parser for values coming from Excel.
    // Invalid/blank values must still yield a valid starter (I-19), so they use
    // the documented minimum instead of allowing Math.max(..., NaN) to leak NaN.
    const powerKey = normalizePowerKey(row['Power']);
    const parsedPower = powerKey === undefined ? undefined : Number(powerKey);
    const power = parsedPower === undefined ? 0.18 : Math.max(0.18, parsedPower);
    // Chuẩn hóa quantity: nếu NaN, âm hoặc bằng 0 thì gán mặc định là 1
    const rawQuantity = Number(row['Quantity']);
    const quantity = (!isNaN(rawQuantity) && rawQuantity > 0) ? Math.max(1, Math.round(rawQuantity)) : 1;

    // Tên phụ tải: ưu tiên cột LoadName, chấp nhận cột Description của file mẫu cũ.
    const loadName = String(row['LoadName'] ?? row['Description'] ?? '').trim();

    return {
        id: crypto.randomUUID(),
        type,
        power,
        powerKey: normalizePowerKey(power),
        quantity,
        brand,
        ...(loadName ? { loadName } : {}),
        isolator: row['Isolator'] === 'Yes' || row['Isolator'] === true,
        isolatorBrand: row['Isolator'] === 'Yes' || row['Isolator'] === true ? (isolatorBrand || brand) : undefined,
        signals: {
            thermal: row['Thermal'] === 'Yes' || row['Thermal'] === true,
            ptc: row['PTC'] === 'Yes' || row['PTC'] === true,
            estop: row['Estop'] === 'Yes' || row['Estop'] === true,
            humidity: row['Humidity'] === 'Yes' || row['Humidity'] === true,
            isolator_BFP: row['IsolatorBFP'] === 'Yes' || row['IsolatorBFP'] === true,
            estop_BFP: row['EstopBFP'] === 'Yes' || row['EstopBFP'] === true,
            isolator_estop_FB: row['IsolatorEstopFB'] === 'Yes' || row['IsolatorEstopFB'] === true,
        }
    };
}

/**
 * Detailed product sanitizer for import flows that need a user-visible diff.
 * Unlike the legacy `sanitizeProduct`, this keeps unknown brands by default.
 */
export function sanitizeProductDetailed(
    row: any,
    allowedBrands: string[] = DEFAULT_BRANDS,
    options: SanitizeImportOptions = {},
): SanitizedImportResult<Product> {
    const source = row && typeof row === 'object' ? row : {};
    const issues: ImportValidationIssue[] = [];
    const unknownBrand = options.unknownBrand ?? 'keep';
    const brand = resolveAllowedValue(
        normalizeImportedText(source['Brand']),
        allowedBrands,
        'Schneider',
        unknownBrand,
        'Brand',
        issues,
    );
    if (brand === undefined) return { issues };

    const rawUnit = normalizeImportedText(source['Unit']);
    const unit: Unit = VALID_UNITS.includes(rawUnit as Unit) ? (rawUnit as Unit) : 'Cái';
    const rawPrice = Number(source['Price']);
    const price = (!isNaN(rawPrice) && rawPrice >= 0) ? rawPrice : 0;
    const matchKey = normalizeMatchKey(source['MatchKey']);

    return {
        issues,
        value: {
            id: String(source['ID'] || '').trim() || crypto.randomUUID(),
            code: String(source['Code'] || '').trim(),
            ibomCode: String(source['iBomCode'] || '').trim(),
            description: String(source['Description'] || '').trim(),
            brand: brand as Brand,
            unit,
            price,
            ...(matchKey ? { matchKey } : {}),
        },
    };
}

/** Detailed starter sanitizer; unknown type/brand values are reported. */
export function sanitizeStarterDetailed(
    row: any,
    allowedTypes: string[] = DEFAULT_STARTER_TYPES,
    allowedBrands: string[] = DEFAULT_BRANDS,
    options: SanitizeImportOptions = {},
): SanitizedImportResult<StarterConfig> {
    const source = row && typeof row === 'object' ? row : {};
    const issues: ImportValidationIssue[] = [];
    const unknownType = options.unknownType ?? 'keep';
    const unknownBrand = options.unknownBrand ?? 'keep';

    const type = resolveAllowedValue(
        normalizeImportedText(source['Type']),
        allowedTypes,
        'DOL',
        unknownType,
        'Type',
        issues,
    );
    const brand = resolveAllowedValue(
        normalizeImportedText(source['Brand']),
        allowedBrands,
        'Schneider',
        unknownBrand,
        'Brand',
        issues,
    );
    const isolator = source['Isolator'] === 'Yes' || source['Isolator'] === true;
    const rawIsolatorBrand = normalizeImportedText(source['IsolatorBrand']);
    const isolatorBrand = isolator
        ? resolveAllowedValue(
            rawIsolatorBrand,
            allowedBrands,
            brand ?? 'Schneider',
            unknownBrand,
            'IsolatorBrand',
            issues,
        )
        : undefined;

    if (type === undefined || brand === undefined || (isolator && isolatorBrand === undefined)) {
        return { issues };
    }

    const powerKey = normalizePowerKey(source['Power']);
    const parsedPower = powerKey === undefined ? undefined : Number(powerKey);
    const power = parsedPower === undefined ? 0.18 : Math.max(0.18, parsedPower);
    const rawQuantity = Number(source['Quantity']);
    const quantity = (!isNaN(rawQuantity) && rawQuantity > 0) ? Math.max(1, Math.round(rawQuantity)) : 1;
    const loadName = String(source['LoadName'] ?? source['Description'] ?? '').trim();

    return {
        issues,
        value: {
            id: crypto.randomUUID(),
            type: type as StarterType,
            power,
            powerKey: normalizePowerKey(power),
            quantity,
            brand: brand as Brand,
            ...(loadName ? { loadName } : {}),
            isolator,
            isolatorBrand: isolator ? ((isolatorBrand || brand) as Brand) : undefined,
            signals: {
                thermal: source['Thermal'] === 'Yes' || source['Thermal'] === true,
                ptc: source['PTC'] === 'Yes' || source['PTC'] === true,
                estop: source['Estop'] === 'Yes' || source['Estop'] === true,
                humidity: source['Humidity'] === 'Yes' || source['Humidity'] === true,
                isolator_BFP: source['IsolatorBFP'] === 'Yes' || source['IsolatorBFP'] === true,
                estop_BFP: source['EstopBFP'] === 'Yes' || source['EstopBFP'] === true,
                isolator_estop_FB: source['IsolatorEstopFB'] === 'Yes' || source['IsolatorEstopFB'] === true,
            },
        },
    };
}

/** Sanitize rows and attach one-based Excel row numbers to every issue. */
export function sanitizeProductRows(
    rows: readonly any[],
    allowedBrands: string[] = DEFAULT_BRANDS,
    options: SanitizeImportOptions = {},
): SanitizedRowsResult<Product> {
    const records: Product[] = [];
    const issues: ImportValidationIssue[] = [];
    rows.forEach((row, index) => {
        const result = sanitizeProductDetailed(row, allowedBrands, options);
        if (result.value) records.push(result.value);
        result.issues.forEach(issue => issues.push({ ...issue, row: index + 2 }));
    });
    return { records, issues };
}

export function sanitizeStarterRows(
    rows: readonly any[],
    allowedTypes: string[] = DEFAULT_STARTER_TYPES,
    allowedBrands: string[] = DEFAULT_BRANDS,
    options: SanitizeImportOptions = {},
): SanitizedRowsResult<StarterConfig> {
    const records: StarterConfig[] = [];
    const issues: ImportValidationIssue[] = [];
    rows.forEach((row, index) => {
        const result = sanitizeStarterDetailed(row, allowedTypes, allowedBrands, options);
        if (result.value) records.push(result.value);
        result.issues.forEach(issue => issues.push({ ...issue, row: index + 2 }));
    });
    return { records, issues };
}

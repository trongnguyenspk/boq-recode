/**
 * Validation for the pure BOQ result.
 *
 * Generation diagnostics are accepted as an optional third argument so callers
 * can report a missing tier even though that tier cannot produce a BOM row.
 */
import type {
    BOMItem,
    BoqDiagnostic,
    PowerKey,
    StarterConfig,
    ValidationIssue,
    ValidationResult,
} from '../types';
import { normalizePowerKey } from '../types';

function addDiagnostic(
    diagnostic: ValidationIssue,
    errors: ValidationIssue[],
    warnings: ValidationIssue[],
    infos: ValidationIssue[],
): void {
    if (diagnostic.severity === 'error') errors.push(diagnostic);
    else if (diagnostic.severity === 'warning') warnings.push(diagnostic);
    else infos.push(diagnostic);
}

function normalizedText(value: unknown): string {
    return String(value ?? '').replace(/[\u00a0\u200b-\u200d\ufeff]/g, ' ').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function starterBaseSignature(starter: StarterConfig): { signature: string; powerKey?: PowerKey } {
    const powerKey = normalizePowerKey(starter.powerKey ?? starter.power);
    const signals = starter.signals || {};
    const signature = [
        normalizedText(starter.type),
        powerKey ?? `invalid:${String(starter.power)}`,
        normalizedText(starter.brand),
        starter.isolator ? '1' : '0',
        normalizedText(starter.isolatorBrand),
        signals.thermal ? '1' : '0',
        signals.ptc ? '1' : '0',
        signals.estop ? '1' : '0',
        signals.humidity ? '1' : '0',
        signals.isolator_BFP ? '1' : '0',
        signals.estop_BFP ? '1' : '0',
        signals.isolator_estop_FB ? '1' : '0',
    ].join('|');
    return { signature, powerKey };
}

/**
 * Validates the BOM and returns errors, warnings and informational messages.
 * Missing products are errors in the rebuilt contract because a purchase BOQ
 * cannot be exported safely until every generated line resolves.
 */
export function validateBOM(
    bom: BOMItem[],
    starters: StarterConfig[],
    diagnostics: readonly (BoqDiagnostic | ValidationIssue)[] = [],
): ValidationResult {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];
    const infos: ValidationIssue[] = [];

    const generationDiagnostics = diagnostics || [];
    generationDiagnostics.forEach(item => addDiagnostic(item, errors, warnings, infos));

    // Manual rows and callers that invoke validation directly still need the
    // same quantity contract enforced by the export boundary.
    (bom || []).forEach(item => {
        if (Number.isFinite(item.quantity) && item.quantity >= 0) return;
        errors.push({
            id: `invalid-bom-quantity:${item.id}`,
            code: 'INVALID_BOM_QUANTITY',
            severity: 'error',
            message: `Khối lượng không hợp lệ cho dòng ${item.id}`,
            starterId: item.starterId,
            matchKey: item.matchKey,
            templateLineId: item.templateLineId,
            field: 'quantity',
        });
    });

    const bomIds = new Set<string>();
    (bom || []).forEach(item => {
        if (bomIds.has(item.id)) {
            errors.push({
                id: `duplicate-bom-id:${item.id}`,
                code: 'DUPLICATE_BOM_ID',
                severity: 'error',
                message: `Trùng định danh dòng BOQ: ${item.id}`,
                starterId: item.starterId,
                field: 'id',
            });
        }
        bomIds.add(item.id);
    });

    // Validate source starter fields even when the caller invokes validation
    // without first running the generator.
    (starters || []).forEach(starter => {
        const powerKey = normalizePowerKey(starter.powerKey ?? starter.power);
        if (!powerKey) {
            errors.push({
                id: `invalid-power:${starter.id}`,
                code: 'INVALID_POWER',
                severity: 'error',
                message: `Công suất không hợp lệ cho phụ tải ${starter.id}`,
                starterId: starter.id,
                starterType: starter.type,
                field: 'power',
            });
        }
        const quantity = Number(starter.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
            errors.push({
                id: `invalid-starter-quantity:${starter.id}`,
                code: 'INVALID_STARTER_QUANTITY',
                severity: 'error',
                message: `Số lượng phụ tải không hợp lệ cho ${starter.id}`,
                starterId: starter.id,
                field: 'quantity',
            });
        }
    });

    const starterIds = new Set<string>();
    (starters || []).forEach(starter => {
        if (starterIds.has(starter.id)) {
            errors.push({
                id: `duplicate-starter-id:${starter.id}`,
                code: 'DUPLICATE_STARTER_ID',
                severity: 'error',
                message: `Trùng định danh phụ tải: ${starter.id}`,
                starterId: starter.id,
                field: 'id',
            });
        }
        starterIds.add(starter.id);
    });

    const diagnosticIds = new Set(generationDiagnostics.map(item => item.id));
    const missingProducts = (bom || []).filter(item => item.productCode === 'NOT_FOUND');
    missingProducts.forEach(item => {
        // generateDetailWithDiagnostics emits the same issue. Keep direct calls
        // to validateBOM useful while avoiding a duplicate in computeBoq().
        if (diagnosticIds.has(`missing-product:${item.id}`)) return;
        errors.push({
            id: `missing-product:${item.id}`,
            code: 'MISSING_PRODUCT',
            severity: 'error',
            message: `Sản phẩm không tìm thấy: ${item.matchKey || 'Unknown'}`,
            details: `Starter: ${item.starterName}, Brand: ${item.brand}`,
            starterId: item.starterId,
            matchKey: item.matchKey,
            templateLineId: item.templateLineId,
            productCode: item.productCode,
        });
    });

    if ((bom || []).length === 0 && (starters || []).length > 0) {
        errors.push({
            id: 'empty-bom',
            code: 'EMPTY_BOM',
            severity: 'error',
            message: 'BOM rỗng mặc dù có starter được cấu hình',
            details: 'Kiểm tra lại templates và library',
        });
    }

    const startersWithoutLoadName = (starters || []).filter(s => normalizedText(s.loadName) === '');
    if (startersWithoutLoadName.length > 0) {
        infos.push({
            id: 'starters-no-loadname',
            code: 'STARTER_NO_LOAD_NAME',
            severity: 'info',
            message: `${startersWithoutLoadName.length} starter(s) chưa có tên tải`,
            details: 'Đặt tên tải giúp phân biệt các starter trong báo cáo',
        });
    }

    // Group by the complete configuration first, then by normalized load name.
    // Two identical unnamed loads are still duplicates; different names are
    // intentionally treated as distinct physical loads.
    const starterGroups = new Map<string, { starter: StarterConfig; powerKey?: PowerKey }[]>();
    (starters || []).forEach(starter => {
        const base = starterBaseSignature(starter);
        const list = starterGroups.get(base.signature);
        if (list) list.push({ starter, powerKey: base.powerKey });
        else starterGroups.set(base.signature, [{ starter, powerKey: base.powerKey }]);
    });

    starterGroups.forEach((group, signature) => {
        const byLoadName = new Map<string, { starter: StarterConfig; powerKey?: PowerKey }[]>();
        group.forEach(entry => {
            const key = normalizedText(entry.starter.loadName);
            const sameName = byLoadName.get(key);
            if (sameName) sameName.push(entry);
            else byLoadName.set(key, [entry]);
        });

        byLoadName.forEach((duplicates, loadName) => {
            if (duplicates.length < 2) return;
            const first = duplicates[0];
            const ids = duplicates.map(item => item.starter.id).join(', ');
            warnings.push({
                id: `duplicate-starters-${signature}-${loadName || '(unnamed)'}`,
                code: 'DUPLICATE_STARTER',
                severity: 'warning',
                message: `Có ${duplicates.length} starter trùng cấu hình`,
                details: `Starter: ${ids}. Xem xét sử dụng quantity thay vì tạo nhiều starter giống nhau`,
                starterId: first.starter.id,
                starterType: first.starter.type,
                powerKey: first.powerKey,
                field: 'loadName',
            });
        });
    });

    return {
        isValid: errors.length === 0,
        hasWarnings: warnings.length > 0,
        errors,
        warnings,
        infos,
    };
}

/** Get count of issues by severity. */
export function countIssues(result: ValidationResult): {
    total: number;
    errors: number;
    warnings: number;
    infos: number;
} {
    return {
        total: result.errors.length + result.warnings.length + result.infos.length,
        errors: result.errors.length,
        warnings: result.warnings.length,
        infos: result.infos.length,
    };
}

/** Check whether an export should be blocked. */
export function shouldBlockExport(result: ValidationResult, blockOnWarnings: boolean = false): boolean {
    if (!result.isValid) return true;
    if (blockOnWarnings && result.hasWarnings) return true;
    return false;
}

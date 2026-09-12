import type {
    BOMItem,
    SummaryItem,
    StarterConfig,
    Product,
    MatchKeyMetaMap,
    ValidationIssue,
    ValidationResult,
} from '../types';
import { normalizePowerKey } from '../types';
import { isBrandSensitive, normalizeMatchKey, pickPreferredProduct } from './brand-policy';
import { generateSummary } from './boq-logic';
import * as XLSX from 'xlsx';

export async function exportInputToExcel(starters: StarterConfig[]) {
    try {
        if (!XLSX) {
            throw new Error("XLSX library not loaded");
        }

        const wb = XLSX.utils.book_new();

        // Map starters to template format
        const data = starters.map(s => ({
            Type: s.type,
            Power: normalizePowerKey(s.powerKey ?? s.power) ?? s.power,
            Quantity: s.quantity,
            // `loadName` (tên phụ tải) trước đây bị bỏ trống khi xuất ⇒ nhập lại là mất.
            // Giữ luôn tên cột `Description` cho khớp file mẫu cũ.
            LoadName: s.loadName || '',
            Description: s.loadName || '',
            Brand: s.brand,
            Isolator: s.isolator ? 'Yes' : 'No',
            IsolatorBrand: s.isolatorBrand || '',
            Thermal: s.signals.thermal ? 'Yes' : 'No',
            PTC: s.signals.ptc ? 'Yes' : 'No',
            Estop: s.signals.estop ? 'Yes' : 'No',
            Humidity: s.signals.humidity ? 'Yes' : 'No',
            IsolatorBFP: s.signals.isolator_BFP ? 'Yes' : 'No',
            EstopBFP: s.signals.estop_BFP ? 'Yes' : 'No',
            IsolatorEstopFB: s.signals.isolator_estop_FB ? 'Yes' : 'No'
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "Input Data");

        // Save file with File System Access API if available
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'BOQ_Input_Data.xlsx',
                    types: [{
                        description: 'Excel File',
                        accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
                    }],
                });
                const writable = await handle.createWritable();
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const blob = new Blob([wbout], { type: 'application/octet-stream' });
                await writable.write(blob);
                await writable.close();
                return true;
            } catch (err: any) {
                if (err.name === 'AbortError') {
                    return false; // User cancelled
                }
                console.warn("File System Access API failed, falling back to default download", err);
            }
        }

        // Fallback
        XLSX.writeFile(wb, "BOQ_Input_Data.xlsx");
        return true;
    } catch (error) {
        console.error("Export Input error:", error);
        throw error;
    }
}

export async function exportLibraryToExcel(library: Product[]) {
    try {
        if (!XLSX) throw new Error("XLSX library not loaded");

        const wb = XLSX.utils.book_new();
        const data = library.map(p => ({
            ID: p.id,
            Code: p.code,
            iBomCode: p.ibomCode || '',
            Description: p.description,
            Brand: p.brand,
            Unit: p.unit,
            Price: p.price || 0,
            MatchKey: p.matchKey || ''
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "Library");

        // Save file
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'Product_Library.xlsx',
                    types: [{ description: 'Excel File', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
                });
                const writable = await handle.createWritable();
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const blob = new Blob([wbout], { type: 'application/octet-stream' });
                await writable.write(blob);
                await writable.close();
                return true;
            } catch (err: any) {
                if (err.name === 'AbortError') return false;
            }
        }

        XLSX.writeFile(wb, "Product_Library.xlsx");
        return true;
    } catch (error) {
        console.error("Export Library error:", error);
        throw error;
    }
}

// ============================================
// E3: Enhanced Excel Export Options
// ============================================

export type ExportFormat = 'full' | 'summary_only' | 'detail_only';

export interface ExportOptions {
    format: ExportFormat;
    projectName?: string;
    projectDescription?: string;
    author?: string;
    exportDate?: string;
    includeMetadata?: boolean;
    columns?: {
        detail?: (keyof BOMItem | 'starterName')[];
        summary?: (keyof SummaryItem)[];
    };
    /** Optional validation gate for callers that do not have an App-level guard. */
    validation?: ValidationResult;
    /** Optional generation diagnostics for direct export callers. */
    diagnostics?: readonly ValidationIssue[];
}

const DEFAULT_DETAIL_COLUMNS = ['starterName', 'ibomCode', 'description', 'productCode', 'brand', 'unit', 'quantity', 'loadName'] as const;
const DEFAULT_SUMMARY_COLUMNS = ['ibomCode', 'description', 'productCode', 'brand', 'unit', 'totalQuantity'] as const;

function isMissingProductCode(value: unknown): boolean {
    return String(value ?? '').trim().toUpperCase() === 'NOT_FOUND';
}

/** P1.3: khóa tổng hợp của một dòng Summary — đúng quy tắc generateSummary. */
function summaryKeyOf(item: SummaryItem): string {
    return (item.ibomCode && item.ibomCode !== 'N/A')
        ? item.ibomCode
        : (item.productCode ? item.productCode : `NO_CODE_${item.description}`);
}

/**
 * P1.3: Summary là dẫn xuất của Detail. Chặn export khi Summary do caller
 * truyền không khớp aggregate kỳ vọng derive từ Detail (stale/thiếu/thừa/sai qty).
 */
function reconcileSummary(expected: SummaryItem[], actual: SummaryItem[]): void {
    const EPS = 1e-9;
    const sum = (list: SummaryItem[]) => {
        const m = new Map<string, number>();
        list.forEach(i => {
            const k = summaryKeyOf(i);
            m.set(k, (m.get(k) ?? 0) + i.totalQuantity);
        });
        return m;
    };
    const exp = sum(expected);
    const act = sum(actual);
    const diffs: string[] = [];
    for (const k of new Set([...exp.keys(), ...act.keys()])) {
        const e = exp.get(k);
        const a = act.get(k);
        if (e === undefined) diffs.push(`thừa "${k}"`);
        else if (a === undefined) diffs.push(`thiếu "${k}"`);
        else if (Math.abs(e - a) > EPS) diffs.push(`"${k}" lệch (Detail=${e}, Summary=${a})`);
    }
    if (diffs.length > 0) {
        const shown = diffs.slice(0, 5).join('; ');
        const more = diffs.length > 5 ? ` …(+${diffs.length - 5})` : '';
        throw new Error(`Không thể xuất BOQ [SUMMARY_DETAIL_MISMATCH]: Summary không khớp Detail — ${shown}${more}.`);
    }
}

export interface PreparedExportRows {
    /** Detail rows that are enabled for output (quantity > 0). */
    detail: BOMItem[];
    /** Summary rows that represent a valid, positive quantity. */
    summary: SummaryItem[];
}

/**
 * Validate and normalize the row sets at the export boundary.
 *
 * Quantity zero is the domain representation of a user-deleted BOQ line, so
 * it is intentionally filtered out. Non-finite quantities are malformed data
 * and must fail loudly instead of being serialized as an invalid workbook.
 * Summary rows are filtered with the same positive-quantity rule and can
 * never expose the internal NOT_FOUND sentinel.
 */
export function prepareExportRows(
    bom: BOMItem[] = [],
    summary: SummaryItem[] = [],
): PreparedExportRows {
    const invalidBomQuantities = bom.filter(item => !Number.isFinite(item.quantity) || item.quantity < 0);
    if (invalidBomQuantities.length > 0) {
        throw new Error('Không thể xuất BOQ: có số lượng dòng chi tiết không hợp lệ.');
    }

    const invalidSummaryQuantities = summary.filter(item => !Number.isFinite(item.totalQuantity));
    if (invalidSummaryQuantities.length > 0) {
        throw new Error('Không thể xuất BOQ: có tổng khối lượng không hợp lệ.');
    }

    const detail = bom.filter(item => item.quantity > 0 && !isMissingProductCode(item.productCode));

    // P1.3: Summary là DẪN XUẤT của Detail — derive lại theo đúng generateSummary
    // để output luôn khớp Detail, thay vì tin mảng summary do caller truyền.
    const derivedSummary = generateSummary(bom);

    // Nếu caller có truyền Summary, reconcile với aggregate kỳ vọng; lệch => chặn.
    if (summary.length > 0) {
        const callerSummary = summary.filter(item => item.totalQuantity > 0 && !isMissingProductCode(item.productCode));
        reconcileSummary(derivedSummary, callerSummary);
    }

    return { detail, summary: derivedSummary };
}

function assertValidationGate(options?: ExportOptions): void {
    const issues: ValidationIssue[] = [];
    if (options?.validation) {
        issues.push(...options.validation.errors);
        if (!options.validation.isValid && options.validation.errors.length === 0) {
            issues.push({
                id: 'invalid-validation-result',
                code: 'INVALID_VALIDATION_RESULT',
                severity: 'error',
                message: 'Validation result is marked invalid without an error list',
            });
        }
    }
    if (options?.diagnostics) {
        issues.push(...options.diagnostics.filter(issue => issue.severity === 'error'));
    }

    const uniqueIssues = issues.filter((issue, index, all) =>
        all.findIndex(candidate => candidate.id === issue.id) === index
    );
    if (uniqueIssues.length === 0) return;

    const detail = uniqueIssues
        .slice(0, 5)
        .map(issue => `${issue.code ? `[${issue.code}] ` : ''}${issue.message}`)
        .filter(Boolean)
        .join('; ');
    const suffix = uniqueIssues.length > 5 ? ` (+${uniqueIssues.length - 5} lỗi khác)` : '';
    throw new Error(`Không thể xuất BOQ: có ${uniqueIssues.length} lỗi validation${suffix}.${detail ? ` ${detail}` : ''}`);
}

/**
 * Enhanced export to Excel with options
 * Part of E3: Enhanced Excel Export feature
 */
export async function exportToExcel(
    bom: BOMItem[],
    summary: SummaryItem[],
    options?: ExportOptions
) {
    try {
        if (!XLSX) {
            throw new Error("XLSX library not loaded");
        }

        // Direct callers may not have the React-level shouldBlockExport guard.
        // Keep the same error contract at the file boundary as a second line
        // of defence for missing templates and malformed source data.
        assertValidationGate(options);

        // A purchase workbook must never silently contain unresolved rows.
        // Diagnostics are rendered in the application, while this function is
        // deliberately strict so direct callers cannot bypass that contract.
        const unresolved = (bom || []).filter(item => isMissingProductCode(item.productCode));
        if (unresolved.length > 0) {
            throw new Error(`Không thể xuất BOQ: còn ${unresolved.length} dòng chưa tìm thấy sản phẩm.`);
        }

        const exportRows = prepareExportRows(bom || [], summary || []);

        const opts: ExportOptions = {
            format: 'full',
            includeMetadata: Boolean(options?.projectName || options?.projectDescription || options?.author),
            ...options,
        };

        const wb = XLSX.utils.book_new();

        // 0. Metadata Sheet (if enabled)
        if (opts.includeMetadata && (opts.projectName || opts.author || opts.projectDescription)) {
            const metadataRows = [
                ['BOQ Export Report'],
                [''],
                ['Project Name:', opts.projectName || 'N/A'],
                ['Description:', opts.projectDescription || ''],
                ['Author:', opts.author || ''],
                ['Export Date:', opts.exportDate || new Date().toLocaleDateString('vi-VN')],
                [''],
                ['Summary'],
                ['Total Items:', exportRows.detail.length],
                ['Unique Products:', exportRows.summary.length],
            ];
            const wsMetadata = XLSX.utils.aoa_to_sheet(metadataRows);
            XLSX.utils.book_append_sheet(wb, wsMetadata, "Project Info");
        }

        // 1. Detail Sheet (if not summary_only)
        if (opts.format !== 'summary_only') {
            const detailColumns = opts.columns?.detail || [...DEFAULT_DETAIL_COLUMNS];

            const detailData = exportRows.detail.map(item => {
                const row: Record<string, any> = {};
                detailColumns.forEach(col => {
                    const colName = col === 'starterName' ? 'Tên bộ khởi động'
                        : col === 'ibomCode' ? 'Mã iBom'
                            : col === 'description' ? 'Mô tả'
                                : col === 'productCode' ? 'Mã SP'
                                    : col === 'brand' ? 'Nhãn hiệu'
                                        : col === 'unit' ? 'Đơn vị'
                                            : col === 'quantity' ? 'Khối lượng'
                                                : col === 'loadName' ? 'Ghi chú (Load Name)'
                                                    : col;
                    const value = item[col as keyof BOMItem];
                    row[colName] = value ?? '';
                });
                return row;
            });
            const wsDetail = XLSX.utils.json_to_sheet(detailData);
            XLSX.utils.book_append_sheet(wb, wsDetail, "Detail");
        }

        // 2. Summary Sheet (if not detail_only)
        if (opts.format !== 'detail_only') {
            const summaryColumns = opts.columns?.summary || [...DEFAULT_SUMMARY_COLUMNS];
            
            // Sort summary items A->Z by description (Vietnamese-aware)
            const sortedSummary = [...exportRows.summary].sort((a, b) => 
                (a.description || '').localeCompare(b.description || '', 'vi')
            );

            const summaryData = sortedSummary.map((item, index) => {
                const row: Record<string, any> = { 'STT': index + 1 };
                summaryColumns.forEach(col => {
                    const colName = col === 'ibomCode' ? 'Mã iBom'
                        : col === 'description' ? 'Mô tả'
                            : col === 'productCode' ? 'Mã SP'
                                : col === 'brand' ? 'Nhãn hiệu'
                                    : col === 'unit' ? 'Đơn vị'
                                        : col === 'totalQuantity' ? 'Tổng Khối lượng'
                                            : col;
                    const value = item[col as keyof SummaryItem];
                    row[colName] = value ?? '';
                });
                return row;
            });
            const wsSummary = XLSX.utils.json_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");
        }

        // Generate filename based on options
        let filename = 'BOQ_Export';
        if (opts.projectName) {
            const sanitized = opts.projectName.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
            if (sanitized) filename = sanitized;
        }
        if (opts.format === 'summary_only') {
            filename += '_Summary';
        } else if (opts.format === 'detail_only') {
            filename += '_Detail';
        }
        filename += '.xlsx';

        // Save file with File System Access API if available
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{
                        description: 'Excel File',
                        accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
                    }],
                });
                const writable = await handle.createWritable();
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const blob = new Blob([wbout], { type: 'application/octet-stream' });
                await writable.write(blob);
                await writable.close();
                return true;
            } catch (err: any) {
                if (err.name === 'AbortError') {
                    return false; // User cancelled
                }
                console.warn("File System Access API failed, falling back to default download", err);
            }
        }

        // Fallback to default download
        XLSX.writeFile(wb, filename);
        return true;
    } catch (error) {
        console.error("Excel export error:", error);
        throw error;
    }
}


export async function exportTemplatesToExcel(templates: Record<string, Record<string, { id?: string; matchKey: string; qty: number; condition?: string }[]>>) {
    try {
        if (!XLSX) throw new Error("XLSX library not loaded");

        const wb = XLSX.utils.book_new();
        const data: any[] = [];

        // Flatten the nested structure
        Object.entries(templates).forEach(([type, powers]) => {
            Object.entries(powers).forEach(([power, components]) => {
                const powerKey = normalizePowerKey(power) ?? String(power).trim();
                // Sort components: Optional ones at the bottom
                const sortedComponents = [...components].sort((a, b) => {
                    const isOptionalA = a.condition && a.condition !== 'always';
                    const isOptionalB = b.condition && b.condition !== 'always';
                    if (isOptionalA === isOptionalB) return 0;
                    return isOptionalA ? 1 : -1;
                });

                sortedComponents.forEach(comp => {
                    data.push({
                        StarterType: type,
                        Power: powerKey,
                        ComponentMatchKey: comp.matchKey,
                        Quantity: comp.qty,
                        Condition: comp.condition || 'always',
                        ...(comp.id ? { TemplateLineId: comp.id } : {}),
                    });
                });
            });
        });

        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "Templates");

        // Save file
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'Starter_Templates.xlsx',
                    types: [{ description: 'Excel File', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
                });
                const writable = await handle.createWritable();
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const blob = new Blob([wbout], { type: 'application/octet-stream' });
                await writable.write(blob);
                await writable.close();
                return true;
            } catch (err: any) {
                if (err.name === 'AbortError') return false;
            }
        }

        XLSX.writeFile(wb, "Starter_Templates.xlsx");
        return true;
    } catch (error) {
        console.error("Export Templates error:", error);
        throw error;
    }
}

/**
 * Danh sách cột brand của file Match Key Matrix.
 * Trước đây hard-code 4 brand ⇒ OMEGA và mọi brand tuỳ chỉnh KHÔNG có cột ⇒ `code` bị rơi mất
 * ngay khi xuất, round-trip thành mất dữ liệu một chiều (lỗi M6).
 */
export function resolveMatrixBrands(library: Product[], brands?: string[]): string[] {
    const values = brands && brands.length > 0 ? brands : ['Schneider', 'Mitsubishi', 'LS', 'Hyundai'];
    const seen = new Set<string>();
    const result: string[] = [];
    const add = (value: unknown) => {
        const brand = String(value ?? '').replace(/[\u00a0\u200b-\u200d\ufeff]/g, ' ').trim().replace(/\s+/g, ' ');
        if (!brand) return;
        // Matrix column names remove whitespace, so collapse equivalent display
        // names here too and avoid one brand overwriting another on import.
        const key = brand.replace(/\s+/g, '').toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        result.push(brand);
    };
    values.forEach(add);
    library.forEach(p => { if (p.matchKey && p.brand) add(p.brand); });
    return result;
}

/**
 * Dựng các dòng của Match Key Matrix. Tách riêng khỏi phần ghi file để test được
 * mà không cần tới trình duyệt / File System API.
 */
export type MatrixRow = Record<string, string>;

export function buildMatchKeyMatrixRows(
    library: Product[],
    brands?: string[],
    meta: MatchKeyMetaMap = {}
): MatrixRow[] {
    const matrixBrands = resolveMatrixBrands(library, brands);
    const keys = Array.from(new Set(
        library.map(p => normalizeMatchKey(p.matchKey)).filter(Boolean)
    )) as string[];

    return keys.map(key => {
        const products = library.filter(p => normalizeMatchKey(p.matchKey) === key);
        // Bản ghi đại diện chọn TẤT ĐỊNH (cùng quy tắc với createLibraryIndex.byKey),
        // không lấy products[0] theo thứ tự mảng như trước (lỗi M7).
        const refProduct = pickPreferredProduct(products);

        const row: MatrixRow = {
            MatchKey: key,
            Description: refProduct?.description || '',
            Unit: refProduct?.unit || 'Cái',
            iBomCode: refProduct?.ibomCode || '',
            BrandSensitive: isBrandSensitive(key, meta) ? 'Yes' : 'No',
        };

        matrixBrands.forEach(brand => {
            const p = pickPreferredProduct(products.filter(prod => prod.brand === brand));
            row[`${brand}_Code`] = p?.code || '';
            // iBomCode phải theo TỪNG BRAND. Trước đây chỉ có một cột iBomCode dùng chung nên
            // round-trip ghi đè iBomCode của brand này bằng của brand khác — mà ibomCode chính là
            // khoá gộp của generateSummary ⇒ hai biến thể khác nhau bị nhập làm một (lỗi M7).
            row[`${brand}_iBomCode`] = p?.ibomCode || '';
        });

        return row;
    });
}

export async function exportMatchKeysToExcel(library: Product[], brands?: string[], meta: MatchKeyMetaMap = {}) {
    try {
        if (!XLSX) throw new Error("XLSX library not loaded");

        const wb = XLSX.utils.book_new();
        const data = buildMatchKeyMatrixRows(library, brands, meta);

        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "MatchKeys");

        // Save file
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'Match_Keys_Matrix.xlsx',
                    types: [{ description: 'Excel File', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
                });
                const writable = await handle.createWritable();
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const blob = new Blob([wbout], { type: 'application/octet-stream' });
                await writable.write(blob);
                await writable.close();
                return true;
            } catch (err: any) {
                if (err.name === 'AbortError') return false;
            }
        }

        XLSX.writeFile(wb, "Match_Keys_Matrix.xlsx");
        return true;
    } catch (error) {
        console.error("Export Match Keys error:", error);
        throw error;
    }
}

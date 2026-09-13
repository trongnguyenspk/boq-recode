import type { StarterConfig, Brand, Product, Unit, ComponentCondition, MatchKeyMetaMap } from '../types';
import { normalizePowerKey } from '../types';
import { defaultMetaFor, isBrandSensitive, normalizeMatchKey } from './brand-policy';
import { normalizeCondition } from './template-validation';
import {
    sanitizeProduct,
    sanitizeStarter,
    sanitizeProductRows,
    sanitizeStarterRows,
    type ImportValidationIssue,
    type SanitizeImportOptions,
} from './import-validation';
import * as XLSX from 'xlsx';
import { assertFileWithinLimit, assertWorkbookWithinLimits, sanitizeParsedRows } from './excel-safety';

export interface DetailedProductImportResult {
    products: Product[];
    issues: ImportValidationIssue[];
}

export interface DetailedStarterImportResult {
    starters: StarterConfig[];
    issues: ImportValidationIssue[];
}

function readFirstSheetRows(file: File): Promise<MatrixRawRow[]> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                assertWorkbookWithinLimits(workbook);
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                resolve(sanitizeParsedRows(XLSX.utils.sheet_to_json<MatrixRawRow>(worksheet)));
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        assertFileWithinLimit(file);
        reader.readAsArrayBuffer(file);
    });
}

export async function importLibraryFromExcel(file: File, allowedBrands?: string[]): Promise<Product[]> {
    try {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    assertWorkbookWithinLimits(workbook);
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = sanitizeParsedRows(XLSX.utils.sheet_to_json<MatrixRawRow>(worksheet));

                    // P0-4: allowedBrands do caller truyền (brands + brand trong library). undefined -> default cũ.
                    const products: Product[] = jsonData.map((row: any) => sanitizeProduct(row, allowedBrands));

                    resolve(products);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            assertFileWithinLimit(file);
            reader.readAsArrayBuffer(file);
        });
    } catch (error) {
        console.error("Library import error:", error);
        throw error;
    }
}

export async function importStartersFromExcel(file: File, allowedTypes?: string[], allowedBrands?: string[]): Promise<StarterConfig[]> {
    try {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    assertWorkbookWithinLimits(workbook);

                    // Assume first sheet is the data
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];

                    // Convert to JSON
                    const jsonData = sanitizeParsedRows(XLSX.utils.sheet_to_json(worksheet));

                    // Map to StarterConfig. P0-4: allowedTypes/allowedBrands undefined -> default cũ.
                    const starters: StarterConfig[] = jsonData.map((row: any) => sanitizeStarter(row, allowedTypes, allowedBrands));

                    resolve(starters);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            assertFileWithinLimit(file);
            reader.readAsArrayBuffer(file);
        });
    } catch (error) {
        console.error("Excel import error:", error);
        throw error;
    }
}

/**
 * Import a product workbook while retaining unknown-brand decisions in a
 * machine-readable report. The regular import function above remains the
 * compatibility API and falls back unknown brands to Schneider.
 */
export async function importLibraryFromExcelDetailed(
    file: File,
    allowedBrands?: string[],
    options: SanitizeImportOptions = {},
): Promise<DetailedProductImportResult> {
    const rows = await readFirstSheetRows(file);
    const result = sanitizeProductRows(rows, allowedBrands, options);
    return { products: result.records, issues: result.issues };
}

/** Import starter rows with an explicit unknown type/brand policy and report. */
export async function importStartersFromExcelDetailed(
    file: File,
    allowedTypes?: string[],
    allowedBrands?: string[],
    options: SanitizeImportOptions = {},
): Promise<DetailedStarterImportResult> {
    const rows = await readFirstSheetRows(file);
    const result = sanitizeStarterRows(rows, allowedTypes, allowedBrands, options);
    return { starters: result.records, issues: result.issues };
}

export async function downloadImportTemplate() {
    try {
        const wb = XLSX.utils.book_new();
        const templateData = [
            {
                Type: 'DOL',
                Power: 0.18,
                Quantity: 1,
                LoadName: 'Bơm nước thải',
                Description: 'Bơm nước thải',
                Brand: 'Schneider',
                Isolator: 'No',
                IsolatorBrand: '',
                Thermal: 'No',
                PTC: 'No',
                Estop: 'No',
                Humidity: 'No',
                IsolatorBFP: 'No',
                EstopBFP: 'No',
                IsolatorEstopFB: 'No'
            },
            {
                Type: 'Star-Delta',
                Power: 15,
                Quantity: 2,
                LoadName: 'Quạt hút khói',
                Description: 'Quạt hút khói',
                Brand: 'Mitsubishi',
                Isolator: 'Yes',
                IsolatorBrand: 'Mitsubishi',
                Thermal: 'Yes',
                PTC: 'No',
                Estop: 'Yes',
                Humidity: 'No',
                IsolatorBFP: 'No',
                EstopBFP: 'No',
                IsolatorEstopFB: 'Yes'
            }
        ];

        const ws = XLSX.utils.json_to_sheet(templateData);
        XLSX.utils.book_append_sheet(wb, ws, "Template");

        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'Import_Template.xlsx',
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
                return;
            } catch (err: any) {
                if (err.name === 'AbortError') return;
                console.warn("File System Access API failed, falling back to default download", err);
            }
        }

        XLSX.writeFile(wb, "Import_Template.xlsx");
    } catch (error) {
        console.error("Template download error:", error);
    }
}

export type TemplateMap = Record<string, Record<string, {
    id?: string;
    matchKey: string;
    qty: number;
    condition?: ComponentCondition;
}[]>>;

/**
 * Hợp nhất template đọc từ file vào template hiện có, THEO TỪNG MỨC (type, power).
 *
 * - Mức nào CÓ trong file  → danh sách linh kiện của mức đó lấy theo file (cho phép xoá linh kiện
 *   bằng cách bỏ dòng khỏi file — đây là đơn vị chỉnh sửa tự nhiên khi mở sheet).
 * - Mức nào KHÔNG có trong file → **giữ nguyên**, không bị đụng tới.
 *
 * Khác hẳn hành vi cũ: trước đây toàn bộ `templates` bị thay bằng đúng nội dung file.
 */
export interface TemplateTierRef {
    type: string;
    power: string;
}

export interface TemplatePowerCollision {
    source: 'current' | 'incoming';
    type: string;
    power: string;
    /** Distinct raw keys that collapsed into the canonical PowerKey. */
    rawPowers: string[];
    lineCount: number;
}

export interface TemplateMergeReport {
    addedTiers: TemplateTierRef[];
    replacedTiers: TemplateTierRef[];
    preservedTiers: TemplateTierRef[];
    collisions: TemplatePowerCollision[];
}

interface AggregatedTemplateTier {
    rawPowers: string[];
    components: TemplateMap[string][string];
}

/**
 * Merge templates and return a report suitable for a confirmation/diff UI.
 * Each source is first aggregated by canonical PowerKey, so two legacy keys
 * such as `5.50` and `5,5` can never overwrite one another during migration.
 */
export function mergeTemplatesWithReport(
    current: TemplateMap,
    incoming: TemplateMap,
): { templates: TemplateMap; report: TemplateMergeReport } {
    const merged: TemplateMap = {};
    const report: TemplateMergeReport = {
        addedTiers: [],
        replacedTiers: [],
        preservedTiers: [],
        collisions: [],
    };

    const aggregate = (source: TemplateMap, sourceName: 'current' | 'incoming') => {
        const byType = new Map<string, Map<string, AggregatedTemplateTier>>();
        Object.entries(source || {}).forEach(([type, powers]) => {
            if (!byType.has(type)) byType.set(type, new Map());
            const byPower = byType.get(type)!;
            Object.entries(powers || {}).forEach(([rawPower, components]) => {
                const canonical = normalizePowerKey(rawPower) ?? String(rawPower).trim();
                if (!canonical) return;
                const existing = byPower.get(canonical);
                const copied = (components || []).map(component => ({
                    ...component,
                    matchKey: normalizeMatchKey(component.matchKey),
                }));
                if (existing) {
                    existing.rawPowers.push(rawPower);
                    existing.components.push(...copied);
                } else {
                    byPower.set(canonical, { rawPowers: [rawPower], components: copied });
                }
            });
        });

        byType.forEach((byPower, type) => {
            byPower.forEach((tier, power) => {
                if (tier.rawPowers.length > 1) {
                    report.collisions.push({
                        source: sourceName,
                        type,
                        power,
                        rawPowers: [...tier.rawPowers],
                        lineCount: tier.components.length,
                    });
                }
            });
        });
        return byType;
    };

    const currentByType = aggregate(current, 'current');
    const incomingByType = aggregate(incoming, 'incoming');
    const currentTiers = new Set<string>();
    currentByType.forEach((byPower, type) => {
        if (!merged[type]) merged[type] = {};
        byPower.forEach((tier, power) => {
            currentTiers.add(`${type}\u0000${power}`);
            merged[type][power] = tier.components.map(component => ({ ...component }));
        });
    });

    const incomingTiers = new Set<string>();
    incomingByType.forEach((byPower, type) => {
        if (!merged[type]) merged[type] = {};
        byPower.forEach((tier, power) => {
            const key = `${type}\u0000${power}`;
            incomingTiers.add(key);
            if (currentTiers.has(key)) report.replacedTiers.push({ type, power });
            else report.addedTiers.push({ type, power });
            merged[type][power] = tier.components.map(component => ({ ...component }));
        });
    });

    currentByType.forEach((byPower, type) => {
        byPower.forEach((_tier, power) => {
            const key = `${type}\u0000${power}`;
            if (!incomingTiers.has(key)) report.preservedTiers.push({ type, power });
        });
    });

    return { templates: merged, report };
}

/** Compatibility API: callers that only need the merged map can keep using it. */
export function mergeTemplates(current: TemplateMap, incoming: TemplateMap): TemplateMap {
    return mergeTemplatesWithReport(current, incoming).templates;
}

/** Các mức (type, power) đang có trong `current` nhưng KHÔNG được file nhắc tới ⇒ sẽ giữ nguyên. */
export function untouchedTiers(current: TemplateMap, incoming: TemplateMap): { type: string; power: string }[] {
    const out: { type: string; power: string }[] = [];
    const seen = new Set<string>();
    const incomingByType = new Map<string, Set<string>>();
    Object.entries(incoming || {}).forEach(([type, powers]) => {
        incomingByType.set(type, new Set(Object.keys(powers || {}).map(rawPower =>
            normalizePowerKey(rawPower) ?? String(rawPower).trim()
        )));
    });
    Object.entries(current || {}).forEach(([type, powers]) => {
        const incomingPowers = incomingByType.get(type);
        Object.keys(powers || {}).forEach(power => {
            const canonical = normalizePowerKey(power) ?? String(power).trim();
            const key = `${type}\u0000${canonical}`;
            if ((!incomingPowers || !incomingPowers.has(canonical)) && !seen.has(key)) {
                seen.add(key);
                out.push({ type, power: canonical });
            }
        });
    });
    return out;
}

/** Tách phần đọc dòng ra khỏi I/O để test được. */
export function parseTemplateRows(rows: MatrixRawRow[]): TemplateImportResult {
    const templates: TemplateMap = {};
    const report: TemplateImportReport = {
        rows: rows.length, skipped: 0, invalidConditions: [], fixedQuantities: [], tiers: [],
    };

    rows.forEach((row, i) => {
        const type = String(row['StarterType'] ?? '').trim();
        const power = normalizePowerKey(row['Power']);
        const matchKey = normalizeMatchKey(row['ComponentMatchKey']);

        if (!type || !power || !matchKey) { report.skipped++; return; }

        const rawQty = Number(row['Quantity']);
        const qtyOk = !isNaN(rawQty) && rawQty > 0;
        if (!qtyOk) report.fixedQuantities.push({ type, power, matchKey, raw: row['Quantity'] });
        const qty = qtyOk ? Math.round(rawQty) : 1;

        // P3: kiểm tra condition thay vì ép kiểu trần. Gõ sai ⇒ chặn cả lần nhập,
        // vì condition sai làm linh kiện im lặng biến mất khỏi BOQ.
        const condition = normalizeCondition(row['Condition']);
        if (!condition) {
            report.invalidConditions.push({
                row: i + 2,                                   // +2: 1 dòng header + đánh số từ 1
                type, power, matchKey,
                condition: String(row['Condition'] ?? ''),
            });
            return;
        }

        if (!templates[type]) templates[type] = {};
        if (!templates[type][power]) templates[type][power] = [];
        const rawLineId = row['TemplateLineId'] ?? row['LineId'] ?? row['ID'];
        const lineId = cellText(rawLineId);
        templates[type][power].push({
            ...(lineId ? { id: lineId } : {}),
            matchKey,
            qty,
            condition,
        });
    });

    Object.entries(templates).forEach(([type, powers]) => {
        Object.entries(powers).forEach(([power, comps]) => {
            report.tiers.push({ type, power, count: comps.length });
        });
    });

    return { templates, report };
}

export interface TemplateImportReport {
    /** Tổng số dòng dữ liệu đọc được */
    rows: number;
    /** Dòng bị bỏ qua vì thiếu StarterType / Power / ComponentMatchKey */
    skipped: number;
    /** LỖI CHẶN: condition không thuộc VALID_CONDITIONS */
    invalidConditions: { row: number; type: string; power: string; matchKey: string; condition: string }[];
    /** Quantity phải chuẩn hoá về 1 */
    fixedQuantities: { type: string; power: string; matchKey: string; raw: unknown }[];
    /** Các mức (type, power) mà file này mô tả */
    tiers: { type: string; power: string; count: number }[];
}

export interface TemplateImportResult {
    templates: TemplateMap;
    report: TemplateImportReport;
}

/**
 * Đọc file Starter_Templates.xlsx.
 *
 * KHÔNG tự áp dụng: chỉ trả về nội dung file + báo cáo để caller quyết định cách hợp nhất.
 * Trước đây hàm này trả thẳng một object `templates` dựng lại từ đầu, và AdminPanel ghi đè
 * TOÀN BỘ ⇒ mọi starter type / mức công suất không có trong file đều biến mất (P1).
 */
export async function importTemplatesFromExcel(file: File): Promise<TemplateImportResult> {
    try {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    assertWorkbookWithinLimits(workbook);
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = sanitizeParsedRows(XLSX.utils.sheet_to_json(worksheet));

                    resolve(parseTemplateRows(jsonData as MatrixRawRow[]));
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            assertFileWithinLimit(file);
            reader.readAsArrayBuffer(file);
        });
    } catch (error) {
        console.error("Template import error:", error);
        throw error;
    }
}

export interface MatchKeyImportReport {
    added: number;
    updated: number;
    /** matchKey brand-agnostic nhưng file điền code ở nhiều cột brand — chỉ ô đầu được dùng */
    conflicts: { matchKey: string; used: string; ignored: string[] }[];
    /** có trong library nhưng ô code trong file đã bị xoá trắng — KHÔNG tự xoá, chỉ báo */
    cleared: { matchKey: string; brand: string; code: string }[];
    /** dòng bị bỏ qua vì thiếu MatchKey */
    skipped: number;
    /** true khi file không có cột BrandSensitive (file mẫu cũ) */
    missingBrandSensitiveColumn: boolean;
}

export interface MatchKeyImportResult {
    library: Product[];
    meta: MatchKeyMetaMap;
    report: MatchKeyImportReport;
}

/**
 * Áp các dòng Match Key Matrix vào library. Tách riêng khỏi phần đọc file để test được.
 *
 * Sửa hai lỗi cũ:
 *  - M5: vòng `brands.forEach` cũ nhân bản MỌI matchKey ra MỌI brand, kể cả món không phụ thuộc
 *    nhãn hiệu ⇒ Schneider (brand đầu danh sách) luôn được chèn trước và thắng ở `byKey`.
 *    Nay matchKey brand-agnostic chỉ tạo/cập nhật ĐÚNG 1 bản ghi.
 *  - M8: kết quả chỉ in `console.log`. Nay trả `report` cho UI hiển thị.
 *
 * KHÔNG bao giờ tự xoá bản ghi — ô code bị xoá trắng chỉ được liệt kê trong `report.cleared`.
 */
/** Một dòng thô đọc từ sheet — khoá là tên cột, giá trị do xlsx trả về. */
export type MatrixRawRow = Record<string, unknown>;

/** Normalize a cell for presence checks and round-trips through Excel. */
function cellText(value: unknown): string {
    return String(value ?? '')
        .replace(/[\u00a0\u200b-\u200d\ufeff]/g, ' ')
        .trim();
}

/** Column headers are whitespace-insensitive, including custom brands such as "Brand A". */
function brandColumnPrefix(brand: string): string {
    return cellText(brand).replace(/\s+/g, '').toLowerCase();
}

function normalizeHeaderKey(key: unknown): string {
    return cellText(key).replace(/\s+/g, '').toLowerCase();
}

function brandIdentity(brand: unknown): string {
    return brandColumnPrefix(String(brand ?? ''));
}

/**
 * Import callers historically passed only the user-managed brand list. Export
 * now includes brands found in the library as well, so infer those columns
 * from the current catalog and workbook headers before applying a matrix.
 */
function resolveMatrixImportBrands(
    rows: MatrixRawRow[],
    currentLibrary: Product[],
    brands: Brand[],
): Brand[] {
    const result: Brand[] = [];
    const seen = new Set<string>();
    const add = (value: unknown) => {
        const brand = cellText(value).replace(/\s+/g, ' ');
        const key = brandIdentity(brand);
        if (!key || seen.has(key)) return;
        seen.add(key);
        result.push(brand as Brand);
    };

    (brands || []).forEach(add);
    currentLibrary.forEach(product => {
        if (product.matchKey && product.brand) add(product.brand);
    });

    rows.forEach(row => {
        Object.keys(row).forEach(rawKey => {
            const key = normalizeHeaderKey(rawKey);
            if (!key.endsWith('_ibomcode') && !key.endsWith('_code')) return;
            const match = cellText(rawKey).match(/^(.*?)\s*_\s*(?:iBomCode|Code)\s*$/i);
            add(match?.[1] ?? '');
        });
    });

    return result;
}

export function applyMatchKeyMatrixRows(
    rows: MatrixRawRow[],
    currentLibrary: Product[],
    brands: Brand[],
    meta: MatchKeyMetaMap = {}
): MatchKeyImportResult {
    const matrixBrands = resolveMatrixImportBrands(rows, currentLibrary, brands);
    const newLibrary = [...currentLibrary];
    const nextMeta: MatchKeyMetaMap = { ...meta };
    const report: MatchKeyImportReport = {
        added: 0, updated: 0, conflicts: [], cleared: [], skipped: 0,
        missingBrandSensitiveColumn: false,
    };

    let sawBrandSensitiveColumn = false;

    rows.forEach((row: any) => {
        const normalizedRow: any = {};
        Object.keys(row).forEach(key => {
            normalizedRow[normalizeHeaderKey(key)] = row[key];
        });

        // Chuẩn hoá ngay khi đọc: ô Excel rất hay dính khoảng trắng thừa, và tra cứu
        // library là so khớp chuỗi tuyệt đối.
        const matchKey = normalizeMatchKey(normalizedRow['matchkey']);
        const description = cellText(normalizedRow['description']);
        const unitValue = cellText(normalizedRow['unit']);
        const unit = (unitValue || 'Cái') as Unit;
        const ibomCode = cellText(normalizedRow['ibomcode']);

        if (!matchKey) { report.skipped++; return; }

        // --- Cột BrandSensitive: thiếu cột ⇒ giữ khai báo cũ / suy luận theo tên ---
        const rawSensitive = normalizedRow['brandsensitive'];
        if (cellText(rawSensitive)) {
            sawBrandSensitiveColumn = true;
            const yes = cellText(rawSensitive).toLowerCase();
            const brandSensitive = yes === 'yes' || yes === 'true' || yes === '1' || yes === 'y';
            const base = nextMeta[matchKey] ?? defaultMetaFor(matchKey);
            nextMeta[matchKey] = { ...base, matchKey, brandSensitive };
        } else if (!nextMeta[matchKey]) {
            nextMeta[matchKey] = defaultMetaFor(matchKey);
        }

        const brandSensitive = isBrandSensitive(matchKey, nextMeta);

        // File mới có cột iBom riêng cho từng brand ⇒ cột iBomCode dùng chung CHỈ còn là thông tin
        // tham khảo, không được dùng làm giá trị dự phòng (nếu dùng, brand vốn không có iBom sẽ bị
        // gán iBom của brand đại diện — lại làm phẳng đúng như lỗi M7).
        const rowHasPerBrandIbom = matrixBrands.some(b =>
            Object.prototype.hasOwnProperty.call(normalizedRow, `${brandColumnPrefix(b)}_ibomcode`));

        // Gom các ô brand CÓ DỮ LIỆU trong dòng này.
        // Lưu ý: rất nhiều vật tư thật (toàn bộ MCT/PCT trong library) có `code` RỖNG và chỉ
        // định danh bằng iBomCode. Nếu chỉ xét `code` thì các món đó bị coi như ô trống và
        // biến mất khi import lại — đúng kiểu mất OMEGA mà người dùng gặp.
        const filled: { brand: Brand; code: string; ibom: string }[] = [];
        matrixBrands.forEach(brand => {
            const lower = brandColumnPrefix(brand);
            const code = cellText(normalizedRow[`${lower}_code`]);
            const ibom = cellText(normalizedRow[`${lower}_ibomcode`]);
            if (code || ibom) filled.push({ brand, code, ibom });
        });

        // Ô đã có trong library nhưng file để trống ⇒ báo cáo, KHÔNG xoá.
        matrixBrands.forEach(brand => {
            const lower = brandColumnPrefix(brand);
            const hasColumn = Object.prototype.hasOwnProperty.call(normalizedRow, `${lower}_code`)
                || Object.prototype.hasOwnProperty.call(normalizedRow, `${lower}_ibomcode`);
            if (!hasColumn) return;
            if (cellText(normalizedRow[`${lower}_code`]) || cellText(normalizedRow[`${lower}_ibomcode`])) return;
            const existing = newLibrary.find(p => normalizeMatchKey(p.matchKey) === matchKey
                && brandIdentity(p.brand) === brandIdentity(brand));
            if (existing && (cellText(existing.code) || cellText(existing.ibomCode))) {
                report.cleared.push({
                    matchKey,
                    brand,
                    code: cellText(existing.code) || cellText(existing.ibomCode),
                });
            }
        });

        // Món KHÔNG phụ thuộc nhãn hiệu chỉ được có ĐÚNG 1 bản ghi.
        const targets = brandSensitive ? filled : filled.slice(0, 1);
        if (!brandSensitive && filled.length > 1) {
            report.conflicts.push({
                matchKey,
                used: filled[0].brand,
                ignored: filled.slice(1).map(f => f.brand),
            });
        }

        targets.forEach(({ brand, code, ibom }) => {
            const existingIndex = newLibrary.findIndex(p => normalizeMatchKey(p.matchKey) === matchKey
                && brandIdentity(p.brand) === brandIdentity(brand));
            const perBrandIbom = ibom;
            // Cột iBomCode dùng chung CHỈ được dùng khi:
            //   (a) file không có cột riêng theo brand (file mẫu CŨ), VÀ
            //   (b) dòng này chỉ ghi vào ĐÚNG MỘT brand ⇒ giá trị chung rõ ràng thuộc về nó.
            // Nếu dòng ghi vào nhiều brand mà lấy chung một iBomCode thì các brand đó sẽ trùng
            // iBomCode — trong khi `generateSummary` gộp theo iBomCode ⇒ hai vật tư khác nhau bị
            // nhập làm một dòng Tổng hợp. Thà để rỗng: BOM tự sinh 'IBOM-<code>' nên vẫn phân biệt được.
            const sharedIbomFallback = (rowHasPerBrandIbom || targets.length > 1) ? '' : (ibomCode || '');

            if (existingIndex >= 0) {
                const existing = newLibrary[existingIndex];
                // Thứ tự ưu tiên iBomCode:
                //   1) cột riêng theo brand (ý định rõ ràng của người dùng)
                //   2) giá trị đang có trong thư viện  ⟵ CHẶN việc cột dùng chung làm phẳng
                //      iBomCode giữa các brand (lỗi M7)
                //   3) cột iBomCode dùng chung — chỉ với file mẫu cũ
                const nextIbom = perBrandIbom || existing.ibomCode || sharedIbomFallback;
                newLibrary[existingIndex] = {
                    ...existing,
                    matchKey,
                    code,
                    description: description || existing.description,
                    ibomCode: nextIbom,
                    unit: unitValue ? unit : existing.unit,
                };
                report.updated++;
            } else {
                newLibrary.push({
                    id: crypto.randomUUID(),
                    matchKey,
                    brand: brand as Brand,
                    code,
                    description,
                    ibomCode: perBrandIbom || sharedIbomFallback,
                    unit,
                    price: 0
                });
                report.added++;
            }
        });
    });

    report.missingBrandSensitiveColumn = rows.length > 0 && !sawBrandSensitiveColumn;
    return { library: newLibrary, meta: nextMeta, report };
}

export async function importMatchKeysFromExcel(
    file: File,
    currentLibrary: Product[],
    brands: Brand[],
    meta: MatchKeyMetaMap = {}
): Promise<MatchKeyImportResult> {
    try {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    assertWorkbookWithinLimits(workbook);
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = sanitizeParsedRows(XLSX.utils.sheet_to_json<MatrixRawRow>(worksheet));

                    if (jsonData.length === 0) {
                        reject(new Error("Excel file is empty or could not be parsed."));
                        return;
                    }

                    resolve(applyMatchKeyMatrixRows(jsonData, currentLibrary, brands, meta));
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            assertFileWithinLimit(file);
            reader.readAsArrayBuffer(file);
        });
    } catch (error) {
        console.error("Match Key import error:", error);
        throw error;
    }
}

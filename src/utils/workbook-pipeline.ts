import * as XLSX from 'xlsx';
import type {
    BOMItem,
    BoqCatalog,
    Brand,
    ComponentCondition,
    MatchKeyMeta,
    MatchKeyMetaMap,
    Product,
    Project,
    StarterConfig,
    TemplateLine,
    Unit,
} from '../types';
import type { StoredTemplateCatalog } from './storage-registry';
import { normalizePowerKey } from '../types';
import { defaultMetaFor, isBrandSensitive, normalizeMatchKey, pickPreferredProduct } from './brand-policy';
import { normalizeCondition, VALID_CONDITIONS } from './template-validation';

/**
 * Generic workbook boundary for catalog/project edits.
 *
 * The existing application has three independent Excel adapters. This module
 * intentionally stays UI-free and provides one deterministic representation
 * for a combined workbook. Missing rows are never interpreted as deletes;
 * deletion is explicit through `Action=delete`.
 */

export const WORKBOOK_SCHEMA = 'boq-workbook';
export const WORKBOOK_SCHEMA_VERSION = 1;

export const WORKBOOK_SHEETS = [
    '_Meta',
    'Products',
    'MatchKeys',
    'Templates',
    'Brands',
    'Project',
    'Starters',
    'ManualLines',
    'Overrides',
] as const;

export type WorkbookSheet = typeof WORKBOOK_SHEETS[number];
/**
 * `replace-tier` is valid only on Templates.  It replaces all lines in the
 * `(StarterType, Power)` tier represented by the incoming rows; tiers that do
 * not occur in the workbook are left untouched.
 */
export type WorkbookAction = 'upsert' | 'delete' | 'skip' | 'replace-tier';
export type WorkbookRow = Record<string, unknown>;

/** Canonical nested template map used at the workbook boundary. */
export type WorkbookTemplateMap = Record<string, Record<string, TemplateLine[]>>;

export interface WorkbookState {
    library: Product[];
    templates: WorkbookTemplateMap;
    brands: string[];
    matchKeyMeta: MatchKeyMetaMap;
    project?: Project;
}

export interface WorkbookStateInput {
    catalog?: Partial<BoqCatalog> & {
        brands?: string[];
    };
    library?: Product[];
    products?: Product[];
    templates?: StoredTemplateCatalog | WorkbookTemplateMap;
    brands?: string[];
    matchKeyMeta?: MatchKeyMetaMap;
    meta?: MatchKeyMetaMap;
    project?: Project;
}

/** Public name used by storage/workbook adapters in the rebuild plan. */
export type WorkbookSource = WorkbookStateInput;

export interface WorkbookMetaRow {
    Schema?: string;
    SchemaVersion: number;
    ExportedAt: string;
    Counts_Products: number;
    Counts_MatchKeys: number;
    Counts_Templates: number;
    Counts_Brands: number;
    Counts_Starters: number;
    Counts_ManualLines: number;
    Counts_Overrides: number;
}

export interface WorkbookRows {
    _Meta: WorkbookRow[];
    Products: WorkbookRow[];
    MatchKeys: WorkbookRow[];
    Templates: WorkbookRow[];
    Brands: WorkbookRow[];
    Project: WorkbookRow[];
    Starters: WorkbookRow[];
    ManualLines: WorkbookRow[];
    Overrides: WorkbookRow[];
}

export interface WorkbookIssue {
    severity: 'error' | 'warning' | 'info';
    code: string;
    message: string;
    sheet?: WorkbookSheet | string;
    row?: number;
    key?: string;
    field?: string;
}

export interface ParsedWorkbook {
    rows: WorkbookRows;
    meta?: WorkbookMetaRow;
    issues: WorkbookIssue[];
    /** True when one or more legacy sheet names were used or `_Meta` was absent. */
    legacy: boolean;
}

export interface WorkbookChange {
    sheet: WorkbookSheet;
    action: WorkbookAction;
    key: string;
    row?: number;
    before?: WorkbookRow;
    after?: WorkbookRow;
    changedFields?: string[];
}

export interface WorkbookSheetDiff {
    sheet: WorkbookSheet;
    added: WorkbookChange[];
    updated: WorkbookChange[];
    deleted: WorkbookChange[];
    skipped: WorkbookChange[];
    /** Aliases useful to callers that prefer noun forms. */
    additions: WorkbookChange[];
    updates: WorkbookChange[];
    deletes: WorkbookChange[];
}

export interface WorkbookDiff {
    schema: typeof WORKBOOK_SCHEMA;
    schemaVersion: number;
    sheets: Record<WorkbookSheet, WorkbookSheetDiff>;
    issues: WorkbookIssue[];
    /** Flattened changes for simple preview consumers. */
    changes: WorkbookChange[];
}

export type WorkbookInput = XLSX.WorkBook | ArrayBuffer | Uint8Array | string;

const EMPTY_UNIT = 'Cái' as Unit;
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const VALID_ACTION_VALUES = new Set(['upsert', 'delete', 'remove', 'skip', 'ignore', 'replace-tier', 'replace tier', 'replace_tier']);
const LEGACY_SHEET_NAMES: Partial<Record<WorkbookSheet, string[]>> = {
    Products: ['Library', 'Product Library'],
    MatchKeys: ['Match Key Matrix', 'Match Keys'],
    Templates: ['Template', 'Starter Templates'],
    Starters: ['Input Data', 'Input'],
};

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function text(value: unknown): string {
    return String(value ?? '')
        .replace(/[\u00a0\u200b-\u200d\ufeff]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function normalized(value: unknown): string {
    return text(value).toLowerCase();
}

function headerKey(value: unknown): string {
    return text(value).replace(/[\s._-]+/g, '').toLowerCase();
}

function actionOf(row: WorkbookRow): WorkbookAction {
    const raw = normalized(readCell(row, 'Action'));
    if (raw === 'delete' || raw === 'remove') return 'delete';
    if (raw === 'skip' || raw === 'ignore') return 'skip';
    if (raw === 'replace-tier' || raw === 'replace tier' || raw === 'replace_tier') return 'replace-tier';
    return 'upsert';
}

function readCell(row: WorkbookRow, name: string): unknown {
    const expected = headerKey(name);
    const entry = Object.entries(row).find(([key]) => headerKey(key) === expected);
    return entry?.[1];
}

function readCellString(row: WorkbookRow, name: string): string {
    return text(readCell(row, name));
}

function readNumber(row: WorkbookRow, name: string): number | undefined {
    const value = readCell(row, name);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const raw = text(value).replace(',', '.');
    if (!raw) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function boolCell(value: unknown): boolean {
    const valueText = normalized(value);
    return value === true || valueText === 'yes' || valueText === 'true' || valueText === '1' || valueText === 'y' || valueText === 'có';
}

function boolToExcel(value: unknown): string {
    return value ? 'Yes' : 'No';
}

function safeObject(row: WorkbookRow): WorkbookRow {
    const result: WorkbookRow = {};
    Object.entries(row || {}).forEach(([key, value]) => {
        if (!DANGEROUS_KEYS.has(key)) result[key] = value;
    });
    return result;
}

function normalizeBrand(value: unknown): Brand {
    return text(value) as Brand;
}

function brandColumnPrefix(value: unknown): string {
    return normalizeBrand(value).replace(/\s+/g, '').toLowerCase();
}

function dynamicBrandCell(row: WorkbookRow, brand: string, suffix: 'Code' | 'iBomCode'): string {
    const expectedBrand = brandColumnPrefix(brand);
    const expectedSuffix = suffix.toLowerCase();
    const entry = Object.entries(row).find(([key]) => {
        const match = key.match(/^(.*?)_(Code|iBomCode)$/i);
        return Boolean(match && brandColumnPrefix(match[1]) === expectedBrand && match[2].toLowerCase() === expectedSuffix);
    });
    return text(entry?.[1]);
}

function matchKeyFromRow(row: WorkbookRow): string {
    return normalizeMatchKey(readCellString(row, 'MatchKey'));
}

function rowActionAndKey(sheet: WorkbookSheet, row: WorkbookRow, rowNumber: number): { action: WorkbookAction; key?: string } {
    const action = actionOf(row);
    let key = '';
    switch (sheet) {
        case 'Products': {
            const matchKey = matchKeyFromRow(row);
            const brand = normalized(readCellString(row, 'Brand'));
            const rowKey = readCellString(row, 'RowKey') || readCellString(row, 'ID');
            key = matchKey ? `match:${matchKey}|brand:${brand}` : `row:${rowKey}`;
            break;
        }
        case 'MatchKeys':
            key = `match:${matchKeyFromRow(row)}`;
            break;
        case 'Templates': {
            const type = readCellString(row, 'StarterType') || readCellString(row, 'Type');
            const power = normalizePowerKey(readCell(row, 'Power')) ?? '';
            const matchKey = normalizeMatchKey(readCellString(row, 'ComponentMatchKey') || readCellString(row, 'MatchKey'));
            const lineId = readCellString(row, 'TemplateLineId') || readCellString(row, 'LineId') || readCellString(row, 'ID');
            // A stable line id is required to address duplicate matchKeys in
            // one tier. Legacy rows without an id retain matchKey identity.
            if (lineId) key = `template:${normalized(type)}|power:${power}|line:${lineId}`;
            else if (action === 'replace-tier' && type && power && !matchKey) key = `template-tier:${normalized(type)}|power:${power}`;
            else key = `template:${normalized(type)}|power:${power}|match:${matchKey}`;
            break;
        }
        case 'Brands':
            key = `brand:${normalized(readCellString(row, 'Brand'))}`;
            break;
        case 'Project':
            key = `project:${readCellString(row, 'ProjectId') || readCellString(row, 'RowKey') || 'current'}`;
            break;
        case 'Starters':
            key = `starter:${readCellString(row, 'RowKey') || readCellString(row, 'ID')}`;
            break;
        case 'ManualLines':
            key = `manual:${readCellString(row, 'RowKey') || readCellString(row, 'ID')}`;
            break;
        case 'Overrides':
            key = `override:${readCellString(row, 'RowKey') || readCellString(row, 'ID') || readCellString(row, 'LineId')}`;
            break;
        case '_Meta':
            key = 'meta';
            break;
    }
    if (key.endsWith(':') || key.includes('|match:')) {
        // The `|match:` suffix may be empty for malformed rows. Keep the key
        // only when the row actually contains an identity field.
        const identity = key.replace(/^(?:.*?:)?(?:row|starter|manual|override|match|template|brand|project):?/, '');
        if (!identity || identity.endsWith('|match:') || identity === 'undefined') return { action };
    }
    if (!key || key.endsWith(':') || key.endsWith('|match:')) return { action };
    return { action, key };
}

function templateRowsFromState(templates: WorkbookTemplateMap): WorkbookRow[] {
    const rows: WorkbookRow[] = [];
    Object.entries(templates || {}).sort(([a], [b]) => a.localeCompare(b)).forEach(([type, powers]) => {
        Object.entries(powers || {}).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).forEach(([rawPower, lines]) => {
            const power = normalizePowerKey(rawPower) ?? text(rawPower);
            const tierId = (lines || []).find(line => text(line.tierId))?.tierId || `${type}:${power}`;
            (lines || []).forEach((line, index) => {
                const matchKey = normalizeMatchKey(line.matchKey);
                rows.push({
                    Action: 'upsert',
                    StarterType: type,
                    Power: power,
                    TierId: tierId,
                    ComponentMatchKey: matchKey,
                    Quantity: line.qty ?? line.quantity ?? 0,
                    Condition: line.condition || 'always',
                    TemplateLineId: line.id || `${type}:${power}:${index}`,
                });
            });
        });
    });
    return rows;
}

function productRowsFromState(library: Product[]): WorkbookRow[] {
    return (library || []).map(product => ({
        Action: 'upsert',
        RowKey: product.id,
        MatchKey: normalizeMatchKey(product.matchKey),
        Brand: product.brand,
        Code: product.code,
        iBomCode: product.ibomCode || '',
        Description: product.description,
        Unit: product.unit,
        Price: product.price ?? 0,
    }));
}

function representativeProducts(library: Product[]): Map<string, Product> {
    const groups = new Map<string, Product[]>();
    (library || []).forEach(product => {
        const key = normalizeMatchKey(product.matchKey);
        if (!key) return;
        groups.set(key, [...(groups.get(key) || []), product]);
    });
    const result = new Map<string, Product>();
    groups.forEach((products, key) => {
        const preferred = pickPreferredProduct(products);
        if (preferred) result.set(key, preferred);
    });
    return result;
}

function resolveBrands(state: WorkbookState): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    const add = (value: unknown) => {
        const brand = normalizeBrand(value);
        const key = normalized(brand);
        if (!key || seen.has(key)) return;
        seen.add(key);
        result.push(brand);
    };
    (state.brands || []).forEach(add);
    (state.library || []).forEach(product => add(product.brand));
    return result;
}

function matchKeyRowsFromState(state: WorkbookState): WorkbookRow[] {
    const brands = resolveBrands(state);
    const keys = new Set<string>();
    (state.library || []).forEach(product => {
        const key = normalizeMatchKey(product.matchKey);
        if (key) keys.add(key);
    });
    Object.keys(state.matchKeyMeta || {}).forEach(key => {
        const normalizedKey = normalizeMatchKey(key);
        if (normalizedKey) keys.add(normalizedKey);
    });
    const representatives = representativeProducts(state.library);
    return Array.from(keys).sort().map(matchKey => {
        const representative = representatives.get(matchKey);
        const meta = state.matchKeyMeta[matchKey] || defaultMetaFor(matchKey);
        const row: WorkbookRow = {
            Action: 'upsert',
            MatchKey: matchKey,
            BrandSensitive: boolToExcel(meta.brandSensitive),
            Category: meta.category,
            Description: representative?.description || '',
            Unit: representative?.unit || EMPTY_UNIT,
        };
        brands.forEach(brand => {
            const product = pickPreferredProduct((state.library || []).filter(candidate =>
                normalizeMatchKey(candidate.matchKey) === matchKey && normalized(candidate.brand) === normalized(brand)
            ));
            row[`${brand}_Code`] = product?.code || '';
            row[`${brand}_iBomCode`] = product?.ibomCode || '';
        });
        return row;
    });
}

function starterRowsFromState(project?: Project): WorkbookRow[] {
    return (project?.starters || []).map(starter => ({
        Action: 'upsert',
        RowKey: starter.id,
        Type: starter.type,
        Power: normalizePowerKey(starter.powerKey ?? starter.power) ?? starter.power ?? '',
        Quantity: starter.quantity,
        LoadName: starter.loadName || '',
        Brand: starter.brand,
        Isolator: boolToExcel(starter.isolator),
        IsolatorBrand: starter.isolatorBrand || '',
        Thermal: boolToExcel(starter.signals?.thermal),
        PTC: boolToExcel(starter.signals?.ptc),
        Estop: boolToExcel(starter.signals?.estop),
        Humidity: boolToExcel(starter.signals?.humidity),
        IsolatorBFP: boolToExcel(starter.signals?.isolator_BFP),
        EstopBFP: boolToExcel(starter.signals?.estop_BFP),
        IsolatorEstopFB: boolToExcel(starter.signals?.isolator_estop_FB),
    }));
}

function projectRowsFromState(project?: Project): WorkbookRow[] {
    if (!project) return [];
    return [{
        Action: 'upsert',
        ProjectId: project.id,
        Name: project.metadata.name,
        Description: project.metadata.description || '',
        CreatedAt: project.metadata.createdAt,
        UpdatedAt: project.metadata.updatedAt,
        Author: project.metadata.author || '',
        Tags: (project.metadata.tags || []).join(', '),
    }];
}

function manualRowsFromState(project?: Project): WorkbookRow[] {
    return (project?.manualItems || []).map(item => ({
        Action: 'upsert',
        RowKey: item.id,
        StarterId: item.starterId,
        StarterName: item.starterName,
        iBomCode: item.ibomCode,
        ProductCode: item.productCode,
        Description: item.description,
        Brand: item.brand,
        Unit: item.unit,
        Quantity: item.quantity,
        MatchKey: item.matchKey || '',
        LoadName: item.loadName || '',
        TemplateLineId: item.templateLineId || '',
        Source: item.source || 'manual',
    }));
}

function overrideRowsFromState(project?: Project): WorkbookRow[] {
    return Object.entries(project?.bomQuantityOverrides || {}).map(([id, quantity]) => ({
        Action: 'upsert',
        RowKey: id,
        Quantity: quantity,
    }));
}

function countTemplateLines(templates: WorkbookTemplateMap): number {
    return Object.values(templates || {}).reduce((typeTotal, powers) => typeTotal + Object.values(powers || {})
        .reduce((powerTotal, lines) => powerTotal + (lines?.length || 0), 0), 0);
}

function metaRowsFromState(state: WorkbookState): WorkbookRow[] {
    const rows = {
        Schema: WORKBOOK_SCHEMA,
        SchemaVersion: WORKBOOK_SCHEMA_VERSION,
        ExportedAt: new Date().toISOString(),
        Counts_Products: state.library.length,
        Counts_MatchKeys: matchKeyRowsFromState(state).length,
        Counts_Templates: countTemplateLines(state.templates),
        Counts_Brands: resolveBrands(state).length,
        Counts_Starters: state.project?.starters?.length || 0,
        Counts_ManualLines: state.project?.manualItems?.length || 0,
        Counts_Overrides: Object.keys(state.project?.bomQuantityOverrides || {}).length,
    } satisfies WorkbookMetaRow;
    return [rows];
}

function brandsRowsFromState(state: WorkbookState): WorkbookRow[] {
    return resolveBrands(state).map(brand => ({ Action: 'upsert', Brand: brand }));
}

function normalizeTemplateMap(raw: unknown): WorkbookTemplateMap {
    const result: WorkbookTemplateMap = {};
    const addTier = (rawType: unknown, rawPower: unknown, rawLines: unknown, rawTierId?: unknown) => {
        const type = text(rawType);
        const power = normalizePowerKey(rawPower);
        const tierId = text(rawTierId) || undefined;
        if (!type || !power || !Array.isArray(rawLines)) return;
        result[type] ??= {};
        result[type][power] ??= [];
        const baseIndex = result[type][power].length;
        rawLines.forEach((rawLine, index) => {
            if (!rawLine || typeof rawLine !== 'object') return;
            const line = rawLine as Record<string, unknown>;
            const matchKey = normalizeMatchKey(line.matchKey);
            if (!matchKey) return;
            const quantity = line.qty ?? line.quantity;
            const qty = typeof quantity === 'number' && Number.isFinite(quantity) ? quantity : Number(quantity);
            const lineTierId = text(line.tierId) || tierId;
            result[type][power].push({
                ...(text(line.id) ? { id: text(line.id) } : { id: `${type}:${power}:${baseIndex + index}` }),
                ...(lineTierId ? { tierId: lineTierId } : {}),
                matchKey,
                qty: Number.isFinite(qty) ? qty : 0,
                ...(text(line.condition) ? { condition: normalizeCondition(line.condition) || line.condition as ComponentCondition } : {}),
            });
        });
    };
    if (Array.isArray(raw)) {
        raw.forEach(tier => {
            if (!tier || typeof tier !== 'object') return;
            const record = tier as Record<string, unknown>;
            addTier(record.starterType ?? record.type, record.powerKey ?? record.power, record.lines ?? record.items, record.id);
        });
    } else if (raw && typeof raw === 'object') {
        Object.entries(raw as Record<string, unknown>).forEach(([type, powers]) => {
            if (!powers || typeof powers !== 'object') return;
            Object.entries(powers as Record<string, unknown>).forEach(([power, lines]) => addTier(type, power, lines));
        });
    }
    return result;
}

/** Convert a catalog/project pair into the canonical state accepted by this module. */
export function toWorkbookState(input: WorkbookStateInput = {}): WorkbookState {
    const catalog = input.catalog || {};
    return {
        library: clone(input.library ?? input.products ?? catalog.products ?? catalog.library ?? []),
        templates: normalizeTemplateMap(input.templates ?? catalog.templates ?? {}),
        brands: clone(input.brands ?? catalog.brands ?? []),
        matchKeyMeta: clone(input.matchKeyMeta ?? input.meta ?? catalog.matchKeyMeta ?? catalog.meta ?? {}),
        project: input.project ? clone(input.project) : undefined,
    };
}

/** Build all nine sheets. It never writes to disk and is safe to use in tests. */
export function buildWorkbookRows(input: WorkbookStateInput = {}): WorkbookRows {
    const state = toWorkbookState(input);
    return {
        _Meta: metaRowsFromState(state),
        Products: productRowsFromState(state.library),
        MatchKeys: matchKeyRowsFromState(state),
        Templates: templateRowsFromState(state.templates),
        Brands: brandsRowsFromState(state),
        Project: projectRowsFromState(state.project),
        Starters: starterRowsFromState(state.project),
        ManualLines: manualRowsFromState(state.project),
        Overrides: overrideRowsFromState(state.project),
    };
}

const SHEET_HEADERS: Record<WorkbookSheet, string[]> = {
    _Meta: ['Schema', 'SchemaVersion', 'ExportedAt', 'Counts_Products', 'Counts_MatchKeys', 'Counts_Templates', 'Counts_Brands', 'Counts_Starters', 'Counts_ManualLines', 'Counts_Overrides'],
    Products: ['Action', 'RowKey', 'MatchKey', 'Brand', 'Code', 'iBomCode', 'Description', 'Unit', 'Price'],
    MatchKeys: ['Action', 'MatchKey', 'BrandSensitive', 'Category', 'Description', 'Unit'],
    Templates: ['Action', 'StarterType', 'Power', 'TierId', 'ComponentMatchKey', 'Quantity', 'Condition', 'TemplateLineId'],
    Brands: ['Action', 'Brand'],
    Project: ['Action', 'ProjectId', 'Name', 'Description', 'CreatedAt', 'UpdatedAt', 'Author', 'Tags'],
    Starters: ['Action', 'RowKey', 'Type', 'Power', 'Quantity', 'LoadName', 'Brand', 'Isolator', 'IsolatorBrand', 'Thermal', 'PTC', 'Estop', 'Humidity', 'IsolatorBFP', 'EstopBFP', 'IsolatorEstopFB'],
    ManualLines: ['Action', 'RowKey', 'StarterId', 'StarterName', 'iBomCode', 'ProductCode', 'Description', 'Brand', 'Unit', 'Quantity', 'MatchKey', 'LoadName', 'TemplateLineId', 'Source'],
    Overrides: ['Action', 'RowKey', 'Quantity'],
};

function rowsToSheet(sheet: WorkbookSheet, rows: WorkbookRow[]): XLSX.WorkSheet {
    const headers = [...SHEET_HEADERS[sheet]];
    // Include dynamic MatchKeys brand columns without losing a deterministic
    // base-column order.
    if (sheet === 'MatchKeys') {
        const dynamic = Array.from(new Set((rows || []).flatMap(row => Object.keys(row)
            .filter(key => /_(?:Code|iBomCode)$/i.test(key))))).sort();
        headers.push(...dynamic.filter(key => !headers.includes(key)));
    }
    return XLSX.utils.json_to_sheet(rows || [], { header: headers, skipHeader: false });
}

/** Create an in-memory combined workbook with stable sheet names and headers. */
export function createWorkbook(input: WorkbookStateInput = {}): XLSX.WorkBook {
    const rows = buildWorkbookRows(input);
    const workbook = XLSX.utils.book_new();
    WORKBOOK_SHEETS.forEach(sheet => XLSX.utils.book_append_sheet(workbook, rowsToSheet(sheet, rows[sheet]), sheet));
    return workbook;
}

/** Browser-friendly binary writer; callers decide whether to download/save it. */
export function writeWorkbook(input: WorkbookStateInput = {}): Uint8Array {
    const output = XLSX.write(createWorkbook(input), { bookType: 'xlsx', type: 'array' });
    return output as Uint8Array;
}

/** Alias for callers that name the in-memory export operation `exportWorkbook`. */
export const exportWorkbook = createWorkbook;

/** Alias for callers that need an explicitly serialized workbook payload. */
export const serializeWorkbook = writeWorkbook;

function sheetName(workbook: XLSX.WorkBook, canonical: WorkbookSheet): { name?: string; legacy: boolean } {
    const exact = workbook.SheetNames.find(name => name === canonical);
    if (exact) return { name: exact, legacy: false };
    const aliases = LEGACY_SHEET_NAMES[canonical] || [];
    const alias = workbook.SheetNames.find(name => aliases.some(candidate => normalized(candidate) === normalized(name)));
    return { name: alias, legacy: Boolean(alias) };
}

function readRows(workbook: XLSX.WorkBook, canonical: WorkbookSheet): { rows: WorkbookRow[]; legacy: boolean; present: boolean } {
    const selected = sheetName(workbook, canonical);
    if (!selected.name) return { rows: [], legacy: false, present: false };
    const worksheet = workbook.Sheets[selected.name];
    if (!worksheet) return { rows: [], legacy: selected.legacy, present: false };
    const rows = XLSX.utils.sheet_to_json<WorkbookRow>(worksheet, { defval: '' }).map(safeObject);
    return { rows, legacy: selected.legacy, present: true };
}

function parseMeta(rows: WorkbookRow[]): { meta?: WorkbookMetaRow; issues: WorkbookIssue[] } {
    const issues: WorkbookIssue[] = [];
    if (!rows.length) return { issues };
    const row = rows[0];
    const schema = readCellString(row, 'Schema');
    const schemaVersion = readNumber(row, 'SchemaVersion');
    const exportedAt = readCellString(row, 'ExportedAt');
    const meta: WorkbookMetaRow = {
        Schema: schema || undefined,
        SchemaVersion: schemaVersion ?? 0,
        ExportedAt: exportedAt,
        Counts_Products: readNumber(row, 'Counts_Products') ?? 0,
        Counts_MatchKeys: readNumber(row, 'Counts_MatchKeys') ?? 0,
        Counts_Templates: readNumber(row, 'Counts_Templates') ?? 0,
        Counts_Brands: readNumber(row, 'Counts_Brands') ?? 0,
        Counts_Starters: readNumber(row, 'Counts_Starters') ?? 0,
        Counts_ManualLines: readNumber(row, 'Counts_ManualLines') ?? 0,
        Counts_Overrides: readNumber(row, 'Counts_Overrides') ?? 0,
    };
    if (schema && schema !== WORKBOOK_SCHEMA) issues.push({ severity: 'error', code: 'UNSUPPORTED_SCHEMA', message: `Unsupported workbook schema "${schema}"`, sheet: '_Meta', row: 2, field: 'Schema' });
    if (!schemaVersion || !Number.isInteger(schemaVersion) || schemaVersion < 1) issues.push({ severity: 'error', code: 'INVALID_SCHEMA_VERSION', message: 'SchemaVersion must be a positive integer', sheet: '_Meta', row: 2, field: 'SchemaVersion' });
    else if (schemaVersion > WORKBOOK_SCHEMA_VERSION) issues.push({ severity: 'error', code: 'FUTURE_SCHEMA_VERSION', message: `Workbook schema ${schemaVersion} is newer than supported schema ${WORKBOOK_SCHEMA_VERSION}`, sheet: '_Meta', row: 2, field: 'SchemaVersion' });
    else if (schemaVersion < WORKBOOK_SCHEMA_VERSION) issues.push({ severity: 'info', code: 'LEGACY_SCHEMA_VERSION', message: `Workbook schema ${schemaVersion} will be migrated to ${WORKBOOK_SCHEMA_VERSION}`, sheet: '_Meta', row: 2, field: 'SchemaVersion' });
    if (exportedAt && Number.isNaN(Date.parse(exportedAt))) issues.push({ severity: 'warning', code: 'INVALID_EXPORTED_AT', message: 'ExportedAt is not a valid date', sheet: '_Meta', row: 2, field: 'ExportedAt' });
    return { meta, issues };
}

function validateMetaCounts(metaRows: WorkbookRow[], rows: WorkbookRows): WorkbookIssue[] {
    if (!metaRows.length) return [];
    const source = metaRows[0];
    const counts: Array<{ field: keyof WorkbookMetaRow; actual: number }> = [
        { field: 'Counts_Products', actual: rows.Products.length },
        { field: 'Counts_MatchKeys', actual: rows.MatchKeys.length },
        { field: 'Counts_Templates', actual: rows.Templates.length },
        { field: 'Counts_Brands', actual: rows.Brands.length },
        { field: 'Counts_Starters', actual: rows.Starters.length },
        { field: 'Counts_ManualLines', actual: rows.ManualLines.length },
        { field: 'Counts_Overrides', actual: rows.Overrides.length },
    ];
    return counts.flatMap(({ field, actual }) => {
        const raw = readCell(source, field);
        if (text(raw) === '') return [];
        const expected = readNumber(source, field);
        if (expected === undefined || expected === actual) return [];
        return [{
            severity: 'warning' as const,
            code: 'META_COUNT_MISMATCH',
            message: `${field} declares ${expected}, but the workbook contains ${actual} row(s)`,
            sheet: '_Meta' as const,
            row: 2,
            field,
        }];
    });
}

/**
 * Legacy template exports had no Action column and represented the opened
 * tiers as a replacement. Make that destructive intent explicit before a
 * diff is built. Explicit delete/skip actions remain unchanged so a partially
 * migrated file can still opt into the normal row contract.
 */
function adaptLegacyTemplateRows(rows: WorkbookRow[]): { rows: WorkbookRow[]; adapted: boolean } {
    let adapted = false;
    const next = rows.map(rawRow => {
        const row = safeObject(rawRow);
        const rawAction = readCellString(row, 'Action');
        if (actionOf(row) === 'upsert' && normalized(rawAction) !== 'replace-tier') {
            adapted = true;
            return { ...row, Action: 'replace-tier' };
        }
        return row;
    });
    return { rows: next, adapted };
}

/** Read a combined workbook without applying any changes. */
export function parseWorkbook(input: WorkbookInput): ParsedWorkbook {
    const workbook = typeof input === 'object' && input !== null && 'SheetNames' in input
        ? input as XLSX.WorkBook
        : XLSX.read(input as ArrayBuffer | Uint8Array | string, { type: typeof input === 'string' ? 'binary' : 'array' });
    const issues: WorkbookIssue[] = [];
    const rows = {} as WorkbookRows;
    let legacy = false;
    WORKBOOK_SHEETS.forEach(sheet => {
        const result = readRows(workbook, sheet);
        rows[sheet] = result.rows;
        legacy ||= result.legacy;
        if (sheet !== '_Meta' && !result.present) {
            issues.push({ severity: 'info', code: 'MISSING_OPTIONAL_SHEET', message: `Sheet ${sheet} is absent; no changes will be made for it`, sheet });
        }
    });
    if (!rows._Meta.length) {
        legacy = true;
        issues.push({ severity: 'warning', code: 'MISSING_META', message: 'Workbook has no _Meta sheet; treating it as a legacy workbook', sheet: '_Meta' });
    }
    if (legacy && rows.Templates.length) {
        const adapted = adaptLegacyTemplateRows(rows.Templates);
        rows.Templates = adapted.rows;
        if (adapted.adapted) {
            issues.push({ severity: 'info', code: 'LEGACY_REPLACE_TIER', message: 'Legacy template rows are treated as replace-tier changes for the tiers present in the file', sheet: 'Templates' });
        }
    }
    const parsedMeta = parseMeta(rows._Meta);
    issues.push(...parsedMeta.issues);
    issues.push(...validateMetaCounts(rows._Meta, rows));
    return { rows, meta: parsedMeta.meta, issues, legacy };
}

export async function readWorkbookFile(file: Blob): Promise<ParsedWorkbook> {
    return parseWorkbook(await file.arrayBuffer());
}

function canonicalRow(sheet: WorkbookSheet, row: WorkbookRow): WorkbookRow {
    const action = actionOf(row);
    switch (sheet) {
        case '_Meta':
            return { Action: action, Schema: readCellString(row, 'Schema'), SchemaVersion: readNumber(row, 'SchemaVersion') ?? 0 };
        case 'Products':
            return {
                Action: action,
                RowKey: readCellString(row, 'RowKey') || readCellString(row, 'ID'),
                MatchKey: matchKeyFromRow(row),
                Brand: normalizeBrand(readCellString(row, 'Brand')),
                Code: readCellString(row, 'Code'),
                iBomCode: readCellString(row, 'iBomCode'),
                Description: readCellString(row, 'Description'),
                Unit: readCellString(row, 'Unit') || EMPTY_UNIT,
                Price: readNumber(row, 'Price') ?? 0,
            };
        case 'MatchKeys': {
            const result: WorkbookRow = {
                Action: action,
                MatchKey: matchKeyFromRow(row),
                BrandSensitive: boolCell(readCell(row, 'BrandSensitive')) ? 'Yes' : 'No',
                Category: readCellString(row, 'Category'),
                Description: readCellString(row, 'Description'),
                Unit: readCellString(row, 'Unit') || EMPTY_UNIT,
            };
            Object.keys(row).forEach(key => {
                if (/_(?:Code|iBomCode)$/i.test(key)) result[key] = text(row[key]);
            });
            return result;
        }
        case 'Templates':
            return {
                Action: action,
                StarterType: readCellString(row, 'StarterType') || readCellString(row, 'Type'),
                Power: normalizePowerKey(readCell(row, 'Power')) ?? text(readCell(row, 'Power')),
                TierId: readCellString(row, 'TierId'),
                ComponentMatchKey: normalizeMatchKey(readCellString(row, 'ComponentMatchKey') || readCellString(row, 'MatchKey')),
                Quantity: readNumber(row, 'Quantity') ?? 0,
                Condition: normalizeCondition(readCell(row, 'Condition')) || text(readCell(row, 'Condition')) || 'always',
                TemplateLineId: readCellString(row, 'TemplateLineId') || readCellString(row, 'LineId') || readCellString(row, 'ID'),
            };
        case 'Brands':
            return { Action: action, Brand: normalizeBrand(readCellString(row, 'Brand')) };
        case 'Project':
            return {
                Action: action,
                ProjectId: readCellString(row, 'ProjectId') || readCellString(row, 'RowKey'),
                Name: readCellString(row, 'Name') || readCellString(row, 'ProjectName'),
                Description: readCellString(row, 'Description'),
                CreatedAt: readCellString(row, 'CreatedAt'),
                UpdatedAt: readCellString(row, 'UpdatedAt'),
                Author: readCellString(row, 'Author'),
                Tags: readCellString(row, 'Tags'),
            };
        case 'Starters':
            return {
                Action: action,
                RowKey: readCellString(row, 'RowKey') || readCellString(row, 'ID'),
                Type: readCellString(row, 'Type') || readCellString(row, 'StarterType'),
                Power: normalizePowerKey(readCell(row, 'Power')) ?? text(readCell(row, 'Power')),
                Quantity: readNumber(row, 'Quantity') ?? 0,
                LoadName: readCellString(row, 'LoadName') || readCellString(row, 'Description'),
                Brand: normalizeBrand(readCellString(row, 'Brand')),
                Isolator: boolCell(readCell(row, 'Isolator')),
                IsolatorBrand: normalizeBrand(readCellString(row, 'IsolatorBrand')),
                Thermal: boolCell(readCell(row, 'Thermal')),
                PTC: boolCell(readCell(row, 'PTC')),
                Estop: boolCell(readCell(row, 'Estop')),
                Humidity: boolCell(readCell(row, 'Humidity')),
                IsolatorBFP: boolCell(readCell(row, 'IsolatorBFP')),
                EstopBFP: boolCell(readCell(row, 'EstopBFP')),
                IsolatorEstopFB: boolCell(readCell(row, 'IsolatorEstopFB')),
            };
        case 'ManualLines':
            return {
                Action: action,
                RowKey: readCellString(row, 'RowKey') || readCellString(row, 'ID'),
                StarterId: readCellString(row, 'StarterId'),
                StarterName: readCellString(row, 'StarterName'),
                iBomCode: readCellString(row, 'iBomCode'),
                ProductCode: readCellString(row, 'ProductCode'),
                Description: readCellString(row, 'Description'),
                Brand: normalizeBrand(readCellString(row, 'Brand')),
                Unit: readCellString(row, 'Unit') || EMPTY_UNIT,
                Quantity: readNumber(row, 'Quantity') ?? 0,
                MatchKey: matchKeyFromRow(row),
                LoadName: readCellString(row, 'LoadName'),
                TemplateLineId: readCellString(row, 'TemplateLineId'),
                Source: readCellString(row, 'Source') || 'manual',
            };
        case 'Overrides':
            return { Action: action, RowKey: readCellString(row, 'RowKey') || readCellString(row, 'ID') || readCellString(row, 'LineId'), Quantity: readNumber(row, 'Quantity') ?? 0 };
    }
}

function rowKey(sheet: WorkbookSheet, row: WorkbookRow, rowNumber: number): string | undefined {
    const candidate = rowActionAndKey(sheet, row, rowNumber).key;
    if (!candidate) return undefined;
    return candidate;
}

function templateTierKey(row: WorkbookRow): string | undefined {
    const type = normalized(readCellString(row, 'StarterType') || readCellString(row, 'Type'));
    const power = normalizePowerKey(readCell(row, 'Power')) ?? text(readCell(row, 'Power'));
    return type && power ? `${type}\u0000${power}` : undefined;
}

function templateLineId(row: WorkbookRow): string {
    return text(readCell(row, 'TemplateLineId') || readCell(row, 'LineId') || readCell(row, 'ID'));
}

function templateMatchKey(row: WorkbookRow): string {
    return normalizeMatchKey(readCellString(row, 'ComponentMatchKey') || readCellString(row, 'MatchKey'));
}

function findTemplatePrior(
    row: WorkbookRow,
    key: string,
    existing: Map<string, { row: WorkbookRow; sourceRow: number }>,
): { key: string; row: WorkbookRow; sourceRow: number } | undefined {
    const direct = existing.get(key);
    if (direct) return { key, ...direct };
    // Legacy template files have no TemplateLineId. Resolve their matchKey
    // against the current tier so a replacement updates the existing line
    // rather than reporting an add and then deleting it as a side effect.
    if (templateLineId(row)) return undefined;
    const tier = templateTierKey(row);
    const matchKey = templateMatchKey(row);
    if (!tier || !matchKey) return undefined;
    for (const [candidateKey, candidate] of existing) {
        if (templateTierKey(candidate.row) === tier && templateMatchKey(candidate.row) === matchKey) {
            return { key: candidateKey, ...candidate };
        }
    }
    return undefined;
}

function changedFields(before: WorkbookRow, after: WorkbookRow): string[] {
    const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
    return Array.from(fields).filter(field => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

function emptySheetDiff(sheet: WorkbookSheet): WorkbookSheetDiff {
    const added: WorkbookChange[] = [];
    const updated: WorkbookChange[] = [];
    const deleted: WorkbookChange[] = [];
    const skipped: WorkbookChange[] = [];
    return { sheet, added, updated, deleted, skipped, additions: added, updates: updated, deletes: deleted };
}

function issueForRow(sheet: WorkbookSheet, row: WorkbookRow, rowNumber: number, code: string, message: string, severity: WorkbookIssue['severity'] = 'error'): WorkbookIssue {
    return { severity, code, message, sheet, row: rowNumber, key: rowKey(sheet, row, rowNumber) };
}

function normalizeDiffRows(sheet: WorkbookSheet, rows: WorkbookRow[], issues: WorkbookIssue[]): Map<string, { row: WorkbookRow; sourceRow: number }> {
    const result = new Map<string, { row: WorkbookRow; sourceRow: number }>();
    rows.forEach((rawRow, index) => {
        const sourceRow = index + 2;
        const safeRow = safeObject(rawRow);
        const rawAction = normalized(readCell(safeRow, 'Action'));
        const row = canonicalRow(sheet, safeRow);
        if (rawAction && !VALID_ACTION_VALUES.has(rawAction)) {
            issues.push(issueForRow(sheet, row, sourceRow, 'INVALID_ACTION', `Action must be one of: upsert, delete, skip${sheet === 'Templates' ? ', replace-tier' : ''}`, 'error'));
        }
        if (actionOf(row) === 'replace-tier' && sheet !== 'Templates') {
            issues.push(issueForRow(sheet, row, sourceRow, 'INVALID_ACTION', 'replace-tier is only valid on the Templates sheet', 'error'));
        }
        const key = rowKey(sheet, row, sourceRow);
        if (!key) {
            if (actionOf(row) !== 'skip') issues.push(issueForRow(sheet, row, sourceRow, 'MISSING_ROW_KEY', 'Row is missing its stable key', 'error'));
            return;
        }
        if (result.has(key)) {
            issues.push(issueForRow(sheet, row, sourceRow, 'DUPLICATE_ROW_KEY', `Duplicate row key ${key}`, 'error'));
            return;
        }
        result.set(key, { row, sourceRow });
    });
    return result;
}

function stateRows(state: WorkbookState): WorkbookRows {
    return buildWorkbookRows(state);
}

function validateIncomingRows(rows: WorkbookRows, state: WorkbookState, issues: WorkbookIssue[]): void {
    const knownMatchKeys = new Set<string>();
    state.library.forEach(product => {
        const key = normalizeMatchKey(product.matchKey);
        if (key) knownMatchKeys.add(key);
    });
    Object.keys(state.matchKeyMeta).forEach(key => {
        const normalizedKey = normalizeMatchKey(key);
        if (normalizedKey) knownMatchKeys.add(normalizedKey);
    });
    // Validate references against the complete incoming workbook, not just
    // the current catalog. A template and its new Product/MatchKey may arrive
    // in the same import and should not produce a false warning.
    rows.Products.forEach(rawRow => {
        const row = canonicalRow('Products', rawRow);
        if (actionOf(row) === 'upsert') {
            const key = normalizeMatchKey(row.MatchKey);
            if (key) knownMatchKeys.add(key);
        }
    });
    rows.MatchKeys.forEach(row => {
        const action = actionOf(row);
        const key = matchKeyFromRow(row);
        if (action === 'upsert' && key) knownMatchKeys.add(key);
    });

    const knownBrands = new Set(resolveBrands(state).map(normalized));
    rows.Brands.forEach(rawRow => {
        const row = canonicalRow('Brands', rawRow);
        if (actionOf(row) === 'upsert' && row.Brand) knownBrands.add(normalized(row.Brand));
    });

    rows.Templates.forEach((rawRow, index) => {
        const row = canonicalRow('Templates', rawRow);
        const action = actionOf(row);
        if (action === 'skip' || action === 'delete') return;
        const condition = normalizeCondition(row.Condition);
        if (!condition) issues.push(issueForRow('Templates', row, index + 2, 'INVALID_CONDITION', `Condition must be one of: ${VALID_CONDITIONS.join(', ')}`, 'error'));
        const quantity = Number(row.Quantity);
        const isTierClear = action === 'replace-tier' && row.StarterType && row.Power && !row.ComponentMatchKey;
        if (!isTierClear && (!Number.isFinite(quantity) || quantity <= 0)) issues.push(issueForRow('Templates', row, index + 2, 'INVALID_QUANTITY', 'Template Quantity must be a positive number', 'warning'));
        if (!row.StarterType || !row.Power || (!row.ComponentMatchKey && !isTierClear)) issues.push(issueForRow('Templates', row, index + 2, 'INVALID_TEMPLATE_ROW', 'StarterType, Power and ComponentMatchKey are required (or a blank replace-tier row to clear a tier)', 'error'));
        if (row.ComponentMatchKey && !knownMatchKeys.has(normalizeMatchKey(row.ComponentMatchKey))) issues.push(issueForRow('Templates', row, index + 2, 'UNKNOWN_MATCH_KEY', `Template references unknown MatchKey ${row.ComponentMatchKey}`, 'warning'));
    });

    const incomingProducts = [...state.library];
    rows.Products.forEach((rawRow, index) => {
        const row = canonicalRow('Products', rawRow);
        if (actionOf(row) === 'skip' || actionOf(row) === 'delete') return;
        if (!row.Brand || !row.Description || !row.Unit || row.Code === undefined) issues.push(issueForRow('Products', row, index + 2, 'INVALID_PRODUCT_ROW', 'Brand, Description, Unit and Code are required (Code may be empty)', 'error'));
        if (row.Brand && !knownBrands.has(normalized(row.Brand))) issues.push(issueForRow(
            'Products',
            row,
            index + 2,
            'UNKNOWN_BRAND',
            `Product references unmanaged brand ${row.Brand}; add an upsert row to Brands or mark this row skip`,
            'error',
        ));
        if (row.MatchKey) knownMatchKeys.add(normalizeMatchKey(row.MatchKey));
        incomingProducts.push({
            id: String(row.RowKey || `import:${index + 2}`), code: String(row.Code || ''), ibomCode: String(row.iBomCode || ''), description: String(row.Description || ''), brand: String(row.Brand || ''), unit: String(row.Unit || EMPTY_UNIT) as Unit, price: Number(row.Price || 0), matchKey: String(row.MatchKey || ''),
        });
    });
    const byAgnosticKey = new Map<string, Product[]>();
    incomingProducts.forEach(product => {
        const key = normalizeMatchKey(product.matchKey);
        if (!key || isBrandSensitive(key, state.matchKeyMeta)) return;
        byAgnosticKey.set(key, [...(byAgnosticKey.get(key) || []), product]);
    });
    byAgnosticKey.forEach((products, key) => {
        const distinct = new Set(products.map(product => `${normalized(product.brand)}|${product.code}|${product.ibomCode || ''}`));
        if (distinct.size > 1) issues.push({ severity: 'warning', code: 'BRAND_AGNOSTIC_CONFLICT', message: `MatchKey ${key} has multiple brand-agnostic product rows`, sheet: 'Products', key });
    });

    rows.MatchKeys.forEach((rawRow, index) => {
        const row = canonicalRow('MatchKeys', rawRow);
        if (actionOf(row) === 'skip' || actionOf(row) === 'delete') return;
        if (!row.MatchKey) issues.push(issueForRow('MatchKeys', row, index + 2, 'INVALID_MATCH_KEY_ROW', 'MatchKey is required', 'error'));
    });

    rows.Starters.forEach((rawRow, index) => {
        const row = canonicalRow('Starters', rawRow);
        if (actionOf(row) === 'skip' || actionOf(row) === 'delete') return;
        if (!row.RowKey || !row.Type || !row.Power) issues.push(issueForRow('Starters', row, index + 2, 'INVALID_STARTER_ROW', 'RowKey, Type and Power are required', 'error'));
        if (!Number.isFinite(Number(row.Quantity)) || Number(row.Quantity) <= 0) issues.push(issueForRow('Starters', row, index + 2, 'INVALID_STARTER_QUANTITY', 'Starter Quantity must be a positive number', 'warning'));
        if (row.Brand && !knownBrands.has(normalized(row.Brand))) issues.push(issueForRow(
            'Starters',
            row,
            index + 2,
            'UNKNOWN_BRAND',
            `Starter references unmanaged brand ${row.Brand}; add an upsert row to Brands or mark this row skip`,
            'error',
        ));
        if (row.IsolatorBrand && !knownBrands.has(normalized(row.IsolatorBrand))) issues.push(issueForRow(
            'Starters',
            row,
            index + 2,
            'UNKNOWN_BRAND',
            `Starter references unmanaged isolator brand ${row.IsolatorBrand}; add an upsert row to Brands or mark this row skip`,
            'error',
        ));
    });
    rows.ManualLines.forEach((rawRow, index) => {
        const row = canonicalRow('ManualLines', rawRow);
        if (actionOf(row) === 'skip' || actionOf(row) === 'delete') return;
        if (!row.RowKey || !row.Description) issues.push(issueForRow('ManualLines', row, index + 2, 'INVALID_MANUAL_ROW', 'RowKey and Description are required', 'error'));
        if (row.Brand && !knownBrands.has(normalized(row.Brand))) issues.push(issueForRow(
            'ManualLines',
            row,
            index + 2,
            'UNKNOWN_BRAND',
            `Manual line references unmanaged brand ${row.Brand}; add an upsert row to Brands or mark this row skip`,
            'error',
        ));
    });
    rows.Overrides.forEach((rawRow, index) => {
        const row = canonicalRow('Overrides', rawRow);
        if (actionOf(row) === 'skip' || actionOf(row) === 'delete') return;
        if (!row.RowKey || !Number.isFinite(Number(row.Quantity)) || Number(row.Quantity) < 0) issues.push(issueForRow('Overrides', row, index + 2, 'INVALID_OVERRIDE_ROW', 'Override RowKey and non-negative Quantity are required', 'error'));
    });
}

/** Build a dry-run diff. It is safe to show directly in a preview UI. */
export function buildWorkbookDiff(currentInput: WorkbookStateInput | WorkbookState, incoming: ParsedWorkbook | WorkbookRows): WorkbookDiff {
    const current = toWorkbookState(currentInput as WorkbookStateInput);
    const parsed = 'rows' in (incoming as object) ? incoming as ParsedWorkbook : { rows: incoming as WorkbookRows, issues: [], legacy: false };
    const issues = [...(parsed.issues || [])];
    // Parsed callers normally receive adapted rows from parseWorkbook. Keep
    // the boundary defensive for hand-built ParsedWorkbook values as well.
    const normalizedIncomingRows = parsed.legacy && parsed.rows.Templates.length
        ? { ...parsed.rows, Templates: adaptLegacyTemplateRows(parsed.rows.Templates).rows }
        : parsed.rows;
    validateIncomingRows(normalizedIncomingRows, current, issues);
    const currentRows = stateRows(current);
    const sheets = {} as Record<WorkbookSheet, WorkbookSheetDiff>;
    const changes: WorkbookChange[] = [];

    WORKBOOK_SHEETS.forEach(sheet => {
        const sheetDiff = emptySheetDiff(sheet);
        sheets[sheet] = sheetDiff;
        if (sheet === '_Meta') return;
        const existing = new Map<string, { row: WorkbookRow; sourceRow: number }>();
        currentRows[sheet].forEach((rawRow, index) => {
            const row = canonicalRow(sheet, rawRow);
            const key = rowKey(sheet, row, index + 2);
            if (key) existing.set(key, { row, sourceRow: index + 2 });
        });
        const incomingRows = normalizeDiffRows(sheet, normalizedIncomingRows[sheet] || [], issues);
        const replacementTiers = new Set<string>();
        if (sheet === 'Templates') {
            incomingRows.forEach(({ row }) => {
                if (actionOf(row) !== 'replace-tier') return;
                const tier = templateTierKey(row);
                if (tier) replacementTiers.add(tier);
            });
        }
        incomingRows.forEach(({ row, sourceRow }, key) => {
            const action = actionOf(row);
            const priorMatch = sheet === 'Templates'
                ? findTemplatePrior(row, key, existing)
                : (existing.has(key) ? { key, ...existing.get(key)! } : undefined);
            const effectiveKey = priorMatch?.key || key;
            const prior = priorMatch;
            if (action === 'skip') {
                const change = { sheet, action, key: effectiveKey, row: sourceRow, before: prior?.row, after: row };
                sheetDiff.skipped.push(change);
                changes.push(change);
                return;
            }
            if (action === 'delete') {
                const change = { sheet, action, key: effectiveKey, row: sourceRow, before: prior?.row, after: row };
                if (!prior) issues.push(issueForRow(sheet, row, sourceRow, 'DELETE_NOT_FOUND', `Delete requested for unknown key ${effectiveKey}`, 'warning'));
                sheetDiff.deleted.push(change);
                changes.push(change);
                return;
            }
            if (!prior) {
                const change = { sheet, action, key: effectiveKey, row: sourceRow, after: row };
                sheetDiff.added.push(change);
                changes.push(change);
                return;
            }
            const fields = changedFields(prior.row, row).filter(field => field !== 'Action');
            if (fields.length) {
                const change = { sheet, action, key: effectiveKey, row: sourceRow, before: prior.row, after: row, changedFields: fields };
                sheetDiff.updated.push(change);
                changes.push(change);
            }
        });

        // A replacement is tier-scoped: lines omitted from a tier explicitly
        // marked `replace-tier` are deletions, while tiers absent from the file
        // remain untouched. This is emitted as normal delete changes so the
        // preview and transaction path stay uniform.
        if (sheet === 'Templates' && replacementTiers.size) {
            const incomingKeysByTier = new Map<string, Set<string>>();
            incomingRows.forEach(({ row }, key) => {
                const tier = templateTierKey(row);
                if (!tier || !replacementTiers.has(tier)) return;
                if (!incomingKeysByTier.has(tier)) incomingKeysByTier.set(tier, new Set());
                incomingKeysByTier.get(tier)!.add(key);
                const priorMatch = findTemplatePrior(row, key, existing);
                if (priorMatch) incomingKeysByTier.get(tier)!.add(priorMatch.key);
            });
            existing.forEach(({ row, sourceRow }, key) => {
                const tier = templateTierKey(row);
                if (!tier || !replacementTiers.has(tier)) return;
                if (incomingKeysByTier.get(tier)?.has(key)) return;
                const after = { ...row, Action: 'delete' };
                const change: WorkbookChange = { sheet, action: 'delete', key, row: sourceRow, before: row, after };
                sheetDiff.deleted.push(change);
                changes.push(change);
            });
        }
    });

    return { schema: WORKBOOK_SCHEMA, schemaVersion: WORKBOOK_SCHEMA_VERSION, sheets, issues, changes };
}

function starterFromRow(row: WorkbookRow): StarterConfig {
    const id = String(row.RowKey || `starter:${crypto.randomUUID()}`);
    const power = normalizePowerKey(row.Power) ?? String(row.Power || '');
    // The workbook contract treats non-positive/invalid quantities as a
    // warning and normalizes them to one (matching the legacy Excel adapter).
    const rawQuantity = Number(row.Quantity);
    const quantity = Number.isFinite(rawQuantity) && rawQuantity > 0 ? rawQuantity : 1;
    return {
        id,
        type: String(row.Type || ''),
        power: power,
        powerKey: power,
        quantity,
        brand: String(row.Brand || ''),
        isolator: Boolean(row.Isolator),
        isolatorBrand: String(row.IsolatorBrand || ''),
        signals: {
            thermal: Boolean(row.Thermal), ptc: Boolean(row.PTC), estop: Boolean(row.Estop), humidity: Boolean(row.Humidity), isolator_BFP: Boolean(row.IsolatorBFP), estop_BFP: Boolean(row.EstopBFP), isolator_estop_FB: Boolean(row.IsolatorEstopFB),
        },
        loadName: String(row.LoadName || ''),
    };
}

function manualFromRow(row: WorkbookRow): BOMItem {
    return {
        id: String(row.RowKey || `manual:${crypto.randomUUID()}`), starterId: String(row.StarterId || ''), starterName: String(row.StarterName || ''), ibomCode: String(row.iBomCode || ''), productCode: String(row.ProductCode || ''), description: String(row.Description || ''), brand: String(row.Brand || ''), unit: String(row.Unit || EMPTY_UNIT) as Unit, quantity: Number(row.Quantity || 0), matchKey: String(row.MatchKey || ''), loadName: String(row.LoadName || ''), templateLineId: String(row.TemplateLineId || ''), source: 'manual',
    };
}

function ensureProject(project: Project | undefined): Project {
    if (project) return project;
    const now = new Date().toISOString();
    return { id: 'imported-project', metadata: { name: 'Imported project', createdAt: now, updatedAt: now }, starters: [], manualItems: [], bomQuantityOverrides: {} };
}

function applyProductRow(library: Product[], row: WorkbookRow, action: WorkbookAction): Product[] {
    const matchKey = normalizeMatchKey(row.MatchKey);
    const brand = normalizeBrand(row.Brand);
    const key = matchKey ? `${matchKey}|${normalized(brand)}` : `row:${row.RowKey}`;
    const index = library.findIndex(product => {
        const productMatch = normalizeMatchKey(product.matchKey);
        return matchKey ? productMatch === matchKey && normalized(product.brand) === normalized(brand) : product.id === row.RowKey;
    });
    if (action === 'delete') return index >= 0 ? library.filter((_, i) => i !== index) : library;
    const next: Product = {
        id: String(row.RowKey || (index >= 0 ? library[index].id : `product:${key}`)), code: String(row.Code || ''), ibomCode: String(row.iBomCode || ''), description: String(row.Description || ''), brand, unit: String(row.Unit || EMPTY_UNIT) as Unit, price: Number(row.Price || 0), ...(matchKey ? { matchKey } : {}),
    };
    if (index >= 0) return library.map((product, i) => i === index ? { ...product, ...next, id: product.id } : product);
    return [...library, next];
}

function applyMatchKeyRow(state: WorkbookState, row: WorkbookRow, action: WorkbookAction): WorkbookState {
    const matchKey = normalizeMatchKey(row.MatchKey);
    if (!matchKey) return state;
    if (action === 'delete') {
        const library = state.library.filter(product => normalizeMatchKey(product.matchKey) !== matchKey);
        const matchKeyMeta = { ...state.matchKeyMeta };
        Object.keys(matchKeyMeta).forEach(key => { if (normalizeMatchKey(key) === matchKey) delete matchKeyMeta[key]; });
        return { ...state, library, matchKeyMeta };
    }
    const base = state.matchKeyMeta[matchKey] || defaultMetaFor(matchKey);
    const meta: MatchKeyMeta = { ...base, matchKey, category: (row.Category || base.category) as MatchKeyMeta['category'], brandSensitive: boolCell(row.BrandSensitive) };
    let library = state.library.map(product => normalizeMatchKey(product.matchKey) === matchKey
        ? { ...product, description: String(row.Description || product.description), unit: String(row.Unit || product.unit) as Unit }
        : product);
    const dynamicBrands = Object.keys(row).flatMap(key => {
        const match = key.match(/^(.*?)_(?:Code|iBomCode)$/i);
        return match ? [match[1]] : [];
    }).filter((brand, index, all) => all.findIndex(other => brandColumnPrefix(other) === brandColumnPrefix(brand)) === index);
    dynamicBrands.forEach(rawBrand => {
        const brand = normalizeBrand(rawBrand);
        const code = dynamicBrandCell(row, brand, 'Code');
        const ibomCode = dynamicBrandCell(row, brand, 'iBomCode');
        if (!code && !ibomCode) return;
        const index = library.findIndex(product => normalizeMatchKey(product.matchKey) === matchKey && normalized(product.brand) === normalized(brand));
        const existing = index >= 0 ? library[index] : undefined;
        const product: Product = {
            id: existing?.id || `product:${matchKey}:${brandColumnPrefix(brand)}`,
            matchKey,
            brand,
            code,
            ibomCode,
            description: text(row.Description) || existing?.description || matchKey,
            unit: (text(row.Unit) || existing?.unit || EMPTY_UNIT) as Unit,
            price: existing?.price || 0,
        };
        library = index >= 0 ? library.map((candidate, i) => i === index ? { ...candidate, ...product } : candidate) : [...library, product];
    });
    return { ...state, library, matchKeyMeta: { ...state.matchKeyMeta, [matchKey]: meta } };
}

function applyTemplateRow(templates: WorkbookTemplateMap, row: WorkbookRow, action: WorkbookAction): WorkbookTemplateMap {
    const type = text(row.StarterType);
    const power = normalizePowerKey(row.Power) ?? text(row.Power);
    const matchKey = normalizeMatchKey(row.ComponentMatchKey);
    const lineId = text(row.TemplateLineId);
    if (!type || !power) return templates;
    const next = clone(templates);
    next[type] ??= {};
    next[type][power] ??= [];
    const lines = next[type][power];
    const tierId = text(row.TierId) || text(lines.find(line => text(line.tierId))?.tierId) || `${type}:${power}`;
    // A blank replace-tier row is an explicit request to clear the tier.
    if (action === 'replace-tier' && !matchKey) {
        next[type][power] = [];
        return next;
    }
    const index = lineId
        ? lines.findIndex(line => text(line.id) === lineId)
        : lines.findIndex(line => normalizeMatchKey(line.matchKey) === matchKey);
    if (action === 'delete') {
        if (index >= 0) lines.splice(index, 1);
        return next;
    }
    if (!matchKey) return next;
    const rawQuantity = Number(row.Quantity);
    // Invalid/non-positive template quantities are warned about at preview
    // time and normalized to one when the diff is applied.
    const quantity = Number.isFinite(rawQuantity) && rawQuantity > 0 ? rawQuantity : 1;
    const line: TemplateLine = {
        id: lineId || (index >= 0 ? lines[index].id : `${type}:${power}:${matchKey}`),
        tierId,
        matchKey,
        qty: quantity,
        condition: normalizeCondition(row.Condition) || 'always',
    };
    if (index >= 0) lines[index] = { ...lines[index], ...line };
    else lines.push(line);
    return next;
}

function applyBrandRow(brands: string[], row: WorkbookRow, action: WorkbookAction): string[] {
    const brand = normalizeBrand(row.Brand);
    if (!brand) return brands;
    const index = brands.findIndex(value => normalized(value) === normalized(brand));
    if (action === 'delete') return index >= 0 ? brands.filter((_, i) => i !== index) : brands;
    if (index >= 0) return brands.map((value, i) => i === index ? brand : value);
    return [...brands, brand];
}

function applyProjectRow(project: Project | undefined, row: WorkbookRow, action: WorkbookAction): Project | undefined {
    if (action === 'delete') return undefined;
    const current = ensureProject(project);
    const now = new Date().toISOString();
    return {
        ...current,
        id: String(row.ProjectId || current.id),
        metadata: {
            ...current.metadata,
            name: String(row.Name || current.metadata.name || 'Imported project'),
            description: String(row.Description || ''),
            createdAt: String(row.CreatedAt || current.metadata.createdAt || now),
            updatedAt: String(row.UpdatedAt || now),
            author: String(row.Author || ''),
            tags: text(row.Tags) ? text(row.Tags).split(',').map(item => item.trim()).filter(Boolean) : [],
        },
    };
}

function applyStarterRow(project: Project | undefined, row: WorkbookRow, action: WorkbookAction): Project {
    const current = ensureProject(project);
    const id = String(row.RowKey || '');
    const index = current.starters.findIndex(starter => starter.id === id);
    if (action === 'delete') return index >= 0 ? { ...current, starters: current.starters.filter((_, i) => i !== index) } : current;
    const starter = starterFromRow(row);
    return index >= 0 ? { ...current, starters: current.starters.map((item, i) => i === index ? starter : item) } : { ...current, starters: [...current.starters, starter] };
}

function applyManualRow(project: Project | undefined, row: WorkbookRow, action: WorkbookAction): Project {
    const current = ensureProject(project);
    const id = String(row.RowKey || '');
    const items = current.manualItems || [];
    const index = items.findIndex(item => item.id === id);
    if (action === 'delete') return index >= 0 ? { ...current, manualItems: items.filter((_, i) => i !== index) } : current;
    const item = manualFromRow(row);
    return index >= 0 ? { ...current, manualItems: items.map((candidate, i) => i === index ? item : candidate) } : { ...current, manualItems: [...items, item] };
}

function applyOverrideRow(project: Project | undefined, row: WorkbookRow, action: WorkbookAction): Project {
    const current = ensureProject(project);
    const id = String(row.RowKey || '');
    const overrides = { ...(current.bomQuantityOverrides || {}) };
    if (action === 'delete') delete overrides[id];
    else overrides[id] = Number(row.Quantity || 0);
    return { ...current, bomQuantityOverrides: overrides };
}

function applyChange(state: WorkbookState, change: WorkbookChange): WorkbookState {
    if (change.action === 'skip' || !change.after) return state;
    const row = change.after;
    switch (change.sheet) {
        case 'Products': return { ...state, library: applyProductRow(state.library, row, change.action) };
        case 'MatchKeys': return applyMatchKeyRow(state, row, change.action);
        case 'Templates': return { ...state, templates: applyTemplateRow(state.templates, row, change.action) };
        case 'Brands': return { ...state, brands: applyBrandRow(state.brands, row, change.action) };
        case 'Project': return { ...state, project: applyProjectRow(state.project, row, change.action) };
        case 'Starters': return { ...state, project: applyStarterRow(state.project, row, change.action) };
        case 'ManualLines': return { ...state, project: applyManualRow(state.project, row, change.action) };
        case 'Overrides': return { ...state, project: applyOverrideRow(state.project, row, change.action) };
        case '_Meta': return state;
    }
}

/** Validate cross-sheet state independently of a diff. */
export function validateWorkbookState(input: WorkbookStateInput | WorkbookState): WorkbookIssue[] {
    const state = toWorkbookState(input as WorkbookStateInput);
    const issues: WorkbookIssue[] = [];
    const knownBrands = new Set(resolveBrands(state).map(normalized));
    state.library.forEach((product, index) => {
        if (!product.id || !product.brand || !product.description || !product.unit || typeof product.code !== 'string') issues.push({ severity: 'error', code: 'INVALID_PRODUCT', message: `Product ${product.id || index + 1} is missing required fields`, sheet: 'Products', row: index + 2 });
        if (product.brand && !knownBrands.has(normalized(product.brand))) issues.push({ severity: 'warning', code: 'UNKNOWN_BRAND', message: `Product references unmanaged brand ${product.brand}`, sheet: 'Products', row: index + 2, field: 'Brand' });
    });
    Object.entries(state.templates).forEach(([type, powers]) => Object.entries(powers || {}).forEach(([power, lines]) => (lines || []).forEach((line, index) => {
        if (!normalizeCondition(line.condition)) issues.push({ severity: 'error', code: 'INVALID_CONDITION', message: `Invalid condition for ${type} ${power} line ${line.matchKey}`, sheet: 'Templates', row: index + 2 });
        const quantity = line.qty ?? line.quantity ?? 0;
        if (!Number.isFinite(quantity) || quantity < 0) issues.push({ severity: 'error', code: 'INVALID_TEMPLATE_QUANTITY', message: `Invalid quantity for ${type} ${power} line ${line.matchKey}`, sheet: 'Templates' });
        const key = normalizeMatchKey(line.matchKey);
        if (key && !state.library.some(product => normalizeMatchKey(product.matchKey) === key) && !state.matchKeyMeta[key]) issues.push({ severity: 'warning', code: 'UNKNOWN_MATCH_KEY', message: `Template references unknown MatchKey ${key}`, sheet: 'Templates', key });
    })));
    const agnostic = new Map<string, Product[]>();
    state.library.forEach(product => {
        const key = normalizeMatchKey(product.matchKey);
        if (!key || isBrandSensitive(key, state.matchKeyMeta)) return;
        agnostic.set(key, [...(agnostic.get(key) || []), product]);
    });
    agnostic.forEach((products, key) => {
        if (products.length > 1) issues.push({ severity: 'warning', code: 'BRAND_AGNOSTIC_CONFLICT', message: `MatchKey ${key} has ${products.length} products although it is brand-agnostic`, sheet: 'Products', key });
    });
    return issues;
}

/** Apply a previously previewed diff. Any error issue aborts before mutation. */
export function applyWorkbookDiff(currentInput: WorkbookStateInput | WorkbookState, diff: WorkbookDiff): WorkbookState {
    if (diff.schema !== WORKBOOK_SCHEMA) throw new Error(`Unsupported workbook diff schema ${diff.schema}`);
    if (diff.schemaVersion !== WORKBOOK_SCHEMA_VERSION) throw new Error(`Unsupported workbook diff schema version ${diff.schemaVersion}`);
    if (diff.changes.some(change => change.action === 'replace-tier' && change.sheet !== 'Templates')) {
        throw new Error('Cannot apply workbook diff: replace-tier is only valid on the Templates sheet');
    }
    const errors = diff.issues.filter(issue => issue.severity === 'error');
    if (errors.length) throw new Error(`Cannot apply workbook diff: ${errors.map(issue => issue.message).join('; ')}`);
    let state = toWorkbookState(currentInput as WorkbookStateInput);
    for (const change of diff.changes) state = applyChange(state, change);
    const finalIssues = validateWorkbookState(state);
    const finalErrors = finalIssues.filter(issue => issue.severity === 'error');
    if (finalErrors.length) throw new Error(`Workbook diff produced invalid state: ${finalErrors.map(issue => issue.message).join('; ')}`);
    return clone(state);
}

/** Convenience adapter for one-shot parse -> diff; no writes occur. */
export function diffWorkbook(current: WorkbookStateInput | WorkbookState, input: WorkbookInput): WorkbookDiff {
    return buildWorkbookDiff(current, parseWorkbook(input));
}

/** Plan spelling retained as a small adapter around the pure diff builder. */
export const parseWorkbookToDiff = diffWorkbook;

/**
 * Apply and optionally commit a previously previewed diff. The commit callback
 * is deliberately injected so the core remains independent of localStorage,
 * IndexedDB and React state.
 */
export function applyDiff(
    current: WorkbookStateInput | WorkbookState,
    diff: WorkbookDiff,
    commit?: (next: WorkbookState) => void,
): WorkbookState {
    const next = applyWorkbookDiff(current, diff);
    commit?.(next);
    return next;
}

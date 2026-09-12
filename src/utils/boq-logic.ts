import type {
    BOMItem,
    BoqCatalog,
    BoqDiagnostic,
    BoqProjectInput,
    ComputeBoqResult,
    MatchKeyMetaMap,
    PowerKey,
    Product,
    StarterConfig,
    SummaryItem,
    TemplateLine,
    TemplateTier,
    ValidationIssue,
} from '../types';
import { normalizePowerKey } from '../types';
import {
    BRAND_AGNOSTIC_LABEL,
    categoryOf,
    isBrandSensitive,
    looseMatchKey,
    normalizeMatchKey,
    pickPreferredProduct,
} from './brand-policy';
import { validateBOM } from './validation';

/** A template item accepted by the legacy nested map and by workbook adapters. */
export type TemplateLineInput = {
    id?: string;
    templateLineId?: string;
    matchKey: string;
    qty?: number;
    quantity?: number;
    condition?: string;
};

/** Existing application shape: `{ starterType: { powerKey: lines[] } }`. */
export type LegacyTemplateMap = Record<string, Record<string, TemplateLineInput[]>>;
export type TemplateSource = LegacyTemplateMap | TemplateTier[];

export type LibraryIndex = {
    byKeyAndBrand: Map<string, Product>;
    byKey: Map<string, Product>;
    byKeyAll: Map<string, Product[]>;
    conflicts: string[];
    byKeyLoose: Map<string, Product>;
    byKeyAndBrandLoose: Map<string, Product>;
};

/**
 * Parse and canonicalize a power value into the one key used by starters and
 * template tiers. Empty, non-numeric, infinite and negative values are rejected.
 */
export { normalizePowerKey };

/** Explicit aliases make the canonicalization rule discoverable to adapters. */
export const canonicalPowerKey = normalizePowerKey;
export const toPowerKey = normalizePowerKey;
export const formatPowerKey = normalizePowerKey;
export const powerKeyFor = normalizePowerKey;
export const getPowerKey = normalizePowerKey;

/** Return a stable ID for a generated row. Product IDs are intentionally absent. */
export function generatedBomItemId(starterId: string, templateLineId: string): string {
    return `generated:${String(starterId)}:${String(templateLineId)}`;
}

export const buildGeneratedBomItemId = generatedBomItemId;
export const buildBOMItemId = generatedBomItemId;

/** Return an explicit line ID or a deterministic legacy tier/index identity. */
export function getTemplateLineId(
    starterType: string,
    powerKey: string,
    line: { id?: unknown; templateLineId?: unknown },
    index: number,
): string {
    const explicit = line.id ?? line.templateLineId;
    if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
    return `legacy:${starterType}:${powerKey}:${index}`;
}

export const templateLineIdFor = getTemplateLineId;

function putPreferred(map: Map<string, Product>, key: string, product: Product): void {
    const existing = map.get(key);
    if (!existing || pickPreferredProduct([existing, product]) === product) map.set(key, product);
}

/** Build deterministic exact and rescue indexes for a product library. */
export function createLibraryIndex(library: Product[], meta: MatchKeyMetaMap = {}): LibraryIndex {
    const byKeyAndBrand = new Map<string, Product>();
    const byKeyAll = new Map<string, Product[]>();

    (library || []).forEach(product => {
        const matchKey = normalizeMatchKey(product?.matchKey);
        if (!matchKey) return;
        const brand = normalizeMatchKey(product.brand);
        if (brand) putPreferred(byKeyAndBrand, `${matchKey}|${brand}`, product);

        const bucket = byKeyAll.get(matchKey);
        if (bucket) bucket.push(product);
        else byKeyAll.set(matchKey, [product]);
    });

    const byKey = new Map<string, Product>();
    const byKeyLoose = new Map<string, Product>();
    const byKeyAndBrandLoose = new Map<string, Product>();
    const conflicts: string[] = [];

    byKeyAndBrand.forEach((product, key) => {
        const separator = key.indexOf('|');
        const matchKey = separator < 0 ? key : key.slice(0, separator);
        const brand = separator < 0 ? '' : key.slice(separator + 1);
        putPreferred(byKeyAndBrandLoose, `${looseMatchKey(matchKey)}|${looseMatchKey(brand)}`, product);
    });

    byKeyAll.forEach((products, key) => {
        const preferred = pickPreferredProduct(products);
        if (preferred) {
            byKey.set(key, preferred);
            putPreferred(byKeyLoose, looseMatchKey(key), preferred);
        }
        if (products.length > 1 && !isBrandSensitive(key, meta)) conflicts.push(key);
    });

    return { byKeyAndBrand, byKey, byKeyAll, conflicts, byKeyLoose, byKeyAndBrandLoose };
}

export function findProduct(
    matchKey: string,
    brand: string,
    library: Product[],
    respectBrand: boolean = true,
): Product | undefined {
    const normalizedMatchKey = normalizeMatchKey(matchKey);
    const normalizedBrand = normalizeMatchKey(brand);
    if (respectBrand) {
        // Keep the array-backed compatibility API deterministic too.  The
        // indexed path uses pickPreferredProduct; using Array.find here would
        // make a caller's product order change the generated BOQ.
        return pickPreferredProduct((library || []).filter(p => normalizeMatchKey(p.matchKey) === normalizedMatchKey
            && normalizeMatchKey(p.brand) === normalizedBrand))
            ?? pickPreferredProduct((library || []).filter(p => looseMatchKey(p.matchKey) === looseMatchKey(normalizedMatchKey)
                && looseMatchKey(p.brand) === looseMatchKey(normalizedBrand)));
    }
    return pickPreferredProduct((library || []).filter(p => normalizeMatchKey(p.matchKey) === normalizedMatchKey))
        ?? pickPreferredProduct((library || []).filter(p => looseMatchKey(p.matchKey) === looseMatchKey(normalizedMatchKey)));
}

export function findProductIndexed(
    matchKey: string,
    brand: string,
    index: LibraryIndex,
    respectBrand: boolean = true,
): Product | undefined {
    const normalizedMatchKey = normalizeMatchKey(matchKey);
    const normalizedBrand = normalizeMatchKey(brand);
    if (respectBrand) {
        return index.byKeyAndBrand.get(`${normalizedMatchKey}|${normalizedBrand}`)
            ?? index.byKeyAndBrandLoose.get(`${looseMatchKey(normalizedMatchKey)}|${looseMatchKey(normalizedBrand)}`);
    }
    return index.byKey.get(normalizedMatchKey) ?? index.byKeyLoose.get(looseMatchKey(normalizedMatchKey));
}

/** Find near-identical (whitespace/case-only) template keys for the Admin fixer. */
export function findMatchKeyMismatches(
    library: Product[],
    templates: TemplateSource | Record<string, Record<string, { matchKey: string; qty?: number; condition?: string }[]>>,
): { templateKey: string; libraryKey: string; where: string[] }[] {
    const exact = new Set<string>();
    const looseToExact = new Map<string, string>();
    (library || []).forEach(product => {
        if (!product?.matchKey) return;
        exact.add(product.matchKey);
        const loose = looseMatchKey(product.matchKey);
        if (!looseToExact.has(loose)) looseToExact.set(loose, product.matchKey);
    });

    const found = new Map<string, { templateKey: string; libraryKey: string; where: string[] }>();
    const inspectTier = (type: string, rawPower: unknown, items: unknown): void => {
        const power = normalizePowerKey(rawPower) ?? String(rawPower ?? '').trim();
        if (!Array.isArray(items)) return;
        items.forEach(item => {
            if (!item || typeof item !== 'object') return;
            const key = (item as { matchKey?: unknown }).matchKey;
            if (typeof key !== 'string' || !key || exact.has(key)) return;
            const libraryKey = looseToExact.get(looseMatchKey(key));
            if (!libraryKey) return;
            const hit = found.get(key);
            if (hit) hit.where.push(`${type} ${power}kW`);
            else found.set(key, { templateKey: key, libraryKey, where: [`${type} ${power}kW`] });
        });
    };

    if (Array.isArray(templates)) {
        templates.forEach(tier => {
            if (!tier || typeof tier !== 'object') return;
            const type = String(tier.starterType ?? tier.type ?? '').trim();
            if (!type) return;
            inspectTier(type, tier.powerKey ?? tier.power, tier.lines ?? tier.items);
        });
    } else {
        Object.entries(templates || {}).forEach(([type, powers]) => {
            Object.entries(powers || {}).forEach(([power, items]) => inspectTier(type, power, items));
        });
    }
    return Array.from(found.values());
}

type ResolvedTemplateLine = Omit<TemplateLine, 'id' | 'qty'> & {
    id: string;
    qty: number;
    sourceIndex: number;
};

function diagnostic(
    code: string,
    message: string,
    fields: Partial<Omit<BoqDiagnostic, 'id' | 'code' | 'severity' | 'message'>> = {},
    severity: BoqDiagnostic['severity'] = 'error',
): BoqDiagnostic {
    const identity = [code, fields.starterId, fields.powerKey, fields.templateLineId, fields.matchKey]
        .filter(value => value !== undefined && value !== '').join(':');
    return {
        id: `${code.toLowerCase()}:${identity || 'catalog'}`,
        code,
        severity,
        message,
        ...fields,
    };
}

function lineQuantity(line: TemplateLineInput | null | undefined): number | undefined {
    const value = line?.qty ?? line?.quantity;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
    return value;
}

function normalizeLine(
    starterType: string,
    powerKey: PowerKey,
    tierId: string | undefined,
    input: TemplateLineInput | null | undefined,
    index: number,
    diagnostics: BoqDiagnostic[],
): ResolvedTemplateLine | undefined {
    const matchKey = normalizeMatchKey(input?.matchKey);
    const id = getTemplateLineId(starterType, powerKey, input || {}, index);
    const qty = lineQuantity(input);
    if (!matchKey) {
        diagnostics.push(diagnostic('INVALID_TEMPLATE_LINE', 'Template line is missing matchKey', {
            starterType,
            powerKey,
            templateLineId: id,
            field: 'matchKey',
        }));
        return undefined;
    }
    if (qty === undefined) {
        diagnostics.push(diagnostic('INVALID_TEMPLATE_QUANTITY', `Invalid quantity for template line ${id}`, {
            starterType,
            powerKey,
            templateLineId: id,
            matchKey,
            field: 'qty',
        }));
        return undefined;
    }

    return {
        id,
        tierId,
        matchKey,
        qty,
        quantity: qty,
        condition: input?.condition as TemplateLine['condition'],
        sourceIndex: index,
    };
}

function getLegacyTemplate(
    type: string,
    powerKey: PowerKey,
    templates: LegacyTemplateMap,
    diagnostics: BoqDiagnostic[],
): { tierId?: string; lines?: ResolvedTemplateLine[] } {
    const byPower = templates?.[type];
    if (!byPower) return {};

    const candidates = Object.entries(byPower)
        .filter(([rawPower]) => normalizePowerKey(rawPower) === powerKey);
    if (candidates.length === 0) return {};
    if (candidates.length > 1) {
        diagnostics.push(diagnostic('DUPLICATE_TEMPLATE_TIER', `Multiple template tiers normalize to ${powerKey}`, {
            starterType: type,
            powerKey,
            field: 'powerKey',
        }));
    }

    const [, rawLines] = candidates.find(([key]) => key === powerKey) ?? candidates[0];
    const tierId = `${type}:${powerKey}`;
    const lines = normalizeTemplateLines(type, powerKey, tierId, rawLines || [], diagnostics);
    return { tierId, lines };
}

function getTierTemplate(
    type: string,
    powerKey: PowerKey,
    templates: TemplateTier[],
    diagnostics: BoqDiagnostic[],
): { tierId?: string; lines?: ResolvedTemplateLine[] } {
    const candidates = (templates || []).filter(tier => {
        const tierType = tier?.starterType ?? tier?.type;
        return tierType === type && normalizePowerKey(tier?.powerKey ?? tier?.power) === powerKey;
    });
    if (candidates.length === 0) return {};
    if (candidates.length > 1) {
        diagnostics.push(diagnostic('DUPLICATE_TEMPLATE_TIER', `Multiple template tiers normalize to ${powerKey}`, {
            starterType: type,
            powerKey,
            field: 'powerKey',
        }));
    }
    const tier = candidates[0];
    const tierId = tier.id || `${type}:${powerKey}`;
    const lines = normalizeTemplateLines(
        type,
        powerKey,
        tierId,
        tier.lines ?? tier.items ?? [],
        diagnostics,
    );
    return { tierId, lines };
}

/** Normalize a tier while making duplicate explicit line IDs visible and non-colliding. */
function normalizeTemplateLines(
    starterType: string,
    powerKey: PowerKey,
    tierId: string,
    input: TemplateLineInput[] | unknown,
    diagnostics: BoqDiagnostic[],
): ResolvedTemplateLine[] {
    const seen = new Set<string>();
    const result: ResolvedTemplateLine[] = [];
    if (!Array.isArray(input)) {
        diagnostics.push(diagnostic('INVALID_TEMPLATE_LINES', `Template tier ${tierId} lines must be an array`, {
            starterType,
            powerKey,
            field: 'lines',
        }));
        return result;
    }
    input.forEach((line, index) => {
        const normalized = normalizeLine(
            starterType,
            powerKey,
            tierId,
            line as TemplateLineInput | null | undefined,
            index,
            diagnostics,
        );
        if (!normalized) return;
        if (seen.has(normalized.id)) {
            diagnostics.push(diagnostic('DUPLICATE_TEMPLATE_LINE_ID', `Duplicate template line id "${normalized.id}"`, {
                starterType,
                powerKey,
                templateLineId: normalized.id,
                matchKey: normalized.matchKey,
                field: 'id',
            }));
            normalized.id = `${normalized.id}#${index}`;
        }
        seen.add(normalized.id);
        result.push(normalized);
    });
    return result;
}

function resolveTemplate(
    type: string,
    powerKey: PowerKey,
    templates: TemplateSource,
    diagnostics: BoqDiagnostic[],
): { tierId?: string; lines?: ResolvedTemplateLine[] } {
    return Array.isArray(templates)
        ? getTierTemplate(type, powerKey, templates, diagnostics)
        : getLegacyTemplate(type, powerKey, templates || {}, diagnostics);
}

const CONDITION_PREDICATES: Record<string, (starter: StarterConfig) => boolean> = {
    isolator: starter => Boolean(starter.isolator),
    thermal: starter => Boolean(starter.signals?.thermal),
    ptc: starter => Boolean(starter.signals?.ptc),
    estop: starter => Boolean(starter.signals?.estop),
    humidity: starter => Boolean(starter.signals?.humidity),
    isolator_BFP: starter => Boolean(starter.signals?.isolator_BFP),
    estop_BFP: starter => Boolean(starter.signals?.estop_BFP),
    isolator_estop_FB: starter => Boolean(starter.signals?.isolator_estop_FB),
};

function conditionMatches(
    condition: string | undefined,
    starter: StarterConfig,
    context: { starterId: string; powerKey: PowerKey; templateLineId: string; matchKey: string },
    diagnostics: BoqDiagnostic[],
): boolean {
    if (!condition || condition === 'always') return true;
    const predicate = CONDITION_PREDICATES[condition];
    if (!predicate) {
        diagnostics.push(diagnostic('INVALID_CONDITION', `Unsupported template condition "${condition}"`, {
            starterId: context.starterId,
            powerKey: context.powerKey,
            templateLineId: context.templateLineId,
            matchKey: context.matchKey,
            field: 'condition',
        }));
        return false;
    }
    return predicate(starter);
}

function metaFor(matchKey: string, meta: MatchKeyMetaMap): MatchKeyMetaMap {
    if (meta[matchKey]) return meta;
    const raw = Object.keys(meta).find(key => looseMatchKey(key) === looseMatchKey(matchKey));
    return raw ? { [matchKey]: meta[raw] } : meta;
}

export interface GenerateDetailOptions {
    /** Legacy behavior keeps a visible NOT_FOUND repair row. */
    includeMissingRows?: boolean;
}

export interface GenerateDetailResult {
    detail: BOMItem[];
    diagnostics: BoqDiagnostic[];
}

/** Pure expansion of starters into detail rows plus machine-readable diagnostics. */
export function generateDetailWithDiagnostics(
    starters: StarterConfig[],
    library: Product[] | LibraryIndex,
    templates: TemplateSource,
    meta: MatchKeyMetaMap = {},
    options: GenerateDetailOptions = {},
): GenerateDetailResult {
    const detail: BOMItem[] = [];
    const diagnostics: BoqDiagnostic[] = [];
    const includeMissingRows = options.includeMissingRows !== false;
    const isArray = Array.isArray(library);
    const index = isArray ? undefined : library as LibraryIndex;
    const libArray = isArray ? library as Product[] : [];

    (starters || []).forEach(starter => {
        const powerKey = normalizePowerKey(starter?.powerKey ?? starter?.power);
        if (!powerKey) {
            diagnostics.push(diagnostic('INVALID_POWER', `Invalid power for starter ${starter?.id || '(unknown)'}`, {
                starterId: starter?.id,
                starterType: starter?.type,
                field: 'power',
            }));
            return;
        }

        const resolved = resolveTemplate(starter.type, powerKey, templates, diagnostics);
        if (!resolved.lines) {
            diagnostics.push(diagnostic('MISSING_TEMPLATE', `No template found for ${starter.type} ${powerKey}kW`, {
                starterId: starter.id,
                starterType: starter.type,
                powerKey,
                field: 'template',
            }));
            return;
        }

        const starterQuantity = Number(starter.quantity);
        if (!Number.isFinite(starterQuantity) || starterQuantity <= 0) {
            diagnostics.push(diagnostic('INVALID_STARTER_QUANTITY', `Invalid quantity for starter ${starter.id}`, {
                starterId: starter.id,
                starterType: starter.type,
                powerKey,
                field: 'quantity',
            }));
        }
        const safeStarterQuantity = Number.isFinite(starterQuantity) && starterQuantity > 0 ? starterQuantity : 0;
        const starterName = `${starter.type} - ${powerKey}kW`;

        resolved.lines.forEach(line => {
            if (!conditionMatches(line.condition, starter, {
                starterId: starter.id,
                powerKey,
                templateLineId: line.id,
                matchKey: line.matchKey,
            }, diagnostics)) return;

            const key = normalizeMatchKey(line.matchKey);
            const lineMeta = metaFor(key, meta);
            const brandSensitive = isBrandSensitive(key, lineMeta);
            const category = categoryOf(key, lineMeta);
            let targetBrand = starter.brand || '';
            if ((line.condition === 'isolator' || category === 'ISOLATOR') && starter.isolatorBrand) {
                targetBrand = starter.isolatorBrand;
            }

            const product = index
                ? findProductIndexed(key, targetBrand, index, brandSensitive)
                : findProduct(key, targetBrand, libArray, brandSensitive);
            const quantity = line.qty * safeStarterQuantity;
            const id = generatedBomItemId(starter.id, line.id);

            if (!product) {
                const message = brandSensitive
                    ? `Missing ${key} for ${targetBrand}`
                    : `Missing ${key}`;
                const missing = diagnostic('MISSING_PRODUCT', message, {
                    starterId: starter.id,
                    starterType: starter.type,
                    powerKey,
                    templateLineId: line.id,
                    matchKey: key,
                    productCode: 'NOT_FOUND',
                    details: `Starter: ${starterName}, Brand: ${targetBrand || BRAND_AGNOSTIC_LABEL}`,
                });
                missing.id = `missing-product:${id}`;
                diagnostics.push(missing);

                if (!includeMissingRows) return;
                detail.push({
                    id,
                    starterId: starter.id,
                    starterName,
                    ibomCode: 'N/A',
                    productCode: 'NOT_FOUND',
                    description: message,
                    brand: brandSensitive ? targetBrand : BRAND_AGNOSTIC_LABEL,
                    unit: 'Cái',
                    quantity,
                    defaultQuantity: quantity,
                    matchKey: key,
                    loadName: starter.loadName,
                    templateLineId: line.id,
                    source: 'generated',
                });
                return;
            }

            detail.push({
                id,
                starterId: starter.id,
                starterName,
                    // Synthesize a stable iBom only when a product code exists.
                    // A product may legitimately have neither code nor iBom;
                    // emitting the same `IBOM-` for every such row would merge
                    // unrelated products in the summary.
                    ibomCode: product.ibomCode || (product.code ? `IBOM-${product.code}` : ''),
                productCode: product.code,
                description: product.description,
                brand: product.brand,
                unit: product.unit,
                quantity,
                defaultQuantity: quantity,
                matchKey: key,
                loadName: starter.loadName,
                templateLineId: line.id,
                source: 'generated',
            });
        });
    });

    return { detail, diagnostics };
}

/** Backward-compatible detail-only API used by the current React shell. */
export function generateDetail(
    starters: StarterConfig[],
    library: Product[] | LibraryIndex,
    templates: TemplateSource,
    meta: MatchKeyMetaMap = {},
    options: GenerateDetailOptions = {},
): BOMItem[] {
    return generateDetailWithDiagnostics(starters, library, templates, meta, options).detail;
}

function overrideDetail(
    detail: BOMItem[],
    overrides: Record<string, number>,
): BOMItem[] {
    return detail.map(item => {
        if (!Object.prototype.hasOwnProperty.call(overrides, item.id)) return item;
        // Manual rows own their quantity in the project source.  Applying a
        // generated-row override to them would make the displayed value drift
        // from the source and would be impossible to explain on re-compute.
        if (item.source !== 'generated' && item.source !== 'common') {
            return item;
        }
        const raw = overrides[item.id];
        if (!Number.isFinite(raw) || raw < 0) return item;
        return { ...item, quantity: raw };
    });
}

function addOrphanOverrideDiagnostics(
    detail: BOMItem[],
    overrides: Record<string, number>,
    diagnostics: BoqDiagnostic[],
): void {
    const itemsById = new Map(detail.map(item => [item.id, item]));
    Object.keys(overrides || {}).forEach(id => {
        const item = itemsById.get(id);
        const raw = overrides[id];
        if (!Number.isFinite(raw) || raw < 0) {
            diagnostics.push(diagnostic('INVALID_QUANTITY_OVERRIDE', `Invalid quantity override for ${id}`, {
                starterId: item?.starterId,
                templateLineId: item?.templateLineId ?? id,
                matchKey: item?.matchKey,
                field: 'quantityOverrides',
            }));
        }
        if (item) {
            if (item.source !== 'generated' && item.source !== 'common') {
                diagnostics.push(diagnostic('MANUAL_QUANTITY_OVERRIDE', `Quantity override targets a manual BOQ line: ${id}`, {
                    starterId: item.starterId,
                    matchKey: item.matchKey,
                    field: 'quantityOverrides',
                }, 'warning'));
            }
            return;
        }
        diagnostics.push(diagnostic('ORPHAN_QUANTITY_OVERRIDE', `Quantity override does not match a BOQ line: ${id}`, {
            templateLineId: id,
            field: 'quantityOverrides',
        }, 'warning'));
    });
}

function issueKey(issue: ValidationIssue): string {
    return [issue.code, issue.starterId, issue.powerKey, issue.templateLineId, issue.matchKey, issue.id]
        .filter(value => value !== undefined && value !== '').join('|');
}

/** Domain-level BOQ contract with derived detail, summary and diagnostics. */
export function computeBoq(catalog: BoqCatalog, project: BoqProjectInput): ComputeBoqResult {
    const source = catalog || {};
    const products = source.products ?? source.library ?? [];
    const templates = source.templates ?? {};
    const meta = source.matchKeyMeta ?? source.meta ?? {};
    const projectStarters = project?.starters ?? [];
    const index = createLibraryIndex(products, meta);
    const generated = generateDetailWithDiagnostics(
        projectStarters,
        index,
        templates as TemplateSource,
        meta,
    );
    index.conflicts.forEach(matchKey => {
        generated.diagnostics.push(diagnostic(
            'LIBRARY_MATCH_KEY_CONFLICT',
            `Match key ${matchKey} has multiple brand-agnostic products`,
            { matchKey, field: 'library' },
            'warning',
        ));
    });
    const manual = (project?.manualItems ?? []).map(item => ({
        ...item,
        source: item.source ?? 'manual',
    }));
    const overrides = project?.bomQuantityOverrides ?? project?.quantityOverrides ?? {};
    const sourceDetail = [...generated.detail, ...manual];
    addOrphanOverrideDiagnostics(sourceDetail, overrides, generated.diagnostics);
    const detail = overrideDetail(sourceDetail, overrides);
    const summary = generateSummary(detail);
    const validation = validateBOM(detail, projectStarters, generated.diagnostics);
    const issues: ValidationIssue[] = [];
    [...generated.diagnostics, ...validation.errors, ...validation.warnings, ...validation.infos]
        .forEach(issue => {
            const key = issueKey(issue);
            if (!issues.some(existing => issueKey(existing) === key)) issues.push(issue);
        });

    return { detail, summary, issues, diagnostics: generated.diagnostics, validation };
}

export function generateSummary(bom: BOMItem[]): SummaryItem[] {
    const summaryMap = new Map<string, SummaryItem>();

    (bom || []).forEach(item => {
        if (item.productCode === 'NOT_FOUND') return;
        if (item.quantity <= 0) return;

        const key = (item.ibomCode && item.ibomCode !== 'N/A')
            ? item.ibomCode
            : (item.productCode ? item.productCode : `NO_CODE_${item.description}`);
        const existing = summaryMap.get(key);

        if (existing) {
            existing.totalQuantity += item.quantity;
        } else {
            summaryMap.set(key, {
                id: key,
                ibomCode: item.ibomCode,
                productCode: item.productCode,
                description: item.description,
                brand: item.brand,
                unit: item.unit,
                totalQuantity: item.quantity,
            });
        }
    });

    return Array.from(summaryMap.values());
}

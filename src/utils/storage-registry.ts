import type {
    BOMItem,
    CommonGroup,
    MatchKeyMetaMap,
    Product,
    Project,
    StarterConfig,
    TemplateTier,
} from '../types';
import { normalizePowerKey } from '../types';

/**
 * The data that is allowed to cross the storage/backup boundary.
 *
 * Derived BOQ rows, indexes and validation output deliberately do not appear
 * here. They are rebuilt from this source data after a restore.
 */
export const BACKUP_SCHEMA = 'boq-backup';
export const BACKUP_VERSION = 1;
export const CATALOG_SCHEMA_VERSION = 2;
export const PROJECT_STORAGE_KEY = 'boq_projects';
/** One rollback snapshot is retained locally; it is intentionally excluded from backups. */
export const UNDO_SNAPSHOT_KEY = 'boq_undo_snapshot';
export const UNDO_SNAPSHOT_VERSION = 1;

export const LEGACY_DEAD_STORAGE_KEYS = ['boq_manual_items', 'boq_bom_overrides'] as const;

export interface TemplateLineRecord {
    id?: string;
    tierId?: string;
    matchKey: string;
    /** Legacy application field. */
    qty?: number;
    /** Canonical domain alias accepted at the storage boundary. */
    quantity?: number;
    condition?: string;
    [key: string]: unknown;
}

export type TemplateCatalog = Record<string, Record<string, TemplateLineRecord[]>>;
export type StoredTemplateCatalog = TemplateCatalog | TemplateTier[];

export interface BackupCatalog {
    library: Product[];
    templates: StoredTemplateCatalog;
    brands: string[];
    matchKeyMeta: MatchKeyMetaMap;
    commonGroups: CommonGroup[];
    logicConfig: Record<string, unknown>;
    schemaVersion: number;
}

export interface BackupEnvelope {
    schema: typeof BACKUP_SCHEMA;
    version: typeof BACKUP_VERSION;
    exportedAt: string;
    catalog: BackupCatalog;
    projects: Project[];
    currentProjectId: string | null;
}

export interface ProjectSnapshot {
    projects: Project[];
    currentProjectId: string | null;
}

export interface StoragePort {
    readonly length: number;
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    key(index: number): string | null;
}

/** Small adapter used by unit tests and by non-browser callers. */
export class InMemoryStorage implements StoragePort {
    private readonly values = new Map<string, string>();

    get length(): number {
        return this.values.size;
    }

    getItem(key: string): string | null {
        return this.values.has(key) ? this.values.get(key)! : null;
    }

    setItem(key: string, value: string): void {
        this.values.set(key, String(value));
    }

    removeItem(key: string): void {
        this.values.delete(key);
    }

    key(index: number): string | null {
        return Array.from(this.values.keys())[index] ?? null;
    }
}

let fallbackStorage: InMemoryStorage | undefined;

export function getDefaultStorage(): StoragePort {
    try {
        if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
            return globalThis.localStorage;
        }
    } catch {
        // Access to localStorage can throw in privacy-restricted contexts.
    }
    fallbackStorage ??= new InMemoryStorage();
    return fallbackStorage;
}

interface RegistryEntry {
    field: keyof BackupCatalog;
    key: string;
    defaultValue: () => unknown;
}

/** Single registry used by export, migration and restore. */
export const SOURCE_STORAGE_REGISTRY: readonly RegistryEntry[] = [
    { field: 'library', key: 'boq_library', defaultValue: () => [] },
    { field: 'templates', key: 'boq_templates', defaultValue: () => ({}) },
    { field: 'brands', key: 'boq_brands', defaultValue: () => [] },
    { field: 'matchKeyMeta', key: 'boq_matchkey_meta', defaultValue: () => ({}) },
    { field: 'commonGroups', key: 'boq_common_groups', defaultValue: () => [] },
    { field: 'logicConfig', key: 'logicConfig', defaultValue: () => ({}) },
    { field: 'schemaVersion', key: 'boq_schema_version', defaultValue: () => CATALOG_SCHEMA_VERSION },
];

export const SOURCE_STORAGE_KEYS = SOURCE_STORAGE_REGISTRY.map(entry => entry.key);
export const BACKUP_STORAGE_KEYS = [
    ...SOURCE_STORAGE_KEYS,
    PROJECT_STORAGE_KEY,
    ...LEGACY_DEAD_STORAGE_KEYS,
] as const;

export interface BackupValidationResult {
    valid: boolean;
    errors: string[];
    value?: BackupEnvelope;
}

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasSafeKeys(value: Record<string, unknown>): boolean {
    return Object.keys(value).every(key => !DANGEROUS_KEYS.has(key));
}

function collectDangerousKeys(value: unknown, path: string, errors: string[]): void {
    if (Array.isArray(value)) {
        value.forEach((item, index) => collectDangerousKeys(item, `${path}[${index}]`, errors));
        return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
        if (DANGEROUS_KEYS.has(key)) errors.push(`${path}.${key} is not allowed`);
        collectDangerousKeys(child, `${path}.${key}`, errors);
    }
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isIsoDate(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function validateProduct(value: unknown, path: string, errors: string[]): value is Product {
    if (!isRecord(value) || !hasSafeKeys(value)) {
        errors.push(`${path} must be an object`);
        return false;
    }
    // A product may be identified by iBom only (for example MCT/PCT rows), so
    // an empty product code is valid.  Keep the field typed as a string when
    // present instead of treating an empty code as a malformed product.
    for (const field of ['id', 'description', 'brand', 'unit']) {
        if (!isNonEmptyString(value[field])) errors.push(`${path}.${field} must be a non-empty string`);
    }
    if (typeof value.code !== 'string') errors.push(`${path}.code must be a string`);
    if (value.ibomCode !== undefined && typeof value.ibomCode !== 'string') {
        errors.push(`${path}.ibomCode must be a string`);
    }
    if (value.matchKey !== undefined && typeof value.matchKey !== 'string') {
        errors.push(`${path}.matchKey must be a string`);
    }
    if (value.price !== undefined && (!isFiniteNumber(value.price) || value.price < 0)) {
        errors.push(`${path}.price must be a non-negative number`);
    }
    return true;
}

function validateTemplateLines(lines: unknown, path: string, errors: string[]): void {
    if (!Array.isArray(lines)) {
        errors.push(`${path} must be an array`);
        return;
    }
    lines.forEach((line, index) => {
        const linePath = `${path}[${index}]`;
        if (!isRecord(line) || !hasSafeKeys(line)) {
            errors.push(`${linePath} must be an object`);
            return;
        }
        if (!isNonEmptyString(line.matchKey)) {
            errors.push(`${linePath}.matchKey is required`);
        }
        const quantity = line.qty ?? line.quantity;
        if (!isFiniteNumber(quantity) || quantity < 0) {
            errors.push(`${linePath}.qty must be non-negative`);
        }
        if (line.id !== undefined && typeof line.id !== 'string') {
            errors.push(`${linePath}.id must be a string`);
        }
        if (line.tierId !== undefined && typeof line.tierId !== 'string') {
            errors.push(`${linePath}.tierId must be a string`);
        }
        if (line.condition !== undefined && typeof line.condition !== 'string') {
            errors.push(`${linePath}.condition must be a string`);
        }
    });
}

function validateTemplateCatalog(value: unknown, errors: string[]): value is StoredTemplateCatalog {
    if (Array.isArray(value)) {
        value.forEach((tier, index) => {
            const path = `catalog.templates[${index}]`;
            if (!isRecord(tier) || !hasSafeKeys(tier)) {
                errors.push(`${path} must be an object`);
                return;
            }
            const starterType = tier.starterType ?? tier.type;
            if (!isNonEmptyString(starterType)) errors.push(`${path}.starterType is required`);
            const rawPower = tier.powerKey ?? tier.power;
            if (normalizePowerKey(rawPower) === undefined) errors.push(`${path}.powerKey must be a non-negative PowerKey`);
            if (tier.id !== undefined && typeof tier.id !== 'string') errors.push(`${path}.id must be a string`);
            validateTemplateLines(tier.lines ?? tier.items, `${path}.lines`, errors);
        });
        return true;
    }
    if (!isRecord(value) || !hasSafeKeys(value)) {
        errors.push('catalog.templates must be an object or tier array');
        return false;
    }
    for (const [starterType, tiers] of Object.entries(value)) {
        if (!isRecord(tiers) || !hasSafeKeys(tiers)) {
            errors.push(`catalog.templates.${starterType} must be an object`);
            continue;
        }
        for (const [powerKey, lines] of Object.entries(tiers)) {
            if (normalizePowerKey(powerKey) === undefined) {
                errors.push(`catalog.templates.${starterType}.${powerKey} must be a non-negative PowerKey`);
            }
            validateTemplateLines(lines, `catalog.templates.${starterType}.${powerKey}`, errors);
        }
    }
    return true;
}

function validateMatchKeyMeta(value: unknown, errors: string[]): value is MatchKeyMetaMap {
    if (!isRecord(value) || !hasSafeKeys(value)) {
        errors.push('catalog.matchKeyMeta must be an object');
        return false;
    }
    for (const [key, meta] of Object.entries(value)) {
        if (!isRecord(meta) || !hasSafeKeys(meta)) {
            errors.push(`catalog.matchKeyMeta.${key} must be an object`);
            continue;
        }
        if (!isNonEmptyString(meta.matchKey)) errors.push(`catalog.matchKeyMeta.${key}.matchKey is required`);
        if (!isNonEmptyString(meta.category)) errors.push(`catalog.matchKeyMeta.${key}.category is required`);
        if (typeof meta.brandSensitive !== 'boolean') {
            errors.push(`catalog.matchKeyMeta.${key}.brandSensitive must be boolean`);
        }
    }
    return true;
}

function validateCommonGroups(value: unknown, errors: string[]): boolean {
    if (!Array.isArray(value)) {
        errors.push('catalog.commonGroups must be an array');
        return false;
    }
    value.forEach((group, groupIndex) => {
        const path = `catalog.commonGroups[${groupIndex}]`;
        if (!isRecord(group) || !hasSafeKeys(group)) {
            errors.push(`${path} must be an object`);
            return;
        }
        if (!isNonEmptyString(group.id)) errors.push(`${path}.id is required`);
        if (typeof group.logicText !== 'string') errors.push(`${path}.logicText must be a string`);
        if (!isNonEmptyString(group.logicType)) errors.push(`${path}.logicType is required`);
        if (!Array.isArray(group.items)) {
            errors.push(`${path}.items must be an array`);
            return;
        }
        group.items.forEach((item, itemIndex) => {
            const itemPath = `${path}.items[${itemIndex}]`;
            if (!isRecord(item) || !hasSafeKeys(item)) {
                errors.push(`${itemPath} must be an object`);
                return;
            }
            for (const field of ['ibomCode', 'description', 'productCode', 'brand', 'unit', 'note']) {
                if (typeof item[field] !== 'string') errors.push(`${itemPath}.${field} must be a string`);
            }
            if (item.quantity !== undefined && (!isFiniteNumber(item.quantity) || item.quantity < 0)) {
                errors.push(`${itemPath}.quantity must be non-negative`);
            }
        });
    });
    return true;
}

function validateSignals(value: unknown, path: string, errors: string[]): boolean {
    if (!isRecord(value) || !hasSafeKeys(value)) {
        errors.push(`${path} must be an object`);
        return false;
    }
    for (const field of ['thermal', 'ptc', 'estop', 'humidity', 'isolator_BFP', 'estop_BFP', 'isolator_estop_FB']) {
        if (typeof value[field] !== 'boolean') errors.push(`${path}.${field} must be boolean`);
    }
    return true;
}

function validateStarter(value: unknown, path: string, errors: string[]): value is StarterConfig {
    if (!isRecord(value) || !hasSafeKeys(value)) {
        errors.push(`${path} must be an object`);
        return false;
    }
    for (const field of ['id', 'type', 'brand']) {
        if (!isNonEmptyString(value[field])) errors.push(`${path}.${field} must be a non-empty string`);
    }
    // New projects use a canonical PowerKey string; old projects stored a
    // number in `power`. Accept both at this boundary and reject an invalid or
    // contradictory pair rather than silently selecting one value.
    const power = value.power;
    const powerKey = value.powerKey;
    const normalizedPower = power === undefined ? undefined : normalizePowerKey(power);
    const normalizedPowerKey = powerKey === undefined ? undefined : normalizePowerKey(powerKey);
    if (power === undefined && powerKey === undefined) {
        errors.push(`${path}.power or ${path}.powerKey must be a non-negative PowerKey`);
    } else if (power !== undefined && !normalizedPower) {
        errors.push(`${path}.power must be a non-negative PowerKey`);
    }
    if (powerKey !== undefined && (typeof powerKey !== 'string' || !normalizedPowerKey)) {
        errors.push(`${path}.powerKey must be a non-negative PowerKey string`);
    }
    if (normalizedPower && normalizedPowerKey && normalizedPower !== normalizedPowerKey) {
        errors.push(`${path}.power and ${path}.powerKey must refer to the same PowerKey`);
    }
    if (!isFiniteNumber(value.quantity) || value.quantity <= 0) errors.push(`${path}.quantity must be positive`);
    if (typeof value.isolator !== 'boolean') errors.push(`${path}.isolator must be boolean`);
    if (value.isolatorBrand !== undefined && typeof value.isolatorBrand !== 'string') {
        errors.push(`${path}.isolatorBrand must be a string`);
    }
    validateSignals(value.signals, `${path}.signals`, errors);
    if (value.loadName !== undefined && typeof value.loadName !== 'string') errors.push(`${path}.loadName must be a string`);
    return true;
}

function validateManualItem(value: unknown, path: string, errors: string[]): value is BOMItem {
    if (!isRecord(value) || !hasSafeKeys(value)) {
        errors.push(`${path} must be an object`);
        return false;
    }
    for (const field of ['id', 'starterId', 'starterName', 'description', 'brand', 'unit']) {
        if (!isNonEmptyString(value[field])) errors.push(`${path}.${field} must be a non-empty string`);
    }
    // Some valid catalog rows (notably MCT/PCT) have only an iBom code and an
    // intentionally empty product code. Manual lines must preserve that data
    // instead of rejecting the whole project backup.
    for (const field of ['ibomCode', 'productCode']) {
        if (typeof value[field] !== 'string') errors.push(`${path}.${field} must be a string`);
    }
    if (!isFiniteNumber(value.quantity) || value.quantity < 0) errors.push(`${path}.quantity must be non-negative`);
    if (value.matchKey !== undefined && typeof value.matchKey !== 'string') errors.push(`${path}.matchKey must be a string`);
    if (value.loadName !== undefined && typeof value.loadName !== 'string') errors.push(`${path}.loadName must be a string`);
    return true;
}

function validateProject(value: unknown, path: string, errors: string[]): value is Project {
    if (!isRecord(value) || !hasSafeKeys(value)) {
        errors.push(`${path} must be an object`);
        return false;
    }
    if (!isNonEmptyString(value.id)) errors.push(`${path}.id must be a non-empty string`);
    const metadata = value.metadata;
    if (!isRecord(metadata) || !hasSafeKeys(metadata)) {
        errors.push(`${path}.metadata must be an object`);
    } else {
        if (!isNonEmptyString(metadata.name)) errors.push(`${path}.metadata.name is required`);
        if (!isIsoDate(metadata.createdAt)) errors.push(`${path}.metadata.createdAt must be an ISO date`);
        if (!isIsoDate(metadata.updatedAt)) errors.push(`${path}.metadata.updatedAt must be an ISO date`);
        if (metadata.description !== undefined && typeof metadata.description !== 'string') errors.push(`${path}.metadata.description must be a string`);
        if (metadata.author !== undefined && typeof metadata.author !== 'string') errors.push(`${path}.metadata.author must be a string`);
        if (metadata.tags !== undefined && (!Array.isArray(metadata.tags) || metadata.tags.some(tag => typeof tag !== 'string'))) {
            errors.push(`${path}.metadata.tags must be an array of strings`);
        }
    }
    if (!Array.isArray(value.starters)) {
        errors.push(`${path}.starters must be an array`);
    } else {
        value.starters.forEach((starter, index) => validateStarter(starter, `${path}.starters[${index}]`, errors));
    }
    if (value.manualItems !== undefined) {
        if (!Array.isArray(value.manualItems)) errors.push(`${path}.manualItems must be an array`);
        else value.manualItems.forEach((item, index) => validateManualItem(item, `${path}.manualItems[${index}]`, errors));
    }
    if (value.bomQuantityOverrides !== undefined) {
        if (!isRecord(value.bomQuantityOverrides) || !hasSafeKeys(value.bomQuantityOverrides)) {
            errors.push(`${path}.bomQuantityOverrides must be an object`);
        } else {
            for (const [key, quantity] of Object.entries(value.bomQuantityOverrides)) {
                if (!isFiniteNumber(quantity) || quantity < 0) errors.push(`${path}.bomQuantityOverrides.${key} must be non-negative`);
            }
        }
    }
    return true;
}

function validateCatalog(value: unknown, errors: string[]): value is BackupCatalog {
    if (!isRecord(value) || !hasSafeKeys(value)) {
        errors.push('catalog must be an object');
        return false;
    }
    if (!Array.isArray(value.library)) errors.push('catalog.library must be an array');
    else value.library.forEach((product, index) => validateProduct(product, `catalog.library[${index}]`, errors));
    validateTemplateCatalog(value.templates, errors);
    if (!Array.isArray(value.brands) || value.brands.some(brand => !isNonEmptyString(brand))) errors.push('catalog.brands must be an array of strings');
    validateMatchKeyMeta(value.matchKeyMeta, errors);
    validateCommonGroups(value.commonGroups, errors);
    if (!isRecord(value.logicConfig) || !hasSafeKeys(value.logicConfig)) errors.push('catalog.logicConfig must be an object');
    if (typeof value.schemaVersion !== 'number' || !Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) {
        errors.push('catalog.schemaVersion must be a positive integer');
    }
    collectDangerousKeys(value, 'catalog', errors);
    return true;
}

export function inspectBackupEnvelope(input: unknown): BackupValidationResult {
    const errors: string[] = [];
    if (!isRecord(input) || !hasSafeKeys(input)) {
        return { valid: false, errors: ['backup must be an object'] };
    }
    if (input.schema !== BACKUP_SCHEMA) errors.push(`schema must be ${BACKUP_SCHEMA}`);
    if (input.version !== BACKUP_VERSION) errors.push(`version must be ${BACKUP_VERSION}`);
    if (!isIsoDate(input.exportedAt)) errors.push('exportedAt must be an ISO date');
    validateCatalog(input.catalog, errors);
    if (!Array.isArray(input.projects)) errors.push('projects must be an array');
    else {
        const ids = new Set<string>();
        input.projects.forEach((project, index) => {
            validateProject(project, `projects[${index}]`, errors);
            if (isRecord(project) && typeof project.id === 'string') {
                if (ids.has(project.id)) errors.push(`projects has duplicate id ${project.id}`);
                ids.add(project.id);
            }
        });
        if (input.currentProjectId !== null && typeof input.currentProjectId !== 'string') {
            errors.push('currentProjectId must be a string or null');
        } else if (typeof input.currentProjectId === 'string' && !ids.has(input.currentProjectId)) {
            errors.push('currentProjectId must reference a project');
        }
    }
    collectDangerousKeys(input.projects, 'projects', errors);
    if (!Object.prototype.hasOwnProperty.call(input, 'currentProjectId')) errors.push('currentProjectId is required');
    return errors.length === 0
        ? { valid: true, errors: [], value: input as unknown as BackupEnvelope }
        : { valid: false, errors };
}

export function validateBackupEnvelope(input: unknown): input is BackupEnvelope {
    return inspectBackupEnvelope(input).valid;
}

export function assertBackupEnvelope(input: unknown): asserts input is BackupEnvelope {
    const result = inspectBackupEnvelope(input);
    if (!result.valid) throw new Error(`Invalid backup: ${result.errors.join('; ')}`);
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function parseJsonValue(value: unknown, path: string): unknown {
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        throw new Error(`${path} contains invalid JSON`);
    }
}

function normalizeProjectSnapshot(raw: unknown): ProjectSnapshot {
    const parsed = parseJsonValue(raw, 'projects');
    if (!isRecord(parsed)) return { projects: [], currentProjectId: null };
    const state = isRecord(parsed.state) ? parsed.state : parsed;
    const projects = Array.isArray(state.projects) ? state.projects : [];
    const currentProjectId = typeof state.currentProjectId === 'string' ? state.currentProjectId : null;
    const errors: string[] = [];
    projects.forEach((project, index) => validateProject(project, `projects[${index}]`, errors));
    if (errors.length) throw new Error(`Invalid project data: ${errors.join('; ')}`);
    const ids = new Set<string>();
    for (const project of projects as Project[]) {
        if (ids.has(project.id)) throw new Error(`Invalid project data: duplicate id ${project.id}`);
        ids.add(project.id);
    }
    return {
        projects: clone(projects as Project[]).map(project => ({
            ...project,
            // Keep the legacy `power` value for old UI consumers, while
            // persisting the canonical key used by the rebuilt engine.
            starters: project.starters.map(starter => {
                const powerKey = normalizePowerKey(starter.powerKey ?? starter.power);
                return powerKey ? { ...starter, powerKey } : starter;
            }),
            manualItems: project.manualItems ?? [],
            bomQuantityOverrides: project.bomQuantityOverrides ?? {},
        })),
        currentProjectId: currentProjectId && ids.has(currentProjectId) ? currentProjectId : null,
    };
}

export function normalizeProjectState(raw: unknown): ProjectSnapshot {
    return normalizeProjectSnapshot(raw);
}

function readCatalog(storage: StoragePort): BackupCatalog {
    const catalog: Record<string, unknown> = {};
    for (const entry of SOURCE_STORAGE_REGISTRY) {
        const raw = storage.getItem(entry.key);
        let value: unknown = raw === null ? entry.defaultValue() : parseJsonValue(raw, entry.key);
        if (entry.field === 'schemaVersion') {
            const numberValue = typeof value === 'number' ? value : Number(value);
            value = Number.isInteger(numberValue) && numberValue > 0 ? numberValue : CATALOG_SCHEMA_VERSION;
        }
        catalog[entry.field] = value;
    }
    const candidate = catalog as unknown as BackupCatalog;
    const result = inspectBackupEnvelope({
        schema: BACKUP_SCHEMA,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        catalog: candidate,
        projects: [],
        currentProjectId: null,
    });
    if (!result.valid) throw new Error(`Cannot read catalog: ${result.errors.join('; ')}`);
    return clone(candidate);
}

export interface CreateBackupOptions {
    storage?: StoragePort;
    projects?: Project[];
    currentProjectId?: string | null;
}

export function createBackupEnvelope(options: CreateBackupOptions = {}): BackupEnvelope {
    const storage = options.storage ?? getDefaultStorage();
    const projectSnapshot = options.projects
        ? normalizeProjectSnapshot({ projects: options.projects, currentProjectId: options.currentProjectId ?? null })
        : normalizeProjectSnapshot(storage.getItem(PROJECT_STORAGE_KEY));
    const envelope: BackupEnvelope = {
        schema: BACKUP_SCHEMA,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        catalog: readCatalog(storage),
        projects: projectSnapshot.projects,
        currentProjectId: projectSnapshot.currentProjectId,
    };
    assertBackupEnvelope(envelope);
    return clone(envelope);
}

function extractLegacyPayload(input: Record<string, unknown>): Record<string, unknown> {
    if (isRecord(input.data)) {
        if (isRecord(input.data.catalog)) {
            return { ...input.data, ...input.data.catalog };
        }
        return input.data;
    }
    return input;
}

/** Convert the previous `version + data.*` backup shape to the canonical envelope. */
export function migrateBackup(input: unknown): BackupEnvelope {
    if (!isRecord(input) || !hasSafeKeys(input)) throw new Error('Backup must be an object');
    if (input.schema === BACKUP_SCHEMA) {
        if (input.version !== BACKUP_VERSION) throw new Error(`Unsupported backup version: ${String(input.version)}`);
        assertBackupEnvelope(input);
        return clone(input);
    }

    const payload = extractLegacyPayload(input);
    const rawCatalog = isRecord(payload.catalog) ? payload.catalog : payload;
    const catalog: Record<string, unknown> = {};
    for (const entry of SOURCE_STORAGE_REGISTRY) {
        const value = rawCatalog[entry.field] ?? rawCatalog[entry.key];
        const parsed = value === undefined || value === null || value === ''
            ? entry.defaultValue()
            : parseJsonValue(value, `backup.${String(entry.field)}`);
        if (entry.field === 'schemaVersion') {
            const numberValue = typeof parsed === 'number' ? parsed : Number(parsed);
            catalog[entry.field] = Number.isInteger(numberValue) && numberValue > 0 ? numberValue : CATALOG_SCHEMA_VERSION;
        } else {
            catalog[entry.field] = parsed;
        }
    }

    const projectValue = payload.projects ?? payload.projectState;
    const parsedProjectValue = projectValue === undefined ? undefined : parseJsonValue(projectValue, 'backup.projects');
    const projectInput = isRecord(parsedProjectValue) && ('state' in parsedProjectValue || 'projects' in parsedProjectValue)
        ? parsedProjectValue
        : { projects: parsedProjectValue, currentProjectId: payload.currentProjectId };
    const projectSnapshot = normalizeProjectSnapshot(projectInput);
    const manualItems = payload.manualItems === undefined ? undefined : parseJsonValue(payload.manualItems, 'backup.manualItems');
    const bomOverrides = payload.bomOverrides === undefined ? undefined : parseJsonValue(payload.bomOverrides, 'backup.bomOverrides');
    if (manualItems !== undefined && !Array.isArray(manualItems)) {
        throw new Error('backup.manualItems must be an array');
    }
    if (bomOverrides !== undefined && (!isRecord(bomOverrides) || Object.values(bomOverrides).some(value => !isFiniteNumber(value) || value < 0))) {
        throw new Error('backup.bomOverrides must be a non-negative number map');
    }
    if (projectSnapshot.currentProjectId && (manualItems !== undefined || bomOverrides !== undefined)) {
        const index = projectSnapshot.projects.findIndex(project => project.id === projectSnapshot.currentProjectId);
        if (index >= 0) {
            const current = projectSnapshot.projects[index];
            projectSnapshot.projects[index] = {
                ...current,
                ...(current.manualItems?.length ? {} : Array.isArray(manualItems) ? { manualItems: manualItems as BOMItem[] } : {}),
                ...(current.bomQuantityOverrides && Object.keys(current.bomQuantityOverrides).length ? {} : isRecord(bomOverrides) ? { bomQuantityOverrides: bomOverrides as Record<string, number> } : {}),
            };
        }
    }

    const exportedAt = isIsoDate(input.exportedAt) ? input.exportedAt : isIsoDate(input.exportDate) ? input.exportDate : new Date().toISOString();
    const envelope: BackupEnvelope = {
        schema: BACKUP_SCHEMA,
        version: BACKUP_VERSION,
        exportedAt,
        catalog: catalog as unknown as BackupCatalog,
        projects: projectSnapshot.projects,
        currentProjectId: projectSnapshot.currentProjectId,
    };
    assertBackupEnvelope(envelope);
    return clone(envelope);
}

export interface StorageSnapshot {
    entries: Record<string, string | null>;
}

interface UndoSnapshotEnvelope {
    version: typeof UNDO_SNAPSHOT_VERSION;
    operation: string;
    createdAt: string;
    snapshot: StorageSnapshot;
}

function readUndoSnapshot(storage: StoragePort): StorageSnapshot | undefined {
    const raw = storage.getItem(UNDO_SNAPSHOT_KEY);
    if (!raw) return undefined;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!isRecord(parsed) || parsed.version !== UNDO_SNAPSHOT_VERSION || !isNonEmptyString(parsed.operation) || !isIsoDate(parsed.createdAt)) {
            return undefined;
        }
        const snapshot = parsed.snapshot;
        if (!isRecord(snapshot) || !isRecord(snapshot.entries) || !hasSafeKeys(snapshot.entries)) return undefined;
        const entries: Record<string, string | null> = {};
        for (const [key, value] of Object.entries(snapshot.entries)) {
            if (!(BACKUP_STORAGE_KEYS as readonly string[]).includes(key)) return undefined;
            if (value !== null && typeof value !== 'string') return undefined;
            entries[key] = value;
        }
        // A snapshot missing registered keys cannot restore the whole source
        // registry atomically, so leave it unavailable rather than guessing.
        if (Object.keys(entries).length !== BACKUP_STORAGE_KEYS.length) return undefined;
        return { entries };
    } catch {
        return undefined;
    }
}

function writeUndoSnapshot(storage: StoragePort, snapshot: StorageSnapshot, operation: string): void {
    const envelope: UndoSnapshotEnvelope = {
        version: UNDO_SNAPSHOT_VERSION,
        operation,
        createdAt: new Date().toISOString(),
        snapshot,
    };
    storage.setItem(UNDO_SNAPSHOT_KEY, JSON.stringify(envelope));
}

export function snapshotStorage(storage: StoragePort = getDefaultStorage()): StorageSnapshot {
    const entries: Record<string, string | null> = {};
    for (const key of BACKUP_STORAGE_KEYS) entries[key] = storage.getItem(key);
    return { entries };
}

export function restoreStorageSnapshot(snapshot: StorageSnapshot, storage: StoragePort = getDefaultStorage()): void {
    for (const [key, value] of Object.entries(snapshot.entries)) {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
    }
}

function serializeCatalogValue(field: keyof BackupCatalog, value: unknown): string {
    if (field === 'schemaVersion') return String(value);
    return JSON.stringify(value);
}

function writeEnvelope(envelope: BackupEnvelope, storage: StoragePort): void {
    for (const entry of SOURCE_STORAGE_REGISTRY) {
        storage.setItem(entry.key, serializeCatalogValue(entry.field, envelope.catalog[entry.field]));
    }
    storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify({
        state: {
            projects: envelope.projects,
            currentProjectId: envelope.currentProjectId,
        },
        version: BACKUP_VERSION,
    }));
    for (const key of LEGACY_DEAD_STORAGE_KEYS) storage.removeItem(key);
}

// Keep an in-memory copy as a compatibility fallback for callers that hold a
// custom storage adapter which was restored before the persistent snapshot was
// introduced. New restores always persist the snapshot so it survives reload.
let lastRestoreUndo: { storage: StoragePort; snapshot: StorageSnapshot } | undefined;

export interface RestoreBackupOptions {
    storage?: StoragePort;
    onProjectState?: (snapshot: ProjectSnapshot) => void;
}

export interface RestoreBackupResult {
    envelope: BackupEnvelope;
    snapshot: StorageSnapshot;
}

/** Validate first, then replace all registered source data in one rollbackable operation. */
export function restoreBackup(input: unknown, options: RestoreBackupOptions = {}): RestoreBackupResult {
    const envelope = migrateBackup(input);
    const storage = options.storage ?? getDefaultStorage();
    const before = snapshotStorage(storage);
    const previousUndo = storage.getItem(UNDO_SNAPSHOT_KEY);
    try {
        // Write the rollback point before replacing any registered source key.
        // If this fails, the restore is aborted before catalog/project data is
        // touched and the previous undo point is preserved.
        writeUndoSnapshot(storage, before, 'restore');
        writeEnvelope(envelope, storage);
        options.onProjectState?.({ projects: clone(envelope.projects), currentProjectId: envelope.currentProjectId });
        lastRestoreUndo = { storage, snapshot: before };
        return { envelope, snapshot: before };
    } catch (error) {
        try {
            restoreStorageSnapshot(before, storage);
            if (previousUndo === null) storage.removeItem(UNDO_SNAPSHOT_KEY);
            else storage.setItem(UNDO_SNAPSHOT_KEY, previousUndo);
        } catch (rollbackError) {
            throw new Error(`Restore failed and rollback failed: ${String(rollbackError)}`);
        }
        throw error;
    }
}

export function canUndoLastRestore(storage: StoragePort = getDefaultStorage()): boolean {
    return readUndoSnapshot(storage) !== undefined || lastRestoreUndo?.storage === storage;
}

/** Restore only the previous snapshot. A second undo is intentionally unavailable. */
export function undoLastRestore(storage: StoragePort = getDefaultStorage(), onProjectState?: (snapshot: ProjectSnapshot) => void): boolean {
    const persistedSnapshot = readUndoSnapshot(storage);
    const snapshot = persistedSnapshot ?? (lastRestoreUndo?.storage === storage ? lastRestoreUndo.snapshot : undefined);
    if (!snapshot) return false;
    // Validate the previous project payload before touching storage. This
    // prevents a malformed snapshot from leaving a half-restored registry.
    let previousProjectSnapshot: ProjectSnapshot;
    try {
        previousProjectSnapshot = normalizeProjectSnapshot(snapshot.entries[PROJECT_STORAGE_KEY]);
    } catch {
        return false;
    }

    // Keep a second snapshot so a storage or callback failure can put the
    // already-restored state back exactly as it was before the undo attempt.
    const current = snapshotStorage(storage);
    const currentUndo = storage.getItem(UNDO_SNAPSHOT_KEY);
    try {
        restoreStorageSnapshot(snapshot, storage);
        onProjectState?.(previousProjectSnapshot);
        storage.removeItem(UNDO_SNAPSHOT_KEY);
        lastRestoreUndo = undefined;
        return true;
    } catch {
        try {
            restoreStorageSnapshot(current, storage);
            if (currentUndo === null) storage.removeItem(UNDO_SNAPSHOT_KEY);
            else storage.setItem(UNDO_SNAPSHOT_KEY, currentUndo);
            // Keep the callback's in-memory state aligned with the storage
            // state when the callback itself failed after applying changes.
            const currentProjectSnapshot = normalizeProjectSnapshot(current.entries[PROJECT_STORAGE_KEY]);
            onProjectState?.(currentProjectSnapshot);
        } catch {
            // There is no stronger recovery available for a storage adapter
            // that rejects rollback writes; report failure to the caller.
        }
        return false;
    }
}

export interface LegacyMigrationResult {
    migrated: boolean;
    warnings: string[];
    projectSnapshot: ProjectSnapshot;
}

/**
 * Fold the two pre-registry project keys into the current project when that is
 * unambiguous, then remove them only after the canonical project write succeeds.
 */
export function migrateLegacyStorage(storage: StoragePort = getDefaultStorage()): LegacyMigrationResult {
    const warnings: string[] = [];
    let projectSnapshot: ProjectSnapshot;
    try {
        projectSnapshot = normalizeProjectSnapshot(storage.getItem(PROJECT_STORAGE_KEY));
    } catch (error) {
        warnings.push(`Project data was not migrated: ${error instanceof Error ? error.message : String(error)}`);
        return { migrated: false, warnings, projectSnapshot: { projects: [], currentProjectId: null } };
    }
    const currentIndex = projectSnapshot.currentProjectId
        ? projectSnapshot.projects.findIndex(project => project.id === projectSnapshot.currentProjectId)
        : -1;
    const manualRaw = storage.getItem('boq_manual_items');
    const overridesRaw = storage.getItem('boq_bom_overrides');
    if (!manualRaw && !overridesRaw) return { migrated: false, warnings, projectSnapshot };
    if (currentIndex < 0) {
        warnings.push('Legacy manual items/overrides were kept because no current project was selected.');
        return { migrated: false, warnings, projectSnapshot };
    }

    const current = projectSnapshot.projects[currentIndex];
    const next = { ...current };
    let canMigrate = true;
    if (manualRaw) {
        try {
            const manualItems = parseJsonValue(manualRaw, 'boq_manual_items');
            if (Array.isArray(manualItems)) next.manualItems = next.manualItems?.length ? next.manualItems : manualItems as BOMItem[];
            else {
                warnings.push('Legacy manual items were not an array and were kept for review.');
                canMigrate = false;
            }
        } catch {
            warnings.push('Legacy manual items were invalid JSON and were kept for review.');
            canMigrate = false;
        }
    }
    if (overridesRaw) {
        try {
            const overrides = parseJsonValue(overridesRaw, 'boq_bom_overrides');
            if (isRecord(overrides) && Object.values(overrides).every(value => isFiniteNumber(value) && value >= 0)) {
                next.bomQuantityOverrides = next.bomQuantityOverrides && Object.keys(next.bomQuantityOverrides).length
                    ? next.bomQuantityOverrides
                    : overrides as Record<string, number>;
            } else {
                warnings.push('Legacy overrides were not a non-negative number map and were kept for review.');
                canMigrate = false;
            }
        } catch {
            warnings.push('Legacy overrides were invalid JSON and were kept for review.');
            canMigrate = false;
        }
    }
    if (!canMigrate) return { migrated: false, warnings, projectSnapshot };
    const candidate: ProjectSnapshot = {
        projects: projectSnapshot.projects.map((project, index) => index === currentIndex ? next : project),
        currentProjectId: projectSnapshot.currentProjectId,
    };
    const errors: string[] = [];
    validateProject(next, `projects[${currentIndex}]`, errors);
    if (errors.length) {
        warnings.push(`Legacy project migration was not applied: ${errors.join('; ')}`);
        return { migrated: false, warnings, projectSnapshot };
    }
    const before = snapshotStorage(storage);
    try {
        storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify({ state: candidate, version: BACKUP_VERSION }));
        storage.removeItem('boq_manual_items');
        storage.removeItem('boq_bom_overrides');
        return { migrated: true, warnings, projectSnapshot: candidate };
    } catch (error) {
        restoreStorageSnapshot(before, storage);
        throw error;
    }
}

export function serializeProjectSnapshot(snapshot: ProjectSnapshot): string {
    return JSON.stringify({ state: snapshot, version: BACKUP_VERSION });
}

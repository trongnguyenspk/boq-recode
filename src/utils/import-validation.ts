import type { Product, StarterConfig, Brand, StarterType, Unit } from '../types';

const VALID_BRANDS: Brand[] = ['Schneider', 'Mitsubishi', 'LS', 'Hyundai'];
const VALID_STARTER_TYPES: StarterType[] = ['DOL', 'Star-Delta', 'VFD', 'Soft-Starter'];
const VALID_UNITS: Unit[] = ['Cái', 'Bộ', 'Mét'];

/**
 * Validate backup JSON structure to prevent corrupted data or XSS injection
 */
export function validateBackupJSON(backup: any): boolean {
    if (!backup || typeof backup !== 'object') return false;
    if (!backup.version || typeof backup.version !== 'string') return false;
    if (!backup.data || typeof backup.data !== 'object') return false;

    const { data } = backup;
    
    // Check specific keys in data if they exist, must be valid JSON strings
    const keysToCheck = ['commonGroups', 'logicConfig', 'library', 'templates', 'brands', 'projects', 'manualItems', 'bomOverrides'];
    for (const key of keysToCheck) {
        if (data[key] !== undefined && data[key] !== null) {
            if (typeof data[key] !== 'string') return false;
            try {
                const parsed = JSON.parse(data[key]);
                // Basic type validations on parsed data
                if (key === 'library' && !Array.isArray(parsed)) return false;
                if (key === 'brands' && !Array.isArray(parsed)) return false;
                if (key === 'templates' && (typeof parsed !== 'object' || Array.isArray(parsed))) return false;
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
export function sanitizeProduct(row: any): Product {
    const rawBrand = String(row['Brand'] || '').trim();
    // Default brand to Schneider if not in validation list
    const brand: Brand = VALID_BRANDS.includes(rawBrand as Brand) 
        ? (rawBrand as Brand) 
        : 'Schneider';

    const rawUnit = String(row['Unit'] || '').trim();
    // Default unit to Cái if not in validation list
    const unit: Unit = VALID_UNITS.includes(rawUnit as Unit)
        ? (rawUnit as Unit)
        : 'Cái';

    const price = Math.max(0, Number(row['Price'] || 0));

    return {
        id: String(row['ID'] || '').trim() || crypto.randomUUID(),
        code: String(row['Code'] || '').trim(),
        ibomCode: String(row['iBomCode'] || '').trim(),
        description: String(row['Description'] || '').trim(),
        brand,
        unit,
        price,
        matchKey: row['MatchKey'] ? String(row['MatchKey']).trim() : undefined
    };
}

/**
 * Sanitize starter config imported from Excel
 */
export function sanitizeStarter(row: any): StarterConfig {
    const rawType = String(row['Type'] || '').trim();
    const type: StarterType = VALID_STARTER_TYPES.includes(rawType as StarterType)
        ? (rawType as StarterType)
        : 'DOL';

    const rawBrand = String(row['Brand'] || '').trim();
    const brand: Brand = VALID_BRANDS.includes(rawBrand as Brand)
        ? (rawBrand as Brand)
        : 'Schneider';

    const rawIsolatorBrand = String(row['IsolatorBrand'] || '').trim();
    const isolatorBrand: Brand | undefined = VALID_BRANDS.includes(rawIsolatorBrand as Brand)
        ? (rawIsolatorBrand as Brand)
        : undefined;

    const power = Math.max(0.18, Number(row['Power'] || 0.18));
    const quantity = Math.max(1, Math.round(Number(row['Quantity'] || 1)));

    return {
        id: crypto.randomUUID(),
        type,
        power,
        quantity,
        brand,
        isolator: row['Isolator'] === 'Yes' || row['Isolator'] === true,
        isolatorBrand: row['Isolator'] === 'Yes' || row['Isolator'] === true ? (isolatorBrand || brand) : undefined,
        signals: {
            thermal: row['Thermal'] === 'Yes' || row['Thermal'] === true,
            ptc: row['PTC'] === 'Yes' || row['PTC'] === true,
            estop: row['Estop'] === 'Yes' || row['Estop'] === true,
            humidity: row['Humidity'] === 'Yes' || row['Humidity'] === true,
            isolator_BFP: row['IsolatorBFP'] === 'Yes' || row['IsolatorBFP'] === true,
            estop_BFP: row['EstopBFP'] === 'Yes' || row['EstopBFP'] === true,
        }
    };
}

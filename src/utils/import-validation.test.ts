import { describe, it, expect } from 'vitest';
import { validateBackupJSON, sanitizeProduct, sanitizeStarter } from './import-validation';

describe('Import Validation Utilities', () => {
    describe('validateBackupJSON', () => {
        it('should pass for valid backup files', () => {
            const valid = {
                version: '1.0',
                data: {
                    library: JSON.stringify([{ code: 'P1', brand: 'Schneider' }]),
                    brands: JSON.stringify(['Schneider', 'LS']),
                    templates: JSON.stringify({ DOL: {} })
                }
            };
            expect(validateBackupJSON(valid)).toBe(true);
        });

        it('should fail for missing required fields', () => {
            const invalid = {
                version: '1.0'
                // missing data
            };
            expect(validateBackupJSON(invalid)).toBe(false);
        });

        it('should fail if any sub-field contains invalid JSON', () => {
            const invalid = {
                version: '1.0',
                data: {
                    library: '{invalid_json}'
                }
            };
            expect(validateBackupJSON(invalid)).toBe(false);
        });

        it('should fail if sub-fields parsed value does not match expected types', () => {
            const invalid = {
                version: '1.0',
                data: {
                    library: JSON.stringify({ notAnArray: true }) // library must be an array
                }
            };
            expect(validateBackupJSON(invalid)).toBe(false);
        });
    });

    describe('sanitizeProduct', () => {
        it('should fallback to Schneider for invalid brands', () => {
            const row = {
                Code: 'TEST',
                Brand: 'Hacker_Brand_XSS',
                Price: 100,
                Unit: 'Cái'
            };
            const result = sanitizeProduct(row);
            expect(result.brand).toBe('Schneider');
        });

        it('should fallback to Cái for invalid units', () => {
            const row = {
                Code: 'TEST',
                Brand: 'LS',
                Unit: 'Invalid_Unit'
            };
            const result = sanitizeProduct(row);
            expect(result.unit).toBe('Cái');
        });

        it('should enforce non-negative prices', () => {
            const row = {
                Code: 'TEST',
                Price: -50
            };
            const result = sanitizeProduct(row);
            expect(result.price).toBe(0);
        });
    });

    describe('sanitizeStarter', () => {
        it('should fallback to DOL for invalid types', () => {
            const row = {
                Type: 'Invalid_Type_XSS',
                Power: 15,
                Quantity: 2
            };
            const result = sanitizeStarter(row);
            expect(result.type).toBe('DOL');
        });

        it('should enforce power >= 0.18 and quantity >= 1', () => {
            const row = {
                Type: 'VFD',
                Power: -5,
                Quantity: -10
            };
            const result = sanitizeStarter(row);
            expect(result.power).toBe(0.18);
            expect(result.quantity).toBe(1);
        });
    });
});

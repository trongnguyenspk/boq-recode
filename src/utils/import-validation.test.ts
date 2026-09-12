import { describe, it, expect } from 'vitest';
import {
    validateBackupJSON,
    sanitizeProduct,
    sanitizeStarter,
    sanitizeProductDetailed,
    sanitizeStarterDetailed,
    sanitizeStarterRows,
    parseUnknownImportDecision,
} from './import-validation';

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

        it('chấp nhận matchKeyMeta hợp lệ và từ chối kiểu sai', () => {
            const withMeta = {
                version: '1.0',
                data: {
                    matchKeyMeta: JSON.stringify({
                        MCT_100A: { matchKey: 'MCT_100A', category: 'CT', brandSensitive: false },
                    }),
                },
            };
            expect(validateBackupJSON(withMeta)).toBe(true);

            const badMeta = {
                version: '1.0',
                data: { matchKeyMeta: JSON.stringify(['not', 'an', 'object']) },
            };
            expect(validateBackupJSON(badMeta)).toBe(false);
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

        it('normalizes invisible whitespace in MatchKey', () => {
            const result = sanitizeProduct({
                Code: 'TEST',
                Brand: 'LS',
                MatchKey: '\u00a0 CONTACTOR_9A \u200b',
            });
            expect(result.matchKey).toBe('CONTACTOR_9A');
        });

        it('matches an allowed brand when Excel adds invisible boundary characters', () => {
            const result = sanitizeProduct(
                { Code: 'TEST', Brand: '\u200bOMEGA\u00a0', Unit: 'Cái' },
                ['Schneider', 'OMEGA'],
            );
            expect(result.brand).toBe('OMEGA');
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

        it('falls back to the minimum instead of leaking NaN for invalid Power', () => {
            const result = sanitizeStarter({ Type: 'DOL', Power: 'not-a-number', Quantity: 1 });
            expect(result.power).toBe(0.18);
            expect(result.powerKey).toBe('0.18');
        });

        it('normalizes invisible boundary characters before matching a custom type', () => {
            const result = sanitizeStarter(
                { Type: '\u00a0Valve\u200b', Power: 5.5, Quantity: 1 },
                ['DOL', 'Valve'],
            );
            expect(result.type).toBe('Valve');
        });
    });

    // P0-4: allowedBrands động — giữ OMEGA / brand tuỳ chỉnh, vẫn chặn brand lạ
    describe('P0-4: allowedBrands / allowedTypes động', () => {
        it('giữ brand OMEGA khi được truyền trong allowedBrands', () => {
            const row = { Code: 'MCT1', Brand: 'OMEGA', Unit: 'Cái' };
            const result = sanitizeProduct(row, ['Schneider', 'OMEGA']);
            expect(result.brand).toBe('OMEGA');
        });

        it('vẫn fallback Schneider cho brand lạ (chống injection)', () => {
            const row = { Code: 'X', Brand: 'Hacker_Brand_XSS', Unit: 'Cái' };
            const result = sanitizeProduct(row, ['Schneider', 'OMEGA']);
            expect(result.brand).toBe('Schneider');
        });

        it('giữ starter type tuỳ chỉnh khi được cho phép', () => {
            const row = { Type: 'Valve', Power: 15, Quantity: 1 };
            const result = sanitizeStarter(row, ['DOL', 'Valve']);
            expect(result.type).toBe('Valve');
        });
    });

    describe('D-07: detailed unknown-value decisions', () => {
        it('parse explicit UI decisions and treat cancel/unknown as cancel', () => {
            expect(parseUnknownImportDecision(' ADD ')).toBe('add');
            expect(parseUnknownImportDecision('fallback')).toBe('fallback');
            expect(parseUnknownImportDecision('SKIP')).toBe('skip');
            expect(parseUnknownImportDecision('')).toBe('cancel');
            expect(parseUnknownImportDecision(null)).toBe('cancel');
        });

        it('giữ brand lạ trong diff theo mặc định keep', () => {
            const result = sanitizeProductDetailed(
                { Code: 'X', Brand: 'OMEGA', Unit: 'Cái' },
                ['Schneider'],
            );
            expect(result.value?.brand).toBe('OMEGA');
            expect(result.issues).toMatchObject([{
                field: 'Brand', value: 'OMEGA', policy: 'keep', fallback: 'Schneider',
            }]);
        });

        it('skip policy bỏ dòng nhưng vẫn báo giá trị lạ và số dòng', () => {
            const result = sanitizeStarterRows(
                [{ Type: 'Valve', Brand: 'OMEGA', Power: 5.5, Quantity: 1 }],
                ['DOL'],
                ['Schneider'],
                { unknownType: 'skip', unknownBrand: 'skip' },
            );
            expect(result.records).toHaveLength(0);
            expect(result.issues).toEqual(expect.arrayContaining([
                expect.objectContaining({ field: 'Type', value: 'Valve', policy: 'skip', row: 2 }),
                expect.objectContaining({ field: 'Brand', value: 'OMEGA', policy: 'skip', row: 2 }),
            ]));
        });

        it('starter detailed sanitizer giữ type/brand/isolatorBrand lạ để caller quyết định', () => {
            const result = sanitizeStarterDetailed(
                {
                    Type: 'Valve', Brand: 'OMEGA', Isolator: 'Yes', IsolatorBrand: 'ACME',
                    Power: 5.5, Quantity: 1,
                },
                ['DOL'],
                ['Schneider'],
            );
            expect(result.value).toMatchObject({
                type: 'Valve', brand: 'OMEGA', isolator: true, isolatorBrand: 'ACME',
            });
            expect(result.issues.map(issue => issue.field)).toEqual(['Type', 'Brand', 'IsolatorBrand']);
        });
    });

    // NGU-5: tín hiệu mới isolator_estop_FB đọc từ cột Excel
    describe('NGU-5: sanitizeStarter đọc cột IsolatorEstopFB', () => {
        it('đọc IsolatorEstopFB=Yes thành true', () => {
            const row = { Type: 'DOL', Power: 5.5, Quantity: 1, IsolatorEstopFB: 'Yes' };
            expect(sanitizeStarter(row).signals.isolator_estop_FB).toBe(true);
        });

        it('mặc định false khi thiếu cột', () => {
            const row = { Type: 'DOL', Power: 5.5, Quantity: 1 };
            expect(sanitizeStarter(row).signals.isolator_estop_FB).toBe(false);
        });
    });
});

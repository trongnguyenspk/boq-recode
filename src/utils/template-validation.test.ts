import { describe, it, expect } from 'vitest';
import { validateTemplate, convertLegacyTemplate } from './template-validation';

describe('Template Validation Utilities', () => {
    describe('convertLegacyTemplate', () => {
        it('should convert legacy usage-based templates to TemplateDefinition format', () => {
            const legacyTemplate = [
                { matchKey: 'MK1', qty: 1 },
                { matchKey: 'MK2', qty: 2 }
            ];

            // Legacy templates were just arrays of components for a specific rating (e.g. 15kW)
            // But in the app logic, they were stored as Record<StarterType, Record<Rating, Component[]>>
            // The helper takes (type, legacyParams)

            const type = 'DOL';
            const legacyParams = {
                '15kW': [{ matchKey: 'MK1', qty: 1 }],
                '20kW': [{ matchKey: 'MK2', qty: 2 }]
            };

            const result = convertLegacyTemplate(type, legacyParams);

            expect(result.type).toBe('DOL');
            expect(result.ratings['15kW']).toHaveLength(1);
            expect(result.ratings['15kW'][0].matchKey).toBe('MK1');
            expect(result.ratings['20kW'][0].qty).toBe(2);
        });
    });

    describe('validateTemplate', () => {
        it('should pass for valid templates', () => {
            const validTemplate = {
                type: 'DOL',
                name: 'Test Template',
                ratings: {
                    '15kW': [{ matchKey: 'MK1', qty: 1 }]
                }
            };

            const result = validateTemplate(validTemplate);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should fail if type is missing', () => {
            const invalid = {
                name: 'Test Template',
                ratings: {}
            };

            const result = validateTemplate(invalid as any);
            expect(result.valid).toBe(false);
            expect(result.errors[0].message).toContain('Missing required field: type');
        });

        it('should fail if ratings is missing or invalid', () => {
            const invalid = {
                type: 'DOL',
                name: 'Test'
            };
            const result = validateTemplate(invalid as any);
            expect(result.valid).toBe(false);
            expect(result.errors[0].message).toContain('Missing or invalid field: ratings');
        });

        it('should fail if component lacks matchKey or qty', () => {
            const invalid = {
                type: 'DOL',
                name: 'Test',
                ratings: {
                    '15kW': [{ matchKey: 'MK1' }] // missing qty
                }
            };
            const result = validateTemplate(invalid as any);
            expect(result.valid).toBe(false);
            // The logic might push multiple errors if name/type missing, but here they are present.
            // It should fail on qty.
            // Wait, implementation checks: if (typeof c.qty !== 'number' || c.qty <= 0)
            const errorMsg = result.errors.find(e => e.path.includes('qty'))?.message;
            expect(errorMsg).toContain('Component qty must be a positive number');
        });

        it('should fail if qty is not positive', () => {
            const invalid = {
                type: 'DOL',
                name: 'Test',
                ratings: {
                    '15kW': [{ matchKey: 'MK1', qty: 0 }]
                }
            };
            const result = validateTemplate(invalid as any);
            expect(result.valid).toBe(false);
            const errorMsg = result.errors[0].message;
            expect(errorMsg).toContain('Component qty must be a positive number');
        });
    });

    // P0-1: bảo đảm `condition` không bị mất khi round-trip qua JSON editor
    describe('P0-1: condition round-trip', () => {
        it('accepts a component with a valid condition', () => {
            const tpl = {
                type: 'DOL',
                name: 'Test',
                ratings: { '5.5': [{ matchKey: 'ISO_16A', qty: 1, condition: 'isolator' }] }
            };
            expect(validateTemplate(tpl as any).valid).toBe(true);
        });

        it('rejects a component with an invalid condition', () => {
            const tpl = {
                type: 'DOL',
                name: 'Test',
                ratings: { '5.5': [{ matchKey: 'X', qty: 1, condition: 'not_a_condition' }] }
            };
            const result = validateTemplate(tpl as any);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.path.includes('condition'))).toBe(true);
        });

        it('convertLegacyTemplate preserves condition into editor format', () => {
            const legacy = { '5.5': [{ matchKey: 'ISO_16A', qty: 1, condition: 'isolator' as const }] };
            const def = convertLegacyTemplate('DOL', legacy);
            expect(def.ratings['5.5'][0].condition).toBe('isolator');
        });

        // NGU-5: điều kiện mới isolator_estop_FB phải hợp lệ
        it('accepts the new isolator_estop_FB condition', () => {
            const tpl = {
                type: 'DOL',
                name: 'Test',
                ratings: { '5.5': [{ matchKey: 'FB1', qty: 1, condition: 'isolator_estop_FB' }] }
            };
            expect(validateTemplate(tpl as any).valid).toBe(true);
        });
    });
});


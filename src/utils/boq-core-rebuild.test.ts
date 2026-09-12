import { describe, expect, it } from 'vitest';
import type { BOMItem, Product, StarterConfig } from '../types';
import {
    computeBoq,
    generateDetail,
    generateDetailWithDiagnostics,
    normalizePowerKey,
} from './boq-logic';
import { validateBOM } from './validation';

const signals = {
    thermal: false,
    ptc: false,
    estop: false,
    humidity: false,
    isolator_BFP: false,
    estop_BFP: false,
    isolator_estop_FB: false,
};

function starter(overrides: Partial<StarterConfig> = {}): StarterConfig {
    return {
        id: 'starter-1',
        type: 'DOL',
        power: 5.5,
        quantity: 2,
        brand: 'Schneider',
        isolator: false,
        signals,
        ...overrides,
    };
}

const product: Product = {
    id: 'product-id-must-not-leak',
    code: 'C-1',
    ibomCode: 'IB-C1',
    description: 'Contactor',
    brand: 'Schneider',
    unit: 'Cái',
    matchKey: 'CONTACTOR_9A',
};

describe('rebuilt BOQ core', () => {
    it('canonicalizes decimal power keys and rejects invalid values', () => {
        expect(normalizePowerKey('5.50')).toBe('5.5');
        expect(normalizePowerKey('5,5')).toBe('5.5');
        expect(normalizePowerKey(5.5)).toBe('5.5');
        expect(normalizePowerKey('-1')).toBeUndefined();
        expect(normalizePowerKey('not-a-power')).toBeUndefined();
    });

    it('uses canonical power lookup and multiplies quantity exactly once', () => {
        const result = generateDetail(
            [starter()],
            [product],
            { DOL: { '5.50': [{ matchKey: 'CONTACTOR_9A', qty: 3 }] } },
        );
        expect(result).toHaveLength(1);
        expect(result[0].quantity).toBe(6);
    });

    it('keeps duplicate matchKey lines independent and IDs product-independent', () => {
        const templates = {
            DOL: {
                '5.5': [
                    { id: 'line-always', matchKey: 'CONTACTOR_9A', qty: 1 },
                    { id: 'line-thermal', matchKey: 'CONTACTOR_9A', qty: 2, condition: 'thermal' },
                ],
            },
        };
        const rows = generateDetail([starter({ quantity: 1 })], [product], templates);
        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe('generated:starter-1:line-always');

        const rowsWithSignal = generateDetail([starter({ quantity: 1, signals: { ...signals, thermal: true } })], [product], templates);
        expect(rowsWithSignal.map(row => row.id)).toEqual([
            'generated:starter-1:line-always',
            'generated:starter-1:line-thermal',
        ]);
        expect(rowsWithSignal.every(row => !row.id.includes(product.id))).toBe(true);
    });

    it('keeps array-backed product lookup deterministic for duplicate brand variants', () => {
        const first = { ...product, id: 'without-ibom', ibomCode: undefined, code: 'C-0' };
        const preferred = { ...product, id: 'with-ibom', ibomCode: 'IB-C1', code: 'C-1' };
        const templates = { DOL: { '5.5': [{ matchKey: 'CONTACTOR_9A', qty: 1 }] } };

        const forward = generateDetail([starter({ quantity: 1 })], [first, preferred], templates);
        const reversed = generateDetail([starter({ quantity: 1 })], [preferred, first], templates);

        expect(forward[0].productCode).toBe('C-1');
        expect(reversed).toEqual(forward);
    });

    it('reports malformed template lines instead of throwing', () => {
        const malformed = { DOL: { '5.5': [null] } } as any;
        const result = generateDetailWithDiagnostics([starter({ quantity: 1 })], [product], malformed);

        expect(result.detail).toHaveLength(0);
        expect(result.diagnostics.some(item => item.code === 'INVALID_TEMPLATE_LINE')).toBe(true);
    });

    it('assigns deterministic fallback IDs to legacy lines', () => {
        const templates = { DOL: { '5.5': [{ matchKey: 'CONTACTOR_9A', qty: 1 }, { matchKey: 'CONTACTOR_9A', qty: 1 }] } };
        const first = generateDetail([starter({ quantity: 1 })], [product], templates);
        const second = generateDetail([starter({ quantity: 1 })], [{ ...product, id: 'different-product-id' }], templates);
        expect(first.map(row => row.id)).toEqual([
            'generated:starter-1:legacy:DOL:5.5:0',
            'generated:starter-1:legacy:DOL:5.5:1',
        ]);
        expect(second.map(row => row.id)).toEqual(first.map(row => row.id));
    });

    it('returns missing template and product diagnostics for export blocking', () => {
        const missingTemplate = computeBoq({ products: [product], templates: {} }, { starters: [starter()] });
        expect(missingTemplate.diagnostics.some(item => item.code === 'MISSING_TEMPLATE')).toBe(true);
        expect(missingTemplate.validation.isValid).toBe(false);
        expect(missingTemplate.issues.some(item => item.code === 'MISSING_TEMPLATE')).toBe(true);

        const missingProduct = generateDetailWithDiagnostics(
            [starter()],
            [],
            { DOL: { '5.5': [{ matchKey: 'CONTACTOR_9A', qty: 1 }] } },
        );
        expect(missingProduct.detail[0].productCode).toBe('NOT_FOUND');
        expect(missingProduct.diagnostics[0].code).toBe('MISSING_PRODUCT');
        expect(validateBOM(missingProduct.detail, [starter()], missingProduct.diagnostics).isValid).toBe(false);
    });

    it('keeps valid rows when another starter has no template, while blocking export', () => {
        const configured = starter({ id: 'configured', power: 5.5, quantity: 1 });
        const missing = starter({ id: 'missing-template', power: 7.5, quantity: 1 });
        const result = computeBoq(
            { products: [product], templates: { DOL: { '5.5': [{ matchKey: 'CONTACTOR_9A', qty: 1 }] } } },
            { starters: [configured, missing] },
        );

        expect(result.detail).toHaveLength(1);
        expect(result.detail[0].starterId).toBe('configured');
        expect(result.diagnostics).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'MISSING_TEMPLATE', starterId: 'missing-template', powerKey: '7.5' }),
        ]));
        expect(result.validation.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'MISSING_TEMPLATE', starterId: 'missing-template' }),
        ]));
        expect(result.validation.isValid).toBe(false);
    });

    it('keeps a missing-product repair row out of summary while retaining resolved rows', () => {
        const result = computeBoq(
            {
                products: [product],
                templates: {
                    DOL: {
                        '5.5': [
                            { id: 'known', matchKey: 'CONTACTOR_9A', qty: 1 },
                            { id: 'unknown', matchKey: 'UNKNOWN_COMPONENT', qty: 2 },
                        ],
                    },
                },
            },
            { starters: [starter({ quantity: 1 })] },
        );

        expect(result.detail.map(item => item.productCode)).toEqual(['C-1', 'NOT_FOUND']);
        expect(result.summary).toHaveLength(1);
        expect(result.summary[0].productCode).toBe('C-1');
        expect(result.validation.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'MISSING_PRODUCT', matchKey: 'UNKNOWN_COMPONENT' }),
        ]));
        expect(result.validation.isValid).toBe(false);
    });

    it('does not use a shared synthetic iBom when both product code and iBom are empty', () => {
        const products: Product[] = [
            { ...product, id: 'no-ident-1', code: '', ibomCode: undefined, matchKey: 'UNIDENTIFIED_A', description: 'Unidentified A' },
            { ...product, id: 'no-ident-2', code: '', ibomCode: undefined, matchKey: 'UNIDENTIFIED_B', description: 'Unidentified B' },
        ];
        const result = computeBoq(
            {
                products,
                templates: {
                    DOL: {
                        '5.5': [
                            { id: 'a', matchKey: 'UNIDENTIFIED_A', qty: 1 },
                            { id: 'b', matchKey: 'UNIDENTIFIED_B', qty: 1 },
                        ],
                    },
                },
            },
            { starters: [starter({ quantity: 1 })] },
        );

        expect(result.detail.map(item => item.ibomCode)).toEqual(['', '']);
        expect(result.summary.map(item => item.description)).toEqual(['Unidentified A', 'Unidentified B']);
    });

    it('applies overrides only to generated/common rows and reports manual targets', () => {
        const manual: BOMItem = {
            id: 'manual-1',
            starterId: 'manual',
            starterName: 'Manual',
            ibomCode: 'IB-MANUAL',
            productCode: 'MANUAL-1',
            description: 'Manual item',
            brand: 'Schneider',
            unit: 'Cái',
            quantity: 9,
            source: 'manual',
        };
        const result = computeBoq(
            { products: [product], templates: { DOL: { '5.5': [{ id: 'line-1', matchKey: 'CONTACTOR_9A', qty: 1 }] } } },
            {
                starters: [starter({ quantity: 2 })],
                manualItems: [manual],
                bomQuantityOverrides: {
                    'generated:starter-1:line-1': 3.5,
                    'manual-1': 1,
                },
            },
        );

        expect(result.detail.find(item => item.id === 'generated:starter-1:line-1')?.quantity).toBe(3.5);
        expect(result.detail.find(item => item.id === 'manual-1')?.quantity).toBe(9);
        expect(result.diagnostics).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'MANUAL_QUANTITY_OVERRIDE', severity: 'warning' }),
        ]));
        expect(result.validation.isValid).toBe(true);
    });

    it('reports invalid orphan overrides instead of silently ignoring them', () => {
        const result = computeBoq(
            { products: [product], templates: { DOL: { '5.5': [{ matchKey: 'CONTACTOR_9A', qty: 1 }] } } },
            { starters: [starter({ quantity: 1 })], bomQuantityOverrides: { 'missing-line': -1 } },
        );

        expect(result.diagnostics).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'INVALID_QUANTITY_OVERRIDE', templateLineId: 'missing-line' }),
            expect.objectContaining({ code: 'ORPHAN_QUANTITY_OVERRIDE', templateLineId: 'missing-line' }),
        ]));
        expect(result.validation.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'INVALID_QUANTITY_OVERRIDE' }),
        ]));
        expect(result.validation.isValid).toBe(false);
    });

    it('blocks duplicate starter IDs and duplicate generated BOM IDs', () => {
        const duplicate = starter({ id: 'duplicate-id', quantity: 1 });
        const result = computeBoq(
            { products: [product], templates: { DOL: { '5.5': [{ id: 'line-1', matchKey: 'CONTACTOR_9A', qty: 1 }] } } },
            { starters: [duplicate, { ...duplicate }] },
        );

        expect(result.detail.map(item => item.id)).toEqual([
            'generated:duplicate-id:line-1',
            'generated:duplicate-id:line-1',
        ]);
        expect(result.validation.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'DUPLICATE_STARTER_ID', starterId: 'duplicate-id' }),
            expect.objectContaining({ code: 'DUPLICATE_BOM_ID', starterId: 'duplicate-id' }),
        ]));
        expect(result.validation.isValid).toBe(false);
    });

    it('blocks negative manual BOM quantities while retaining the source row for diagnosis', () => {
        const result = computeBoq(
            { products: [product], templates: {} },
            {
                starters: [],
                manualItems: [{
                    id: 'manual-negative',
                    starterId: 'manual',
                    starterName: 'Manual',
                    ibomCode: 'IB-MANUAL',
                    productCode: 'MANUAL-1',
                    description: 'Manual item',
                    brand: 'Schneider',
                    unit: 'Cái',
                    quantity: -1,
                    source: 'manual',
                }],
            },
        );

        expect(result.detail).toHaveLength(1);
        expect(result.summary).toHaveLength(0);
        expect(result.validation.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'INVALID_BOM_QUANTITY', matchKey: undefined }),
        ]));
        expect(result.validation.isValid).toBe(false);
    });

    it('warns for identical unnamed starters and ignores different load names', () => {
        const duplicateA = starter({ id: 'a' });
        const duplicateB = starter({ id: 'b' });
        const differentName = starter({ id: 'c', loadName: 'Pump 2' });
        const duplicateResult = validateBOM([], [duplicateA, duplicateB]);
        expect(duplicateResult.warnings.some(item => item.code === 'DUPLICATE_STARTER')).toBe(true);
        const differentResult = validateBOM([], [duplicateA, differentName]);
        expect(differentResult.warnings.some(item => item.code === 'DUPLICATE_STARTER')).toBe(false);
    });
});

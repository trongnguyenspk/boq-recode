import { describe, it, expect } from 'vitest';
import { generateSummary, generateDetail, createLibraryIndex } from './boq-logic';
import type { BOMItem, StarterConfig, Product } from '../types';

describe('generateSummary', () => {
    it('keeps distinct variants (different ibomCode) that share the same productCode as separate rows', () => {
        // Regression test for the bug where the Summary sheet showed only the "50A" MCCB
        // (qty 5) while the "100A" MCCB disappeared entirely, because both share the same
        // productCode "NF125-CV" and generateSummary used to key solely on productCode.
        const bom: BOMItem[] = [
            {
                id: 'starter1-p1-MCCB_3P_50', starterId: 'starter1', starterName: 'SoftStart - 15kW',
                ibomCode: 'NF125-CV-3P-50', productCode: 'NF125-CV', description: 'MCCB 3P 50A 10kA',
                brand: 'Mitsubishi', unit: 'Cái', quantity: 3, matchKey: 'MCCB_3P_50'
            },
            {
                id: 'starter2-p2-MCCB_3P_100', starterId: 'starter2', starterName: 'LOAD - 37kW',
                ibomCode: 'NF125-CV-3P-100', productCode: 'NF125-CV', description: 'MCCB 3P 100A 10kA',
                brand: 'Mitsubishi', unit: 'Cái', quantity: 2, matchKey: 'MCCB_3P_100'
            },
        ];

        const summary = generateSummary(bom);

        expect(summary).toHaveLength(2);

        const item50A = summary.find(s => s.ibomCode === 'NF125-CV-3P-50');
        const item100A = summary.find(s => s.ibomCode === 'NF125-CV-3P-100');

        expect(item50A?.totalQuantity).toBe(3);
        expect(item50A?.description).toBe('MCCB 3P 50A 10kA');
        expect(item100A?.totalQuantity).toBe(2);
        expect(item100A?.description).toBe('MCCB 3P 100A 10kA');
    });

    it('still merges the same variant (same ibomCode) used by multiple starters', () => {
        const bom: BOMItem[] = [
            { id: 'a', starterId: 's1', starterName: 'A', ibomCode: 'NF125-CV-3P-50', productCode: 'NF125-CV', description: 'MCCB 3P 50A 10kA', brand: 'Mitsubishi', unit: 'Cái', quantity: 2 },
            { id: 'b', starterId: 's2', starterName: 'B', ibomCode: 'NF125-CV-3P-50', productCode: 'NF125-CV', description: 'MCCB 3P 50A 10kA', brand: 'Mitsubishi', unit: 'Cái', quantity: 4 },
        ];

        const summary = generateSummary(bom);

        expect(summary).toHaveLength(1);
        expect(summary[0].totalQuantity).toBe(6);
    });

    it('falls back to merging by productCode when ibomCode is empty', () => {
        const bom: BOMItem[] = [
            { id: 'c', starterId: 'common', starterName: 'Common', ibomCode: '', productCode: 'CABLE-1', description: 'Cable 1', brand: 'X', unit: 'Mét', quantity: 5 },
            { id: 'd', starterId: 'common', starterName: 'Common', ibomCode: '', productCode: 'CABLE-1', description: 'Cable 1', brand: 'X', unit: 'Mét', quantity: 7 },
        ];

        const summary = generateSummary(bom);

        expect(summary).toHaveLength(1);
        expect(summary[0].totalQuantity).toBe(12);
    });
});

// NGU-5: tín hiệu mới Isolator/Estop Feedback lọc đúng trong generateDetail
describe('generateDetail — điều kiện isolator_estop_FB', () => {
    const baseSignals = {
        thermal: false, ptc: false, estop: false, humidity: false,
        isolator_BFP: false, estop_BFP: false, isolator_estop_FB: false,
    };
    const library: Product[] = [
        { id: 'p1', code: 'FB-RELAY-01', ibomCode: 'IBOM-FB', description: 'Feedback relay', brand: 'Schneider', unit: 'Cái', matchKey: 'FB_RELAY' },
    ];
    const templates = { DOL: { '5.5': [{ matchKey: 'FB_RELAY', qty: 1, condition: 'isolator_estop_FB' as const }] } };
    const makeStarter = (fb: boolean): StarterConfig => ({
        id: 's1', type: 'DOL', power: 5.5, quantity: 1, brand: 'Schneider',
        isolator: false, signals: { ...baseSignals, isolator_estop_FB: fb },
    });

    it('gồm linh kiện khi bật tín hiệu', () => {
        const bom = generateDetail([makeStarter(true)], library, templates);
        expect(bom).toHaveLength(1);
        expect(bom[0].matchKey).toBe('FB_RELAY');
        expect(bom[0].productCode).toBe('FB-RELAY-01');
    });

    it('loại linh kiện khi tắt tín hiệu', () => {
        const bom = generateDetail([makeStarter(false)], library, templates);
        expect(bom).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Brand model (PLAN-BRAND-MODEL-2026-09-11) — nhóm B
// Chốt 11/09/2026: chọn Brand CHỈ ảnh hưởng CB / contactor / relay nhiệt / Isolator.
// Mọi thiết bị khác giữ brand của bản ghi trong Product Library.
// ---------------------------------------------------------------------------
describe('generateDetail — brand model', () => {
    const signals = {
        thermal: false, ptc: false, estop: false, humidity: false,
        isolator_BFP: false, estop_BFP: false, isolator_estop_FB: false,
    };

    const library: Product[] = [
        { id: 'mct-100', code: '', ibomCode: 'MCT_100-5', description: 'MCT 100/5', brand: 'OMEGA', unit: 'Cái', matchKey: 'MCT_100A' },
        { id: 'sch-c-09', code: 'LC1D09', ibomCode: 'IB-SCH-C09', description: 'Contactor 9A', brand: 'Schneider', unit: 'Cái', matchKey: 'CONTACTOR_9A' },
        { id: 'mit-c-09', code: 'S-T10', ibomCode: 'IB-MIT-C09', description: 'Contactor 10A', brand: 'Mitsubishi', unit: 'Cái', matchKey: 'CONTACTOR_9A' },
        { id: 'iso-ls', code: 'LS-ISO-16', ibomCode: 'IB-ISO-LS', description: 'Isolator 16A LS', brand: 'LS', unit: 'Cái', matchKey: 'ISOLATOR_16A' },
        { id: 'iso-sch', code: 'Vario-16', ibomCode: 'IB-ISO-SCH', description: 'Isolator 16A Schneider', brand: 'Schneider', unit: 'Cái', matchKey: 'ISOLATOR_16A' },
        { id: 'vfd-sch', code: 'ATV320', ibomCode: 'IB-VFD', description: 'VFD 5.5kW', brand: 'Schneider', unit: 'Cái', matchKey: 'VFD_5.5KW' },
        { id: 'cb-ls', code: 'LS-CB-100', ibomCode: 'IB-CB-LS', description: 'CB 100A LS', brand: 'LS', unit: 'Cái', matchKey: 'CB_100A' },
        { id: 'cb-sch', code: 'SCH-CB-100', ibomCode: 'IB-CB-SCH', description: 'CB 100A Schneider', brand: 'Schneider', unit: 'Cái', matchKey: 'CB_100A' },
    ];

    const templates = {
        DOL: {
            '5.5': [
                { matchKey: 'CONTACTOR_9A', qty: 1 },
                { matchKey: 'MCT_100A', qty: 3 },
                { matchKey: 'VFD_5.5KW', qty: 1 },
                { matchKey: 'ISOLATOR_16A', qty: 1 },
                { matchKey: 'CB_100A', qty: 1 },
            ],
        },
    };

    const makeStarter = (brand: string, isolatorBrand?: string): StarterConfig => ({
        id: 's1', type: 'DOL', power: 5.5, quantity: 1, brand,
        isolator: !!isolatorBrand, isolatorBrand, signals,
    });

    const brandOf = (bom: BOMItem[], key: string) => bom.find(i => i.matchKey === key)?.brand;

    it('B1: MCT giữ brand OMEGA dù starter chọn Schneider', () => {
        const bom = generateDetail([makeStarter('Schneider')], library, templates);
        expect(brandOf(bom, 'MCT_100A')).toBe('OMEGA');
    });

    it('B2: đổi brand starter CHỈ đổi thiết bị đóng cắt', () => {
        const sch = generateDetail([makeStarter('Schneider')], library, templates);
        const mit = generateDetail([makeStarter('Mitsubishi')], library, templates);

        // Đi theo brand
        expect(brandOf(sch, 'CONTACTOR_9A')).toBe('Schneider');
        expect(brandOf(mit, 'CONTACTOR_9A')).toBe('Mitsubishi');

        // KHÔNG đổi
        expect(brandOf(sch, 'MCT_100A')).toBe('OMEGA');
        expect(brandOf(mit, 'MCT_100A')).toBe('OMEGA');
        expect(brandOf(sch, 'VFD_5.5KW')).toBe(brandOf(mit, 'VFD_5.5KW'));
    });

    it('B3: isolator lấy isolatorBrand dù condition không phải "isolator" (lỗi M4)', () => {
        const bom = generateDetail([makeStarter('Schneider', 'LS')], library, templates);
        expect(brandOf(bom, 'ISOLATOR_16A')).toBe('LS');
        expect(bom.find(i => i.matchKey === 'ISOLATOR_16A')?.productCode).toBe('LS-ISO-16');
    });

    it('B4: kết quả tất định khi đảo thứ tự mảng library', () => {
        const forward = generateDetail([makeStarter('Schneider')], createLibraryIndex(library), templates);
        const reversed = generateDetail([makeStarter('Schneider')], createLibraryIndex([...library].reverse()), templates);
        expect(reversed).toEqual(forward);
    });

    it('B5: thiếu brand đang chọn ⇒ NOT_FOUND, KHÔNG rơi về brand khác', () => {
        const bom = generateDetail([makeStarter('Hyundai')], library, templates);
        const row = bom.find(i => i.matchKey === 'CONTACTOR_9A');
        expect(row?.productCode).toBe('NOT_FOUND');
        expect(row?.brand).toBe('Hyundai');
    });

    it('B6: món brand-agnostic không tìm thấy ⇒ nhãn hiệu "—", không phải "Any"', () => {
        const bom = generateDetail(
            [makeStarter('Schneider')],
            [] as Product[],
            { DOL: { '5.5': [{ matchKey: 'MCT_100A', qty: 1 }] } }
        );
        expect(bom[0].brand).toBe('—');
    });

    it('B7: meta rỗng ⇒ kết quả y hệt khi truyền meta suy luận sẵn', () => {
        const meta = {
            MCT_100A: { matchKey: 'MCT_100A', category: 'CT' as const, brandSensitive: false },
            CONTACTOR_9A: { matchKey: 'CONTACTOR_9A', category: 'CONTACTOR' as const, brandSensitive: true },
        };
        const withoutMeta = generateDetail([makeStarter('Schneider')], library, templates);
        const withMeta = generateDetail([makeStarter('Schneider')], library, templates, meta);
        expect(withMeta).toEqual(withoutMeta);
    });

    it('B8: VFD giữ brand trong Product Library (chốt Q1)', () => {
        const bom = generateDetail([makeStarter('Mitsubishi')], library, templates);
        expect(brandOf(bom, 'VFD_5.5KW')).toBe('Schneider');
        expect(bom.find(i => i.matchKey === 'VFD_5.5KW')?.productCode).toBe('ATV320');
    });

    it('B9: CB_ (tiền tố từng bị sót) nay đi theo brand starter', () => {
        expect(brandOf(generateDetail([makeStarter('LS')], library, templates), 'CB_100A')).toBe('LS');
        expect(brandOf(generateDetail([makeStarter('Schneider')], library, templates), 'CB_100A')).toBe('Schneider');
    });

    it('B10: meta ghi đè được — ép MCT đi theo brand', () => {
        const meta = { MCT_100A: { matchKey: 'MCT_100A', category: 'CT' as const, brandSensitive: true } };
        const bom = generateDetail([makeStarter('Schneider')], library, templates, meta);
        expect(bom.find(i => i.matchKey === 'MCT_100A')?.productCode).toBe('NOT_FOUND');
    });
});

describe('createLibraryIndex — tất định & conflicts', () => {
    const dup: Product[] = [
        { id: 'a', code: 'A', ibomCode: 'IB-A', description: 'MCT A', brand: 'Schneider', unit: 'Cái', matchKey: 'MCT_50A' },
        { id: 'b', code: 'B', ibomCode: 'IB-B', description: 'MCT B', brand: 'OMEGA', unit: 'Cái', matchKey: 'MCT_50A' },
        { id: 'c', code: 'C', ibomCode: 'IB-C', description: 'Contactor', brand: 'Schneider', unit: 'Cái', matchKey: 'CONTACTOR_9A' },
        { id: 'd', code: 'D', ibomCode: 'IB-D', description: 'Contactor', brand: 'LS', unit: 'Cái', matchKey: 'CONTACTOR_9A' },
    ];

    it('byKey chọn cùng bản ghi bất kể thứ tự mảng', () => {
        const a = createLibraryIndex(dup).byKey.get('MCT_50A');
        const b = createLibraryIndex([...dup].reverse()).byKey.get('MCT_50A');
        expect(a?.id).toBe(b?.id);
    });

    it('báo conflict cho matchKey brand-agnostic có nhiều bản ghi', () => {
        const index = createLibraryIndex(dup);
        expect(index.conflicts).toContain('MCT_50A');
        // CONTACTOR_9A có 2 brand là ĐÚNG — không phải conflict.
        expect(index.conflicts).not.toContain('CONTACTOR_9A');
    });

    it('byKeyAll gom đủ bản ghi cùng key', () => {
        expect(createLibraryIndex(dup).byKeyAll.get('CONTACTOR_9A')).toHaveLength(2);
    });
});

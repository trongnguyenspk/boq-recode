import { describe, it, expect } from 'vitest';
import {
    inferCategory,
    isBrandSensitive,
    categoryOf,
    seedMeta,
    pickPreferredProduct,
    LEGACY_SWITCHING_PREFIXES,
} from './brand-policy';
import type { MatchKeyMetaMap, Product } from '../types';
import { PRODUCT_LIBRARY, STARTER_TEMPLATES } from '../data/library';

// Bản sao NGUYÊN VĂN của hàm isSwitchingDevice cũ trong boq-logic.ts (đã bị xoá ở pha 2).
// Dùng để chứng minh không hồi quy trên tập matchKey đang có thật.
function legacyIsSwitchingDevice(matchKey: string): boolean {
    return LEGACY_SWITCHING_PREFIXES.some(prefix => matchKey.startsWith(prefix));
}

describe('brand-policy · inferCategory', () => {
    it('A1: nhận diện breaker', () => {
        expect(inferCategory('MCCB_3P_50')).toBe('BREAKER');
        expect(inferCategory('MCB_32A')).toBe('BREAKER');
    });

    it('A2: nhận diện biến dòng', () => {
        expect(inferCategory('MCT_100A')).toBe('CT');
        expect(inferCategory('PCT_250A')).toBe('CT');
    });

    it('phân biệt ISOLATOR_ và ISO_ (hai tiền tố khác nhau)', () => {
        // 'ISOLATOR_16A'.startsWith('ISO_') === false — đây chính là lỗi M4 cũ.
        expect('ISOLATOR_16A'.startsWith('ISO_')).toBe(false);
        expect(inferCategory('ISOLATOR_16A')).toBe('ISOLATOR');
        expect(inferCategory('ISO_16A')).toBe('ISOLATOR');
    });

    it('không nhầm MCCB_/MCB_ thành CB_', () => {
        expect(inferCategory('MCCB_40A')).toBe('BREAKER');
        expect(inferCategory('CB_100A')).toBe('BREAKER');
    });
});

describe('brand-policy · isBrandSensitive', () => {
    it('A3: MCT/PCT KHÔNG phụ thuộc nhãn hiệu', () => {
        expect(isBrandSensitive('MCT_100A', {})).toBe(false);
        expect(isBrandSensitive('PCT_400A', {})).toBe(false);
    });

    it('A4: contactor / relay nhiệt / breaker / isolator CÓ phụ thuộc nhãn hiệu', () => {
        expect(isBrandSensitive('CONTACTOR_9A', {})).toBe(true);
        expect(isBrandSensitive('THERMAL_9A', {})).toBe(true);
        expect(isBrandSensitive('MCB_32A', {})).toBe(true);
        expect(isBrandSensitive('ISOLATOR_16A', {})).toBe(true);
    });

    it('A5: meta ghi đè được suy luận theo tên', () => {
        const meta: MatchKeyMetaMap = {
            MCT_100A: { matchKey: 'MCT_100A', category: 'CT', brandSensitive: true },
            CONTACTOR_9A: { matchKey: 'CONTACTOR_9A', category: 'CONTACTOR', brandSensitive: false },
        };
        expect(isBrandSensitive('MCT_100A', meta)).toBe(true);
        expect(isBrandSensitive('CONTACTOR_9A', meta)).toBe(false);
    });

    it('A6: trùng khít hàm isSwitchingDevice cũ trên tập matchKey đang có thật', () => {
        const keys = new Set<string>();
        PRODUCT_LIBRARY.forEach(p => { if (p.matchKey) keys.add(p.matchKey); });
        Object.values(STARTER_TEMPLATES).forEach(byPower => {
            Object.values(byPower).forEach(items => {
                items.forEach(item => keys.add(item.matchKey));
            });
        });

        expect(keys.size).toBeGreaterThan(0);
        keys.forEach(key => {
            expect(isBrandSensitive(key, {})).toBe(legacyIsSwitchingDevice(key));
        });
    });

    it('A7: VFD / Soft-starter KHÔNG phụ thuộc nhãn hiệu (chốt Q1)', () => {
        expect(isBrandSensitive('VFD_5.5KW', {})).toBe(false);
        expect(isBrandSensitive('SOFT_STARTER_11KW', {})).toBe(false);
    });

    it('A8: các tiền tố breaker từng bị sót nay CÓ phụ thuộc nhãn hiệu', () => {
        // Thay đổi hành vi CÓ CHỦ ĐÍCH so với whitelist 7 tiền tố cũ.
        ['CB_100A', 'ACB_1600A', 'ELCB_63A', 'RCCB_40A', 'MPCB_16A'].forEach(key => {
            expect(legacyIsSwitchingDevice(key)).toBe(false);   // trước: bị bỏ sót
            expect(isBrandSensitive(key, {})).toBe(true);       // nay: đúng
        });
    });

    it('A9: so khớp không phân biệt hoa/thường', () => {
        expect(isBrandSensitive('contactor_9a', {})).toBe(true);
        expect(isBrandSensitive('mct_100a', {})).toBe(false);
        expect(categoryOf('mccb_3p_50')).toBe('BREAKER');
    });

    it('A10: phụ kiện điều khiển KHÔNG phụ thuộc nhãn hiệu', () => {
        expect(isBrandSensitive('ESTOP', {})).toBe(false);
        expect(isBrandSensitive('TIMER_STAR_DELTA', {})).toBe(false);
    });

    it('metadata lookup normalizes whitespace/case before falling back to name inference', () => {
        const meta: MatchKeyMetaMap = {
            '\u00a0custom_device\u200b': {
                matchKey: '\u00a0custom_device\u200b',
                category: 'CONTACTOR',
                brandSensitive: true,
            },
        };

        expect(categoryOf('CUSTOM_DEVICE', meta)).toBe('CONTACTOR');
        expect(isBrandSensitive(' CUSTOM_DEVICE ', meta)).toBe(true);
    });
});

describe('brand-policy · seedMeta', () => {
    it('gom đủ matchKey từ cả library lẫn templates', () => {
        const extraTemplates = {
            DOL: { '0.75': [{ matchKey: 'MCT_25A', qty: 1 }, { matchKey: 'CB_63A', qty: 1 }] },
        };
        const meta = seedMeta(PRODUCT_LIBRARY, extraTemplates);

        // Chỉ có trong templates, chưa có trong library — vẫn phải được seed.
        expect(meta['MCT_25A']).toBeDefined();
        expect(meta['MCT_25A'].brandSensitive).toBe(false);
        expect(meta['CB_63A'].brandSensitive).toBe(true);

        // Có trong library.
        expect(meta['CONTACTOR_9A'].brandSensitive).toBe(true);
        expect(meta['MCT_100A'].category).toBe('CT');
        expect(meta['MCT_100A'].brandSensitive).toBe(false);
    });

    it('seedMeta chạy được khi không truyền templates', () => {
        const meta = seedMeta(PRODUCT_LIBRARY);
        expect(Object.keys(meta).length).toBeGreaterThan(0);
        expect(meta['ESTOP'].brandSensitive).toBe(false);
    });
});

describe('brand-policy · pickPreferredProduct', () => {
    const a: Product = { id: 'z', code: 'AAA', description: 'a', brand: 'Schneider', unit: 'Cái', matchKey: 'K' };
    const b: Product = { id: 'a', code: 'BBB', ibomCode: 'IB-1', description: 'b', brand: 'OMEGA', unit: 'Cái', matchKey: 'K' };
    const c: Product = { id: 'm', code: 'CCC', ibomCode: 'IB-2', description: 'c', brand: 'Mitsubishi', unit: 'Cái', matchKey: 'K' };

    it('ưu tiên bản ghi có ibomCode, rồi brand A→Z — không phụ thuộc thứ tự mảng', () => {
        expect(pickPreferredProduct([a, b, c])?.id).toBe('m'); // Mitsubishi < OMEGA
        expect(pickPreferredProduct([c, b, a])?.id).toBe('m');
        expect(pickPreferredProduct([b, a, c])?.id).toBe('m');
    });

    it('trả undefined với mảng rỗng', () => {
        expect(pickPreferredProduct([])).toBeUndefined();
    });
});

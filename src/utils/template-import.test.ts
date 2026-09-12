import { describe, it, expect } from 'vitest';
import { parseTemplateRows, mergeTemplates, mergeTemplatesWithReport, untouchedTiers, type TemplateMap } from './excel-import';
import { normalizeCondition, VALID_CONDITIONS } from './template-validation';
import { sanitizeStarter } from './import-validation';

// ---------------------------------------------------------------------------
// P3 — Condition đọc từ Excel phải được KIỂM TRA, không ép kiểu trần.
// Condition sai làm linh kiện im lặng biến mất khỏi BOQ (cùng họ lỗi P0-1).
// ---------------------------------------------------------------------------
describe('normalizeCondition', () => {
    it('chấp nhận mọi giá trị trong VALID_CONDITIONS', () => {
        VALID_CONDITIONS.forEach(c => expect(normalizeCondition(c)).toBe(c));
    });

    it('ô trống ⇒ always', () => {
        expect(normalizeCondition('')).toBe('always');
        expect(normalizeCondition(undefined)).toBe('always');
        expect(normalizeCondition('  ')).toBe('always');
    });

    it('không phân biệt hoa/thường và tự trim', () => {
        expect(normalizeCondition('  Thermal ')).toBe('thermal');
        expect(normalizeCondition('ISOLATOR_BFP')).toBe('isolator_BFP');
    });

    it('gõ sai ⇒ undefined (để caller chặn)', () => {
        expect(normalizeCondition('themal')).toBeUndefined();
        expect(normalizeCondition('isolator_bfp_x')).toBeUndefined();
    });
});

describe('parseTemplateRows', () => {
    const good = [
        { StarterType: 'DOL', Power: 5.5, ComponentMatchKey: 'CONTACTOR_9A', Quantity: 1, Condition: 'always' },
        { StarterType: 'DOL', Power: 5.5, ComponentMatchKey: 'THERMAL_9A', Quantity: 1, Condition: 'thermal' },
    ];

    it('đọc đúng và gom theo mức (type, power)', () => {
        const { templates, report } = parseTemplateRows(good);
        expect(templates.DOL['5.5']).toHaveLength(2);
        expect(report.tiers).toEqual([{ type: 'DOL', power: '5.5', count: 2 }]);
        expect(report.invalidConditions).toHaveLength(0);
    });

    it('PowerKey normalized from decimal strings and comma separators', () => {
        const { templates, report } = parseTemplateRows([
            { StarterType: 'DOL', Power: '5.50', ComponentMatchKey: 'A', Quantity: 1 },
            { StarterType: 'DOL', Power: '5,5', ComponentMatchKey: 'B', Quantity: 1 },
        ]);
        expect(Object.keys(templates.DOL)).toEqual(['5.5']);
        expect(templates.DOL['5.5'].map(c => c.matchKey)).toEqual(['A', 'B']);
        expect(report.tiers).toEqual([{ type: 'DOL', power: '5.5', count: 2 }]);
    });

    it('Condition gõ sai ⇒ vào invalidConditions kèm SỐ DÒNG, không lọt vào template', () => {
        const { templates, report } = parseTemplateRows([
            ...good,
            { StarterType: 'DOL', Power: 5.5, ComponentMatchKey: 'PTC_RELAY', Quantity: 1, Condition: 'themal' },
        ]);
        expect(report.invalidConditions).toHaveLength(1);
        expect(report.invalidConditions[0]).toMatchObject({ row: 4, matchKey: 'PTC_RELAY', condition: 'themal' });
        expect(templates.DOL['5.5'].some(c => c.matchKey === 'PTC_RELAY')).toBe(false);
    });

    it('dòng thiếu khoá ⇒ đếm vào skipped', () => {
        const { report } = parseTemplateRows([{ StarterType: 'DOL', Quantity: 1 }, ...good]);
        expect(report.skipped).toBe(1);
    });

    it('Quantity không hợp lệ ⇒ về 1 và có báo cáo', () => {
        const { templates, report } = parseTemplateRows([
            { StarterType: 'DOL', Power: 5.5, ComponentMatchKey: 'CONTACTOR_9A', Quantity: -3 },
        ]);
        expect(templates.DOL['5.5'][0].qty).toBe(1);
        expect(report.fixedQuantities).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// P1 — "vắng mặt = xoá" là hành vi nguy hiểm nhất của pipeline cũ.
// ---------------------------------------------------------------------------
describe('mergeTemplates — vắng mặt KHÔNG có nghĩa là xoá', () => {
    const current: TemplateMap = {
        DOL: {
            '0.18': [{ matchKey: 'CONTACTOR_9A', qty: 1 }],
            '5.5': [{ matchKey: 'CONTACTOR_9A', qty: 1 }, { matchKey: 'THERMAL_9A', qty: 1 }],
        },
        VFD: { '11': [{ matchKey: 'VFD_11KW', qty: 1 }] },
    };

    it('giữ nguyên mức công suất và starter type không có trong file', () => {
        const incoming: TemplateMap = { DOL: { '5.5': [{ matchKey: 'MCCB_40A', qty: 1 }] } };
        const merged = mergeTemplates(current, incoming);

        expect(merged.DOL['0.18']).toEqual(current.DOL['0.18']);   // không bị đụng
        expect(merged.VFD['11']).toEqual(current.VFD['11']);       // cả type khác cũng vậy
        expect(merged.DOL['5.5']).toEqual([{ matchKey: 'MCCB_40A', qty: 1 }]); // mức có trong file thì theo file
    });

    it('cho phép XOÁ linh kiện bằng cách bỏ dòng khỏi mức đó', () => {
        const incoming: TemplateMap = { DOL: { '5.5': [{ matchKey: 'CONTACTOR_9A', qty: 1 }] } };
        const merged = mergeTemplates(current, incoming);
        expect(merged.DOL['5.5']).toHaveLength(1);
        expect(merged.DOL['5.5'].some(c => c.matchKey === 'THERMAL_9A')).toBe(false);
    });

    it('thêm được starter type hoàn toàn mới', () => {
        const incoming: TemplateMap = { 'Soft-Starter': { '15': [{ matchKey: 'SOFT_15KW', qty: 1 }] } };
        const merged = mergeTemplates(current, incoming);
        expect(Object.keys(merged).sort()).toEqual(['DOL', 'Soft-Starter', 'VFD']);
        expect(merged.DOL['0.18']).toEqual(current.DOL['0.18']);
    });

    it('không làm thay đổi object gốc', () => {
        const snapshot = JSON.stringify(current);
        mergeTemplates(current, { DOL: { '5.5': [] } });
        expect(JSON.stringify(current)).toBe(snapshot);
    });

    it('preserves lines when legacy keys collide after normalization', () => {
        const merged = mergeTemplates(
            { DOL: { '5.50': [{ matchKey: 'A', qty: 1 }], '5,5': [{ matchKey: 'B', qty: 1 }] } },
            {},
        );
        expect(merged.DOL['5.5'].map(line => line.matchKey)).toEqual(['A', 'B']);
    });

    it('reports and preserves collisions inside the incoming map', () => {
        const result = mergeTemplatesWithReport(
            { DOL: { '5.5': [{ matchKey: 'OLD', qty: 1 }] } },
            { DOL: {
                '5.50': [{ matchKey: 'A', qty: 1 }],
                '5,5': [{ matchKey: 'B', qty: 1 }],
            } },
        );

        expect(result.templates.DOL['5.5'].map(line => line.matchKey)).toEqual(['A', 'B']);
        expect(result.report.replacedTiers).toEqual([{ type: 'DOL', power: '5.5' }]);
        expect(result.report.collisions).toEqual([{
            source: 'incoming',
            type: 'DOL',
            power: '5.5',
            rawPowers: ['5.50', '5,5'],
            lineCount: 2,
        }]);
    });

    it('untouchedTiers liệt kê đúng các mức sẽ được giữ nguyên', () => {
        const incoming: TemplateMap = { DOL: { '5.5': [] } };
        expect(untouchedTiers(current, incoming).sort((a, b) => a.type.localeCompare(b.type))).toEqual([
            { type: 'DOL', power: '0.18' },
            { type: 'VFD', power: '11' },
        ]);
    });
});

// ---------------------------------------------------------------------------
// Vòng Input (3 hàm vừa được hồi sinh) — loadName trước đây bị mất khi round-trip.
// ---------------------------------------------------------------------------
describe('sanitizeStarter — tên phụ tải', () => {
    it('đọc cột LoadName', () => {
        const s = sanitizeStarter({ Type: 'DOL', Power: 5.5, Quantity: 1, Brand: 'Schneider', LoadName: 'Bơm chìm số 3' });
        expect(s.loadName).toBe('Bơm chìm số 3');
    });

    it('chấp nhận cột Description của file mẫu cũ', () => {
        const s = sanitizeStarter({ Type: 'DOL', Power: 5.5, Quantity: 1, Brand: 'Schneider', Description: 'Quạt hút' });
        expect(s.loadName).toBe('Quạt hút');
    });

    it('không có tên ⇒ không gán trường rỗng', () => {
        const s = sanitizeStarter({ Type: 'DOL', Power: 5.5, Quantity: 1, Brand: 'Schneider' });
        expect(s.loadName).toBeUndefined();
    });
});

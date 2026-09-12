import { describe, it, expect } from 'vitest';
import { createLibraryIndex, generateDetail, findMatchKeyMismatches } from './boq-logic';
import { normalizeMatchKey, looseMatchKey } from './brand-policy';
import { applyMatchKeyMatrixRows, parseTemplateRows } from './excel-import';
import type { Product, StarterConfig } from '../types';

// ---------------------------------------------------------------------------
// "Template có Match Key nhưng BOQ báo Missing".
// Nguyên nhân: tra cứu library là Map.get() — so khớp chuỗi TUYỆT ĐỐI, trong khi Excel
// mang theo khoảng trắng thừa / NBSP, hoặc chuỗi lệch hoa-thường.
// ---------------------------------------------------------------------------

const KEY = 'W4000xH2100xD800x2.0mm_7032';

const library: Product[] = [
    {
        id: 'vo-tu-4000', code: KEY, ibomCode: KEY,
        description: 'Vỏ tủ điện W4000xH2100xD800x2.0mm, tủ khung, màu RAL 7032',
        brand: 'VN', unit: 'Cái', matchKey: KEY,
    },
];

const signals = {
    thermal: false, ptc: false, estop: false, humidity: false,
    isolator_BFP: false, estop_BFP: false, isolator_estop_FB: false,
};
const starter: StarterConfig = {
    id: 's1', type: 'Overal_Cabinet-Light_Fan', power: 0.1, quantity: 1,
    brand: 'Mitsubishi', isolator: false, signals,
};

const bomFor = (templateKey: string) => generateDetail(
    [starter],
    createLibraryIndex(library),
    { 'Overal_Cabinet-Light_Fan': { '0.1': [{ matchKey: templateKey, qty: 1 }] } }
);

describe('normalizeMatchKey / looseMatchKey', () => {
    it('bỏ khoảng trắng hai đầu', () => {
        expect(normalizeMatchKey(`  ${KEY} `)).toBe(KEY);
    });

    it('xử lý NBSP và zero-width mà Excel hay mang vào', () => {
        expect(normalizeMatchKey(` ${KEY}​`)).toBe(KEY);
        expect(normalizeMatchKey(`﻿${KEY}`)).toBe(KEY);
    });

    it('looseMatchKey bỏ luôn phân biệt hoa/thường', () => {
        expect(looseMatchKey(' w4000XH2100xd800X2.0MM_7032 ')).toBe(KEY.toUpperCase());
    });

    it('looseMatchKey chuẩn hoá zero-width ở giữa thành khoảng trắng, không xoá khoảng trắng nội bộ', () => {
        expect(looseMatchKey('AB\u200bCD')).toBe('AB CD');
    });
});

describe('BOQ vẫn ra được khi chuỗi lệch (cứu dữ liệu cũ)', () => {
    it('khớp tuyệt đối — mốc so sánh', () => {
        const row = bomFor(KEY)[0];
        expect(row.productCode).toBe(KEY);
        expect(row.brand).toBe('VN');
    });

    it('template dính khoảng trắng cuối ⇒ vẫn tìm ra, KHÔNG còn NOT_FOUND', () => {
        const row = bomFor(`${KEY} `)[0];
        expect(row.productCode).toBe(KEY);
        expect(row.brand).toBe('VN');
    });

    it('template dính NBSP ⇒ vẫn tìm ra', () => {
        const row = bomFor(` ${KEY}`)[0];
        expect(row.productCode).toBe(KEY);
    });

    it('template lệch hoa/thường ⇒ vẫn tìm ra', () => {
        const row = bomFor('W4000XH2100XD800X2.0MM_7032')[0];
        expect(row.productCode).toBe(KEY);
    });

    it('key thiếu THẬT vẫn phải báo NOT_FOUND', () => {
        const row = bomFor('W9999xH9999xD999x9.9mm_9999')[0];
        expect(row.productCode).toBe('NOT_FOUND');
        expect(row.brand).toBe('—');
    });

    it('library key có NBSP/zero-width và lệch hoa thường vẫn tra được qua index', () => {
        const dirtyLibrary: Product[] = [{
            ...library[0],
            id: 'dirty-library-key',
            matchKey: `\u00a0${KEY.toLowerCase()}\u200b`,
        }];
        const rows = generateDetail(
            [starter],
            createLibraryIndex(dirtyLibrary),
            { 'Overal_Cabinet-Light_Fan': { '0.1': [{ matchKey: KEY, qty: 1 }] } },
        );

        expect(rows[0].productCode).toBe(KEY);
        expect(rows[0].productCode).not.toBe('NOT_FOUND');
    });
});

describe('findMatchKeyMismatches — chỉ ra đúng key bị lệch', () => {
    const templates = {
        'Overal_Cabinet-Light_Fan': {
            '0.1': [{ matchKey: `${KEY} `, qty: 1 }],
            '0.2': [{ matchKey: `${KEY} `, qty: 1 }],
        },
        DOL: { '4': [{ matchKey: KEY, qty: 1 }] },          // khớp đúng — không được báo
    };

    it('gom đủ nơi xuất hiện và chỉ ra key đúng trong library', () => {
        const out = findMatchKeyMismatches(library, templates);
        expect(out).toHaveLength(1);
        expect(out[0].templateKey).toBe(`${KEY} `);
        expect(out[0].libraryKey).toBe(KEY);
        expect(out[0].where.sort()).toEqual(['Overal_Cabinet-Light_Fan 0.1kW', 'Overal_Cabinet-Light_Fan 0.2kW']);
    });

    it('key thiếu THẬT không bị gom nhầm vào đây', () => {
        const out = findMatchKeyMismatches(library, { DOL: { '4': [{ matchKey: 'KHONG_CO_THAT', qty: 1 }] } });
        expect(out).toHaveLength(0);
    });
});

describe('Chặn tái diễn ở các đường ghi', () => {
    it('Match Key Matrix: ô MatchKey dính khoảng trắng được chuẩn hoá khi nhập', () => {
        const res = applyMatchKeyMatrixRows(
            [{ MatchKey: `  ${KEY}  `, Description: 'Vỏ tủ', Unit: 'Cái', BrandSensitive: 'No', VN_Code: KEY }],
            [], ['VN']
        );
        expect(res.library[0].matchKey).toBe(KEY);
    });

    it('Starter_Templates: ô ComponentMatchKey dính khoảng trắng được chuẩn hoá khi nhập', () => {
        const { templates } = parseTemplateRows([
            { StarterType: 'DOL', Power: 4, ComponentMatchKey: ` ${KEY} `, Quantity: 1, Condition: 'always' },
        ]);
        expect(templates.DOL['4'][0].matchKey).toBe(KEY);
    });
});

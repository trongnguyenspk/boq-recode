import { describe, it, expect } from 'vitest';
// Nhóm E — TƯƠNG THÍCH NGƯỢC với bộ dữ liệu đã export TRƯỚC khi sửa brand model:
//   backup .json, Product_Library.xlsx, Match_Keys_Matrix.xlsx (định dạng cũ).
// Mục đích: chứng minh nạp lại dữ liệu cũ không làm loạn nhãn hiệu / không mất dữ liệu.
import { applyMatchKeyMatrixRows } from './excel-import';
import { sanitizeProduct } from './import-validation';
import { validateBackupJSON } from './import-validation';
import { createLibraryIndex, generateDetail } from './boq-logic';
import { seedMeta } from './brand-policy';
import { PRODUCT_LIBRARY, STARTER_TEMPLATES } from '../data/library';
import type { Product, StarterConfig } from '../types';

// Mô phỏng FILE CŨ: Match_Keys_Matrix.xlsx xuất bằng code TRƯỚC khi sửa
// (4 cột brand hard-code, KHÔNG có BrandSensitive, KHÔNG có <Brand>_iBomCode)
function buildOldMatrixRows(library: Product[]) {
    const keys = Array.from(new Set(library.map(p => p.matchKey).filter(Boolean))) as string[];
    return keys.map(key => {
        const products = library.filter(p => p.matchKey === key);
        const ref = products[0];
        const row: Record<string, string> = {
            MatchKey: key,
            Description: ref?.description || '',
            Unit: ref?.unit || 'Cái',
            iBomCode: ref?.ibomCode || '',
        };
        ['Schneider', 'Mitsubishi', 'LS', 'Hyundai'].forEach(b => {
            row[`${b}_Code`] = products.find(p => p.brand === b)?.code || '';
        });
        return row;
    });
}

// Mô phỏng FILE CŨ: Product_Library.xlsx (định dạng không đổi giữa 2 phiên bản)
function buildOldLibraryRows(library: Product[]) {
    return library.map(p => ({
        ID: p.id, Code: p.code, iBomCode: p.ibomCode || '', Description: p.description,
        Brand: p.brand, Unit: p.unit, Price: p.price || 0, MatchKey: p.matchKey || '',
    }));
}

describe('DỮ LIỆU CŨ · Product_Library.xlsx', () => {
    it('giữ OMEGA khi thư viện hiện tại CÒN OMEGA (allowedBrands có OMEGA)', () => {
        const allowed = Array.from(new Set([
            'Schneider', 'Mitsubishi', 'LS', 'Hyundai',
            ...PRODUCT_LIBRARY.map(p => p.brand),
        ]));
        const rows = buildOldLibraryRows(PRODUCT_LIBRARY);
        const out = rows.map(r => sanitizeProduct(r, allowed));
        expect(out.filter(p => p.brand === 'OMEGA')).toHaveLength(20);
    });

    it('⚠️ ÉP OMEGA → Schneider khi thư viện đã bị xoá trắng trước đó', () => {
        const allowed = ['Schneider', 'Mitsubishi', 'LS', 'Hyundai']; // library rỗng
        const rows = buildOldLibraryRows(PRODUCT_LIBRARY);
        const out = rows.map(r => sanitizeProduct(r, allowed));
        expect(out.filter(p => p.brand === 'OMEGA')).toHaveLength(0);
        expect(out.filter(p => p.brand === 'Schneider').length).toBeGreaterThan(20);
    });
});

describe('DỮ LIỆU CŨ · Match_Keys_Matrix.xlsx (định dạng cũ)', () => {
    const oldRows = buildOldMatrixRows(PRODUCT_LIBRARY);
    const brands = ['Schneider', 'Mitsubishi', 'LS', 'Hyundai'];

    it('nhập vào thư viện RỖNG: MCT/PCT KHÔNG được tạo lại (code rỗng trong file cũ)', () => {
        const res = applyMatchKeyMatrixRows(oldRows, [], brands);
        expect(res.report.missingBrandSensitiveColumn).toBe(true);
        expect(res.library.filter(p => p.matchKey?.startsWith('MCT_'))).toHaveLength(0);
        expect(res.library.filter(p => p.matchKey?.startsWith('PCT_'))).toHaveLength(0);
        // Thiết bị đóng cắt thì vẫn về đủ
        expect(res.library.filter(p => p.matchKey === 'CONTACTOR_9A')).toHaveLength(2);
    });

    it('nhập ĐÈ lên thư viện đang có: KHÔNG xoá MCT/PCT, chỉ báo cáo', () => {
        const res = applyMatchKeyMatrixRows(oldRows, PRODUCT_LIBRARY, brands);
        expect(res.library.filter(p => p.brand === 'OMEGA')).toHaveLength(20);
        expect(res.report.cleared).toHaveLength(0);
    });

    it('KHÔNG làm hỏng iBomCode của bản ghi đang có (file cũ chỉ có cột chung)', () => {
        const res = applyMatchKeyMatrixRows(oldRows, PRODUCT_LIBRARY, brands);
        const mit = res.library.find(p => p.matchKey === 'CONTACTOR_9A' && p.brand === 'Mitsubishi');
        const sch = res.library.find(p => p.matchKey === 'CONTACTOR_9A' && p.brand === 'Schneider');
        expect(sch?.ibomCode).toBe('IBOM-001');
        expect(mit?.ibomCode).toBe('');
    });

    it('KHÔNG nhân bản matchKey brand-agnostic ra nhiều brand', () => {
        const res = applyMatchKeyMatrixRows(oldRows, PRODUCT_LIBRARY, brands);
        const perKey = new Map<string, number>();
        res.library.forEach(p => {
            if (!p.matchKey) return;
            perKey.set(p.matchKey, (perKey.get(p.matchKey) || 0) + 1);
        });
        expect(perKey.get('MCT_100A')).toBe(1);
        expect(perKey.get('PCT_100A')).toBe(1);
    });
});

describe('DỮ LIỆU CŨ · backup JSON (không có matchKeyMeta)', () => {
    it('schema cũ vẫn hợp lệ', () => {
        const oldBackup = {
            version: '1.0',
            data: {
                library: JSON.stringify(PRODUCT_LIBRARY),
                templates: JSON.stringify(STARTER_TEMPLATES),
                brands: JSON.stringify(['Schneider', 'Mitsubishi', 'LS', 'Hyundai']),
            },
        };
        expect(validateBackupJSON(oldBackup)).toBe(true);
    });

    it('meta RỖNG vẫn cho kết quả BOQ đúng (fallback suy luận theo tên)', () => {
        const templates = { DOL: { '5.5': [
            { matchKey: 'CONTACTOR_9A', qty: 1 },
            { matchKey: 'MCT_100A', qty: 3 },
        ] } };
        const starter: StarterConfig = {
            id: 's', type: 'DOL', power: 5.5, quantity: 1, brand: 'Schneider', isolator: false,
            signals: { thermal: false, ptc: false, estop: false, humidity: false, isolator_BFP: false, estop_BFP: false, isolator_estop_FB: false },
        };
        const idx = createLibraryIndex(PRODUCT_LIBRARY);
        const bomNoMeta = generateDetail([starter], idx, templates);           // meta = {}
        const bomWithMeta = generateDetail([starter], idx, templates, seedMeta(PRODUCT_LIBRARY, templates));
        expect(bomNoMeta).toEqual(bomWithMeta);
        expect(bomNoMeta.find(i => i.matchKey === 'MCT_100A')?.brand).toBe('OMEGA');
    });
});

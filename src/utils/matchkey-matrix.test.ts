import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildMatchKeyMatrixRows, resolveMatrixBrands } from './excel-export';
import { applyMatchKeyMatrixRows } from './excel-import';
import type { MatchKeyMetaMap, Product } from '../types';

// ---------------------------------------------------------------------------
// Nhóm C — vòng Export → Import của Match Key Matrix.
// Vòng này từng là nơi brand bị "loạn": export hard-code 4 cột brand làm rơi mất OMEGA,
// import thì nhân bản mọi matchKey ra mọi brand.
// ---------------------------------------------------------------------------

const brands = ['Schneider', 'Mitsubishi', 'LS', 'Hyundai'];

const library: Product[] = [
    { id: 'mct-100', code: 'MCT-100', ibomCode: 'MCT_100-5', description: 'MCT 100/5', brand: 'OMEGA', unit: 'Cái', matchKey: 'MCT_100A' },
    { id: 'sch-c-09', code: 'LC1D09', ibomCode: 'IB-SCH', description: 'Contactor 9A', brand: 'Schneider', unit: 'Cái', matchKey: 'CONTACTOR_9A' },
    { id: 'mit-c-09', code: 'S-T10', ibomCode: 'IB-MIT', description: 'Contactor 9A', brand: 'Mitsubishi', unit: 'Cái', matchKey: 'CONTACTOR_9A' },
];

/** Ghi rows ra file .xlsx thật rồi đọc lại — chứng minh round-trip không mất dữ liệu. */
function roundTripThroughXlsx(rows: Record<string, any>[]): any[] {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'MatchKeys');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const back = XLSX.read(buf, { type: 'array' });
    return XLSX.utils.sheet_to_json(back.Sheets[back.SheetNames[0]]);
}

const identity = (lib: Product[]) =>
    lib
        .filter(p => p.matchKey)
        .map(p => `${p.matchKey}|${p.brand}|${p.code}|${p.ibomCode ?? ''}`)
        .sort();

describe('Match Key Matrix · export', () => {
    it('C1: có cột brand động cho OMEGA, code không bị rơi', () => {
        expect(resolveMatrixBrands(library, brands)).toContain('OMEGA');

        const rows = buildMatchKeyMatrixRows(library, brands);
        const mctRow = rows.find(r => r.MatchKey === 'MCT_100A')!;

        expect(mctRow).toHaveProperty('OMEGA_Code');
        expect(mctRow.OMEGA_Code).toBe('MCT-100');
        expect(mctRow.BrandSensitive).toBe('No');
    });

    it('C1b: key phụ thuộc nhãn hiệu được đánh dấu Yes và giữ đủ code từng brand', () => {
        const rows = buildMatchKeyMatrixRows(library, brands);
        const row = rows.find(r => r.MatchKey === 'CONTACTOR_9A')!;

        expect(row.BrandSensitive).toBe('Yes');
        expect(row.Schneider_Code).toBe('LC1D09');
        expect(row.Mitsubishi_Code).toBe('S-T10');
        expect(row.LS_Code).toBe('');
    });

    it('mô tả đại diện tất định — không phụ thuộc thứ tự mảng library', () => {
        const a = buildMatchKeyMatrixRows(library, brands).find(r => r.MatchKey === 'CONTACTOR_9A');
        const b = buildMatchKeyMatrixRows([...library].reverse(), brands).find(r => r.MatchKey === 'CONTACTOR_9A');
        expect(a!.iBomCode).toBe(b!.iBomCode);
    });
});

describe('Match Key Matrix · round-trip', () => {
    it('C2: export → ghi .xlsx → đọc lại → import ⇒ library không đổi', () => {
        const rows = buildMatchKeyMatrixRows(library, brands);
        const parsed = roundTripThroughXlsx(rows);

        const matrixBrands = resolveMatrixBrands(library, brands);
        const result = applyMatchKeyMatrixRows(parsed, library, matrixBrands);

        expect(identity(result.library)).toEqual(identity(library));
        expect(result.report.added).toBe(0);
        expect(result.report.conflicts).toHaveLength(0);
    });

    it('C2c: iBomCode KHÔNG bị làm phẳng giữa các brand (hồi quy M7)', () => {
        // ibomCode là khoá gộp của generateSummary — làm phẳng nó sẽ nhập nhầm hai biến thể
        // khác nhau thành một dòng Summary.
        const rows = buildMatchKeyMatrixRows(library, brands);
        const parsed = roundTripThroughXlsx(rows);
        const result = applyMatchKeyMatrixRows(parsed, library, resolveMatrixBrands(library, brands));

        const sch = result.library.find(p => p.matchKey === 'CONTACTOR_9A' && p.brand === 'Schneider');
        const mit = result.library.find(p => p.matchKey === 'CONTACTOR_9A' && p.brand === 'Mitsubishi');

        expect(sch?.ibomCode).toBe('IB-SCH');
        expect(mit?.ibomCode).toBe('IB-MIT');
    });

    it('C2d: brand KHÔNG có iBomCode không bị mượn iBom của brand khác', () => {
        // Bản Mitsubishi của CONTACTOR_9A trong library gốc không có ibomCode. Cột iBomCode dùng
        // chung lấy từ bản đại diện (Schneider) không được phép rò sang nó.
        const mixed: Product[] = [
            { id: 'sch', code: 'LC1D09', ibomCode: 'IBOM-001', description: 'Contactor 9A', brand: 'Schneider', unit: 'Cái', matchKey: 'CONTACTOR_9A' },
            { id: 'mit', code: 'S-T10', description: 'Contactor 10A', brand: 'Mitsubishi', unit: 'Cái', matchKey: 'CONTACTOR_9A' },
        ];
        const parsed = roundTripThroughXlsx(buildMatchKeyMatrixRows(mixed, brands));
        const result = applyMatchKeyMatrixRows(parsed, [], resolveMatrixBrands(mixed, brands));

        expect(result.library.find(p => p.brand === 'Schneider')?.ibomCode).toBe('IBOM-001');
        expect(result.library.find(p => p.brand === 'Mitsubishi')?.ibomCode).toBe('');
    });

    it('C2b: OMEGA vẫn còn sau round-trip kể cả khi bắt đầu từ thư viện rỗng', () => {
        const rows = buildMatchKeyMatrixRows(library, brands);
        const parsed = roundTripThroughXlsx(rows);
        const matrixBrands = resolveMatrixBrands(library, brands);

        const result = applyMatchKeyMatrixRows(parsed, [], matrixBrands);
        const mct = result.library.filter(p => p.matchKey === 'MCT_100A');

        expect(mct).toHaveLength(1);
        expect(mct[0].brand).toBe('OMEGA');
    });
});

describe('Match Key Matrix · vật tư KHÔNG có productCode (MCT/PCT thật)', () => {
    // Toàn bộ 20 món MCT/PCT trong src/data/library.ts có code = '' và chỉ định danh bằng
    // ibomCode. Nếu vòng export/import chỉ xét `code` thì chúng biến mất — đúng kiểu mất OMEGA.
    const realShape: Product[] = [
        { id: 'mct-50', code: '', ibomCode: 'MCT_50-5_CL.3_5VA', description: 'MCT, 50/5, CL.3-5VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'MCT_50A' },
        { id: 'pct-100', code: '', ibomCode: 'PCT_100-5_CL.5P10_5VA', description: 'PCT 100/5', brand: 'OMEGA', unit: 'Cái', matchKey: 'PCT_100A' },
    ];

    it('round-trip giữ nguyên OMEGA dù productCode rỗng', () => {
        const rows = buildMatchKeyMatrixRows(realShape, brands);
        const parsed = roundTripThroughXlsx(rows);
        const result = applyMatchKeyMatrixRows(parsed, [], resolveMatrixBrands(realShape, brands));

        expect(identity(result.library)).toEqual(identity(realShape));
        expect(result.library.every(p => p.brand === 'OMEGA')).toBe(true);
        expect(result.library).toHaveLength(2);
    });

    it('không nhân bản sang brand khác', () => {
        const rows = buildMatchKeyMatrixRows(realShape, brands);
        const result = applyMatchKeyMatrixRows(roundTripThroughXlsx(rows), realShape, resolveMatrixBrands(realShape, brands));
        expect(result.library.filter(p => p.matchKey === 'MCT_50A')).toHaveLength(1);
        expect(result.report.added).toBe(0);
    });
});

describe('Match Key Matrix · import', () => {
    const matrixBrands = ['Schneider', 'Mitsubishi', 'OMEGA'];

    it('C3: BrandSensitive=No + nhiều ô code ⇒ tạo ĐÚNG 1 bản ghi và báo conflict', () => {
        const rows = [{
            MatchKey: 'MCT_50A', Description: 'MCT 50/5', Unit: 'Cái', iBomCode: 'IB-50', BrandSensitive: 'No',
            Schneider_Code: 'SCH-50', OMEGA_Code: 'OMG-50',
        }];

        const result = applyMatchKeyMatrixRows(rows, [], matrixBrands);

        expect(result.library.filter(p => p.matchKey === 'MCT_50A')).toHaveLength(1);
        expect(result.library[0].brand).toBe('Schneider');   // ô đầu tiên được dùng
        expect(result.report.conflicts).toEqual([
            { matchKey: 'MCT_50A', used: 'Schneider', ignored: ['OMEGA'] },
        ]);
    });

    it('C4: BrandSensitive=Yes + nhiều ô code ⇒ tạo đủ bản ghi (hành vi đúng)', () => {
        const rows = [{
            MatchKey: 'CONTACTOR_25A', Description: 'Contactor 25A', Unit: 'Cái', iBomCode: 'IB-25', BrandSensitive: 'Yes',
            Schneider_Code: 'LC1D25', Mitsubishi_Code: 'S-T25', OMEGA_Code: 'OMG-25',
        }];

        const result = applyMatchKeyMatrixRows(rows, [], matrixBrands);

        expect(result.library.filter(p => p.matchKey === 'CONTACTOR_25A')).toHaveLength(3);
        expect(result.report.conflicts).toHaveLength(0);
        expect(result.report.added).toBe(3);
    });

    it('C5: ô code bị xoá trắng ⇒ vào report.cleared, KHÔNG bị xoá khỏi thư viện', () => {
        const rows = [{
            MatchKey: 'CONTACTOR_9A', Description: 'Contactor 9A', Unit: 'Cái', iBomCode: 'IB-SCH', BrandSensitive: 'Yes',
            Schneider_Code: 'LC1D09', Mitsubishi_Code: '',
        }];

        const result = applyMatchKeyMatrixRows(rows, library, ['Schneider', 'Mitsubishi']);

        expect(result.report.cleared).toEqual([
            { matchKey: 'CONTACTOR_9A', brand: 'Mitsubishi', code: 'S-T10' },
        ]);
        // Vẫn còn nguyên trong thư viện.
        expect(result.library.find(p => p.matchKey === 'CONTACTOR_9A' && p.brand === 'Mitsubishi')?.code).toBe('S-T10');
    });

    it('file mẫu CŨ (không có cột BrandSensitive) vẫn import được, có cờ báo', () => {
        const rows = [{
            MatchKey: 'MCT_75A', Description: 'MCT 75/5', Unit: 'Cái', iBomCode: 'IB-75',
            Schneider_Code: 'SCH-75',
        }];

        const result = applyMatchKeyMatrixRows(rows, [], matrixBrands);

        expect(result.report.missingBrandSensitiveColumn).toBe(true);
        // Suy luận theo tên: MCT_* không phụ thuộc nhãn hiệu ⇒ chỉ 1 bản ghi.
        expect(result.library.filter(p => p.matchKey === 'MCT_75A')).toHaveLength(1);
        expect(result.meta['MCT_75A'].brandSensitive).toBe(false);
    });

    it('cột BrandSensitive ghi đè được khai báo cũ trong meta', () => {
        const meta: MatchKeyMetaMap = {
            MCT_75A: { matchKey: 'MCT_75A', category: 'CT', brandSensitive: false },
        };
        const rows = [{
            MatchKey: 'MCT_75A', Description: 'MCT 75/5', Unit: 'Cái', BrandSensitive: 'Yes',
            Schneider_Code: 'SCH-75', OMEGA_Code: 'OMG-75',
        }];

        const result = applyMatchKeyMatrixRows(rows, [], matrixBrands, meta);

        expect(result.meta['MCT_75A'].brandSensitive).toBe(true);
        expect(result.library.filter(p => p.matchKey === 'MCT_75A')).toHaveLength(2);
    });

    it('dòng thiếu MatchKey bị bỏ qua và được đếm', () => {
        const result = applyMatchKeyMatrixRows(
            [{ Description: 'rác', Schneider_Code: 'X' }, { MatchKey: 'MCB_32A', Schneider_Code: 'C60N', BrandSensitive: 'Yes' }],
            [], matrixBrands
        );
        expect(result.report.skipped).toBe(1);
        expect(result.report.added).toBe(1);
    });

    it('nhận brand tùy chỉnh có khoảng trắng và coi ô chỉ có whitespace là trống', () => {
        const result = applyMatchKeyMatrixRows([
            {
                MatchKey: 'CUSTOM_KEY',
                Description: 'Custom item',
                Unit: 'Cái',
                BrandSensitive: 'Yes',
                'Brand A_Code': '  BA-1  ',
                'Brand A_iBomCode': '  IB-1  ',
                'Schneider_Code': '   ',
            },
        ], [], ['Brand A', 'Schneider']);

        expect(result.library).toHaveLength(1);
        expect(result.library[0]).toMatchObject({
            brand: 'Brand A',
            code: 'BA-1',
            ibomCode: 'IB-1',
        });
    });

    it('tự nhận brand đang có trong library dù caller chỉ truyền catalog brands', () => {
        const existing: Product = {
            id: 'omega-1', code: 'OMG-1', ibomCode: 'IB-OMG', description: 'Omega item',
            brand: 'OMEGA', unit: 'Cái', matchKey: 'OMEGA_KEY',
        };
        const result = applyMatchKeyMatrixRows([
            {
                MatchKey: 'OMEGA_KEY', Description: 'Omega item', Unit: 'Cái', BrandSensitive: 'No',
                OMEGA_Code: 'OMG-2', OMEGA_iBomCode: 'IB-OMG-2',
            },
        ], [existing], ['Schneider']);

        expect(result.report.added).toBe(0);
        expect(result.library).toHaveLength(1);
        expect(result.library[0]).toMatchObject({ brand: 'OMEGA', code: 'OMG-2', ibomCode: 'IB-OMG-2' });
    });

    it('nhận cột brand có zero-width/whitespace trong header', () => {
        const result = applyMatchKeyMatrixRows([
            {
                MatchKey: 'CUSTOM_KEY', BrandSensitive: 'Yes',
                'Brand\u200b A _ Code': 'BA-1', 'Brand\u200b A _ iBomCode': 'IB-1',
            },
        ], [], []);

        expect(result.library).toHaveLength(1);
        expect(result.library[0]).toMatchObject({ brand: 'Brand A', code: 'BA-1', ibomCode: 'IB-1' });
    });
});

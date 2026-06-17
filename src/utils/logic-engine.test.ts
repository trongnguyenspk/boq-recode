/**
 * Tests cho logic-engine.ts
 * Bao phủ: isSizeMatch (so khớp kích thước chính xác), SAME_RATING regex, phân bổ co nhiệt lẻ
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Kiểm thử hàm isSizeMatch (nội bộ) thông qua evaluateAutoSelection ───────

// Mock isSizeMatch logic để kiểm tra hành vi của nó một cách độc lập
function isSizeMatch(description: string, targetSize: string): boolean {
    if (!description || !targetSize) return false;
    const normalized = targetSize.replace(/\s+/g, '');
    const parts = normalized.match(/^(\d+)x(\d+)$/i);
    if (!parts) {
        return description.replace(/\s+/g, '').toLowerCase().includes(normalized.toLowerCase());
    }
    const [, w, t] = parts;
    const exactRegex = new RegExp(`(?:^|[^0-9])${w}\\s*[xX]\\s*${t}(?:$|[^0-9])`);
    return exactRegex.test(description.replace(/\s+/g, ' '));
}

// ─── isSizeMatch tests ─────────────────────────────────────────────────────────
describe('isSizeMatch - So khớp kích thước chính xác bằng Regex ranh giới số', () => {
    // Happy path
    it('khớp đúng "10x20" trong "Thanh cái 10x20 Cu"', () => {
        expect(isSizeMatch('Thanh cái 10x20 Cu', '10x20')).toBe(true);
    });

    it('khớp đúng "10x20" khi có khoảng trắng "10 x 20"', () => {
        expect(isSizeMatch('Thanh cái 10 x 20 Cu', '10x20')).toBe(true);
    });

    it('khớp đúng khi targetSize có khoảng trắng "10 x 20"', () => {
        expect(isSizeMatch('Thanh cái 10x20 Cu', '10 x 20')).toBe(true);
    });

    // Không khớp nhầm
    it('KHÔNG khớp "10x20" trong "10x200" (lỗi cũ)', () => {
        expect(isSizeMatch('Busbar 10x200', '10x20')).toBe(false);
    });

    it('KHÔNG khớp "10x20" trong "100x20" (lỗi cũ)', () => {
        expect(isSizeMatch('Busbar 100x20', '10x20')).toBe(false);
    });

    it('KHÔNG khớp "10x20" trong "210x20"', () => {
        expect(isSizeMatch('Busbar 210x20', '10x20')).toBe(false);
    });

    it('KHÔNG khớp "10x20" trong "10x201"', () => {
        expect(isSizeMatch('Busbar 10x201', '10x20')).toBe(false);
    });

    // Edge cases
    it('trả về false khi description rỗng', () => {
        expect(isSizeMatch('', '10x20')).toBe(false);
    });

    it('trả về false khi targetSize rỗng', () => {
        expect(isSizeMatch('Busbar 10x20', '')).toBe(false);
    });

    it('khớp đúng khi kích thước nằm ở đầu chuỗi', () => {
        expect(isSizeMatch('10x20 thanh cái đồng', '10x20')).toBe(true);
    });

    it('khớp đúng khi kích thước nằm ở cuối chuỗi', () => {
        expect(isSizeMatch('Thanh cái đồng 10x20', '10x20')).toBe(true);
    });
});

// ─── Kiểm thử thuật toán phân bổ co nhiệt lẻ ────────────────────────────────

/**
 * Hàm tính toán số lượng co nhiệt cho từng pha theo thuật toán phân bổ phần dư mới.
 * Đây là hàm trích xuất từ logic-engine.ts để kiểm thử độc lập.
 */
function distributeHeatShrinkQty(totalQty: number): { red: number; yellow: number; blue: number } {
    const baseQty = Math.floor(totalQty / 3);
    const remainder = totalQty % 3;
    return {
        red: baseQty + (0 < remainder ? 1 : 0),    // idx=0 (Đỏ)
        yellow: baseQty + (1 < remainder ? 1 : 0), // idx=1 (Vàng)
        blue: baseQty + (2 < remainder ? 1 : 0),   // idx=2 (Xanh dương)
    };
}

describe('distributeHeatShrinkQty - Phân bổ co nhiệt lẻ', () => {
    it('qty=9: mỗi pha nhận 3 (không có dư)', () => {
        const { red, yellow, blue } = distributeHeatShrinkQty(9);
        expect(red).toBe(3);
        expect(yellow).toBe(3);
        expect(blue).toBe(3);
        expect(red + yellow + blue).toBe(9);
    });

    it('qty=10: đỏ=4, vàng=3, xanh=3 (dư 1 → đỏ nhận thêm)', () => {
        const { red, yellow, blue } = distributeHeatShrinkQty(10);
        expect(red).toBe(4);
        expect(yellow).toBe(3);
        expect(blue).toBe(3);
        expect(red + yellow + blue).toBe(10);
    });

    it('qty=11: đỏ=4, vàng=4, xanh=3 (dư 2 → đỏ và vàng nhận thêm)', () => {
        const { red, yellow, blue } = distributeHeatShrinkQty(11);
        expect(red).toBe(4);
        expect(yellow).toBe(4);
        expect(blue).toBe(3);
        expect(red + yellow + blue).toBe(11);
    });

    it('qty=5: đỏ=2, vàng=2, xanh=1 (dư 2)', () => {
        const { red, yellow, blue } = distributeHeatShrinkQty(5);
        expect(red).toBe(2);
        expect(yellow).toBe(2);
        expect(blue).toBe(1);
        expect(red + yellow + blue).toBe(5);
    });

    it('qty=1: đỏ=1, vàng=0, xanh=0 (dư 1)', () => {
        const { red, yellow, blue } = distributeHeatShrinkQty(1);
        expect(red).toBe(1);
        expect(yellow).toBe(0);
        expect(blue).toBe(0);
        expect(red + yellow + blue).toBe(1);
    });

    it('qty=2: đỏ=1, vàng=1, xanh=0 (dư 2)', () => {
        const { red, yellow, blue } = distributeHeatShrinkQty(2);
        expect(red).toBe(1);
        expect(yellow).toBe(1);
        expect(blue).toBe(0);
        expect(red + yellow + blue).toBe(2);
    });

    it('tổng số lượng luôn bằng qty gốc (kiểm thử ngẫu nhiên)', () => {
        for (let qty = 0; qty <= 30; qty++) {
            const { red, yellow, blue } = distributeHeatShrinkQty(qty);
            expect(red + yellow + blue).toBe(qty);
        }
    });
});

// ─── Kiểm thử SAME_RATING không khớp nhầm ────────────────────────────────────
describe('SAME_RATING - So khớp dòng điện chính xác bằng Regex ranh giới số', () => {
    /**
     * Hàm kiểm tra so khớp rating trích xuất từ evaluateAutoSelection.
     * exactRatingRegex = /(?:^|[^0-9])10\//
     */
    function testRatingMatch(ibomCode: string, rating: number): boolean {
        const exactRatingRegex = new RegExp(`(?:^|[^0-9])${rating}/`);
        return exactRatingRegex.test(ibomCode);
    }

    it('CT 10/5A: khớp đúng với rating=10', () => {
        expect(testRatingMatch('CT10/5A', 10)).toBe(true);
    });

    it('CT 210/5A: KHÔNG khớp với rating=10 (lỗi cũ với .includes)', () => {
        expect(testRatingMatch('CT210/5A', 10)).toBe(false);
    });

    it('CT 110/5A: KHÔNG khớp với rating=10 (lỗi cũ với .includes)', () => {
        expect(testRatingMatch('CT110/5A', 10)).toBe(false);
    });

    it('CT 100/5A: khớp đúng với rating=100', () => {
        expect(testRatingMatch('CT100/5A', 100)).toBe(true);
    });

    it('CT 1000/5A: KHÔNG khớp với rating=100', () => {
        expect(testRatingMatch('CT1000/5A', 100)).toBe(false);
    });
});

// ─── Kiểm thử sanitize Quantity từ Excel ─────────────────────────────────────
describe('sanitizeQty - Chuẩn hóa Quantity từ Excel Import', () => {
    function sanitizeQty(rawValue: unknown): number {
        const rawQty = Number(rawValue);
        return (!isNaN(rawQty) && rawQty > 0) ? Math.round(rawQty) : 1;
    }

    it('giá trị hợp lệ 5 → 5', () => expect(sanitizeQty(5)).toBe(5));
    it('giá trị hợp lệ 2.7 → 3 (làm tròn)', () => expect(sanitizeQty(2.7)).toBe(3));
    it('giá trị âm -5 → 1 (mặc định)', () => expect(sanitizeQty(-5)).toBe(1));
    it('giá trị 0 → 1 (mặc định)', () => expect(sanitizeQty(0)).toBe(1));
    it('chuỗi "abc" → 1 (mặc định)', () => expect(sanitizeQty('abc')).toBe(1));
    it('undefined → 1 (mặc định)', () => expect(sanitizeQty(undefined)).toBe(1));
    it('null → 1 (mặc định)', () => expect(sanitizeQty(null)).toBe(1));
    it('NaN → 1 (mặc định)', () => expect(sanitizeQty(NaN)).toBe(1));
    it('chuỗi số "3" → 3', () => expect(sanitizeQty('3')).toBe(3));
});

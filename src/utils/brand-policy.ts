import type { DeviceCategory, MatchKeyMeta, MatchKeyMetaMap, Product } from '../types';

/**
 * NƠI DUY NHẤT trong repo biết "matchKey nào phụ thuộc nhãn hiệu".
 *
 * Quy tắc nghiệp vụ đã chốt 11/09/2026:
 *   Lựa chọn Brand (Admin Panel / Input Wizard / Detail View) CHỈ ảnh hưởng nhãn hiệu của
 *   CB (breaker) / contactor / relay nhiệt / Isolator.
 *   TẤT CẢ thiết bị khác giữ nguyên brand của bản ghi trong Product Library
 *   (ví dụ MCT/PCT luôn là OMEGA, VFD giữ brand trong library).
 *
 * Xem PLAN-BRAND-MODEL-2026-09-11.md ở gốc repo.
 */
export const BRAND_SENSITIVE_CATEGORIES: DeviceCategory[] = [
    'BREAKER',
    'CONTACTOR',
    'THERMAL',
    'ISOLATOR',
];

/**
 * Giá trị hiển thị ở cột "Nhãn hiệu" khi một món KHÔNG phụ thuộc nhãn hiệu và cũng
 * không tìm thấy trong library. Thay cho chuỗi 'Any' cũ — 'Any' từng lọt vào file Excel
 * xuất ra như thể nó là một brand thật.
 */
export const BRAND_AGNOSTIC_LABEL = '—';

/**
 * 7 tiền tố của hàm `isSwitchingDevice` cũ trong boq-logic.ts.
 * Giữ lại CHỈ để tài liệu hoá và để test hồi quy đối chiếu — không dùng trong đường chạy.
 */
export const LEGACY_SWITCHING_PREFIXES: string[] = [
    'MCB_', 'MCCB_', 'CONTACTOR_', 'RELAY_NHIET', 'THERMAL_', 'ISOLATOR_', 'ISO_',
];

/**
 * Bảng suy luận nhóm từ tiền tố matchKey.
 * THỨ TỰ QUAN TRỌNG: khớp từ trên xuống, nên tiền tố dài phải đứng trước tiền tố ngắn
 * chồng lấn với nó (ví dụ 'MCCB_' và 'MCB_' phải đứng trước 'CB_').
 */
const CATEGORY_PREFIXES: { category: DeviceCategory; prefixes: string[] }[] = [
    { category: 'CONTACTOR', prefixes: ['CONTACTOR_', 'KHOI_DONG_TU_'] },
    { category: 'THERMAL', prefixes: ['THERMAL_', 'RELAY_NHIET', 'OVERLOAD_'] },
    // 'ISOLATOR_' và 'ISO_' là HAI tiền tố khác nhau: 'ISOLATOR_16A'.startsWith('ISO_') === false.
    { category: 'ISOLATOR', prefixes: ['ISOLATOR_', 'ISO_'] },
    { category: 'BREAKER', prefixes: ['MCCB_', 'MCB_', 'MPCB_', 'ELCB_', 'RCCB_', 'RCBO_', 'ACB_', 'CB_'] },
    { category: 'DRIVE', prefixes: ['VFD_', 'SOFT_STARTER_', 'SOFTSTARTER_', 'INVERTER_'] },
    { category: 'CT', prefixes: ['MCT_', 'PCT_', 'CT_'] },
    { category: 'CABLE', prefixes: ['CABLE_', 'CAP_', 'CO_NHIET', 'DAU_COS', 'TERMINAL_', 'BUSBAR'] },
    { category: 'ACCESSORY', prefixes: ['ESTOP', 'TIMER_', 'LAMP_', 'DEN_BAO', 'NUT_NHAN', 'SELECTOR_', 'PB_'] },
];

/**
 * Chuẩn hoá matchKey khi GHI: bỏ khoảng trắng thừa hai đầu và các ký tự trắng vô hình
 * (NBSP, zero-width) mà Excel rất hay mang theo.
 *
 * Tra cứu library là `Map.get()` — so khớp chuỗi TUYỆT ĐỐI. Chỉ một dấu cách cuối ô Excel
 * là template và library không khớp nhau, BOQ báo `Missing <key>` trong khi Admin vẫn hiện
 * key đó rành rành. Mắt người không phân biệt được.
 */
export function normalizeMatchKey(key: unknown): string {
    return String(key ?? '')
        .replace(/[\u00a0\u200b-\u200d\ufeff]/g, ' ')   // NBSP + zero-width -> normal space
        .trim();
}

/** Dạng "lỏng" dùng để dò lại khi so khớp tuyệt đối trượt: bỏ trắng + không phân biệt hoa/thường. */
export function looseMatchKey(key: unknown): string {
    return normalizeMatchKey(key).toUpperCase();
}

/**
 * Resolve metadata using the same rescue rule as product lookup. Metadata is
 * user/import data too, so an old key with surrounding NBSP or different case
 * must not silently lose its explicit brand policy.
 */
function declaredMetaFor(matchKey: unknown, meta: MatchKeyMetaMap = {}): MatchKeyMeta | undefined {
    const normalized = normalizeMatchKey(matchKey);
    if (!normalized) return undefined;
    const exact = meta?.[normalized];
    if (exact) return exact;

    const loose = looseMatchKey(normalized);
    const entry = Object.entries(meta || {}).find(([key, value]) =>
        looseMatchKey(key) === loose || looseMatchKey(value?.matchKey) === loose
    );
    return entry?.[1];
}

/**
 * Suy ra nhóm thiết bị từ tên matchKey. So khớp KHÔNG phân biệt hoa/thường vì matchKey
 * do người dùng gõ tay trong Admin / file Excel.
 */
export function inferCategory(matchKey: string): DeviceCategory {
    const key = String(matchKey || '').trim().toUpperCase();
    if (!key) return 'OTHER';

    for (const entry of CATEGORY_PREFIXES) {
        if (entry.prefixes.some(prefix => key.startsWith(prefix))) {
            return entry.category;
        }
    }
    return 'OTHER';
}

/** Nhóm của một matchKey: ưu tiên khai báo trong meta, không có thì suy luận từ tên. */
export function categoryOf(matchKey: string, meta: MatchKeyMetaMap = {}): DeviceCategory {
    return declaredMetaFor(matchKey, meta)?.category ?? inferCategory(matchKey);
}

/**
 * Món này có phụ thuộc nhãn hiệu người dùng chọn không?
 * meta rỗng ⇒ rơi về suy luận theo tên ⇒ hành vi mặc định an toàn cho mọi caller cũ.
 */
export function isBrandSensitive(matchKey: string, meta: MatchKeyMetaMap = {}): boolean {
    const declared = declaredMetaFor(matchKey, meta)?.brandSensitive;
    if (typeof declared === 'boolean') return declared;
    return BRAND_SENSITIVE_CATEGORIES.includes(inferCategory(matchKey));
}

/** Tạo một bản ghi meta mặc định cho matchKey chưa được khai báo. */
export function defaultMetaFor(matchKey: string): MatchKeyMeta {
    const normalized = normalizeMatchKey(matchKey);
    const category = inferCategory(normalized);
    return {
        matchKey: normalized,
        category,
        brandSensitive: BRAND_SENSITIVE_CATEGORIES.includes(category),
    };
}

type TemplateMap = Record<string, Record<string, { matchKey: string }[]>>;

/**
 * Sinh meta ban đầu từ dữ liệu đang có (library + templates).
 * Dùng cho migration lần đầu. KHÔNG ghi đè meta người dùng đã chỉnh —
 * việc gộp do caller quyết định (xem App.tsx).
 */
export function seedMeta(library: Product[], templates?: TemplateMap): MatchKeyMetaMap {
    const keys = new Set<string>();

    library.forEach(p => {
        const key = normalizeMatchKey(p.matchKey);
        if (key) keys.add(key);
    });

    if (templates) {
        Object.values(templates).forEach(byPower => {
            Object.values(byPower || {}).forEach(items => {
                (items || []).forEach(item => {
                    const key = normalizeMatchKey(item?.matchKey);
                    if (key) keys.add(key);
                });
            });
        });
    }

    const meta: MatchKeyMetaMap = {};
    keys.forEach(key => { meta[key] = defaultMetaFor(key); });
    return meta;
}

/**
 * So sánh để chọn bản ghi "đại diện" cho một matchKey một cách TẤT ĐỊNH.
 * Trước đây `byKey` lấy "ai vào mảng library trước thì thắng" ⇒ brand hiển thị của hàng
 * không phụ thuộc nhãn hiệu đổi theo lịch sử import. Quy tắc mới không phụ thuộc thứ tự mảng:
 *   1) có ibomCode không rỗng   →  2) brand A→Z   →  3) code A→Z   →  4) id A→Z
 */
export function compareProductPreference(a: Product, b: Product): number {
    const aHasIbom = a.ibomCode ? 1 : 0;
    const bHasIbom = b.ibomCode ? 1 : 0;
    if (aHasIbom !== bHasIbom) return bHasIbom - aHasIbom;

    const byBrand = String(a.brand || '').localeCompare(String(b.brand || ''));
    if (byBrand !== 0) return byBrand;

    const byCode = String(a.code || '').localeCompare(String(b.code || ''));
    if (byCode !== 0) return byCode;

    return String(a.id || '').localeCompare(String(b.id || ''));
}

/** Chọn bản ghi đại diện tất định trong một nhóm sản phẩm cùng matchKey. */
export function pickPreferredProduct(products: Product[]): Product | undefined {
    if (!products || products.length === 0) return undefined;
    return [...products].sort(compareProductPreference)[0];
}

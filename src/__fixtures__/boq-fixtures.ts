/**
 * P0.2: Bộ fixture ẩn danh dùng chung cho test (golden case cho core BOQ).
 * Không phụ thuộc localStorage hay dữ liệu cá nhân. Cũng là lưới an toàn
 * "BOQ trước/sau" cho P1.2 (đổi cách biểu diễn công suất).
 */
import type { Product, StarterConfig, TemplateLine } from '../types';

export const fixtureLibrary: Product[] = [
    { id: 'c12', matchKey: 'CONTACTOR_12A', code: 'LC1D12', ibomCode: 'IB-C12', description: 'Contactor 12A', brand: 'Schneider', unit: 'Cái' },
    { id: 't12', matchKey: 'THERMAL_12A', code: 'LRD12', ibomCode: 'IB-T12', description: 'Thermal Relay 12A', brand: 'Schneider', unit: 'Cái' },
    { id: 'mcb32', matchKey: 'MCB_32A', code: 'GV2ME32', ibomCode: 'IB-M32', description: 'Motor CB 32A', brand: 'Schneider', unit: 'Cái' },
    // Case MCT: code rỗng nhưng có ibomCode (R-đã chốt trong spec).
    { id: 'mct50', matchKey: 'MCT_50A', code: '', ibomCode: 'MCT_50-5', description: 'MCT 50/5', brand: 'OMEGA', unit: 'Cái' },
];

const line = (matchKey: string, qty: number): TemplateLine => ({ matchKey, qty });

/** Template hợp lệ + một tier có matchKey không có sản phẩm (để test NOT_FOUND). */
export const fixtureTemplates: Record<string, Record<string, TemplateLine[]>> = {
    DOL: {
        '5.5': [line('CONTACTOR_12A', 1), line('THERMAL_12A', 1), line('MCB_32A', 1)],
        // '7.5' cố ý tham chiếu MISSING_MK (không có trong library) -> NOT_FOUND.
        '7.5': [line('CONTACTOR_12A', 1), line('THERMAL_12A', 1), line('MISSING_MK', 1)],
    },
};

const signalsOff = {
    thermal: false, ptc: false, estop: false, humidity: false,
    isolator_BFP: false, estop_BFP: false, isolator_estop_FB: false,
};

export const fixtureStarters: StarterConfig[] = [
    { id: 's1', type: 'DOL', power: '5.5', quantity: 2, brand: 'Schneider', isolator: false, signals: { ...signalsOff }, loadName: 'Bơm 1' },
    { id: 's2', type: 'DOL', power: '7.5', quantity: 1, brand: 'Schneider', isolator: false, signals: { ...signalsOff }, loadName: 'Bơm 2' },
];

/** Một tier thiếu hẳn template (để test MISSING_TEMPLATE). */
export const fixtureStarterMissingTemplate: StarterConfig = {
    id: 's3', type: 'DOL', power: '999', quantity: 1, brand: 'Schneider', isolator: false, signals: { ...signalsOff },
};

import type { Product, StarterType } from '../types';

export const PRODUCT_LIBRARY: Product[] = [
    // Schneider
    { id: 'sch-c-09', code: 'LC1D09', ibomCode: 'IBOM-001', description: 'Contactor 9A', brand: 'Schneider', unit: 'Cái', matchKey: 'CONTACTOR_9A' },
    { id: 'sch-c-12', code: 'LC1D12', ibomCode: 'IBOM-002', description: 'Contactor 12A', brand: 'Schneider', unit: 'Cái', matchKey: 'CONTACTOR_12A' },
    { id: 'sch-t-09', code: 'LRD09', description: 'Thermal Overload Relay 9A', brand: 'Schneider', unit: 'Cái', matchKey: 'THERMAL_9A' },
    { id: 'sch-cb-32', code: 'GV2ME32', description: 'Motor CB 32A', brand: 'Schneider', unit: 'Cái', matchKey: 'MCB_32A' },

    // Mitsubishi
    { id: 'mit-c-09', code: 'S-T10', description: 'Contactor 10A', brand: 'Mitsubishi', unit: 'Cái', matchKey: 'CONTACTOR_9A' },
    { id: 'mit-t-09', code: 'TH-T18', description: 'Thermal Relay', brand: 'Mitsubishi', unit: 'Cái', matchKey: 'THERMAL_9A' },
    // Isolators
    { id: 'iso-sch-16', code: 'Vario-16', ibomCode: 'IBOM-ISO16', description: 'Isolator Switch 16A', brand: 'Schneider', unit: 'Cái', matchKey: 'ISOLATOR_16A' },

    // Accessories
    { id: 'acc-estop', code: 'XB4BS8442', ibomCode: 'IBOM-ESTOP', description: 'Emergency Stop Button', brand: 'Schneider', unit: 'Cái', matchKey: 'ESTOP' },

    // MCT (Omega)
    { id: 'mct-50', code: '', ibomCode: 'MCT_50-5_CL.3_5VA', description: 'MCT, 50/5, CL.3-5VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'MCT_50A' },
    { id: 'mct-75', code: '', ibomCode: 'MCT_75-5_CL.3_5VA', description: 'MCT đúc, có đế, 75/5, CL.3-5VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'MCT_75A' },
    { id: 'mct-100', code: '', ibomCode: 'MCT_100-5_CL.1_5VA', description: 'MCT đúc, có đế, 100/5, CL.1-5VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'MCT_100A' },
    { id: 'mct-150', code: '', ibomCode: 'MCT_150-5_CL.1_5VA', description: 'MCT đúc, có đế, 150/5, CL.1-5VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'MCT_150A' },
    { id: 'mct-200', code: '', ibomCode: 'MCT_200-5_CL.1_5VA', description: 'MCT đúc, có đế, 200/5, CL.1-5VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'MCT_200A' },
    { id: 'mct-250', code: '', ibomCode: 'MCT_250-5_CL.1_5VA', description: 'MCT đúc, có đế, 250/5, CL.1-5VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'MCT_250A' },
    { id: 'mct-300', code: '', ibomCode: 'MCT_300-5_CL.1_5VA', description: 'MCT đúc, có đế, 300/5, CL.1-5VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'MCT_300A' },
    { id: 'mct-400', code: '', ibomCode: 'MCT_400-5_CL.1_15VA', description: 'MCT đúc, có đế, 400/5, CL.1-15VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'MCT_400A' },
    { id: 'mct-500', code: '', ibomCode: 'MCT_500-5_CL.1_15VA', description: 'MCT đúc, có đế, 500/5, CL.1-15VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'MCT_500A' },
    { id: 'mct-600', code: '', ibomCode: 'MCT_600-5_CL.1_15VA', description: 'MCT đúc, có đế, 600/5, CL.1-15VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'MCT_600A' },
    { id: 'mct-800', code: '', ibomCode: 'MCT_800-5_CL.1_15VA', description: 'MCT đúc, có đế, 800/5, CL.1-15VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'MCT_800A' },

    // PCT (Omega)
    { id: 'pct-100', code: '', ibomCode: 'PCT_100-5_CL.5P10_5VA', description: 'PCT đúc, có đế, 100/5, CL.5P10-5VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'PCT_100A' },
    { id: 'pct-150', code: '', ibomCode: 'PCT_150-5_CL.5P10_5VA', description: 'PCT đúc, có đế, 150/5, CL.5P10-5VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'PCT_150A' },
    { id: 'pct-200', code: '', ibomCode: 'PCT_200-5_CL.5P10_5VA', description: 'PCT đúc, có đế, 200/5, CL.5P10-5VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'PCT_200A' },
    { id: 'pct-250', code: '', ibomCode: 'PCT_250-5_CL.5P10_5VA', description: 'PCT đúc, có đế, 250/5, CL.5P10-5VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'PCT_250A' },
    { id: 'pct-300', code: '', ibomCode: 'PCT_300-5_CL.5P10_5VA', description: 'PCT đúc, có đế, 300/5, CL.5P10-5VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'PCT_300A' },
    { id: 'pct-400', code: '', ibomCode: 'PCT_400-5_CL.5P10_15VA', description: 'PCT đúc, có đế, 400/5, CL.5P10-15VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'PCT_400A' },
    { id: 'pct-500', code: '', ibomCode: 'PCT_500-5_CL.5P10_15VA', description: 'PCT đúc, có đế, 500/5, CL.5P10-15VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'PCT_500A' },
    { id: 'pct-600', code: '', ibomCode: 'PCT_600-5_CL.5P10_15VA', description: 'PCT đúc, có đế, 600/5, CL.5P10-15VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'PCT_600A' },
    { id: 'pct-800', code: '', ibomCode: 'PCT_800-5_CL.5P10_15VA', description: 'PCT đúc, có đế, 800/5, CL.5P10-15VA', brand: 'OMEGA', unit: 'Cái', matchKey: 'PCT_800A' },
];

// Template for what a starter needs (generic matchKeys)
export const STARTER_TEMPLATES: Record<StarterType, Record<string, { matchKey: string; qty: number }[]>> = {
    'DOL': {
        '0.18': [
            { matchKey: 'CONTACTOR_9A', qty: 1 },
            { matchKey: 'THERMAL_9A', qty: 1 },
            { matchKey: 'MCB_32A', qty: 1 }, // Just an example
        ],
        '5.5': [
            { matchKey: 'CONTACTOR_12A', qty: 1 },
            { matchKey: 'THERMAL_12A', qty: 1 },
        ]
    },
    'Star-Delta': {
        '5.5': [
            { matchKey: 'CONTACTOR_9A', qty: 3 },
            { matchKey: 'THERMAL_9A', qty: 1 },
        ]
    },
    'VFD': {},
    'Soft-Starter': {}
};


export interface SizeMapping {
    [rating: string]: {
        [colName: string]: string;
    }
}

export interface QuantityRule {
    groupId: string;
    source: 'FIXED' | 'FRAME_QTY' | 'PANEL_QTY' | 'FRAME_QTY_CONDITIONAL' | 'DEPENDENT' | 'DEPENDENT_SUM' | 'MATCH_SIZE' | 'MATCH_SIZE_PHASE_SPLIT';
    multiplier?: number;
    adder?: number;
    mainGroupId?: string;
    dependentGroupId?: string;
    factor?: number; // legacy
}

export interface DependencyRule {
    id: string;
    mainGroup: string;
    dependentGroup: string;
    strategy: 'SAME_RATING' | 'SIZE_MAPPING' | 'SAME_SIZE';
    mappingKey?: string;
    enabled: boolean;
    quantityConfig?: {
        source: 'FIXED' | 'FRAME_QTY' | 'PANEL_QTY' | 'FRAME_QTY_CONDITIONAL' | 'DEPENDENT' | 'DEPENDENT_SUM' | 'MATCH_SIZE' | 'MATCH_SIZE_PHASE_SPLIT';
        multiplier?: number;
        adder?: number;
        factor?: number; // legacy
    };
}

export interface LogicConfig {
    rules: DependencyRule[];
    mappings: { [key: string]: SizeMapping };
    quantityRules: QuantityRule[];
}

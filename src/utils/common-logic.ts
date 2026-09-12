import commonData from '../data/common-logic.json';
import type { CommonGroup, CommonItem } from '../types';

// Cast the imported data to the correct type
const commonGroups: CommonGroup[] = commonData as unknown as CommonGroup[];

export const getCommonGroups = (): CommonGroup[] => {
    return commonGroups;
};

export const processCommonLogic = (group: CommonGroup): CommonItem[] => {
    // Placeholder for logic processing
    // context will contain things like Amps, Size, etc.

    switch (group.logicType) {
        case 'APPLY_ALL':
            // Return all items
            return group.items;
        case 'SELECT_ONE':
            // Logic to select one item based on context
            return [];
        case 'DEPENDENT':
            // Logic to calculate based on other groups
            return [];
        default:
            return group.items;
    }
};

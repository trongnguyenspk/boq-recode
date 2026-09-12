/**
 * E4: Template Examples
 * Preset templates for users to copy/paste
 */

import type { TemplateDefinition } from '../utils/template-validation';

export const TEMPLATE_EXAMPLES: TemplateDefinition[] = [
    {
        type: 'DOL',
        name: 'DOL Starter - Basic',
        description: 'Direct On-Line starter with contactor, thermal relay, and circuit breaker',
        ratings: {
            '0.18': [
                { matchKey: 'CONTACTOR_9A', qty: 1 },
                { matchKey: 'THERMAL_9A', qty: 1 },
                { matchKey: 'MCB_32A', qty: 1 }
            ],
            '5.5': [
                { matchKey: 'CONTACTOR_12A', qty: 1 },
                { matchKey: 'THERMAL_12A', qty: 1 },
                { matchKey: 'MCB_32A', qty: 1 }
            ]
        }
    },
    {
        type: 'Star-Delta',
        name: 'Star-Delta Starter',
        description: 'Star-Delta starter with 3 contactors for soft starting',
        ratings: {
            '5.5': [
                { matchKey: 'CONTACTOR_9A', qty: 3 },
                { matchKey: 'THERMAL_9A', qty: 1 },
                { matchKey: 'TIMER_STAR_DELTA', qty: 1 }
            ],
            '11': [
                { matchKey: 'CONTACTOR_18A', qty: 3 },
                { matchKey: 'THERMAL_18A', qty: 1 },
                { matchKey: 'TIMER_STAR_DELTA', qty: 1 }
            ]
        }
    },
    {
        type: 'VFD',
        name: 'VFD Starter',
        description: 'Variable Frequency Drive with input/output contactors',
        ratings: {
            '5.5': [
                { matchKey: 'VFD_5.5KW', qty: 1 },
                { matchKey: 'MCCB_25A', qty: 1 },
                { matchKey: 'MCT_25A', qty: 3 }
            ]
        }
    },
    {
        type: 'Soft-Starter',
        name: 'Soft-Starter',
        description: 'Soft starter with bypass contactor',
        ratings: {
            '11': [
                { matchKey: 'SOFT_STARTER_11KW', qty: 1 },
                { matchKey: 'CONTACTOR_25A', qty: 1 },
                { matchKey: 'MCCB_40A', qty: 1 }
            ]
        }
    }
];

/**
 * Get example template by type
 */
export function getExampleByType(type: string): TemplateDefinition | undefined {
    return TEMPLATE_EXAMPLES.find(t => t.type === type);
}

/**
 * Get all example types
 */
export function getExampleTypes(): string[] {
    return TEMPLATE_EXAMPLES.map(t => t.type);
}

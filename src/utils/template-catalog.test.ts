import { describe, expect, it } from 'vitest';
import { toAppTemplateMap } from './template-catalog';

describe('template catalog UI adapter', () => {
    it('normalizes tier arrays and duplicate decimal power keys without dropping lines', () => {
        const templates = toAppTemplateMap([
            {
                starterType: 'DOL',
                id: 'tier-dol-5-5',
                powerKey: '5.50',
                lines: [{ id: 'line-a', matchKey: ' CONTACTOR_9A ', quantity: 2, condition: 'always' }],
            },
            {
                type: 'DOL',
                power: '5,5',
                items: [{ id: 'line-b', matchKey: 'THERMAL_9A', qty: 1 }],
            },
        ]);

        expect(Object.keys(templates)).toEqual(['DOL']);
        expect(templates.DOL['5.5']).toEqual([
            { id: 'line-a', tierId: 'tier-dol-5-5', matchKey: 'CONTACTOR_9A', qty: 2, condition: 'always' },
            { id: 'line-b', matchKey: 'THERMAL_9A', qty: 1 },
        ]);
    });

    it('accepts the legacy nested map and quantity alias', () => {
        const templates = toAppTemplateMap({
            VFD: {
                '7.50': [{ matchKey: 'DRIVE_7A', quantity: 3 }],
            },
        });

        expect(templates.VFD['7.5']?.[0]).toEqual({ matchKey: 'DRIVE_7A', qty: 3 });
    });
});

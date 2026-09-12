import { normalizePowerKey } from '../types';
import type { ComponentCondition } from '../types';
import type { StoredTemplateCatalog } from './storage-registry';

export type AppTemplateLine = {
    id?: string;
    tierId?: string;
    matchKey: string;
    qty: number;
    condition?: ComponentCondition;
};

export type AppTemplateMap = Record<string, Record<string, AppTemplateLine[]>>;

/**
 * Convert the registry's accepted template shapes into the nested map used by
 * the current BOQ UI. Backups and legacy storage may contain either this map
 * or canonical tier records.
 */
export function toAppTemplateMap(templates: StoredTemplateCatalog): AppTemplateMap {
    const result: AppTemplateMap = {};

    const addTier = (rawType: unknown, rawPower: unknown, rawLines: unknown, rawTierId?: unknown): void => {
        const type = String(rawType ?? '').trim();
        const power = normalizePowerKey(rawPower);
        const tierId = typeof rawTierId === 'string' && rawTierId.trim() ? rawTierId.trim() : undefined;
        if (!type || !power || !Array.isArray(rawLines)) return;

        const lines = rawLines.flatMap((rawLine): AppTemplateLine[] => {
            if (!rawLine || typeof rawLine !== 'object') return [];
            const line = rawLine as {
                id?: unknown;
                tierId?: unknown;
                matchKey?: unknown;
                qty?: unknown;
                quantity?: unknown;
                condition?: unknown;
            };
            const matchKey = typeof line.matchKey === 'string' ? line.matchKey.trim() : '';
            if (!matchKey) return [];
            const rawQuantity = line.qty ?? line.quantity;
            const qty = typeof rawQuantity === 'number' && Number.isFinite(rawQuantity)
                ? rawQuantity
                : 1;
            const lineTierId = typeof line.tierId === 'string' && line.tierId.trim()
                ? line.tierId.trim()
                : tierId;
            return [{
                ...(typeof line.id === 'string' && line.id.trim() ? { id: line.id.trim() } : {}),
                ...(lineTierId ? { tierId: lineTierId } : {}),
                matchKey,
                qty,
                ...(typeof line.condition === 'string'
                    ? { condition: line.condition as ComponentCondition }
                    : {}),
            }];
        });

        result[type] ??= {};
        // Appending handles duplicate tiers after power-key normalization (for
        // example `5.50` and `5,5`) without silently dropping any lines.
        result[type][power] = [...(result[type][power] ?? []), ...lines];
    };

    if (Array.isArray(templates)) {
        templates.forEach(tier => {
            addTier(
                tier.starterType ?? tier.type,
                tier.powerKey ?? tier.power,
                tier.lines ?? tier.items,
                tier.id,
            );
        });
    } else {
        Object.entries(templates || {}).forEach(([type, powers]) => {
            Object.entries(powers || {}).forEach(([power, lines]) => addTier(type, power, lines));
        });
    }

    return result;
}

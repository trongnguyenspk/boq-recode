/**
 * E4: Template Validation Utility
 * Validates template JSON structure before saving
 */

import type { StarterType, ComponentCondition } from '../types';

// Template component schema
export interface TemplateComponent {
    /** Optional stable line identity; legacy JSON may omit it. */
    id?: string;
    matchKey: string;
    qty: number;
    condition?: ComponentCondition; // P0-1: giữ điều kiện (isolator/thermal/...) khi round-trip qua JSON editor
}

// Full template schema
export interface TemplateDefinition {
    type: StarterType;
    name: string;
    description?: string;
    ratings: Record<string, TemplateComponent[]>;
}

// Validation result
export interface TemplateValidationResult {
    valid: boolean;
    errors: TemplateValidationError[];
    warnings: string[];
}

export interface TemplateValidationError {
    path: string;
    message: string;
    line?: number;
}

// Valid starter types
const VALID_STARTER_TYPES: StarterType[] = ['DOL', 'Star-Delta', 'VFD', 'Soft-Starter'];

// P0-1: các giá trị condition hợp lệ (khớp union ComponentCondition trong types/index.ts)
// Export ra ngoài để đường nhập Excel dùng chung MỘT danh sách — trước đây
// importTemplatesFromExcel ép kiểu trần `as ComponentCondition` nên condition gõ sai
// lọt thẳng vào template và linh kiện im lặng biến mất khỏi BOQ.
export const VALID_CONDITIONS: ComponentCondition[] = [
    'always', 'isolator', 'thermal', 'ptc', 'humidity', 'estop', 'isolator_BFP', 'estop_BFP', 'isolator_estop_FB'
];

/** Chuẩn hoá + kiểm tra một giá trị condition đọc từ Excel. Trả undefined nếu không hợp lệ. */
export function normalizeCondition(raw: unknown): ComponentCondition | undefined {
    const value = String(raw ?? '').trim();
    if (!value) return 'always';
    return VALID_CONDITIONS.find(c => c.toLowerCase() === value.toLowerCase());
}

/**
 * Validate template object structure
 */
export function validateTemplate(template: unknown): TemplateValidationResult {
    const errors: TemplateValidationError[] = [];
    const warnings: string[] = [];

    // Validate structure
    if (!template || typeof template !== 'object') {
        errors.push({ path: 'root', message: 'Template must be an object' });
        return { valid: false, errors, warnings };
    }

    const t = template as Record<string, unknown>;

    // Validate type
    if (!t.type || typeof t.type !== 'string' || t.type.trim() === '') {
        errors.push({ path: 'type', message: 'Missing required field: type' });
    }
    // Strict validation removed to allow custom types (e.g. "Power_20A", "Valve")

    // Validate name
    if (!t.name || typeof t.name !== 'string') {
        errors.push({ path: 'name', message: 'Missing or invalid field: name (must be string)' });
    }

    // Validate ratings
    if (!t.ratings || typeof t.ratings !== 'object') {
        errors.push({ path: 'ratings', message: 'Missing or invalid field: ratings (must be object)' });
    } else {
        const ratings = t.ratings as Record<string, unknown>;
        for (const [rating, components] of Object.entries(ratings)) {
            if (!Array.isArray(components)) {
                errors.push({
                    path: `ratings.${rating}`,
                    message: `Rating "${rating}" must be an array of components`
                });
                continue;
            }

            // Validate each component
            components.forEach((comp, idx) => {
                if (!comp || typeof comp !== 'object') {
                    errors.push({
                        path: `ratings.${rating}[${idx}]`,
                        message: 'Component must be an object'
                    });
                    return;
                }

                const c = comp as Record<string, unknown>;

                if (!c.matchKey || typeof c.matchKey !== 'string') {
                    errors.push({
                        path: `ratings.${rating}[${idx}].matchKey`,
                        message: 'Component missing matchKey (string)'
                    });
                }

                // P1.1: NaN/Infinity lọt qua check cũ vì `typeof NaN === 'number'` và
                // `NaN <= 0 === false`. Thêm Number.isFinite để chặn NaN/±Infinity.
                if (typeof c.qty !== 'number' || !Number.isFinite(c.qty) || c.qty <= 0) {
                    errors.push({
                        path: `ratings.${rating}[${idx}].qty`,
                        message: 'Component qty must be a positive number'
                    });
                }

                // P0-1: chỉ kiểm khi condition có mặt (optional). Không phá template cũ {matchKey, qty}.
                if (c.condition !== undefined) {
                    if (typeof c.condition !== 'string' || !VALID_CONDITIONS.includes(c.condition as ComponentCondition)) {
                        errors.push({
                            path: `ratings.${rating}[${idx}].condition`,
                            message: `Component condition không hợp lệ (phải là một trong: ${VALID_CONDITIONS.join(', ')})`
                        });
                    }
                }
            });

            // Warn if empty
            if (components.length === 0) {
                warnings.push(`Rating "${rating}" has no components`);
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Validate template JSON string
 */
export function validateTemplateJSON(jsonString: string): TemplateValidationResult {
    // Try to parse JSON
    let template: unknown;
    try {
        template = JSON.parse(jsonString);
    } catch (e) {
        const error = e as SyntaxError;
        // Try to extract line number from error message
        const lineMatch = error.message.match(/position (\d+)/);
        const position = lineMatch ? parseInt(lineMatch[1]) : 0;
        const line = jsonString.substring(0, position).split('\n').length;

        return {
            valid: false,
            errors: [{
                path: 'root',
                message: `Invalid JSON: ${error.message}`,
                line
            }],
            warnings: []
        };
    }

    return validateTemplate(template);
}

/**
 * Convert existing STARTER_TEMPLATES format to new TemplateDefinition format
 */
export function convertLegacyTemplate(
    type: StarterType,
    ratings: Record<string, TemplateComponent[]>
): TemplateDefinition {
    return {
        type,
        name: `${type} Starter Template`,
        description: `Default template for ${type} motor starters`,
        ratings
    };
}

/**
 * Format template for display (pretty print)
 */
export function formatTemplateJSON(template: TemplateDefinition): string {
    return JSON.stringify(template, null, 2);
}

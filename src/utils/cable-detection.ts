/**
 * Cable Size Detection Utility
 * Detects cables larger than a threshold (default: 1.5mm²)
 */

/**
 * Extract cable size from description or product code
 * Patterns: "Cáp CV 2.5", "CV-2.5-DO", "Cáp CV 6-đỏ", "Vcm-0.75-XD"
 * 
 * @param text - Description or product code to parse
 * @returns Cable size in mm² or null if not a cable
 */
export function extractCableSize(text: string): number | null {
    if (!text || typeof text !== 'string') return null;

    // Pattern 1: "Cáp CV X.X" or "Cáp Vcm X.X"
    const descPattern = /Cáp\s+(?:CV|Vcm)\s+(\d+(?:\.\d+)?)/i;
    const descMatch = text.match(descPattern);
    if (descMatch) {
        return parseFloat(descMatch[1]);
    }

    // Pattern 2: "CV-X.X-" or "Vcm-X.X-" in product code
    const codePattern = /(?:CV|Vcm)-(\d+(?:\.\d+)?)/i;
    const codeMatch = text.match(codePattern);
    if (codeMatch) {
        return parseFloat(codeMatch[1]);
    }

    return null;
}

/**
 * Check if item is a cable larger than threshold
 * 
 * @param description - Item description
 * @param productCode - Item product code (optional)
 * @param threshold - Size threshold in mm² (default: 1.5)
 * @returns true if cable size > threshold
 */
export function isCableLargerThan(
    description: string,
    productCode?: string,
    threshold: number = 1.5
): boolean {
    // Try description first
    const sizeFromDesc = extractCableSize(description);
    if (sizeFromDesc !== null && sizeFromDesc > threshold) {
        return true;
    }

    // Try product code
    if (productCode) {
        const sizeFromCode = extractCableSize(productCode);
        if (sizeFromCode !== null && sizeFromCode > threshold) {
            return true;
        }
    }

    return false;
}

/**
 * Get cable size for display
 * 
 * @param description - Item description
 * @param productCode - Item product code (optional)
 * @returns Cable size string (e.g., "2.5mm²") or null
 */
export function getCableSizeLabel(
    description: string,
    productCode?: string
): string | null {
    const size = extractCableSize(description) ?? extractCableSize(productCode ?? '');
    return size !== null ? `${size}mm²` : null;
}

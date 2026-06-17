
import type { CommonItem, CommonGroup, Product } from '../types';
import type { LogicConfig, DependencyRule } from '../types/logic';

// Global static regular expressions to avoid recompilation inside functions
const SIZE_MATCH_REGEX = /(\d+\s*x\s*\d+)/i;
const RATING_AMPS_REGEX = /(\d+)\s*A\b/i;
const CURRENT_TRANSFORMER_RATIO_REGEX = /(\d+)\/5/;
const LETTER_X_GLOBAL_INSENSITIVE_REGEX = /x/gi;
const X_PARSING_REGEX = /^(\d+)\s*x\s*(.+)$/i;

/**
 * Kiểm tra xem mô tả (description) có chứa kích thước (targetSize) một cách chính xác hay không.
 * Sử dụng Regex ranh giới số để tránh khớp nhầm, ví dụ: "10x20" không khớp "10x200" hay "100x20".
 * @param description - Chuỗi mô tả linh kiện
 * @param targetSize - Kích thước cần kiểm tra (ví dụ: "10x20")
 * @returns true nếu khớp chính xác, false nếu không
 */
function isSizeMatch(description: string, targetSize: string): boolean {
    if (!description || !targetSize) return false;
    // Chuẩn hóa: xóa khoảng trắng thừa trong kích thước mục tiêu
    const normalized = targetSize.replace(/\s+/g, '');
    // Tách số chiều rộng (w) và số chiều cao (t) từ targetSize dạng "WxT"
    const parts = normalized.match(/^(\d+)x(\d+)$/i);
    if (!parts) {
        // Không phải dạng NxM: so khớp thủ công bằng chuỗi chuẩn hóa
        return description.replace(/\s+/g, '').toLowerCase().includes(normalized.toLowerCase());
    }
    const [, w, t] = parts;
    // Regex: phải có ranh giới số ở hai đầu của chuỗi WxT để tránh khớp nhầm
    const exactRegex = new RegExp(`(?:^|[^0-9])${w}\\s*[xX]\\s*${t}(?:$|[^0-9])`);
    return exactRegex.test(description.replace(/\s+/g, ' '));
}

// --- Types ---
export interface SelectionState {
    selectedItems: Set<string>;
    selectedGroups: Set<string>;
    selectedQuantities: Record<string, number>;
    selectedProduct: Product | null;
    targetItemKey: string | null; // For handling specific product overrides
}

// --- Helper: Shared Quantity Calculation Logic ---
function computeQtyValue(
    source: string,
    multiplier: number,
    adder: number,
    frameQty: number,
    panelQty: number,
    allGroups: CommonGroup[],
    selection: { items: Set<string>; quantities: Record<string, number> },
    itemOverride?: CommonItem, // The item being calculated
    mainGroupId?: string | null // For MATCH_SIZE etc
): number {
    switch (source) {
        case 'FIXED':
            return (1 * multiplier) + adder;
        case 'FRAME_QTY':
            return (frameQty * multiplier) + adder;
        case 'PANEL_QTY':
            return (panelQty * multiplier) + adder;
        case 'FRAME_QTY_CONDITIONAL':
            const effectiveMultiplier = multiplier * (panelQty > 1 ? 2 : 1);
            return (frameQty * effectiveMultiplier) + adder;
        case 'DEPENDENT':
        case 'DEPENDENT_SUM':
            if (!mainGroupId) return 0;
            const targetGroup = allGroups.find(g => g.id === mainGroupId);
            if (!targetGroup) return 0;
            let sum = 0;
            targetGroup.items.forEach(item => {
                const key = item.ibomCode + item.productCode;
                if (selection.items.has(key)) {
                    sum += selection.quantities[key] ?? 1;
                }
            });
            return (sum * multiplier) + adder;
        case 'MATCH_SIZE':
            if (!itemOverride || !mainGroupId) return 0;
            // Flexible regex
            const sizeMatch = itemOverride.description.match(SIZE_MATCH_REGEX);
            if (!sizeMatch) return 0;
            const targetSize = sizeMatch[1].replace(/\s+/g, '');
            const mainGroup = allGroups.find(g => g.id === mainGroupId);
            let qty = 0;
            if (mainGroup) {
                mainGroup.items.forEach(item => {
                    const key = item.ibomCode + item.productCode;
                    // Sử dụng isSizeMatch để tránh khớp nhầm kích thước
                    if (selection.items.has(key) && isSizeMatch(item.description, targetSize)) {
                        qty += (selection.quantities[key] || 0);
                    }
                });
            }
            return qty * multiplier;
        case 'MATCH_SIZE_PHASE_SPLIT':
            if (!itemOverride || !mainGroupId) return 0;
            const sizeMatchSplit = itemOverride.description.match(SIZE_MATCH_REGEX);
            if (!sizeMatchSplit) return 0;
            const targetSizeSplit = sizeMatchSplit[1].replace(/\s+/g, '');
            const mainGroupSplit = allGroups.find(g => g.id === mainGroupId);
            let qtySplit = 0;
            if (mainGroupSplit) {
                mainGroupSplit.items.forEach(item => {
                    const key = item.ibomCode + item.productCode;
                    // Sử dụng isSizeMatch để tránh khớp nhầm kích thước
                    if (selection.items.has(key) && isSizeMatch(item.description, targetSizeSplit)) {
                        qtySplit += (selection.quantities[key] || 0);
                    }
                });
            }
            // Check Phase Color vs Neutral
            const descLower = itemOverride.description.toLowerCase();
            const isPhase = descLower.includes('đỏ') || descLower.includes('vàng') || descLower.includes('xanh dương') ||
                descLower.includes('red') || descLower.includes('yellow') || descLower.includes('blue');
            if (isPhase) {
                return Math.round((qtySplit / 3) * multiplier);
            }
            return qtySplit * multiplier;
        default:
            return 1;
    }
}

// --- Rule Evaluation ---
export function evaluateAutoSelection(
    triggerGroupId: string,
    isSelecting: boolean,
    currentSelection: { items: Set<string>; groups: Set<string> },
    allGroups: CommonGroup[],
    config: LogicConfig,
    productOverride?: Product | null
): { newItems: Set<string>; newGroups: Set<string>; newQuantities: Record<string, number> } {

    const newItems = new Set(currentSelection.items);
    const newGroups = new Set(currentSelection.groups);
    const newQuantities: Record<string, number> = {};
    const processedGroups = new Set<string>();
    const queue = [triggerGroupId];

    console.log(`[LogicEngine] Starting AutoSelection from: ${triggerGroupId}, IsSelecting: ${isSelecting}`);

    let depth = 0;
    while (queue.length > 0 && depth < 10) {
        const currentTriggerGroup = queue.shift()!;

        if (processedGroups.has(currentTriggerGroup) && currentTriggerGroup !== triggerGroupId) {
            continue;
        }
        processedGroups.add(currentTriggerGroup);

        const activeRules = config.rules.filter(r => r.mainGroup === currentTriggerGroup && r.enabled);

        if (activeRules.length === 0) {
            console.log(`[LogicEngine] Depth ${depth}: Group ${currentTriggerGroup} has no active rules.`);
            continue;
        }

        console.log(`[LogicEngine] Depth ${depth}: Processing ${currentTriggerGroup}, Found ${activeRules.length} rules.`);

        activeRules.forEach(rule => {
            const depGroup = allGroups.find(g => g.id === rule.dependentGroup);
            if (!depGroup) {
                console.warn(`[LogicEngine] Dependent Group ${rule.dependentGroup} not found.`);
                return;
            }

            if (isSelecting) {
                // Find ALL source items from the currentTriggerGroup that are currently selected
                let sourceItems: (CommonItem | Product)[] = [];

                if (currentTriggerGroup === triggerGroupId && productOverride) {
                    // If triggered by a toggle, include the specific product being overridden FIRST
                    sourceItems.push(productOverride);
                }

                // Also find other existing selected items in this group (for cascading logic or multiple selections)
                const groupObj = allGroups.find(g => g.id === currentTriggerGroup);
                if (groupObj) {
                    groupObj.items.forEach(i => {
                        const key = i.ibomCode + i.productCode;
                        if (newItems.has(key)) {
                            // Avoid duplicates if productOverride is already added
                            if (!productOverride || (i.ibomCode + i.productCode) !== (productOverride.ibomCode + productOverride.code)) {
                                sourceItems.push(i);
                            }
                        }
                    });
                }

                if (sourceItems.length === 0) return;

                sourceItems.forEach(sourceItem => {
                    const matchedItems: CommonItem[] = [];
                    const productDesc = sourceItem ? sourceItem.description : '';

                    let rating = 0;
                    if (productDesc) {
                        const ratingMatch = productDesc.match(RATING_AMPS_REGEX);
                        const ratingStr = ratingMatch ? ratingMatch[1] : null;
                        rating = ratingStr ? parseInt(ratingStr) : 0;
                    }

                    if (rule.strategy === 'SAME_RATING' && rating > 0) {
                        // Sử dụng Regex ranh giới số để tránh khớp nhầm, ví dụ: 10A không khớp 210A
                        const exactRatingRegex = new RegExp(`(?:^|[^0-9])${rating}/`);
                        let match = depGroup.items.find(i =>
                            exactRatingRegex.test(i.ibomCode) || exactRatingRegex.test(i.description)
                        );
                        if (!match) {
                            match = depGroup.items.find(i => {
                                const m = i.description.match(CURRENT_TRANSFORMER_RATIO_REGEX);
                                return m && parseInt(m[1]) === rating;
                            });
                        }
                        if (match) matchedItems.push(match);

                    } else if (rule.strategy === 'SAME_SIZE') {
                        const sizeMatch = productDesc.match(SIZE_MATCH_REGEX);
                        if (sizeMatch) {
                            const targetSize = sizeMatch[1].replace(/\s+/g, '');
                            // Sử dụng isSizeMatch để tránh khớp nhầm kích thước
                            const match = depGroup.items.find(i => isSizeMatch(i.description, targetSize));
                            if (match) matchedItems.push(match);
                        }

                    } else if (rule.strategy === 'SIZE_MAPPING') {
                        const mappingKey = rule.mappingKey;
                        if (mappingKey) {
                            const mappingTable = config.mappings[mappingKey];
                            if (mappingTable) {
                                let matchedKey: string | null = null;
                                if (rating > 0) {
                                    const availableRatings = Object.keys(mappingTable).map(k => parseInt(k)).filter(n => !isNaN(n)).sort((a, b) => a - b);
                                    if (availableRatings.length > 0) {
                                        const matchedRating = availableRatings.find(r => r >= rating);
                                        if (matchedRating) matchedKey = matchedRating.toString();
                                    }
                                }
                                if (!matchedKey && productDesc) {
                                    const sizeMatch = productDesc.match(SIZE_MATCH_REGEX);
                                    if (sizeMatch) {
                                        const sizeStr = sizeMatch[1].replace(/\s+/g, '');
                                        matchedKey = Object.keys(mappingTable).find(k => k.replace(/\s+/g, '') === sizeStr) || null;
                                    }
                                }

                                if (matchedKey && mappingTable[matchedKey]) {
                                    console.log(`[LogicEngine] SizeMapping Matched for ${productDesc}: Key=${matchedKey}`); // LOG
                                    const sizes = mappingTable[matchedKey];
                                    console.log(`[DEBUG] Processing mapping key=${matchedKey}, columns=${Object.keys(sizes).join(', ')}`);
                                    Object.entries(sizes).forEach(([colName, sizeVal]) => {
                                        if (!sizeVal) return;
                                        const sizeString = String(sizeVal);
                                        let qty = 1;
                                        let actualSize = sizeString;

                                        // Robust Parsing
                                        const xCount = (sizeString.match(LETTER_X_GLOBAL_INSENSITIVE_REGEX) || []).length;
                                        if (xCount >= 2) {
                                            const partsMatch = sizeString.match(X_PARSING_REGEX);
                                            if (partsMatch) {
                                                qty = parseInt(partsMatch[1]);
                                                actualSize = partsMatch[2];
                                            }
                                        } else {
                                            actualSize = sizeString;
                                        }

                                        const colLower = String(colName || '').toLowerCase();
                                        const matchGroups: string[][] = [];
                                        let qtyPerItem = qty; // Default quantity per item

                                        // Check if this is Heat Shrink rule (flexible detection for renamed groups)
                                        const isHeatShrinkRule = rule.dependentGroup === 'GRP_HEAT_SHRINK' ||
                                            rule.dependentGroup === 'CoNhiet' ||
                                            rule.dependentGroup.toLowerCase().includes('heat') ||
                                            rule.dependentGroup.toLowerCase().includes('nhiet');

                                        // Check if this column is configured as a phase column
                                        // phaseColumns may be defined on extended rule types
                                        const phaseColumns: string[] = (rule as DependencyRule & { phaseColumns?: string[] }).phaseColumns || ['main', 'updown'];
                                        const isPhaseColumn = phaseColumns.some((col: string) =>
                                            colLower.includes(col.toLowerCase())
                                        );
                                        console.log(`[DEBUG] Column="${colName}", colLower="${colLower}", phaseColumns=${JSON.stringify(phaseColumns)}, isPhaseColumn=${isPhaseColumn}, isHeatShrink=${isHeatShrinkRule}`);

                                        if (isPhaseColumn) {
                                            matchGroups.push(['đỏ', 'red']);
                                            matchGroups.push(['vàng', 'yellow']);
                                            matchGroups.push(['xanh dương', 'blue']);

                                            if (isHeatShrinkRule) {
                                                // Cho co nhiệt: qtyPerItem sẽ được tính riêng cho mỗi pha
                                                // bằng thuật toán phân bổ phần dư để đảm bảo tổng chính xác.
                                                // Giá trị tạm thời ở đây (sẽ bị ghi đè trong vòng lặp bên dưới).
                                                qtyPerItem = Math.floor(qty / 3);
                                            } else {
                                                // For Busbar: round to distribute evenly
                                                qtyPerItem = qty >= matchGroups.length && matchGroups.length > 1
                                                    ? Math.max(1, Math.round(qty / matchGroups.length))
                                                    : qty;
                                            }
                                        } else if (colLower.includes('neutral') || colLower === 'trung tính') {
                                            matchGroups.push(['đen', 'black', 'trung tính']);
                                            // For both: use direct quantity
                                            qtyPerItem = qty;
                                            console.log(`[DEBUG] Neutral Column: colName=${colName}, sizeVal=${sizeVal}, qty=${qty}, actualSize=${actualSize}, qtyPerItem=${qtyPerItem}`);
                                        } else if (colLower.includes('earth') || colLower === 'tiếp địa') {
                                            if (isHeatShrinkRule) {
                                                // Skip earth column entirely for Heat Shrink
                                                return;
                                            } else {
                                                // For Busbar: include earth
                                                matchGroups.push(['xanh lá', 'vàng xanh', 'tiếp địa', 'green', 'earth']);
                                                qtyPerItem = qty;
                                            }
                                        } else {
                                            matchGroups.push([]);
                                        }

                                        const potentialMatches = depGroup.items.filter(i => {
                                            const descLower = (i.description || '').toLowerCase();
                                            const noteLower = (i.note || '').toLowerCase();
                                            return i.productCode === actualSize ||
                                                noteLower.includes(actualSize.toLowerCase()) ||
                                                descLower.includes(actualSize.toLowerCase());
                                        });

                                        console.log(`[DEBUG] Size=${actualSize}, potentialMatches=${potentialMatches.length}, isHeatShrink=${isHeatShrinkRule}`);
                                        if (isHeatShrinkRule && potentialMatches.length > 0) {
                                            console.log('[DEBUG] Potential Heat Shrink items:', potentialMatches.map(m => m.description).join(', '));
                                        }

                                        const hasColorMatch = matchGroups.some(keywords =>
                                            keywords.length > 0 && potentialMatches.some(i => {
                                                const d = (i.description || '').toLowerCase();
                                                const n = (i.note || '').toLowerCase();
                                                return keywords.some(k => d.includes(k) || n.includes(k));
                                            })
                                        );

                                        if (hasColorMatch) {
                                            // Thuật toán phân bổ phần dư co nhiệt lẻ:
                                            // Phân phối phần dư (qty % 3) theo thứ tự: Đỏ (0) → Vàng (1) → Xanh dương (2)
                                            // Công thức: mỗi pha nhận baseQty + (idx < remainder ? 1 : 0)
                                            // Đảm bảo tổng số lượng luôn bằng qty gốc, không bị mất phần dư.
                                            const baseQtyPerPhase = Math.floor(qty / 3);
                                            const remainder = qty % 3;

                                            matchGroups.forEach((keywords, idx) => {
                                                let bestMatch: CommonItem | undefined;
                                                if (keywords.length > 0) {
                                                    bestMatch = potentialMatches.find(i => {
                                                        const descLower = (i.description || '').toLowerCase();
                                                        const noteLower = (i.note || '').toLowerCase();
                                                        return keywords.some(k => descLower.includes(k) || noteLower.includes(k));
                                                    });
                                                    // Tính số lượng cho từng pha, kể cả phần dư
                                                    const phaseQty = isHeatShrinkRule
                                                        ? baseQtyPerPhase + (idx < remainder ? 1 : 0)
                                                        : qtyPerItem;
                                                    console.log(`[DEBUG] Color Match ${idx}: keywords=${JSON.stringify(keywords)}, found=${bestMatch?.description || 'NONE'}, phaseQty=${phaseQty}`);
                                                }
                                                if (bestMatch) {
                                                    // Tính lại phaseQty tại đây để dùng trong block
                                                    const phaseQty = isHeatShrinkRule
                                                        ? baseQtyPerPhase + (idx < remainder ? 1 : 0)
                                                        : qtyPerItem;
                                                    // Chỉ thêm vào BOM nếu số lượng > 0
                                                    if (phaseQty > 0) {
                                                        matchedItems.push(bestMatch);
                                                        const key = bestMatch.ibomCode + bestMatch.productCode;
                                                        const prevQty = newQuantities[key] || 0;
                                                        newQuantities[key] = prevQty + phaseQty;
                                                        console.log(`[DEBUG] Added ${bestMatch.ibomCode}: prevQty=${prevQty}, adding=${phaseQty}, newQty=${newQuantities[key]}`);
                                                    }
                                                }
                                            });

                                        } else {
                                            if (potentialMatches.length > 0) {
                                                const bestMatch = potentialMatches[0];
                                                matchedItems.push(bestMatch);
                                                const key = bestMatch.ibomCode + bestMatch.productCode;
                                                const finalQty = qty;
                                                // Log accumulation
                                                // console.log(`[LogicEngine] Adding Generic Item: ${bestMatch.productCode}, Adding Qty: ${finalQty}, Prev Qty: ${newQuantities[key] || 0}`);
                                                newQuantities[key] = (newQuantities[key] || 0) + finalQty;
                                            }
                                        }
                                    });
                                }
                            }
                        }
                    } else {
                        if (depGroup.items.length > 0) matchedItems.push(depGroup.items[0]);
                    }

                    if (matchedItems.length > 0) {
                        matchedItems.forEach(item => {
                            const key = item.ibomCode + item.productCode;
                            newItems.add(key);
                        });
                        newGroups.add(rule.dependentGroup);
                        if (!processedGroups.has(rule.dependentGroup)) {
                            queue.push(rule.dependentGroup);
                        }
                    }
                });

            } else {
                newGroups.delete(rule.dependentGroup);
                depGroup.items.forEach(item => {
                    const key = item.ibomCode + item.productCode;
                    newItems.delete(key);
                    delete newQuantities[key];
                });
                const subRules = config.rules.filter(r => r.mainGroup === rule.dependentGroup);
                subRules.forEach(() => queue.push(rule.dependentGroup)); // Enqueue to process children removal
            }
        });
        depth++;
    }

    return { newItems, newGroups, newQuantities };
}


// --- Quantity Calculation ---
export function calculateQuantity(
    groupId: string,
    frameQty: number,
    panelQty: number,
    allGroups: CommonGroup[],
    selection: { items: Set<string>; quantities: Record<string, number> },
    config: LogicConfig,
    itemOverride?: CommonItem
): number {
    try {
        // 1. Check for Legacy/Explicit Quantity Rule first (Back-compat or overrides)
        const qRule = config.quantityRules?.find(r => r.groupId === groupId);
        if (qRule) {
            return computeQtyValue(qRule.source, qRule.multiplier ?? 1, qRule.adder ?? 0, frameQty, panelQty, allGroups, selection, itemOverride, qRule.mainGroupId || qRule.dependentGroupId);
        }

        // 2. Check for Embedded Quantity Config in Dependency Rule
        const depRules = config.rules.filter(r => r.dependentGroup === groupId && r.enabled);

        const ruleWithQty = depRules.find(r => r.quantityConfig);
        if (ruleWithQty && ruleWithQty.quantityConfig) {
            const qc = ruleWithQty.quantityConfig;
            return computeQtyValue(qc.source, qc.multiplier ?? qc.factor ?? 1, qc.adder ?? 0, frameQty, panelQty, allGroups, selection, itemOverride, ruleWithQty.mainGroup);
        }

        return 1;
    } catch (err) {
        console.error("[LogicEngine] Error in calculateQuantity:", err);
        return 1;
    }
}

// --- Integrity Check ---
export function validateAndCleanConfig(config: LogicConfig, allGroups: CommonGroup[]): LogicConfig {
    const validRules = config.rules.filter(r => {
        return allGroups.some(g => g.id === r.mainGroup) &&
            allGroups.some(g => g.id === r.dependentGroup);
    });

    const validQuantityRules = config.quantityRules.filter(qr => {
        if (qr.source === 'DEPENDENT' || qr.source === 'DEPENDENT_SUM') {
            const targetId = qr.mainGroupId || qr.dependentGroupId;
            if (!targetId || !allGroups.some(g => g.id === targetId)) return false;
        }
        return true;
    });

    // Deduplicate logic...
    const uniqueRules: DependencyRule[] = [];
    const seen = new Set<string>();

    validRules.forEach(r => {
        const key = `${r.mainGroup}-${r.dependentGroup}-${r.strategy}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueRules.push(r);
        } else {
            // Handle duplicates if needed
        }
    });

    return {
        ...config,
        rules: uniqueRules,
        quantityRules: validQuantityRules
    };
}

/**
 * ValidationWarnings Component
 * Part of E2: Validation & Warnings feature
 * Enhanced in P2.3: Validation Panel Styling
 * 
 * Displays validation errors, warnings, and info messages
 * with smooth animations and accessibility improvements.
 * 
 * Accessibility features (following accessibility-compliance skill):
 * - ARIA roles and labels
 * - Keyboard navigation
 * - Screen reader announcements
 * - Focus management
 */

import { AlertCircle, AlertTriangle, Info, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useState, useRef, useEffect, useId } from 'react';
import type { ValidationResult, ValidationIssue } from '../types';

interface ValidationWarningsProps {
    validation: ValidationResult;
    onDismiss?: () => void;
    showDetails?: boolean;
    className?: string;
}

export function ValidationWarnings({
    validation,
    onDismiss,
    showDetails = true,
    className = ''
}: ValidationWarningsProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [showAllWarnings, setShowAllWarnings] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const [contentHeight, setContentHeight] = useState<number | 'auto'>('auto');

    // Unique IDs for ARIA
    const panelId = useId();
    const headerId = useId();

    const { errors, warnings, infos } = validation;
    const totalIssues = errors.length + warnings.length + infos.length;

    // Calculate content height for smooth animation
    useEffect(() => {
        if (contentRef.current) {
            if (isExpanded) {
                setContentHeight(contentRef.current.scrollHeight);
            } else {
                setContentHeight(0);
            }
        }
    }, [isExpanded, showAllWarnings, errors.length, warnings.length, infos.length]);

    // Don't render if no issues
    if (totalIssues === 0) {
        return null;
    }

    // Show max 3 warnings by default, expand to show all
    const displayedWarnings = showAllWarnings ? warnings : warnings.slice(0, 3);
    const hasMoreWarnings = warnings.length > 3;

    // Determine severity level for styling
    const severityLevel = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'info';

    const containerStyles = {
        error: 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950',
        warning: 'border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950',
        info: 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'
    };

    const textStyles = {
        error: 'text-red-800 dark:text-red-200',
        warning: 'text-yellow-800 dark:text-yellow-200',
        info: 'text-blue-800 dark:text-blue-200'
    };

    const iconStyles = {
        error: 'text-red-600 dark:text-red-400',
        warning: 'text-yellow-600 dark:text-yellow-400',
        info: 'text-blue-600 dark:text-blue-400'
    };

    const IconComponent = severityLevel === 'error' ? AlertCircle
        : severityLevel === 'warning' ? AlertTriangle
            : Info;

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
        }
    };

    const getSummaryText = () => {
        const parts: string[] = [];
        if (errors.length > 0) parts.push(`${errors.length} lỗi cần sửa`);
        if (warnings.length > 0) parts.push(`${warnings.length} cảnh báo`);
        if (infos.length > 0) parts.push(`${infos.length} thông báo`);
        return parts.join(', ');
    };

    return (
        <div
            className={`rounded-lg border overflow-hidden transition-all duration-300 ${className} ${containerStyles[severityLevel]}`}
            role="region"
            aria-label="Validation results"
            aria-live="polite"
        >
            {/* Header - Accessible button */}
            <div
                id={headerId}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                aria-controls={panelId}
                className="flex items-center justify-between px-4 py-3 cursor-pointer 
                          hover:bg-black/5 dark:hover:bg-white/5 transition-colors
                          focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                onClick={() => setIsExpanded(!isExpanded)}
                onKeyDown={handleKeyDown}
            >
                <div className="flex items-center gap-2">
                    <IconComponent
                        className={`w-5 h-5 ${iconStyles[severityLevel]} transition-transform duration-200`}
                        aria-hidden="true"
                    />
                    <span className={`font-medium ${textStyles[severityLevel]}`}>
                        {getSummaryText()}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {/* Expand/Collapse indicator */}
                    <span
                        className="text-gray-500 transition-transform duration-300"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                        aria-hidden="true"
                    >
                        <ChevronDown className="w-4 h-4" />
                    </span>

                    {/* Dismiss button */}
                    {onDismiss && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDismiss();
                            }}
                            className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded
                                      focus:outline-none focus:ring-2 focus:ring-blue-500"
                            aria-label="Đóng bảng cảnh báo"
                        >
                            <X className="w-4 h-4 text-gray-500" aria-hidden="true" />
                        </button>
                    )}
                </div>
            </div>

            {/* Content with smooth animation */}
            <div
                id={panelId}
                role="region"
                aria-labelledby={headerId}
                className="overflow-hidden transition-all duration-300 ease-in-out"
                style={{
                    maxHeight: isExpanded && showDetails ? contentHeight : 0,
                    opacity: isExpanded && showDetails ? 1 : 0
                }}
            >
                <div ref={contentRef} className="px-4 pb-4 space-y-2">
                    {/* Errors */}
                    {errors.length > 0 && (
                        <div role="list" aria-label="Danh sách lỗi">
                            {errors.map(issue => (
                                <IssueItem key={issue.id} issue={issue} />
                            ))}
                        </div>
                    )}

                    {/* Warnings */}
                    {displayedWarnings.length > 0 && (
                        <div role="list" aria-label="Danh sách cảnh báo">
                            {displayedWarnings.map(issue => (
                                <IssueItem key={issue.id} issue={issue} />
                            ))}
                        </div>
                    )}

                    {/* Show more warnings button */}
                    {hasMoreWarnings && (
                        <button
                            onClick={() => setShowAllWarnings(!showAllWarnings)}
                            className="text-sm text-yellow-700 dark:text-yellow-300 hover:underline
                                      focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2
                                      rounded px-2 py-1 -ml-2"
                            aria-expanded={showAllWarnings}
                        >
                            {showAllWarnings
                                ? 'Ẩn bớt'
                                : `Xem thêm ${warnings.length - 3} cảnh báo...`
                            }
                        </button>
                    )}

                    {/* Infos */}
                    {infos.length > 0 && (
                        <div role="list" aria-label="Danh sách thông báo">
                            {infos.map(issue => (
                                <IssueItem key={issue.id} issue={issue} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function IssueItem({ issue }: { issue: ValidationIssue }) {
    const severityStyles = {
        error: 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/50',
        warning: 'text-yellow-700 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-900/50',
        info: 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50'
    };

    const Icon = issue.severity === 'error'
        ? AlertCircle
        : issue.severity === 'warning'
            ? AlertTriangle
            : Info;

    return (
        <div
            role="listitem"
            className={`flex items-start gap-2 p-2 rounded text-sm ${severityStyles[issue.severity]}
                       animate-fadeIn`}
        >
            <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
                <div className="font-medium">{issue.message}</div>
                {issue.details && (
                    <div className="text-xs opacity-75 mt-0.5">{issue.details}</div>
                )}
            </div>
        </div>
    );
}

export default ValidationWarnings;

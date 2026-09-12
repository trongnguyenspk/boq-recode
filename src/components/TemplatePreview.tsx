/**
 * E4: Template Preview Component
 * Shows live preview of template with validation status
 */

import { useMemo } from 'react';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import {
    validateTemplateJSON,
    type TemplateValidationResult
} from '../utils/template-validation';

interface TemplatePreviewProps {
    jsonString: string;
}

export function TemplatePreview({ jsonString }: TemplatePreviewProps) {
    const validation = useMemo((): TemplateValidationResult => {
        if (!jsonString.trim()) {
            return {
                valid: false,
                errors: [{ path: 'root', message: 'Template is empty' }],
                warnings: []
            };
        }
        return validateTemplateJSON(jsonString);
    }, [jsonString]);

    // Try to parse for display
    const template = useMemo(() => {
        try {
            return JSON.parse(jsonString);
        } catch {
            return null;
        }
    }, [jsonString]);

    return (
        <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden">
            {/* Validation Status Header */}
            <div className={`px-4 py-3 flex items-center gap-2 ${validation.valid
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                }`}>
                {validation.valid ? (
                    <>
                        <CheckCircle className="w-5 h-5" />
                        <span className="font-medium">Template Valid</span>
                    </>
                ) : (
                    <>
                        <XCircle className="w-5 h-5" />
                        <span className="font-medium">
                            {validation.errors.length} Error{validation.errors.length > 1 ? 's' : ''}
                        </span>
                    </>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Errors */}
                {validation.errors.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="font-medium text-red-600 dark:text-red-400 text-sm uppercase tracking-wide">
                            Errors
                        </h4>
                        {validation.errors.map((err, idx) => (
                            <div
                                key={idx}
                                className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm"
                            >
                                <div className="font-mono text-red-600 dark:text-red-400">
                                    {err.line && <span className="mr-2">Line {err.line}:</span>}
                                    <span className="text-red-500">{err.path}</span>
                                </div>
                                <div className="text-red-700 dark:text-red-300 mt-1">
                                    {err.message}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Warnings */}
                {validation.warnings.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="font-medium text-yellow-600 dark:text-yellow-400 text-sm uppercase tracking-wide flex items-center gap-1">
                            <AlertTriangle className="w-4 h-4" />
                            Warnings
                        </h4>
                        {validation.warnings.map((warn, idx) => (
                            <div
                                key={idx}
                                className="p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md text-sm text-yellow-700 dark:text-yellow-300"
                            >
                                {warn}
                            </div>
                        ))}
                    </div>
                )}

                {/* Template Preview */}
                {template && validation.valid && (
                    <div className="space-y-4">
                        <div>
                            <h4 className="font-medium text-gray-600 dark:text-gray-400 text-sm uppercase tracking-wide mb-2">
                                Template Info
                            </h4>
                            <div className="bg-white dark:bg-gray-700 p-3 rounded-md border dark:border-gray-600">
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <span className="text-gray-500 dark:text-gray-400">Type:</span>
                                    <span className="font-medium">{template.type}</span>
                                    <span className="text-gray-500 dark:text-gray-400">Name:</span>
                                    <span className="font-medium">{template.name}</span>
                                    {template.description && (
                                        <>
                                            <span className="text-gray-500 dark:text-gray-400">Description:</span>
                                            <span className="text-gray-600 dark:text-gray-300">{template.description}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div>
                            <h4 className="font-medium text-gray-600 dark:text-gray-400 text-sm uppercase tracking-wide mb-2">
                                Ratings ({Object.keys(template.ratings || {}).length})
                            </h4>
                            <div className="space-y-2">
                                {Object.entries(template.ratings || {}).map(([rating, components]) => (
                                    <div
                                        key={rating}
                                        className="bg-white dark:bg-gray-700 p-3 rounded-md border dark:border-gray-600"
                                    >
                                        <div className="font-medium text-blue-600 dark:text-blue-400 mb-2">
                                            Rating: {rating}
                                        </div>
                                        <ul className="text-sm space-y-1">
                                            {(components as { matchKey: string; qty: number }[]).map((comp, idx) => (
                                                <li key={idx} className="flex justify-between text-gray-600 dark:text-gray-300">
                                                    <span className="font-mono">{comp.matchKey}</span>
                                                    <span>× {comp.qty}</span>
                                                </li>
                                            ))}
                                            {(components as unknown[]).length === 0 && (
                                                <li className="text-gray-400 italic">No components</li>
                                            )}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * E4: Template Editor Component
 * JSON editor with live preview, examples, and validation
 * 
 * Design decisions (from multi-agent review):
 * - Use textarea instead of Monaco (save 500KB bundle)
 * - Live preview on right side
 * - Examples tab for copy-paste
 * - Strict validation (block save when invalid)
 * - Backup before overwrite
 */

import { useState, useCallback, useEffect } from 'react';
import {
    X, Save, RotateCcw, Copy, Check, BookOpen,
    Code, Eye, AlertTriangle
} from 'lucide-react';
import { TemplatePreview } from './TemplatePreview';
import { TEMPLATE_EXAMPLES } from '../data/template-examples';
import {
    validateTemplateJSON,
    formatTemplateJSON,
    type TemplateDefinition
} from '../utils/template-validation';

interface TemplateEditorProps {
    isOpen: boolean;
    onClose: () => void;
    initialTemplate?: TemplateDefinition;
    onSave: (template: TemplateDefinition) => void;
    templateType?: string;
}

type TabType = 'editor' | 'examples';

export function TemplateEditor({
    isOpen,
    onClose,
    initialTemplate,
    onSave,
    templateType
}: TemplateEditorProps) {
    // State
    const [jsonText, setJsonText] = useState('');
    const [activeTab, setActiveTab] = useState<TabType>('editor');
    const [copied, setCopied] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [backupJson, setBackupJson] = useState<string | null>(null);

    // Initialize with template
    useEffect(() => {
        if (isOpen && initialTemplate) {
            const formatted = formatTemplateJSON(initialTemplate);
            setJsonText(formatted);
            setBackupJson(formatted);
            setHasChanges(false);
        } else if (isOpen && templateType) {
            // Create new template from type
            const example = TEMPLATE_EXAMPLES.find(t => t.type === templateType);
            if (example) {
                setJsonText(formatTemplateJSON(example));
            } else {
                setJsonText(JSON.stringify({
                    type: templateType,
                    name: `${templateType} Template`,
                    description: '',
                    ratings: {}
                }, null, 2));
            }
            setBackupJson(null);
            setHasChanges(false);
        }
    }, [isOpen, initialTemplate, templateType]);

    // Handle text change
    const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setJsonText(e.target.value);
        setHasChanges(true);
    }, []);

    // Validate current JSON
    const validation = validateTemplateJSON(jsonText);

    // Copy to clipboard
    const handleCopy = useCallback(async (text: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, []);

    // Reset to backup
    const handleReset = useCallback(() => {
        if (backupJson) {
            setJsonText(backupJson);
            setHasChanges(false);
        }
    }, [backupJson]);

    // Save template
    const handleSave = useCallback(() => {
        if (!validation.valid) return;

        try {
            const template = JSON.parse(jsonText) as TemplateDefinition;
            onSave(template);
            setBackupJson(jsonText);
            setHasChanges(false);
            onClose();
        } catch {
            // Should not happen if validation passed
            console.error('Failed to parse validated JSON');
        }
    }, [jsonText, validation.valid, onSave, onClose]);

    // Load example
    const handleLoadExample = useCallback((example: TemplateDefinition) => {
        setJsonText(formatTemplateJSON(example));
        setActiveTab('editor');
        setHasChanges(true);
    }, []);

    // Close confirmation
    const handleClose = useCallback(() => {
        if (hasChanges) {
            if (window.confirm('Bạn có thay đổi chưa lưu. Đóng không lưu?')) {
                onClose();
            }
        } else {
            onClose();
        }
    }, [hasChanges, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <Code className="w-6 h-6 text-blue-500" />
                        <h2 className="text-xl font-semibold dark:text-white">
                            Template Editor
                        </h2>
                        {hasChanges && (
                            <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-2 py-1 rounded">
                                Unsaved changes
                            </span>
                        )}
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b dark:border-gray-700">
                    <button
                        onClick={() => setActiveTab('editor')}
                        className={`px-6 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'editor'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                    >
                        <Code className="w-4 h-4" />
                        Editor
                    </button>
                    <button
                        onClick={() => setActiveTab('examples')}
                        className={`px-6 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'examples'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                    >
                        <BookOpen className="w-4 h-4" />
                        Examples
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden">
                    {activeTab === 'editor' ? (
                        <div className="h-full flex">
                            {/* JSON Editor */}
                            <div className="flex-1 flex flex-col border-r dark:border-gray-700">
                                <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-700 flex items-center justify-between">
                                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                        JSON
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleCopy(jsonText)}
                                            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                            title="Copy JSON"
                                        >
                                            {copied ? (
                                                <Check className="w-4 h-4 text-green-500" />
                                            ) : (
                                                <Copy className="w-4 h-4 text-gray-500" />
                                            )}
                                        </button>
                                        {backupJson && (
                                            <button
                                                onClick={handleReset}
                                                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                                title="Reset to original"
                                            >
                                                <RotateCcw className="w-4 h-4 text-gray-500" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <textarea
                                    value={jsonText}
                                    onChange={handleTextChange}
                                    className="flex-1 w-full p-4 font-mono text-sm resize-none focus:outline-none bg-white dark:bg-gray-900 dark:text-gray-100"
                                    placeholder="Enter template JSON..."
                                    spellCheck={false}
                                />
                            </div>

                            {/* Preview */}
                            <div className="flex-1 flex flex-col">
                                <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-700 flex items-center gap-2">
                                    <Eye className="w-4 h-4 text-gray-500" />
                                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                        Live Preview
                                    </span>
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <TemplatePreview jsonString={jsonText} />
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Examples Tab */
                        <div className="h-full overflow-y-auto p-6">
                            <div className="max-w-4xl mx-auto">
                                <p className="text-gray-600 dark:text-gray-400 mb-6">
                                    Chọn một template mẫu để bắt đầu. Click để load vào editor.
                                </p>
                                <div className="grid gap-4">
                                    {TEMPLATE_EXAMPLES.map((example, idx) => (
                                        <div
                                            key={idx}
                                            className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 hover:ring-2 hover:ring-blue-500 cursor-pointer transition-all"
                                            onClick={() => handleLoadExample(example)}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <h4 className="font-medium text-gray-900 dark:text-white">
                                                    {example.name}
                                                </h4>
                                                <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                                                    {example.type}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                                {example.description}
                                            </p>
                                            <div className="text-xs text-gray-500">
                                                {Object.keys(example.ratings).length} rating(s): {Object.keys(example.ratings).join(', ')}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                        {validation.valid ? (
                            <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                                <Check className="w-4 h-4" />
                                Ready to save
                            </span>
                        ) : (
                            <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                                <AlertTriangle className="w-4 h-4" />
                                Fix errors before saving
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!validation.valid}
                            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${validation.valid
                                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                                    : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                                }`}
                        >
                            <Save className="w-4 h-4" />
                            Save Template
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

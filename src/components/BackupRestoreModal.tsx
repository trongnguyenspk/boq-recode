import { Download, Upload, X } from 'lucide-react';
import { useState } from 'react';

interface BackupRestoreModalProps {
    onClose: () => void;
    onImport: (data: any) => void;
}

export function BackupRestoreModal({ onClose, onImport }: BackupRestoreModalProps) {
    const [importing, setImporting] = useState(false);

    const handleExport = async () => {
        try {
            const backup = {
                exportDate: new Date().toISOString(),
                version: '1.0',
                data: {
                    commonGroups: localStorage.getItem('boq_common_groups'),
                    logicConfig: localStorage.getItem('logicConfig'),
                    library: localStorage.getItem('boq_library'),
                    templates: localStorage.getItem('boq_templates'),
                    brands: localStorage.getItem('boq_brands'),
                    projects: localStorage.getItem('boq_projects'), // Include all project data
                    // Also include current project state if disjoint
                    manualItems: localStorage.getItem('boq_manual_items'),
                    bomOverrides: localStorage.getItem('boq_bom_overrides')
                }
            };

            const jsonString = JSON.stringify(backup, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const defaultFileName = `boq-backup-${new Date().toISOString().split('T')[0]}.json`;

            // Try to use File System Access API (Chrome/Edge)
            if ('showSaveFilePicker' in window) {
                try {
                    const handle = await (window as any).showSaveFilePicker({
                        suggestedName: defaultFileName,
                        types: [{
                            description: 'JSON Backup File',
                            accept: { 'application/json': ['.json'] }
                        }]
                    });

                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();

                    alert('✅ Backup exported successfully!\nSaved to: ' + handle.name);
                } catch (err: any) {
                    if (err.name === 'AbortError') {
                        // User cancelled the save dialog
                        return;
                    }
                    throw err;
                }
            } else {
                // Fallback: Standard download (Firefox, Safari, older browsers)
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = defaultFileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                alert('✅ Backup exported successfully!\nFile saved to Downloads folder.\n\n💡 Tip: Use Chrome/Edge for custom save location.');
            }
        } catch (error) {
            console.error('Export failed:', error);
            alert('❌ Export failed! Check console for details.');
        }
    };

    const handleImportClick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            setImporting(true);
            try {
                const text = await file.text();
                const backup = JSON.parse(text);

                // Kiểm tra an toàn cấu trúc dữ liệu nhập
                const { validateBackupJSON } = await import('../utils/import-validation');
                if (!validateBackupJSON(backup)) {
                    throw new Error('Tệp sao lưu không hợp lệ hoặc chứa mã độc hại (kiểm tra schema thất bại)');
                }

                // Restore to localStorage
                if (backup.data.commonGroups) localStorage.setItem('boq_common_groups', backup.data.commonGroups);
                if (backup.data.logicConfig) localStorage.setItem('logicConfig', backup.data.logicConfig);
                if (backup.data.library) localStorage.setItem('boq_library', backup.data.library);
                if (backup.data.templates) localStorage.setItem('boq_templates', backup.data.templates);
                if (backup.data.brands) localStorage.setItem('boq_brands', backup.data.brands);
                if (backup.data.projects) localStorage.setItem('boq_projects', backup.data.projects);
                if (backup.data.manualItems) localStorage.setItem('boq_manual_items', backup.data.manualItems);
                if (backup.data.bomOverrides) localStorage.setItem('boq_bom_overrides', backup.data.bomOverrides);

                alert('✅ Backup restored successfully!\nPage will reload to apply changes.');
                window.location.reload();
            } catch (error) {
                console.error('Import failed:', error);
                alert('❌ Import failed! Make sure you selected a valid backup file.');
                setImporting(false);
            }
        };
        input.click();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border dark:border-gray-700">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                            <Download className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Back-up / Restore</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition"
                    >
                        <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    {/* Info */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">📦 What gets backed up?</h3>
                        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                            <li>✓ All Common Logic Groups</li>
                            <li>✓ Logic Configuration & Rules</li>
                            <li>✓ Product Library</li>
                            <li>✓ Templates & Brands</li>
                            <li>✓ Projects & BOM Data (Starters, Manual Items, Overrides)</li>
                        </ul>
                        <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                            <p className="text-xs text-blue-700 dark:text-blue-300">
                                💡 <strong>Chrome/Edge:</strong> Choose custom save location<br />
                                <span className="text-blue-600 dark:text-blue-400">Firefox/Safari: Auto-saves to Downloads</span>
                            </p>
                        </div>
                    </div>

                    {/* Export Button */}
                    <button
                        onClick={handleExport}
                        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white rounded-lg font-medium transition shadow-lg"
                    >
                        <Download className="w-5 h-5" />
                        <span>Export Backup</span>
                    </button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t dark:border-gray-700"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-white dark:bg-gray-800 text-gray-500">or</span>
                        </div>
                    </div>

                    {/* Import Button */}
                    <button
                        onClick={handleImportClick}
                        disabled={importing}
                        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-lg font-medium transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Upload className="w-5 h-5" />
                        <span>{importing ? 'Restoring...' : 'Restore from Backup'}</span>
                    </button>

                    {/* Warning */}
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                        <p className="text-xs text-yellow-800 dark:text-yellow-200">
                            ⚠️ <strong>Note:</strong> Restoring will overwrite all current data. Make sure to export a current backup first!
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-xl">
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                        💡 Tip: Save backup files to Google Drive for cross-browser/device access
                    </p>
                </div>
            </div>
        </div>
    );
}

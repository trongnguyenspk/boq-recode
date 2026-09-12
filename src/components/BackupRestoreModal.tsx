import { AlertCircle, CheckCircle2, Download, Undo2, Upload, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useProjectStore } from '../stores/projectStore';
import {
    canUndoLastRestore,
    createBackupEnvelope,
    getDefaultStorage,
    restoreBackup,
    undoLastRestore,
    type BackupEnvelope,
    type ProjectSnapshot,
    type StoragePort,
} from '../utils/storage-registry';

interface BackupRestoreModalProps {
    onClose: () => void;
    /** Optional compatibility hook for the parent to refresh catalog state. */
    onImport?: (data: BackupEnvelope) => void;
    /** Refresh local source state after an undo without requiring navigation. */
    onUndo?: (snapshot: ProjectSnapshot, envelope: BackupEnvelope) => void;
    /** Flush the currently edited project before taking the storage snapshot. */
    beforeExport?: () => void;
    storage?: StoragePort;
}

type Status = { kind: 'success' | 'error'; message: string } | undefined;

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function safeFilename(value: string): string {
    const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return normalized || 'boq-backup';
}

function downloadJson(json: string, filename: string): void {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function reloadAfterRestore(): void {
    // Catalog state is owned by App's local state in the current UI. Reloading
    // applies the restored source registry; embedded callers can supply
    // onImport and ignore this best-effort browser refresh.
    try {
        if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
            window.location.reload();
        }
    } catch {
        // jsdom and embedded webviews may not implement navigation.
    }
}

export function BackupRestoreModal({ onClose, onImport, onUndo, beforeExport, storage = getDefaultStorage() }: BackupRestoreModalProps) {
    const [importing, setImporting] = useState(false);
    const [status, setStatus] = useState<Status>();
    const [undoAvailable, setUndoAvailable] = useState(() => canUndoLastRestore(storage));
    const currentProject = useProjectStore(state => state.getCurrentProject());
    const backupScope = useMemo(() => (
        'Catalog source data, projects and the selected project are included. Derived BOQ rows and theme settings are rebuilt or kept local.'
    ), []);

    const handleExport = async () => {
        setStatus(undefined);
        try {
            beforeExport?.();
            const projectState = useProjectStore.getState();
            const envelope = createBackupEnvelope({
                storage,
                projects: projectState.projects,
                currentProjectId: projectState.currentProjectId,
            });
            const jsonString = JSON.stringify(envelope, null, 2);
            const date = new Date().toISOString().slice(0, 10);
            const projectPrefix = safeFilename(currentProject?.metadata.name || 'boq');
            const defaultFileName = `${projectPrefix}-backup-${date}.json`;

            const picker = (window as Window & {
                showSaveFilePicker?: (options: unknown) => Promise<{
                    name: string;
                    createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
                }>;
            }).showSaveFilePicker;
            if (picker) {
                try {
                    const handle = await picker({
                        suggestedName: defaultFileName,
                        types: [{ description: 'JSON Backup File', accept: { 'application/json': ['.json'] } }],
                    });
                    const writable = await handle.createWritable();
                    await writable.write(new Blob([jsonString], { type: 'application/json' }));
                    await writable.close();
                    setStatus({ kind: 'success', message: `Backup exported: ${handle.name}` });
                    return;
                } catch (error) {
                    if (error instanceof DOMException && error.name === 'AbortError') return;
                    // Fall through to a normal download in restricted contexts.
                }
            }
            downloadJson(jsonString, defaultFileName);
            setStatus({ kind: 'success', message: 'Backup exported to the Downloads folder.' });
        } catch (error) {
            console.error('Export failed:', error);
            setStatus({ kind: 'error', message: `Export failed: ${errorMessage(error)}` });
        }
    };

    const handleImportClick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = async (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (!file) return;

            setImporting(true);
            setStatus(undefined);
            try {
                const parsed: unknown = JSON.parse(await file.text());
                const result = restoreBackup(parsed, {
                    storage,
                    onProjectState: snapshot => useProjectStore.getState().replaceProjectState(snapshot),
                });
                onImport?.(result.envelope);
                setUndoAvailable(true);
                setStatus({ kind: 'success', message: 'Backup restored. The previous state can be undone once.' });
                // A caller that receives the envelope can refresh its local
                // catalog/project state immediately. Keep reload as a fallback
                // for legacy callers that do not implement that callback.
                if (!onImport) reloadAfterRestore();
            } catch (error) {
                console.error('Import failed:', error);
                setStatus({ kind: 'error', message: `Restore failed: ${errorMessage(error)}` });
            } finally {
                setImporting(false);
            }
        };
        input.click();
    };

    const handleUndo = () => {
        setStatus(undefined);
        try {
            let restoredProject: ProjectSnapshot | undefined;
            const undone = undoLastRestore(storage, snapshot => {
                restoredProject = snapshot;
                useProjectStore.getState().replaceProjectState(snapshot);
            });
            if (!undone) {
                setUndoAvailable(false);
                setStatus({ kind: 'error', message: 'There is no restore to undo.' });
                return;
            }
            // Re-read the complete registry after undo so embedded callers can
            // refresh catalog state as well as project state without a reload.
            const restoredEnvelope = createBackupEnvelope({ storage });
            const projectSnapshot = restoredProject ?? {
                projects: restoredEnvelope.projects,
                currentProjectId: restoredEnvelope.currentProjectId,
            };
            onUndo?.(projectSnapshot, restoredEnvelope);
            setUndoAvailable(false);
            setStatus({ kind: 'success', message: 'The previous state has been restored.' });
            if (!onUndo) reloadAfterRestore();
        } catch (error) {
            setStatus({ kind: 'error', message: `Undo failed: ${errorMessage(error)}` });
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="backup-title">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border dark:border-gray-700">
                <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                            <Download className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        </div>
                        <h2 id="backup-title" className="text-xl font-bold text-gray-900 dark:text-white">Back-up / Restore</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition" aria-label="Close">
                        <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">Backup scope</h3>
                        <p className="text-sm text-blue-800 dark:text-blue-200">{backupScope}</p>
                    </div>

                    {status && (
                        <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${status.kind === 'success'
                            ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200'
                            : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200'}`} role="status">
                            {status.kind === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                            <span>{status.message}</span>
                        </div>
                    )}

                    <button onClick={handleExport} className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition shadow-lg">
                        <Download className="w-5 h-5" />
                        <span>Export Backup</span>
                    </button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t dark:border-gray-700" /></div>
                        <div className="relative flex justify-center text-sm"><span className="px-2 bg-white dark:bg-gray-800 text-gray-500">or</span></div>
                    </div>

                    <button onClick={handleImportClick} disabled={importing} className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
                        <Upload className="w-5 h-5" />
                        <span>{importing ? 'Restoring...' : 'Restore from Backup'}</span>
                    </button>

                    {undoAvailable && (
                        <button onClick={handleUndo} className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                            <Undo2 className="w-4 h-4" />
                            <span>Undo last restore</span>
                        </button>
                    )}

                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                        <p className="text-xs text-yellow-800 dark:text-yellow-200">Restoring replaces the registered catalog and project source data after validation.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

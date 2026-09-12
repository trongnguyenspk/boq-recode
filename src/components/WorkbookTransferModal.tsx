import {
    AlertCircle,
    AlertTriangle,
    CheckCircle2,
    FileSpreadsheet,
    Info,
    Loader2,
    Plus,
    RefreshCw,
    SkipForward,
    Trash2,
    X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import {
    WORKBOOK_SHEETS,
    type WorkbookChange,
    type WorkbookDiff,
    type WorkbookIssue,
    type WorkbookSheet,
    type WorkbookSheetDiff,
} from '../utils/workbook-pipeline';

export interface WorkbookTransferModalProps {
    isOpen: boolean;
    fileName?: string;
    diff: WorkbookDiff | null;
    onClose: () => void;
    onApply: () => Promise<void> | void;
    /** True while the parent is parsing a workbook and building its diff. */
    isLoading?: boolean;
    /** Alias accepted by callers that use a shorter loading prop name. */
    loading?: boolean;
    /** Optional parent error (for example, a file parsing failure). */
    error?: string | null;
    /** Allows the parent to control the apply spinner when the write is external. */
    isApplying?: boolean;
}

type ChangeKind = 'added' | 'updated' | 'deleted' | 'skipped';

const CHANGE_LABELS: Record<ChangeKind, string> = {
    added: 'Added',
    updated: 'Updated',
    deleted: 'Deleted',
    skipped: 'Skipped',
};

const CHANGE_COLORS: Record<ChangeKind, string> = {
    added: 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800',
    updated: 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
    deleted: 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800',
    skipped: 'text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/60 border-gray-200 dark:border-gray-700',
};

const CHANGE_ICONS: Record<ChangeKind, typeof Plus> = {
    added: Plus,
    updated: RefreshCw,
    deleted: Trash2,
    skipped: SkipForward,
};

function issueContext(issue: WorkbookIssue): string {
    const location = [
        issue.sheet,
        issue.row === undefined ? undefined : `row ${issue.row}`,
        issue.field,
    ].filter(Boolean).join(' / ');
    return location ? `${location}: ${issue.message}` : issue.message;
}

function displayValue(value: unknown): string {
    if (value === undefined) return '-';
    if (value === null) return 'null';
    if (typeof value === 'string') return value || '(empty)';
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}

function changeFields(change: WorkbookChange): string[] {
    if (change.changedFields?.length) return change.changedFields;
    if (!change.before || !change.after) return [];
    return Array.from(new Set([...Object.keys(change.before), ...Object.keys(change.after)]))
        .filter(field => field !== 'Action')
        .filter(field => JSON.stringify(change.before?.[field]) !== JSON.stringify(change.after?.[field]));
}

function changeKey(change: WorkbookChange): string {
    if (change.key) return change.key;
    return change.row === undefined ? '(unknown row)' : `row ${change.row}`;
}

function sheetDiffFor(diff: WorkbookDiff, sheet: WorkbookSheet): WorkbookSheetDiff {
    const existing = diff.sheets?.[sheet];
    if (existing) return existing;

    // Keep the preview useful for callers that provide only the flattened
    // changes while still honoring the public WorkbookDiff shape.
    const changes = (diff.changes || []).filter(change => change.sheet === sheet);
    const isUpsert = (change: WorkbookChange) => change.action === 'upsert' || change.action === 'replace-tier';
    return {
        sheet,
        added: changes.filter(change => isUpsert(change) && !change.before),
        updated: changes.filter(change => isUpsert(change) && Boolean(change.before)),
        deleted: changes.filter(change => change.action === 'delete'),
        skipped: changes.filter(change => change.action === 'skip'),
        additions: changes.filter(change => isUpsert(change) && !change.before),
        updates: changes.filter(change => isUpsert(change) && Boolean(change.before)),
        deletes: changes.filter(change => change.action === 'delete'),
    };
}

function ChangeList({ kind, changes }: { kind: ChangeKind; changes: WorkbookChange[] }) {
    if (changes.length === 0) return null;
    const Icon = CHANGE_ICONS[kind];

    return (
        <section className={`rounded-lg border ${CHANGE_COLORS[kind]}`} aria-label={`${CHANGE_LABELS[kind]} changes`}>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-current/10">
                <Icon className="w-4 h-4" aria-hidden="true" />
                <h4 className="font-medium">{CHANGE_LABELS[kind]} ({changes.length})</h4>
            </div>
            <ul className="max-h-56 overflow-y-auto divide-y divide-current/10 px-3">
                {changes.map((change, index) => {
                    const fields = kind === 'updated' ? changeFields(change) : [];
                    return (
                        <li key={`${change.key}-${change.row ?? index}-${kind}`} className="py-2 text-sm">
                            <div className="font-medium break-all">{changeKey(change)}</div>
                            {kind === 'updated' && fields.length > 0 && (
                                <ul className="mt-1 space-y-0.5 text-xs opacity-90">
                                    {fields.map(field => (
                                        <li key={field} className="break-words">
                                            <span className="font-medium">{field}:</span>{' '}
                                            {displayValue(change.before?.[field])} -&gt; {displayValue(change.after?.[field])}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

function IssueList({ severity, issues }: { severity: WorkbookIssue['severity']; issues: WorkbookIssue[] }) {
    if (issues.length === 0) return null;
    const isError = severity === 'error';
    const isWarning = severity === 'warning';
    const Icon = isError ? AlertCircle : isWarning ? AlertTriangle : Info;
    const style = isError
        ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200'
        : isWarning
            ? 'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200'
            : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200';
    const label = isError ? 'Errors' : isWarning ? 'Warnings' : 'Information';

    return (
        <section className={`rounded-lg border ${style}`} aria-label={label}>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-current/10">
                <Icon className="w-4 h-4" aria-hidden="true" />
                <h3 className="font-medium">{label} ({issues.length})</h3>
            </div>
            <ul className="max-h-48 overflow-y-auto divide-y divide-current/10 px-3">
                {issues.map((issue, index) => (
                    <li key={`${issue.code}-${issue.sheet ?? ''}-${issue.row ?? ''}-${index}`} className="py-2 text-sm break-words">
                        <span className="font-medium">{issue.code}:</span> {issueContext(issue)}
                    </li>
                ))}
            </ul>
        </section>
    );
}

export function WorkbookTransferModal({
    isOpen,
    fileName,
    diff,
    onClose,
    onApply,
    isLoading = false,
    loading = false,
    error = null,
    isApplying: externallyApplying = false,
}: WorkbookTransferModalProps) {
    const titleId = useId();
    const [isApplying, setIsApplying] = useState(false);
    const [applyError, setApplyError] = useState<string | null>(null);
    const busy = isLoading || loading || isApplying || externallyApplying;

    useEffect(() => {
        if (!isOpen) {
            setIsApplying(false);
            setApplyError(null);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !busy) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, busy, onClose]);

    const issueCounts = useMemo(() => {
        const issues = diff?.issues || [];
        return {
            errors: issues.filter(issue => issue.severity === 'error'),
            warnings: issues.filter(issue => issue.severity === 'warning'),
            infos: issues.filter(issue => issue.severity === 'info'),
        };
    }, [diff]);

    const sheetRows = useMemo(() => {
        if (!diff) return [];
        return WORKBOOK_SHEETS.map(sheet => {
            const current = sheetDiffFor(diff, sheet);
            return {
                sheet,
                added: current.added || current.additions || [],
                updated: current.updated || current.updates || [],
                deleted: current.deleted || current.deletes || [],
                skipped: current.skipped || [],
            };
        });
    }, [diff]);

    const totals = useMemo(() => sheetRows.reduce((result, row) => ({
        added: result.added + row.added.length,
        updated: result.updated + row.updated.length,
        deleted: result.deleted + row.deleted.length,
        skipped: result.skipped + row.skipped.length,
    }), { added: 0, updated: 0, deleted: 0, skipped: 0 }), [sheetRows]);

    if (!isOpen) return null;

    const hasBlockingError = issueCounts.errors.length > 0 || Boolean(error);
    const canApply = Boolean(diff) && !busy && !hasBlockingError;

    const handleApply = async () => {
        if (!canApply) return;
        setApplyError(null);
        setIsApplying(true);
        try {
            await onApply();
            onClose();
        } catch (caught) {
            setApplyError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setIsApplying(false);
        }
    };

    const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget && !busy) onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onMouseDown={handleBackdropClick}
        >
            <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
                <header className="flex items-center justify-between gap-4 border-b border-gray-200 p-4 dark:border-gray-700">
                    <div className="flex min-w-0 items-center gap-3">
                        <FileSpreadsheet className="h-6 w-6 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
                        <div className="min-w-0">
                            <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-white">Workbook import preview</h2>
                            <p className="truncate text-sm text-gray-500 dark:text-gray-400" title={fileName || undefined}>{fileName || 'No file selected'}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="shrink-0 rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700"
                        aria-label="Close workbook preview"
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                    {(isLoading || loading) && (
                        <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-gray-600 dark:text-gray-300" role="status" aria-live="polite">
                            <Loader2 className="h-7 w-7 animate-spin text-blue-600" aria-hidden="true" />
                            <span>Reading workbook and building preview...</span>
                        </div>
                    )}

                    {!isLoading && !loading && error && (
                        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200" role="alert">
                            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                            <div>
                                <p className="font-medium">Unable to preview workbook</p>
                                <p className="mt-1 text-sm break-words">{error}</p>
                            </div>
                        </div>
                    )}

                    {!isLoading && !loading && !error && !diff && (
                        <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-gray-500 dark:text-gray-400">
                            <FileSpreadsheet className="h-8 w-8" aria-hidden="true" />
                            <p>No workbook changes to preview.</p>
                        </div>
                    )}

                    {!isLoading && !loading && !error && diff && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Workbook change totals">
                                <SummaryCount label="Added" value={totals.added} tone="green" />
                                <SummaryCount label="Updated" value={totals.updated} tone="blue" />
                                <SummaryCount label="Deleted" value={totals.deleted} tone="red" />
                                <SummaryCount label="Skipped" value={totals.skipped} tone="gray" />
                            </div>

                            <section aria-labelledby={`${titleId}-sheets`}>
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <h3 id={`${titleId}-sheets`} className="text-base font-semibold text-gray-900 dark:text-white">Changes by sheet</h3>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">Schema v{diff.schemaVersion}</span>
                                </div>
                                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                                    <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                                        <thead className="bg-gray-50 dark:bg-gray-900/50">
                                            <tr>
                                                <th scope="col" className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Sheet</th>
                                                <th scope="col" className="px-3 py-2 text-right font-medium text-green-700 dark:text-green-300">Added</th>
                                                <th scope="col" className="px-3 py-2 text-right font-medium text-blue-700 dark:text-blue-300">Updated</th>
                                                <th scope="col" className="px-3 py-2 text-right font-medium text-red-700 dark:text-red-300">Deleted</th>
                                                <th scope="col" className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Skipped</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                            {sheetRows.map(row => (
                                                <tr key={row.sheet}>
                                                    <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-800 dark:text-gray-200">{row.sheet}</th>
                                                    <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{row.added.length}</td>
                                                    <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{row.updated.length}</td>
                                                    <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{row.deleted.length}</td>
                                                    <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{row.skipped.length}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            <div className="space-y-4">
                                {sheetRows.map(row => {
                                    const count = row.added.length + row.updated.length + row.deleted.length + row.skipped.length;
                                    if (count === 0) return null;
                                    return (
                                        <section key={row.sheet} className="border-t border-gray-200 pt-4 first:border-t-0 first:pt-0 dark:border-gray-700" aria-labelledby={`${titleId}-${row.sheet}`}>
                                            <h3 id={`${titleId}-${row.sheet}`} className="mb-3 text-base font-semibold text-gray-900 dark:text-white">{row.sheet}</h3>
                                            <div className="grid gap-3 lg:grid-cols-2">
                                                <ChangeList kind="added" changes={row.added} />
                                                <ChangeList kind="updated" changes={row.updated} />
                                                <ChangeList kind="deleted" changes={row.deleted} />
                                                <ChangeList kind="skipped" changes={row.skipped} />
                                            </div>
                                        </section>
                                    );
                                })}
                            </div>

                            <div className="space-y-3">
                                <IssueList severity="error" issues={issueCounts.errors} />
                                <IssueList severity="warning" issues={issueCounts.warnings} />
                                <IssueList severity="info" issues={issueCounts.infos} />
                                {issueCounts.errors.length === 0 && issueCounts.warnings.length === 0 && issueCounts.infos.length === 0 && (
                                    <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200" role="status">
                                        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                                        <span>No validation issues found.</span>
                                    </div>
                                )}
                            </div>

                            {applyError && (
                                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200" role="alert">
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                    <span>Apply failed: {applyError}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <footer className="flex flex-col-reverse gap-2 border-t border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-end dark:border-gray-700">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleApply}
                        disabled={!canApply}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        title={hasBlockingError ? 'Fix workbook errors before applying' : undefined}
                    >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                        {isApplying || externallyApplying ? 'Applying...' : 'Apply changes'}
                    </button>
                </footer>
            </div>
        </div>
    );
}

function SummaryCount({ label, value, tone }: { label: string; value: number; tone: 'green' | 'blue' | 'red' | 'gray' }) {
    const toneStyles = {
        green: 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200',
        blue: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200',
        red: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200',
        gray: 'border-gray-200 bg-gray-50 text-gray-800 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-200',
    };
    return (
        <div className={`rounded-lg border px-3 py-2 ${toneStyles[tone]}`}>
            <div className="text-xs font-medium uppercase tracking-wide opacity-75">{label}</div>
            <div className="mt-0.5 text-xl font-semibold">{value}</div>
        </div>
    );
}

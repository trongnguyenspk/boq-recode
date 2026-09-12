import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TemplateEditor } from './TemplateEditor';
import type { TemplateDefinition } from '../utils/template-validation';

// Use real utilities
import { validateTemplateJSON } from '../utils/template-validation';

// Mock hooks and components
vi.mock('./ui/Toast', () => ({
    useToast: () => ({ showToast: vi.fn() })
}));

vi.mock('./TemplatePreview', () => ({
    TemplatePreview: () => <div data-testid="template-preview">Preview</div>
}));

// Mock Lucide icons
vi.mock('lucide-react', () => ({
    X: () => <span data-testid="icon-x">X</span>,
    Save: () => <span data-testid="icon-save">Save</span>,
    RefreshCcw: () => <span data-testid="icon-refresh">Refresh</span>,
    RotateCcw: () => <span data-testid="icon-reset">Reset</span>,
    Check: () => <span data-testid="icon-check">Check</span>,
    AlertTriangle: () => <span data-testid="icon-alert">Alert</span>,
    BookOpen: () => <span data-testid="icon-book">Book</span>,
    Code: () => <span data-testid="icon-code">Code</span>,
    Copy: () => <span data-testid="icon-copy">Copy</span>,
    Eye: () => <span data-testid="icon-eye">Eye</span>
}));

describe('TemplateEditor', () => {
    const mockOnClose = vi.fn();
    const mockOnSave = vi.fn();

    const initialTemplate: TemplateDefinition = {
        type: 'DOL',
        name: 'DOL Template',
        ratings: {
            '10kW': [{ matchKey: 'TEST', qty: 1 }]
        }
    };

    it('should not render when not open', () => {
        render(
            <TemplateEditor
                isOpen={false}
                onClose={mockOnClose}
                templateType="DOL"
                onSave={mockOnSave}
            />
        );
        expect(screen.queryByText('Edit Template: DOL')).not.toBeInTheDocument();
    });

    it('should render correct title and initial JSON', async () => {
        render(
            <TemplateEditor
                isOpen={true}
                onClose={mockOnClose}
                templateType="DOL"
                initialTemplate={initialTemplate}
                onSave={mockOnSave}
            />
        );

        expect(screen.getByText('Template Editor')).toBeInTheDocument();

        // Check if textarea contains the JSON
        const textarea = screen.getByPlaceholderText('Enter template JSON...');
        expect(textarea).toBeInTheDocument();

        // Check content (async due to useEffect)
        await waitFor(() => {
            const val = (textarea as HTMLTextAreaElement).value;
            // console.error('DEBUG VAL:', val);
            expect(val).toContain('"type": "DOL"');
        }, { timeout: 2000 });
    });

    it('should call onClose when close button is clicked', () => {
        render(
            <TemplateEditor
                isOpen={true}
                onClose={mockOnClose}
                templateType="DOL"
                onSave={mockOnSave}
            />
        );

        fireEvent.click(screen.getByLabelText('Close'));
        expect(mockOnClose).toHaveBeenCalled();
    });

    it('should disable save button when JSON is invalid', () => {
        render(
            <TemplateEditor
                isOpen={true}
                onClose={mockOnClose}
                templateType="DOL"
                initialTemplate={initialTemplate}
                onSave={mockOnSave}
            />
        );

        const textarea = screen.getByPlaceholderText('Enter template JSON...');
        fireEvent.change(textarea, { target: { value: '{ invalid json' } });

        const saveBtn = screen.getByText('Save Template').closest('button');
        expect(saveBtn).toBeDisabled();

        // Should show error message (mocked response)
        expect(screen.getByText(/Fix errors before saving/i)).toBeInTheDocument(); // Updated text expectation
    });
});

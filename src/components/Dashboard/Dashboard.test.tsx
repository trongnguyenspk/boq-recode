
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dashboard } from './Dashboard';
import type { StarterConfig, BOMItem, ValidationResult } from '../../types';

// Mock Lucide icons
vi.mock('lucide-react', () => ({
    X: () => <span data-testid="icon-x">X</span>,
    Zap: () => <span data-testid="icon-zap">Zap</span>,
    Box: () => <span data-testid="icon-box">Box</span>,
    CheckCircle: () => <span data-testid="icon-check">Check</span>,
    TrendingUp: () => <span data-testid="icon-trend">Trend</span>,
    AlertTriangle: () => <span data-testid="icon-alert">Alert</span>,
    Activity: () => <span data-testid="icon-activity">Activity</span>
}));

describe('Dashboard', () => {
    const mockOnClose = vi.fn();

    // Mock Data
    const mockStarters: StarterConfig[] = [
        { id: '1', name: 'Starter 1', type: 'DOL', rating: '11kW' } as any,
        { id: '2', name: 'Starter 2', type: 'VFD', rating: '15kW' } as any,
        { id: '3', name: 'Starter 3', type: 'DOL', rating: '5kW' } as any,
    ];

    const mockBOM: BOMItem[] = [
        { id: '1', productCode: 'P1' } as any,
        { id: '2', productCode: 'P2' } as any,
        { id: '3', productCode: 'P3' } as any,
    ];

    const mockValidation: ValidationResult = {
        isValid: true,
        hasWarnings: false,
        errors: [],
        warnings: [],
        infos: []
    };

    const mockValidationWithErrors: ValidationResult = {
        isValid: false,
        hasWarnings: true,
        errors: [{ id: 'e1', severity: 'error', message: 'Critical Error', starterId: '1' }],
        warnings: [{ id: 'w1', severity: 'warning', message: 'Warning 1' }],
        infos: []
    };

    it('should not render when not open', () => {
        render(
            <Dashboard
                isOpen={false}
                onClose={mockOnClose}
                starters={mockStarters}
                bom={mockBOM}
                validation={mockValidation}
            />
        );
        expect(screen.queryByText('Project Dashboard')).not.toBeInTheDocument();
    });

    it('should render KPI cards with correct data', () => {
        render(
            <Dashboard
                isOpen={true}
                onClose={mockOnClose}
                starters={mockStarters}
                bom={mockBOM}
                validation={mockValidation}
            />
        );

        expect(screen.getByText('Total Starters')).toBeInTheDocument();
        // Check for '3' appearing multiple times (Starters and Components)
        const threes = screen.getAllByText('3');
        expect(threes.length).toBeGreaterThanOrEqual(2);

        expect(screen.getByText('Total Components')).toBeInTheDocument();
    });

    it('should calculate and display health score', () => {
        render(
            <Dashboard
                isOpen={true}
                onClose={mockOnClose}
                starters={mockStarters}
                bom={mockBOM}
                validation={mockValidation} // No errors = 100%
            />
        );
        expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('should reduce health score with errors', () => {
        render(
            <Dashboard
                isOpen={true}
                onClose={mockOnClose}
                starters={mockStarters}
                bom={mockBOM}
                validation={mockValidationWithErrors} // 1 Error, 1 Warning = 2 issues * 5 = 10 deduction => 90%;
            />
        );
        // Calculation: 100 - (2 * 5) = 90
        expect(screen.getByText('90%')).toBeInTheDocument();

        // Should show issue count '2'
        const twos = screen.getAllByText('2');
        expect(twos.length).toBeGreaterThanOrEqual(1);
    });

    it('should render Type Distribution Chart', () => {
        render(
            <Dashboard
                isOpen={true}
                onClose={mockOnClose}
                starters={mockStarters}
                bom={mockBOM}
                validation={mockValidation}
            />
        );

        // Use getAllByText because names might appear in chart and insights
        expect(screen.getAllByText('DOL').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('VFD').length).toBeGreaterThanOrEqual(1);

        // Percentages: DOL = 2/3 = 67%, VFD = 1/3 = 33%
        expect(screen.getAllByText(/67%/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/33%/).length).toBeGreaterThanOrEqual(1);
    });

    it('should close when X button is clicked', () => {
        render(
            <Dashboard
                isOpen={true}
                onClose={mockOnClose}
                starters={mockStarters}
                bom={mockBOM}
                validation={mockValidation}
            />
        );
        const closeBtn = screen.getAllByRole('button')[0]; // First button is usually Close in header
        fireEvent.click(closeBtn);
        expect(mockOnClose).toHaveBeenCalled();
    });
});

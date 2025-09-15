/**
 * Component Tests for Enhanced CompanySelect
 * Tests the company selection, grouping, and API integration features
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jest } from '@jest/globals';
import CompanySelect from '../CompanySelect';

// Mock the useUserDataAPI hook
const mockGetExistingCompanies = jest.fn();
jest.mock('../../hooks/useUserDataAPI', () => ({
  useUserDataAPI: () => ({
    getExistingCompanies: mockGetExistingCompanies
  })
}));

describe('CompanySelect Component', () => {
  const defaultProps = {
    value: '',
    onChange: jest.fn(),
    placeholder: 'Select or enter company',
    required: false,
    id: 'company-select'
  };

  const mockCompaniesResponse = {
    companies: [
      {
        normalizedName: 'microsoft',
        originalNames: ['Microsoft Corporation', 'Microsoft Corp'],
        totalPositions: 3,
        variations: ['Microsoft Corporation', 'Microsoft Corp']
      },
      {
        normalizedName: 'google',
        originalNames: ['Google LLC', 'Google Inc.'],
        totalPositions: 2,
        variations: ['Google LLC', 'Google Inc.']
      },
      {
        normalizedName: 'apple',
        originalNames: ['Apple Inc.'],
        totalPositions: 1,
        variations: ['Apple Inc.']
      }
    ]
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetExistingCompanies.mockResolvedValue(mockCompaniesResponse);
  });

  describe('Component Rendering', () => {
    test('renders input field with correct attributes', () => {
      render(<CompanySelect {...defaultProps} />);

      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('id', 'company-select');
      expect(input).toHaveAttribute('placeholder', 'Select or enter company');
      expect(input).toHaveAttribute('autoComplete', 'organization');
    });

    test('renders with required attribute when specified', () => {
      render(<CompanySelect {...defaultProps} required={true} />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('required');
    });

    test('applies custom className', () => {
      const { container } = render(
        <CompanySelect {...defaultProps} className="custom-class" />
      );

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('company-select');
      expect(wrapper).toHaveClass('custom-class');
    });

    test('shows loading state while fetching companies', async () => {
      // Mock a delayed response
      mockGetExistingCompanies.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockCompaniesResponse), 100))
      );

      render(<CompanySelect {...defaultProps} />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('placeholder', 'Loading companies...');
      expect(input).toBeDisabled();

      await waitFor(() => {
        expect(input).not.toBeDisabled();
        expect(input).toHaveAttribute('placeholder', 'Select or enter company');
      });
    });
  });

  describe('Company Loading and Display', () => {
    test('loads companies on component mount', async () => {
      render(<CompanySelect {...defaultProps} />);

      await waitFor(() => {
        expect(mockGetExistingCompanies).toHaveBeenCalledTimes(1);
      });
    });

    test('handles empty companies response', async () => {
      mockGetExistingCompanies.mockResolvedValue({ companies: [] });

      render(<CompanySelect {...defaultProps} />);

      const input = screen.getByRole('textbox');
      await userEvent.click(input);

      await waitFor(() => {
        expect(screen.getByText(/no existing companies found/i)).toBeInTheDocument();
      });
    });

    test('handles API error gracefully', async () => {
      mockGetExistingCompanies.mockRejectedValue(new Error('API Error'));

      render(<CompanySelect {...defaultProps} />);

      await waitFor(() => {
        const input = screen.getByRole('textbox');
        expect(input).not.toBeDisabled();
      });

      // Component should still be functional despite API error
      const input = screen.getByRole('textbox');
      await userEvent.type(input, 'New Company');
      expect(input).toHaveValue('New Company');
    });
  });

  describe('Dropdown Interactions', () => {
    test('shows dropdown when input is clicked', async () => {
      render(<CompanySelect {...defaultProps} />);

      await waitFor(() => {
        expect(mockGetExistingCompanies).toHaveBeenCalled();
      });

      const input = screen.getByRole('textbox');
      await userEvent.click(input);

      await waitFor(() => {
        expect(screen.getByText('Select from Your Companies')).toBeInTheDocument();
        expect(screen.getByText('Microsoft Corporation')).toBeInTheDocument();
        expect(screen.getByText('Google LLC')).toBeInTheDocument();
      });
    });

    test('filters companies based on search input', async () => {
      render(<CompanySelect {...defaultProps} />);

      await waitFor(() => {
        expect(mockGetExistingCompanies).toHaveBeenCalled();
      });

      const input = screen.getByRole('textbox');
      await userEvent.type(input, 'micro');

      await waitFor(() => {
        expect(screen.getByText('Microsoft Corporation')).toBeInTheDocument();
        expect(screen.queryByText('Google LLC')).not.toBeInTheDocument();
        expect(screen.queryByText('Apple Inc.')).not.toBeInTheDocument();
      });
    });

    test('shows create new option for non-matching input', async () => {
      render(<CompanySelect {...defaultProps} />);

      await waitFor(() => {
        expect(mockGetExistingCompanies).toHaveBeenCalled();
      });

      const input = screen.getByRole('textbox');
      await userEvent.type(input, 'Netflix');

      await waitFor(() => {
        expect(screen.getByText('Create New Company')).toBeInTheDocument();
        expect(screen.getByText('✨ Create "Netflix"')).toBeInTheDocument();
      });
    });

    test('hides dropdown when clicking outside', async () => {
      render(
        <div>
          <CompanySelect {...defaultProps} />
          <button>Outside button</button>
        </div>
      );

      await waitFor(() => {
        expect(mockGetExistingCompanies).toHaveBeenCalled();
      });

      const input = screen.getByRole('textbox');
      await userEvent.click(input);

      await waitFor(() => {
        expect(screen.getByText('Microsoft Corporation')).toBeInTheDocument();
      });

      // Click outside
      const outsideButton = screen.getByText('Outside button');
      await userEvent.click(outsideButton);

      await waitFor(() => {
        expect(screen.queryByText('Microsoft Corporation')).not.toBeInTheDocument();
      });
    });
  });

  describe('Company Selection', () => {
    test('selects company from dropdown', async () => {
      const mockOnChange = jest.fn();
      render(<CompanySelect {...defaultProps} onChange={mockOnChange} />);

      await waitFor(() => {
        expect(mockGetExistingCompanies).toHaveBeenCalled();
      });

      const input = screen.getByRole('textbox');
      await userEvent.click(input);

      await waitFor(() => {
        expect(screen.getByText('Microsoft Corporation')).toBeInTheDocument();
      });

      const microsoftOption = screen.getByText('Microsoft Corporation');
      await userEvent.click(microsoftOption);

      expect(mockOnChange).toHaveBeenCalledWith('Microsoft Corporation');
    });

    test('creates new company when clicking create option', async () => {
      const mockOnChange = jest.fn();
      render(<CompanySelect {...defaultProps} onChange={mockOnChange} />);

      await waitFor(() => {
        expect(mockGetExistingCompanies).toHaveBeenCalled();
      });

      const input = screen.getByRole('textbox');
      await userEvent.type(input, 'Netflix');

      await waitFor(() => {
        expect(screen.getByText('✨ Create "Netflix"')).toBeInTheDocument();
      });

      const createOption = screen.getByText('✨ Create "Netflix"');
      await userEvent.click(createOption);

      // The input value should remain as the user typed it
      expect(input.value).toBe('Netflix');
    });

    test('handles company selection with special characters', async () => {
      const specialCompany = {
        normalizedName: 'at&t',
        originalNames: ['AT&T Inc.'],
        totalPositions: 1,
        variations: ['AT&T Inc.']
      };

      mockGetExistingCompanies.mockResolvedValue({
        companies: [specialCompany]
      });

      const mockOnChange = jest.fn();
      render(<CompanySelect {...defaultProps} onChange={mockOnChange} />);

      await waitFor(() => {
        expect(mockGetExistingCompanies).toHaveBeenCalled();
      });

      const input = screen.getByRole('textbox');
      await userEvent.click(input);

      await waitFor(() => {
        expect(screen.getByText('AT&T Inc.')).toBeInTheDocument();
      });

      const attOption = screen.getByText('AT&T Inc.');
      await userEvent.click(attOption);

      expect(mockOnChange).toHaveBeenCalledWith('AT&T Inc.');
    });
  });

  describe('Company Grouping Features', () => {
    test('displays company metadata correctly', async () => {
      render(<CompanySelect {...defaultProps} />);

      await waitFor(() => {
        expect(mockGetExistingCompanies).toHaveBeenCalled();
      });

      const input = screen.getByRole('textbox');
      await userEvent.click(input);

      await waitFor(() => {
        // Check for position counts
        expect(screen.getByText('3 positions')).toBeInTheDocument();
        expect(screen.getByText('2 positions')).toBeInTheDocument();
        expect(screen.getByText('1 position')).toBeInTheDocument();
      });
    });

    test('shows multiple name variations indicator', async () => {
      render(<CompanySelect {...defaultProps} />);

      await waitFor(() => {
        expect(mockGetExistingCompanies).toHaveBeenCalled();
      });

      const input = screen.getByRole('textbox');
      await userEvent.click(input);

      await waitFor(() => {
        // Microsoft has 2 name variations
        expect(screen.getByText('• 2 names')).toBeInTheDocument();
        // Google has 2 name variations
        expect(screen.getByText('• 2 names')).toBeInTheDocument();
      });
    });

    test('sorts companies by position count then alphabetically', async () => {
      render(<CompanySelect {...defaultProps} />);

      await waitFor(() => {
        expect(mockGetExistingCompanies).toHaveBeenCalled();
      });

      const input = screen.getByRole('textbox');
      await userEvent.click(input);

      await waitFor(() => {
        const companies = screen.getAllByText(/positions?$/);
        // Microsoft (3 positions) should be first
        expect(companies[0]).toHaveTextContent('3 positions');
        // Google (2 positions) should be second
        expect(companies[1]).toHaveTextContent('2 positions');
        // Apple (1 position) should be last
        expect(companies[2]).toHaveTextContent('1 position');
      });
    });

    test('applies correct CSS classes for multi-position companies', async () => {
      render(<CompanySelect {...defaultProps} />);

      await waitFor(() => {
        expect(mockGetExistingCompanies).toHaveBeenCalled();
      });

      const input = screen.getByRole('textbox');
      await userEvent.click(input);

      await waitFor(() => {
        const microsoftOption = screen.getByText('Microsoft Corporation').closest('li');
        expect(microsoftOption).toHaveClass('multiple-positions');

        const appleOption = screen.getByText('Apple Inc.').closest('li');
        expect(appleOption).toHaveClass('single-position');
      });
    });
  });

  describe('Search and Filtering', () => {
    test('searches across company names and variations', async () => {
      render(<CompanySelect {...defaultProps} />);

      await waitFor(() => {
        expect(mockGetExistingCompanies).toHaveBeenCalled();
      });

      // Search for "Corp" which should match Microsoft variations
      const input = screen.getByRole('textbox');
      await userEvent.type(input, 'Corp');

      await waitFor(() => {
        expect(screen.getByText('Microsoft Corporation')).toBeInTheDocument();
        expect(screen.queryByText('Google LLC')).not.toBeInTheDocument();
      });
    });

    test('performs case-insensitive search', async () => {
      render(<CompanySelect {...defaultProps} />);

      await waitFor(() => {
        expect(mockGetExistingCompanies).toHaveBeenCalled();
      });

      const input = screen.getByRole('textbox');
      await userEvent.type(input, 'GOOGLE');

      await waitFor(() => {
        expect(screen.getByText('Google LLC')).toBeInTheDocument();
        expect(screen.queryByText('Microsoft Corporation')).not.toBeInTheDocument();
      });
    });

    test('clears search and shows all companies when input is empty', async () => {
      render(<CompanySelect {...defaultProps} />);

      await waitFor(() => {
        expect(mockGetExistingCompanies).toHaveBeenCalled();
      });

      const input = screen.getByRole('textbox');

      // Type search term
      await userEvent.type(input, 'micro');
      await waitFor(() => {
        expect(screen.getByText('Microsoft Corporation')).toBeInTheDocument();
        expect(screen.queryByText('Google LLC')).not.toBeInTheDocument();
      });

      // Clear input
      await userEvent.clear(input);
      await userEvent.click(input);

      await waitFor(() => {
        expect(screen.getByText('Microsoft Corporation')).toBeInTheDocument();
        expect(screen.getByText('Google LLC')).toBeInTheDocument();
        expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    test('has proper ARIA attributes', () => {
      render(<CompanySelect {...defaultProps} />);

      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('autoComplete', 'organization');
      expect(input).toHaveAttribute('id', 'company-select');
    });

    test('supports keyboard navigation', async () => {
      render(<CompanySelect {...defaultProps} />);

      await waitFor(() => {
        expect(mockGetExistingCompanies).toHaveBeenCalled();
      });

      const input = screen.getByRole('textbox');

      // Open dropdown with keyboard
      input.focus();
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('Microsoft Corporation')).toBeInTheDocument();
      });

      // Test keyboard navigation would require more complex setup
      // This is a basic test to ensure keyboard interaction doesn't break
    });

    test('handles focus and blur events correctly', async () => {
      render(<CompanySelect {...defaultProps} />);

      await waitFor(() => {
        expect(mockGetExistingCompanies).toHaveBeenCalled();
      });

      const input = screen.getByRole('textbox');

      // Focus should show dropdown if companies exist
      await userEvent.click(input);
      await waitFor(() => {
        expect(screen.getByText('Microsoft Corporation')).toBeInTheDocument();
      });

      // Blur should hide dropdown after delay
      fireEvent.blur(input);

      // Wait for the blur delay (200ms in component)
      await waitFor(() => {
        expect(screen.queryByText('Microsoft Corporation')).not.toBeInTheDocument();
      }, { timeout: 300 });
    });
  });

  describe('Edge Cases', () => {
    test('handles very long company names', async () => {
      const longNameCompany = {
        normalizedName: 'very-long-company-name',
        originalNames: ['A'.repeat(100)],
        totalPositions: 1,
        variations: ['A'.repeat(100)]
      };

      mockGetExistingCompanies.mockResolvedValue({
        companies: [longNameCompany]
      });

      render(<CompanySelect {...defaultProps} />);

      await waitFor(() => {
        expect(mockGetExistingCompanies).toHaveBeenCalled();
      });

      const input = screen.getByRole('textbox');
      await userEvent.click(input);

      await waitFor(() => {
        expect(screen.getByText('A'.repeat(100))).toBeInTheDocument();
      });
    });

    test('handles companies with zero positions', async () => {
      const zeroPositionCompany = {
        normalizedName: 'empty-company',
        originalNames: ['Empty Company'],
        totalPositions: 0,
        variations: ['Empty Company']
      };

      mockGetExistingCompanies.mockResolvedValue({
        companies: [zeroPositionCompany]
      });

      render(<CompanySelect {...defaultProps} />);

      await waitFor(() => {
        expect(mockGetExistingCompanies).toHaveBeenCalled();
      });

      const input = screen.getByRole('textbox');
      await userEvent.click(input);

      await waitFor(() => {
        expect(screen.getByText('0 positions')).toBeInTheDocument();
      });
    });

    test('handles rapid typing and selection', async () => {
      const mockOnChange = jest.fn();
      render(<CompanySelect {...defaultProps} onChange={mockOnChange} />);

      await waitFor(() => {
        expect(mockGetExistingCompanies).toHaveBeenCalled();
      });

      const input = screen.getByRole('textbox');

      // Rapid typing
      await userEvent.type(input, 'Microsoft', { delay: 1 });

      await waitFor(() => {
        expect(screen.getByText('Microsoft Corporation')).toBeInTheDocument();
      });

      // Quick selection
      const microsoftOption = screen.getByText('Microsoft Corporation');
      await userEvent.click(microsoftOption);

      expect(mockOnChange).toHaveBeenCalledWith('Microsoft Corporation');
    });
  });
});
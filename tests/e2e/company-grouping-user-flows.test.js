/**
 * End-to-End User Flow Tests for Company Grouping
 * Tests complete user journeys and edge cases in the company grouping features
 */

import { test, expect } from '@playwright/test';
import { createTestUser, createTestSources, cleanupTestData } from '../utilities/test-helpers.js';

test.describe('Company Grouping User Flows', () => {
  let testUserId;
  let testSources;

  test.beforeAll(async () => {
    testUserId = await createTestUser();
    testSources = await createTestSources(testUserId, [
      {
        title: 'Junior Developer',
        org: 'Microsoft Corporation',
        content: 'Built web applications with React and TypeScript'
      },
      {
        title: 'Software Engineer',
        org: 'Microsoft Corp',
        content: 'Developed cloud services using Azure and Node.js'
      },
      {
        title: 'Senior Engineer',
        org: 'Microsoft',
        content: 'Led team of 5 developers on microservices architecture'
      },
      {
        title: 'Frontend Developer',
        org: 'Google LLC',
        content: 'Created user interfaces for search products'
      },
      {
        title: 'Product Manager',
        org: 'Apple Inc.',
        content: 'Managed iOS application development lifecycle'
      }
    ]);
  });

  test.afterAll(async () => {
    await cleanupTestData(testUserId);
  });

  test.describe('Company Grouping Toggle and View Switching', () => {
    test('should switch between individual and grouped views', async ({ page }) => {
      await page.goto('/work-history');

      // Start in individual view
      await expect(page.locator('[data-testid="job-list"]')).toBeVisible();
      await expect(page.locator('.job-list-item')).toHaveCount(5);

      // Toggle to company grouped view
      await page.click('[data-testid="grouping-toggle"]');

      // Should show company groups
      await expect(page.locator('[data-testid="company-grouped-view"]')).toBeVisible();
      await expect(page.locator('.company-section')).toHaveCount(3); // Microsoft, Google, Apple

      // Microsoft should have 3 positions
      const microsoftSection = page.locator('.company-section').filter({ hasText: 'Microsoft' });
      await expect(microsoftSection.locator('.timeline-job')).toHaveCount(3);

      // Toggle back to individual view
      await page.click('[data-testid="grouping-toggle"]');
      await expect(page.locator('[data-testid="job-list"]')).toBeVisible();
    });

    test('should persist view preference across page reloads', async ({ page }) => {
      await page.goto('/work-history');

      // Enable company grouping
      await page.click('[data-testid="grouping-toggle"]');
      await expect(page.locator('[data-testid="company-grouped-view"]')).toBeVisible();

      // Reload page
      await page.reload();

      // Should maintain grouped view
      await expect(page.locator('[data-testid="company-grouped-view"]')).toBeVisible();
      await expect(page.locator('.company-section')).toHaveCount(3);
    });

    test('should show career progression indicators in grouped view', async ({ page }) => {
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      const microsoftSection = page.locator('.company-section').filter({ hasText: 'Microsoft' });

      // Should show progression indicators
      await expect(microsoftSection.locator('.timeline-dot.initial')).toBeVisible();
      await expect(microsoftSection.locator('.timeline-dot.promotion')).toBeVisible();

      // Should show career progression summary
      await expect(microsoftSection.locator('.progression-summary')).toBeVisible();
      await expect(microsoftSection.locator('.promotions-badge')).toBeVisible();
    });
  });

  test.describe('Company Rename Operations', () => {
    test('should rename company through UI workflow', async ({ page }) => {
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      const microsoftSection = page.locator('.company-section').filter({ hasText: 'Microsoft' });

      // Hover to reveal actions
      await microsoftSection.hover();
      await expect(microsoftSection.locator('.btn-company-action')).toBeVisible();

      // Click rename button
      await microsoftSection.locator('.btn-company-action').filter({ hasText: 'Rename' }).click();

      // Should show rename dialog
      await expect(page.locator('[data-testid="company-rename-dialog"]')).toBeVisible();

      // Enter new company name
      await page.fill('[data-testid="new-company-name-input"]', 'Microsoft Corporation Ltd');
      await page.click('[data-testid="confirm-rename-button"]');

      // Should show loading state
      await expect(page.locator('.btn-company-action.loading')).toBeVisible();

      // Should show success message
      await expect(page.locator('.success-banner')).toBeVisible();
      await expect(page.locator('.success-banner')).toContainText('Renamed');

      // Should update company name in UI
      await expect(page.locator('.company-name')).toContainText('Microsoft Corporation Ltd');
    });

    test('should handle rename validation errors', async ({ page }) => {
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      const appleSection = page.locator('.company-section').filter({ hasText: 'Apple' });
      await appleSection.hover();
      await appleSection.locator('.btn-company-action').filter({ hasText: 'Rename' }).click();

      // Try invalid company name with special characters
      await page.fill('[data-testid="new-company-name-input"]', 'Invalid<>Company');
      await page.click('[data-testid="confirm-rename-button"]');

      // Should show validation error
      await expect(page.locator('.error-banner.company-error')).toBeVisible();
      await expect(page.locator('.error-banner.company-error')).toContainText('invalid characters');

      // Dialog should remain open
      await expect(page.locator('[data-testid="company-rename-dialog"]')).toBeVisible();

      // Cancel operation
      await page.click('[data-testid="cancel-rename-button"]');
      await expect(page.locator('[data-testid="company-rename-dialog"]')).not.toBeVisible();
    });

    test('should prevent renaming to empty or whitespace-only names', async ({ page }) => {
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      const googleSection = page.locator('.company-section').filter({ hasText: 'Google' });
      await googleSection.hover();
      await googleSection.locator('.btn-company-action').filter({ hasText: 'Rename' }).click();

      // Try empty name
      await page.fill('[data-testid="new-company-name-input"]', '');
      await page.click('[data-testid="confirm-rename-button"]');

      await expect(page.locator('.error-banner')).toContainText('company name');

      // Try whitespace only
      await page.fill('[data-testid="new-company-name-input"]', '   ');
      await page.click('[data-testid="confirm-rename-button"]');

      await expect(page.locator('.error-banner')).toContainText('company name');
    });
  });

  test.describe('Company Split Operations', () => {
    test('should split company into individual companies', async ({ page }) => {
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      const microsoftSection = page.locator('.company-section').filter({ hasText: 'Microsoft' });
      await microsoftSection.hover();

      // Click split button
      await microsoftSection.locator('.btn-company-action').filter({ hasText: 'Split' }).click();

      // Should show confirmation dialog
      await expect(page.locator('[data-testid="company-split-dialog"]')).toBeVisible();
      await expect(page.locator('[data-testid="company-split-dialog"]')).toContainText('3 positions');

      // Confirm split
      await page.click('[data-testid="confirm-split-button"]');

      // Should show loading state
      await expect(page.locator('.company-loading-overlay')).toBeVisible();

      // Should show success message
      await expect(page.locator('.success-banner')).toBeVisible();
      await expect(page.locator('.success-banner')).toContainText('Successfully split');

      // Should now have more company sections (each position becomes its own company)
      await expect(page.locator('.company-section')).toHaveCount.toBeGreaterThan(3);
    });

    test('should allow selective position splitting', async ({ page }) => {
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      // Create a new multi-position company for testing
      await page.goto('/work-history/add');
      await page.fill('[data-testid="job-title-input"]', 'Test Position 1');
      await page.fill('[data-testid="company-input"]', 'Test Company');
      await page.click('[data-testid="save-job-button"]');

      await page.goto('/work-history/add');
      await page.fill('[data-testid="job-title-input"]', 'Test Position 2');
      await page.fill('[data-testid="company-input"]', 'Test Company');
      await page.click('[data-testid="save-job-button"]');

      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      const testCompanySection = page.locator('.company-section').filter({ hasText: 'Test Company' });

      // Select specific position for moving
      const firstPosition = testCompanySection.locator('.timeline-job').first();
      await firstPosition.hover();
      await firstPosition.locator('.btn-position-action').filter({ hasText: 'Move' }).click();

      // Should show move dialog
      await expect(page.locator('[data-testid="move-position-dialog"]')).toBeVisible();

      // Enter new company name
      await page.fill('[data-testid="target-company-input"]', 'New Split Company');
      await page.click('[data-testid="confirm-move-button"]');

      // Should move only one position
      await expect(page.locator('.success-banner')).toContainText('Moved');

      // Original company should have one less position
      await expect(testCompanySection.locator('.timeline-job')).toHaveCount(1);

      // Should have new company section
      await expect(page.locator('.company-section').filter({ hasText: 'New Split Company' })).toBeVisible();
    });
  });

  test.describe('Company Merge Operations', () => {
    test('should merge multiple companies', async ({ page }) => {
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      // Select multiple companies for merging
      await page.click('[data-testid="bulk-select-mode"]');

      const googleSection = page.locator('.company-section').filter({ hasText: 'Google' });
      const appleSection = page.locator('.company-section').filter({ hasText: 'Apple' });

      await googleSection.locator('[data-testid="company-checkbox"]').check();
      await appleSection.locator('[data-testid="company-checkbox"]').check();

      // Should show bulk actions
      await expect(page.locator('.bulk-actions')).toBeVisible();
      await expect(page.locator('.selected-count')).toContainText('2 selected');

      // Click merge button
      await page.click('[data-testid="bulk-merge-button"]');

      // Should show merge dialog
      await expect(page.locator('[data-testid="company-merge-dialog"]')).toBeVisible();

      // Select target company
      await page.selectOption('[data-testid="target-company-select"]', 'Google LLC');
      await page.click('[data-testid="confirm-merge-button"]');

      // Should show success message
      await expect(page.locator('.success-banner')).toContainText('Merged');

      // Should have fewer company sections
      await expect(page.locator('.company-section')).toHaveCount.toBeLessThan(5);

      // Google should now have more positions
      const mergedGoogleSection = page.locator('.company-section').filter({ hasText: 'Google' });
      await expect(mergedGoogleSection.locator('.position-count')).toContainText('2 positions');
    });

    test('should prevent merging into non-existent company', async ({ page }) => {
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');
      await page.click('[data-testid="bulk-select-mode"]');

      // Select companies
      await page.locator('.company-section').first().locator('[data-testid="company-checkbox"]').check();
      await page.click('[data-testid="bulk-merge-button"]');

      // Try to merge into non-existent company
      await page.fill('[data-testid="target-company-input"]', 'Non-Existent Company Inc.');
      await page.click('[data-testid="confirm-merge-button"]');

      // Should show warning about creating new company
      await expect(page.locator('[data-testid="merge-warning"]')).toContainText('will create new company');

      // User can proceed or cancel
      await page.click('[data-testid="proceed-with-new-company"]');
      await expect(page.locator('.success-banner')).toBeVisible();
    });
  });

  test.describe('Position-Level Operations', () => {
    test('should move individual position to existing company', async ({ page }) => {
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      const firstPosition = page.locator('.timeline-job').first();
      await firstPosition.hover();

      // Click move button on position
      await firstPosition.locator('.btn-position-action').filter({ hasText: 'Move' }).click();

      // Should show company selector dialog
      await expect(page.locator('[data-testid="move-position-dialog"]')).toBeVisible();

      // Should show existing companies as options
      await page.click('[data-testid="target-company-select"]');
      await expect(page.locator('[data-testid="company-option"]')).toHaveCountGreaterThan(0);

      // Select existing company
      await page.click('[data-testid="company-option"]').first();
      await page.click('[data-testid="confirm-move-button"]');

      // Should show success message
      await expect(page.locator('.success-banner')).toContainText('Moved');
    });

    test('should create new company from individual position', async ({ page }) => {
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      const lastPosition = page.locator('.timeline-job').last();
      await lastPosition.hover();

      // Click create new company button
      await lastPosition.locator('.btn-position-action').filter({ hasText: 'New' }).click();

      // Should show new company dialog
      await expect(page.locator('[data-testid="new-company-dialog"]')).toBeVisible();

      // Enter new company name
      await page.fill('[data-testid="new-company-name-input"]', 'Startup Company Inc.');
      await page.click('[data-testid="confirm-create-button"]');

      // Should show success message
      await expect(page.locator('.success-banner')).toContainText('Created new company');

      // Should show new company in list
      await expect(page.locator('.company-section').filter({ hasText: 'Startup Company Inc.' })).toBeVisible();
    });
  });

  test.describe('Search and Filtering in Grouped View', () => {
    test('should filter companies by search term', async ({ page }) => {
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      // Search for specific company
      await page.fill('[data-testid="search-input"]', 'Microsoft');

      // Should show only Microsoft-related companies
      await expect(page.locator('.company-section')).toHaveCount(1);
      await expect(page.locator('.company-section').filter({ hasText: 'Microsoft' })).toBeVisible();

      // Clear search
      await page.fill('[data-testid="search-input"]', '');

      // Should show all companies again
      await expect(page.locator('.company-section')).toHaveCountGreaterThan(1);
    });

    test('should filter by position title within companies', async ({ page }) => {
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      // Search for specific position title
      await page.fill('[data-testid="search-input"]', 'Senior');

      // Should show companies that have positions matching "Senior"
      const visibleCompanies = page.locator('.company-section:visible');
      await expect(visibleCompanies).toHaveCountGreaterThan(0);

      // Each visible company should have positions containing "Senior"
      const microsoftSection = page.locator('.company-section').filter({ hasText: 'Microsoft' });
      if (await microsoftSection.isVisible()) {
        await expect(microsoftSection.locator('.job-title-compact').filter({ hasText: 'Senior' })).toBeVisible();
      }
    });

    test('should handle search with no results', async ({ page }) => {
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      // Search for non-existent term
      await page.fill('[data-testid="search-input"]', 'NonExistentCompany');

      // Should show no results message
      await expect(page.locator('[data-testid="no-results-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="no-results-message"]')).toContainText('No jobs match');

      // Should show option to clear search
      await expect(page.locator('[data-testid="clear-search-button"]')).toBeVisible();

      // Clear search should restore all companies
      await page.click('[data-testid="clear-search-button"]');
      await expect(page.locator('.company-section')).toHaveCountGreaterThan(0);
    });
  });

  test.describe('Error Handling and Edge Cases', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      // Simulate network failure
      await page.route('**/api/user/sources/*/reassign-company', route => {
        route.abort('failed');
      });

      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      const position = page.locator('.timeline-job').first();
      await position.hover();
      await position.locator('.btn-position-action').filter({ hasText: 'Move' }).click();

      await page.fill('[data-testid="target-company-input"]', 'Network Test Company');
      await page.click('[data-testid="confirm-move-button"]');

      // Should show network error
      await expect(page.locator('.error-banner')).toContainText('network error');

      // Should allow retry
      await expect(page.locator('[data-testid="retry-button"]')).toBeVisible();
    });

    test('should handle concurrent operations conflicts', async ({ page }) => {
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      // Open multiple operation dialogs simultaneously
      const position1 = page.locator('.timeline-job').first();
      const position2 = page.locator('.timeline-job').nth(1);

      await position1.hover();
      await position1.locator('.btn-position-action').filter({ hasText: 'Move' }).click();

      // Try to start another operation
      await position2.hover();
      await position2.locator('.btn-position-action').filter({ hasText: 'Move' }).click();

      // Should prevent concurrent operations or queue them
      await expect(page.locator('[data-testid="operation-in-progress"]')).toBeVisible();
    });

    test('should handle very long company names', async ({ page }) => {
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      const position = page.locator('.timeline-job').first();
      await position.hover();
      await position.locator('.btn-position-action').filter({ hasText: 'New' }).click();

      // Try extremely long company name
      const longName = 'A'.repeat(150);
      await page.fill('[data-testid="new-company-name-input"]', longName);
      await page.click('[data-testid="confirm-create-button"]');

      // Should show validation error
      await expect(page.locator('.error-banner')).toContainText('100 characters');
    });

    test('should handle special characters in company names', async ({ page }) => {
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      const position = page.locator('.timeline-job').first();
      await position.hover();
      await position.locator('.btn-position-action').filter({ hasText: 'New' }).click();

      // Test valid special characters
      await page.fill('[data-testid="new-company-name-input"]', 'AT&T Inc.');
      await page.click('[data-testid="confirm-create-button"]');

      // Should succeed
      await expect(page.locator('.success-banner')).toBeVisible();

      // Test invalid special characters
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      const anotherPosition = page.locator('.timeline-job').last();
      await anotherPosition.hover();
      await anotherPosition.locator('.btn-position-action').filter({ hasText: 'New' }).click();

      await page.fill('[data-testid="new-company-name-input"]', 'Company<script>alert("xss")</script>');
      await page.click('[data-testid="confirm-create-button"]');

      // Should show validation error
      await expect(page.locator('.error-banner')).toContainText('invalid characters');
    });
  });

  test.describe('Performance and Responsiveness', () => {
    test('should handle large number of companies efficiently', async ({ page }) => {
      // This test would require setting up a large dataset
      // For now, we'll test with a reasonable number of companies

      await page.goto('/work-history');

      // Measure time to load and render company groups
      const startTime = Date.now();
      await page.click('[data-testid="grouping-toggle"]');
      await page.waitForSelector('.company-section');
      const endTime = Date.now();

      // Should load within reasonable time (2 seconds)
      expect(endTime - startTime).toBeLessThan(2000);

      // Should be responsive to interactions
      const companySection = page.locator('.company-section').first();
      await companySection.hover();

      // Action buttons should appear quickly
      await expect(companySection.locator('.btn-company-action')).toBeVisible({ timeout: 500 });
    });

    test('should maintain UI responsiveness during operations', async ({ page }) => {
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      // Start a company operation
      const company = page.locator('.company-section').first();
      await company.hover();
      await company.locator('.btn-company-action').filter({ hasText: 'Rename' }).click();

      // UI should remain responsive during operation
      await page.fill('[data-testid="new-company-name-input"]', 'Performance Test Company');

      // Click confirm and immediately try other interactions
      await page.click('[data-testid="confirm-rename-button"]');

      // Should still be able to interact with other elements
      await page.click('[data-testid="search-input"]');
      await page.type('[data-testid="search-input"]', 'test');

      // Search should work even during operation
      await expect(page.locator('[data-testid="search-input"]')).toHaveValue('test');
    });
  });

  test.describe('Accessibility and Usability', () => {
    test('should be keyboard navigable', async ({ page }) => {
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      // Tab through company sections
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Should be able to activate company actions with keyboard
      await page.keyboard.press('Enter');

      // Should show action menu or dialog
      await expect(page.locator('[data-testid="company-actions-menu"]')).toBeVisible();
    });

    test('should have proper ARIA labels and roles', async ({ page }) => {
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      // Check for proper ARIA attributes
      await expect(page.locator('[role="region"]')).toBeVisible(); // Company sections
      await expect(page.locator('[aria-label*="company"]')).toBeVisible(); // Company controls
      await expect(page.locator('[aria-expanded]')).toBeVisible(); // Expandable sections
    });

    test('should provide clear feedback for all operations', async ({ page }) => {
      await page.goto('/work-history');
      await page.click('[data-testid="grouping-toggle"]');

      const company = page.locator('.company-section').first();
      await company.hover();
      await company.locator('.btn-company-action').filter({ hasText: 'Rename' }).click();

      // Should show loading state
      await page.fill('[data-testid="new-company-name-input"]', 'Feedback Test Company');
      await page.click('[data-testid="confirm-rename-button"]');

      // Should show loading indicator
      await expect(page.locator('.btn-company-action.loading')).toBeVisible();

      // Should show success or error message
      await expect(page.locator('.success-banner, .error-banner')).toBeVisible();

      // Message should be descriptive
      const message = await page.locator('.success-banner, .error-banner').textContent();
      expect(message).toMatch(/renamed|error|failed/i);
    });
  });
});
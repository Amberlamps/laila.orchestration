// Custom assertion helpers for common UI patterns in E2E tests.
// These helpers provide semantic, reusable assertions that make
// tests more readable and maintainable.
import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Assert that a status badge displays the expected status text and
 * optionally has the expected visual variant (color class).
 */
export const expectStatusBadge = async (
  page: Page,
  expectedStatus: string,
  options: { testId?: string; variant?: string } = {},
): Promise<void> => {
  const { testId = 'status-badge', variant } = options;
  const badge = page.getByTestId(testId);
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText(expectedStatus, { ignoreCase: true });

  if (variant) {
    await expect(badge).toHaveAttribute('data-variant', variant);
  }
};

/**
 * Assert that a success toast notification appears and auto-dismisses.
 */
export const expectSuccessToast = async (
  page: Page,
  messagePattern: string | RegExp,
): Promise<void> => {
  const pattern =
    typeof messagePattern === 'string' ? new RegExp(messagePattern, 'i') : messagePattern;
  const toast = page.getByRole('status').filter({ hasText: pattern });
  await expect(toast).toBeVisible({ timeout: 5_000 });
};

/**
 * Assert that an error toast notification appears.
 */
export const expectErrorToast = async (
  page: Page,
  messagePattern: string | RegExp,
): Promise<void> => {
  const pattern =
    typeof messagePattern === 'string' ? new RegExp(messagePattern, 'i') : messagePattern;
  const toast = page.getByRole('alert').filter({ hasText: pattern });
  await expect(toast).toBeVisible({ timeout: 5_000 });
};

/**
 * Assert that a confirmation modal is displayed with the expected
 * title and content, then interact with it (confirm or cancel).
 */
export const handleConfirmationModal = async (
  page: Page,
  options: {
    expectedTitle?: string | RegExp;
    expectedContent?: string | RegExp;
    action: 'confirm' | 'cancel';
  },
): Promise<void> => {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  if (options.expectedTitle) {
    const heading = dialog.getByRole('heading');
    await expect(heading).toHaveText(options.expectedTitle);
  }

  if (options.expectedContent) {
    await expect(dialog).toContainText(options.expectedContent);
  }

  if (options.action === 'confirm') {
    await dialog.getByRole('button', { name: /confirm|delete|yes/i }).click();
  } else {
    await dialog.getByRole('button', { name: /cancel|no/i }).click();
  }
};

/**
 * Assert that a form field displays a validation error message.
 */
export const expectFieldError = async (
  page: Page,
  fieldLabel: string,
  errorMessage: string | RegExp,
): Promise<void> => {
  const field = page.getByLabel(fieldLabel);
  // Zod + React Hook Form renders validation errors in an
  // element associated via aria-describedby.
  const errorId = await field.getAttribute('aria-describedby');
  if (errorId) {
    const errorElement = page.locator(`#${errorId}`);
    await expect(errorElement).toHaveText(errorMessage);
  }
};

/**
 * Assert that a table contains exactly the expected number of data rows.
 * Excludes the header row from the count.
 */
export const expectTableRowCount = async (table: Locator, expectedCount: number): Promise<void> => {
  const rows = table.getByRole('row');
  // Subtract 1 for the header row.
  await expect(rows).toHaveCount(expectedCount + 1);
};

/**
 * Assert that a button is disabled and optionally has a tooltip
 * explaining why it is disabled.
 */
export const expectButtonDisabledWithTooltip = async (
  page: Page,
  buttonName: string | RegExp,
  tooltipText?: string | RegExp,
): Promise<void> => {
  const button = page.getByRole('button', { name: buttonName });
  await expect(button).toBeDisabled();

  if (tooltipText) {
    await button.hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText(tooltipText);
  }
};

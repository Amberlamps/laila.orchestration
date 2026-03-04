// apps/web/e2e/entity-management/worker-creation.spec.ts
// E2E tests for worker creation with one-time API key reveal.
// Verifies the critical security flow where the API key is shown
// exactly once and never again after the modal is closed.
import { test, expect } from '../fixtures';
import { WorkerListPage, WorkerDetailPage } from '../page-objects';

test.describe('Worker Creation and API Key Reveal', () => {
  test('create worker displays API key in monospace with copy button', async ({
    authenticatedPage: page,
  }) => {
    const workerList = new WorkerListPage(page);
    await workerList.goto();

    // Click "+ Create Worker" to open the creation modal.
    await workerList.createWorkerButton.click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // Fill in the worker name.
    await modal.getByLabel(/name/i).fill('CI Build Agent');
    await modal.getByRole('button', { name: /create/i }).click();

    // Verify the API key is displayed inside a <code> element after creation.
    const apiKeyDisplay = modal.locator('code');
    await expect(apiKeyDisplay).toBeVisible();

    // Verify the API key starts with the "lw_" prefix.
    const apiKeyText = await apiKeyDisplay.textContent();
    expect(apiKeyText).toBeTruthy();
    expect(apiKeyText!.startsWith('lw_')).toBe(true);

    // Verify the API key is displayed in a monospace font.
    // The <code> element has className "font-mono".
    const fontFamily = await apiKeyDisplay.evaluate((el) => window.getComputedStyle(el).fontFamily);
    expect(fontFamily).toMatch(/mono|courier|consolas/i);

    // Verify the copy button is present and functional.
    // The copy button has aria-label "Copy API key".
    const copyButton = modal.getByRole('button', { name: /copy api key/i });
    await expect(copyButton).toBeVisible();

    // Click the copy button — the icon changes to a green checkmark on success.
    await copyButton.click();
  });

  test('closing API key modal hides the key permanently', async ({ authenticatedPage: page }) => {
    const workerList = new WorkerListPage(page);
    await workerList.goto();

    // Create a worker and capture the API key.
    const apiKey = await workerList.createWorker('Deployment Agent');

    // Verify we captured a valid API key.
    expect(apiKey).toBeTruthy();
    expect(apiKey.startsWith('lw_')).toBe(true);

    // Close the API key modal.
    await workerList.closeApiKeyModal();

    // Navigate to the newly created worker's detail page.
    await workerList.openWorker('Deployment Agent');
    const workerDetail = new WorkerDetailPage(page);
    await expect(workerDetail.heading).toBeVisible();

    // Verify the full API key is NOT shown on the detail page.
    const detailPageContent = await page.textContent('body');
    expect(detailPageContent).not.toContain(apiKey);

    // The detail page shows a message that the key cannot be retrieved.
    // The ApiKeySection card says "API key was shown once at creation".
    const apiKeyMessage = page.getByText(/api key was shown once/i);
    await expect(apiKeyMessage).toBeVisible();
  });

  test('worker appears in list after creation', async ({ authenticatedPage: page }) => {
    const workerList = new WorkerListPage(page);
    await workerList.goto();

    // Create a worker.
    await workerList.createWorker('Test Execution Agent');
    await workerList.closeApiKeyModal();

    // Verify the worker appears in the workers table.
    const workerRow = workerList.workersTable.getByRole('row', {
      name: /Test Execution Agent/,
    });
    await expect(workerRow).toBeVisible();

    // Verify the worker shows "Active" status.
    await expect(workerRow).toContainText('Active');
  });

  test('warning message about one-time key display', async ({ authenticatedPage: page }) => {
    const workerList = new WorkerListPage(page);
    await workerList.goto();
    await workerList.createWorkerButton.click();

    const modal = page.getByRole('dialog');
    await modal.getByLabel(/name/i).fill('Warning Test Agent');
    await modal.getByRole('button', { name: /create/i }).click();

    // Verify the warning message about one-time key visibility.
    // Real text: "This API key will only be shown once."
    const warningMessage = modal.getByText(/api key will only be shown once/i);
    await expect(warningMessage).toBeVisible();
  });
});

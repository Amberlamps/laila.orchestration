# Test Worker Creation and API Key Reveal

## Task Details

- **Title:** Test Worker Creation and API Key Reveal
- **Status:** Complete
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Entity Management E2E Tests](./tasks.md)
- **Parent Epic:** [End-to-End Testing](../../user-stories.md)
- **Dependencies:** None (depends on User Story: Set Up Playwright Infrastructure)

## Description

Implement E2E tests for the worker creation flow with API key reveal. Navigate to the Workers page, click "+ Create Worker", enter a name, create the worker, verify the API key is displayed in a monospace font, verify the copy-to-clipboard button works, click "Done" to close the modal, and verify the API key is never shown again on the worker detail page.

### Test: Worker Creation and API Key Reveal

```typescript
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

    // Verify the API key is displayed after creation.
    const apiKeyDisplay = modal.getByTestId('api-key-display');
    await expect(apiKeyDisplay).toBeVisible();

    // Verify the API key starts with the "lw_" prefix.
    const apiKeyText = await apiKeyDisplay.textContent();
    expect(apiKeyText).toBeTruthy();
    expect(apiKeyText!.startsWith('lw_')).toBe(true);

    // Verify the API key is displayed in a monospace font.
    // Check the computed font-family CSS property.
    const fontFamily = await apiKeyDisplay.evaluate((el) => window.getComputedStyle(el).fontFamily);
    expect(fontFamily).toMatch(/mono|courier|consolas/i);

    // Verify the copy button is present and functional.
    const copyButton = modal.getByRole('button', { name: /copy/i });
    await expect(copyButton).toBeVisible();

    // Click the copy button and verify clipboard interaction.
    // Note: Playwright's clipboard API requires permissions.
    await copyButton.click();

    // Verify a success indicator appears after copying.
    const copiedIndicator = modal.getByText(/copied/i);
    await expect(copiedIndicator).toBeVisible();
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

    // Verify the full API key is NOT shown on the detail page.
    // Only the prefix should be visible (e.g., "lw_abc1...").
    const detailPageContent = await page.textContent('body');
    expect(detailPageContent).not.toContain(apiKey);

    // Verify the API key prefix is shown (truncated).
    const apiKeyPrefixDisplay = page.getByTestId('api-key-prefix');
    await expect(apiKeyPrefixDisplay).toBeVisible();
    const prefixText = await apiKeyPrefixDisplay.textContent();
    expect(prefixText).toMatch(/lw_\w+\.\.\./);
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

    // Verify a warning message is displayed about the one-time key reveal.
    const warningMessage = modal.getByText(/this is the only time.*api key.*will be shown/i);
    await expect(warningMessage).toBeVisible();
  });
});
```

## Acceptance Criteria

- [ ] Test verifies clicking "+ Create Worker" opens a creation modal with a name field
- [ ] Test verifies submitting the form displays the generated API key
- [ ] Test verifies the API key starts with the `lw_` prefix
- [ ] Test verifies the API key is displayed in monospace font
- [ ] Test verifies the copy button is visible and shows a "Copied" indicator when clicked
- [ ] Test verifies closing the modal with "Done" hides the API key permanently
- [ ] Test verifies the full API key is NOT shown on the worker detail page (only truncated prefix)
- [ ] Test verifies the worker appears in the workers list after creation with "Active" status
- [ ] Test verifies a warning message about one-time key display is shown in the modal
- [ ] All tests pass in Chromium, Firefox, and WebKit browsers
- [ ] No `any` types used in test code

## Technical Notes

- The API key is generated server-side with SHA-256 hashing. Only the plaintext key is returned once in the creation response. The MSW handler generates a mock key with `lw_` prefix.
- The monospace font assertion checks the computed CSS `font-family` property on the API key display element. This verifies the design specification for monospace rendering.
- Clipboard testing in Playwright requires browser permissions. The test verifies the "Copied" indicator rather than checking the actual clipboard contents, which is more reliable across browsers.
- The API key prefix display on the detail page shows only the first few characters followed by `...` (e.g., `lw_abc1...`), matching the stored prefix in the database.

## References

- **Project Setup Specification:** Section G.4 (End-to-End Testing — Worker creation and API key reveal)
- **Functional Requirements:** FR-WORKER-001 (worker creation), FR-AUTH-005 (API key generation with lw\_ prefix and SHA-256 hashing)
- **Design Specification:** Worker creation modal, API key reveal component, monospace styling

## Estimated Complexity

Medium — The worker creation modal and API key reveal flow involve specific UI assertions (monospace font, copy button, one-time display) that require careful selector targeting. Cross-browser clipboard handling adds minor complexity.

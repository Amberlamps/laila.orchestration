# Implement Create Worker Modal

## Task Details

- **Title:** Implement Create Worker Modal
- **Status:** Complete
- **Assigned Agent:** fullstack-developer
- **Parent User Story:** [Implement Worker Management Pages](./tasks.md)
- **Parent Epic:** [Entity Management UI](../../user-stories.md)
- **Dependencies:** Implement Worker List Page

## Description

Build a two-step create worker modal. Step 1 collects the worker name and creates the worker. Step 2 displays the generated API key one time, with a copy button and a warning that the key cannot be retrieved later.

### Step 1 — Worker Name Input

- **Title:** "Create Worker"
- **Form:** Single input field for worker name (required, max 100 characters)
- **Button:** "Create Worker" (primary)
- **Behavior:** On submit, call the create worker API. On success, transition to Step 2.

### Step 2 — API Key Reveal

- **Title:** "Worker Created Successfully"
- **Icon:** Green CheckCircle2 (48px) at top center
- **API Key Display:**
  - Monospace code block (JetBrains Mono, 14px, zinc-900 text)
  - Background: zinc-100, 8px radius, 16px padding
  - Full API key text (e.g., `lw_abc123def456ghi789jkl012mno345pqr678`)
  - Copy button (Lucide `Copy` icon) — copies to clipboard
  - Auto-copy on reveal (automatically copy to clipboard when step 2 appears)
  - Visual feedback on copy: button icon changes to `Check` for 2 seconds
- **Warning:**
  - Amber-50 bg, amber-200 border, amber-700 text container
  - AlertTriangle icon
  - Text: "This API key will only be shown once. Store it securely. If lost, you'll need to delete this worker and create a new one."
- **Button:** "Done" (primary) — closes modal

```tsx
// apps/web/src/components/workers/create-worker-modal.tsx
// Two-step modal: Step 1 — name input, Step 2 — API key reveal.
// API key is shown exactly once and auto-copied to clipboard.
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Copy, Check, AlertTriangle } from 'lucide-react';
import { useCreateWorker } from '@/hooks/use-workers';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const createWorkerSchema = z.object({
  name: z
    .string()
    .min(1, 'Worker name is required')
    .max(100, 'Name must be 100 characters or fewer'),
});

type CreateWorkerFormData = z.infer<typeof createWorkerSchema>;

type ModalStep = 'name' | 'api-key';

interface CreateWorkerModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateWorkerModal({ open, onClose }: CreateWorkerModalProps) {
  const [step, setStep] = useState<ModalStep>('name');
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createWorker = useCreateWorker();

  async function handleCreate(data: CreateWorkerFormData) {
    const result = await createWorker.mutateAsync(data);
    // The API returns the plain-text API key exactly once in the response.
    // After this, the key is stored as a SHA-256 hash and cannot be retrieved.
    setApiKey(result.apiKey);
    setStep('api-key');
    // Auto-copy to clipboard
    await navigator.clipboard.writeText(result.apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopy() {
    if (apiKey) {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // ...
}
```

## Acceptance Criteria

### Step 1 — Name Input

- [ ] Modal shows "Create Worker" title
- [ ] Name input is required with 1-100 character validation
- [ ] "Create Worker" button calls the create worker API
- [ ] Button shows loading spinner during creation
- [ ] On error: inline error message below the input
- [ ] On success: transitions to Step 2

### Step 2 — API Key Reveal

- [ ] Green CheckCircle2 icon (48px) displays at the top center
- [ ] "Worker Created Successfully" title in H3
- [ ] API key displays in monospace code block (JetBrains Mono, zinc-100 bg)
- [ ] API key text is selectable for manual copy
- [ ] Copy button copies the API key to clipboard
- [ ] Auto-copy occurs on step 2 initial render
- [ ] Copy button shows Check icon for 2 seconds after copy (visual feedback)
- [ ] Warning banner has amber styling with AlertTriangle icon
- [ ] Warning text: "This API key will only be shown once. Store it securely."
- [ ] "Done" button closes the modal
- [ ] Closing the modal resets to Step 1 for next use
- [ ] Modal cannot be dismissed via backdrop click during Step 2 (prevent accidental closure)

### General

- [ ] Modal resets to Step 1 when reopened
- [ ] API key is never logged or stored in client-side state beyond the modal lifecycle
- [ ] `navigator.clipboard.writeText` failure is handled gracefully (show manual copy fallback)

## Technical Notes

- The API key is returned in the create worker API response body as a plain-text field. This is the only time the plain-text key is ever available — the server stores a SHA-256 hash.
- Auto-copy uses `navigator.clipboard.writeText()`, which requires a secure context (HTTPS) and user gesture. Since the copy happens immediately after a button click (form submit), it should have clipboard permissions. Handle the case where clipboard access is denied by showing the key prominently for manual selection.
- Prevent backdrop dismissal during Step 2 by using the Radix Dialog `onInteractOutside` handler to prevent closing. The user must explicitly click "Done".
- When the modal is closed and reopened, reset `step` to "name" and `apiKey` to null. Use a `useEffect` with `open` as dependency, or reset in the `onClose` handler.
- The `lw_` prefix on the API key helps identify laila.works API keys in user credential stores.

## References

- **Design Specification:** Section 9.3 (Create Worker Modal), Section 9.3.1 (API Key Reveal)
- **Functional Requirements:** FR-WORKER-006 (worker creation), FR-WORKER-007 (API key one-time reveal), FR-WORKER-008 (API key copy)
- **Clipboard API Docs:** navigator.clipboard.writeText, secure context requirements

## Estimated Complexity

Medium — The two-step flow, auto-copy behavior, copy feedback animation, and preventing accidental closure add moderate complexity beyond a standard form modal.

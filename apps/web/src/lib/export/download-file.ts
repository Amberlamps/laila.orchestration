/**
 * Generic utility for triggering a file download in the browser.
 *
 * Creates a temporary anchor element, triggers a click to start the
 * download, then cleans up the element and revokes the object URL
 * to free memory.
 */

/**
 * Triggers a browser file download for the given Blob.
 *
 * @param blob     - The file content as a Blob.
 * @param filename - The suggested filename for the download.
 */
export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Shares files through the iOS share sheet (Save to Files, iCloud Drive, Mail…).
 * Must be called directly from a tap handler; falls back to a download.
 */
export async function shareOrDownload(files: File[], title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (typeof navigator.share === 'function' && navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // NotAllowedError (gesture expired) and others: fall back to download.
    }
  }
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  return 'downloaded';
}

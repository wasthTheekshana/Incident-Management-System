export interface DetectedFile {
  /** Canonical MIME type determined from the file's content, never from the client-supplied header. */
  mime: 'application/pdf' | 'image/png' | 'image/jpeg' | 'text/csv';
  extension: 'pdf' | 'png' | 'jpg' | 'csv';
}

const startsWith = (buf: Buffer, bytes: number[]) => bytes.every((b, i) => buf[i] === b);

/**
 * Identifies an upload by its content (NFR-4). Returns null for anything outside the allowed set
 * (PDF, JPG/JPEG, PNG, CSV). A file whose name claims one type but whose bytes are another is rejected by the caller.
 */
export function detectFile(buf: Buffer, originalName: string): DetectedFile | null {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: 'application/pdf', extension: 'pdf' };
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', extension: 'png' };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', extension: 'jpg' };
  if (/\.csv$/i.test(originalName) && looksLikeText(buf)) return { mime: 'text/csv', extension: 'csv' };
  return null;
}

/** CSV has no signature: accept only extension-matched content with no NUL/control bytes and valid UTF-8. */
function looksLikeText(buf: Buffer): boolean {
  if (buf.length === 0) return false;
  const sample = buf.subarray(0, 8192);
  for (const byte of sample) {
    if (byte === 0 || (byte < 0x09) || (byte > 0x0d && byte < 0x20)) return false;
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

/** Extension the user typed must agree with what the bytes actually are. */
export function extensionMatches(originalName: string, detected: DetectedFile): boolean {
  const ext = originalName.split('.').pop()?.toLowerCase();
  if (detected.extension === 'jpg') return ext === 'jpg' || ext === 'jpeg';
  return ext === detected.extension;
}

/** Strips path parts and control/odd characters so the name is safe in headers and logs. */
export function sanitiseFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base.replace(/[^\w.\- ()]/g, '_').replace(/\.{2,}/g, '.').trim();
  return (cleaned || 'file').slice(0, 150);
}

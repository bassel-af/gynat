/**
 * Sources («المصادر») — the uploaded-file pipeline (server only).
 *
 * Files are often ID papers of LIVING people, so everything here is
 * fail-closed:
 * - The type is decided by MAGIC BYTES only — never the name or the
 *   browser-reported MIME type. Only JPEG, PNG, WebP and PDF pass.
 * - Images are decoded and RE-ENCODED with sharp in their own format:
 *   `.rotate()` applies the EXIF orientation, and no `withMetadata()` means
 *   EXIF/GPS/ICC/XMP never survive. `limitInputPixels` refuses pixel bombs.
 * - PDFs are stored as-is but refused when they carry active content
 *   (scripts, auto-actions, launchers, embedded files), including inside
 *   Flate-compressed streams and behind `#xx` name escapes. An encrypted PDF
 *   cannot be inspected, so it is refused too.
 * - 8 MB cap on the stored bytes (matches the DB CHECK).
 */
import { inflateSync } from 'node:zlib';
import sharp from 'sharp';
import {
  MAX_SOURCE_FILE_BYTES,
  SOURCE_FILE_MIME_TYPES,
  isSourceFileMime,
  FILE_TOO_LARGE_MESSAGE,
  type SourceFileMime,
} from '@/lib/tree/source-file-types';

export {
  FILE_TOO_LARGE_MESSAGE,
  MAX_SOURCE_FILE_BYTES,
  SOURCE_FILE_MIME_TYPES,
  isSourceFileMime,
  type SourceFileMime,
};

/** ~50 megapixels. */
export const MAX_SOURCE_IMAGE_PIXELS = 50_000_000;
export const MAX_SOURCE_FILE_NAME = 200;

export const UNSUPPORTED_TYPE_MESSAGE =
  'نوع الملف غير مدعوم. المسموح: صور JPEG أو PNG أو WebP أو ملف PDF';
export const EMPTY_FILE_MESSAGE = 'الملف فارغ';
export const BAD_IMAGE_MESSAGE = 'تعذّرت قراءة الصورة، أو أن أبعادها كبيرة جدًا';
export const PDF_ACTIVE_CONTENT_MESSAGE =
  'ملف PDF هذا يحتوي على محتوى نشط (برمجيات أو إجراءات تلقائية أو ملفات مضمّنة) أو أنه مشفّر، فلا يمكن قبوله';

export class SourceFileRejectedError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 413,
  ) {
    super(message);
    this.name = 'SourceFileRejectedError';
  }
}

const EXTENSIONS: Record<SourceFileMime, { canonical: string; accepted: string[] }> = {
  'image/jpeg': { canonical: 'jpg', accepted: ['jpg', 'jpeg'] },
  'image/png': { canonical: 'png', accepted: ['png'] },
  'image/webp': { canonical: 'webp', accepted: ['webp'] },
  'application/pdf': { canonical: 'pdf', accepted: ['pdf'] },
};

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** The file's type from its first bytes, or null for anything not accepted. */
export function detectSourceFileType(buf: Buffer): SourceFileMime | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buf, ascii('RIFF')) && startsWith(buf, ascii('WEBP'), 8)) return 'image/webp';
  if (startsWith(buf, ascii('%PDF-'))) return 'application/pdf';
  return null;
}

// ---------------------------------------------------------------------------
// PDF inspection
// ---------------------------------------------------------------------------

/** A banned name, whole — `/AA` must not match `/AAPL`. */
const ACTIVE_NAME =
  /\/(?:JavaScript|JS|OpenAction|Launch|EmbeddedFile|AA|Encrypt)(?=[\s()<>[\]{}/%]|$)/;

/** Cap on bytes inflated while inspecting one PDF (zip-bomb guard). */
const MAX_INFLATED_BYTES = 64 * 1024 * 1024;

function decodeNameEscapes(text: string): string {
  return text.replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function textHasActiveName(text: string): boolean {
  return ACTIVE_NAME.test(text) || ACTIVE_NAME.test(decodeNameEscapes(text));
}

/**
 * True when a PDF carries anything that can act on its own — or cannot be
 * inspected. Scans the raw bytes AND every stream that inflates (object
 * streams hide dictionaries inside FlateDecode).
 */
export function pdfHasActiveContent(buf: Buffer): boolean {
  const raw = buf.toString('latin1');
  if (textHasActiveName(raw)) return true;

  let inflatedTotal = 0;
  const streamRe = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    streamRe.lastIndex = end + 'endstream'.length;
    const chunk = buf.subarray(start, end);
    let inflated: Buffer;
    try {
      inflated = inflateSync(chunk, { maxOutputLength: MAX_INFLATED_BYTES - inflatedTotal });
    } catch (error) {
      // Over the inflate budget → cannot be inspected → refuse.
      if ((error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') return true;
      continue; // Not a Flate stream (or trailing garbage) — raw scan covered it.
    }
    inflatedTotal += inflated.length;
    if (inflatedTotal >= MAX_INFLATED_BYTES) return true;
    if (textHasActiveName(inflated.toString('latin1'))) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export interface ProcessedSourceFile {
  mimeType: SourceFileMime;
  /** The bytes to store — re-encoded for images, untouched for PDFs. */
  bytes: Buffer;
}

async function reencodeImage(buf: Buffer, mimeType: SourceFileMime): Promise<Buffer> {
  const format = mimeType === 'image/jpeg' ? 'jpeg' : mimeType === 'image/png' ? 'png' : 'webp';
  try {
    const image = sharp(buf, { limitInputPixels: MAX_SOURCE_IMAGE_PIXELS, failOn: 'error' });
    const meta = await image.metadata();
    // The decoder must agree with the magic bytes.
    if (meta.format !== format) throw new Error('format mismatch');
    const rotated = image.rotate();
    // No withMetadata()/withExif(): every metadata block is dropped.
    if (format === 'jpeg') return await rotated.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    if (format === 'png') return await rotated.png({ compressionLevel: 9 }).toBuffer();
    return await rotated.webp({ quality: 90 }).toBuffer();
  } catch {
    throw new SourceFileRejectedError(BAD_IMAGE_MESSAGE, 400);
  }
}

/**
 * Validate and normalise one uploaded file. Throws `SourceFileRejectedError`
 * (400 bad type/content, 413 too large) — never stores anything itself.
 */
export async function processSourceFile(input: Buffer): Promise<ProcessedSourceFile> {
  if (input.length === 0) throw new SourceFileRejectedError(EMPTY_FILE_MESSAGE, 400);
  if (input.length > MAX_SOURCE_FILE_BYTES) {
    throw new SourceFileRejectedError(FILE_TOO_LARGE_MESSAGE, 413);
  }

  const mimeType = detectSourceFileType(input);
  if (!mimeType) throw new SourceFileRejectedError(UNSUPPORTED_TYPE_MESSAGE, 400);

  let bytes: Buffer;
  if (mimeType === 'application/pdf') {
    if (pdfHasActiveContent(input)) {
      throw new SourceFileRejectedError(PDF_ACTIVE_CONTENT_MESSAGE, 400);
    }
    bytes = input;
  } else {
    bytes = await reencodeImage(input, mimeType);
  }

  // Re-encoding can grow a file; the stored bytes are what the cap is about.
  if (bytes.length > MAX_SOURCE_FILE_BYTES) {
    throw new SourceFileRejectedError(FILE_TOO_LARGE_MESSAGE, 413);
  }
  return { mimeType, bytes };
}

// ---------------------------------------------------------------------------
// File names
// ---------------------------------------------------------------------------

/**
 * A display name safe to store and to put in a header: base name only, no
 * control characters or quotes, ≤ 200 characters, and an extension that
 * matches the DETECTED type (a PDF never downloads as `evil.html`).
 */
export function sanitizeSourceFileName(raw: unknown, mimeType: SourceFileMime): string {
  const { canonical, accepted } = EXTENSIONS[mimeType];
  const base = String(raw ?? '')
    .split(/[\\/]/)
    .pop()!
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"'`]/g, '')
    .trim();

  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1) : '';
  let stem = accepted.includes(ext.toLowerCase()) ? base.slice(0, dot) : base;
  const suffix = accepted.includes(ext.toLowerCase()) ? ext : canonical;

  // Keep only a stem that is not empty / dots only.
  stem = stem.replace(/^\.+/, '').trim();
  if (!stem) stem = 'ملف';

  const room = MAX_SOURCE_FILE_NAME - suffix.length - 1;
  const stemChars = [...stem];
  if (stemChars.length > room) stem = stemChars.slice(0, room).join('');
  return `${stem}.${suffix}`;
}

/** RFC 5987 `attr-char` encoding (stricter than encodeURIComponent). */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*!]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * `Content-Disposition` for serving: images inline (they are re-encoded),
 * PDFs as a download. The name is re-sanitised here as defence in depth.
 */
export function contentDispositionFor(mimeType: SourceFileMime, fileName: string): string {
  const disposition = mimeType === 'application/pdf' ? 'attachment' : 'inline';
  const safe = sanitizeSourceFileName(fileName, mimeType);
  const fallback = `file.${EXTENSIONS[mimeType].canonical}`;
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(safe)}`;
}

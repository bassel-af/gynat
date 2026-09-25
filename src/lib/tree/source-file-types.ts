/**
 * Sources («المصادر») — file constants shared by server and client, with no
 * dependency on sharp (the pipeline itself lives in source-file-processing.ts).
 */
export type SourceFileMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

/** The allow-list — also the DB CHECK on `source_files.mime_type`. */
export const SOURCE_FILE_MIME_TYPES: readonly SourceFileMime[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

/** 8 MB per stored file — also the DB CHECK on `source_files.size_bytes`. */
export const MAX_SOURCE_FILE_BYTES = 8 * 1024 * 1024;

export function isSourceFileMime(value: unknown): value is SourceFileMime {
  return typeof value === 'string' && (SOURCE_FILE_MIME_TYPES as readonly string[]).includes(value);
}

export const FILE_TOO_LARGE_MESSAGE = 'حجم الملف يتجاوز الحد المسموح (8 ميغابايت)';

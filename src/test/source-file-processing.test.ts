// @vitest-environment node
/**
 * Sources («المصادر») step 5 — the file pipeline: magic-byte detection, image
 * re-encode (EXIF/GPS stripped, rotation applied, pixel bombs refused), PDF
 * active-content refusal, size cap and file-name sanitising.
 */
import { describe, test, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import sharp from 'sharp';
import {
  detectSourceFileType,
  processSourceFile,
  pdfHasActiveContent,
  sanitizeSourceFileName,
  contentDispositionFor,
  SourceFileRejectedError,
  MAX_SOURCE_FILE_BYTES,
  UNSUPPORTED_TYPE_MESSAGE,
} from '@/lib/tree/source-file-processing';

async function jpegWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 20, channels: 3, background: '#c00' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Make: 'SecretCam' },
      IFD3: { GPSLatitudeRef: 'N', GPSMapDatum: 'SECRET-GPS-DATUM' },
    })
    .toBuffer();
}

const pdf = (body: string) => Buffer.from(`%PDF-1.7\n${body}\n%%EOF\n`, 'latin1');

async function rejects(buf: Buffer): Promise<SourceFileRejectedError> {
  try {
    await processSourceFile(buf);
  } catch (e) {
    expect(e).toBeInstanceOf(SourceFileRejectedError);
    return e as SourceFileRejectedError;
  }
  throw new Error('expected a rejection');
}

describe('detectSourceFileType (magic bytes only)', () => {
  test('recognises the four accepted formats', async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#fff' } }).png().toBuffer();
    const webp = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } }).webp().toBuffer();
    expect(detectSourceFileType(await jpegWithGps())).toBe('image/jpeg');
    expect(detectSourceFileType(png)).toBe('image/png');
    expect(detectSourceFileType(webp)).toBe('image/webp');
    expect(detectSourceFileType(pdf('1 0 obj << >> endobj'))).toBe('application/pdf');
  });

  test('refuses SVG, HTML, GIF, TIFF, zip and a RIFF that is not WebP', () => {
    for (const s of [
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
      '<!doctype html><script>alert(1)</script>',
      'GIF89a....',
    ]) {
      expect(detectSourceFileType(Buffer.from(s))).toBeNull();
    }
    expect(detectSourceFileType(Buffer.from([0x49, 0x49, 0x2a, 0x00, 1, 2, 3, 4]))).toBeNull(); // TIFF
    expect(detectSourceFileType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]))).toBeNull(); // zip
    expect(detectSourceFileType(Buffer.from('RIFF\x10\x00\x00\x00WAVEfmt ', 'latin1'))).toBeNull();
  });

  test('an empty or tiny buffer is refused', () => {
    expect(detectSourceFileType(Buffer.alloc(0))).toBeNull();
    expect(detectSourceFileType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe('processSourceFile — images', () => {
  test('strips EXIF and GPS from a JPEG', async () => {
    const input = await jpegWithGps();
    expect(input.includes('SECRET-GPS-DATUM')).toBe(true);
    const out = await processSourceFile(input);
    expect(out.mimeType).toBe('image/jpeg');
    expect(out.bytes.includes('SECRET-GPS-DATUM')).toBe(false);
    expect(out.bytes.includes('SecretCam')).toBe(false);
    expect((await sharp(out.bytes).metadata()).exif).toBeUndefined();
  });

  test('applies the EXIF rotation (40x20 with orientation 6 becomes 20x40)', async () => {
    const out = await processSourceFile(await jpegWithGps());
    const meta = await sharp(out.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([20, 40]);
    expect(meta.orientation).toBeUndefined();
  });

  test('re-encodes PNG and WebP in their own format', async () => {
    const png = await sharp({ create: { width: 3, height: 3, channels: 4, background: '#0f0' } })
      .png()
      .withExif({ IFD0: { Make: 'PngCam' } })
      .toBuffer();
    const outPng = await processSourceFile(png);
    expect(outPng.mimeType).toBe('image/png');
    expect(outPng.bytes.includes('PngCam')).toBe(false);

    const webp = await sharp({ create: { width: 3, height: 3, channels: 3, background: '#00f' } }).webp().toBuffer();
    const outWebp = await processSourceFile(webp);
    expect(outWebp.mimeType).toBe('image/webp');
    expect(detectSourceFileType(outWebp.bytes)).toBe('image/webp');
  });

  test('an image MIME claim with bad bytes is refused (JPEG magic, garbage body)', async () => {
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('not really a jpeg')]);
    const err = await rejects(fake);
    expect(err.status).toBe(400);
  });

  test('a pixel bomb (> 50 MP) is refused', async () => {
    const bomb = await sharp({ create: { width: 8000, height: 7000, channels: 3, background: '#000' } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.length).toBeLessThan(MAX_SOURCE_FILE_BYTES);
    const err = await rejects(bomb);
    expect(err.status).toBe(400);
  }, 30_000);

  test('SVG and HTML are refused with the Arabic unsupported-type message', async () => {
    const svg = await rejects(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'));
    expect(svg.message).toBe(UNSUPPORTED_TYPE_MESSAGE);
    const html = await rejects(Buffer.from('<html><body>hi</body></html>'));
    expect(html.message).toBe(UNSUPPORTED_TYPE_MESSAGE);
  });

  test('a file over 8 MB is refused with 413', async () => {
    const big = Buffer.concat([pdf(''), Buffer.alloc(MAX_SOURCE_FILE_BYTES)]);
    const err = await rejects(big);
    expect(err.status).toBe(413);
  });
});

describe('PDF active content', () => {
  test('a plain PDF is stored as-is', async () => {
    const input = pdf('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
    const out = await processSourceFile(input);
    expect(out.mimeType).toBe('application/pdf');
    expect(out.bytes.equals(input)).toBe(true);
  });

  test.each(['/JavaScript', '/JS', '/OpenAction', '/Launch', '/EmbeddedFile', '/AA'])(
    'refuses a PDF containing %s',
    async (token) => {
      const err = await rejects(pdf(`1 0 obj << ${token} (x) >> endobj`));
      expect(err.status).toBe(400);
    },
  );

  test('does not trip on a longer name that merely starts with a banned one', () => {
    expect(pdfHasActiveContent(pdf('<< /AAPL:Keywords [] /JSONish 1 /Launcher 2 >>'))).toBe(false);
  });

  test('sees through #-escaped names (/J#61vaScript)', () => {
    expect(pdfHasActiveContent(pdf('<< /S /J#61vaScript >>'))).toBe(true);
  });

  test('sees inside a Flate-compressed object stream', () => {
    const hidden = deflateSync(Buffer.from('<< /OpenAction 5 0 R >>', 'latin1'));
    const body = Buffer.concat([
      Buffer.from('%PDF-1.7\n3 0 obj << /Type /ObjStm /Filter /FlateDecode >>\nstream\n', 'latin1'),
      hidden,
      Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
    ]);
    expect(pdfHasActiveContent(body)).toBe(true);
  });

  test('refuses an encrypted PDF (its streams cannot be inspected)', () => {
    expect(pdfHasActiveContent(pdf('trailer << /Encrypt 9 0 R >>'))).toBe(true);
  });
});

describe('sanitizeSourceFileName', () => {
  test('keeps only the base name', () => {
    expect(sanitizeSourceFileName('../../etc/وثيقة.pdf', 'application/pdf')).toBe('وثيقة.pdf');
    expect(sanitizeSourceFileName('C:\\Users\\x\\scan.jpg', 'image/jpeg')).toBe('scan.jpg');
  });

  test('strips control characters and quotes', () => {
    expect(sanitizeSourceFileName('a\r\nb"c\u0000.png', 'image/png')).toBe('abc.png');
  });

  test('forces the extension to the detected type', () => {
    expect(sanitizeSourceFileName('evil.html', 'image/jpeg')).toBe('evil.html.jpg');
    expect(sanitizeSourceFileName('photo.JPEG', 'image/jpeg')).toBe('photo.JPEG');
    expect(sanitizeSourceFileName('noext', 'application/pdf')).toBe('noext.pdf');
  });

  test('caps the length at 200 characters, extension kept', () => {
    const name = sanitizeSourceFileName(`${'ب'.repeat(500)}.pdf`, 'application/pdf');
    expect([...name].length).toBeLessThanOrEqual(200);
    expect(name.endsWith('.pdf')).toBe(true);
  });

  test('an empty name falls back to a default', () => {
    expect(sanitizeSourceFileName('', 'image/webp')).toBe('ملف.webp');
    expect(sanitizeSourceFileName('///', 'application/pdf')).toBe('ملف.pdf');
  });
});

describe('contentDispositionFor', () => {
  test('images are inline, PDFs are attachments, with an RFC 5987 filename', () => {
    expect(contentDispositionFor('image/png', 'صورة.png')).toBe(
      `inline; filename="file.png"; filename*=UTF-8''${encodeURIComponent('صورة.png')}`,
    );
    expect(contentDispositionFor('application/pdf', 'doc.pdf')).toMatch(/^attachment; /);
  });

  test('CR, LF and quotes never reach the header', () => {
    const v = contentDispositionFor('application/pdf', 'a"\r\nSet-Cookie: x.pdf');
    expect(v).not.toMatch(/[\r\n]/);
    expect(v.split('filename*=')[1]).not.toContain('"');
  });
});

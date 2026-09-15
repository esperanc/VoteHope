import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import sharp, { type Metadata } from 'sharp';

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_SVG_BYTES = 1024 * 1024;
const MAX_DIMENSION = 1600;
const RASTER_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'tiff']);

/** Stored images are named <16 url-safe characters>.<webp|svg>. */
export const MEDIA_FILE = /^[A-Za-z0-9_-]{16}\.(?:webp|svg)$/;

export class UnsupportedImageError extends Error {}

interface ProcessedImage {
  data: Buffer;
  ext: 'webp' | 'svg';
  mime: string;
  width: number;
  height: number;
}

/**
 * Raster images are scaled to fit 1600×1600 and re-encoded as WebP, which keeps
 * downloads small on phones and strips metadata such as the GPS position in photos.
 * WebP files that already fit and carry no metadata (e.g. from an exported quiz)
 * are kept as they are, to avoid losing quality to repeated re-encoding.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  if (looksLikeSvg(input)) return processSvg(input);

  let meta: Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new UnsupportedImageError();
  }
  const { format, width, height } = meta;
  if (!format || !RASTER_FORMATS.has(format) || !width || !height) throw new UnsupportedImageError();

  const pages = meta.pages ?? 1;
  const frameHeight = meta.pageHeight ?? height;
  const fits = width <= MAX_DIMENSION && frameHeight <= MAX_DIMENSION;
  if (format === 'webp' && fits && !meta.exif && !meta.xmp) {
    return { data: input, ext: 'webp', mime: 'image/webp', width, height: frameHeight };
  }

  const graphic = format === 'png' || format === 'gif';
  const { data, info } = await sharp(input, { animated: true })
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .webp(graphic ? { nearLossless: true, quality: 80 } : { quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return { data, ext: 'webp', mime: 'image/webp', width: info.width, height: Math.round(info.height / pages) };
}

async function processSvg(input: Buffer): Promise<ProcessedImage> {
  if (input.length > MAX_SVG_BYTES) throw new UnsupportedImageError();
  let meta: Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new UnsupportedImageError();
  }
  if (meta.format !== 'svg' || !meta.width || !meta.height) throw new UnsupportedImageError();
  // Kept as a vector. Media is served with a sandboxing Content-Security-Policy
  // (see app.ts), so scripts inside an SVG never run.
  return { data: input, ext: 'svg', mime: 'image/svg+xml', width: meta.width, height: meta.height };
}

function looksLikeSvg(input: Buffer): boolean {
  const head = input.subarray(0, 2048).toString('utf8').trimStart();
  return head.startsWith('<') && /<svg[\s>]/i.test(head);
}

export interface StoredImage {
  url: string;
  width: number;
  height: number;
}

export function createImageStore(db: DatabaseSync, mediaDir: string) {
  const insert = db.prepare('INSERT INTO images (id, filename, mime, width, height) VALUES (?, ?, ?, ?, ?)');

  return {
    async save(input: Buffer): Promise<StoredImage> {
      const image = await processImage(input);
      const id = randomBytes(12).toString('base64url');
      const filename = `${id}.${image.ext}`;
      writeFileSync(path.join(mediaDir, filename), image.data);
      insert.run(id, filename, image.mime, image.width, image.height);
      return { url: `/media/${filename}`, width: image.width, height: image.height };
    },
  };
}

export type ImageStore = ReturnType<typeof createImageStore>;

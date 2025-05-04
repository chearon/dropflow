import {environment} from './environment.js';
import {HTMLElement, TextNode} from './dom.js';

// JPEG markers always start with 0xFF
const JPEG_SOI = 0xffd8;  // Start of Image
const JPEG_SOF0 = 0xffc0; // Baseline
const JPEG_SOF2 = 0xffc2; // Progressive

// PNG signature and IHDR chunk
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IHDR = 0x49484452;

// GIF signature variants
const GIF87a = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
const GIF89a = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

// BMP signature and header size
const BMP_SIGNATURE = 0x4d42; // 'BM'

function compareArrays(a: Uint8Array, b: Uint8Array, length: number): boolean {
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function parseJpegDimensions(buffer: ArrayBufferLike) {
  const view = new DataView(buffer);
  
  // Check for JPEG signature
  if (view.getUint16(0) !== JPEG_SOI) {
    throw new Error('Not a valid JPEG file');
  }

  let offset = 2;
  while (offset < buffer.byteLength) {
    // All JPEG markers start with 0xff
    if (view.getUint8(offset) !== 0xff) {
      throw new Error('Invalid JPEG marker');
    }

    const marker = view.getUint16(offset);
    offset += 2;

    // Check for SOF markers that contain dimensions
    if (marker === JPEG_SOF0 || marker === JPEG_SOF2) {
      // Skip segment length and precision bytes
      offset += 3;
      const height = view.getUint16(offset);
      const width = view.getUint16(offset + 2);
      return {width, height};
    }

    // Skip to next marker using segment length
    const length = view.getUint16(offset);
    offset += length;
  }

  throw new Error('No JPEG dimensions found');
}

function parsePngDimensions(buffer: ArrayBufferLike) {
  const view = new DataView(buffer);
  const signature = new Uint8Array(buffer, 0, 8);

  if (!compareArrays(signature, PNG_SIGNATURE, 8)) {
    throw new Error('Not a valid PNG file');
  }

  // IHDR chunk is always first and contains dimensions
  // Skip signature (8) and chunk length (4)
  const chunkType = view.getUint32(12);
  if (chunkType !== PNG_IHDR) {
    throw new Error('Invalid PNG: Missing IHDR chunk');
  }

  const width = view.getUint32(16);
  const height = view.getUint32(20);

  return {width, height};
}

function parseGifDimensions(buffer: ArrayBufferLike) {
  const view = new DataView(buffer);
  const signature = new Uint8Array(buffer, 0, 6);

  if (!compareArrays(signature, GIF87a, 6) && !compareArrays(signature, GIF89a, 6)) {
    throw new Error('Not a valid GIF file');
  }

  // Dimensions are stored right after signature
  const width = view.getUint16(6, true); // GIF uses little-endian
  const height = view.getUint16(8, true);

  return {width, height};
}

function parseBmpDimensions(buffer: ArrayBufferLike) {
  const view = new DataView(buffer);

  if (view.getUint16(0) !== BMP_SIGNATURE) {
    throw new Error('Not a valid BMP file');
  }

  // BMP dimensions are at offset 18 and 22
  const width = Math.abs(view.getInt32(18, true)); // Can be negative for top-down images
  const height = Math.abs(view.getInt32(22, true));

  return {width, height};
}

function parseImageDimensions(buffer: ArrayBufferLike) {
  // Try to detect format from first bytes
  const view = new DataView(buffer);
  const firstBytes = view.getUint16(0);

  try {
    if (firstBytes === JPEG_SOI) {
      return parseJpegDimensions(buffer);
    } else if (firstBytes === BMP_SIGNATURE) {
      return parseBmpDimensions(buffer);
    } else {
      const signature = new Uint8Array(buffer, 0, 8);
      if (compareArrays(signature, PNG_SIGNATURE, 8)) {
        return parsePngDimensions(buffer);
      } else if (compareArrays(signature, GIF87a, 6) || compareArrays(signature, GIF89a, 6)) {
        return parseGifDimensions(buffer);
      }
    }
  } catch (e: Error | unknown) {
    if (e instanceof Error) {
      throw new Error(`Failed to parse image dimensions: ${e.message}`);
    }
    throw new Error('Failed to parse image dimensions: Unknown error');
  }

  throw new Error('Unsupported image format');
} 

export class Image {
  url: URL | undefined;
  buffer: ArrayBufferLike | undefined;
  width: number;
  height: number;
  state: 'unloaded' | 'loading' | 'loaded';
  decoded: unknown;

  constructor(source: URL | ArrayBuffer) {
    if (source instanceof URL) {
      this.url = source;
    } else {
      this.buffer = source;
    }
    this.width = 0;
    this.height = 0;
    this.state = 'unloaded';
    this.decoded = null;
  }

  /** @internal */
  _destroy() {
    environment.destroyDecodedImage(this.decoded);
  }

  #onBuffer(buffer: ArrayBufferLike) {
    const {width, height} = parseImageDimensions(buffer);
    this.width = width;
    this.height = height;
  }

  async load() {
    if (this.state === 'unloaded' && this.url) {
      try {
        this.buffer = await environment.resolveUrl(this.url)
        this.#onBuffer(this.buffer);
        this.decoded = await environment.createDecodedImage(this)
      } finally {
        this.state = 'loaded';
      }
    }
  }

  loadSync() {
    if (this.state === 'unloaded' && this.url) {
      try {
        this.buffer = environment.resolveUrlSync(this.url);
        this.#onBuffer(this.buffer);
      } finally {
        this.state = 'loaded';
      }
    }
  }
}

const cache = new Map<string, Image>();

export function getImage(url: URL) {
  return cache.get(url.href);
}

function checkCache() {
  if (cache.size > 1_000) {
    for (const image of cache.values()) image._destroy();
    cache.clear();
  }
}

function ensureImage(url: string) {
  let image = cache.get(url);
  if (!image) cache.set(url, image = new Image(new URL(url)));
  return image;
}

function loadImagesImpl(root: HTMLElement, cb: (el: HTMLElement, url: string) => void) {
  const stack: (HTMLElement | TextNode)[] = [root];
  while (stack.length) {
    const el = stack.pop()!;
    if (el instanceof HTMLElement) {
      if (el.tagName === 'img') {
        if (el.attrs.src) cb(el, el.attrs.src);
      }
      for (const child of el.children) stack.push(child);
    }
  }
}


export async function loadImages(root: HTMLElement) {
  const promises: Promise<void>[] = [];
  checkCache();
  loadImagesImpl(root, (el, url) => promises.push(ensureImage(url).load()));
  await Promise.all(promises);
}

export function loadImagesSync(root: HTMLElement) {
  checkCache();
  loadImagesImpl(root, (el, url) => ensureImage(url).loadSync());
}

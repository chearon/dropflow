import type {LoadedFontFace} from "./text-font.js";
import type {Image} from "./layout-image.js";

// !!! NOTE !!! if you change anything below, change the readme too
export interface Environment {
  /**
   * Must return a promise of a Uint8Array of dropflow.wasm. Typically this
   * just does a fetch() or fs.readFile.
   *
   * Since dropflow internally depends on WASM using top-level await, if you
   * want to change the location, you need to do it before importing dropflow.
   * To do that, import {environment} from 'dropflow/environment.js';
   *
   * Many package managers only guarantee the order of imports relative to other
   * imports, so you should usually call this in a separate module imported
   * before dropflow. See the README for an example.
   */
  wasmLocator(): Promise<Uint8Array>;
  /**
   * This will get called when a font in flow.fonts transitions to loaded or
   * when an already loaded font is added to flow.fonts. It's intended to be
   * used to add the font to the underlying paint target.
   *
   * Use `face.getBuffer` if the backend supports font buffers. You can use the
   * url property to access the file if it doesn't (node-canvas v2). The font
   * will be selected via `face.uniqueFamily` and nothing else.
   *
   * You can return an unregister function which will be called when the font
   * is no longer needed by dropflow (eg user called `flow.fonts.delete`).
   */
  registerFont(face: LoadedFontFace): (() => void) | void;
  /**
   * Must return a promise of a buffer for the given URL. This used for fonts
   * and will be used for images.
   */
  resolveUrl(url: URL): Promise<ArrayBufferLike>;
  /**
   * Same as `resolveUrl`, but synchronous if it's a file:// URL. This should
   * throw if URL is not a file:// URL, which would mean the user called
   * loadSync on a document with asynchronous-only URLs.
   */
  resolveUrlSync(url: URL): ArrayBufferLike;
  /**
   * During `flow.load` this will get called for paint backends that need to
   * decode images first, asynchronously (canvas). The result will be stored on
   * on the image so that it's ready to go for synchronous painting. Backends
   * like SVG and HTML do not use the result of this, so it can safely be set
   * to a function that returns undefined so no unnecessary work is done.
   */
  createDecodedImage(image: Image): Promise<unknown>;
  /**
   * In case createDecodedImage allocates external resources, this can be used
   * to clean up. It gets called when the image cache grows beyond a certain
   * threshold and is cleared.
   */
  destroyDecodedImage(handle: unknown): void;
}

export const defaultEnvironment: Environment = {
  wasmLocator() {
    throw new Error(
      "Wasm location not configured. Import {environment} from " +
        "'dropflow/environment.js' before importing 'dropflow' and assign " +
        "an async function that returns a Uint8Array to wasmLocator.",
    );
  },
  registerFont() {
    // optional (dropflow can be used for layout only)
  },
  resolveUrl() {
    throw new Error(
      'Invalid build! Your bundler needs to support "exports" in package.json.',
    );
  },
  resolveUrlSync() {
    throw new Error(
      'Invalid build! Your bundler needs to support "exports" in package.json.',
    );
  },
  async createDecodedImage() {
    // optional (svg doesn't use it)
  },
  destroyDecodedImage() {
    // optional (node-canvas just gc's, but browser needs revokeObjectURL)
  },
};

export const environment = { ...defaultEnvironment };

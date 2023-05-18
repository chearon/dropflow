import {hb, fcfg} from './deps.js';
import {basename, hashMix} from './util.js';
import {langForScript} from './text.js';

import type {HbFace} from 'harfbuzzjs';
import type {Style} from './cascade.js';
import type {Cascade} from 'fontconfig';

const fontBuffers = new Map<string, ArrayBuffer>();

export function registerFont(buffer: Uint8Array, filename: string) {
  if (!fontBuffers.has(filename)) {
    fcfg.addFont(buffer, filename);
    fontBuffers.set(filename, buffer);
  }
}

// TODO deregisterFont

function getFontBuffer(filename: string) {
  const buffer = fontBuffers.get(filename);
  if (!buffer) throw new Error(`${filename} not found`);
  return buffer;
}

function createFace(filename: string, index: number) {
  const buffer = getFontBuffer(filename);
  const blob = hb.createBlob(buffer);
  const face = hb.createFace(blob, index);
  face.name = basename(filename); // TODO can it be done in hbjs?
  return face;
}

const hbFaces = new Map<string, HbFace>();

export function getFace(filename: string, index: number) {
  let face = hbFaces.get(filename + index);
  if (!face) {
    face = createFace(filename, index);
    hbFaces.set(filename + index, face);
  }
  return face;
}

export function createFontKey(s: Style, script: string) {
  let hash = s.fontWeight;

  for (let i = 0; i < s.fontStyle.length; ++i) {
    hash = hashMix(hash, s.fontStyle.charCodeAt(i));
  }

  for (let i = 0; i < s.fontStretch.length; ++i) {
    hash = hashMix(hash, s.fontStretch.charCodeAt(i));
  }

  for (const f of s.fontFamily) {
    for (let i = 0; i < f.length; ++i) {
      hash = hashMix(hash, f.charCodeAt(i));
    }
  }

  for (let i = 0; i < script.length; ++i) {
    hash = hashMix(hash, script.charCodeAt(i));
  }

  return hash;
}

const cascades = new Map<number, Cascade>();

export function getCascade(style: Style, script: string) {
  const fontKey = createFontKey(style, script);
  let cascade = cascades.get(fontKey);
  if (!cascade) {
    const family = style.fontFamily;
    const weight = String(style.fontWeight);
    const width = style.fontStretch;
    const slant = style.fontStyle;
    const lang = langForScript(script);
    cascade = fcfg.sort({family, weight, width, slant, lang});
    cascades.set(fontKey, cascade);
  }
  return cascade;
}

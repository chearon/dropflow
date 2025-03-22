import {environment, defaultEnvironment} from './environment.js';

// TypeScript does not support different possibilities of runtime environments,
// so the types loaded are for node. To add the browser environment too would
// add too many globals.
//
// https://gist.github.com/RyanCavanaugh/702ebd1ca2fc060e58e634b4e30c1c1c
declare const document: any;
declare const FontFace: any;

if (environment.registerFont === defaultEnvironment.registerFont) {
  environment.registerFont = function (face) {
    const buffer = face.getBuffer();
    document.fonts.add(new FontFace(face.uniqueFamily, buffer));
  };
}

if (environment.resolveUrl === defaultEnvironment.resolveUrl) {
  environment.resolveUrlSync = function (url) {
    throw new Error(`Cannot load synchronously: ${url}`);
  };
}

if (environment.resolveUrlSync === defaultEnvironment.resolveUrlSync) {
  environment.resolveUrl = async function (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.statusText);
    return await res.arrayBuffer();
  };
}

// wasm locator must be manually configured

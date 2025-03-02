import {environment, defaultEnvironment} from './environment.js';

// TypeScript does not support different possibilities of runtime environments,
// so the types loaded are for node. To add the browser environment too would
// add too many globals.
//
// https://gist.github.com/RyanCavanaugh/702ebd1ca2fc060e58e634b4e30c1c1c
declare const document: any;
declare const FontFace: any;

if (environment.registerFont === defaultEnvironment.registerFont) {
  environment.registerFont = function (face, buffer, url) {
    document.fonts.add(new FontFace(face.uniqueFamily, buffer));
  };
}

// wasm locator must be manually configured

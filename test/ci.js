// TODO: the tests should import the api, ideally, or at least some test-api
// that's not exposed by package.json. this is only needed because the tests
// import files directly
import '#register-default-environment';
import './grow-memory.js';
import './canvas-slow-lld-fix.js';
import './api.spec.js';
import './cascade.spec.js';
import './css.spec.js';
import './flow.spec.js';
import './text.spec.js';
import './font.spec.js';
import './itemize.spec.js';
import './paint.spec.js';
import {environment} from 'dropflow';

// Tests don't make calls to node-canvas; that's what the mock paint class is for
environment.registerFont = () => {};

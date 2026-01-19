// @ts-check
import './config.js';
import * as flow from 'dropflow';
import parse from 'dropflow/parse.js';
import registerNotoFonts from 'dropflow/register-noto-fonts.js';
import {EditorView, basicSetup} from 'codemirror';
import {EditorState} from '@codemirror/state';
import {html} from '@codemirror/lang-html';
import {solarizedDark} from '@ddietr/codemirror-themes/solarized-dark.js'

const [canvas] = document.getElementsByTagName('canvas');
const twinview = document.getElementById('twinview');
const wrap = document.getElementById('wrap');
const editor = document.querySelector('#editor');
const canvasLabel = document.getElementById('canvas-label');

flow.setOriginStyle({zoom: window.devicePixelRatio});
registerNotoFonts();

async function loadLayoutPaint() {
  const ctx = canvas.getContext('2d');
  const cssWidth = wrap.getBoundingClientRect().width;
  const cssHeight = wrap.getBoundingClientRect().height;
  const dpxWidth = Math.ceil(cssWidth * window.devicePixelRatio);
  const dpxHeight = Math.ceil(cssHeight * window.devicePixelRatio);

  await flow.load(documentElement);
  canvas.style.width = `${dpxWidth / window.devicePixelRatio}px`;
  canvas.style.height = `${dpxHeight / window.devicePixelRatio}px`;
  canvas.width = dpxWidth;
  canvas.height = dpxHeight;

  const {r, g, b, a} = documentElement.style.backgroundColor;
  canvasLabel.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  flow.reflow(layout, canvas.width, canvas.height);
  flow.paintToCanvas(layout, canvas.getContext('2d'));
  ctx.restore();
}

const watch = EditorView.updateListener.of(update => {
  if (update.docChanged) {
    parseGenerate();
    loadLayoutPaint();
  }
});

const state = EditorState.create({
  doc: `<html style="background-color: #067; margin: 1em; color: #afe">
  <h1>
    <img
      src="https://chearon.github.io/dropflow/assets/logo-afe.png"
      style="height: 35px; vertical-align: -8px"
    >
    playground
  </h1>
  <h2 style="text-align: center;">this is all being rendered to a canvas</h2>
  <h3 style="text-align: right;">edit the html to the left to see live updates</h3>

  <div style="
    font-size: 0.75em;
    border-left: 10px solid #c33;
    padding: 5px;
    background-color: #faa;
    color: #633;
    margin: 1em 0;
  ">
    <div style="font-weight: bold; font-size: 1.25em;">NOTE</div>
    Using dropflow to render to a browser canvas is rarely better than
    native HTML and CSS (but there are cases for it). This is a demo to
    show the capabilities you could use for server-generated images and PDFs.
  </div>

  <div style="background-color: #a91; float: left; padding: 0.5em; margin-right: 0.5em;">
    To the left!
  </div>
  <div style="background-color: #a91; float: right; padding: 0.5em; margin-left: 0.5em;">
    To the right!
  </div>
  <p>
    To the left and right are examples of <strong>floats</strong>.
    <span style="color: #efa;">Floats are placed as they are encountered
    in text, so text that comes after them won't collide with them.</span>
    If this text doesn't go underneath the floats, resize your browser window.
  </p>

  <div style="border-top: 3px solid #2344; margin: 1em 0;"></div>

  <div>
    Another difficult feature is inline-blocks.
    <div style="
      display: inline-block;
      border: 1px solid #111;
      width: 100px;
      background-color: #fff;
      color: #111;
      padding: 0.25em;
    ">
      Here's one right here.
    </div>
    That's what they do: the "inline" part means that
    <span style="color: #efa;"> it's inline-<em>level</em>, and
    the "block" part is short for <em>block container</em>.</span></span>
  </div>

  <div style="border-top: 3px solid #2344; margin: 1em 0;"></div>

  <div style="margin: 1em 0;">
    You may want to have some text in a paragraph to be raised or
    lowered. That's done with vertical-align.
    <span style="color: #efa;">
    <sup>alignment <sup>is <sup>relative</sup> to</sup> the</sup>
    parent, except <span style="vertical-align: top;">top
      <span style="vertical-align: bottom;">and bottom,</span>
    </span></span> which are broken out and aligned to the line
    as an atomic unit.
  </div>

  <div style="border-top: 3px solid #2344; margin: 1em 0;"></div>

  <div style="zoom: 2;">
    The
    <span style="border-bottom: 3px solid #afe; font-style: italic;">zoom</span>
    property makes everything bigger! <span style="zoom: 33%;">(or smaller)
  </div>

  <div style="border-top: 3px solid #2344; margin: 1em 0;"></div>

  <div style="margin: 1em 0;">
    Finally, <span style="background-color: #133; color: #aef">when
    painting inline backgrounds, the inline element must not interrupt
    font shaping features like ligatures, or kerning, such as the text
    "A</span>V". When an inline is

    <span style="
      position: relative;
      top: 5px;
      border-bottom: 3px solid #fff;
    ">relatively positioned</span>,

    this does interrupt shaping boundaries.
  </div>
</html>`,
  extensions: [basicSetup, html(), watch, solarizedDark]
});

const view = new EditorView({state, parent: editor});

let documentElement;
let layout;

function parseGenerate() {
  documentElement = parse(view.state.doc.toString());
  layout = flow.layout(documentElement);
  window.layout = layout;
  window.documentElement = documentElement;
}

const observer = new ResizeObserver(function () {
  loadLayoutPaint();
});

let lastDevicePixelRatio = window.devicePixelRatio;

window.addEventListener('resize', function () {
  if (window.devicePixelRatio !== lastDevicePixelRatio) {
    lastDevicePixelRatio = window.devicePixelRatio;
    flow.setOriginStyle({zoom: window.devicePixelRatio});
    parseGenerate();
    loadLayoutPaint();
  }
});

observer.observe(wrap);

let divider = +localStorage['divider'] || 50;
let animationTimer = localStorage['divider'] == null ? setTimeout(animate, 2e3) : null;
let isDragging = false;

function animate() {
  editor.animate([
    {width: '50%', easing: 'cubic-bezier(0.82,-0.67,0.07,0.92)'},
    {width: '55%', easing: 'cubic-bezier(0.61,0.17,0.07,0.86)'},
    {width: '50%'}
  ], {duration: 2000});
  animationTimer = null;
}

function getEffectiveDivider() {
  return Math.min(90, Math.max(10, divider));
}

function renderWidth() {
  editor.style.width = getEffectiveDivider() + '%';
}

function getState(e) {
  const rect = twinview.getBoundingClientRect();
  const total = rect.width;
  const divider = total * getEffectiveDivider() / 100;
  const mouse = e.clientX - rect.x;
  return {mouse, divider, total};
}

function isInHandle(state) {
  return Math.abs(state.divider - state.mouse) < 10;
}

twinview.addEventListener('pointermove', e => {
  const state = getState(e);
  const inHandle = isInHandle(state);
  if (inHandle) {
    isDragging ||= e.buttons === 1 && Boolean(e.movementX || e.movementY)
    if (animationTimer != null) {
      clearTimeout(animationTimer);
      animationTimer = null;
    }
  }
  if (isDragging) {
    divider = 100 * state.mouse / state.total;
    renderWidth();
  } else {
    twinview.style.cursor = inHandle ? "ew-resize" : "";
  }
});

twinview.addEventListener('pointerdown', e => {
  if (isInHandle(getState(e)) && e.buttons === 1) {
    e.preventDefault();
    twinview.setPointerCapture(e.pointerId);
  }
});

twinview.addEventListener('dblclick', e => {
  if (isInHandle(getState(e))) {
    divider = 50;
    delete localStorage['divider'];
    renderWidth();
  }
});

twinview.addEventListener('pointerup', e => {
  if (isDragging) {
    isDragging = false;
    localStorage['divider'] = divider;
  }
});

window.flow = flow;

view.dom.style.height = '100%';
view.scrollDOM.style.overflow = 'auto';

// init
parseGenerate();
renderWidth();
loadLayoutPaint();

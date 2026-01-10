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
  flow.layout(tree, canvas.width, canvas.height);
  flow.paintToCanvas(tree, canvas.getContext('2d'));
  ctx.restore();
}

const watch = EditorView.updateListener.of(update => {
  if (update.docChanged) {
    parseGenerate();
    loadLayoutPaint();
  }
});

const state = EditorState.create({
  doc: `
<html style="background-color: #067; margin: 1em; color: #afe">
  <div style="font: 16px/1.4 Arimo; background-color: white; zoom: 2;" x-dropflow-log>
    <span style="background-color: #eee;">
      I <span style="font-family: Cousine; color: #11a;">like</span> to write
      <span style="font-size: 3em;">layout code</span>
    </span>
    <span style="background-color: #eec;">
      because it is
      <span style="color: #999; font-style: italic;">equal parts</span>
      <span style="font-weight: bold;">challenging</span>,
      <span style="font-weight: bold; background-color: veronicayellow;">fun</span>, and
      <span style="font-weight: bold;">arcane</span>.
    </span>
  </div>
</html>`,
  extensions: [basicSetup, html(), watch, solarizedDark]
});

const view = new EditorView({state, parent: editor});

let documentElement;
let tree;

function parseGenerate() {
  documentElement = parse(view.state.doc.toString());
  tree = flow.generate(documentElement);
  window.tree = tree;
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

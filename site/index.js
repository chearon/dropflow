// @ts-nocheck
import './config.js';
import * as flow from 'dropflow';
import parse from 'dropflow/parse.js';
import registerNotoFonts from 'dropflow/register-noto-fonts.js';
import {EditorView, basicSetup} from 'codemirror';
import {EditorState} from '@codemirror/state';
import {html} from '@codemirror/lang-html';
import {solarizedDark} from '@ddietr/codemirror-themes/solarized-dark.js'
import {examples} from './examples.js';

// --- Global State & DOM Elements ---
let currentExampleIndex = 0;
let flowTree; // Renamed from documentElement to avoid DOM conflict
let blockContainer = {}; 
let isDragging = false;
let divider = +localStorage['divider'] || 50;

const [canvas] = document.getElementsByTagName('canvas');
const twinview = document.getElementById('twinview');
const wrap = document.getElementById('wrap');
const editor = document.querySelector('#editor');
const exampleBar = document.getElementById('example-bar');
const canvasLabel = document.getElementById('canvas-label');

if (!canvas || !twinview || !wrap || !editor || !exampleBar || !canvasLabel) {
  throw new Error('Required DOM elements not found');
}

// --- Utilities ---

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// --- Editor Setup ---

const triggerRender = debounce(() => {
  parseGenerate();
  loadLayoutPaint();
}, 200);

const watch = EditorView.updateListener.of(update => {
  if (update.docChanged) {
    triggerRender();
  }
});

let state = EditorState.create({
  doc: examples[currentExampleIndex].html,
  extensions: [basicSetup, html(), watch, solarizedDark]
});

let view = new EditorView({
  state,
  parent: editor
});

// --- Logic & Rendering ---

flow.setOriginStyle({zoom: window.devicePixelRatio});
registerNotoFonts();

async function loadLayoutPaint() {
  if (!wrap || !canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cssWidth = wrap.getBoundingClientRect().width;
  const cssHeight = wrap.getBoundingClientRect().height;
  const dpxWidth = Math.ceil(cssWidth * window.devicePixelRatio);
  const dpxHeight = Math.ceil(cssHeight * window.devicePixelRatio);

  if (canvas.width !== dpxWidth || canvas.height !== dpxHeight) {
      canvas.style.width = `${dpxWidth / window.devicePixelRatio}px`;
      canvas.style.height = `${dpxHeight / window.devicePixelRatio}px`;
      canvas.width = dpxWidth;
      canvas.height = dpxHeight;
  }

  // Use the parsed flowTree, not the browser DOM
  if (flowTree) {
      await flow.load(flowTree);
      
      // RESTORED: Sync label color
      if (flowTree.style && flowTree.style.backgroundColor) {
        const {r, g, b, a} = flowTree.style.backgroundColor;
        canvasLabel.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;
      }
  }

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (blockContainer && Object.keys(blockContainer).length > 0) {
      flow.layout(blockContainer, canvas.width, canvas.height);
      flow.paintToCanvas(blockContainer, ctx);
  }
  ctx.restore();
}

function parseGenerate() {
  flowTree = parse(view.state.doc.toString());
  blockContainer = flow.generate(flowTree);
  window['blockContainer'] = blockContainer;
  window['documentElement'] = flowTree;
}

function setExample(index) {
  currentExampleIndex = index;
  state = EditorState.create({
    doc: examples[index].html,
    extensions: [basicSetup, html(), watch, solarizedDark]
  });
  view.setState(state);
  
  renderWidth(); 
  updateExampleButtons(index);
  
  parseGenerate();
  loadLayoutPaint();
}

function updateExampleButtons(activeIndex) {
  Array.from(exampleBar.children).forEach((btn, idx) => {
    if (btn instanceof HTMLButtonElement) {
      btn.style.background = idx === activeIndex ? '#444' : '#222';
    }
  });
}

// --- Initialization ---

exampleBar.innerHTML = '';
examples.forEach((ex, i) => {
  const btn = document.createElement('button');
  btn.textContent = ex.name;
  Object.assign(btn.style, {
    marginRight: '8px',
    padding: '6px 16px',
    background: i === currentExampleIndex ? '#444' : '#222',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  });
  
  btn.onclick = () => setExample(i);
  exampleBar.appendChild(btn);
});

parseGenerate();
loadLayoutPaint();
renderWidth();

// RESTORED: CodeMirror sizing
view.dom.style.height = '100%';
view.scrollDOM.style.overflow = 'auto';

// RESTORED: Debug export
window.flow = flow;

// RESTORED: Animate only if no preference saved
if (localStorage['divider'] == null && editor instanceof HTMLElement) {
    setTimeout(() => {
        editor.animate([
            {width: '50%', easing: 'cubic-bezier(0.82,-0.67,0.07,0.92)'},
            {width: '55%', easing: 'cubic-bezier(0.61,0.17,0.07,0.86)'},
            {width: '50%'}
        ], {duration: 2000});
    }, 2000);
}

// --- Resize Handling ---

const observer = new ResizeObserver(function () {
  triggerRender();
});
observer.observe(wrap);

let lastDevicePixelRatio = window.devicePixelRatio;
window.addEventListener('resize', function () {
  if (window.devicePixelRatio !== lastDevicePixelRatio) {
    lastDevicePixelRatio = window.devicePixelRatio;
    flow.setOriginStyle({zoom: window.devicePixelRatio});
    parseGenerate();
    loadLayoutPaint();
  }
});

// --- Drag Handle Logic ---

function getEffectiveDivider() {
  return Math.min(90, Math.max(10, divider));
}

function renderWidth() {
  if (editor instanceof HTMLElement) {
    editor.style.width = getEffectiveDivider() + '%';
  }
}

function getState(e) {
  if (!twinview) return { mouse: 0, divider: 0, total: 0 };
  const rect = twinview.getBoundingClientRect();
  const total = rect.width;
  const currentDivider = total * getEffectiveDivider() / 100;
  const mouse = e.clientX - rect.x;
  return {mouse, divider: currentDivider, total};
}

function isInHandle(state) {
  return Math.abs(state.divider - state.mouse) < 10;
}

if (twinview) {
  twinview.addEventListener('pointerdown', function(e) {
      const state = getState(e);
      if (isInHandle(state)) {
          isDragging = true;
          twinview.setPointerCapture(e.pointerId);
          e.preventDefault(); 
      }
  });

  twinview.addEventListener('pointermove', function(e) {
      const state = getState(e);
      // RESTORED: Use 'ew-resize' which is more standard
      if (isInHandle(state)) {
          twinview.style.cursor = 'ew-resize'; 
      } else {
          twinview.style.cursor = 'default';
      }

      if (isDragging) {
          divider = Math.round(state.mouse * 100 / state.total);
          renderWidth();
          localStorage['divider'] = divider;
      }
  });

  twinview.addEventListener('pointerup', function(e) {
      isDragging = false;
      twinview.releasePointerCapture(e.pointerId);
  });

  // RESTORED: Double-click to reset
  twinview.addEventListener('dblclick', function(e) {
      const state = getState(e);
      if (isInHandle(state)) {
          divider = 50;
          delete localStorage['divider'];
          renderWidth();
          isDragging = false;
      }
  });
}
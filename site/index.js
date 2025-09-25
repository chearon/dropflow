// @ts-check
import "./config.js";
import * as flow from "dropflow";
import parse from "dropflow/parse.js";
import registerNotoFonts from "dropflow/register-noto-fonts.js";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { html } from "@codemirror/lang-html";
import { solarizedDark } from "@ddietr/codemirror-themes/theme/solarized-dark";
import { examples } from "./examples.js";

const [canvas] = document.getElementsByTagName("canvas");
const wrap = document.getElementById("wrap");
const canvasLabel = document.getElementById("canvas-label");

flow.setOriginStyle({ zoom: window.devicePixelRatio });
registerNotoFonts();

async function loadLayoutPaint() {
  const ctx = canvas.getContext("2d");
  const cssWidth = wrap?.getBoundingClientRect().width || 0;
  const cssHeight = wrap?.getBoundingClientRect().height || 0;
  const dpxWidth = Math.ceil(cssWidth * window.devicePixelRatio);
  const dpxHeight = Math.ceil(cssHeight * window.devicePixelRatio);

  await flow.load(documentElement);
  canvas.style.width = `${dpxWidth / window.devicePixelRatio}px`;
  canvas.style.height = `${dpxHeight / window.devicePixelRatio}px`;
  canvas.width = dpxWidth;
  canvas.height = dpxHeight;

  const { r, g, b, a } = documentElement.style.backgroundColor;
  if (canvasLabel) {
    canvasLabel.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  if (ctx) {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    flow.layout(blockContainer, canvas.width, canvas.height);
    const paintCtx = canvas.getContext("2d");
    if (paintCtx) {
      flow.paintToCanvas(blockContainer, paintCtx);
    }
    ctx.restore();
  }
}

const watch = EditorView.updateListener.of((update) => {
  if (update.docChanged) {
    parseGenerate();
    loadLayoutPaint();
  }
});

const state = EditorState.create({
  doc: examples[0].html,
  extensions: [basicSetup, html(), watch, solarizedDark],
});

const view = new EditorView({
  state,
  parent: document.querySelector("#editor") || document.body,
});

let documentElement;
let blockContainer;

function parseGenerate() {
  documentElement = parse(view.state.doc.toString());
  blockContainer = flow.generate(documentElement);
  // @ts-ignore
  window.blockContainer = blockContainer;
  // @ts-ignore
  window.documentElement = documentElement;
}

function updateButtonStyles(activeId) {
  examples.forEach((example) => {
    const button = document.getElementById(`sample-${example.id}`);
    if (button) {
      if (example.id === activeId) {
        button.style.backgroundColor = "#3498db";
        button.style.color = "white";
      } else {
        button.style.backgroundColor = "#34495e";
        button.style.color = "#bdc3c7";
      }
    }
  });
}

function loadExample(exampleId) {
  const example = examples.find(ex => ex.id === exampleId);
  if (example) {
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: example.html
      }
    });
    updateButtonStyles(exampleId);
  }
}

function createToolbarButtons() {
  const toolbarContainer = document.getElementById("toolbar-buttons");
  if (!toolbarContainer) return;

  examples.forEach((example, index) => {
    const button = document.createElement("button");
    button.id = `sample-${example.id}`;
    button.textContent = example.name;
    button.style.cssText = `
      padding: 0.5em 1em;
      background-color: ${index === 0 ? "#3498db" : "#34495e"};
      color: ${index === 0 ? "white" : "#bdc3c7"};
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      white-space: nowrap;
    `;
    
    button.addEventListener("click", () => loadExample(example.id));
    toolbarContainer.appendChild(button);
  });
}

// Initialize toolbar buttons
createToolbarButtons();

parseGenerate();
loadLayoutPaint();

const observer = new ResizeObserver(function () {
  loadLayoutPaint();
});

let lastDevicePixelRatio = window.devicePixelRatio;

window.addEventListener("resize", function () {
  if (window.devicePixelRatio !== lastDevicePixelRatio) {
    lastDevicePixelRatio = window.devicePixelRatio;
    flow.setOriginStyle({ zoom: window.devicePixelRatio });
    parseGenerate();
    loadLayoutPaint();
  }
});

observer.observe(document.body);

// @ts-ignore
window.flow = flow;

view.dom.style.height = "100%";
view.scrollDOM.style.overflow = "auto";

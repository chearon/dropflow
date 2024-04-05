// @ts-check
import './config.js';
import * as flow from 'dropflow/with-parse.js';
import {EditorView, basicSetup} from 'codemirror';
import {EditorState} from '@codemirror/state';
import {html} from '@codemirror/lang-html';
import {solarizedDark} from '@ddietr/codemirror-themes/solarized-dark.js'

const [canvas] = document.getElementsByTagName('canvas');
const wrap = document.getElementById('wrap');
const canvasLabel = document.getElementById('canvas-label');

async function render(html) {
  const documentElement = flow.parse(html);
  const ctx = canvas.getContext('2d');
  const cssWidth = wrap.clientWidth;
  const cssHeight = wrap.clientHeight;

  await flow.loadNotoFonts(documentElement);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = cssWidth * window.devicePixelRatio;
  canvas.height = cssHeight * window.devicePixelRatio;

  const {r, g, b, a} = documentElement.style.backgroundColor;
  canvasLabel.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  flow.renderToCanvas(documentElement, canvas, window.devicePixelRatio);
  ctx.restore();

  window.documentElement = documentElement;
}

const watch = EditorView.updateListener.of(update => {
  if (update.docChanged) {
    render(view.state.doc.toString())
  }
});

const state = EditorState.create({
  doc: `<html style="background-color: #067; margin: 1em; color: #afe">

  <h1>dropflow playground</h1>
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

  <div style="margin: 1em 0;">
    Finally, <span style="background-color: #133; color: #aef">when
    painting inline backgrounds, the inline element must not interrupt
    font shaping features like ligatures, or kerning, such as the text
    "A</span>V". When an inline is

    <span style="
      position: relative;
      top: 5px;
      border-bottom: 3px solid #345;
    ">relatively positioned</span>,

    this does interrupt shaping boundaries.
  </div>
</html>`,
  extensions: [basicSetup, html(), watch, solarizedDark]
});

const view = new EditorView({
  state,
  parent: document.querySelector('#editor')
});

render(view.state.doc.toString())

const observer = new ResizeObserver(function () {
  render(view.state.doc.toString())
});

observer.observe(document.body);

window.flow = flow;

view.dom.style.height = '100%';
view.scrollDOM.style.overflow = 'auto';

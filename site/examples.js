export const examples = [
  {
    name: 'Default',
    html: `<html style="background-color: #067; margin: 1em; color: #afe">
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
    property makes everything bigger! <span style="zoom: 33%;">(or smaller)</span>
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
</html>`
  },
  {
    name: 'Units',
    html: `<html style="background-color: #ffffff; margin: 1em; color: black">
  <h2>Absolute CSS Units Demo</h2>
  <div style="height: 96px; width: 1in; background-color: black; color: #fff; margin: 8px;">1 in (inches)</div>
  <div style="height: 96px; width: 2in; background-color: red; color: #fff; margin: 8px;">2 in (inches)</div>
  <div style="height: 96px; width: 192px; background-color: red; color: #fff; margin: 8px;">192 px (pixels)</div>
  <div style="height: 96px; width: 5.08cm; background-color: red; color: #fff; margin: 8px;">5.08 cm (centimeters)</div>
  <div style="height: 96px; width: 50.8mm; background-color: red; color: #fff; margin: 8px;">50.8 mm (millimeters)</div>
  <div style="height: 96px; width: 2032q; background-color: red; color: #fff; margin: 8px;">2032 Q (quarter millimeters)</div>
  <div style="height: 96px; width: 12pc; background-color: red; color: #fff; margin: 8px;">12 pc (picas)</div>
  <div style="height: 96px; width: 144pt; background-color: red; color: #fff; margin: 8px;">144 pt (points)</div>
</html>`
  },
{
    name: 'Text Formatting',
    html: `<html style="background-color: #ffffff; margin: 1em; color: black; font-family: sans-serif;">
  <h2>Text Formatting & Scripts Demo</h2>
  
  <div style="font-weight: bold; padding: 12px; background-color: #eee; margin: 8px; border-left: 4px solid black;">
    Hello, world. (Bold / Latin)
  </div>

  <!-- Condensed Not Working or Font Not Loaded
  <div style="font-weight: bold; font-stretch: condensed; padding: 12px; background-color: #eee; margin: 8px; border-left: 4px solid black;">
    Hello, world. (Bold / Latin / Condensed)
  </div>
  -->
 
  <div style="font-style: italic; padding: 12px; background-color: #eee; margin: 8px; border-left: 4px solid red;">
    Привет, мир. (Italic / Cyrillic)
  </div>

  <div style="padding: 12px; background-color: #eee; margin: 8px; border-left: 4px solid red;">
    Γεια σου κόσμε. (Greek)
  </div>

  <div style="padding: 12px; background-color: #eee; margin: 8px; border-left: 4px solid red;">
    Hello, world. (Latin)
  </div>

  <div style="padding: 12px; background-color: #eee; margin: 8px; border-left: 4px solid red;">
    こんにちは、世界。 (Japanese)
  </div>

  <div style="direction: rtl; padding: 12px; background-color: #eee; margin: 8px; border-right: 4px solid red;">
    مرحبا بالعالم. (Right-to-Left / Arabic)
  </div>
</html>`
  }
];

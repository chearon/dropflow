export const examples = [
  {
    id: 1,
    name: "Intro",
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
</html>`
  },
  {
    id: 2,
    name: "Typography",
    html: `<html style="margin: 2em; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <h1 style="color: #4CAF50; text-align: center; font-size: 2.5em; margin-bottom: 0.5em;">
    Typography Showcase
  </h1>
  
  <div style="margin: 1em 0;">
    <h2 style="color: #2196F3; margin-top: 0;">Font Weights & Styles</h2>
    <p style="font-weight: 300;">Light weight text (300)</p>
    <p style="font-weight: 400;">Regular weight text (400)</p>
    <p style="font-weight: 600;">Semi-bold weight text (600)</p>
    <p style="font-weight: 700;">Bold weight text (700)</p>
    <p style="font-style: italic;">Italic text style</p>
    <p style="text-decoration: underline;">❌ Underlined text</p>
    <p style="text-decoration: line-through;">❌ Strikethrough text</p>
  </div>

  <div style="margin: 1em 0;">
    <h2 style="color: #FF9800;">Text Alignment</h2>
    <div style="border-left: 1px solid #555; border-right: 1px solid #555; padding: 0em; border-radius: 8px; margin: 0 4em;">
      <p style="text-align: left;">Left aligned text</p>
      <p style="text-align: center;">Center aligned text</p>
      <p style="text-align: right;">Right aligned text</p>
      <p style="text-align: justify;">Justified text that spreads across the full width of the container, creating even margins on both sides.</p>
    </div>
  </div>

  <h2 style="text-align: center; color: #333;">Bidirectional Text Example</h2>

  <div style="padding: 20px;
    border: 1px solid #ddd; 
    border-radius: 8px; 
    max-width: 700px; 
    /* line-height: 1.7; */
    background-color: #fafafa;">
    
    <div style="float: right; border: 2px solid #007bff; padding: 8px; margin-left: 8px; border-radius: 12px; background-color: #f0f7ff; width: 150px; text-align: center;">
      <strong>Info Box</strong><br>
      <hr style="border: 0; border-top: 1px solid #ccc;">
      <!-- Right-to-left text inside the floated box -->
      <span dir="rtl">معلومات بالعربية</span>
    </div>
    
    <p style="margin: 0;">
      Here is some standard English (Left-to-Right) text to start. We can seamlessly embed Arabic, which is a Right-to-Left language: <strong dir="rtl" style="color: #d9534f;">مرحبا بالعالم، كيف حالك اليوم؟</strong>. Notice how the text flows correctly. The sentence continues in English, and now we will add some Hebrew (also RTL): <strong dir="rtl" style="color: #5cb85c;">שלום עולם!</strong>. The layout respects the directionality of each script, even when they are mixed together. We can finish the paragraph with some Spanish (LTR): ¡Hola, Mundo!
    </p>

  </div>

  <div style="background-color: #2d2d2d; padding: 1.5em; border-radius: 8px; margin: 1em 0;">
    <h2 style="color: #9C27B0;">Text Sizes & Spacing</h2>
    <p style="font-size: 0.8em;">Small text (0.8em)</p>
    <p style="font-size: 1em;">Normal text (1em)</p>
    <p style="font-size: 1.2em;">Large text (1.2em)</p>
    <p style="font-size: 1.5em;">Extra large text (1.5em)</p>
    <p style="line-height: 2;">Text with increased line height for better readability</p>
    <p style="letter-spacing: 0.1em;">Text with letter spacing</p>
    <p style="word-spacing: 0.3em;">Text with word spacing</p>
  </div>

  <div style="background-color: #2d2d2d; padding: 1.5em; border-radius: 8px; margin: 1em 0;">
    <h2 style="color: #F44336;">Special Characters & Symbols</h2>
    <p>Mathematical symbols: α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω</p>
    <p>Currency symbols: $ € £ ¥ ₹ ₿</p>
    <p>Arrows: ← → ↑ ↓ ↔ ↕ ⇐ ⇒ ⇑ ⇓ ⇔ ⇕</p>
    <p>Emojis: 🚀 💻 🎨 📱 🌟 ✨</p>
  </div>
</html>`
  },
  {
    id: 3,
    name: "Layout Grid",
    html: `<html style="background-color: #f5f5f5; margin: 1em; font-family: Arial, sans-serif;">
  <h1 style="color: #333; text-align: center; margin-bottom: 1em;">CSS Grid Layout Demo</h1>
  
  <div style="
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1em;
    margin: 1em 0;
  ">
    <div style="background-color: #e3f2fd; padding: 1em; border-radius: 8px; border: 2px solid #2196F3;">
      <h3 style="color: #1976D2; margin-top: 0;">Grid Item 1</h3>
      <p style="color: #424242;">This is the first grid item with some sample content.</p>
    </div>
    
    <div style="background-color: #f3e5f5; padding: 1em; border-radius: 8px; border: 2px solid #9C27B0;">
      <h3 style="color: #7B1FA2; margin-top: 0;">Grid Item 2</h3>
      <p style="color: #424242;">Second grid item with different styling.</p>
    </div>
    
    <div style="background-color: #e8f5e8; padding: 1em; border-radius: 8px; border: 2px solid #4CAF50;">
      <h3 style="color: #388E3C; margin-top: 0;">Grid Item 3</h3>
      <p style="color: #424242;">Third grid item with green theme.</p>
    </div>
    
    <div style="background-color: #fff3e0; padding: 1em; border-radius: 8px; border: 2px solid #FF9800;">
      <h3 style="color: #F57C00; margin-top: 0;">Grid Item 4</h3>
      <p style="color: #424242;">Fourth item with orange accent.</p>
    </div>
    
    <div style="background-color: #fce4ec; padding: 1em; border-radius: 8px; border: 2px solid #E91E63;">
      <h3 style="color: #C2185B; margin-top: 0;">Grid Item 5</h3>
      <p style="color: #424242;">Fifth item with pink styling.</p>
    </div>
    
    <div style="background-color: #f1f8e9; padding: 1em; border-radius: 8px; border: 2px solid #8BC34A;">
      <h3 style="color: #689F38; margin-top: 0;">Grid Item 6</h3>
      <p style="color: #424242;">Sixth and final grid item.</p>
    </div>
  </div>

  <div style="
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1em;
    margin: 2em 0;
  ">
    <div style="background-color: #fff; padding: 1.5em; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h2 style="color: #333; margin-top: 0;">Main Content Area</h2>
      <p style="color: #666; line-height: 1.6;">This is the main content area that takes up more space in the grid. It demonstrates how CSS Grid can create flexible layouts with different column widths.</p>
      <p style="color: #666; line-height: 1.6;">The grid system allows for responsive design and easy maintenance of layout structure.</p>
    </div>
    
    <div style="background-color: #fff; padding: 1.5em; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <h3 style="color: #333; margin-top: 0;">Sidebar</h3>
      <ul style="color: #666;">
        <li>Navigation item 1</li>
        <li>Navigation item 2</li>
        <li>Navigation item 3</li>
        <li>Navigation item 4</li>
      </ul>
    </div>
  </div>

  <div style="
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1em;
    margin: 1em 0;
  ">
    <div style="background-color: #ffebee; padding: 1em; border-radius: 8px; border-left: 4px solid #f44336;">
      <h4 style="color: #c62828; margin: 0 0 0.5em 0;">Auto-fit Grid</h4>
      <p style="color: #424242; margin: 0; font-size: 0.9em;">This demonstrates auto-fit with minmax for responsive behavior.</p>
    </div>
    
    <div style="background-color: #e8f5e8; padding: 1em; border-radius: 8px; border-left: 4px solid #4caf50;">
      <h4 style="color: #2e7d32; margin: 0 0 0.5em 0;">Responsive Layout</h4>
      <p style="color: #424242; margin: 0; font-size: 0.9em;">Items automatically adjust based on available space.</p>
    </div>
    
    <div style="background-color: #e3f2fd; padding: 1em; border-radius: 8px; border-left: 4px solid #2196f3;">
      <h4 style="color: #1565c0; margin: 0 0 0.5em 0;">Flexible Sizing</h4>
      <p style="color: #424242; margin: 0; font-size: 0.9em;">Minimum 200px width, but can grow to fill space.</p>
    </div>
  </div>
</html>`
  },
  {
    id: 4,
    name: "Box Layout",
    html: `<html style="background-color: white; margin: 1em; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <h1 style="color: #495057; text-align: center; margin-bottom: 1em;">Box Layout & Border Styles</h1>
  
  <!-- Basic border styles -->
  <div style="margin: 2em 0;">

  <div style="
      border: 12px solid #007bff;
      padding: 0.5em;
      margin: 1em 0;
      background-color: #fff;
      border-radius: 24px;
    ">
      <h3 style="color: #007bff; margin-top: 0;">Solid Border</h3>
    </div>
    
    <div style="
      border: 2px dashed #28a745;
      padding: 0.5em;
      margin: 1em 0;
      background-color: #28a74510;
      border-radius: 24px;
    ">
      <h3 style="color: #28a745; margin-top: 0;">Dashed Border</h3>
    </div>
    
    <div style="
      border: 6px dotted #ffc107;
      padding: 0.5em;
      margin: 1em 0;
      background-color: #ffc10710;
      border-radius: 24px;
    ">
      <h3 style="color: #ffc107; margin-top: 0;">Dotted Border</h3>
    </div>
    
    <div style="
      border: 12px double #dc3545;
      padding: 0.5em;
      margin: 1em 0;
      background-color: #dc354510;
      border-radius: 24px;
    ">
      <h3 style="color: #dc3545; margin-top: 0;">Double Border</h3>
    </div>
  </div>

  <!-- Complex border radius examples -->
  <div style="margin: 2em 0;">

    <div style="
      border: 24px double #6f42c1;
      padding: 1.5em;
      margin: 1em 0;
      background-color: #6f42c110;
      border-radius: 96px 0px;
    ">
      <h3 style="color: #6f42c1; margin-top: 0;">Alternating Radius</h3>
    </div>
    
    <div style="
      border: 3px solid #fd7e14;
      padding: 1.5em;
      margin: 1em 0;
      background-color: #fd7e1410;
      border-radius: 50%;
    ">
      <h3 style="color: #fd7e14; margin-top: 0;">Ellipse</h3>
    </div>
    
    <!-- Rounded Pill - Note the intentionally huge radius which tests the border radius algorithm -->
    <div style="
      border: 3px solid #20c997;
      padding: 1.5em;
      margin: 1em 0;
      background-color: #20c99710;
      border-radius: 5in;
    ">
      <h3 style="color: #20c997; margin-top: 0;">Rounded Pill</h3>
    </div>
  </div>

  <!-- Nested box examples -->
  <div style="margin: 2em 0;">
    <h2 style="color: #6c757d; margin-bottom: 1em;">Nested Box Layout</h2>
    
    <div style="
      border: 2px solid #343a40;
      padding: 2em;
      margin: 1em 0;
      background-color: #fff;
      border-radius: 12px;
    ">
      <h3 style="color: #343a40; margin-top: 0;">Outer Container</h3>
      <p style="color: #495057;">This is the outer container with a dark border.</p>
      
      <div style="
        border: 2px dashed #6c757d;
        padding: 1.5em;
        margin: 1em 0;
        background-color: #f8f9fa;
        border-radius: 8px;
      ">
        <h4 style="color: #6c757d; margin-top: 0;">Middle Layer</h4>
        <p style="color: #495057;">This is a nested container with a dashed border.</p>
        
        <div style="
          border: 1px solid #adb5bd;
          padding: 1em;
          margin: 1em 0;
          background-color: #fff;
          border-radius: 4px;
        ">
          <h5 style="color: #adb5bd; margin-top: 0;">Inner Container</h5>
          <p style="color: #495057;">This is the innermost container with a thin border.</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Mixed border styles -->
  <div style="margin: 2em 0;">
    <h2 style="color: #6c757d; margin-bottom: 1em;">Mixed Border Styles</h2>
    
    <div style="
      border-top: 3px solid #007bff;
      border-right: 2px dashed #28a745;
      border-bottom: 4px double #ffc107;
      border-left: 1px dotted #dc3545;
      padding: 1.5em;
      margin: 1em 0;
      background-color: #fff;
      border-radius: 15px;
    ">
      <h3 style="color: #495057; margin-top: 0;">Mixed Border Types</h3>
      <p style="color: #495057;">Each side has a different border style: solid top, dashed right, double bottom, dotted left.</p>
    </div>
    
    <div style="
      border: 2px solid #6f42c1;
      padding: 1.5em;
      margin: 1em 0;
      background-color: #fff;
      border-radius: 20px 5px 15px 10px;
    ">
      <h3 style="color: #6f42c1; margin-top: 0;">Varied Border Radius</h3>
      <p style="color: #495057;">Each corner has a different radius: 20px, 5px, 15px, 10px (clockwise from top-left).</p>
    </div>
  </div>

  <!-- Box shadow examples -->
  <div style="margin: 2em 0;">
    <h2 style="color: #6c757d; margin-bottom: 1em;">Box Shadows</h2>
    
    <div style="
      border: 1px solid #dee2e6;
      padding: 1.5em;
      margin: 1em 0;
      background-color: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    ">
      <h3 style="color: #495057; margin-top: 0;">Subtle Shadow</h3>
      <p style="color: #495057;">Light shadow for depth without being too prominent.</p>
    </div>
    
    <div style="
      border: 1px solid #dee2e6;
      padding: 1.5em;
      margin: 1em 0;
      background-color: #fff;
      border-radius: 8px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.15);
    ">
      <h3 style="color: #495057; margin-top: 0;">Medium Shadow</h3>
      <p style="color: #495057;">More pronounced shadow for greater depth perception.</p>
    </div>
  </div>
</html>`
  }
]; 
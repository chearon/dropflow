import {HTMLElement, TextNode} from './node';
import {createComputedStyle} from './cascade';
import {Run, Collapser} from './text';
import {Box, Area} from './box';

let id = 0;

const reset = '\x1b[0m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';
const underline = '\x1b[4m';

// CSS 2 § 8.3.1
class MarginCollapseContext {
  constructor() {
    this.current = null; // {root, position, margins}
    this.last = null; // 'start' | 'end'
    this.margins = [];
  }

  boxStart(box) {
    const couldAdjoin = box.style.paddingTop === 0 && box.style.borderTopWidth === 0;

    if (this.current) {
      this.current.margins.push(box.style.marginTop);
    } else {
      this.current = {root: box, margins: [box.style.marginTop], position: 'start'};
      this.margins.push(this.current);
    }

    if (!couldAdjoin) this.current = null;

    this.last = 'start';
  }

  boxEnd(box) {
    let adjoins = this.current && box.style.paddingBottom === 0 && box.style.borderBottomWidth === 0;

    if (adjoins) {
      if (this.last === 'start') {
        // Handle the end of a block box that had no block children
        // TODO 1 min-height (minHeightOk)
        // TODO 2 clearance
        const heightOk = box.style.height === 'auto' || box.style.height === 0;
        adjoins = box.children.length === 0 && !box.isBfcRoot && heightOk;
      } else {
        // Handle the end of a block box that was at the end of its parent
        adjoins = adjoins && box.style.height === 'auto';
      }
    }

    if (this.last === 'start' && adjoins) this.current.through = true;

    if (adjoins) {
      this.current.margins.push(box.style.marginBottom);
      // When a box's end adjoins to the previous margin, move the "root" (the
      // box which the margin will be placed adjacent to) to the highest-up box
      // in the tree, since its siblings need to be shifted. If the margin is
      // collapsing through, don't do that because CSS 2 §8.3.1 last 2 bullets
      if (this.last === 'end' && !this.current.through) this.current.root = box;
    } else {
      this.current = {root: box, margins: [box.style.marginBottom], position: 'end'};
      this.margins.push(this.current);
    }

    this.last = 'end';
  }

  toBoxMaps() {
    const start = new Map();
    const end = new Map();

    for (const {root, position, margins} of this.margins) {
      let positive = 0;
      let negative = 0;

      for (const n of margins) {
        if (n < 0) {
          negative = Math.max(negative, -n);
        } else {
          positive = Math.max(positive, n);
        }
      }

      const collapsedMargin = positive - negative;

      if (position === 'start') {
        start.set(root.id, collapsedMargin);
      } else {
        end.set(root.id, collapsedMargin);
      }
    }

    return {start, end};
  }
}

class BlockContainer extends Box {
  constructor(style, level, children, isBfcRoot, isAnonymous) {
    super();
    this.style = style;
    this.level = level;
    this.children = children;
    this.isBfcRoot = isBfcRoot;
    this.isAnonymous = isAnonymous === true;

    this.sym = '▣';
  }

  get containsBlocks() {
    return !this.children.length || !this.children[0].isInlineLevel;
  }

  get isInlineLevel() {
    return this.level === 'inline';
  }

  get isBlockContainer() {
    return true;
  }

  get desc() {
    return (this.isAnonymous ? dim : '')
      + (this.isBfcRoot ? underline : '')
      + (this.isInlineLevel ? 'Inline' : 'Block')
      + ' ' + this.id
      + reset;
  }


  setBlockPosition(top) {
    this.borderArea.top = top;
    this.paddingArea.top = this.style.borderTopWidth;
    this.contentArea.top = this.style.paddingTop;
  }

  setBlockSize(height) {
    this.contentArea.height = height;

    this.paddingArea.height = this.contentArea.height
      + this.style.paddingTop
      + this.style.paddingBottom;

    this.borderArea.height = this.paddingArea.height
      + this.style.borderTopWidth
      + this.style.borderBottomWidth;
  }

  doBoxPositioning() {
    const mctx = new MarginCollapseContext();

    // TODO 1 is there a BFC root that contains inlines? don't think so
    // TODO 2 level shouldn't matter, like a grid item or a float
    if (!this.isBfcRoot || this.level !== 'block' || !this.containsBlocks) {
      throw new Error('Cannot do BFC-context block positioning');
    }

    // Collapse margins first
    for (const [order, box] of this.descendents({level: 'block'}, {isBfcRoot: false})) {
      if (order === 'pre') {
        mctx.boxStart(box);
      } else { // post
        mctx.boxEnd(box);
      }
    }

    const {start, end} = mctx.toBoxMaps();
    const stack = [];
    let blockOffset = 0;

    for (const [order, box] of this.descendents({level: 'block'}, {isBfcRoot: false})) {
      if (order === 'pre') {
        blockOffset += start.has(box.id) ? start.get(box.id) : 0;
        stack.push(blockOffset);
        box.setBlockPosition(blockOffset);
        blockOffset = 0;
        if (box.isBfcRoot) box.doBoxPositioning();
      } else { // post
        if (box.containsBlocks && box.style.height === 'auto' && !box.isBfcRoot) {
          box.setBlockSize(blockOffset);
        }

        blockOffset = stack.pop() + box.borderArea.height;
        blockOffset += end.has(box.id) ? end.get(box.id) : 0;
      }
    }

    if (this.containsBlocks && this.style.height === 'auto') {
      this.setBlockSize(blockOffset);
    }
  }

  doInlineBoxModel() {
    // CSS 2.2 §10.3.3
    // ---------------

    // Paragraphs 2 and 3
    if (this.style.width !== 'auto') {
      const specifiedWidth = this.style.width
        + this.style.borderLeftWidth
        + this.style.paddingLeft
        + this.style.paddingRight
        + this.style.borderRightWidth
        + (this.style.marginLeft === 'auto' ? 0 : this.style.marginLeft)
        + (this.style.marginRight === 'auto' ? 0 : this.style.marginRight);

      // Paragraph 2: zero out auto margins if specified values sum to a length
      // greater than the containing block's width.
      if (specifiedWidth > this.containingBlock.width) {
        if (this.style.marginLeft === 'auto') this.style.marginLeft = 0;
        if (this.style.marginRight === 'auto') this.style.marginRight = 0;
      }

      if (this.style.marginLeft !== 'auto' && this.style.marginRight !== 'auto') {
        // Paragraph 3: check over-constrained values. This expands the right
        // margin in LTR documents to fill space, or, if the above scenario was
        // hit, it makes the right margin negative.
        // TODO support the `direction` CSS property
        this.style.marginRight = this.containingBlock.width - specifiedWidth;
      } else { // one or both of the margins is auto, specifiedWidth < cb width
        if (this.style.marginLeft === 'auto' && this.style.marginRight !== 'auto') {
          // Paragraph 4: only auto value is margin-left
          this.style.marginLeft = this.containingBlock.width - specifiedWidth;
        } else if (this.style.marginRight === 'auto' && this.style.marginLeft !== 'auto') {
          // Paragraph 4: only auto value is margin-right
          this.style.marginRight = this.containingBlock.width - specifiedWidth;
        } else {
          // Paragraph 6: two auto values, center the content
          const freeSpace = this.containingBlock.width - specifiedWidth;
          this.style.marginLeft = this.style.marginRight = freeSpace / 2;
        }
      }
    }

    // Paragraph 5: auto width
    if (this.style.width === 'auto') {
      if (this.style.marginLeft === 'auto') this.style.marginLeft = 0;
      if (this.style.marginRight === 'auto') this.style.marginRight = 0;

      this.style.width = this.containingBlock.width
        - this.style.marginLeft
        - this.style.borderLeftWidth
        - this.style.paddingLeft
        - this.style.paddingRight
        - this.style.borderRightWidth
        - this.style.marginRight;
    }

    this.borderArea.left = this.style.marginLeft;
    this.borderArea.right = this.style.marginRight;

    this.paddingArea.left = this.style.borderLeftWidth;
    this.paddingArea.right = this.style.borderRightWidth;

    this.contentArea.left = this.style.paddingLeft;
    this.contentArea.right = this.style.paddingRight;
  }

  doBlockBoxModel() {
    // CSS 2.2 §10.6.3
    // ---------------

    if (this.style.height === 'auto') {
      if (this.children.length === 0) {
        this.setBlockSize(0); // Case 4
      } else if (this.containsBlocks) {
        // Cases 2-4 should be handled by doBoxPositioning, where margin
        // calculation happens. These bullet points seem to be re-phrasals of
        // margin collapsing in CSS 2.2 § 8.3.1 at the very end. If I'm wrong,
        // more might need to happen here.
      } else {
        // Case 1 TODO
        throw new Error(`IFC height for ${this.id} not yet implemented`);
      }
    } else {
      this.setBlockSize(this.style.height);
    }
  }

  doBoxSizing() {
    if (!this.containingBlock) {
      throw new Error(`BlockContainer ${this.id} has no containing block!`);
    }

    if (this.isInlineLevel) {
      throw new Error(`Layout on inline BlockContainer ${this.id} not supported`);
    }

    // First resolve percentages into actual values
    this.style.resolvePercentages(this.containingBlock);

    // And resolve box-sizing (which has a dependency on the above)
    this.style.resolveBoxModel();

    // TODO: this goes for any block-level box, not just block containers.
    // It should probably go on the box class, but the BFC methods could
    // still go on this class while the IFC methods would go on the inline
    // class

    this.doInlineBoxModel();

    if (this.style.height !== 'auto') this.doBlockBoxModel();

    // Child flow is now possible
    if (this.containsBlocks) {
      for (const child of this.children) {
        if (child.isBlockContainer) child.doBoxSizing();
      }
    }

    if (this.style.height === 'auto') this.doBlockBoxModel();
  }
}

class Inline extends Box {
  constructor(style, children, isIfcRoot, isAnonymous) {
    super();
    this.style = style;
    this.children = children;
    this.isIfcRoot = isIfcRoot;
    this.isAnonymous = isAnonymous === true;
    this.sym = '▭';

    // only for inline boxes which are the root of the IFC
    this.allText = '';
    this.runs = [];
  }

  get isInline() {
    return true;
  }

  get isInlineLevel() {
    return true;
  }

  get desc() {
    return (this.isAnonymous ? dim : '')
      + (this.isIfcRoot ? underline : '')
      + 'Inline'
      + ' ' + this.id
      + reset;
  }

  removeCollapsedRuns() {
    const stack = [this];

    if (!this.isIfcRoot) {
      throw new Error('removeCollapsedRuns() is for root inline context boxes');
    }

    while (stack.length) {
      const inline = stack.shift();
      for (let i = 0; i < inline.children.length; ++i) {
        const child = inline.children[i];
        if (child.isRun) {
          if (child.j < child.i) {
            inline.children.splice(i, 1);
            i -= 1;
            const j = this.runs.indexOf(inline);
            if (j < 0) throw new Error('Inline expected in this.runs');
            this.runs.splice(j, 1);
          }
        } else if (!child.isIfcRoot) {
          stack.unshift(child);
        }
      }
    }
  }

  // Collect text runs, collapse whitespace, create shaping boundaries, and
  // assign fonts
  prepareIfc() {
    const stack = this.children.slice();
    let i = 0;

    if (!this.isIfcRoot) {
      throw new Error('prepareIfc() called on a non-IFC inline');
    }

    // CSS Text Module Level 3, Appendix A, steps 1-4

    // Step 1
    while (stack.length) {
      const child = stack.shift();
      if (child.isIfcRoot) continue;
      // TODO I don't think just checking isIfcRoot is correct, but works for
      // now. Specs imply the inner display type is the thing to check to see
      // if it belongs to this IFC (for example grids, tables, etc).
      if (child.isRun) {
        child.setRange(i, i + child.text.length - 1);
        i += child.text.length;
        this.allText += child.text;
        this.runs.push(child);
      } else {
        stack.unshift(...child.children);
      }
    }

    const collapser = new Collapser(this.allText, this.runs);
    collapser.collapse();
    this.allText = collapser.buf;
    this.removeCollapsedRuns();

    // TODO step 2
    // TODO step 3
    // TODO step 4
  }

  containsAllCollapsibleWs() {
    const stack = this.children.slice();
    let good = true;

    while (stack.length && good) {
      const child = stack.shift();
      if (!child.isIfcRoot) {
        if (child.isRun) {
          if (!child.wsCollapsible) {
            good = false;
          } else {
            good = child.allCollapsible();
          }
        } else {
          stack.unshift(...child.children);
        }
      }
    }

    return good;
  }
}

// Helper for generateInlineBox
function mapTree(el, stack, level) {
  let children = [], bail = false;

  if (el.style.display.outer !== 'inline') throw Error('Inlines only');

  if (!stack[level]) stack[level] = 0;

  let box;

  if (el.style.display.inner === 'flow') {
    while (!bail && stack[level] < el.children.length) {
      let child, childEl = el.children[stack[level]];

      if (childEl instanceof HTMLElement) {
        if (childEl.style.display.outer === 'block') {
          bail = true;
        } else if (childEl.style.display.inner === 'flow-root') {
          child = generateBlockContainer(childEl);
        } else if (childEl.children) {
          [bail, child] = mapTree(childEl, stack, level + 1);
        }
      } else if (childEl instanceof TextNode) {
        child = new Run(childEl.text, childEl.style);
      }

      if (child != null) children.push(child);
      if (!bail) stack[level]++;
    }

    if (!bail) stack.pop();
    if (children.length) box = new Inline(el.style, children);
  } else if (el.style.display.inner == 'flow-root') {
    box = generateBlockContainer(el);
  }

  return [bail, box];
}

// Generates an inline box for the element. Also generates blocks if the element
// has any descendents which generate them. These are not included in the inline.
function generateInlineBox(el) {
  let inline, more = true, path = [], boxes = [];

  if (el.style.display.outer !== 'inline') throw Error('Inlines only');

  while (more) {
    let childEl;

    [more, inline] = mapTree(el, path, 0);
    if (inline) boxes.push(inline);

    while ((childEl = el.getEl(path)) instanceof HTMLElement && childEl.style.display.outer === 'block') {
      boxes.push(generateBlockContainer(childEl));
      ++path[path.length - 1];
    }
  }

  return boxes;
}

// Wraps consecutive inlines and runs in block-level block containers. The
// returned list is guaranteed to be a list of only blocks. This obeys CSS21
// section 9.2.1.1
function wrapInBlockContainers(boxes, style) {
  const blocks = [];
  let subId = 0;

  for (let i = 0; i < boxes.length; ++i) {
    const inlines = [];

    while (i < boxes.length && boxes[i].isInlineLevel) inlines.push(boxes[i++]);

    if (inlines.length > 0) {
      const anonStyleId = style.id + '.' + ++subId;
      const anonStyle = createComputedStyle(anonStyleId, {}, style);
      const rootInline = new Inline(anonStyle, inlines, true, true);
      if (!rootInline.containsAllCollapsibleWs()) {
        rootInline.prepareIfc();
        blocks.push(new BlockContainer(anonStyle, 'block', [rootInline], false, true));
      }
    }

    if (i < boxes.length) blocks.push(boxes[i]);
  }

  return blocks;
}

// Generates a block container for the element
export function generateBlockContainer(el) {
  let boxes = [], hasInline = false, hasBlock = false, isBfcRoot = false;

  if (!(el instanceof HTMLElement)) throw Error('Only elements generate boxes');
  
  if (el.style.display.inner === 'flow-root') {
    isBfcRoot = true;
  } else if (el.style.display.inner !== 'flow') {
    throw Error('Only flow layout supported');
  }

  for (const child of el.children) {
    if (child instanceof HTMLElement) {
      if (child.style.display.outer === 'block') {
        boxes.push(generateBlockContainer(child));
        hasBlock = true;
      } else if (child.style.display.outer === 'inline') {
        hasInline = true;
        const blocks = generateInlineBox(child);
        hasBlock = hasBlock || blocks.length > 1;
        boxes = boxes.concat(blocks);
      }
    } else if (child instanceof TextNode) {
      hasInline = true;
      boxes.push(new Run(child.text, child.style));
    }
  }

  if (hasInline && hasBlock) {
    boxes = wrapInBlockContainers(boxes, el.style);
  } else if (hasInline) {
    const anonStyleId = el.style.id + '.1';
    const anonStyle = createComputedStyle(anonStyleId, {}, el.style);
    const inline = new Inline(anonStyle, boxes, true, true);
    inline.prepareIfc();
    boxes = [inline];
  }

  const block = new BlockContainer(el.style, el.style.display.outer, boxes, isBfcRoot);

  return block;
}

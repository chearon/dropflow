import {Parser, isWhitespace} from './parse-html.js';
import {TextNode, HTMLElement} from './dom.js';
import {parse as StyleParser} from './parse-css.js';
import {EMPTY_STYLE, computeElementStyle} from './style.js';
import {id} from './util.js';

export function parse(str: string) {
  const parents: HTMLElement[] = [];
  let rootElement: HTMLElement | null = null;
  // afterHtml is like "after after body"; inHtml is like "in body"
  // https://html.spec.whatwg.org/multipage/parsing.html
  let insertionMode: 'beforeHtml' | 'afterHtml' | 'inHtml' = 'beforeHtml';

  function addText(text: string) {
    const parent = (parents.at(-1) || rootElement)!;
    let lastChild = parent.children.at(-1);

    if (lastChild && lastChild instanceof TextNode) {
      lastChild.text += text;
    } else {
      lastChild = new TextNode(id(), text, parent);
      parent.children.push(lastChild);
      lastChild.parent = parent;
      computeElementStyle(lastChild);
    }
  }

  function parentChild(child: HTMLElement | TextNode) {
    const parent = (parents.at(-1) || rootElement)!;
    parent.children.push(child);
    child.parent = parent;
    computeElementStyle(child);
  }

  function forceRoot(child?: TextNode | HTMLElement) {
    rootElement = new HTMLElement('root', 'html');
    parents.push(rootElement);
    computeElementStyle(rootElement);
    if (child) parentChild(child);
  }

  const parser = new Parser({
    onopentag(tagName, attrs) {
      let parent = parents.at(-1);
      let declaredStyle = EMPTY_STYLE;

      // Just ignore invalid styles so the parser can continue
      if (attrs.style) {
        try {
          declaredStyle = StyleParser(attrs.style);
        } catch {}
      }

      const element = new HTMLElement(id(), tagName, parent, attrs, declaredStyle);

      if (insertionMode === 'beforeHtml') {
        if (tagName === 'html') {
          rootElement = element;
        } else {
          forceRoot(element);
        }

        insertionMode = 'inHtml';
      } else {
        // insertionMode === 'inHtml' is ok. 'afterHtml' is a parse error.
        // Chrome appends to the body, and that's the easiest thing to do.
        parentChild(element);
      }

      computeElementStyle(element);
      parents.push(element);
    },
    onclosetag(tagName) {
      if (tagName === 'html') insertionMode = 'afterHtml';
      parents.pop();
    },
    ontext(text) {
      if (insertionMode === 'inHtml' || insertionMode === 'afterHtml') {
        addText(text);
      } else if (insertionMode === 'beforeHtml') {
        let startInk = 0;

        while (startInk < text.length) {
          const code = text.charCodeAt(startInk);
          if (!isWhitespace(code)) break;
          startInk += 1;
        }

        if (startInk < text.length) {
          forceRoot();
          addText(text.slice(startInk));
          insertionMode = 'inHtml';
        }
      }
    }
  });

  parser.write(str);
  parser.end();

  return rootElement || new HTMLElement('root', 'html');
}

export * from './api.js';

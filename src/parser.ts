// The implementation of an element tree here holds information about CSS style
// too, since CSS inheritance is based on the element tree. By only supporting
// the style attribute we avoid having to implement selectors, and priorities
// become very easy. We only need 3 priority levels for inherited declarations:
// (1) default tag style, (2) inheritable parent style, and (3) element style
//
// TODO Resig's HTML parser doesn't support HTML entities :/

import {TextNode, HTMLElement} from './node';
import {parse as StyleParser} from './css';
import {createComputedStyle, uaDeclaredStyles, DeclaredPlainStyle} from './cascade';
import {id} from './util';

/*
 * HTML Parser By John Resig (ejohn.org)
 *
 * Modified to close self-closing tags when a block element is hit. Original
 * implementation self-closed when the same tag was hit (<p><p>) and also broke
 * block elements out of inlines, but that should happen in box generation
 *
 * Original code by Erik Arvidsson, Mozilla Public License
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

function makeMap(str: string){
  var obj:{[s: string]: boolean} = {}, items = str.split(",");
  for ( var i = 0; i < items.length; i++ )
    obj[ items[i] ] = true;
  return obj;
}

// Regular Expressions for parsing tags and attributes
const startTag = /^<([-A-Za-z0-9_]+)((?:\s+\w+(?:\s*=\s*(?:(?:"[^"]*")|(?:'[^']*')|[^>\s]+))?)*)\s*(\/?)>/,
  endTag = /^<\/([-A-Za-z0-9_]+)[^>]*>/,
  attr = /([-A-Za-z0-9_]+)(?:\s*=\s*(?:(?:"((?:\\.|[^"])*)")|(?:'((?:\\.|[^'])*)')|([^>\s]+)))?/g;
  
// Empty Elements - HTML 4.01
const empty = makeMap("area,base,basefont,br,col,frame,hr,img,input,isindex,link,meta,param,embed");

// Block Elements - HTML 4.01
const block = makeMap("address,applet,blockquote,button,center,dd,del,dir,div,dl,dt,fieldset,form,frameset,hr,iframe,ins,isindex,li,map,menu,noframes,noscript,object,ol,p,pre,script,table,tbody,td,tfoot,th,thead,tr,ul");

// Elements that you can, intentionally, leave open
// (and which close themselves)
const closeSelf = makeMap("colgroup,dd,dt,li,options,p,td,tfoot,th,thead,tr");

// Attributes that have their values filled in disabled="disabled"
const fillAttrs = makeMap("checked,compact,declare,defer,disabled,ismap,multiple,nohref,noresize,noshade,nowrap,readonly,selected");

// Special Elements (can contain anything)
const special = makeMap("script,style");

const HTMLParser = function( html: string, handler: Handler ) {
  let index, chars, match, stack: string[] = [], last = html;

  const stacklast = function() {
    return stack[ stack.length - 1 ];
  };

  while ( html ) {
    chars = true;

    // Make sure we're not in a script or style element
    if ( !stacklast() || !special[ stacklast() ] ) {

      // Comment
      if ( html.indexOf("<!--") == 0 ) {
        index = html.indexOf("-->");

        if ( index >= 0 ) {
          if ( handler.comment )
            handler.comment( html.substring( 4, index ) );
          html = html.substring( index + 3 );
          chars = false;
        }

      // end tag
      } else if ( html.indexOf("</") == 0 ) {
        match = html.match( endTag );

        if ( match ) {
          html = html.substring( match[0].length );
          match[0].replace( endTag, parseEndTag );
          chars = false;
        }

      // start tag
      } else if ( html.indexOf("<") == 0 ) {
        match = html.match( startTag );

        if ( match ) {
          html = html.substring( match[0].length );
          match[0].replace( startTag, parseStartTag );
          chars = false;
        }
      }

      if ( chars ) {
        index = html.indexOf("<");
        
        const text = index < 0 ? html : html.substring( 0, index );
        html = index < 0 ? "" : html.substring( index );
        
        if ( handler.chars )
          handler.chars( text );
      }

    } else {
      html = html.replace(new RegExp("(.*)<\/" + stacklast() + "[^>]*>"), function(all, text){
        text = text.replace(/<!--(.*?)-->/g, "$1")
          .replace(/<!\[CDATA\[(.*?)]]>/g, "$1");

        if ( handler.chars )
          handler.chars( text );

        return "";
      });

      parseEndTag( "", stacklast() );
    }

    if ( html == last )
      throw "Parse Error: " + html;
    last = html;
  }
  
  // Clean up any remaining tags
  parseEndTag();

  function parseStartTag( tag: string, tagName: string, rest: string ):string {
    tagName = tagName.toLowerCase();

    if ( block[ tagName ] ) {
      while ( stacklast() && closeSelf[ stacklast() ] ) {
        parseEndTag( "", stacklast() );
      }
    }

    const unary = empty[ tagName ];

    if ( !unary )
      stack.push( tagName );
    
    if ( handler.start ) {
      const attrs: {name: string, value: string, escaped: string}[] = [];

      rest.replace(attr, function(match, name) {
        const value = arguments[2] ? arguments[2] :
          arguments[3] ? arguments[3] :
          arguments[4] ? arguments[4] :
          fillAttrs[name] ? name : "";
        
        attrs.push({
          name: name,
          value: value,
          escaped: value.replace(/(^|[^\\])"/g, '$1\\\"') //"
        });

        return '';
      });

      if ( handler.start )
        handler.start( tagName, attrs, unary );
    }

    return ''; // TODO
  }

  function parseEndTag( tag?: string, tagName?: string ): string {
    let pos;

    // If no tag name is provided, clean shop
    if ( !tagName )
      pos = 0;
      
    // Find the closest opened tag of the same type
    else
      for ( pos = stack.length - 1; pos >= 0; pos-- )
        if ( stack[ pos ] == tagName )
          break;
    
    if ( pos >= 0 ) {
      // Close all the open elements, up the stack
      for ( let i = stack.length - 1; i >= pos; i-- )
        if ( handler.end )
          handler.end( stack[ i ] );
      
      // Remove the open elements from the stack
      stack.length = pos;
    }

    return ''; // TODO
  }
};

export function parseNodes(rootElement: HTMLElement, str: string) {
  const stack:HTMLElement[] = [];
  let parent = rootElement;

  HTMLParser(str, {
    start(tagName, attrs: {name: string, value: string}[], unary) {
      const newId = id();
      const uaDeclaredStyle = uaDeclaredStyles[tagName] || {};
      const style = (attrs.find(a => a.name === 'style') || {}).value;
      let cascadedStyle;

      // Just ignore invalid styles so the parser can continue
      try {
        if (style) {
          const styleDeclaredStyle = StyleParser(style);
          // 2-level cascade:
          cascadedStyle = Object.assign({}, uaDeclaredStyle, styleDeclaredStyle);
        } else {
          cascadedStyle = uaDeclaredStyle;
        }
      } catch (e) {
        cascadedStyle = uaDeclaredStyle;
      }

      const computedStyle = createComputedStyle(parent.style, cascadedStyle);
      const element = new HTMLElement(newId, tagName, computedStyle);

      parent.children.push(element);

      if (!unary) {
        stack.push(parent);
        parent = element;
      }
    },
    end(tagName) {
      parent = stack.pop()!;
    },
    chars(text) {
      const newId = id();
      const computedStyle = createComputedStyle(parent.style, {});
      parent.children.push(new TextNode(newId, text, computedStyle));
    }
  });
}

type Handler = {
  start?: (tagName: string, attrs: {name: string, value: string}[], unary: boolean) => void,
  end?: (tagName: string) => void,
  chars?: (text: string) => void,
  comment?: (text: string) => void // unused
}

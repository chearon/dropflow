function hex(r, g, b, a) {
  a *= 255;

  if (
    (r >>> 4 === (r & 0xf)) &&
    (g >>> 4 === (g & 0xf)) &&
    (b >>> 4 === (b & 0xf)) &&
    (a >>> 4 === (a & 0xf))
  ) {
    r = (r >>> 4).toString(16);
    g = (g >>> 4).toString(16);
    b = (b >>> 4).toString(16);
    a = a === 255 ? '' : (a >>> 4).toString(16);
  } else {
    r = r.toString(16);
    g = g.toString(16);
    b = b.toString(16);
    a = a === 255 ? '' : a.toString(16);
    if (r.length == 1) r = '0' + r;
    if (g.length == 1) g = '0' + g;
    if (b.length == 1) b = '0' + b;
    if (a.length == 1) a = '0' + a;
  }

  return `#${r}${g}${b}${a}`;
}

export default class PaintSpy {
  constructor() {
    this.calls = [];
  }

  edge(x, y, length, side) {
    const strokeColor = this.strokeColor;
    const lineWidth = this.lineWidth;
    this.calls.push({t: 'edge', x, y, length, side, strokeColor, lineWidth});
  }

  rect(x, y, width, height) {
    const fillColor = this.fillColor;
    this.calls.push({t: 'rect', x, y, width, height, fillColor});
  }

  text(x, y, item, textStart, textEnd) {
    const fillColor = this.fillColor;
    const text = item.paragraph.sliceRenderText(item, textStart, textEnd);
    this.calls.push({t: 'text', x, y, text, fillColor});
  }

  image(x, y, width, height, image) {
    this.calls.push({t: 'image', x, y, width, height, src: image.src});
  }

  drewText(text) {
    const calls = this.calls.filter(call => call.t === 'text');
    const ret = calls.find(c => c.text === text);
    if (!ret) {
      const c = calls.slice(-10).map(c => `       "${c.text}"`).join('\n');
      throw new Error(`No call for "${text}". Last 10:\n${c}`);
    }
    return ret;
  }

  pushClip(x, y, width, height) {
    this.calls.push({t: 'pushClip', x, y, width, height});
  }

  popClip() {
    this.calls.push({t: 'popClip'});
  }

  getCalls() {
    return this.calls.map(call => {
      if (call.t === 'rect' || call.t === 'text') {
        const {r, g, b, a} = call.fillColor;
        return {...call, fillColor: hex(r, g, b, a)};
      } else if (call.t === 'edge') {
        const {r, g, b, a} = call.strokeColor;
        return {...call, strokeColor: hex(r, g, b, a)};
      } else {
        return call;
      }
    });
  }
}

export default class PaintSpy {
  constructor() {
    this.textCalls = [];
  }

  edge() {}
  rect() {}

  text(x, y, item, textStart, textEnd) {
    const fillColor = this.fillColor;
    const text = item.paragraph.slice(textStart, textEnd);
    this.textCalls.push({x, y, text, fillColor});
  }

  called(text) {
    const ret = this.textCalls.find(c => c.text === text);
    if (!ret) {
      const c = this.textCalls.slice(-10).map(c => `       "${c.text}"`).join('\n');
      throw new Error(`No call for "${text}". Last 10:\n${c}`);
    }
    return ret;
  }
}

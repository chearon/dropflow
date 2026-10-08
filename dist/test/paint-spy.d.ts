export default class PaintSpy {
    constructor(layout: any);
    calls: any[];
    layout: any;
    edge(x: any, y: any, length: any, side: any): void;
    rect(x: any, y: any, width: any, height: any): void;
    text(x: any, y: any, item: any, textStart: any, textEnd: any): void;
    image(x: any, y: any, width: any, height: any, image: any): void;
    drewText(text: any): any;
    pushClip(x: any, y: any, width: any, height: any): void;
    popClip(): void;
    getCalls(): any[];
}

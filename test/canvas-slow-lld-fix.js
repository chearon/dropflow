// TODO: remove when https://github.com/Automattic/node-canvas/issues/2476
// is done. It takes so long to load sometimes that mocha thinks the first test
// is timing out.
import {h, dom, layout, reflow, style} from 'dropflow';
import {registerFontAsset, unregisterFontAsset} from '../assets/register.ts';
const tree = dom([h('div', {style: style({fontFamily: ['Arimo']})}, [h('div', 'bug')])]);
registerFontAsset('Arimo/Arimo-Regular.ttf');
reflow(layout(tree), 100);
unregisterFontAsset('Arimo/Arimo-Regular.ttf');

import FontConfigInit from 'fontconfig';
import HarfbuzzInit from 'harfbuzzjs';
import ItemizerInit from 'itemizer';

export const [fcfg, hb, itemizer] = await Promise.all([
  FontConfigInit().then(FontConfig => new FontConfig()),
  HarfbuzzInit,
  ItemizerInit
]);

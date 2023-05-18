import HarfbuzzInit from 'harfbuzzjs';
import ItemizerInit from 'itemizer';

export const [hb, itemizer] = await Promise.all([
  HarfbuzzInit,
  ItemizerInit
]);

// The mark that goes over every listing image.
//
// For a printable, the preview images *are* the product: a 2400px picture of
// every page is enough for somebody to print from without paying. So the
// images that sell the thing have to be slightly spoiled for anyone using them
// as the thing itself.
//
// Your logo is used when you have one. When you have not, the shop name is
// used instead — that still ruins a lift, and it means protection is on by
// default rather than waiting for you to supply a file.
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import config from '../core/config.js';

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

/**
 * What buildMockups needs to draw the mark, or null when it is switched off.
 * @returns {{logo: string|null, text: string, opacity: number}|null}
 */
export function watermarkFor() {
  if (!config.watermark) return null;

  const opacity = Number(config.watermarkOpacity);
  const mark = {
    logo: null,
    text: config.shopName,
    opacity: Number.isFinite(opacity) ? opacity : 0.1,
  };

  if (config.logoPath) {
    const abs = config.logoPath.startsWith('/') ? config.logoPath : join(config.root, config.logoPath);
    const type = MIME[extname(abs).toLowerCase()];
    if (type && existsSync(abs)) {
      // Inlined rather than linked: the SVG has to survive being handed to a
      // browser, a rasteriser, or nothing at all, with no file alongside it.
      mark.logo = `data:${type};base64,${readFileSync(abs).toString('base64')}`;
    }
  }

  return mark;
}

/** Why the mark is not a logo, in words, for the dashboard to show. */
export function watermarkStatus() {
  if (!config.watermark) return { on: false, using: 'nothing', why: 'WATERMARK=off in .env' };
  if (!config.logoPath) {
    return { on: true, using: 'shop name', why: 'no SHOP_LOGO set in .env' };
  }
  const abs = config.logoPath.startsWith('/') ? config.logoPath : join(config.root, config.logoPath);
  if (!existsSync(abs)) {
    return { on: true, using: 'shop name', why: `SHOP_LOGO points at ${config.logoPath}, which is not there` };
  }
  if (!MIME[extname(abs).toLowerCase()]) {
    return { on: true, using: 'shop name', why: `${extname(abs)} is not an image format the mark can embed` };
  }
  return { on: true, using: 'your logo', why: config.logoPath };
}

export default watermarkFor;

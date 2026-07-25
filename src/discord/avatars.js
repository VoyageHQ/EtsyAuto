// Each agent's Discord avatar, drawn in code so there is nothing to license
// and nothing to download. Same little villager you see walking about the map.
import { Pixels } from '../design/png.js';

const U = 16; // one sprite unit = 16 real pixels, so 16x16 units = 256x256

const hex = (value) => {
  const h = String(value).replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};

const mix = (colour, amount) =>
  colour.map((c, i) => (i === 3 ? c : Math.max(0, Math.min(255, c + amount))));

const INK = hex('#141d18');
const SKIN = hex('#e8c9a4');
const EYE = hex('#221a14');
const LEG = hex('#3b3327');
const WHITE = hex('#f4eee0');

/** A distinguishing prop, so you can tell them apart at 32 pixels. */
const PROPS = {
  manager: (p, body) => {
    // clipboard
    p.fill(11 * U, 8 * U, 4 * U, 5 * U, WHITE);
    p.fill(11 * U, 8 * U, 4 * U, 1 * U, mix(body, -60));
    for (let i = 0; i < 3; i++) p.fill(11.6 * U, (9.6 + i) * U, 2.8 * U, 0.4 * U, mix(INK, 90));
  },
  scout: (p, body) => {
    // magnifying glass
    const cx = 12.6 * U;
    const cy = 8.4 * U;
    p.fill(cx - 2 * U, cy - 2 * U, 4 * U, 4 * U, mix(body, -70));
    p.fill(cx - 1.4 * U, cy - 1.4 * U, 2.8 * U, 2.8 * U, hex('#cfe6ea'));
    p.fill(cx + 1.4 * U, cy + 1.4 * U, 1 * U, 3 * U, mix(INK, 40));
  },
  researcher: (p, body) => {
    // telescope on a stand
    p.fill(11 * U, 6 * U, 5 * U, 1.6 * U, mix(INK, 60));
    p.fill(15 * U, 5.4 * U, 1 * U, 2.8 * U, hex('#cfe6ea'));
    p.fill(12.4 * U, 7.6 * U, 0.8 * U, 3 * U, mix(INK, 40));
  },
  maker: (p, body) => {
    // hammer
    p.fill(12 * U, 5.6 * U, 4 * U, 1.8 * U, hex('#9aa3a8'));
    p.fill(13.4 * U, 7.4 * U, 0.9 * U, 5 * U, hex('#6d5238'));
  },
  copywriter: (p, body) => {
    // quill
    p.fill(12.6 * U, 5 * U, 0.8 * U, 6 * U, WHITE);
    p.fill(11.8 * U, 5.6 * U, 2.4 * U, 2.4 * U, mix(body, 40));
    p.fill(12.4 * U, 10.6 * U, 1.2 * U, 1.2 * U, INK);
  },
  qa: (p, body) => {
    // a big tick
    p.fill(11 * U, 9 * U, 1.4 * U, 1.4 * U, hex('#8fc9a0'));
    p.fill(12 * U, 10 * U, 1.4 * U, 1.4 * U, hex('#8fc9a0'));
    p.fill(13 * U, 8.4 * U, 1.4 * U, 1.4 * U, hex('#8fc9a0'));
    p.fill(14 * U, 7 * U, 1.4 * U, 1.4 * U, hex('#8fc9a0'));
  },
  lister: (p, body) => {
    // shop awning above, parcel in hand
    for (let i = 0; i < 8; i++) {
      p.fill(i * 2 * U, 0, 1 * U, 1.6 * U, i % 2 ? WHITE : mix(body, -50));
      p.fill((i * 2 + 1) * U, 0, 1 * U, 1.6 * U, i % 2 ? mix(body, -50) : WHITE);
    }
    p.fill(11.4 * U, 9 * U, 3.4 * U, 3.4 * U, hex('#dcc9a2'));
    p.fill(12.8 * U, 9 * U, 0.7 * U, 3.4 * U, mix(INK, 80));
  },
};

/**
 * @param {{id: string, colour: string}} agent
 * @returns {Buffer} a 256x256 PNG
 */
export function avatarFor(agent) {
  const body = hex(agent.colour || '#9fd0a0');
  const bg = mix(body, -128);
  const p = new Pixels(16 * U, 16 * U, bg);

  // soft vignette so the sprite reads on both light and dark themes
  p.fill(0, 0, 16 * U, 16 * U, mix(bg, -6));
  p.fill(1 * U, 1 * U, 14 * U, 14 * U, bg);
  p.fill(0, 14.6 * U, 16 * U, 1.4 * U, mix(bg, -14));

  // hat / hair
  p.fill(4 * U, 1.4 * U, 8 * U, 2.6 * U, mix(body, -70));
  p.fill(3.4 * U, 3.6 * U, 9.2 * U, 0.8 * U, mix(body, -90));

  // face
  p.fill(4.4 * U, 4.4 * U, 7.2 * U, 4.2 * U, SKIN);
  p.fill(6 * U, 5.6 * U, 0.9 * U, 0.9 * U, EYE);
  p.fill(9 * U, 5.6 * U, 0.9 * U, 0.9 * U, EYE);
  p.fill(7.2 * U, 7.2 * U, 1.6 * U, 0.5 * U, mix(SKIN, -60));

  // body
  p.fill(3.2 * U, 8.6 * U, 9.6 * U, 5.4 * U, body);
  p.fill(3.2 * U, 12.4 * U, 9.6 * U, 1.6 * U, mix(body, -34));
  p.fill(3.2 * U, 8.6 * U, 9.6 * U, 0.6 * U, mix(body, 26));

  // legs
  p.fill(4.8 * U, 14 * U, 1.8 * U, 1.6 * U, LEG);
  p.fill(9.2 * U, 14 * U, 1.8 * U, 1.6 * U, LEG);

  // outline, drawn last so it sits on top
  const line = mix(INK, 0);
  p.fill(3.2 * U, 8.2 * U, 9.6 * U, 0.4 * U, line);
  p.fill(2.8 * U, 8.6 * U, 0.4 * U, 5.4 * U, line);
  p.fill(12.8 * U, 8.6 * U, 0.4 * U, 5.4 * U, line);
  p.fill(4 * U, 1 * U, 8 * U, 0.4 * U, line);
  p.fill(4 * U, 4.4 * U, 0.4 * U, 4.2 * U, line);
  p.fill(11.6 * U, 4.4 * U, 0.4 * U, 4.2 * U, line);

  PROPS[agent.id]?.(p, body);

  return p.toPng();
}

export const avatarDataUri = (agent) =>
  `data:image/png;base64,${avatarFor(agent).toString('base64')}`;

export default avatarFor;

/**
 * Sample product pictures for `npm run db:seed:demo`.
 *
 * These are plain, unbranded flat-lay illustrations (no logos, no crests, no text on the items) so the store can be
 * previewed with a realistic layout. They are NOT photos of real ICSI merchandise: each image says "Sample photo" in
 * the corner, and real photos replace them when products are added.
 */

export type Shape = "tee" | "polo" | "hoodie" | "sweat" | "cap" | "bottle" | "bag" | "mug";

type RGB = [number, number, number];

function parse(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(hex: string, to: RGB, amt: number): string {
  const c = parse(hex).map((v, i) => Math.round(v + (to[i] - v) * amt));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
const shade = (hex: string, a: number) => mix(hex, [0, 0, 0], a);
const tint = (hex: string, a: number) => mix(hex, [255, 255, 255], a);
const luminance = (hex: string) => {
  const [r, g, b] = parse(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

/** Mirror a path drawn for the left half of a 800-wide canvas (x -> 800 - x). Only absolute commands with x,y pairs are used. */
function mirror(d: string): string {
  let i = 0;
  return d.replace(/-?\d+(\.\d+)?/g, (m) => {
    const v = Number(m);
    const out = i % 2 === 0 ? 800 - v : v;
    i++;
    return String(out);
  });
}

interface Palette {
  base: string;
  dark: string;
  darker: string;
  light: string;
  edge: string;
  rib: string;
}

function palette(hex: string): Palette {
  const pale = luminance(hex) > 0.75;
  return {
    base: hex,
    dark: shade(hex, pale ? 0.1 : 0.2),
    darker: shade(hex, pale ? 0.2 : 0.38),
    light: tint(hex, pale ? 0.5 : 0.18),
    edge: shade(hex, pale ? 0.22 : 0.42),
    rib: shade(hex, pale ? 0.07 : 0.12),
  };
}

const DEFS = (p: Palette) => `
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f5f2"/><stop offset="1" stop-color="#e8e6e0"/></linearGradient>
  <radialGradient id="spot" cx="0.5" cy="0.45" r="0.6"><stop offset="0" stop-color="#fff" stop-opacity="0.7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <linearGradient id="cloth" x1="0" y1="0" x2="1" y2="0.35">
    <stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.16"/>
  </linearGradient>
  <linearGradient id="sides" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#000" stop-opacity="0.14"/><stop offset="0.18" stop-color="#000" stop-opacity="0"/><stop offset="0.82" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.16"/>
  </linearGradient>
  <linearGradient id="hard" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${p.dark}"/><stop offset="0.28" stop-color="${p.light}"/><stop offset="0.5" stop-color="${p.base}"/><stop offset="1" stop-color="${p.darker}"/>
  </linearGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16"/></filter>
  <filter id="soft2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
</defs>`;

/** A garment layer: the fabric colour, then the light/shade overlays and a hairline edge. */
function layer(d: string, p: Palette, fill?: string): string {
  return `<path d="${d}" fill="${fill ?? p.base}"/><path d="${d}" fill="url(#cloth)"/><path d="${d}" fill="url(#sides)"/><path d="${d}" fill="none" stroke="${p.edge}" stroke-opacity="0.55" stroke-width="2" stroke-linejoin="round"/>`;
}
const crease = (d: string, o = 0.1) =>
  `<path d="${d}" fill="none" stroke="#000" stroke-opacity="${o}" stroke-width="3" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#fff" stroke-opacity="${o * 0.9}" stroke-width="2" stroke-linecap="round" transform="translate(3 2)"/>`;
const stitch = (d: string, p: Palette) => `<path d="${d}" fill="none" stroke="${p.edge}" stroke-opacity="0.5" stroke-width="2" stroke-dasharray="7 6" stroke-linecap="round"/>`;
const floorShadow = (cx: number, cy: number, rx: number, ry: number) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" fill-opacity="0.18" filter="url(#soft)"/>`;

function tee(p: Palette): string {
  const body = "M 330 238 Q 400 306 470 238 L 586 276 L 700 408 L 632 458 L 564 392 L 564 800 Q 400 822 236 800 L 236 392 L 168 458 L 100 408 L 214 276 Z";
  return `
${floorShadow(400, 842, 270, 22)}
<path d="${body}" fill="#000" fill-opacity="0.2" filter="url(#soft)" transform="translate(0 18)"/>
${layer(body, p)}
${crease("M 236 392 Q 280 470 262 560", 0.09)}${crease("M 564 392 Q 520 470 538 560", 0.09)}
${crease("M 300 560 Q 400 590 500 556", 0.05)}
${stitch("M 240 770 Q 400 790 560 770", p)}
<path d="M 330 238 Q 400 218 470 238 Q 400 306 330 238 Z" fill="${p.darker}"/>
<path d="M 330 238 Q 400 306 470 238 L 470 252 Q 400 326 330 252 Z" fill="${p.rib}" stroke="${p.edge}" stroke-opacity="0.55" stroke-width="2"/>`;
}

function polo(p: Palette): string {
  const body = "M 322 232 L 214 276 L 100 408 L 168 458 L 236 392 L 236 800 Q 400 822 564 800 L 564 392 L 632 458 L 700 408 L 586 276 L 478 232 L 400 300 Z";
  return `
${floorShadow(400, 842, 270, 22)}
<path d="${body}" fill="#000" fill-opacity="0.2" filter="url(#soft)" transform="translate(0 18)"/>
${layer(body, p)}
${crease("M 236 392 Q 280 470 262 560", 0.09)}${crease("M 564 392 Q 520 470 538 560", 0.09)}
${stitch("M 240 770 Q 400 790 560 770", p)}
<path d="M 386 296 L 414 296 L 414 480 L 386 480 Z" fill="${p.dark}" fill-opacity="0.55" stroke="${p.edge}" stroke-opacity="0.5" stroke-width="2"/>
<circle cx="400" cy="350" r="7" fill="${p.darker}"/><circle cx="400" cy="420" r="7" fill="${p.darker}"/>
<path d="M 322 232 Q 400 262 478 232 L 478 246 Q 400 280 322 246 Z" fill="${p.rib}" stroke="${p.edge}" stroke-opacity="0.45" stroke-width="2"/>
<path d="M 316 224 L 392 292 L 366 336 L 286 268 Z" fill="${p.light}" stroke="${p.edge}" stroke-opacity="0.6" stroke-width="2" stroke-linejoin="round"/>
<path d="M 484 224 L 408 292 L 434 336 L 514 268 Z" fill="${p.light}" stroke="${p.edge}" stroke-opacity="0.6" stroke-width="2" stroke-linejoin="round"/>
<path d="M 316 224 L 392 292 L 366 336 L 286 268 Z M 484 224 L 408 292 L 434 336 L 514 268 Z" fill="url(#cloth)"/>`;
}

/** Long-sleeved sweatshirt; `hood` adds a hood, drawstrings and a pouch pocket. */
function sweatshirt(p: Palette, hood: boolean): string {
  const sleeveL = "M 292 286 L 214 318 C 150 346 124 470 112 690 L 110 790 L 202 800 L 214 580 Q 232 500 252 462 Z";
  const sleeveR = mirror(sleeveL);
  const body = "M 280 276 Q 400 332 520 276 L 566 330 L 568 800 Q 400 830 232 800 L 234 330 Z";
  const hoodShape = "M 268 300 C 232 176 318 112 400 112 C 482 112 568 176 532 300 Z";
  const cuff = "M 108 762 L 204 772 L 202 800 L 110 790 Z";
  return `
${floorShadow(400, 846, 300, 22)}
${hood ? `<path d="${hoodShape}" fill="${p.dark}"/><path d="${hoodShape}" fill="url(#sides)"/><path d="${hoodShape}" fill="none" stroke="${p.edge}" stroke-opacity="0.5" stroke-width="2"/>` : ""}
<g fill="#000" fill-opacity="0.2" filter="url(#soft)" transform="translate(0 18)"><path d="${sleeveL}"/><path d="${sleeveR}"/><path d="${body}"/></g>
${layer(sleeveL, p)}${layer(sleeveR, p)}
${layer(body, p)}
${crease("M 252 462 Q 262 540 240 620", 0.08)}${crease("M 548 462 Q 538 540 560 620", 0.08)}
${crease("M 214 580 Q 230 650 214 740", 0.07)}${crease("M 586 580 Q 570 650 586 740", 0.07)}
<path d="M 232 772 Q 400 806 568 772 L 568 800 Q 400 830 232 800 Z" fill="${p.rib}" stroke="${p.edge}" stroke-opacity="0.5" stroke-width="2"/>
<path d="${cuff}" fill="${p.rib}" stroke="${p.edge}" stroke-opacity="0.5" stroke-width="2"/>
<path d="${mirror(cuff)}" fill="${p.rib}" stroke="${p.edge}" stroke-opacity="0.5" stroke-width="2"/>
${
  hood
    ? `<path d="M 292 292 C 290 214 340 176 400 176 C 460 176 510 214 508 292 Q 400 392 292 292 Z" fill="${p.darker}" stroke="${p.edge}" stroke-opacity="0.6" stroke-width="2"/>
<path d="M 292 292 C 290 214 340 176 400 176 C 460 176 510 214 508 292 Q 400 392 292 292 Z" fill="#000" fill-opacity="0.16"/>
<path d="M 292 292 Q 400 392 508 292" fill="none" stroke="${p.light}" stroke-opacity="0.6" stroke-width="6" stroke-linecap="round"/>
<path d="M 366 352 L 362 470" stroke="#f3f1ec" stroke-width="6" stroke-linecap="round"/><path d="M 434 352 L 438 470" stroke="#f3f1ec" stroke-width="6" stroke-linecap="round"/>
<circle cx="362" cy="476" r="7" fill="#d8d4cb"/><circle cx="438" cy="476" r="7" fill="#d8d4cb"/>
<path d="M 300 560 L 500 560 L 538 706 Q 400 730 262 706 Z" fill="${p.dark}" fill-opacity="0.55" stroke="${p.edge}" stroke-opacity="0.6" stroke-width="2" stroke-linejoin="round"/>
<path d="M 300 560 L 500 560" stroke="#000" stroke-opacity="0.12" stroke-width="3"/>`
    : `<path d="M 300 288 Q 400 250 500 288 Q 400 372 300 288 Z" fill="${p.darker}"/>
<path d="M 300 288 Q 400 372 500 288 L 500 304 Q 400 396 300 304 Z" fill="${p.rib}" stroke="${p.edge}" stroke-opacity="0.55" stroke-width="2"/>`
}`;
}

function cap(p: Palette): string {
  const crown = "M 212 598 C 212 392 320 330 400 330 C 480 330 588 392 588 598 Z";
  const brim = "M 168 596 Q 400 552 632 596 Q 700 676 400 724 Q 100 676 168 596 Z";
  return `
${floorShadow(400, 740, 262, 26)}
<path d="${brim}" fill="#000" fill-opacity="0.2" filter="url(#soft2)" transform="translate(0 14)"/>
${layer(brim, p, p.dark)}
<path d="M 196 612 Q 400 582 604 612 Q 660 660 400 702 Q 140 660 196 612 Z" fill="#fff" fill-opacity="0.06"/>
<path d="M 214 626 Q 400 600 586 626 M 240 650 Q 400 628 560 650 M 280 674 Q 400 658 520 674" fill="none" stroke="${p.edge}" stroke-opacity="0.4" stroke-width="2"/>
${layer(crown, p)}
<path d="${crown}" fill="url(#hard)" fill-opacity="0.12"/>
<path d="M 400 334 C 392 420 350 520 300 600 M 400 334 C 408 420 450 520 500 600 M 400 334 C 360 400 270 480 228 570 M 400 334 C 440 400 530 480 572 570" fill="none" stroke="#000" stroke-opacity="0.16" stroke-width="2.5"/>
<path d="M 214 596 Q 400 624 586 596" fill="none" stroke="${p.edge}" stroke-opacity="0.55" stroke-width="3"/>
<circle cx="400" cy="336" r="14" fill="${p.dark}" stroke="${p.edge}" stroke-opacity="0.55" stroke-width="2"/>
<circle cx="322" cy="444" r="5" fill="${p.darker}" fill-opacity="0.8"/><circle cx="478" cy="444" r="5" fill="${p.darker}" fill-opacity="0.8"/>`;
}

function bottle(p: Palette): string {
  const body = "M 362 262 L 438 262 L 442 306 C 498 332 504 372 504 408 L 504 820 Q 504 856 468 856 L 332 856 Q 296 856 296 820 L 296 408 C 296 372 302 332 358 306 Z";
  return `
${floorShadow(404, 862, 150, 18)}
<path d="${body}" fill="#000" fill-opacity="0.18" filter="url(#soft2)" transform="translate(14 10)"/>
<path d="${body}" fill="url(#hard)"/>
<path d="${body}" fill="none" stroke="${p.edge}" stroke-opacity="0.5" stroke-width="2"/>
<path d="M 320 420 L 320 820" stroke="#fff" stroke-opacity="0.35" stroke-width="14" stroke-linecap="round"/>
<path d="M 478 430 L 478 800" stroke="#000" stroke-opacity="0.1" stroke-width="10" stroke-linecap="round"/>
<rect x="344" y="190" width="112" height="82" rx="14" fill="${p.darker}"/>
<rect x="344" y="190" width="112" height="82" rx="14" fill="url(#sides)"/>
<path d="M 356 214 L 444 214 M 356 234 L 444 234 M 356 254 L 444 254" stroke="#000" stroke-opacity="0.16" stroke-width="3"/>
<path d="M 296 560 L 504 560" stroke="#fff" stroke-opacity="0.18" stroke-width="3"/>`;
}

function bag(p: Palette): string {
  const body = "M 226 392 L 574 392 L 590 826 Q 400 846 210 826 Z";
  return `
${floorShadow(400, 842, 250, 20)}
<path d="M 300 404 C 296 180 504 180 500 404" fill="none" stroke="#000" stroke-opacity="0.16" stroke-width="30" stroke-linecap="round" filter="url(#soft2)" transform="translate(8 14)"/>
<path d="M 300 404 C 296 180 504 180 500 404" fill="none" stroke="${p.dark}" stroke-width="28" stroke-linecap="round"/>
<path d="M 300 404 C 296 180 504 180 500 404" fill="none" stroke="${p.light}" stroke-opacity="0.45" stroke-width="8" stroke-linecap="round" transform="translate(-4 -2)"/>
<path d="${body}" fill="#000" fill-opacity="0.2" filter="url(#soft2)" transform="translate(10 14)"/>
${layer(body, p)}
<path d="M 226 392 L 574 392 L 576 430 L 224 430 Z" fill="#000" fill-opacity="0.07"/>
${stitch("M 230 424 L 570 424", p)}
${crease("M 318 470 Q 330 640 308 790", 0.07)}${crease("M 484 470 Q 474 640 498 800", 0.06)}
${stitch("M 214 800 Q 400 820 586 800", p)}`;
}

function mug(p: Palette): string {
  const body = "M 262 330 L 538 330 L 526 760 Q 400 800 274 760 Z";
  return `
${floorShadow(400, 790, 220, 18)}
<path d="M 534 420 C 650 410 650 650 522 662" fill="none" stroke="#000" stroke-opacity="0.18" stroke-width="40" stroke-linecap="round" filter="url(#soft2)" transform="translate(8 12)"/>
<path d="M 534 420 C 650 410 650 650 522 662" fill="none" stroke="${p.dark}" stroke-width="36" stroke-linecap="round"/>
<path d="M 534 420 C 650 410 650 650 522 662" fill="none" stroke="${p.light}" stroke-opacity="0.35" stroke-width="10" stroke-linecap="round"/>
<path d="${body}" fill="#000" fill-opacity="0.18" filter="url(#soft2)" transform="translate(12 12)"/>
<path d="${body}" fill="url(#hard)"/>
<path d="${body}" fill="none" stroke="${p.edge}" stroke-opacity="0.5" stroke-width="2"/>
<ellipse cx="400" cy="330" rx="138" ry="24" fill="${p.darker}"/>
<ellipse cx="400" cy="330" rx="138" ry="24" fill="none" stroke="${p.edge}" stroke-opacity="0.5" stroke-width="2"/>
<ellipse cx="400" cy="334" rx="120" ry="17" fill="#000" fill-opacity="0.35"/>
<path d="M 296 380 L 306 700" stroke="#fff" stroke-opacity="0.32" stroke-width="12" stroke-linecap="round"/>`;
}

/** One complete sample picture (800 x 1000 px) for a product in a given colour. */
export function productSvg(shape: Shape, colourName: string, hex: string): Buffer {
  const p = palette(hex);
  const art =
    shape === "tee" ? tee(p) : shape === "polo" ? polo(p) : shape === "hoodie" ? sweatshirt(p, true) : shape === "sweat" ? sweatshirt(p, false) : shape === "cap" ? cap(p) : shape === "bottle" ? bottle(p) : shape === "mug" ? mug(p) : bag(p);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
${DEFS(p)}
<rect width="800" height="1000" fill="url(#bg)"/>
<rect width="800" height="1000" fill="url(#spot)"/>
${art}
<text x="44" y="954" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#000" fill-opacity="0.5">Sample photo · ${colourName}</text>
</svg>`,
  );
}

// Decides which Hot Wheels line a product belongs to: mainline | silver | premium | amazon | other.
// MRP alone is not enough: the ₹549 bucket also holds monster trucks and Track Fleet, and the ₹299 bucket
// holds balls and track sets. So we rule out non-cars first, trust explicit line names next, then fall back to MRP.

// Things that are not a single 1:64 car, whatever their MRP.
const NOT_A_CAR = new RegExp([
  'track\\s*sets?', 'play\\s*sets?', 'playsets?', 'stunt tracks?', 'track builder', 'garage', 'launchers?',
  'gift\\s*(packs?|sets?)', '\\d\\s*[- ]?packs?\\b', 'packs? of [2-9]', 'set of \\d', 'multi\\s*packs?', 'bundle',
  'carry cases?', 'display (cases?|box)', 'storage', 'collector case', 'car case', 'masks?', 'hopper balls?', 'play ball', '\\bballs?\\b',
  'remote control', 'r/c', 'readers?', 'books?', 'puzzles?', 'stickers?', 'bags?', 'backpacks?', 't-?shirts?', 'adventure set',
  '1:(18|24|43)\\b', 'large scale', 'motorcycles?', '\\bbikes?\\b', 'ramptop',
  'vehicle set', 'including \\d', 'assort(ment|ed)?\\b', '\\basst\\b', 'collection set'
].join('|'), 'i');

// Vehicles that sit in the same price bucket as Premium/Silver but are their own lines.
const OTHER_LINES = /onster|monst\s*er|neon smashers?|power smashers?|crushable|crushed car|track fleet|super rigs|toy truck|diecast truck|die-cast truck|truck with|glow.in.(the.)?dark|color shifters?|colour shifters?|Mutant|Sneakerhead/i;

const SILVER_NAME = /silver (series|celebration|edition)|vintage club|pantone/i;
const PREMIUM_NAME = /\bpremium\b|car culture|pop culture|boulevard|team transport|retro entertainment|fast\s*(&|and)\s*furious|forza|gran turismo|for adult collectors|real riders|elite 64|mario|luigi|wario|waluigi|yoshi|bowser|\bkart\b|\broad trip\b/i;
const MAINLINE_NAME = /\(\d{1,3}\s*\/\s*250\)|\b\d{1,3}\s*\/\s*250\b/;

const within = (n, lo, hi) => n >= lo && n <= hi;

export function seriesOf(p) {
  if (p.source === 'amazon') return 'amazon';
  const name = String(p.name || '');
  if (NOT_A_CAR.test(name)) return 'other';
  if (MAINLINE_NAME.test(name)) return 'mainline';
  const mrp = Number(p.mrp) || Number(p.price) || 0;
  // Name signals only count at single-car prices; the same words on a ₹1,399 transport or ₹1,999 box mean a bigger product.
  if (SILVER_NAME.test(name) && !/\bpremium\b/i.test(name) && mrp < 500) return 'silver';
  if (PREMIUM_NAME.test(name) && mrp < 1000 && !OTHER_LINES.test(name)) return 'premium';
  if (OTHER_LINES.test(name)) return 'other';
  if (within(mrp, 160, 189)) return 'mainline';
  if (within(mrp, 289, 309)) return 'silver';
  if (within(mrp, 539, 559)) return 'premium';
  return 'other';
}

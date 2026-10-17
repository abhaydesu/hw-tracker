// Decides which Hot Wheels line a product belongs to, from its name first and its MRP second.
//   series: mainline | silver | premium | other
//   kind:   car | pack | trucks | trackset | rc | large | bike | accessory   (what "other" is made of)
//
// Premium is the collector tier: Car Culture, Pop Culture, Boulevard, Team Transport, Real Riders, Elite 64,
// licensed Premium lines (F1 Race Team, Fast & Furious, Mario Kart…) and 2-packs from those lines. A big
// "Team Transport" truck-and-cars set is still Premium, so premium names are checked before the pack rules.
// MRP is only a fallback. Amazon prices are seller-set, so Amazon is classified by name alone.

// Not toys you drive on a track: stands, racks, balloons, apparel, books.
const ACCESSORY = new RegExp([
  'display (stand|rack|case|box|shelf)', '\\bstand\\b', '\\brack\\b', 'shelf', 'wall mount', 'balloons?', 'foil', 'banner', 'party', 'cake', 'topper',
  'costume', 'connectors?', 'carry cases?', 'storage', 'collector case', 'car case', 'masks?', 'readers?', 'books?', 'puzzles?',
  'stickers?', 'stories', 'treasury', 'pencil', 'hopper balls?', '\\bballs?\\b', 'bags?', 'backpacks?', 't-?shirts?', 'tees?\\b', 'water bottle', 'lunch', 'stationery', 'notebook', 'keychain', 'sipper',
  'bed ?sheet', 'wallpaper', 'poster', 'tattoo', 'slippers?', 'shoes?', 'watch'
].join('|'), 'i');

const TRACKSET = /track\s*sets?|play\s*sets?|playsets?|stunt (tracks?|set)|track builder|track creator|garage|launchers?|city\b.*\bset|adventure set|rac(e|ing) track|loop|\bramps?\b|ramptop|\bbattle\b.*\bplay|attack|\bshark\b.*\bset|dino/i;
const RC = /remote control|\br\/c\b|\brc\b|radio control/i;
const LARGE = /1\s*:\s*(18|24|32|43)\b|large scale|\b\d+\s*inch\b/i;
const BIKE = /motorcycles?|\bbikes?\b|cycle/i;
const TRUCKS = /onster|monst\s*er|neon smashers?|power smashers?|crushable|crushed car|track fleet|super rigs|mega-?wrex|glow.in.(the.)?dark|color shifters?|colour shifters?|mutant|sneakerhead|smash.?up|creatures?\b/i;

// Premium lines named outright. These beat a x/250 style number: a Car Culture 5/5 is still Premium.
const PREMIUM_STRONG = /\bpremiums?\b|car culture|pop culture|boulevard|team transport|kousoku hauler|retro entertainment|real riders|elite 64|\brlc\b|red line club|for adult collectors|collectors? edition|display sets?|replica from popular movie/i;
// Licensed and racing lines that are Premium unless they carry a mainline number (Fast & Furious "Race Off 3/5" is mainline).
const PREMIUM_LINE = /fast\s*(&|and|n)\s*furious|\bf&f\b|forza|gran turismo|race team|mario|luigi|wario|waluigi|yoshi|bowser|\bkart\b|road trip/i;
const SILVER_NAME = /silver (series|celebration|edition)|vintage club|pantone|neon speeders?/i;

const NUMBERED = /\b\d{1,3}\s*\/\s*(250|125|12|10|8|6|5)\b/;
const MAINLINE_NAME = /mainline|basic car|\bsingle\b|pack of 1(?![:\d])|1[- ]pack\b/i;

// Three or more cars, blind boxes and gift sets. Two-packs are handled on their own below.
const MULTIPACK = /\b([3-9]|[1-9]\d)\s*[- ]?(pack|pk|pcs?|cars?|piece|pieces|vehicles?)\b|\b(pack|set|lot|bundle)\s+of\s+([3-9]|[1-9]\d)\b|\b([3-9]|[1-9]\d)\s*x\b|multi\s*-?\s*packs?|gift\s*(packs?|sets?)|bundle|assort(ment|ed)?\b|\basst\b|collection set|vehicle set|including \d|\bset of ([3-9]|\d{2})\b|color\s*reveal|colour\s*reveal|surprise|blind/i;
const DUALPACK = /\b(2|two)\s*[- ]?(pack|pk|pcs?|cars?|piece|pieces|vehicles?)\b|\b(pack|set)\s+of\s+(2|two)\b|dual\s*-?\s*pack|twin\s*-?\s*pack|\b2x\b|2\s*pack/i;

const RARE_PRICE = 4000; // above this a single car is a reseller's collectible, not a retail Premium

const within = (n, lo, hi) => n >= lo && n <= hi;
const mrpOf = (p) => Number(p.mrp) || Number(p.price) || 0;
const isPremiumName = (name) => PREMIUM_STRONG.test(name) || (PREMIUM_LINE.test(name) && !NUMBERED.test(name));

export function kindOf(p) {
  const name = String(p.name || '');
  const strong = PREMIUM_STRONG.test(name);
  if (ACCESSORY.test(name)) return 'accessory';
  if (RC.test(name)) return 'rc';
  if (LARGE.test(name) && !/1\s*:\s*64/.test(name)) return 'large';
  if (BIKE.test(name) && !strong) return 'bike';
  if (TRACKSET.test(name) && !strong) return 'trackset';
  if (/team transport|kousoku hauler|display sets?/i.test(name)) return 'car';
  if ((Number(p.price) || 0) >= RARE_PRICE && !DUALPACK.test(name)) return 'rare';
  if (TRUCKS.test(name)) return 'trucks';
  if (DUALPACK.test(name) && (isPremiumName(name) || mrpOf(p) >= 450) && !/colou?r\s*reveal|surprise|blind/i.test(name)) return 'car';
  if ((MAINLINE_NAME.test(name) || /basic car/i.test(name)) && !/\b([2-9]|\d{2})\s*[- ]?pack/i.test(name)) return 'car';
  if (MULTIPACK.test(name)) return 'pack';
  if (DUALPACK.test(name) && !isPremiumName(name) && mrpOf(p) < 450) return 'pack';
  return 'car';
}

export function seriesOf(p) {
  const name = String(p.name || '');
  if (kindOf(p) !== 'car') return 'other';
  const isAmazon = p.source === 'amazon';
  const mrp = mrpOf(p);

  if (/team transport|kousoku hauler|display sets?/i.test(name)) return 'premium';
  if (DUALPACK.test(name) && isPremiumName(name)) return 'premium';
  if (NUMBERED.test(name) && !PREMIUM_STRONG.test(name) && (isAmazon || /\/\s*(250|125)\b/.test(name) || mrp < 250)) return SILVER_NAME.test(name) ? 'silver' : 'mainline';
  if (SILVER_NAME.test(name) && !/\bpremium\b/i.test(name) && (isAmazon || mrp < 500)) return 'silver';
  if (isPremiumName(name) && (isAmazon || mrp < 3000)) return 'premium';
  if (DUALPACK.test(name)) return 'premium';
  if (MAINLINE_NAME.test(name)) return 'mainline';
  if (isAmazon) return Number(p.price) < 600 ? 'mainline' : 'other';
  if (within(mrp, 160, 189)) return 'mainline';
  if (within(mrp, 289, 309)) return 'silver';
  if (within(mrp, 539, 559)) return 'premium';
  return 'other';
}

export function classify(p) {
  return { series: seriesOf(p), kind: kindOf(p) };
}

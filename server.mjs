// Blinkit Hot Wheels watcher: polls Blinkit search per location, matches watched models,
// shows results on a local dashboard, and can add in-stock items to your Blinkit cart.
import express from 'express';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.PORT || 3000;
// DATA_DIR lets a second copy (e.g. for testing) run without touching your real data
const DIR = process.env.DATA_DIR || new URL('.', import.meta.url).pathname;
const DATA = `${DIR}/data.json`;
const PROFILE = `${DIR}/.browser-profile`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const MAX_PAGES = 15;         // hard cap on result pages per search; Blinkit starts repeating after ~5
const PAGE_DELAY = 1200;      // ms between Blinkit requests; faster bursts get temporarily blocked
const MIN_INTERVAL = 30;      // seconds; be polite to Blinkit
const RECYCLE_AFTER = 200;    // restart the hidden browser after this many searches (keeps memory in check)

const defaults = { settings: { query: 'hot wheels', intervalSec: 120, autoCart: false }, locations: [], models: [] };
function loadDb() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA));
    return { ...defaults, ...d, settings: { ...defaults.settings, ...d.settings } };
  } catch { return structuredClone(defaults); }
}
const db = loadDb();
const save = () => fs.writeFileSync(DATA, JSON.stringify(db, null, 2));

const results = {};           // locationId -> {checkedAt, error, products}
let log = [];
const carted = new Map();     // `${locId}:${productId}` -> time; so auto-cart fires once per item
let lastRun = null, nextRun = null;
const note = (m) => { log.unshift(`${new Date().toLocaleTimeString()}  ${m}`); log = log.slice(0, 300); console.log(m); };

// ---- browser: one persistent profile (keeps your Blinkit login), all use serialized through a queue ----
let ctx = null, page = null, headed = false, uses = 0, queue = Promise.resolve();
function exclusive(fn) {
  const run = queue.then(() => fn());
  queue = run.catch(() => {});
  return run;
}

async function openBrowser(wantHeaded) {
  if (ctx && headed === wantHeaded && uses < RECYCLE_AFTER) return page;
  await closeBrowser();
  headed = wantHeaded; uses = 0;
  const c = ctx = await chromium.launchPersistentContext(PROFILE, { headless: !wantHeaded, userAgent: UA, viewport: { width: 1280, height: 850 } });
  c.on('close', () => { if (ctx === c) { ctx = null; page = null; } });   // user closed the visible window
  page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://blinkit.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2000);
  return page;
}
async function closeBrowser() { const c = ctx; ctx = null; page = null; await c?.close().catch(() => {}); }

// ---- search ----
function extractProducts(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  const item = node.atc_action?.add_to_cart?.cart_item;
  if (item && node.identity) {
    const inv = Number(node.inventory ?? item.inventory ?? 0);
    out.push({
      id: item.product_id, name: item.display_name || item.product_name, brand: item.brand,
      price: item.price, mrp: item.mrp, unit: item.unit, image: item.image_url,
      // product_state is 'available' or e.g. 'coming_soon' (listed with inventory, but not buyable yet)
      state: node.product_state || 'available',
      inventory: inv, inStock: (node.product_state || 'available') === 'available' && !node.is_sold_out && inv > 0,
      url: `https://blinkit.com/prn/x/prid/${item.product_id}`,
    });
    return out;
  }
  for (const v of Object.values(node)) extractProducts(v, out);
  return out;
}
const isHotWheels = (p) => /hot\s*wheels/i.test(`${p.brand} ${p.name}`);
// Loose name matching: "RX-7" = "RX7", "'96 Porsche" = "96 Porsche", "12Cilindri" = "12 Cilindri".
const norm = (s) => s.toLowerCase().replace(/['’‘`"]/g, '').replace(/(\w)-(\w)/g, '$1$2').replace(/[^a-z0-9.]+/g, ' ').trim();
const squash = (s) => norm(s).replace(/[^a-z0-9]/g, '');
// '96 and 1996 count as the same word
const sameWord = (a, b) => a === b || (/^\d{2}$/.test(a) && /^(19|20)\d{2}$/.test(b) && b.endsWith(a)) || (/^\d{2}$/.test(b) && /^(19|20)\d{2}$/.test(a) && a.endsWith(b));
export function matches(name, model) {
  const n = norm(name).split(' '), m = norm(model).split(' ').filter(Boolean);
  if (!m.length) return false;
  if (m.every(w => n.some(x => sameWord(w, x)))) return true;
  // spacing differences ("12Cilindri" vs "12 Cilindri", "RX 7" vs "RX7"): the model, squashed, must equal a run of whole words
  const want = squash(model);
  for (let i = 0; i < n.length; i++) {
    let acc = '';
    for (let j = i; j < n.length && acc.length < want.length; j++) if ((acc += n[j].replace(/[^a-z0-9]/g, '')) === want) return true;
  }
  return false;
}
const watchedBy = (p) => db.models.find(m => matches(p.name, m.text))?.text || null;

class Blocked extends Error {}
async function fetchPage(p, url, loc) {
  const r = await p.evaluate(async ({ url, lat, lon }) => {
    const res = await fetch(url, { method: 'POST', body: '{}',
      headers: { lat: String(lat), lon: String(lon), app_client: 'consumer_web', 'content-type': 'application/json' } });
    return { status: res.status, text: await res.text() };
  }, { url, lat: loc.lat, lon: loc.lon });
  if (r.status === 429 || r.status === 403 || /^\s*</.test(r.text)) throw new Blocked('Blinkit is temporarily blocking searches (too many requests)');
  if (r.status !== 200) throw new Error(`Blinkit returned HTTP ${r.status}`);
  return JSON.parse(r.text).response;
}

// Pages through one query, collecting Hot Wheels products. Blinkit pads later pages with repeated
// recommendations, so stop once two pages in a row add nothing new.
async function searchQuery(p, loc, query, found, maxPages = MAX_PAGES) {
  let url = `/v1/layout/search?q=${encodeURIComponent(query)}&search_type=type_to_search`, idle = 0;
  for (let i = 0; i < maxPages && url && idle < 2; i++) {
    if (i) await p.waitForTimeout(PAGE_DELAY);
    const res = await fetchPage(p, url, loc);
    const before = found.size;
    for (const pr of extractProducts(res).filter(isHotWheels)) if (!found.has(pr.id)) found.set(pr.id, pr);
    idle = found.size === before ? idle + 1 : 0;
    url = res?.pagination?.next_url;
  }
}

async function search(loc) {
  const p = await openBrowser(headed);
  uses++;
  const found = new Map();
  await searchQuery(p, loc, db.settings.query, found);
  // Also search each watched model by name, so a watched car can't be missed because of ranking.
  for (const m of db.models) {
    await p.waitForTimeout(PAGE_DELAY);
    await searchQuery(p, loc, `hot wheels ${m.text}`, found, 1);
  }
  return [...found.values()].map(pr => ({ ...pr, watched: watchedBy(pr) }));
}

// ---- cart ----
async function addToCart(loc, pr) {
  // Point Blinkit's web session at the watched location first, otherwise the item lands in a cart
  // for whatever location the site guessed from your IP.
  const p = await openBrowser(headed);
  await p.context().addCookies(['lat', 'lon'].map(k => ({ name: `gr_1_${k}`, value: String(loc[k]), domain: 'blinkit.com', path: '/' })));
  await p.goto('https://blinkit.com/', { waitUntil: 'domcontentloaded' });
  await p.evaluate(({ lat, lon }) => {
    try { const l = JSON.parse(localStorage.location || '{}'); l.coords = { ...(l.coords || {}), lat, lon, isDefault: false }; localStorage.location = JSON.stringify(l); } catch {}
  }, loc);
  await p.goto(pr.url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  const inCart = () => p.evaluate(id => { try { return !!JSON.parse(localStorage.cart).items[id]; } catch { return false; } }, String(pr.id));
  if (await inCart()) return note(`🛒 Already in cart: ${pr.name}`);
  await p.getByText(/^add to cart$/i).first().click({ timeout: 8000 })
    .catch(() => { throw new Error('no "Add to cart" button on the product page (out of stock at this location?)'); });
  await p.waitForTimeout(2000);
  if (!(await inCart())) throw new Error('clicked "Add to cart" but it did not appear in the cart');
  note(`🛒 Added to cart for ${loc.name}: ${pr.name} (₹${pr.price}). Open Blinkit to check out.`);
}

// ---- polling loop ----
let checking = false, backoff = 1;   // backoff multiplies the interval after Blinkit blocks us
async function checkAll() {
  if (checking) return;
  checking = true; lastRun = Date.now();
  let blocked = false;
  try {
    const done = new Set();
    let loc;
    // re-read the list each time so locations added mid-run are picked up and deleted ones skipped
    while ((loc = db.locations.find(l => !done.has(l.id)))) {
      done.add(loc.id);
      const prev = results[loc.id];
      try {
        const products = await exclusive(() => search(loc));
        if (!db.locations.some(l => l.id === loc.id)) continue;   // removed while we were searching
        // Blinkit drops sold-out items from search, so keep ones we saw before, marked as gone.
        for (const p of products) p.lastSeen = Date.now();
        for (const old of prev?.products || [])
          if (!products.some(p => p.id === old.id)) products.push({ ...old, inStock: false, state: 'gone', watched: watchedBy(old) });
        // remember when each item came into stock, so the UI can flag new arrivals
        for (const pr of products) {
          const was = prev?.products?.find(x => x.id === pr.id);
          pr.since = pr.inStock ? (was?.inStock ? was.since : prev?.products ? Date.now() : null) : null;
        }
        results[loc.id] = { checkedAt: Date.now(), products };
        const inStock = products.filter(p => p.inStock);
        if (!prev?.products) {
          note(`${loc.name}: ${inStock.length} of ${products.length} Hot Wheels items in stock`);
        } else {
          for (const pr of inStock) {
            if (!prev.products.find(x => x.id === pr.id && x.inStock))
              note(`✅ ${loc.name}: now in stock — ${pr.name} ₹${pr.price}${pr.watched ? '  ★ WATCHED' : ''}`);
          }
          for (const pr of prev.products.filter(x => x.inStock))
            if (!inStock.find(x => x.id === pr.id)) note(`❌ ${loc.name}: sold out — ${pr.name}`);
        }
        if (db.settings.autoCart) {
          for (const pr of inStock.filter(p => p.watched)) {
            const key = `${loc.id}:${pr.id}`;
            if (carted.has(key)) continue;
            carted.set(key, Date.now());
            await exclusive(() => addToCart(loc, pr))
              .catch(e => { carted.delete(key); note(`⚠️ Auto-cart failed for ${pr.name}: ${e.message}`); });
          }
        }
      } catch (e) {
        results[loc.id] = { ...prev, checkedAt: Date.now(), error: e.message };
        if (e instanceof Blocked) {
          backoff = Math.min(backoff * 2, 16);
          note(`⏸ ${e.message}. Waiting ${Math.round(Math.max(MIN_INTERVAL, db.settings.intervalSec) * backoff / 60)} min before the next check.`);
          blocked = true;
          break;
        }
        note(`⚠️ ${loc.name}: ${e.message}`);
        await exclusive(closeBrowser);   // start fresh next time
      }
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 1500));
    }
    if (!blocked) backoff = 1;
  } finally {
    checking = false;
    schedule();
  }
}

let timer;
function schedule() {
  clearTimeout(timer);
  const ms = Math.max(MIN_INTERVAL, db.settings.intervalSec) * 1000 * backoff;
  nextRun = Date.now() + ms;
  timer = setTimeout(checkAll, ms);
}

// ---- geocoding: pincode, address, "lat,lon" or a Google Maps link ----
async function resolvePlace(place) {
  place = place.trim();
  if (!place) throw new Error('Enter a pincode, address, coordinates or Google Maps link');
  const m = place.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (m) {
    const lat = +m[1], lon = +m[2];
    if (lat < 6 || lat > 37 || lon < 68 || lon > 98) throw new Error('Those coordinates are outside India');
    return { lat, lon, label: `${lat}, ${lon}` };
  }
  if (/maps\.app\.goo\.gl|goo\.gl\/maps/.test(place))
    throw new Error('Short Maps links have no coordinates in them. Open the link, then copy the coordinates instead.');
  const q = /^\d{6}$/.test(place) ? `postalcode=${place}` : `q=${encodeURIComponent(place)}`;
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&${q}`,
    { headers: { 'user-agent': 'hotwheels-watcher/1.0' } });
  if (!r.ok) throw new Error(`Address lookup failed (HTTP ${r.status})`);
  const [hit] = await r.json();
  if (!hit) throw new Error(`Couldn't find "${place}"`);
  return { lat: +(+hit.lat).toFixed(5), lon: +(+hit.lon).toFixed(5), label: hit.display_name };
}

// ---- HTTP API ----
const app = express();
app.use(express.json());
app.use(express.static(new URL('./public', import.meta.url).pathname));
const uid = () => Math.random().toString(36).slice(2, 9);
const api = (fn) => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(e => res.status(400).json({ error: e.message }));

app.get('/api/state', (_, res) => res.json({
  ...db, results, log, checking, headed, lastRun, nextRun,
  carted: [...carted.keys()],
}));
app.post('/api/settings', api((req, res) => {
  const { intervalSec, autoCart, query } = req.body;
  if (intervalSec !== undefined) {
    if (!(+intervalSec >= MIN_INTERVAL)) throw new Error(`Interval must be at least ${MIN_INTERVAL} seconds`);
    db.settings.intervalSec = Math.round(+intervalSec);
  }
  if (autoCart !== undefined) db.settings.autoCart = !!autoCart;
  if (query !== undefined && String(query).trim()) db.settings.query = String(query).trim();
  save(); if (!checking) schedule(); res.json(db.settings);
}));
app.post('/api/locations', api(async (req, res) => {
  const place = String(req.body.place || '');
  const p = await resolvePlace(place);
  const name = String(req.body.name || '').trim() || (/^\d{6}$/.test(place.trim()) ? place.trim() : p.label.split(',').slice(0, 2).join(','));
  db.locations.push({ id: uid(), name, lat: p.lat, lon: p.lon, label: p.label });
  save(); res.json(db.locations);
  checkAll();
}));
app.delete('/api/locations/:id', (req, res) => {
  db.locations = db.locations.filter(l => l.id !== req.params.id); delete results[req.params.id]; save(); res.json(db.locations);
});
app.post('/api/models', api((req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) throw new Error('Enter a model name');
  if (!db.models.some(m => m.text.toLowerCase() === text.toLowerCase())) db.models.push({ id: uid(), text });
  for (const r of Object.values(results)) for (const p of r.products || []) p.watched = watchedBy(p);
  save(); res.json(db.models);
}));
app.delete('/api/models/:id', (req, res) => {
  db.models = db.models.filter(m => m.id !== req.params.id);
  for (const r of Object.values(results)) for (const p of r.products || []) p.watched = watchedBy(p);
  save(); res.json(db.models);
});
app.post('/api/check', (_, res) => { checkAll(); res.json({ ok: true }); });
app.post('/api/cart', api(async (req, res) => {
  const loc = db.locations.find(l => l.id === req.body.locationId);
  const pr = results[req.body.locationId]?.products?.find(p => p.id === req.body.productId);
  if (!loc || !pr) throw new Error('Unknown product or location');
  await exclusive(() => addToCart(loc, pr));
  carted.set(`${loc.id}:${pr.id}`, Date.now());
  res.json({ ok: true });
}));
// A visible browser window, so you can log in / check out. "Hide" puts it back in the background.
app.post('/api/browser/show', api(async (_, res) => {
  await exclusive(async () => { const p = await openBrowser(true); await p.bringToFront(); });
  res.json({ ok: true });
}));
app.post('/api/browser/cart', api(async (_, res) => {
  await exclusive(async () => { const p = await openBrowser(true); await p.goto('https://blinkit.com/'); await p.bringToFront();
    await p.getByText(/my cart|\d+ items?/i).first().click({ timeout: 5000 }).catch(() => {}); });
  res.json({ ok: true });
}));
app.post('/api/browser/hide', api(async (_, res) => { await exclusive(() => openBrowser(false)); res.json({ ok: true }); }));

const server = app.listen(PORT, () => { console.log(`Dashboard: http://localhost:${PORT}`); checkAll(); });
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is busy — is the watcher already running?` : e); process.exit(1); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await closeBrowser(); process.exit(0); });

import express from 'express';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import blinkitSource from './sources/blinkit.mjs';
import hamleysSource from './sources/hamleys.mjs';
import firstcrySource from './sources/firstcry.mjs';
import amazonSource from './sources/amazon.mjs';
import { createShopifySource } from './sources/shopify.mjs';
import { seriesOf } from './sources/series.mjs';

const PORT = process.env.PORT || 3000;
const ROOT = dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(process.env.DATA_DIR || ROOT);
fs.mkdirSync(DIR, { recursive: true });
const DATA = path.join(DIR, 'data.json');
const PROFILE = path.join(DIR, '.browser-profile');
const UA = process.platform === 'win32'
  ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const allSources = [
  blinkitSource,
  hamleysSource,
  firstcrySource,
  amazonSource,
  createShopifySource({ id: 'funcorp', name: 'FunCorp', emoji: '🔵', baseUrl: 'https://www.funcorp.in', collection: 'hot-wheels', defaultInterval: 3600 }),
  createShopifySource({ id: 'crossword', name: 'Crossword', emoji: '📗', baseUrl: 'https://www.crossword.in', collection: 'hotwheels', defaultInterval: 3600 })
];

const defaults = { 
  settings: { query: 'hot wheels', autoCart: false }, 
  sources: {},
  locations: [], 
  models: [] 
};

for (const s of allSources) {
  defaults.sources[s.id] = { enabled: true, intervalSec: s.defaultInterval };
}

function loadDb() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA));
    if (d.settings?.intervalSec && !d.sources?.blinkit) {
      d.sources = d.sources || {};
      d.sources.blinkit = { enabled: true, intervalSec: d.settings.intervalSec };
    }
    const mergedSources = { ...defaults.sources };
    if (d.sources) {
      for (const [k, v] of Object.entries(d.sources)) {
        mergedSources[k] = { ...mergedSources[k], ...v };
      }
    }
    return { ...defaults, ...d, settings: { ...defaults.settings, ...d.settings }, sources: mergedSources };
  } catch { return structuredClone(defaults); }
}

const db = loadDb();
const save = () => fs.writeFileSync(DATA, JSON.stringify(db, null, 2));

const results = {}; // locationId or sourceId -> {checkedAt, error, products}
let log = [];
const carted = new Map();
const brief = (e) => String(e?.message || e).split('\n').map(s => s.trim()).filter(s => s && !/^[\u2550\u2551\u2554\u2557\u255a\u255d\u2560\u2563\u2566\u2569\u256c]/.test(s)).slice(0, 2).join(' ').slice(0, 220);
const note = (m) => { log.unshift(`${new Date().toLocaleTimeString()}  ${m}`); log = log.slice(0, 300); console.log(m); };

const sState = {};
for (const s of allSources) {
  sState[s.id] = { checking: false, lastRun: null, nextRun: null, backoff: 1, timer: null };
}

let ctx = null, page = null, headed = false, uses = 0, queue = Promise.resolve();
function exclusive(fn) {
  const run = queue.then(() => fn());
  queue = run.catch(() => {});
  return run;
}
async function openBrowser(wantHeaded = false) {
  if (ctx && headed === wantHeaded && uses < 200) return page;
  await closeBrowser();
  headed = wantHeaded; uses = 0;
  const c = ctx = await chromium.launchPersistentContext(PROFILE, { headless: !wantHeaded, userAgent: UA, viewport: { width: 1280, height: 850 } });
  c.on('close', () => { if (ctx === c) { ctx = null; page = null; } });
  page = ctx.pages()[0] || await ctx.newPage();
  return page;
}
async function closeBrowser() { const c = ctx; ctx = null; page = null; await c?.close().catch(() => {}); }

const norm = (s) => s.toLowerCase().replace(/['’‘`"]/g, '').replace(/(\w)-(\w)/g, '$1$2').replace(/[^a-z0-9.]+/g, ' ').trim();
const squash = (s) => norm(s).replace(/[^a-z0-9]/g, '');
const sameWord = (a, b) => a === b || (/^\d{2}$/.test(a) && /^(19|20)\d{2}$/.test(b) && b.endsWith(a)) || (/^\d{2}$/.test(b) && /^(19|20)\d{2}$/.test(a) && a.endsWith(b));
export function matches(name, model) {
  const n = norm(name).split(' '), m = norm(model).split(' ').filter(Boolean);
  if (!m.length) return false;
  if (m.every(w => n.some(x => sameWord(w, x)))) return true;
  const want = squash(model);
  for (let i = 0; i < n.length; i++) {
    let acc = '';
    for (let j = i; j < n.length && acc.length < want.length; j++) if ((acc += n[j].replace(/[^a-z0-9]/g, '')) === want) return true;
  }
  return false;
}
const watchedBy = (p) => db.models.find(m => matches(p.name, m.text))?.text || null;

async function addToCart(loc, pr) {
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

async function processProducts(runId, locName, products, prev, stateObj) {
  for (const p of products) {
    p.watched = watchedBy(p);
    p.lastSeen = Date.now();
  }
  for (const old of prev?.products || []) {
    if (!products.some(p => p.id === old.id)) products.push({ ...old, inStock: false, state: 'gone', watched: watchedBy(old) });
  }
  for (const p of products) p.series = seriesOf(p);
  for (const pr of products) {
    const was = prev?.products?.find(x => x.id === pr.id);
    pr.since = pr.inStock ? (was?.inStock ? was.since : prev?.products ? Date.now() : null) : null;
  }
  results[runId] = { checkedAt: Date.now(), products, error: null };
  const inStock = products.filter(p => p.inStock);
  
  if (!prev?.products) {
    note(`${locName}: ${inStock.length} of ${products.length} Hot Wheels items in stock`);
  } else {
    for (const pr of inStock) {
      if (!prev.products.find(x => x.id === pr.id && x.inStock))
        note(`✅ ${locName}: now in stock — ${pr.name} ₹${pr.price}${pr.watched ? '  ★ WATCHED' : ''}`);
    }
    for (const pr of prev.products.filter(x => x.inStock))
      if (!inStock.find(x => x.id === pr.id)) note(`❌ ${locName}: sold out — ${pr.name}`);
  }
}

async function checkSource(src) {
  const st = sState[src.id];
  if (st.checking || !db.sources[src.id].enabled) return;
  st.checking = true; st.lastRun = Date.now();
  
  let blocked = false;
  try {
    if (src.id === 'blinkit') {
      const done = new Set();
      let loc;
      while ((loc = db.locations.find(l => !done.has(l.id)))) {
        done.add(loc.id);
        const prev = results[loc.id];
        try {
          uses++;
          const products = await exclusive(() => src.check({ db, openBrowser, note, loc }));
          if (!db.locations.some(l => l.id === loc.id)) continue;
          await processProducts(loc.id, loc.name, products, prev, st);
          
          if (db.settings.autoCart) {
            for (const pr of products.filter(p => p.inStock && p.watched)) {
              const key = `${loc.id}:${pr.id}`;
              if (carted.has(key)) continue;
              carted.set(key, Date.now());
              await exclusive(() => addToCart(loc, pr)).catch(e => { carted.delete(key); note(`⚠️ Auto-cart failed for ${pr.name}: ${brief(e)}`); });
            }
          }
        } catch (e) {
          results[loc.id] = { ...prev, checkedAt: Date.now(), error: brief(e) };
          if (e.message.includes('too many requests') || e.name === 'Blocked') {
            st.backoff = Math.min(st.backoff * 2, 16);
            note(`⏸ Blinkit blocked searches. Waiting longer.`);
            blocked = true; break;
          }
          note(`⚠️ ${loc.name}: ${brief(e)}`);
          await exclusive(closeBrowser);
        }
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 1500));
      }
    } else {
      const prev = results[src.id];
      try {
        uses++;
        const products = src.id === 'amazon' 
          ? await exclusive(() => src.check({ db, openBrowser, note }))
          : await src.check({ db, note });
        await processProducts(src.id, src.name, products, prev, st);
      } catch (e) {
        results[src.id] = { ...prev, checkedAt: Date.now(), error: brief(e) };
        note(`⚠️ ${src.name}: ${brief(e)}`);
        if (src.id === 'amazon') await exclusive(closeBrowser);
      }
    }
    if (!blocked) st.backoff = 1;
  } finally {
    st.checking = false;
    scheduleSource(src);
  }
}

function scheduleSource(src) {
  const st = sState[src.id];
  clearTimeout(st.timer);
  if (!db.sources[src.id].enabled) {
    st.nextRun = null;
    return;
  }
  const ms = Math.max(30, db.sources[src.id].intervalSec) * 1000 * st.backoff;
  st.nextRun = Date.now() + ms;
  st.timer = setTimeout(() => checkSource(src), ms);
}

function checkAll() {
  for (const src of allSources) {
    if (db.sources[src.id].enabled) checkSource(src);
  }
}
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

const app = express();
app.use(express.json());
app.use(express.static(path.join(ROOT, 'public')));
const uid = () => Math.random().toString(36).slice(2, 9);
const api = (fn) => (req, res) => Promise.resolve().then(() => fn(req, res)).catch(e => res.status(400).json({ error: e.message }));

app.get('/api/state', (_, res) => {
  const sourcesArr = allSources.map(s => ({
    ...s,
    enabled: db.sources[s.id].enabled,
    intervalSec: db.sources[s.id].intervalSec,
    checking: sState[s.id].checking,
    lastRun: sState[s.id].lastRun,
    nextRun: sState[s.id].nextRun,
    error: results[s.id]?.error || null
  }));
  res.json({
    ...db, results, log, sourcesArr, headed,
    carted: [...carted.keys()],
  });
});

app.post('/api/settings', api((req, res) => {
  const { intervalSec, autoCart, query } = req.body;
  if (intervalSec !== undefined) {
    if (!(+intervalSec >= 30)) throw new Error(`Interval must be at least 30 seconds`);
    db.sources.blinkit.intervalSec = Math.round(+intervalSec);
  }
  if (autoCart !== undefined) db.settings.autoCart = !!autoCart;
  if (query !== undefined && String(query).trim()) db.settings.query = String(query).trim();
  save(); 
  if (!sState.blinkit.checking && intervalSec !== undefined) scheduleSource(allSources.find(s=>s.id==='blinkit')); 
  res.json(db.settings);
}));

app.post('/api/sources/:id/settings', api((req, res) => {
  const { enabled, intervalSec } = req.body;
  const src = db.sources[req.params.id];
  if (!src) throw new Error("Unknown source");
  if (enabled !== undefined) src.enabled = !!enabled;
  if (intervalSec !== undefined) src.intervalSec = Math.max(30, Math.round(+intervalSec));
  save();
  const srcObj = allSources.find(s => s.id === req.params.id);
  if (!sState[srcObj.id].checking) scheduleSource(srcObj);
  res.json(src);
}));

app.post('/api/sources/:id/check', api((req, res) => {
  const srcObj = allSources.find(s => s.id === req.params.id);
  if (!srcObj) throw new Error("Unknown source");
  checkSource(srcObj);
  res.json({ ok: true });
}));

app.post('/api/locations', api(async (req, res) => {
  const place = String(req.body.place || '');
  const p = await resolvePlace(place);
  const name = String(req.body.name || '').trim() || (/^\d{6}$/.test(place.trim()) ? place.trim() : p.label.split(',').slice(0, 2).join(','));
  db.locations.push({ id: uid(), name, lat: p.lat, lon: p.lon, label: p.label });
  save(); res.json(db.locations);
  const blinkit = allSources.find(s => s.id === 'blinkit');
  if (db.sources.blinkit.enabled) checkSource(blinkit);
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
  if (!loc || !pr) throw new Error('Unknown product or location (auto-cart is only for Blinkit)');
  await exclusive(() => addToCart(loc, pr));
  carted.set(`${loc.id}:${pr.id}`, Date.now());
  res.json({ ok: true });
}));

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

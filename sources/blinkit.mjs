const PAGE_DELAY = 1200;
const MAX_PAGES = 15;

class Blocked extends Error {}

function extractProducts(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  const item = node.atc_action?.add_to_cart?.cart_item;
  if (item && node.identity) {
    const inv = Number(node.inventory ?? item.inventory ?? 0);
    out.push({
      id: String(item.product_id), name: item.display_name || item.product_name, brand: item.brand,
      price: item.price, mrp: item.mrp, unit: item.unit, image: item.image_url,
      state: node.product_state || 'available',
      inventory: inv, inStock: (node.product_state || 'available') === 'available' && !node.is_sold_out && inv > 0,
      url: `https://blinkit.com/prn/x/prid/${item.product_id}`,
      source: 'blinkit'
    });
    return out;
  }
  for (const v of Object.values(node)) extractProducts(v, out);
  return out;
}

const isHotWheels = (p) => /hot\s*wheels/i.test(`${p.brand} ${p.name}`);

async function fetchPage(p, url, loc) {
  const r = await p.evaluate(async ({ url, lat, lon }) => {
    const fullUrl = url.startsWith("http") ? url : "https://blinkit.com" + url;
    const res = await fetch(fullUrl, { method: 'POST', body: '{}',
      headers: { lat: String(lat), lon: String(lon), app_client: 'consumer_web', 'content-type': 'application/json' } });
    return { status: res.status, text: await res.text() };
  }, { url, lat: loc.lat, lon: loc.lon });
  if (r.status === 429 || r.status === 403 || /^\s*</.test(r.text)) throw new Blocked('Blinkit is temporarily blocking searches (too many requests)');
  if (r.status !== 200) throw new Error(`Blinkit returned HTTP ${r.status}`);
  return JSON.parse(r.text).response;
}

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

export default {
  id: 'blinkit',
  name: 'Blinkit',
  emoji: '🟢',
  defaultInterval: 120, // 2 mins
  async check({ db, openBrowser, note, loc }) {
    if (!loc) throw new Error("Blinkit requires a location");
    const p = await openBrowser();
    const found = new Map();
    await searchQuery(p, loc, db.settings.query || 'hot wheels', found);
    
    for (const m of db.models || []) {
      await p.waitForTimeout(PAGE_DELAY);
      await searchQuery(p, loc, `hot wheels ${m.text}`, found, 1);
    }
    return [...found.values()];
  }
};

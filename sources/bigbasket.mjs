// BigBasket's search API sits behind Akamai, which rejects the old headless shell but accepts Chromium's new
// headless mode (server.mjs launches with channel: 'chromium'). Prices are real MRPs. BigBasket's delivery
// area comes from an address session we can't set from here, so this is one default-area list, not per location.
const MAX_PAGES = 14;

export default {
  id: 'bigbasket',
  name: 'BigBasket',
  emoji: '🧺',
  defaultInterval: 1800,
  async check({ openBrowser }) {
    const p = await openBrowser(false);
    await p.goto('https://www.bigbasket.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (/access denied/i.test(await p.title())) throw new Error('BigBasket blocked the request (Access Denied). Try again later.');
    await p.waitForTimeout(2500);
    const found = new Map();
    let idle = 0;
    for (let page = 1; page <= MAX_PAGES && idle < 2; page++) {
      const res = await p.evaluate(async (pg) => {
        const r = await fetch(`/listing-svc/v2/products?type=ps&slug=hot%20wheels&page=${pg}`, { headers: { 'x-channel': 'BB-WEB' } });
        return { status: r.status, text: await r.text() };
      }, page);
      if (res.status !== 200) throw new Error(`BigBasket returned HTTP ${res.status}`);
      const info = JSON.parse(res.text).tabs?.[0]?.product_info;
      const before = found.size;
      for (const it of info?.products || []) {
        if (!/hot\s*wheels/i.test(`${it.brand?.name} ${it.desc}`)) continue;
        const d = it.pricing?.discount;
        const price = Number(d?.prim_price?.sp), mrp = Number(d?.mrp) || price;
        if (!it.id || !price || found.has(it.id)) continue;
        const inStock = it.availability?.avail_status === '001' && !it.availability?.not_for_sale;
        found.set(it.id, {
          id: String(it.id),
          name: /hot\s*wheels/i.test(it.desc) ? it.desc : `Hot Wheels ${it.desc}`,
          price, mrp: Math.max(mrp, price), inStock,
          state: inStock ? 'available' : 'gone',
          image: it.images?.[0]?.l || it.images?.[0]?.m || '',
          url: 'https://www.bigbasket.com' + it.absolute_url,
          source: 'bigbasket'
        });
      }
      idle = found.size === before ? idle + 1 : 0;
      if (page >= (info?.number_of_pages || 1)) break;
      await p.waitForTimeout(500 + Math.random() * 500);
    }
    if (!found.size) throw new Error('BigBasket returned no Hot Wheels products');
    return [...found.values()];
  }
};

// Amazon search is noisy: sponsored knock-offs, Matchbox, 1:24 models. We keep a result only when "Hot Wheels"
// (or the HW abbreviation) appears in its brand or full title, and we run extra searches aimed at the premium
// lines because the plain query buries them under mainline singles.
const QUERIES = [
  { q: 'hot wheels', pages: 5 },
  { q: 'hot wheels car culture', pages: 2 },
  { q: 'hot wheels premium', pages: 2 },
  { q: 'hot wheels team transport', pages: 1 },
  { q: 'hot wheels 2 pack premium', pages: 1 },
  { q: 'hot wheels boulevard', pages: 1 },
  { q: 'hot wheels silver series', pages: 1 },
  { q: 'hot wheels pop culture', pages: 1 },
  { q: 'hot wheels fast and furious', pages: 1 },
  { q: 'hot wheels monster trucks', pages: 1 },
  { q: 'hot wheels track set', pages: 1 }
];

const IS_HOT_WHEELS = /hot\s*-?\s*wheels|\bHW\b/i;

function scrape(p) {
  return p.evaluate(() => {
    const num = (t) => Number(String(t || '').replace(/[^0-9.]/g, ''));
    const items = [];
    const seen = new Set();
    for (const n of document.querySelectorAll('div[data-component-type="s-search-result"][data-asin]')) {
      const id = n.getAttribute('data-asin');
      if (!id || seen.has(id)) continue;
      const brand = (n.querySelector('h2')?.textContent || '').trim();
      const recipe = n.querySelector('[data-cy="title-recipe"]');
      let title = (recipe?.innerText || '').split('\n').map(s => s.trim()).filter(Boolean).join(' ');
      if (!title) title = brand;
      const name = title.toLowerCase().startsWith(brand.toLowerCase()) ? title : `${brand} ${title}`.trim();
      const urlEl = n.querySelector('a[href*="/dp/"]') || n.querySelector('h2 a');
      const priceEl = n.querySelector('.a-price:not(.a-text-price) .a-offscreen') || n.querySelector('.a-price .a-offscreen');
      if (!name || !urlEl || !priceEl) continue;
      const price = num(priceEl.textContent);
      if (!price) continue;
      const mrp = num(n.querySelector('.a-price.a-text-price .a-offscreen')?.textContent) || price;
      const href = urlEl.getAttribute('href') || '';
      seen.add(id);
      items.push({
        id, name, brand, price, mrp: mrp >= price ? mrp : price,
        inStock: !/currently unavailable|out of stock/i.test(n.innerText),
        image: n.querySelector('img.s-image')?.getAttribute('src') || '',
        url: ('https://www.amazon.in/dp/' + id),
        sponsored: /^\s*sponsored/i.test(n.innerText)
      });
    }
    const next = document.querySelector('a.s-pagination-next');
    const hasNext = !!(next && !next.classList.contains('s-pagination-disabled') && !next.getAttribute('aria-disabled'));
    return { items, hasNext };
  });
}

export default {
  id: 'amazon',
  name: 'Amazon',
  emoji: '🟠',
  atMrp: false, // marketplace sellers set their own prices, usually above MRP
  defaultInterval: 900,
  async check({ openBrowser, note }) {
    const p = await openBrowser(false);
    const found = new Map();
    let scanned = 0;
    for (const { q, pages } of QUERIES) {
      for (let page = 1; page <= pages; page++) {
        await p.goto(`https://www.amazon.in/s?k=${encodeURIComponent(q).replace(/%20/g, '+')}&page=${page}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        if (/robot check|enter the characters|captcha/i.test(await p.title())) {
          if (found.size) { note?.('Amazon showed a captcha part-way; keeping what was found'); return finish(found); }
          throw new Error('Amazon showed a captcha. Use Setup → Open cart once so the browser can load, then check Amazon again.');
        }
        try { await p.waitForSelector('[data-asin]', { timeout: 8000 }); } catch { /* empty page */ }
        const batch = await scrape(p);
        scanned += batch.items.length;
        let kept = 0;
        for (const it of batch.items) {
          if (!IS_HOT_WHEELS.test(it.name)) continue;
          kept++;
          if (!found.has(it.id)) found.set(it.id, it);
        }
        if (!batch.hasNext || !kept) break;
        await p.waitForTimeout(600 + Math.random() * 700);
      }
    }
    note?.(`Amazon: kept ${found.size} Hot Wheels listings out of ${scanned} search results`);
    return finish(found);
  }
};

function finish(found) {
  return [...found.values()].map(({ sponsored, brand, ...it }) => ({ ...it, state: it.inStock ? 'available' : 'gone', source: 'amazon' }));
}

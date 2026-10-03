const MAX_PAGES = 4;
const MAX_PRICE = 600;

export default {
  id: 'amazon',
  name: 'Amazon',
  emoji: '🟠',
  defaultInterval: 900,
  async check({ openBrowser }) {
    const p = await openBrowser(false);
    const seen = new Map();
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `https://www.amazon.in/s?k=hot+wheels&rh=${encodeURIComponent('p_36:-60000')}&page=${page}`;
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const title = await p.title();
      if (/robot check|enter the characters|captcha/i.test(title)) {
        throw new Error('Amazon showed a captcha. Use Setup → Open cart once so the browser can load, then check Amazon again.');
      }
      try { await p.waitForSelector('[data-asin]', { timeout: 8000 }); } catch { /* empty page */ }
      const batch = await p.evaluate((maxPrice) => {
        const nodes = [...document.querySelectorAll('[data-component-type="s-search-result"][data-asin], div[data-asin]')];
        const items = [];
        const seen = new Set();
        for (const n of nodes) {
          const id = n.getAttribute('data-asin');
          if (!id || seen.has(id)) continue;
          const titleEl = n.querySelector('h2 span') || n.querySelector('h2');
          const urlEl = n.querySelector('a[href*="/dp/"]') || n.querySelector('h2 a');
          const priceEl = n.querySelector('.a-price:not(.a-text-price) .a-offscreen') || n.querySelector('.a-price .a-offscreen');
          if (!titleEl || !urlEl || !priceEl) continue;
          const price = Number(priceEl.textContent.replace(/[^0-9.]/g, ''));
          if (!price || price > maxPrice) continue;
          const mrpEl = n.querySelector('.a-price.a-text-price .a-offscreen');
          const mrp = mrpEl ? Number(mrpEl.textContent.replace(/[^0-9.]/g, '')) : price;
          const imgEl = n.querySelector('img.s-image');
          const href = urlEl.getAttribute('href') || '';
          const path = href.startsWith('http') ? href : 'https://www.amazon.in' + href;
          seen.add(id);
          const inStock = !/currently unavailable|out of stock/i.test(n.innerText);
          items.push({
            id, name: titleEl.textContent.trim(), price,
            mrp: mrp >= price ? mrp : price,
            inStock,
            state: inStock ? 'available' : 'gone',
            image: imgEl ? (imgEl.getAttribute('src') || '') : '',
            url: path.split('?')[0],
            source: 'amazon'
          });
        }
        const next = document.querySelector('a.s-pagination-next');
        const hasNext = !!(next && !next.classList.contains('s-pagination-disabled') && !next.getAttribute('aria-disabled'));
        return { items, hasNext };
      }, MAX_PRICE);
      for (const it of batch.items) if (!seen.has(it.id)) seen.set(it.id, it);
      if (!batch.hasNext || !batch.items.length) break;
    }
    return [...seen.values()];
  }
};

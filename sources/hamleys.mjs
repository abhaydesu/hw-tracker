const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const API = 'https://hamleys.in/ext/search/application/api/v1.0/collections/hot-wheels/items';

function fromItem(it) {
  const price = Number(it.price?.effective?.min);
  const mrp = Number(it.price?.marked?.min) || price;
  if (!it.uid || !it.name || !price) return null;
  const inStock = it.sellable !== false;
  return {
    id: String(it.uid),
    name: it.name,
    price, mrp, inStock,
    state: inStock ? 'available' : 'gone',
    image: it.medias?.[0]?.url || '',
    url: `https://hamleys.in/product/${it.slug}`,
    source: 'hamleys'
  };
}

export default {
  id: 'hamleys',
  name: 'Hamleys',
  emoji: '🔴',
  defaultInterval: 21600,
  async check() {
    const products = [];
    const seen = new Set();
    let pageId = '*';
    for (let n = 0; n < 8; n++) {
      const res = await fetch(`${API}?page_id=${encodeURIComponent(pageId)}&page_size=12`, {
        headers: { 'user-agent': UA, accept: 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      for (const it of data.items || []) {
        const p = fromItem(it);
        if (!p || seen.has(p.id)) continue;
        seen.add(p.id);
        products.push(p);
      }
      if (!data.page?.has_next) break;
      pageId = data.page.next_id;
    }
    if (!products.length) throw new Error('Hamleys returned no products');
    return products;
  }
};

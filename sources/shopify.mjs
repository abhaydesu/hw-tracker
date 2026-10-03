const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function money(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function createShopifySource({ id, name, emoji, baseUrl, collection, defaultInterval }) {
  return {
    id, name, emoji, defaultInterval,
    async check() {
      const products = [];
      const seen = new Set();
      for (let page = 1; page <= 6; page++) {
        const res = await fetch(`${baseUrl}/collections/${collection}/products.json?limit=250&page=${page}`, {
          headers: { 'user-agent': UA, accept: 'application/json' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = (await res.json()).products || [];
        for (const p of list) {
          const key = String(p.id);
          if (seen.has(key)) continue;
          seen.add(key);
          const variants = p.variants || [];
          const live = variants.find(v => v.available) || variants[0];
          if (!live) continue;
          const price = money(live.price);
          if (!price) continue;
          products.push({
            id: key,
            name: p.title,
            price,
            mrp: money(live.compare_at_price) || price,
            inStock: variants.some(v => v.available),
            state: variants.some(v => v.available) ? 'available' : 'gone',
            image: p.images?.[0]?.src || '',
            url: `${baseUrl}/products/${p.handle}`,
            source: id
          });
        }
        if (list.length < 250) break;
      }
      if (!products.length) throw new Error(`${name} returned no products`);
      return products;
    }
  };
}

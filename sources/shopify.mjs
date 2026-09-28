export function createShopifySource({ id, name, emoji, baseUrl, defaultInterval }) {
  return {
    id,
    name,
    emoji,
    defaultInterval,
    async check({ db }) {
      const products = [];
      const seen = new Set();
      
      const queries = ['hot wheels', 'hot wheels premium', 'hot wheels 5 pack', 'hot wheels track'];
      for (const query of queries) {
        const u = `${baseUrl}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=10`;
        const res = await fetch(u, { headers: { 'user-agent': 'hw-watcher/1.0' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        for (const p of data.resources?.results?.products || []) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          
          // Must match "hot wheels"
          if (!/hot\s*wheels/i.test(p.title) && !/hot\s*wheels/i.test(p.vendor)) continue;
          
          products.push({
            id: String(p.id),
            name: p.title,
            price: Number(p.price),
            mrp: p.compare_at_price_min ? Number(p.compare_at_price_min) : Number(p.price),
            inStock: p.available,
            state: p.available ? 'available' : 'gone',
            image: p.image || p.featured_image?.url,
            url: baseUrl + p.url.split('?')[0],
            source: id
          });
        }
      }
      return products;
    }
  };
}

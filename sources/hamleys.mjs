export default {
  id: 'hamleys',
  name: 'Hamleys',
  emoji: '🔴',
  defaultInterval: 21600, // 6 hours
  async check() {
    const res = await fetch('https://www.hamleys.in/brands/hot-wheels', { headers: { 'user-agent': 'hw-watcher/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    
    const products = [];
    const match = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g);
    if (!match) return products;
    
    for (const tag of match) {
      try {
        const inner = tag.replace(/<script[^>]*>|<\/script>/g, '');
        const data = JSON.parse(inner);
        const list = Array.isArray(data) ? data : [data];
        
        for (const item of list) {
          if (item['@type'] === 'CollectionPage' && item.mainEntity?.itemListElement) {
            for (const el of item.mainEntity.itemListElement) {
              const p = el.item;
              if (p && p['@type'] === 'Product') {
                const inStock = p.offers?.availability === 'https://schema.org/InStock';
                products.push({
                  id: p.url.split('-').pop() || p.url, // Extract ID from URL slug
                  name: p.name,
                  price: Number(p.offers?.price || 0),
                  mrp: Number(p.offers?.price || 0),
                  inStock: inStock,
                  state: inStock ? 'available' : 'gone',
                  image: p.image,
                  url: p.url,
                  source: 'hamleys'
                });
              }
            }
          }
        }
      } catch (e) {
        // ignore parse errors for a single script block
      }
    }
    return products;
  }
};

export default {
  id: 'firstcry',
  name: 'FirstCry',
  emoji: '🔵',
  defaultInterval: 1800, // 30 mins
  async check() {
    const res = await fetch('https://www.firstcry.com/hotwheels/5/0/113', { headers: { 'user-agent': 'hw-watcher/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    
    const products = [];
    const blocks = html.split(/class="li_inner_block/g).slice(1);
    
    for (const block of blocks) {
      try {
        const titleMatch = block.match(/title="([^"]+)"/);
        const urlMatch = block.match(/href="([^"]+)"/);
        const imgMatch = block.match(/<img src="([^"]+)"/);
        const priceMatch = block.match(/aria-label="Sale price RS ([\d.]+)"/);
        const mrpMatch = block.match(/aria-label="Regular price RS ([\d.]+)"/);
        const outOfStockMatch = block.match(/Out Of Stock/i);
        
        if (titleMatch && urlMatch && priceMatch) {
          const price = Number(priceMatch[1]);
          const mrp = mrpMatch ? Number(mrpMatch[1]) : price;
          const url = urlMatch[1].startsWith('//') ? 'https:' + urlMatch[1] : urlMatch[1];
          const inStock = !outOfStockMatch;
          const img = imgMatch ? (imgMatch[1].startsWith('//') ? 'https:' + imgMatch[1] : imgMatch[1]) : '';
          
          const idMatch = url.match(/\/(\d+)\/product-detail/);
          if (!idMatch) continue;
          
          products.push({
            id: idMatch[1],
            name: titleMatch[1].replace(/&#039;/g, "'").replace(/&amp;/g, '&'),
            price,
            mrp,
            inStock,
            state: inStock ? 'available' : 'gone',
            image: img,
            url,
            source: 'firstcry'
          });
        }
      } catch (e) {
        // ignore parse error for single block
      }
    }
    return products;
  }
};

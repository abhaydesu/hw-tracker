export default {
  id: 'amazon',
  name: 'Amazon',
  emoji: '🟠',
  defaultInterval: 900, // 15 mins
  async check({ openBrowser, note }) {
    const p = await openBrowser(false); // Can run headless
    await p.goto('https://www.amazon.in/s?k=hot+wheels&rh=p_6%3AA14CZOWI0VEHLG', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2000);
    
    // Check if we hit a captcha
    const title = await p.title();
    if (title.includes('Robot Check')) {
      throw new Error('Amazon blocked request (Captcha)');
    }

    const items = await p.$$eval('div[data-component-type="s-search-result"]', nodes => {
      return nodes.map(n => {
        const titleEl = n.querySelector('h2 a span');
        const urlEl = n.querySelector('h2 a');
        const priceEl = n.querySelector('.a-price .a-offscreen');
        const imgEl = n.querySelector('img.s-image');
        
        if (!titleEl || !urlEl || !priceEl) return null;
        
        const priceStr = priceEl.textContent.replace(/[^0-9.]/g, '');
        const price = Number(priceStr);
        if (price > 200) return null; // Filter out scalper prices
        
        const url = 'https://www.amazon.in' + urlEl.getAttribute('href').split('?')[0];
        const asin = n.getAttribute('data-asin');
        
        return {
          id: asin,
          name: titleEl.textContent,
          price,
          mrp: price, // Typically same if it's <= 200
          inStock: true, // If it's in search results, it's typically in stock
          state: 'available',
          image: imgEl ? imgEl.getAttribute('src') : '',
          url,
          source: 'amazon'
        };
      }).filter(Boolean);
    });
    
    return items;
  }
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const PAGE = 'https://www.firstcry.com/hotwheels/5/0/113';
const API = 'https://www.firstcry.com/svcs/ProductFilter.svc/GetSubcategoryWisePagingProducts';

function slug(name) {
  return String(name).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function query(pageNo) {
  const q = new URLSearchParams({
    PageNo: String(pageNo), PageSize: '20', SortExpression: 'Popularity',
    SubCatId: '', BrandId: '113', Price: '', Age: '', Color: '', OptionalFilter: '', OutOfStock: '',
    combo: '', discount: '', searchwithincat: '', ProductidQstr: '', searchrank: '', pmonths: '',
    cgen: '', PriceQstr: '', DiscountQstr: '', sorting: '', rating: '', offer: '', CatId: '5',
    skills: '', material: '', curatedcollections: '', measurement: '', gender: '', exclude: '',
    p: '', premium: '', pcode: '', isclub: '0', deliverytype: '', authors: '', booktype: '',
    character: '', collections: '', format: '', genre: '', booklanguage: '', publication: '', skill: ''
  });
  for (let i = 1; i <= 15; i++) q.set(`Type${i}`, '');
  return q;
}

export default {
  id: 'firstcry',
  name: 'FirstCry',
  emoji: '🟣',
  defaultInterval: 1800,
  async check() {
    const products = [];
    const seen = new Set();
    for (let page = 1; page <= 25; page++) {
      const res = await fetch(`${API}?${query(page)}`, {
        headers: { 'user-agent': UA, accept: 'application/json', referer: PAGE, 'x-requested-with': 'XMLHttpRequest' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const parsed = typeof body.ProductResponse === 'string' ? JSON.parse(body.ProductResponse) : body.ProductResponse;
      const list = parsed?.Products || [];
      if (!list.length) break;
      for (const p of list) {
        const id = String(p.PId || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const mrp = Number(p.MRP);
        const price = Number(p.discprice) > 0 ? Number(p.discprice) : mrp;
        if (!mrp || !p.PNm) continue;
        const stock = Number(p.CrntStock);
        const inStock = stock > 0;
        products.push({
          id, name: p.PNm, price, mrp, inStock,
          state: inStock ? 'available' : 'gone',
          image: `https://cdn.fcglcdn.com/brainbees/images/products/438x531/${id}a.webp`,
          url: `https://www.firstcry.com/hot-wheels/${slug(p.PNm)}/${id}/product-detail`,
          source: 'firstcry'
        });
      }
      if (list.length < 20) break;
      await new Promise(r => setTimeout(r, 250));
    }
    if (!products.length) throw new Error('FirstCry returned no products');
    return products;
  }
};

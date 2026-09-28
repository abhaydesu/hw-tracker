const f = await fetch('https://www.funcorp.in/products.json?limit=250');
const j = await f.json();
console.log(j.products.filter(p => /hot\s*wheels/i.test(p.title) || /hot\s*wheels/i.test(p.vendor)).length);

const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const html = fs.readFileSync('public/index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost:3000/" });

// Mock state
dom.window.S = {
  sourcesArr: [
    { id: 'blinkit', name: 'Blinkit', enabled: true, checking: false, nextRun: Date.now()+1000 },
    { id: 'funcorp', name: 'FunCorp', enabled: true, checking: false, nextRun: Date.now()+1000 }
  ],
  locations: [{ id: 'loc1', name: 'Home' }],
  results: {
    'funcorp': { products: [{id: 1, name: 'Hot Wheels', price: 100, inStock: true, source: 'funcorp', url: ''}] },
    'loc1': { error: 'Failed' }
  },
  models: [{text: 'Bugatti'}],
  settings: { intervalSec: 120 }
};

setTimeout(() => {
  try {
    dom.window.render();
    console.log("MAIN HTML:");
    console.log(dom.window.document.getElementById('main').innerHTML.slice(0, 500));
    console.log("DRAWER HTML:");
    console.log(dom.window.document.getElementById('sourcesList').innerHTML.slice(0, 500));
  } catch (e) {
    console.error("CRASH:", e);
  }
}, 500);

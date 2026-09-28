const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

// 1. Remove the static block I added
html = html.replace(/<div style="max-width:1240px;margin:0 auto 32px;padding:0 16px;">[\s\S]*?<\/div>/, '');

// 2. Add CSS for the layout
if (!html.includes('.layout{')) {
  html = html.replace('/* drawer */', `/* layout */\n.layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;align-items:start}\n@media (max-width:900px){.layout{grid-template-columns:1fr}}\n.log-panel{position:sticky;top:76px;display:flex;flex-direction:column;height:calc(100vh - 100px);}\n/* drawer */`);
}

// 3. Update the render string
const newTemplateStart = `  main.innerHTML=\`
  <section class="stats">`;

html = html.replace(/<section class="panel">/, `<div class="layout"><section class="panel">`);

// 4. Inject the aside after the closing </section> of the main panel
// We need to find `</section>\`;` in the render block and replace it.
// Wait, the render block ends with:
// `</section>\`;`
// `  if(focusId&&$(focusId)){$(focusId).focus();if(selS!=null)try{$(focusId).setSelectionRange(selS,selS)}catch{}}`

const asideHtml = `</section>
    <aside class="panel log-panel" style="padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h4 style="margin:0;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut);">Activity</h4>
        <span class="sm mut">Live</span>
      </div>
      <pre id="mainLog" style="margin:0;flex:1;overflow:auto;font:12px/1.6 ui-monospace,Menlo,monospace;white-space:pre-wrap;background:var(--surface2);padding:12px;border-radius:8px; border:1px solid var(--line);"></pre>
    </aside>
  </div>`;

html = html.replace(/<\/section>\`;/, asideHtml + '`;');

fs.writeFileSync('public/index.html', html);

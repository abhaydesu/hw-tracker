import re

with open('public/index.html', 'r') as f:
    html = f.read()

# 1. Clean up ALL previous attempts
html = html.replace('<div class="layout">\n  <section class="panel">', '<section class="panel">')
html = html.replace('<div class="layout"><section class="panel">', '<section class="panel">')
html = re.sub(r'</section>\n\s*</div><!--/main-col-->\n\s*<aside class="panel log-panel"[\s\S]*?</aside>\n\s*</div><!--/layout-->`;\n\s*return}', '</section>`;\n    return}', html)
html = re.sub(r'</section>\n\s*</div><!--/main-col-->\n\s*<aside class="panel log-panel"[\s\S]*?</aside>\n\s*</div><!--/layout-->`;\n\s*if\(focusId', '</section>`;\n  if(focusId', html)

# Just in case, clean up previous <aside> tags that might still be lingering (from the move-log.cjs failure)
html = re.sub(r'</section>\s*<aside class="panel log-panel"[\s\S]*?</aside>\s*</div>`;\n\s*return}', '</section>`;\n    return}', html)
html = re.sub(r'</section>\s*<aside class="panel log-panel"[\s\S]*?</aside>\s*</div>`;\n\s*if\(focusId', '</section>`;\n  if(focusId', html)

# And in case there is <div class="layout"> without the inner tags
html = html.replace('main.innerHTML=`\n  <div class="layout">\n  <div class="main-col">\n  <section class="stats">', 'main.innerHTML=`\n  <section class="stats">')

# 2. Add the layout wrapper safely
html = html.replace('main.innerHTML=`\n  <section class="stats">', 'main.innerHTML=`\n  <div class="layout">\n  <div class="main-col" style="display:flex;flex-direction:column;gap:16px;">\n  <section class="stats">')

# For onboarding block:
html = html.replace('''</section>`;\n    return}''', '''</section>\n  </div><!--/main-col-->\n  <aside class="panel log-panel"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;"><h4 style="margin:0;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut);">Activity</h4><span class="sm mut">Live</span></div><pre id="mainLog" style="margin:0;flex:1;overflow:auto;font:12px/1.6 ui-monospace,Menlo,monospace;white-space:pre-wrap;background:var(--surface2);padding:12px;border-radius:8px; border:1px solid var(--line);"></pre></aside>\n  </div><!--/layout-->`;\n    return}''')

# For main block:
html = html.replace('''No Hot Wheels listed here right now.'}</div>`}\n  </section>`;\n  if(focusId&&$(focusId))''', '''No Hot Wheels listed here right now.'}</div>`}\n  </section>\n  </div><!--/main-col-->\n  <aside class="panel log-panel"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;"><h4 style="margin:0;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut);">Activity</h4><span class="sm mut">Live</span></div><pre id="mainLog" style="margin:0;flex:1;overflow:auto;font:12px/1.6 ui-monospace,Menlo,monospace;white-space:pre-wrap;background:var(--surface2);padding:12px;border-radius:8px; border:1px solid var(--line);"></pre></aside>\n  </div><!--/layout-->`;\n  if(focusId&&$(focusId))''')


with open('public/index.html', 'w') as f:
    f.write(html)
print("Applied clean layout logic.")

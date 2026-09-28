import re

with open('public/index.html', 'r') as f:
    html = f.read()

# Remove the broken static block below <main id="main"></main>
html = re.sub(
    r'<main id="main"></main>[\s\S]*?<div id="drawerWrap">',
    '<main id="main"></main>\n\n<div id="drawerWrap">',
    html
)

# Revert the incorrect injection in the onboarding block
# The onboarding block looks like this now:
# ... beat a pincode — stock depends on the nearest Blinkit store.</section>
#     <aside class="panel log-panel" style="padding:16px;">
# ...
#   </div>`;
#     return}

broken_onboarding_pattern = r'store\.</section>[\s\S]*?</div>`;\n    return}'
fixed_onboarding = r'store.</section>`;\n    return}'
html = re.sub(broken_onboarding_pattern, fixed_onboarding, html)

# Inject <div class="layout"> before <section class="panel">
# Wait, let's see if <div class="layout"> is already there
if '<div class="layout"><section class="panel">' not in html:
    html = html.replace('<section class="panel">', '<div class="layout">\n  <section class="panel">')

# Inject the aside at the end of the render string
# The end of the render string looks like:
# 'No Hot Wheels listed here right now.'}</div>`}
#   </section>`;
#   if(focusId&&$(focusId)){...}

aside_html = """  </section>
    <aside class="panel log-panel" style="padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h4 style="margin:0;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut);">Activity</h4>
        <span class="sm mut">Live</span>
      </div>
      <pre id="mainLog" style="margin:0;flex:1;overflow:auto;font:12px/1.6 ui-monospace,Menlo,monospace;white-space:pre-wrap;background:var(--surface2);padding:12px;border-radius:8px; border:1px solid var(--line);"></pre>
    </aside>
  </div>`;"""

html = html.replace("  </section>`;", aside_html)

with open('public/index.html', 'w') as f:
    f.write(html)
print("Fixed HTML.")

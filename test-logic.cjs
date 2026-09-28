const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const match = html.match(/function render\(\)\{([\s\S]*?)function setUi/);
if (match) {
  let code = match[1];
  fs.writeFileSync('extracted_render.js', code);
  console.log("Extracted render.js");
}

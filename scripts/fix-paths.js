/**
 * Post-build: fix asset paths in ple/index.html
 * Next.js export with assetPrefix='./' produces ./_next/... paths,
 * but ple/index.html is one level deep so needs ../_next/...
 */
const fs = require('fs');
const path = require('path');

const plePath = path.join(__dirname, '..', 'renderer', 'out', 'ple', 'index.html');

if (!fs.existsSync(plePath)) {
  console.error('ple/index.html not found!');
  process.exit(1);
}

let html = fs.readFileSync(plePath, 'utf-8');

// Replace ./_next/ with ../_next/ for correct resolution from ple/ subdirectory
html = html.replace(/"\.\/_next\//g, '"../_next/');
html = html.replace(/'\.\/_next\//g, "'../_next/");

fs.writeFileSync(plePath, html, 'utf-8');
console.log('Fixed asset paths in ple/index.html');

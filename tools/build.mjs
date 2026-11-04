import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// A self-contained download, with the same production engine and artwork.
// No third-party bundler, network access or dependency installation is needed.
const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const assets = {};
for (const name of ['arena', 'lieying', 'hanfeng', 'reference']) {
  const bytes = await readFile(new URL(`public/assets/${name}.png`, root));
  assets[name] = `data:image/png;base64,${bytes.toString('base64')}`;
}
let html = await read('index.html');
const css = (await read('src/style.css'))
  .replace(/background-image:url\('\.\.\/public\/assets\/reference\.png'\);/g, '')
  .replace(/url\('\.\.\/public\/assets\/([a-z]+)\.png'\)/g, (_, name) => `url(${JSON.stringify(assets[name])})`)
  + `\n.avatar,.portrait{background-image:url(${JSON.stringify(assets.reference)})}`;
// Artwork must be present before any scripts run. File-preview sandboxes often
// disable JavaScript, so injecting image CSS from the runtime breaks the preview.
// Do not put large data URLs in CSS custom properties: Chromium drops custom
// property values above its token-size limit. Normal background-image URLs do
// not have that custom-property limit. Share the portrait rule to avoid copies.
const modules = [];
for (const name of ['engine', 'rig', 'renderer', 'app']) {
  const source = (await read(`src/${name}.js`))
    .replace(/^import .* from ['"].*['"];\n/gm, '')
    .replace(/^export /gm, '')
    .replace('img.src = new URL(`../public/assets/${id}.png`, import.meta.url).href;', 'img.src = ASSET_URLS[id];');
  modules.push(source);
}
const assetSelectors = { arena: '.arena-background', lieying: '.art-lieying', hanfeng: '.art-hanfeng' };
const bootstrap = `const ASSET_URLS = Object.fromEntries(Object.entries(${JSON.stringify(assetSelectors)}).map(([name, selector]) => [name, JSON.parse(getComputedStyle(document.querySelector(selector)).backgroundImage.slice(4, -1))]));\n`;
const icon = Buffer.from(await read('public/favicon.svg')).toString('base64');
html = html.replace('href="./public/favicon.svg"', `href="data:image/svg+xml;base64,${icon}"`)
  .replace('<link rel="stylesheet" href="./src/style.css">', () => `<style>${css}</style>`)
  .replace('<script type="module" src="./src/app.js"></script>', () => `<script>(() => {\n'use strict';\n${bootstrap}${modules.join('\n')}\n})();</script>`)
  .replace('class="brand" href="./"', 'class="brand" href="#"');
if (/import\.meta|(?:href|src)="\.\/(?:src|public)\//.test(html)) throw new Error('Standalone build contains an unresolved external resource');
await mkdir(new URL('dist/', root), { recursive: true });
const target = new URL('dist/street-duel.html', root);
await writeFile(target, html);
const { version } = JSON.parse(await read('package.json'));
await writeFile(new URL(`dist/street-duel-v${version}.html`, root), html);
console.log(`Built ${fileURLToPath(target)} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB). Open this single file in a browser to play offline.`);

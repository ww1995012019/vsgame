import { cp, copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('dist/client/', root);
await mkdir(output, { recursive: true });
await copyFile(new URL('index.html', root), new URL('index.html', output));
for (const directory of ['src', 'public']) {
  await cp(new URL(directory, root), new URL(directory, output), { recursive: true });
}
console.log(`Static Site built at ${fileURLToPath(output)}. Hosting configuration: .openai/hosting.json`);

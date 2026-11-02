import { writeFile, mkdir } from 'node:fs/promises';
import { TYPES } from '../src/data/schema.ts';

async function download(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}
const repository = 'duiker101/pokemon-type-svg-icons';
const { sha } = JSON.parse(await download(`https://api.github.com/repos/${repository}/commits/HEAD`));
if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid type icon source revision.');
const symbols: string[] = [];
for (const type of TYPES) {
  const name = type.toLowerCase();
  const source = await download(`https://raw.githubusercontent.com/${repository}/${sha}/icons/${name}.svg`);
  const viewBox = /viewBox="([\d .-]+)"/.exec(source)?.[1];
  if (!viewBox || /<script|<foreignObject|\b(?:href|src)\s*=|\bon\w+\s*=/i.test(source)) throw new Error(`Invalid type icon: ${type}`);
  const paths = source.replace(/^\s*<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim()
    .replace(/fill="(?:white|#fff(?:fff)?)"/gi, 'fill="currentColor"')
    .replace(/(\d+\.\d{2})\d+/g, '$1').replace(/\s+/g, ' ');
  symbols.push(`<symbol id="type-${name}" viewBox="${viewBox}">${paths}</symbol>`);
}
const sprite = `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join('')}</svg>\n`;
await writeFile(new URL('../public/type-icons.svg', import.meta.url), sprite);
await mkdir(new URL('../public/licenses/', import.meta.url), { recursive: true });
const readme = await download(`https://raw.githubusercontent.com/${repository}/${sha}/README.md`);
await writeFile(new URL('../public/licenses/type-icons.txt', import.meta.url),
  `Type icons: https://github.com/${repository}\nSource revision: ${sha}\nOriginal design: https://dribbble.com/shots/4862612-Pokedex-iOS-app\n\nSource author usage statement and credits:\n${readme}\n`);
console.log(`Saved ${TYPES.length} local SVG type symbols (${Buffer.byteLength(sprite)} bytes).`);

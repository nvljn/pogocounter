import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const countries = { en: 'gb', de: 'de', fr: 'fr', es: 'es', 'es-MX': 'mx', it: 'it', 'pt-BR': 'br',
  ja: 'jp', ko: 'kr', 'zh-TW': 'tw', hi: 'in', id: 'id', ru: 'ru', th: 'th', tr: 'tr' };
async function download(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}
const { sha } = JSON.parse(await download('https://api.github.com/repos/lipis/flag-icons/commits/HEAD'));
if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid flag source revision.');
const flags: Record<string, string> = {};
for (const [language, country] of Object.entries(countries)) {
  const svg = await download(`https://raw.githubusercontent.com/lipis/flag-icons/${sha}/flags/4x3/${country}.svg`);
  if (!svg.startsWith('<svg') || /<script|<foreignObject|(?:href|src)\s*=\s*["'](?:https?:|\/\/)/i.test(svg)) throw new Error(`Unsafe flag SVG: ${country}`);
  // Rasterize tiny flags at 2× display size; detailed national emblems need not inflate the app bundle.
  const image = await sharp(Buffer.from(svg)).resize(32, 24).png({ palette: true, colours: 32, compressionLevel: 9 }).toBuffer();
  flags[language] = `data:image/png;base64,${image.toString('base64')}`;
}
const license = await download(`https://raw.githubusercontent.com/lipis/flag-icons/${sha}/LICENSE`);
await mkdir(new URL('../public/licenses/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/licenses/flag-icons.txt', import.meta.url), license);
await writeFile(new URL('../src/data/flags.json', import.meta.url), JSON.stringify({
  metadata: { source: 'https://github.com/lipis/flag-icons', revision: sha, license: 'MIT', updatedAt: new Date().toISOString() }, flags,
}) + '\n');
console.log(`Saved ${Object.keys(flags).length} tiny local 32×24 flags with their MIT license.`);

import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';
import dataset from '../src/data/dataset.json' with { type: 'json' };
import { validatePokemon } from '../src/data/schema.ts';
import { artworkCatalog, previewSource, goPreviewSource } from './preview-mapping.ts';

const cache = new URL('../.cache/previews/', import.meta.url);
const output = new URL('../public/previews/', import.meta.url);
const manifestPath = new URL('../public/preview-manifest.json', import.meta.url);
const size = 128;
const quality = 78;
async function download(url: string): Promise<Buffer> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) throw new Error(`${url}: HTTP ${response.status}`);
    await delay(Math.min(30_000, Math.max(1000 * 2 ** attempt, Number(response.headers.get('retry-after') ?? 0) * 1000)));
  }
  throw new Error(`Download failed: ${url}`);
}
async function json(url: string) { return JSON.parse((await download(url)).toString('utf8')); }
async function cached(name: string, url: string): Promise<Buffer> {
  const path = new URL(name, cache);
  try { return await readFile(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const bytes = await download(url);
  await writeFile(path, bytes);
  return bytes;
}
try {
  await mkdir(cache, { recursive: true });
  await mkdir(output, { recursive: true });
  const spriteRevision = (await json('https://api.github.com/repos/PokeAPI/sprites/commits/HEAD')).sha as string;
  const dataRevision = (await json('https://api.github.com/repos/PokeAPI/pokeapi/commits/HEAD')).sha as string;
  const goRevision = (await json('https://api.github.com/repos/PokeMiners/pogo_assets/commits/HEAD')).sha as string;
  if (![spriteRevision, dataRevision, goRevision].every(sha => /^[a-f0-9]{40}$/.test(sha))) throw new Error('Invalid artwork source revisions.');
  const directory = await json(`https://api.github.com/repos/PokeAPI/sprites/contents/sprites/pokemon/other?ref=${spriteRevision}`);
  const home = directory.find((entry: { name: string }) => entry.name === 'home');
  if (!home || !/^[a-f0-9]{40}$/.test(home.sha)) throw new Error('Missing HOME artwork directory.');
  const tree = JSON.parse((await cached(`tree-${home.sha}.json`, `https://api.github.com/repos/PokeAPI/sprites/git/trees/${home.sha}?recursive=1`)).toString('utf8'));
  if (tree.truncated || !Array.isArray(tree.tree)) throw new Error('Incomplete artwork file index.');
  const files = new Map<string, string>(tree.tree.filter((entry: { path: string; size?: number }) =>
    /^(female\/)?[0-9]+(?:-[a-z0-9-]+)?\.png$/.test(entry.path) && !!entry.size)
    .map((entry: { path: string; sha: string }) => [entry.path, entry.sha]));
  const catalogs = await Promise.all(['pokemon', 'pokemon_forms'].map(name => cached(`${name}-${dataRevision}.csv`,
    `https://raw.githubusercontent.com/PokeAPI/pokeapi/${dataRevision}/data/v2/csv/${name}.csv`)));
  const forms = artworkCatalog(catalogs[0]!.toString('utf8'), catalogs[1]!.toString('utf8'));
  const goTree = JSON.parse((await cached(`pogo_assets-${goRevision}.json`,
    `https://api.github.com/repos/PokeMiners/pogo_assets/git/trees/${goRevision}?recursive=1`)).toString('utf8'));
  if (goTree.truncated || !Array.isArray(goTree.tree)) throw new Error('Incomplete GO artwork file index.');
  const goFiles = new Map<string, string>(goTree.tree.filter((entry: { path: string; size?: number }) =>
    /^Images\/Pokemon\/Addressable Assets\/pm\d+(?:\.f[A-Z0-9_]+)?\.icon\.png$/.test(entry.path) && !!entry.size)
    .map((entry: { path: string; sha: string }) => [entry.path, entry.sha]));
  const pokemon = validatePokemon(dataset.pokemon);
  const available = new Set(files.keys());
  const goAvailable = new Set(goFiles.keys());
  const sources = new Map<string, string>();
  const missing: string[] = [];
  for (const entry of pokemon) {
    const source = previewSource(entry, forms, available) ?? goPreviewSource(entry, goAvailable);
    if (source) sources.set(entry.key, source); else missing.push(entry.key);
  }
  const unique = [...new Set(sources.values())];
  const generated = new Map<string, { file: string; bytes: number }>();
  let cursor = 0, finished = 0;
  console.log(`Generating ${unique.length} previews for ${sources.size} forms; ${missing.length} forms have no verified matching artwork.`);
  async function worker() {
    while (cursor < unique.length) {
      const source = unique[cursor++]!;
      const isGo = goFiles.has(source);
      const sha = (isGo ? goFiles : files).get(source)!;
      if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error(`Invalid artwork hash: ${source}`);
      let thumbnail: Buffer;
      try { thumbnail = await readFile(new URL(`${sha}-${size}-${quality}.webp`, cache)); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        const url = isGo
          ? `https://raw.githubusercontent.com/PokeMiners/pogo_assets/${goRevision}/${source}`
          : `https://raw.githubusercontent.com/PokeAPI/sprites/${spriteRevision}/sprites/pokemon/other/home/${source}`;
        const png = await cached(`${sha}.png`, url);
        thumbnail = await sharp(png, { limitInputPixels: 4096 * 4096 }).resize(size, size, {
          fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 },
        }).webp({ quality, effort: 4 }).toBuffer();
        await writeFile(new URL(`${sha}-${size}-${quality}.webp`, cache), thumbnail);
        await delay(150); // Two workers maximum; no requests while users browse the app.
      }
      const hash = createHash('sha256').update(thumbnail).digest('hex').slice(0, 20);
      const file = `${hash}.webp`;
      await writeFile(new URL(file, output), thumbnail);
      generated.set(source, { file: `previews/${file}`, bytes: thumbnail.length });
      if (++finished % 100 === 0) console.log(`Prepared ${finished}/${unique.length} thumbnails.`);
    }
  }
  // Every started worker finishes before an error is reported; valid old manifests stay intact.
  const results = await Promise.allSettled([worker(), worker()]);
  for (const result of results) if (result.status === 'rejected') throw result.reason;
  const entries = Object.fromEntries([...sources].map(([key, source]) => [key, generated.get(source)!.file]));
  const provenance = (source: string) => ({ source, provider: goFiles.has(source) ? 'go' : 'home', sourceSha: (goFiles.has(source) ? goFiles : files).get(source)! });
  const assets = Object.fromEntries([...generated].map(([source, asset]) => [asset.file, { ...provenance(source), bytes: asset.bytes }]));
  const mappings = Object.fromEntries([...sources].map(([key, source]) => [key, provenance(source)]));
  const totalBytes = Object.values(assets).reduce((total, asset) => total + asset.bytes, 0);
  const manifest = { metadata: { source: 'PokéAPI Pokémon HOME sprites; exact-form Pokémon GO icons from PokeMiners', updatedAt: new Date().toISOString(),
    spriteRevision, dataRevision, goRevision, width: size, height: size, quality, totalBytes,
    goSourceUrl: `https://github.com/PokeMiners/pogo_assets/tree/${goRevision}/Images/Pokemon/Addressable%20Assets`,
    sourceUrl: `https://github.com/PokeAPI/sprites/tree/${spriteRevision}/sprites/pokemon/other/home` }, entries, assets, missing };
  const metadata = { ...manifest, mappings };
  const temporary = new URL('../public/preview-manifest.json.tmp', import.meta.url);
  // Keep provenance out of the browser's small runtime index.
  await writeFile(new URL('../src/data/preview-metadata.json', import.meta.url), JSON.stringify(metadata) + '\n');
  await writeFile(temporary, JSON.stringify({ entries }) + '\n');
  await rename(temporary, manifestPath);
  for (const file of await readdir(output)) {
    if (/^[a-f0-9]{20}\.webp$/.test(file) && !Object.hasOwn(assets, `previews/${file}`)) await unlink(new URL(file, output));
  }
  console.log(`Saved ${Object.keys(assets).length} unique 128×128 WebP previews: ${(totalBytes / 1_000_000).toFixed(2)} MB total, ${Math.round(totalBytes / Object.keys(assets).length)} bytes average.`);
  if (missing.length) console.log(`No exact artwork available: ${missing.join(', ')}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
